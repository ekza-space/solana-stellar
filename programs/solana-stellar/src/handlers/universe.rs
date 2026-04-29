use anchor_lang::prelude::*;

use crate::{
    contexts::{CloseUniverse, CreateUniverse, UpdateUniverse},
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
    let universe_key = ctx.accounts.universe.key();
    let owner_key = ctx.accounts.owner.key();
    let universe = &mut ctx.accounts.universe;

    universe.owner = owner_key;
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

    emit!(UniverseCreated {
        universe: universe_key,
        owner: owner_key,
        index: universe_index,
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
    universe.metadata_hash = metadata_hash;
    universe.open = open;
    universe.collaboration_policy = collaboration_policy;
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
