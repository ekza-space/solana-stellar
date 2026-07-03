import * as anchor from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import { SystemProgram } from "@solana/web3.js";
import { Buffer } from "buffer";

import idl from "./solana_arena_registry.json";
import {
  deriveReleaseDeployment,
  PROGRAM_ID as STELLAR_PROGRAM_ID,
  RELEASE_DEPLOYMENT_PROJECT_ARENA,
} from "./stellar";

export const ARENA_REGISTRY_PROGRAM_ID = new anchor.web3.PublicKey(idl.address);

const ARENA_ASSET_PDA_SEED = "arena_asset_v1";
const REGISTRY_PDA_SEED = "arena_registry";
const STELLAR_LINK_PDA_SEED = "stellar_arena_link";
const STELLAR_RELEASE_LINK_PDA_SEED = "stellar_release_link";

type ArenaEnum<T extends string> = Record<T, Record<string, never>>;

export type ArenaCardKind = "avatar" | "modifier";

/** Skin-only bridge args (`RegisterArenaAssetFromStellarArgs`): a Stellar
 * publish carries zero balance — stats/rarity/element are rolled later by
 * the Arena mint, so only cosmetic/identity fields cross the bridge. */
export type RegisterArenaAssetFromStellarArgs = {
  metadataIpfsHash: string;
  cardKind: ArenaEnum<ArenaCardKind>;
  archetypeId: string;
  slotMask: number;
  skillIds: string[];
};

export function arenaEnum<T extends string>(value: T): ArenaEnum<T> {
  return { [value]: {} } as ArenaEnum<T>;
}

function toLeBytes(value: number) {
  return new anchor.BN(value).toArrayLike(Buffer, "le", 8);
}

export function createArenaRegistryProgram(provider: anchor.AnchorProvider) {
  return new anchor.Program(idl as anchor.Idl, provider);
}

export function deriveArenaRegistry() {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(REGISTRY_PDA_SEED)],
    ARENA_REGISTRY_PROGRAM_ID
  )[0];
}

export function deriveArenaAssetData(index: number) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(ARENA_ASSET_PDA_SEED), toLeBytes(index)],
    ARENA_REGISTRY_PROGRAM_ID
  )[0];
}

export function deriveArenaStellarLink(arenaAsset: PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(STELLAR_LINK_PDA_SEED), arenaAsset.toBuffer()],
    ARENA_REGISTRY_PROGRAM_ID
  )[0];
}

export function deriveArenaReleaseLink(stellarRelease: PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(STELLAR_RELEASE_LINK_PDA_SEED), stellarRelease.toBuffer()],
    ARENA_REGISTRY_PROGRAM_ID
  )[0];
}

export async function nextArenaAssetIndex(
  program: anchor.Program
): Promise<number> {
  try {
    const registry = await (program.account as any).arenaRegistry.fetch(
      deriveArenaRegistry()
    );
    const nextIndex =
      (registry as any).nextIndex ?? (registry as any).next_index;
    return nextIndex?.toNumber?.() ?? Number(nextIndex ?? 0);
  } catch {
    return 0;
  }
}

export async function publishArenaAssetFromStellar(args: {
  provider: anchor.AnchorProvider;
  universe: PublicKey;
  release: PublicKey;
  vault: PublicKey;
  asset: RegisterArenaAssetFromStellarArgs;
}) {
  const program = createArenaRegistryProgram(args.provider);
  const arenaAssetIndex = await nextArenaAssetIndex(program);
  const registry = deriveArenaRegistry();
  const arenaAsset = deriveArenaAssetData(arenaAssetIndex);
  const stellarLink = deriveArenaStellarLink(arenaAsset);
  const stellarReleaseLink = deriveArenaReleaseLink(args.release);
  const stellarReleaseDeployment = deriveReleaseDeployment(
    args.release,
    RELEASE_DEPLOYMENT_PROJECT_ARENA
  );

  const signature = await program.methods
    .registerArenaAssetFromStellar(args.asset)
    .accountsStrict({
      registry,
      arenaAsset,
      payer: args.provider.publicKey!,
      stellarLink,
      stellarProgram: STELLAR_PROGRAM_ID,
      stellarUniverse: args.universe,
      stellarRelease: args.release,
      stellarVault: args.vault,
      stellarReleaseDeployment,
      stellarReleaseLink,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return {
    signature,
    arenaAssetIndex,
    registry,
    arenaAsset,
    stellarLink,
    stellarReleaseLink,
    stellarReleaseDeployment,
  };
}
