use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("3rVXfq7LLSLqbDzvZuSrQoMytwczLj2Q8Hue62rxPZAA");

const UNIVERSE_SEED: &[u8] = b"universe";
const ASSET_SEED: &[u8] = b"asset";
const LINK_SEED: &[u8] = b"link";
const RELEASE_SEED: &[u8] = b"release";
const VAULT_SEED: &[u8] = b"release_vault";
const SHARE_SEED: &[u8] = b"share";

const MAX_HASH_LEN: usize = 96;
const BPS_DENOMINATOR: u16 = 10_000;

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
        validate_hash(&metadata_hash)?;

        let now = Clock::get()?.unix_timestamp;
        let universe = &mut ctx.accounts.universe;
        universe.owner = ctx.accounts.owner.key();
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
        let asset = &mut ctx.accounts.asset;
        asset.universe = universe.key();
        asset.index = asset_index;
        asset.creator = ctx.accounts.creator.key();
        asset.rent_payer = ctx.accounts.creator.key();
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

        let link = &mut ctx.accounts.asset_parent;
        link.child_asset = child.key();
        link.parent_asset = parent.key();
        link.bump = ctx.bumps.asset_parent;

        child.parent_count = child
            .parent_count
            .checked_add(1)
            .ok_or(StellarError::NumericalOverflow)?;
        child.updated_at = Clock::get()?.unix_timestamp;

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
        let release = &mut ctx.accounts.release;
        release.universe = universe.key();
        release.asset = asset.key();
        release.vault = ctx.accounts.vault.key();
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
        vault.release = release.key();
        vault.bump = ctx.bumps.vault;

        universe.release_count = universe
            .release_count
            .checked_add(1)
            .ok_or(StellarError::NumericalOverflow)?;
        universe.updated_at = now;

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

        let share = &mut ctx.accounts.share;
        share.release = release.key();
        share.contributor = ctx.accounts.contributor.key();
        share.bps = bps;
        share.claimed_lamports = 0;
        share.bump = ctx.bumps.share;

        release.total_share_bps = new_total;

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
        let cpi_context =
            CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);
        transfer(cpi_context, amount)?;

        let release = &mut ctx.accounts.release;
        release.total_deposited_lamports = release
            .total_deposited_lamports
            .checked_add(amount)
            .ok_or(StellarError::NumericalOverflow)?;

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

        Ok(())
    }
}

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

#[account]
pub struct Universe {
    pub owner: Pubkey,
    pub index: u64,
    pub bump: u8,
    pub asset_count: u64,
    pub release_count: u64,
    pub open: bool,
    pub status: UniverseStatus,
    pub project_type: AssetKind,
    pub collaboration_policy: CollaborationPolicy,
    pub metadata_hash: String,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Universe {
    pub const INIT_SPACE: usize = 32 + 8 + 1 + 8 + 8 + 1 + 1 + 1 + 1 + (4 + MAX_HASH_LEN) + 8 + 8;
}

#[account]
pub struct Asset {
    pub universe: Pubkey,
    pub index: u64,
    pub creator: Pubkey,
    pub rent_payer: Pubkey,
    pub bump: u8,
    pub kind: AssetKind,
    pub subtype: AssetSubtype,
    pub status: AssetStatus,
    pub metadata_hash: String,
    pub preview_hash: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub parent_count: u16,
}

impl Asset {
    pub const INIT_SPACE: usize =
        32 + 8 + 32 + 32 + 1 + 1 + 1 + 1 + (4 + MAX_HASH_LEN) + (4 + MAX_HASH_LEN) + 8 + 8 + 2;
}

#[account]
pub struct AssetParent {
    pub child_asset: Pubkey,
    pub parent_asset: Pubkey,
    pub bump: u8,
}

impl AssetParent {
    pub const INIT_SPACE: usize = 32 + 32 + 1;
}

#[account]
pub struct Release {
    pub universe: Pubkey,
    pub asset: Pubkey,
    pub vault: Pubkey,
    pub index: u64,
    pub authority: Pubkey,
    pub status: ReleaseStatus,
    pub metadata_hash: String,
    pub total_share_bps: u16,
    pub total_deposited_lamports: u64,
    pub bump: u8,
    pub created_at: i64,
    pub finalized_at: i64,
    pub linked_avatar_data: Pubkey,
}

impl Release {
    pub const INIT_SPACE: usize =
        32 + 32 + 32 + 8 + 32 + 1 + (4 + MAX_HASH_LEN) + 2 + 8 + 1 + 8 + 8 + 32;

