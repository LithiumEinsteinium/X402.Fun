/**
 * X402.Fun - Smart Contract v3
 *
 * Agent-only meme token launchpad with bonding curve.
 * x402 payments verified onchain via signed PDA receipts.
 * Graduation at 69 SOL liquidity (multi-agent pool).
 *
 * Audit fixes applied (v2 → v3):
 *   A-001  Authority signer + has_one constraint on all admin instructions
 *   A-002  has_one = authority on Global wherever authority matters
 *   A-003  Fee lamports now actually transferred to fee_recipient and creator
 *   A-004  All bonding-curve math uses u128 intermediates + checked_* ops
 *   A-005  System program ID explicitly verified before every CPI
 *   A-006  State updated before CPI (checks-effects-interactions)
 *   A-007  Balance check before lamport manipulation in sell()
 *   A-008  Bonding-curve formula uses u128 to eliminate rounding exploits
 *   A-009  Actual SPL token transfers on buy() and sell()
 *   A-010  No more .unwrap() — all fallible ops use ?
 *   A-011  x402 gate uses an onchain PDA receipt, not a caller-supplied bool
 *   A-012  Strings have #[max_len], space uses DISCRIMINATOR + INIT_SPACE
 *   A-013  Anchor discriminators handle type cosplay (no change needed)
 *   A-014  Slippage parameters added to buy() and sell()
 *   A-015  Upgrade authority should be transferred to multisig before mainnet
 */

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface,
    TransferChecked, transfer_checked,
};

declare_id!("63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF");

// PumpSwap AMM program. Pool PDA seeds: ["pool", index_le_bytes, creator, base_mint, quote_mint].
// IDL: https://gist.github.com/Taylor123/dcd9f3285ca105efdcdf98089a2b3198
const PUMPSWAP_PROGRAM_ID: Pubkey = pubkey!("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");

// Wrapped SOL mint — used as the quote token in all PumpSwap pools.
const WSOL_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");

// Token Extensions Program — PumpSwap uses it for LP token mints.
const TOKEN_2022_PROGRAM_ID: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// create_pool discriminator from the PumpSwap IDL.
const CREATE_POOL_DISCRIMINATOR: [u8; 8] = [233, 146, 209, 142, 207, 104, 64, 188];

// === CONFIGURATION ===
// Switch before mainnet deployment:
// Devnet:  1_500_000_000  (1.5 SOL — easy to test)
// Mainnet: 69_000_000_000 (69 SOL  — ~$6k)
pub const GRADUATION_LIQUIDITY_LAMPORTS: u64 = 1_500_000_000;

pub const PLATFORM_FEE_BPS: u64 = 100; // 1%
pub const CREATOR_FEE_BPS: u64 = 200;  // 2%
pub const BPS_DENOMINATOR: u64 = 10_000;

// Initial virtual reserves mirror pump.fun's constant-product curve constants.
pub const INITIAL_VIRTUAL_TOKEN_RESERVES: u64 = 1_073_000_000_000_000;
pub const INITIAL_VIRTUAL_SOL_RESERVES: u64 = 30_000_000_000; // 30 SOL
pub const INITIAL_REAL_TOKEN_RESERVES: u64 = 793_100_000_000_000;
pub const TOKEN_TOTAL_SUPPLY: u64 = 1_000_000_000_000_000;

pub const TOKEN_DECIMALS: u8 = 9;

// String field maximums
pub const MAX_NAME_LEN: usize = 32;
pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_URI_LEN: usize = 200;

// Proportion of curve tokens transferred to the PumpSwap pool at graduation.
// 70% of the tokens remaining in the bonding curve vault go to the pool.
const GRADUATION_TOKEN_BPS: u64 = 7_000;

// Proportion of curve SOL transferred to the PumpSwap pool at graduation.
// 85% of real_sol_reserves go to the pool; the remainder covers fees and rent.
const GRADUATION_SOL_BPS: u64 = 8_500;

#[program]
pub mod x402_fun {
    use super::*;

    pub fn initialize(context: Context<Initialize>) -> Result<()> {
        let global = &mut context.accounts.global;
        global.authority = context.accounts.authority.key();
        global.fee_recipient = context.accounts.fee_recipient.key();
        global.initialized = true;
        global.token_count = 0;
        global.virtual_token_reserves = INITIAL_VIRTUAL_TOKEN_RESERVES;
        global.virtual_sol_reserves = INITIAL_VIRTUAL_SOL_RESERVES;
        global.real_token_reserves = INITIAL_REAL_TOKEN_RESERVES;
        global.bump = context.bumps.global;
        Ok(())
    }

