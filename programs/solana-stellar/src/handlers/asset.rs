use anchor_lang::prelude::*;

use crate::{
    contexts::{
        AddAssetParent, CloseAsset, CreateAsset, ReviewAsset, SubmitAsset, UpdateAssetMetadata,
    },
    error::StellarError,
    events::{AssetCreated, AssetParentAdded, AssetStatusChanged},
    state::{AssetKind, AssetStatus, AssetSubtype, UniverseStatus},
    utils::{validate_hash, validate_optional_hash},
};

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
