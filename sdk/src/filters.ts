import type { PublicKey } from "@solana/web3.js";

export type ProgramAccountFilter = {
  memcmp: {
    offset: number;
    bytes: string;
  };
};

export const ACCOUNT_DISCRIMINATOR_SIZE = 8;

export const ASSET_OFFSETS = {
  universe: ACCOUNT_DISCRIMINATOR_SIZE,
  creator: ACCOUNT_DISCRIMINATOR_SIZE + 32 + 8,
} as const;

export const ASSET_PARENT_OFFSETS = {
  childAsset: ACCOUNT_DISCRIMINATOR_SIZE,
  parentAsset: ACCOUNT_DISCRIMINATOR_SIZE + 32,
} as const;

export const CONTRIBUTOR_SHARE_OFFSETS = {
  release: ACCOUNT_DISCRIMINATOR_SIZE,
} as const;

export const RELEASE_OFFSETS = {
  universe: ACCOUNT_DISCRIMINATOR_SIZE,
  asset: ACCOUNT_DISCRIMINATOR_SIZE + 32,
} as const;

export function publicKeyMemcmp(
  offset: number,
  publicKey: PublicKey
): ProgramAccountFilter {
  return {
    memcmp: {
      offset,
      bytes: publicKey.toBase58(),
    },
  };
}