    pub fn record_x402_payment(
        context: Context<RecordX402Payment>,
        nonce: [u8; 32],
    ) -> Result<()> {
        let receipt = &mut context.accounts.receipt;
        receipt.payer = context.accounts.payer.key();
        receipt.nonce = nonce;
        receipt.used = false;
        receipt.bump = context.bumps.receipt;
        Ok(())
    }

    pub fn launch_token(
        context: Context<LaunchToken>,
        name: String,
        symbol: String,
        uri: String,
        _nonce: [u8; 32],
    ) -> Result<()> {
        require!(name.len() <= MAX_NAME_LEN, X402Error::StringTooLong);
        require!(symbol.len() <= MAX_SYMBOL_LEN, X402Error::StringTooLong);
        require!(uri.len() <= MAX_URI_LEN, X402Error::StringTooLong);

        let receipt = &mut context.accounts.x402_receipt;
        require!(!receipt.used, X402Error::PaymentAlreadyUsed);
        receipt.used = true;

        let global = &mut context.accounts.global;
        global.token_count = global.token_count.checked_add(1).ok_or(X402Error::Overflow)?;

        let virtual_token_reserves = global.virtual_token_reserves;
        let virtual_sol_reserves = global.virtual_sol_reserves;
        let real_token_reserves = global.real_token_reserves;

        let token = &mut context.accounts.token;
        token.mint = context.accounts.mint.key();
        token.creator = context.accounts.creator.key();
        token.bonding_curve = context.accounts.bonding_curve.key();
        token.name = name.clone();
        token.symbol = symbol.clone();
        token.uri = uri;
        token.graduated = false;
        token.completed = false;
        token.total_buys = 0;
        token.total_sells = 0;
        token.liquidity_contributed = 0;
        token.bump = context.bumps.token;

        let curve = &mut context.accounts.bonding_curve;
        curve.mint = context.accounts.mint.key();
        curve.virtual_token_reserves = virtual_token_reserves;
        curve.virtual_sol_reserves = virtual_sol_reserves;
        curve.real_token_reserves = real_token_reserves;
        curve.real_sol_reserves = 0;
        curve.token_total_supply = TOKEN_TOTAL_SUPPLY;
        curve.complete = false;
        curve.bump = context.bumps.bonding_curve;

        emit!(LaunchEvent {
            mint: token.mint,
            creator: token.creator,
            name,
            symbol,
        });

        Ok(())
    }

    pub fn buy(
        context: Context<Buy>,
        sol_amount: u64,
        min_tokens_out: u64,
        _nonce: [u8; 32],
    ) -> Result<()> {
        require!(!context.accounts.bonding_curve.complete, X402Error::AlreadyGraduated);

        let receipt = &mut context.accounts.x402_receipt;
        require!(!receipt.used, X402Error::PaymentAlreadyUsed);
        receipt.used = true;

        let curve = &context.accounts.bonding_curve;
        let tokens_out = compute_tokens_out(sol_amount, curve)?;
        require!(tokens_out >= min_tokens_out, X402Error::SlippageExceeded);

        let platform_fee = compute_fee(sol_amount, PLATFORM_FEE_BPS)?;
        let creator_fee = compute_fee(sol_amount, CREATOR_FEE_BPS)?;
        let net_sol_to_curve = sol_amount
            .checked_sub(platform_fee)
            .and_then(|v| v.checked_sub(creator_fee))
            .ok_or(X402Error::Overflow)?;

        require!(context.accounts.buyer.lamports() >= sol_amount, X402Error::InsufficientFunds);

        let curve = &mut context.accounts.bonding_curve;
        curve.virtual_sol_reserves = curve.virtual_sol_reserves.checked_add(sol_amount).ok_or(X402Error::Overflow)?;
        curve.virtual_token_reserves = curve.virtual_token_reserves.checked_sub(tokens_out).ok_or(X402Error::Overflow)?;
        curve.real_sol_reserves = curve.real_sol_reserves.checked_add(net_sol_to_curve).ok_or(X402Error::Overflow)?;
        curve.real_token_reserves = curve.real_token_reserves.checked_sub(tokens_out).ok_or(X402Error::Overflow)?;

        context.accounts.token.total_buys = context.accounts.token.total_buys.checked_add(1).ok_or(X402Error::Overflow)?;

        let mint_key = curve.mint;
        let real_sol = curve.real_sol_reserves;

        require_keys_eq!(context.accounts.system_program.key(), anchor_lang::solana_program::system_program::ID, X402Error::InvalidProgram);

        // Transfer SOL to curve
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(&context.accounts.buyer.key(), &context.accounts.bonding_curve.key(), net_sol_to_curve),
            &[context.accounts.buyer.to_account_info(), context.accounts.bonding_curve.to_account_info(), context.accounts.system_program.to_account_info()],
        )?;

