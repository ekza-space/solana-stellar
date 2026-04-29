use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};

use crate::{
    constants::{BPS_DENOMINATOR, SHARE_SEED},
    contexts::{
        AddReleaseShare, CreateRelease, FinalizeLineageEqualRelease, FinalizeRelease,
        LinkAvatarData,
    },
    error::StellarError,
    events::{
        AssetStatusChanged, AvatarDataLinked, ReleaseCreated, ReleaseDistributionModelSet,
        ReleaseShareAdded, ReleaseStatusChanged,
    },
    state::{
        Asset, AssetParent, AssetStatus, CollaborationPolicy, ContributorShare, ReleaseStatus,
    },
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
    release.distribution_model = universe.collaboration_policy;
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

pub fn finalize_lineage_equal_release<'info>(
    ctx: Context<'_, '_, 'info, 'info, FinalizeLineageEqualRelease<'info>>,
    asset_count: u16,
    link_count: u16,
) -> Result<()> {
    let release = &mut ctx.accounts.release;
    let asset = &mut ctx.accounts.asset;

    require!(
        release.status == ReleaseStatus::Draft,
        StellarError::ReleaseLocked
    );
    require!(
        asset.status == AssetStatus::Approved,
        StellarError::InvalidAssetStatus
    );
    require!(asset_count > 0, StellarError::InvalidLineageProof);

    let remaining = ctx.remaining_accounts;
    let asset_count = asset_count as usize;
    let link_count = link_count as usize;
    require!(
        remaining.len() >= asset_count + link_count,
        StellarError::InvalidLineageProof
    );

    let universe_key = ctx.accounts.universe.key();
    let release_key = release.key();
    let final_asset_key = asset.key();

    let mut lineage_assets: Vec<(Pubkey, Pubkey, u16)> = Vec::with_capacity(asset_count);
    for account_info in remaining.iter().take(asset_count) {
        let account = Account::<Asset>::try_from(account_info)?;
        require!(
            account.universe == universe_key,
            StellarError::UniverseMismatch
        );
        require!(
            account.status == AssetStatus::Approved
                || account.status == AssetStatus::Finalized
                || account.status == AssetStatus::Minted,
            StellarError::InvalidAssetStatus
        );
        require!(
            !lineage_assets
                .iter()
                .any(|(asset_key, _, _)| *asset_key == account.key()),
            StellarError::InvalidLineageProof
        );
        lineage_assets.push((account.key(), account.creator, account.parent_count));
    }

    require!(
        lineage_assets
            .iter()
            .any(|(asset_key, _, _)| *asset_key == final_asset_key),
        StellarError::InvalidLineageProof
    );

    let asset_keys: Vec<Pubkey> = lineage_assets
        .iter()
        .map(|(asset_key, _, _)| *asset_key)
        .collect();
    let mut lineage_links: Vec<(Pubkey, Pubkey)> = Vec::with_capacity(link_count);
    for account_info in remaining.iter().skip(asset_count).take(link_count) {
        let account = Account::<AssetParent>::try_from(account_info)?;
        require!(
            asset_keys.contains(&account.child_asset) && asset_keys.contains(&account.parent_asset),
            StellarError::InvalidLineageLink
        );
        lineage_links.push((account.child_asset, account.parent_asset));
    }

    let mut reachable = vec![final_asset_key];
    let mut changed = true;
    while changed {
        changed = false;
        for (child_asset, parent_asset) in &lineage_links {
            if reachable.contains(child_asset) && !reachable.contains(parent_asset) {
                reachable.push(*parent_asset);
                changed = true;
            }
        }
    }

    require!(
        asset_keys
            .iter()
            .all(|asset_key| reachable.contains(asset_key)),
        StellarError::InvalidLineageProof
    );
    for (asset_key, _, parent_count) in &lineage_assets {
        let provided_parent_count = lineage_links
            .iter()
            .filter(|(child_asset, _)| child_asset == asset_key)
            .count();
        require!(
            provided_parent_count == *parent_count as usize,
            StellarError::InvalidLineageProof
        );
    }

    let mut contributors: Vec<Pubkey> = lineage_assets
        .iter()
        .map(|(_, creator, _)| *creator)
        .collect();
    contributors.sort();
    contributors.dedup();
    require!(
        !contributors.is_empty() && contributors.len() <= BPS_DENOMINATOR as usize,
        StellarError::InvalidContributorCount
    );

    let share_accounts_start = asset_count + link_count;
    require!(
        remaining.len() == share_accounts_start + contributors.len(),
        StellarError::InvalidContributorCount
    );

    let base_bps = BPS_DENOMINATOR / contributors.len() as u16;
    let remainder = BPS_DENOMINATOR % contributors.len() as u16;
    let rent = Rent::get()?;
    let share_space = 8 + ContributorShare::INIT_SPACE;
    let share_lamports = rent.minimum_balance(share_space);

    for (idx, contributor) in contributors.iter().enumerate() {
        let share_info = &remaining[share_accounts_start + idx];
        let (expected_share, bump) = Pubkey::find_program_address(
            &[SHARE_SEED, release_key.as_ref(), contributor.as_ref()],
            ctx.program_id,
        );
        require_keys_eq!(
            share_info.key(),
            expected_share,
            StellarError::InvalidLineageProof
        );
        require!(
            share_info.lamports() == 0,
            StellarError::InvalidLineageProof
        );

        let signer_seeds: &[&[u8]] = &[
            SHARE_SEED,
            release_key.as_ref(),
            contributor.as_ref(),
            &[bump],
        ];
        let create_ix = system_instruction::create_account(
            &ctx.accounts.owner.key(),
            &expected_share,
            share_lamports,
            share_space as u64,
            ctx.program_id,
        );
        invoke_signed(
            &create_ix,
            &[
                ctx.accounts.owner.to_account_info(),
                share_info.clone(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[signer_seeds],
        )?;

        let bps = base_bps + u16::from((idx as u16) < remainder);
        let share = ContributorShare {
            release: release_key,
            contributor: *contributor,
            bps,
            claimed_lamports: 0,
            bump,
        };
        let mut data = share_info.try_borrow_mut_data()?;
        let mut data_slice: &mut [u8] = &mut data;
        share.try_serialize(&mut data_slice)?;

        emit!(ReleaseShareAdded {
            release: release_key,
            contributor: *contributor,
            bps,
        });
    }

    let now = Clock::get()?.unix_timestamp;
    release.status = ReleaseStatus::Finalized;
    release.distribution_model = CollaborationPolicy::LineageEqual;
    release.total_share_bps = BPS_DENOMINATOR;
    release.finalized_at = now;
    asset.status = AssetStatus::Finalized;
    asset.updated_at = now;

    emit!(ReleaseDistributionModelSet {
        release: release_key,
        distribution_model: CollaborationPolicy::LineageEqual,
        contributor_count: contributors.len() as u16,
    });
    emit!(ReleaseStatusChanged {
        release: release_key,
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
