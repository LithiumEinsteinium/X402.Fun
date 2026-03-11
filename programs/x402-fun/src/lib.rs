/**
 * X402.Fun - Smart Contract v2
 * 
 * Agent-only meme token launchpad with bonding curve
 * x402 required for: launch, buy, sell (during bonding curve)
 * Graduation at 69 SOL liquidity (multi-agent pool)
 */

use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use core::mem::size_of;

declare_id!("X402Fun1111111111111111111111111111111");

pub mod constants {
    pub const GRADUATION_LIQUIDITY_SOL: u64 = 69_000_000_000; // 69 SOL in lamports
    pub const PLATFORM_FEE_BPS: u16 = 100; // 1%
    pub const CREATOR_FEE_BPS: u16 = 200; // 2%
}

#[program]
pub mod x402_fun {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let global = &mut ctx.accounts.global;
        global.authority = ctx.accounts.authority.key();
        global.fee_recipient = ctx.accounts.fee_recipient.key();
        global.initialized = true;
        global.token_count = 0;
        global.virtual_token_reserves = 1_073_000_000_000_000;
        global.virtual_sol_reserves = 30_000_000_000; // 30 SOL initial
        global.real_token_reserves = 793_100_000_000_000;
        Ok(())
    }

    /// Launch token - requires x402 payment
    pub fn launch_token(
        ctx: Context<LaunchToken>,
        name: String,
        symbol: String,
        uri: String,
        x402_payment_verified: bool,
    ) -> Result<()> {
        require!(x402_payment_verified, X402Error::PaymentRequired);

        let global = &mut ctx.accounts.global;
        global.token_count = global.token_count.checked_add(1).unwrap();

        let token = &mut ctx.accounts.token;
        token.mint = ctx.accounts.mint.key();
        token.creator = ctx.accounts.creator.key();
        token.name = name;
        token.symbol = symbol;
        token.uri = uri;
        token.bonding_curve = ctx.accounts.bonding_curve.key();
        token.graduated = false;
        token.completed = false;
        token.total_buys = 0;
        token.total_sells = 0;
        token.liquidity_contributed = 0;
        
        let curve = &mut ctx.accounts.bonding_curve;
        curve.mint = ctx.accounts.mint.key();
        curve.virtual_token_reserves = global.virtual_token_reserves;
        curve.virtual_sol_reserves = global.virtual_sol_reserves;
        curve.real_token_reserves = global.real_token_reserves;
        curve.real_sol_reserves = 0;
        curve.token_total_supply = 1_000_000_000_000_000;
        curve.complete = false;

        emit!(LaunchEvent {
            mint: token.mint,
            creator: token.creator,
            name: token.name.clone(),
            symbol: token.symbol.clone(),
        });

        Ok(())
    }

    /// Buy on bonding curve - requires x402 during bonding phase
    pub fn buy(
        ctx: Context<Buy>,
        amount: u64,
        x402_payment_verified: bool,
    ) -> Result<()> {
        // x402 required during bonding curve phase
        require!(!ctx.accounts.bonding_curve.complete, X402Error::AlreadyGraduated);
        require!(x402_payment_verified, X402Error::PaymentRequired);

        let curve = &mut ctx.accounts.bonding_curve;

        let tokens_out = (amount * curve.virtual_token_reserves) 
            / (curve.virtual_sol_reserves + amount);

        let platform_fee = (amount * constants::PLATFORM_FEE_BPS as u64) / 10000;
        let creator_fee = (amount * constants::CREATOR_FEE_BPS as u64) / 10000;
        let net_sol = amount - platform_fee - creator_fee;

        // Transfer SOL to bonding curve
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.buyer.key(),
            &ctx.accounts.bonding_curve.key(),
            net_sol,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.bonding_curve.to_account_info(),
            ],
        )?;

        // Update curve state
        curve.virtual_sol_reserves += amount;
        curve.virtual_token_reserves -= tokens_out;
        curve.real_sol_reserves += net_sol;

        let token = &mut ctx.accounts.token;
        token.total_buys += 1;

        emit!(BuyEvent {
            mint: curve.mint,
            buyer: ctx.accounts.buyer.key(),
            sol_amount: amount,
            tokens_received: tokens_out,
            liquidity: curve.real_sol_reserves,
        });

        Ok(())
    }

    /// Sell on bonding curve - requires x402 during bonding phase
    pub fn sell(
        ctx: Context<Sell>,
        token_amount: u64,
        x402_payment_verified: bool,
    ) -> Result<()> {
        // x402 required during bonding curve phase
        require!(!ctx.accounts.bonding_curve.complete, X402Error::AlreadyGraduated);
        require!(x402_payment_verified, X402Error::PaymentRequired);

        let curve = &mut ctx.accounts.bonding_curve;

        let sol_out = (token_amount * curve.virtual_sol_reserves)
            / (curve.virtual_token_reserves + token_amount);

        let platform_fee = (sol_out * constants::PLATFORM_FEE_BPS as u64) / 10000;
        let creator_fee = (sol_out * constants::CREATOR_FEE_BPS as u64) / 10000;
        let net_sol = sol_out - platform_fee - creator_fee;

        // Transfer SOL to seller
        **ctx.accounts.seller.try_borrow_mut_lamports()? += net_sol;
        **ctx.accounts.bonding_curve.try_borrow_mut_lamports()? -= net_sol;

        // Update curve state
        curve.virtual_sol_reserves -= sol_out;
        curve.virtual_token_reserves += token_amount;
        curve.real_sol_reserves -= sol_out;

        let token = &mut ctx.accounts.token;
        token.total_sells += 1;

        emit!(SellEvent {
            mint: curve.mint,
            seller: ctx.accounts.seller.key(),
            tokens_sold: token_amount,
            sol_received: net_sol,
        });

        Ok(())
    }

    /// Contribute liquidity for graduation - multiple agents can contribute
    pub fn contribute_liquidity(
        ctx: Context<ContributeLiquidity>,
        amount: u64,
    ) -> Result<()> {
        let curve = &mut ctx.accounts.bonding_curve;
        let token = &mut ctx.accounts.token;
        
        // Can't contribute if already graduated
        require!(!curve.complete, X402Error::AlreadyGraduated);

        // Transfer SOL from contributor to bonding curve
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.contributor.key(),
            &ctx.accounts.bonding_curve.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.contributor.to_account_info(),
                ctx.accounts.bonding_curve.to_account_info(),
            ],
        )?;

        // Update liquidity
        curve.real_sol_reserves += amount;
        token.liquidity_contributed += amount;

        // Check if reached graduation threshold
        if curve.real_sol_reserves >= constants::GRADUATION_LIQUIDITY_SOL {
            curve.complete = true;
            token.graduated = true;
            
            emit!(GraduationEvent {
                mint: curve.mint,
                total_liquidity: curve.real_sol_reserves,
            });
        }

        emit!(LiquidityContributionEvent {
            mint: curve.mint,
            contributor: ctx.accounts.contributor.key(),
            amount,
            total_liquidity: curve.real_sol_reserves,
            target: constants::GRADUATION_LIQUIDITY_SOL,
            percent: (curve.real_sol_reserves * 100) / constants::GRADUATION_LIQUIDITY_SOL,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = size_of::<Global>() + 8,
        seeds = [b"global"],
        bump
    )]
    pub global: Account<'info, Global>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub fee_recipient: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name: String, symbol: String)]
