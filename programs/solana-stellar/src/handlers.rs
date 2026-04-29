use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::{
    constants::BPS_DENOMINATOR,
    contexts::*,
    error::StellarError,
    events::*,
    state::{
        AssetKind, AssetStatus, AssetSubtype, CollaborationPolicy, ReleaseStatus, UniverseStatus,
    },
    utils::{validate_hash, validate_optional_hash},
};

pub fn create_universe(
    ctx: Context<CreateUniverse>,
    universe_index: u64,
    metadata_hash: String,
    project_type: AssetKind,
    collaboration_policy: CollaborationPolicy,
    open: bool,
) -> Result<()> {
    validate_hash(&metadata_hash)?;

    let now = Clock::get()?.unix_timestamp;
    let universe_key = ctx.accounts.universe.key();
    let owner_key = ctx.accounts.owner.key();
    let universe = &mut ctx.accounts.universe;

    universe.owner = owner_key;
    universe.index = universe_index;
    universe.bump = ctx.bumps.universe;
    universe.asset_count = 0;
    universe.release_count = 0;
    universe.open = open;
    universe.status = UniverseStatus::Active;
    universe.project_type = project_type;
    universe.collaboration_policy = collaboration_policy;
    universe.metadata_hash = metadata_hash;
    universe.created_at = now;
    universe.updated_at = now;

    emit!(UniverseCreated {
        universe: universe_key,
        owner: owner_key,
        index: universe_index,
    });

    Ok(())
}

pub fn update_universe(
    ctx: Context<UpdateUniverse>,
    metadata_hash: String,
    open: bool,
    collaboration_policy: CollaborationPolicy,
) -> Result<()> {
    validate_hash(&metadata_hash)?;

    let universe = &mut ctx.accounts.universe;
    universe.metadata_hash = metadata_hash;
    universe.open = open;
    universe.collaboration_policy = collaboration_policy;
    universe.updated_at = Clock::get()?.unix_timestamp;

    emit!(UniverseUpdated {
        universe: universe.key(),
        open,
    });

    Ok(())
}

pub fn close_universe(_ctx: Context<CloseUniverse>) -> Result<()> {
    Ok(())
}

pub fn create_asset(
    ctx: Context<CreateAsset>,
    asset_index: u64,
    kind: AssetKind,
    subtype: AssetSubtype,
    metadata_hash: String,
    preview_hash: String,
) -> Result<()> {
    validate_hash(&metadata_hash)?;
    validate_optional_hash(&preview_hash)?;

    let universe = &mut ctx.accounts.universe;
    require!(
        universe.open || universe.owner == ctx.accounts.creator.key(),
        StellarError::UniverseClosed
    );
    require!(
        universe.status == UniverseStatus::Active,
        StellarError::UniverseNotActive
    );
    require!(
        asset_index == universe.asset_count,
        StellarError::InvalidAssetIndex
    );

    let now = Clock::get()?.unix_timestamp;
    let universe_key = universe.key();
    let creator_key = ctx.accounts.creator.key();
    let asset_key = ctx.accounts.asset.key();
    let asset = &mut ctx.accounts.asset;

    asset.universe = universe_key;
    asset.index = asset_index;
    asset.creator = creator_key;
    asset.rent_payer = creator_key;
    asset.bump = ctx.bumps.asset;
    asset.kind = kind;
    asset.subtype = subtype;
    asset.status = AssetStatus::Draft;
    asset.metadata_hash = metadata_hash;
    asset.preview_hash = preview_hash;
    asset.created_at = now;
    asset.updated_at = now;
    asset.parent_count = 0;

    universe.asset_count = universe
        .asset_count
        .checked_add(1)
        .ok_or(StellarError::NumericalOverflow)?;
    universe.updated_at = now;

    emit!(AssetCreated {
        universe: universe_key,
        asset: asset_key,
        creator: creator_key,
        index: asset_index,
    });

    Ok(())
}

pub fn update_asset_metadata(
    ctx: Context<UpdateAssetMetadata>,
    metadata_hash: String,
    preview_hash: String,
) -> Result<()> {
    validate_hash(&metadata_hash)?;
    validate_optional_hash(&preview_hash)?;

    let asset = &mut ctx.accounts.asset;
    require!(
        asset.status == AssetStatus::Draft,
        StellarError::AssetLocked
    );

    asset.metadata_hash = metadata_hash;
    asset.preview_hash = preview_hash;
    asset.updated_at = Clock::get()?.unix_timestamp;

    Ok(())
}

pub fn add_asset_parent(ctx: Context<AddAssetParent>) -> Result<()> {
    let child = &mut ctx.accounts.child_asset;
    let parent = &ctx.accounts.parent_asset;

    require!(
        child.status == AssetStatus::Draft,
        StellarError::AssetLocked
    );
    require_keys_eq!(
        child.universe,
        parent.universe,
        StellarError::UniverseMismatch
    );
    require!(
        child.key() != parent.key(),
        StellarError::InvalidLineageLink
    );

    let child_key = child.key();
    let parent_key = parent.key();
    let link = &mut ctx.accounts.asset_parent;
    link.child_asset = child_key;
    link.parent_asset = parent_key;
    link.bump = ctx.bumps.asset_parent;

    child.parent_count = child
        .parent_count
        .checked_add(1)
        .ok_or(StellarError::NumericalOverflow)?;
    child.updated_at = Clock::get()?.unix_timestamp;

    emit!(AssetParentAdded {
        child_asset: child_key,
        parent_asset: parent_key,
    });

    Ok(())
}

pub fn submit_asset(ctx: Context<SubmitAsset>) -> Result<()> {
    let asset = &mut ctx.accounts.asset;
    require!(
        asset.status == AssetStatus::Draft,
        StellarError::AssetLocked
    );
    asset.status = AssetStatus::Submitted;
    asset.updated_at = Clock::get()?.unix_timestamp;

    emit!(AssetStatusChanged {
        asset: asset.key(),
        status: AssetStatus::Submitted,
    });

    Ok(())
}

pub fn approve_asset(ctx: Context<ReviewAsset>) -> Result<()> {
    let asset = &mut ctx.accounts.asset;
    require!(
        asset.status == AssetStatus::Submitted,
        StellarError::InvalidAssetStatus
    );
    asset.status = AssetStatus::Approved;
    asset.updated_at = Clock::get()?.unix_timestamp;

    emit!(AssetStatusChanged {
        asset: asset.key(),
        status: AssetStatus::Approved,
    });

    Ok(())
}

pub fn reject_asset(ctx: Context<ReviewAsset>) -> Result<()> {
    let asset = &mut ctx.accounts.asset;
    require!(
        asset.status == AssetStatus::Submitted,
        StellarError::InvalidAssetStatus
    );
    asset.status = AssetStatus::Rejected;
    asset.updated_at = Clock::get()?.unix_timestamp;

    emit!(AssetStatusChanged {
        asset: asset.key(),
        status: AssetStatus::Rejected,
    });

    Ok(())
}

pub fn close_asset(ctx: Context<CloseAsset>) -> Result<()> {
    let asset = &ctx.accounts.asset;
    let authority = ctx.accounts.authority.key();

    match asset.status {
        AssetStatus::Draft => {
            require!(authority == asset.creator, StellarError::Unauthorized);
        }
        AssetStatus::Rejected => {
            require!(
                authority == asset.creator || authority == ctx.accounts.universe.owner,
                StellarError::Unauthorized
            );
        }
        _ => return err!(StellarError::AssetLocked),
    }

    Ok(())
}

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
