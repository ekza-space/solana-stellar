use anchor_lang::prelude::*;

use crate::state::{AssetStatus, ReleaseStatus};

#[event]
pub struct UniverseCreated {
    pub universe: Pubkey,
    pub owner: Pubkey,
    pub index: u64,
}

#[event]
pub struct UniverseUpdated {
    pub universe: Pubkey,
    pub open: bool,
}

#[event]
pub struct AssetCreated {
    pub universe: Pubkey,
    pub asset: Pubkey,
    pub creator: Pubkey,
    pub index: u64,
}

#[event]
pub struct AssetParentAdded {
    pub child_asset: Pubkey,
    pub parent_asset: Pubkey,
}

#[event]
pub struct AssetStatusChanged {
    pub asset: Pubkey,
    pub status: AssetStatus,
}

#[event]
pub struct ReleaseCreated {
    pub universe: Pubkey,
    pub release: Pubkey,
    pub asset: Pubkey,
    pub vault: Pubkey,
    pub index: u64,
}

#[event]
pub struct ReleaseShareAdded {
    pub release: Pubkey,
    pub contributor: Pubkey,
    pub bps: u16,
}

#[event]
pub struct ReleaseStatusChanged {
    pub release: Pubkey,
    pub status: ReleaseStatus,
}

#[event]
pub struct AvatarDataLinked {
    pub release: Pubkey,
    pub avatar_data: Pubkey,
}

#[event]
pub struct RevenueDeposited {
    pub release: Pubkey,
    pub vault: Pubkey,
    pub payer: Pubkey,
    pub amount: u64,
}

#[event]
pub struct RevenueClaimed {
    pub release: Pubkey,
    pub contributor: Pubkey,
    pub amount: u64,
    pub total_claimed: u64,
}
