use anchor_lang::prelude::*;

use crate::{
    contexts::{CloseUniverse, CreateUniverse, UpdateUniverse},
    error::StellarError,
    events::{UniverseCreated, UniverseUpdated},
    state::{AssetKind, CollaborationPolicy, UniverseStatus},
    utils::validate_hash,
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
    let registry = &mut ctx.accounts.registry;
    let global_index = registry.universe_count;
    let universe_key = ctx.accounts.universe.key();
    let owner_key = ctx.accounts.owner.key();
    let universe = &mut ctx.accounts.universe;
    let universe_lookup = &mut ctx.accounts.universe_lookup;

    universe.owner = owner_key;
    universe.index = universe_index;
    universe.global_index = global_index;
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

    registry.bump = ctx.bumps.registry;
    registry.universe_count = registry
        .universe_count
        .checked_add(1)
        .ok_or(StellarError::NumericalOverflow)?;

    universe_lookup.global_index = global_index;
    universe_lookup.universe = universe_key;
    universe_lookup.owner = owner_key;
    universe_lookup.owner_index = universe_index;
    universe_lookup.bump = ctx.bumps.universe_lookup;

    emit!(UniverseCreated {
        universe: universe_key,
        owner: owner_key,
        index: universe_index,
        global_index,
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
    require!(
        universe.collaboration_policy == collaboration_policy,
        StellarError::ImmutableCollaborationPolicy
    );
    universe.metadata_hash = metadata_hash;
    universe.open = open;
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
