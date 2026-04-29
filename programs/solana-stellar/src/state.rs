use anchor_lang::prelude::*;

use crate::constants::MAX_HASH_LEN;

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
