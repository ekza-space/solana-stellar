use anchor_lang::prelude::*;

declare_id!("3rVXfq7LLSLqbDzvZuSrQoMytwczLj2Q8Hue62rxPZAA");

#[program]
pub mod solana_stellar {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
