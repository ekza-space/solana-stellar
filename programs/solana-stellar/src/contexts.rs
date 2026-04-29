use anchor_lang::prelude::*;

use crate::{
    constants::{ASSET_SEED, LINK_SEED, RELEASE_SEED, SHARE_SEED, UNIVERSE_SEED, VAULT_SEED},
    error::StellarError,
    state::{Asset, AssetParent, AssetStatus, ContributorShare, Release, ReleaseVault, Universe},
};

#[derive(Accounts)]
#[instruction(universe_index: u64)]
pub struct CreateUniverse<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Universe::INIT_SPACE,
        seeds = [
            UNIVERSE_SEED,
            owner.key().as_ref(),
            &universe_index.to_le_bytes()
        ],
        bump
    )]
    pub universe: Account<'info, Universe>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateUniverse<'info> {
    #[account(mut, has_one = owner @ StellarError::Unauthorized)]
    pub universe: Account<'info, Universe>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseUniverse<'info> {
    #[account(
        mut,
        close = owner,
        has_one = owner @ StellarError::Unauthorized,
        constraint = universe.asset_count == 0 @ StellarError::UniverseNotEmpty,
        constraint = universe.release_count == 0 @ StellarError::UniverseNotEmpty
    )]
    pub universe: Account<'info, Universe>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(asset_index: u64)]
pub struct CreateAsset<'info> {
    #[account(mut)]
    pub universe: Account<'info, Universe>,
    #[account(
        init,
        payer = creator,
        space = 8 + Asset::INIT_SPACE,
        seeds = [
            ASSET_SEED,
            universe.key().as_ref(),
            &asset_index.to_le_bytes()
        ],
        bump
    )]
    pub asset: Account<'info, Asset>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAssetMetadata<'info> {
    #[account(
        mut,
        has_one = creator @ StellarError::Unauthorized
    )]
    pub asset: Account<'info, Asset>,
    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct AddAssetParent<'info> {
    #[account(
        mut,
        has_one = creator @ StellarError::Unauthorized
    )]
    pub child_asset: Account<'info, Asset>,
    pub parent_asset: Account<'info, Asset>,
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + AssetParent::INIT_SPACE,
        seeds = [
            LINK_SEED,
            child_asset.key().as_ref(),
            parent_asset.key().as_ref()
        ],
        bump
    )]
    pub asset_parent: Account<'info, AssetParent>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitAsset<'info> {
    #[account(
        mut,
        has_one = creator @ StellarError::Unauthorized
    )]
    pub asset: Account<'info, Asset>,
    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct ReviewAsset<'info> {
    #[account(has_one = owner @ StellarError::Unauthorized)]
    pub universe: Account<'info, Universe>,
    #[account(
        mut,
        constraint = asset.universe == universe.key() @ StellarError::UniverseMismatch
    )]
    pub asset: Account<'info, Asset>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseAsset<'info> {
    #[account(
        constraint = asset.universe == universe.key() @ StellarError::UniverseMismatch
    )]
    pub universe: Account<'info, Universe>,
    #[account(
        mut,
        close = rent_receiver,
        constraint = asset.status == AssetStatus::Draft || asset.status == AssetStatus::Rejected @ StellarError::AssetLocked
    )]
    pub asset: Account<'info, Asset>,
    pub authority: Signer<'info>,
    /// CHECK: Receives rent back when a draft or rejected asset is closed.
    #[account(mut, address = asset.rent_payer @ StellarError::Unauthorized)]
    pub rent_receiver: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(release_index: u64)]
pub struct CreateRelease<'info> {
    #[account(
        mut,
        has_one = owner @ StellarError::Unauthorized
    )]
    pub universe: Account<'info, Universe>,
    #[account(
        constraint = asset.universe == universe.key() @ StellarError::UniverseMismatch
    )]
    pub asset: Account<'info, Asset>,
    #[account(
        init,
        payer = owner,
        space = 8 + Release::INIT_SPACE,
        seeds = [
            RELEASE_SEED,
            universe.key().as_ref(),
            &release_index.to_le_bytes()
        ],
        bump
    )]
    pub release: Account<'info, Release>,
    #[account(
        init,
        payer = owner,
        space = 8 + ReleaseVault::INIT_SPACE,
        seeds = [
            VAULT_SEED,
            release.key().as_ref()
        ],
        bump
    )]
    pub vault: Account<'info, ReleaseVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddReleaseShare<'info> {
    #[account(has_one = owner @ StellarError::Unauthorized)]
    pub universe: Account<'info, Universe>,
    #[account(
        mut,
        constraint = release.universe == universe.key() @ StellarError::UniverseMismatch
    )]
    pub release: Account<'info, Release>,
    #[account(
        init,
        payer = owner,
        space = 8 + ContributorShare::INIT_SPACE,
        seeds = [
            SHARE_SEED,
            release.key().as_ref(),
            contributor.key().as_ref()
        ],
        bump
    )]
    pub share: Account<'info, ContributorShare>,
    /// CHECK: The contributor may be any wallet that will later claim revenue.
    pub contributor: AccountInfo<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeRelease<'info> {
    #[account(has_one = owner @ StellarError::Unauthorized)]
    pub universe: Account<'info, Universe>,
    #[account(
        mut,
        constraint = release.universe == universe.key() @ StellarError::UniverseMismatch,
        constraint = release.asset == asset.key() @ StellarError::AssetMismatch
    )]
    pub release: Account<'info, Release>,
    #[account(mut)]
    pub asset: Account<'info, Asset>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct LinkAvatarData<'info> {
    #[account(has_one = owner @ StellarError::Unauthorized)]
    pub universe: Account<'info, Universe>,
    #[account(
        mut,
        constraint = release.universe == universe.key() @ StellarError::UniverseMismatch
    )]
    pub release: Account<'info, Release>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct DepositRevenue<'info> {
    #[account(mut)]
    pub release: Account<'info, Release>,
    #[account(
        mut,
        seeds = [
            VAULT_SEED,
            release.key().as_ref()
        ],
        bump = vault.bump,
        constraint = vault.release == release.key() @ StellarError::ReleaseMismatch
    )]
    pub vault: Account<'info, ReleaseVault>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRevenue<'info> {
    pub release: Account<'info, Release>,
    #[account(
        mut,
        seeds = [
            VAULT_SEED,
            release.key().as_ref()
        ],
        bump = vault.bump,
        constraint = vault.release == release.key() @ StellarError::ReleaseMismatch
    )]
    pub vault: Account<'info, ReleaseVault>,
    #[account(
        mut,
        seeds = [
            SHARE_SEED,
            release.key().as_ref(),
            contributor.key().as_ref()
        ],
        bump = share.bump,
        constraint = share.release == release.key() @ StellarError::ReleaseMismatch,
        constraint = share.contributor == contributor.key() @ StellarError::Unauthorized
    )]
    pub share: Account<'info, ContributorShare>,
    #[account(mut)]
    pub contributor: Signer<'info>,
}
