/**
 * X402.Fun - Smart Contract
 * 
 * Agent-only meme token launchpad with bonding curve
 * Only accepts x402 payments during bonding curve phase
 */

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, TokenAccount, Transfer};
use std::mem::size_of;

declare_id!("X402Fun1111111111111111111111111111111");

pub mod constants {
    pub const GRADUATION_MARKET_CAP: u64 = 12_000_000_000; // $12K in lamports (~$100/SOL)
    pub const PLATFORM_FEE_BPS: u16 = 100; // 1%
    pub const CREATOR_FEE_BPS: u16 = 200; // 2%
}

#[program]
pub mod x402_fun {
    use super::*;

    /// Initialize the global config
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let global = &mut ctx.accounts.global;
        global.authority = ctx.accounts.authority.key();
        global.fee_recipient = ctx.accounts.fee_recipient.key();
        global.initialized = true;
        global.token_count = 0;
        
        // Bonding curve parameters
        global.virtual_token_reserves = 1_073_000_000_000_000;
        global.virtual_sol_reserves = 30_000_000_000; // 30 SOL
        global.real_token_reserves = 793_100_000_000_000;
        
        Ok(())
    }

    /// Launch a new token (requires x402 payment verification)
    pub fn launch_token(
        ctx: Context<LaunchToken>,
        name: String,
        symbol: String,
        uri: String,
        x402_payment_verified: bool,
    ) -> Result<()> {
        // MUST have x402 payment verified
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
        
        // Initialize bonding curve
        let curve = &mut ctx.accounts.bonding_curve;
        curve.mint = ctx.accounts.mint.key();
        curve.virtual_token_reserves = global.virtual_token_reserves;
        curve.virtual_sol_reserves = global.virtual_sol_reserves;
        curve.real_token_reserves = global.real_token_reserves;
        curve.real_sol_reserves = 0;
        curve.token_total_supply = 1_000_000_000_000_000;
        curve.complete = false;

        // Mint tokens to bonding curve (not to creator yet)
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.bonding_curve_token.to_account_info(),
                    authority: ctx.accounts.mint.to_account_info(),
                },
            ),
            global.virtual_token_reserves as u64,
        )?;

        Ok(())
    }

    /// Buy tokens on bonding curve
    pub fn buy(
        ctx: Context<Buy>,
        amount: u64,
        max_sol_cost: u64,
    ) -> Result<()> {
        let curve = &mut ctx.accounts.bonding_curve;
        require!(!curve.complete, X402Error::TokenGraduated);

        // Calculate tokens received (Uniswap V2 style)
        let sol_in = amount;
        let tokens_out = (sol_in * curve.virtual_token_reserves) 
            / (curve.virtual_sol_reserves + sol_in);

        // Apply fees
        let platform_fee = (sol_in * constants::PLATFORM_FEE_BPS as u64) / 10000;
        let creator_fee = (sol_in * constants::CREATOR_FEE_BPS as u64) / 10000;
        let net_sol = sol_in - platform_fee - creator_fee;

        // Transfer SOL to curve
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

        // Transfer tokens to buyer
        let buyer_ata = &ctx.accounts.buyer_token_account;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.bonding_curve_token.to_account_info(),
                    to: buyer_ata.to_account_info(),
                    authority: ctx.accounts.bonding_curve.to_account_info(),
                },
            ),
            tokens_out,
        )?;

        // Update curve
        curve.virtual_sol_reserves += sol_in;
        curve.virtual_token_reserves -= tokens_out;

        // Check graduation
        let market_cap = calculate_market_cap(curve);
        if market_cap >= constants::GRADUATION_MARKET_CAP {
            curve.complete = true;
        }

        // Emit event
        emit!(BuyEvent {
            mint: curve.mint,
            buyer: ctx.accounts.buyer.key(),
            sol_amount: sol_in,
            tokens_received: tokens_out,
            market_cap,
        });

        Ok(())
    }

    /// Sell tokens on bonding curve
    pub fn sell(
        ctx: Context<Sell>,
        token_amount: u64,
        min_sol_output: u64,
    ) -> Result<()> {
        let curve = &mut ctx.accounts.bonding_curve;
        require!(!curve.complete, X402Error::TokenGraduated);

        // Calculate SOL output
        let sol_out = (token_amount * curve.virtual_sol_reserves)
            / (curve.virtual_token_reserves + token_amount);

        require!(sol_out >= min_sol_output, X402Error::SlippageExceeded);

        // Apply fees
        let platform_fee = (sol_out * constants::PLATFORM_FEE_BPS as u64) / 10000;
        let creator_fee = (sol_out * constants::CREATOR_FEE_BPS as u64) / 10000;
        let net_sol = sol_out - platform_fee - creator_fee;

        // Transfer tokens from buyer to curve
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.seller.key(),
            &ctx.accounts.bonding_curve_token.key(),
            token_amount,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.seller.to_account_info(),
                ctx.accounts.bonding_curve_token.to_account_info(),
            ],
        )?;

        // Transfer SOL to seller
        **ctx.accounts.seller.try_borrow_mut_lamports()? += net_sol;
        **ctx.accounts.bonding_curve.try_borrow_mut_lamports()? -= net_sol;

        // Update curve
        curve.virtual_sol_reserves -= sol_out;
        curve.virtual_token_reserves += token_amount;

        emit!(SellEvent {
            mint: curve.mint,
            seller: ctx.accounts.seller.key(),
            tokens_sold: token_amount,
            sol_received: net_sol,
        });

        Ok(())
    }

    /// Graduate token to PumpSwap (after reaching $12K)
    pub fn graduate(ctx: Context<Graduate>) -> Result<()> {
        let token = &mut ctx.accounts.token;
        let curve = &mut ctx.accounts.bonding_curve;

        require!(curve.complete, X402Error::NotGraduated);

        token.graduated = true;
        token.graduated_at = Clock::get()?.unix_timestamp;

        emit!(GraduationEvent {
            mint: token.mint,
            creator: token.creator,
        });

        Ok(())
    }
}