pub struct LaunchToken<'info> {
    #[account(mut)]
    pub global: Account<'info, Global>,
    #[account(
        init,
        payer = creator,
        space = size_of::<TokenState>() + 8,
        seeds = [b"token", mint.key().as_ref()],
        bump
    )]
    pub token: Account<'info, TokenState>,
    #[account(
        init,
        payer = creator,
        space = size_of::<BondingCurve>() + 8,
        seeds = [b"curve", mint.key().as_ref()],
        bump
    )]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(
        init,
        payer = creator,
        mint::decimals = 9,
        mint::authority = creator,
        seeds = [b"mint", creator.key().as_ref(), name.as_ref()],
        bump
    )]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub global: Account<'info, Global>,
    #[account(mut, seeds = [b"token", bonding_curve.mint.as_ref()], bump)]
    pub token: Account<'info, TokenState>,
    #[account(
        mut,
        seeds = [b"curve", bonding_curve.mint.as_ref()],
        bump
    )]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut, seeds = [b"token", bonding_curve.mint.as_ref()], bump)]
    pub token: Account<'info, TokenState>,
    #[account(
        mut,
        seeds = [b"curve", bonding_curve.mint.as_ref()],
        bump
    )]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ContributeLiquidity<'info> {
    #[account(mut, seeds = [b"token", bonding_curve.mint.as_ref()], bump)]
    pub token: Account<'info, TokenState>,
    #[account(
        mut,
        seeds = [b"curve", bonding_curve.mint.as_ref()],
        bump
    )]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(mut)]
    pub contributor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Global {
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,
    pub initialized: bool,
    pub token_count: u64,
    pub virtual_token_reserves: u64,
    pub virtual_sol_reserves: u64,
    pub real_token_reserves: u64,
}

#[account]
pub struct TokenState {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub bonding_curve: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub graduated: bool,
    pub completed: bool,
    pub total_buys: u64,
    pub total_sells: u64,
    pub liquidity_contributed: u64,
}

#[account]
pub struct BondingCurve {
    pub mint: Pubkey,
    pub virtual_token_reserves: u64,
    pub virtual_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub token_total_supply: u64,
    pub complete: bool,
}

#[event]
pub struct LaunchEvent {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub name: String,
    pub symbol: String,
}

#[event]
pub struct BuyEvent {
    pub mint: Pubkey,
    pub buyer: Pubkey,
    pub sol_amount: u64,
    pub tokens_received: u64,
    pub liquidity: u64,
}

#[event]
pub struct SellEvent {
    pub mint: Pubkey,
    pub seller: Pubkey,
    pub tokens_sold: u64,
    pub sol_received: u64,
}

#[event]
pub struct LiquidityContributionEvent {
    pub mint: Pubkey,
    pub contributor: Pubkey,
    pub amount: u64,
    pub total_liquidity: u64,
    pub target: u64,
    pub percent: u64,
}

#[event]
pub struct GraduationEvent {
    pub mint: Pubkey,
    pub total_liquidity: u64,
}

#[error_code]
pub enum X402Error {
    #[msg("x402 payment required")]
    PaymentRequired,
    #[msg("Token has already graduated - public trading open")]
    AlreadyGraduated,
}
