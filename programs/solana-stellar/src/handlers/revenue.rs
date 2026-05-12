use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::{
    constants::BPS_DENOMINATOR,
    contexts::{ClaimRevenue, ClaimRevenueFor, DepositRevenue},
    error::StellarError,
    events::{RevenueClaimed, RevenueDeposited},
    state::{ContributorShare, Release, ReleaseVault},
};

const RELEASE_VAULT_ACCOUNT_SPACE: usize = 8 + ReleaseVault::INIT_SPACE;

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
    let vault = &ctx.accounts.vault;
    let share = &mut ctx.accounts.share;
    let contributor = ctx.accounts.contributor.to_account_info();

    process_claim(release, vault, share, &contributor)
}

pub fn claim_revenue_for(ctx: Context<ClaimRevenueFor>) -> Result<()> {
    let release = &ctx.accounts.release;
    require!(release.accepts_revenue(), StellarError::ReleaseNotFinalized);
    let authority = ctx.accounts.authority.key();
    require!(
        authority == release.authority || authority == ctx.accounts.share.contributor,
        StellarError::Unauthorized
    );

    let vault = &ctx.accounts.vault;
    let share = &mut ctx.accounts.share;
    let beneficiary = ctx.accounts.beneficiary.to_account_info();

    process_claim(release, vault, share, &beneficiary)
}

fn process_claim(
    release: &Account<Release>,
    vault: &Account<ReleaseVault>,
    share: &mut Account<ContributorShare>,
    recipient: &AccountInfo,
) -> Result<()> {
    require!(release.accepts_revenue(), StellarError::ReleaseNotFinalized);

    let rent = Rent::get()?;
    let vault_reserve = rent.minimum_balance(RELEASE_VAULT_ACCOUNT_SPACE);

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

    let vault_info = vault.to_account_info();
    let vault_lamports = vault_info.lamports();
    let available_for_claim = vault_lamports
        .checked_sub(vault_reserve)
        .ok_or(StellarError::InsufficientVaultBalanceForClaim)?;
    require!(
        available_for_claim >= claimable,
        StellarError::InsufficientVaultBalanceForClaim
    );

    **vault_info.try_borrow_mut_lamports()? = vault_info
        .lamports()
        .checked_sub(claimable)
        .ok_or(StellarError::InsufficientVaultBalance)?;
    let recipient_info = recipient.to_account_info();
    **recipient_info.try_borrow_mut_lamports()? = recipient_info
        .lamports()
        .checked_add(claimable)
        .ok_or(StellarError::NumericalOverflow)?;

    share.claimed_lamports = entitled;

    emit!(RevenueClaimed {
        release: release.key(),
        contributor: share.contributor,
        amount: claimable,
        total_claimed: entitled,
    });

    Ok(())
}