fn calculate_market_cap(curve: &BondingCurve) -> u64 {
    // Price = SOL reserves / Token reserves
    let price = (curve.virtual_sol_reserves as f64) / (curve.virtual_token_reserves as f64);
    // Market cap = supply * price * SOL price (assume $100)
    (curve.token_total_supply as f64 * price * 100.0) as u64
}

// ============ ACCOUNTS ============

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
        mint::authority = mint,
        mint::decimals = 6,
        seeds = [b"mint", creator.key().as_ref()],
        bump
    )]
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = bonding_curve,
        seeds = [b"ata", mint.key().as_ref(), bonding_curve.key().as_ref()],
        bump
    )]
    pub bonding_curve_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub associated_token_program: Program<'info, token::AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub global: Account<'info, Global>,
    #[account(mut)]
    pub token: Account<'info, TokenState>,
    #[account(mut, seeds = [b"curve", mint.key().as_ref()], bump)]
    pub bonding_curve: Account<'info, BondingCurve>,
    pub mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = buyer)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
}

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut)]
    pub token: Account<'info, TokenState>,
    #[account(mut, seeds = [b"curve", mint.key().as_ref()], bump)]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = bonding_curve)]
    pub bonding_curve_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
}

#[derive(Accounts)]
pub struct Graduate<'info> {
    #[account(mut)]
    pub token: Account<'info, TokenState>,
    #[account(mut, seeds = [b"curve", mint.key().as_ref()], bump)]
    pub bonding_curve: Account<'info, BondingCurve>,
    pub mint: Account<'info, Mint>,
}

// ============ STATE ============

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
    pub graduated_at: i64,
    pub total_buys: u64,
    pub total_sells: u64,
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

// ============ EVENTS ============

#[event]
pub struct BuyEvent {
    pub mint: Pubkey,
    pub buyer: Pubkey,
    pub sol_amount: u64,
    pub tokens_received: u64,
    pub market_cap: u64,
}

#[event]
pub struct SellEvent {
    pub mint: Pubkey,
    pub seller: Pubkey,
    pub tokens_sold: u64,
    pub sol_received: u64,
}

#[event]
pub struct GraduationEvent {
    pub mint: Pubkey,
    pub creator: Pubkey,
}

// ============ ERRORS ============

#[error_code]
pub enum X402Error {
    #[msg("x402 payment required")]
    PaymentRequired,
    #[msg("Token has already graduated")]
    TokenGraduated,
    #[msg("Token not ready for graduation")]
    NotGraduated,
    #[msg("Slippage exceeded")]
    SlippageExceeded,
}
