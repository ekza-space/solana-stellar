use anchor_lang::prelude::*;

pub mod handlers;

declare_id!("3rVXfq7LLSLqbDzvZuSrQoMytwczLj2Q8Hue62rxPZAA");

#[program]
pub mod solana_stellar {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        handlers::initialize(ctx)
    }
}

#[derive(Accounts)]
pub struct Initialize {}
