use anchor_lang::prelude::*;

pub mod constants;
pub mod contexts;
pub mod error;
pub mod events;
pub mod handlers;
pub mod state;
pub mod utils;

pub use contexts::*;
pub use error::*;
pub use state::*;

declare_id!("3rVXfq7LLSLqbDzvZuSrQoMytwczLj2Q8Hue62rxPZAA");

#[program]
pub mod solana_stellar {
    use super::*;

    pub fn create_universe(
        ctx: Context<CreateUniverse>,
        universe_index: u64,
        metadata_hash: String,
        project_type: AssetKind,
        collaboration_policy: CollaborationPolicy,
        open: bool,
    ) -> Result<()> {
        handlers::create_universe(
            ctx,
            universe_index,
            metadata_hash,
            project_type,
            collaboration_policy,
            open,
        )
    }

    pub fn update_universe(
        ctx: Context<UpdateUniverse>,
        metadata_hash: String,
        open: bool,
        collaboration_policy: CollaborationPolicy,
    ) -> Result<()> {
        handlers::update_universe(ctx, metadata_hash, open, collaboration_policy)
    }

    pub fn close_universe(ctx: Context<CloseUniverse>) -> Result<()> {
        handlers::close_universe(ctx)
    }

    pub fn create_asset(
        ctx: Context<CreateAsset>,
        asset_index: u64,
        kind: AssetKind,
        subtype: AssetSubtype,
        metadata_hash: String,
        preview_hash: String,
    ) -> Result<()> {
        handlers::create_asset(ctx, asset_index, kind, subtype, metadata_hash, preview_hash)
    }

    pub fn update_asset_metadata(
        ctx: Context<UpdateAssetMetadata>,
        metadata_hash: String,
        preview_hash: String,
    ) -> Result<()> {
        handlers::update_asset_metadata(ctx, metadata_hash, preview_hash)
    }

    pub fn add_asset_parent(ctx: Context<AddAssetParent>) -> Result<()> {
        handlers::add_asset_parent(ctx)
    }

    pub fn submit_asset(ctx: Context<SubmitAsset>) -> Result<()> {
        handlers::submit_asset(ctx)
    }

    pub fn approve_asset(ctx: Context<ReviewAsset>) -> Result<()> {
        handlers::approve_asset(ctx)
    }

    pub fn reject_asset(ctx: Context<ReviewAsset>) -> Result<()> {
        handlers::reject_asset(ctx)
    }

    pub fn close_asset(ctx: Context<CloseAsset>) -> Result<()> {
        handlers::close_asset(ctx)
    }

    pub fn create_release(
        ctx: Context<CreateRelease>,
        release_index: u64,
        metadata_hash: String,
    ) -> Result<()> {
        handlers::create_release(ctx, release_index, metadata_hash)
    }

    pub fn add_release_share(ctx: Context<AddReleaseShare>, bps: u16) -> Result<()> {
        handlers::add_release_share(ctx, bps)
    }

    pub fn finalize_release(ctx: Context<FinalizeRelease>) -> Result<()> {
        handlers::finalize_release(ctx)
    }

    pub fn link_avatar_data(ctx: Context<LinkAvatarData>, avatar_data: Pubkey) -> Result<()> {
        handlers::link_avatar_data(ctx, avatar_data)
    }

    pub fn deposit_revenue(ctx: Context<DepositRevenue>, amount: u64) -> Result<()> {
        handlers::deposit_revenue(ctx, amount)
    }

    pub fn claim_revenue(ctx: Context<ClaimRevenue>) -> Result<()> {
        handlers::claim_revenue(ctx)
    }
}
