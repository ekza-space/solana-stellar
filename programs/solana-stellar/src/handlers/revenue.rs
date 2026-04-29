use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::{
    constants::BPS_DENOMINATOR,
    contexts::{ClaimRevenue, DepositRevenue},
    error::StellarError,
    events::{RevenueClaimed, RevenueDeposited},
};

pub fn deposit_revenue(ctx: Context<DepositRevenue>, amount: u64) -> Result<()> {
    require!(amount > 0, StellarError::InvalidRevenueAmount);
    require!(
        ctx.accounts.release.accepts_revenue(),
        StellarError::ReleaseNotFinalized
    );

    let cpi_accounts = Transfer {
        from: ctx.accounts.payer.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
    };
    let cpi_context = CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);
    transfer(cpi_context, amount)?;

    let release = &mut ctx.accounts.release;
    release.total_deposited_lamports = release
        .total_deposited_lamports
        .checked_add(amount)
        .ok_or(StellarError::NumericalOverflow)?;

    emit!(RevenueDeposited {
        release: release.key(),
        vault: ctx.accounts.vault.key(),
        payer: ctx.accounts.payer.key(),
        amount,
    });

    Ok(())
}

pub fn claim_revenue(ctx: Context<ClaimRevenue>) -> Result<()> {
    let release = &ctx.accounts.release;
    require!(release.accepts_revenue(), StellarError::ReleaseNotFinalized);

    let share = &mut ctx.accounts.share;
    let entitled = release
        .total_deposited_lamports
        .checked_mul(share.bps as u64)
        .ok_or(StellarError::NumericalOverflow)?
        .checked_div(BPS_DENOMINATOR as u64)
        .ok_or(StellarError::NumericalOverflow)?;
    let claimable = entitled
        .checked_sub(share.claimed_lamports)
        .ok_or(StellarError::NumericalOverflow)?;
    require!(claimable > 0, StellarError::NoRevenueToClaim);

    let vault_info = ctx.accounts.vault.to_account_info();
    let contributor_info = ctx.accounts.contributor.to_account_info();
    require!(
        vault_info.lamports() >= claimable,
        StellarError::InsufficientVaultBalance
    );

    **vault_info.try_borrow_mut_lamports()? = vault_info
        .lamports()
        .checked_sub(claimable)
        .ok_or(StellarError::InsufficientVaultBalance)?;
    **contributor_info.try_borrow_mut_lamports()? = contributor_info
        .lamports()
        .checked_add(claimable)
        .ok_or(StellarError::NumericalOverflow)?;

    share.claimed_lamports = entitled;

    emit!(RevenueClaimed {
        release: release.key(),
        contributor: ctx.accounts.contributor.key(),
        amount: claimable,
        total_claimed: entitled,
    });

    Ok(())
}
