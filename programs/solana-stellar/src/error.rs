use anchor_lang::prelude::*;

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