    pub fn accepts_revenue(&self) -> bool {
        self.status == ReleaseStatus::Finalized || self.status == ReleaseStatus::Linked
    }
}

#[account]
pub struct ReleaseVault {
    pub release: Pubkey,
    pub bump: u8,
}

impl ReleaseVault {
    pub const INIT_SPACE: usize = 32 + 1;
}

#[account]
pub struct ContributorShare {
    pub release: Pubkey,
    pub contributor: Pubkey,
    pub bps: u16,
    pub claimed_lamports: u64,
    pub bump: u8,
}

impl ContributorShare {
    pub const INIT_SPACE: usize = 32 + 32 + 2 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum UniverseStatus {
    Active,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum CollaborationPolicy {
    Equal,
    Weighted,
    Custom,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum AssetKind {
    Image,
    Model3d,
    Animation,
    Audio,
    Script,
    Metadata,
    Other,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum AssetSubtype {
    Concept,
    Sketch,
    Texture,
    Mesh,
    Rig,
    Motion,
    Preview,
    Final,
    Other,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum AssetStatus {
    Draft,
    Submitted,
    Approved,
    Rejected,
    Finalized,
    Minted,
    Archived,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ReleaseStatus {
    Draft,
    Finalized,
    Linked,
    Archived,
}

fn validate_hash(hash: &str) -> Result<()> {
    require!(!hash.is_empty(), StellarError::InvalidHash);
    require!(hash.len() <= MAX_HASH_LEN, StellarError::InvalidHash);
    Ok(())
}

fn validate_optional_hash(hash: &str) -> Result<()> {
    require!(hash.len() <= MAX_HASH_LEN, StellarError::InvalidHash);
    Ok(())
}

#[error_code]
pub enum StellarError {
    #[msg("Unauthorized action.")]
    Unauthorized,
    #[msg("Universe is closed to public collaboration.")]
    UniverseClosed,
    #[msg("Universe is not active.")]
    UniverseNotActive,
    #[msg("Universe still has live assets or releases.")]
    UniverseNotEmpty,
    #[msg("Invalid metadata or content hash.")]
    InvalidHash,
    #[msg("Invalid asset index.")]
    InvalidAssetIndex,
    #[msg("Invalid release index.")]
    InvalidReleaseIndex,
    #[msg("Asset is locked for this operation.")]
    AssetLocked,
    #[msg("Invalid asset status for this operation.")]
    InvalidAssetStatus,
    #[msg("Universe mismatch.")]
    UniverseMismatch,
    #[msg("Asset mismatch.")]
    AssetMismatch,
    #[msg("Release mismatch.")]
    ReleaseMismatch,
    #[msg("Invalid lineage link.")]
    InvalidLineageLink,
    #[msg("Release is locked for this operation.")]
    ReleaseLocked,
    #[msg("Release is not finalized.")]
    ReleaseNotFinalized,
    #[msg("Invalid contributor share basis points.")]
    InvalidShareBps,
    #[msg("Invalid revenue amount.")]
    InvalidRevenueAmount,
    #[msg("No revenue available to claim.")]
    NoRevenueToClaim,
    #[msg("Release vault balance is insufficient.")]
    InsufficientVaultBalance,
    #[msg("Numerical overflow occurred.")]
    NumericalOverflow,
}
