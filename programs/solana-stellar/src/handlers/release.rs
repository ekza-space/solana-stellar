use anchor_lang::prelude::*;

use crate::{
    constants::BPS_DENOMINATOR,
    contexts::{AddReleaseShare, CreateRelease, FinalizeRelease, LinkAvatarData},
    error::StellarError,
    events::{
        AssetStatusChanged, AvatarDataLinked, ReleaseCreated, ReleaseShareAdded,
        ReleaseStatusChanged,
    },
    state::{AssetStatus, ReleaseStatus},
    utils::validate_hash,
};

pub fn create_release(
    ctx: Context<CreateRelease>,
    release_index: u64,
    metadata_hash: String,
) -> Result<()> {
    validate_hash(&metadata_hash)?;

    let universe = &mut ctx.accounts.universe;
    let asset = &ctx.accounts.asset;

    require!(
        asset.status == AssetStatus::Approved,
        StellarError::InvalidAssetStatus
    );
    require!(
        release_index == universe.release_count,
        StellarError::InvalidReleaseIndex
    );

    let now = Clock::get()?.unix_timestamp;
    let universe_key = universe.key();
    let asset_key = asset.key();
    let release_key = ctx.accounts.release.key();
    let vault_key = ctx.accounts.vault.key();
    let release = &mut ctx.accounts.release;

    release.universe = universe_key;
    release.asset = asset_key;
    release.vault = vault_key;
    release.index = release_index;
    release.authority = ctx.accounts.owner.key();
    release.status = ReleaseStatus::Draft;
    release.metadata_hash = metadata_hash;
    release.total_share_bps = 0;
    release.total_deposited_lamports = 0;
    release.bump = ctx.bumps.release;
    release.created_at = now;
    release.finalized_at = 0;
    release.linked_avatar_data = Pubkey::default();

    let vault = &mut ctx.accounts.vault;
    vault.release = release_key;
    vault.bump = ctx.bumps.vault;

    universe.release_count = universe
        .release_count
        .checked_add(1)
        .ok_or(StellarError::NumericalOverflow)?;
    universe.updated_at = now;

    emit!(ReleaseCreated {
        universe: universe_key,
        release: release_key,
        asset: asset_key,
        vault: vault_key,
        index: release_index,
    });

    Ok(())
}

pub fn add_release_share(ctx: Context<AddReleaseShare>, bps: u16) -> Result<()> {
    require!(bps > 0, StellarError::InvalidShareBps);

    let release = &mut ctx.accounts.release;
    require!(
        release.status == ReleaseStatus::Draft,
        StellarError::ReleaseLocked
    );

    let new_total = release
        .total_share_bps
        .checked_add(bps)
        .ok_or(StellarError::NumericalOverflow)?;
    require!(new_total <= BPS_DENOMINATOR, StellarError::InvalidShareBps);

    let release_key = release.key();
    let contributor_key = ctx.accounts.contributor.key();
    let share = &mut ctx.accounts.share;
    share.release = release_key;
    share.contributor = contributor_key;
    share.bps = bps;
    share.claimed_lamports = 0;
    share.bump = ctx.bumps.share;

    release.total_share_bps = new_total;

    emit!(ReleaseShareAdded {
        release: release_key,
        contributor: contributor_key,
        bps,
    });

    Ok(())
}

pub fn finalize_release(ctx: Context<FinalizeRelease>) -> Result<()> {
    let release = &mut ctx.accounts.release;
    let asset = &mut ctx.accounts.asset;

    require!(
        release.status == ReleaseStatus::Draft,
        StellarError::ReleaseLocked
    );
    require!(
        release.total_share_bps == BPS_DENOMINATOR,
        StellarError::InvalidShareBps
    );
    require!(
        asset.status == AssetStatus::Approved,
        StellarError::InvalidAssetStatus
    );

    let now = Clock::get()?.unix_timestamp;
    release.status = ReleaseStatus::Finalized;
    release.finalized_at = now;
    asset.status = AssetStatus::Finalized;
    asset.updated_at = now;

    emit!(ReleaseStatusChanged {
        release: release.key(),
        status: ReleaseStatus::Finalized,
    });
    emit!(AssetStatusChanged {
        asset: asset.key(),
        status: AssetStatus::Finalized,
    });

    Ok(())
}

pub fn link_avatar_data(ctx: Context<LinkAvatarData>, avatar_data: Pubkey) -> Result<()> {
    let release = &mut ctx.accounts.release;
    require!(
        release.status == ReleaseStatus::Finalized,
        StellarError::ReleaseNotFinalized
    );
    release.linked_avatar_data = avatar_data;
    release.status = ReleaseStatus::Linked;

    emit!(AvatarDataLinked {
        release: release.key(),
        avatar_data,
    });
    emit!(ReleaseStatusChanged {
        release: release.key(),
        status: ReleaseStatus::Linked,
    });

    Ok(())
}
