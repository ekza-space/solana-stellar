use anchor_lang::prelude::*;

use crate::{constants::MAX_HASH_LEN, error::StellarError};

pub fn validate_hash(hash: &str) -> Result<()> {
    require!(!hash.is_empty(), StellarError::InvalidHash);
    require!(hash.len() <= MAX_HASH_LEN, StellarError::InvalidHash);
    Ok(())
}

pub fn validate_optional_hash(hash: &str) -> Result<()> {
    require!(hash.len() <= MAX_HASH_LEN, StellarError::InvalidHash);
    Ok(())
}