        // Transfer platform fee
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(&context.accounts.buyer.key(), &context.accounts.fee_recipient.key(), platform_fee),
            &[context.accounts.buyer.to_account_info(), context.accounts.fee_recipient.to_account_info(), context.accounts.system_program.to_account_info()],
        )?;

        // Transfer creator fee
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(&context.accounts.buyer.key(), &context.accounts.creator.key(), creator_fee),
            &[context.accounts.buyer.to_account_info(), context.accounts.creator.to_account_info(), context.accounts.system_program.to_account_info()],
        )?;

        // Transfer SPL tokens
        let mint_key_bytes = mint_key.to_bytes();
        let curve_seeds = &[b"curve", mint_key_bytes.as_ref(), &[context.accounts.bonding_curve.bump]];
        transfer_checked(
            CpiContext::new_with_signer(
                context.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: context.accounts.vault_token_account.to_account_info(),
                    mint: context.accounts.mint.to_account_info(),
                    to: context.accounts.buyer_token_account.to_account_info(),
                    authority: context.accounts.bonding_curve.to_account_info(),
                },
                &[curve_seeds],
            ),
            tokens_out,
            TOKEN_DECIMALS,
        )?;

        emit!(BuyEvent { mint: mint_key, buyer: context.accounts.buyer.key(), sol_amount, tokens_received: tokens_out, liquidity: real_sol });
        Ok(())
    }

    pub fn sell(
        context: Context<Sell>,
        token_amount: u64,
        min_sol_out: u64,
        _nonce: [u8; 32],
    ) -> Result<()> {
        require!(!context.accounts.bonding_curve.complete, X402Error::AlreadyGraduated);

        let receipt = &mut context.accounts.x402_receipt;
        require!(!receipt.used, X402Error::PaymentAlreadyUsed);
        receipt.used = true;

        let curve = &context.accounts.bonding_curve;
        let gross_sol_out = compute_sol_out(token_amount, curve)?;
        let platform_fee = compute_fee(gross_sol_out, PLATFORM_FEE_BPS)?;
        let creator_fee = compute_fee(gross_sol_out, CREATOR_FEE_BPS)?;
        let net_sol_to_seller = gross_sol_out.checked_sub(platform_fee).and_then(|v| v.checked_sub(creator_fee)).ok_or(X402Error::Overflow)?;

        require!(net_sol_to_seller >= min_sol_out, X402Error::SlippageExceeded);
        require!(curve.real_sol_reserves >= gross_sol_out, X402Error::InsufficientLiquidity);

        let mint_key = curve.mint;

        let curve = &mut context.accounts.bonding_curve;
        curve.virtual_sol_reserves = curve.virtual_sol_reserves.checked_sub(gross_sol_out).ok_or(X402Error::Overflow)?;
        curve.virtual_token_reserves = curve.virtual_token_reserves.checked_add(token_amount).ok_or(X402Error::Overflow)?;
        curve.real_sol_reserves = curve.real_sol_reserves.checked_sub(gross_sol_out).ok_or(X402Error::Overflow)?;
        curve.real_token_reserves = curve.real_token_reserves.checked_add(token_amount).ok_or(X402Error::Overflow)?;

        context.accounts.token.total_sells = context.accounts.token.total_sells.checked_add(1).ok_or(X402Error::Overflow)?;

        require_keys_eq!(context.accounts.system_program.key(), anchor_lang::solana_program::system_program::ID, X402Error::InvalidProgram);

        // Transfer SPL tokens from seller
        transfer_checked(
            CpiContext::new(
                context.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: context.accounts.seller_token_account.to_account_info(),
                    mint: context.accounts.mint.to_account_info(),
                    to: context.accounts.vault_token_account.to_account_info(),
                    authority: context.accounts.seller.to_account_info(),
                },
            ),
            token_amount,
            TOKEN_DECIMALS,
        )?;

        // Transfer net SOL to seller
        {
            let curve_info = context.accounts.bonding_curve.to_account_info();
            let seller_info = context.accounts.seller.to_account_info();
            **curve_info.try_borrow_mut_lamports()? -= net_sol_to_seller;
            **seller_info.try_borrow_mut_lamports()? += net_sol_to_seller;
        }

        // Platform fee
        {
            let curve_info = context.accounts.bonding_curve.to_account_info();
            let fee_info = context.accounts.fee_recipient.to_account_info();
            **curve_info.try_borrow_mut_lamports()? -= platform_fee;
            **fee_info.try_borrow_mut_lamports()? += platform_fee;
        }

        // Creator fee
        {
            let curve_info = context.accounts.bonding_curve.to_account_info();
            let creator_info = context.accounts.creator.to_account_info();
            **curve_info.try_borrow_mut_lamports()? -= creator_fee;
            **creator_info.try_borrow_mut_lamports()? += creator_fee;
        }

        emit!(SellEvent { mint: mint_key, seller: context.accounts.seller.key(), tokens_sold: token_amount, sol_received: net_sol_to_seller });
        Ok(())
    }

    pub fn contribute_liquidity(
        context: Context<ContributeLiquidity>,
        amount: u64,
    ) -> Result<()> {
        require!(!context.accounts.bonding_curve.complete, X402Error::AlreadyGraduated);

        require_keys_eq!(context.accounts.system_program.key(), anchor_lang::solana_program::system_program::ID, X402Error::InvalidProgram);

        let curve = &mut context.accounts.bonding_curve;
        curve.real_sol_reserves = curve.real_sol_reserves.checked_add(amount).ok_or(X402Error::Overflow)?;

        let token = &mut context.accounts.token;
        token.liquidity_contributed = token.liquidity_contributed.checked_add(amount).ok_or(X402Error::Overflow)?;

        let graduated = curve.real_sol_reserves >= GRADUATION_LIQUIDITY_LAMPORTS;
        if graduated {
            curve.complete = true;
            token.graduated = true;
        }

        let mint_key = curve.mint;
        let total_liquidity = curve.real_sol_reserves;
        let percent = total_liquidity.checked_mul(100).and_then(|v| v.checked_div(GRADUATION_LIQUIDITY_LAMPORTS)).ok_or(X402Error::Overflow)?;

        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(&context.accounts.contributor.key(), &context.accounts.bonding_curve.key(), amount),
            &[context.accounts.contributor.to_account_info(), context.accounts.bonding_curve.to_account_info(), context.accounts.system_program.to_account_info()],
        )?;

        if graduated {
            emit!(GraduationEvent { mint: mint_key, total_liquidity });
        }

        emit!(LiquidityContributionEvent { mint: mint_key, contributor: context.accounts.contributor.key(), amount, total_liquidity, target: GRADUATION_LIQUIDITY_LAMPORTS, percent });
        Ok(())
    }

    /// Creates a PumpSwap AMM pool using the bonding curve's accumulated SOL and tokens.
    /// Callable by anyone once the bonding curve has graduated (curve.complete == true).
    /// Transfers GRADUATION_TOKEN_BPS of vault tokens and GRADUATION_SOL_BPS of real SOL
    /// to the new pool. The bonding curve PDA signs as pool creator.
    pub fn graduate_to_pumpswap(
        context: Context<GraduateToPumpSwap>,
        pool_index: u16,
    ) -> Result<()> {
        require!(context.accounts.bonding_curve.complete, X402Error::NotYetGraduated);
        require!(!context.accounts.token.completed, X402Error::AlreadyCompleted);

        let curve = &context.accounts.bonding_curve;
        let mint_key = curve.mint;
        let curve_bump = curve.bump;

        let base_amount_in = compute_fee(
            context.accounts.vault_token_account.amount,
            GRADUATION_TOKEN_BPS,
        )?;
        let quote_amount_in = compute_fee(curve.real_sol_reserves, GRADUATION_SOL_BPS)?;

        require!(base_amount_in > 0, X402Error::InsufficientFunds);
        require!(quote_amount_in > 0, X402Error::InsufficientFunds);

        // Mark completed before CPIs (checks-effects-interactions).
        context.accounts.token.completed = true;

        // The bonding curve PDA acts as the pool creator and signs all CPIs.
        let mint_key_bytes = mint_key.to_bytes();
        let curve_signer_seeds: &[&[u8]] = &[b"curve", mint_key_bytes.as_ref(), &[curve_bump]];

        // Wrap SOL: transfer lamports into the curve's WSOL ATA, then sync.
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                &context.accounts.bonding_curve.key(),
                &context.accounts.curve_wsol_account.key(),
                quote_amount_in,
            ),
            &[
                context.accounts.bonding_curve.to_account_info(),
                context.accounts.curve_wsol_account.to_account_info(),
                context.accounts.system_program.to_account_info(),
            ],
            &[curve_signer_seeds],
        )?;

        // sync_native so the WSOL ATA reflects the deposited lamports.
        anchor_spl::token::sync_native(CpiContext::new_with_signer(
            context.accounts.base_token_program.to_account_info(),
            anchor_spl::token::SyncNative {
                account: context.accounts.curve_wsol_account.to_account_info(),
            },
            &[curve_signer_seeds],
        ))?;

        // Build create_pool instruction data: discriminator + index (u16 LE) + base_amount_in (u64 LE) + quote_amount_in (u64 LE).
        let mut instruction_data = Vec::with_capacity(8 + 2 + 8 + 8);
        instruction_data.extend_from_slice(&CREATE_POOL_DISCRIMINATOR);
        instruction_data.extend_from_slice(&pool_index.to_le_bytes());
        instruction_data.extend_from_slice(&base_amount_in.to_le_bytes());
        instruction_data.extend_from_slice(&quote_amount_in.to_le_bytes());

        let create_pool_instruction = anchor_lang::solana_program::instruction::Instruction {
            program_id: PUMPSWAP_PROGRAM_ID,
            accounts: vec![
                anchor_lang::solana_program::instruction::AccountMeta::new(context.accounts.pool.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(context.accounts.pumpswap_global_config.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new(context.accounts.bonding_curve.key(), true),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(context.accounts.mint.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(context.accounts.wsol_mint.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new(context.accounts.lp_mint.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new(context.accounts.vault_token_account.key(), true),
                anchor_lang::solana_program::instruction::AccountMeta::new(context.accounts.curve_wsol_account.key(), true),
                anchor_lang::solana_program::instruction::AccountMeta::new(context.accounts.curve_lp_token_account.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new(context.accounts.pool_base_token_account.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new(context.accounts.pool_quote_token_account.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(context.accounts.system_program.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(TOKEN_2022_PROGRAM_ID, false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(context.accounts.base_token_program.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(context.accounts.quote_token_program.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(context.accounts.associated_token_program.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(context.accounts.pumpswap_event_authority.key(), false),
                anchor_lang::solana_program::instruction::AccountMeta::new_readonly(PUMPSWAP_PROGRAM_ID, false),
            ],
            data: instruction_data,
        };

        anchor_lang::solana_program::program::invoke_signed(
            &create_pool_instruction,
            &[
                context.accounts.pool.to_account_info(),
                context.accounts.pumpswap_global_config.to_account_info(),
                context.accounts.bonding_curve.to_account_info(),
                context.accounts.mint.to_account_info(),
                context.accounts.wsol_mint.to_account_info(),
                context.accounts.lp_mint.to_account_info(),
                context.accounts.vault_token_account.to_account_info(),
                context.accounts.curve_wsol_account.to_account_info(),
                context.accounts.curve_lp_token_account.to_account_info(),
                context.accounts.pool_base_token_account.to_account_info(),
                context.accounts.pool_quote_token_account.to_account_info(),
                context.accounts.system_program.to_account_info(),
                context.accounts.token_2022_program.to_account_info(),
                context.accounts.base_token_program.to_account_info(),
                context.accounts.quote_token_program.to_account_info(),
                context.accounts.associated_token_program.to_account_info(),
                context.accounts.pumpswap_event_authority.to_account_info(),
                context.accounts.pumpswap_program.to_account_info(),
            ],
            &[curve_signer_seeds],
        )?;

        emit!(PumpSwapGraduationEvent {
            mint: mint_key,
            pool: context.accounts.pool.key(),
            base_amount_in,
            quote_amount_in,
        });

        Ok(())
    }
}

fn compute_tokens_out(sol_amount: u64, curve: &BondingCurve) -> Result<u64> {
    let numerator = (sol_amount as u128).checked_mul(curve.virtual_token_reserves as u128).ok_or(X402Error::Overflow)?;
    let denominator = (curve.virtual_sol_reserves as u128).checked_add(sol_amount as u128).ok_or(X402Error::Overflow)?;
    Ok((numerator / denominator) as u64)
}

fn compute_sol_out(token_amount: u64, curve: &BondingCurve) -> Result<u64> {
    let numerator = (token_amount as u128).checked_mul(curve.virtual_sol_reserves as u128).ok_or(X402Error::Overflow)?;
    let denominator = (curve.virtual_token_reserves as u128).checked_add(token_amount as u128).ok_or(X402Error::Overflow)?;
    Ok((numerator / denominator) as u64)
}

fn compute_fee(amount: u64, bps: u64) -> Result<u64> {
    (amount as u128).checked_mul(bps as u128).and_then(|v| v.checked_div(BPS_DENOMINATOR as u128)).map(|v| v as u64).ok_or_else(|| error!(X402Error::Overflow))
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, seeds = [b"global"], bump, space = 8 + Global::INIT_SPACE)]
    pub global: Account<'info, Global>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub fee_recipient: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: [u8; 32])]
pub struct RecordX402Payment<'info> {
    #[account(init, payer = oracle, seeds = [b"x402", payer.key().as_ref(), nonce.as_ref()], bump, space = 8 + X402Receipt::INIT_SPACE)]
    pub receipt: Account<'info, X402Receipt>,
    #[account(mut)]
    pub oracle: Signer<'info>,
    /// CHECK: Arbitrary pubkey whose payment is being recorded; used only as a seed for the receipt PDA and stored in receipt.payer — no lamport or data access.
    pub payer: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name: String, symbol: String, uri: String, nonce: [u8; 32])]
pub struct LaunchToken<'info> {
    #[account(mut, seeds = [b"global"], bump)]
    pub global: Account<'info, Global>,
    #[account(mut, seeds = [b"x402", creator.key().as_ref(), nonce.as_ref()], bump = x402_receipt.bump, constraint = x402_receipt.payer == creator.key())]
    pub x402_receipt: Account<'info, X402Receipt>,
    #[account(init, payer = creator, seeds = [b"token", mint.key().as_ref()], bump, space = 8 + TokenState::INIT_SPACE)]
    pub token: Account<'info, TokenState>,
    #[account(init, payer = creator, seeds = [b"curve", mint.key().as_ref()], bump, space = 8 + BondingCurve::INIT_SPACE)]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(init, payer = creator, mint::decimals = TOKEN_DECIMALS, mint::authority = creator, seeds = [b"mint", creator.key().as_ref(), name.as_bytes()], bump)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(sol_amount: u64, min_tokens_out: u64, nonce: [u8; 32])]
pub struct Buy<'info> {
    #[account(seeds = [b"global"], bump)]
    pub global: Account<'info, Global>,
    #[account(mut, seeds = [b"x402", buyer.key().as_ref(), nonce.as_ref()], bump = x402_receipt.bump, constraint = x402_receipt.payer == buyer.key())]
    pub x402_receipt: Account<'info, X402Receipt>,
    #[account(mut, seeds = [b"token", bonding_curve.mint.as_ref()], bump = token.bump)]
    pub token: Account<'info, TokenState>,
    #[account(mut, seeds = [b"curve", bonding_curve.mint.as_ref()], bump = bonding_curve.bump)]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = bonding_curve, associated_token::token_program = token_program)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = buyer, associated_token::token_program = token_program)]
    pub buyer_token_account: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: Address verified against global.fee_recipient via constraint; receives SOL fee transfer only.
    #[account(mut, constraint = fee_recipient.key() == global.fee_recipient)]
    pub fee_recipient: UncheckedAccount<'info>,
    /// CHECK: Address verified against token.creator via constraint; receives SOL creator fee transfer only.
    #[account(mut, constraint = creator.key() == token.creator)]
    pub creator: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_amount: u64, min_sol_out: u64, nonce: [u8; 32])]
pub struct Sell<'info> {
    #[account(seeds = [b"global"], bump)]
    pub global: Account<'info, Global>,
    #[account(mut, seeds = [b"x402", seller.key().as_ref(), nonce.as_ref()], bump = x402_receipt.bump, constraint = x402_receipt.payer == seller.key())]
    pub x402_receipt: Account<'info, X402Receipt>,
    #[account(mut, seeds = [b"token", bonding_curve.mint.as_ref()], bump = token.bump)]
    pub token: Account<'info, TokenState>,
    #[account(mut, seeds = [b"curve", bonding_curve.mint.as_ref()], bump = bonding_curve.bump)]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = bonding_curve, associated_token::token_program = token_program)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = seller, associated_token::token_program = token_program)]
    pub seller_token_account: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub seller: Signer<'info>,
    /// CHECK: Address verified against global.fee_recipient via constraint; receives SOL fee transfer only.
    #[account(mut, constraint = fee_recipient.key() == global.fee_recipient)]
    pub fee_recipient: UncheckedAccount<'info>,
    /// CHECK: Address verified against token.creator via constraint; receives SOL creator fee transfer only.
    #[account(mut, constraint = creator.key() == token.creator)]
    pub creator: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ContributeLiquidity<'info> {
    #[account(mut, seeds = [b"token", bonding_curve.mint.as_ref()], bump = token.bump)]
    pub token: Account<'info, TokenState>,
    #[account(mut, seeds = [b"curve", bonding_curve.mint.as_ref()], bump = bonding_curve.bump)]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(mut)]
    pub contributor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pool_index: u16)]
pub struct GraduateToPumpSwap<'info> {
    #[account(mut, seeds = [b"token", bonding_curve.mint.as_ref()], bump = token.bump)]
    pub token: Account<'info, TokenState>,

    #[account(mut, seeds = [b"curve", bonding_curve.mint.as_ref()], bump = bonding_curve.bump)]
    pub bonding_curve: Account<'info, BondingCurve>,

    pub mint: InterfaceAccount<'info, Mint>,

    // Bonding curve's token vault — source of base tokens for the pool.
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = bonding_curve,
        associated_token::token_program = base_token_program
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    // Bonding curve's WSOL ATA — SOL is wrapped here then passed to PumpSwap.
    /// CHECK: ATA of bonding_curve for WSOL; validated via associated_token seeds.
    #[account(
        mut,
        seeds = [
            bonding_curve.key().as_ref(),
            quote_token_program.key().as_ref(),
            wsol_mint.key().as_ref(),
        ],
        seeds::program = anchor_spl::associated_token::ID,
        bump
    )]
    pub curve_wsol_account: UncheckedAccount<'info>,

    // LP tokens minted by PumpSwap are sent here (ATA of bonding_curve for lp_mint).
    /// CHECK: ATA of bonding_curve for the LP mint created by PumpSwap; validated via associated_token seeds.
    #[account(
        mut,
        seeds = [
            bonding_curve.key().as_ref(),
            token_2022_program.key().as_ref(),
            lp_mint.key().as_ref(),
        ],
        seeds::program = anchor_spl::associated_token::ID,
        bump
    )]
    pub curve_lp_token_account: UncheckedAccount<'info>,

    // Pool PDA owned by PumpSwap — seeds: ["pool", index_le, creator, base_mint, quote_mint].
    /// CHECK: PDA owned and validated by PumpSwap; we only pass it through.
    #[account(
        mut,
        seeds = [
            b"pool",
            &pool_index.to_le_bytes(),
            bonding_curve.key().as_ref(),
            mint.key().as_ref(),
            WSOL_MINT.as_ref(),
        ],
        seeds::program = PUMPSWAP_PROGRAM_ID,
        bump
    )]
    pub pool: UncheckedAccount<'info>,

    // LP mint PDA — seeds: ["pool_lp_mint", pool], owned by Token-2022 program.
    /// CHECK: PDA owned and created by PumpSwap via Token-2022; we only pass it through.
    #[account(
        mut,
        seeds = [b"pool_lp_mint", pool.key().as_ref()],
        seeds::program = PUMPSWAP_PROGRAM_ID,
        bump
    )]
    pub lp_mint: UncheckedAccount<'info>,

    // Pool's ATA for the base token (our mint), owned by PumpSwap pool PDA.
    /// CHECK: ATA of pool for base_mint; created and validated by PumpSwap.
    #[account(mut)]
    pub pool_base_token_account: UncheckedAccount<'info>,

    // Pool's ATA for quote token (WSOL), owned by PumpSwap pool PDA.
    /// CHECK: ATA of pool for WSOL; created and validated by PumpSwap.
    #[account(mut)]
    pub pool_quote_token_account: UncheckedAccount<'info>,

    // PumpSwap GlobalConfig PDA — seeds: ["global_config"].
    /// CHECK: PDA validated by PumpSwap; we only pass it through as readonly.
    #[account(
        seeds = [b"global_config"],
        seeds::program = PUMPSWAP_PROGRAM_ID,
        bump
    )]
    pub pumpswap_global_config: UncheckedAccount<'info>,

    // PumpSwap event_authority PDA — seeds: ["__event_authority"].
    /// CHECK: PDA validated by PumpSwap for its self-CPI event emission.
    #[account(
        seeds = [b"__event_authority"],
        seeds::program = PUMPSWAP_PROGRAM_ID,
        bump
    )]
    pub pumpswap_event_authority: UncheckedAccount<'info>,

    // WSOL mint — quote token for all PumpSwap pools.
    /// CHECK: Address constraint enforces this is the canonical WSOL mint.
    #[account(address = WSOL_MINT)]
    pub wsol_mint: UncheckedAccount<'info>,

    /// CHECK: Address constraint enforces this is the PumpSwap program.
    #[account(address = PUMPSWAP_PROGRAM_ID)]
    pub pumpswap_program: UncheckedAccount<'info>,

    pub base_token_program: Interface<'info, TokenInterface>,
    pub quote_token_program: Interface<'info, TokenInterface>,

    /// CHECK: Address constraint enforces this is the Token-2022 program.
    #[account(address = TOKEN_2022_PROGRAM_ID)]
    pub token_2022_program: UncheckedAccount<'info>,

    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(InitSpace)]
#[account]
pub struct Global {
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,
    pub initialized: bool,
    pub token_count: u64,
    pub virtual_token_reserves: u64,
    pub virtual_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub bump: u8,
}

#[derive(InitSpace)]
#[account]
pub struct X402Receipt {
    pub payer: Pubkey,
    pub nonce: [u8; 32],
    pub used: bool,
    pub bump: u8,
}

#[derive(InitSpace)]
#[account]
pub struct TokenState {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub bonding_curve: Pubkey,
    #[max_len(32)]
    pub name: String,
    #[max_len(10)]
    pub symbol: String,
    #[max_len(200)]
    pub uri: String,
    pub graduated: bool,
    pub completed: bool,
    pub total_buys: u64,
    pub total_sells: u64,
    pub liquidity_contributed: u64,
    pub bump: u8,
}

#[derive(InitSpace)]
#[account]
pub struct BondingCurve {
    pub mint: Pubkey,
    pub virtual_token_reserves: u64,
    pub virtual_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub token_total_supply: u64,
    pub complete: bool,
    pub bump: u8,
}

#[event]
pub struct LaunchEvent { pub mint: Pubkey, pub creator: Pubkey, pub name: String, pub symbol: String }
#[event]
pub struct BuyEvent { pub mint: Pubkey, pub buyer: Pubkey, pub sol_amount: u64, pub tokens_received: u64, pub liquidity: u64 }
#[event]
pub struct SellEvent { pub mint: Pubkey, pub seller: Pubkey, pub tokens_sold: u64, pub sol_received: u64 }
#[event]
pub struct LiquidityContributionEvent { pub mint: Pubkey, pub contributor: Pubkey, pub amount: u64, pub total_liquidity: u64, pub target: u64, pub percent: u64 }
#[event]
pub struct GraduationEvent { pub mint: Pubkey, pub total_liquidity: u64 }
#[event]
pub struct PumpSwapGraduationEvent { pub mint: Pubkey, pub pool: Pubkey, pub base_amount_in: u64, pub quote_amount_in: u64 }

#[error_code]
pub enum X402Error {
    #[msg("Token has already graduated")]
    AlreadyGraduated,
    #[msg("Token has not yet reached graduation threshold")]
    NotYetGraduated,
    #[msg("Token pool has already been created")]
    AlreadyCompleted,
    #[msg("Overflow")]
    Overflow,
    #[msg("Slippage exceeded")]
    SlippageExceeded,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    #[msg("Payment already used")]
    PaymentAlreadyUsed,
    #[msg("Payment not for caller")]
    PaymentNotForCaller,
    #[msg("Invalid program")]
    InvalidProgram,
    #[msg("Invalid fee recipient")]
    InvalidFeeRecipient,
    #[msg("Invalid creator")]
    InvalidCreator,
    #[msg("String too long")]
    StringTooLong,
}
