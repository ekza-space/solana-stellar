import { PublicKey } from "@solana/web3.js";

import { PROGRAM_ID } from "./client";
import { asciiSeed, toLeBytes } from "./utils";

export const STELLAR_SEEDS = {
  registry: "registry",
  universe: "universe",
  universeIndex: "universe_index",
  asset: "asset",
  link: "link",
  release: "release",
  releaseVault: "release_vault",
  share: "share",
} as const;

export function deriveRegistry() {
  return PublicKey.findProgramAddressSync(
    [asciiSeed(STELLAR_SEEDS.registry)],
    PROGRAM_ID
  )[0];
}

export function deriveUniverse(owner: PublicKey, index: number) {
  return PublicKey.findProgramAddressSync(
    [asciiSeed(STELLAR_SEEDS.universe), owner.toBuffer(), toLeBytes(index)],
    PROGRAM_ID
  )[0];
}

export function deriveUniverseIndex(globalIndex: number) {
  return PublicKey.findProgramAddressSync(
    [asciiSeed(STELLAR_SEEDS.universeIndex), toLeBytes(globalIndex)],
    PROGRAM_ID
  )[0];
}

export function deriveAsset(universe: PublicKey, index: number) {
  return PublicKey.findProgramAddressSync(
    [asciiSeed(STELLAR_SEEDS.asset), universe.toBuffer(), toLeBytes(index)],
    PROGRAM_ID
  )[0];
}

export function deriveAssetParent(child: PublicKey, parent: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [asciiSeed(STELLAR_SEEDS.link), child.toBuffer(), parent.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function deriveRelease(universe: PublicKey, index: number) {
  return PublicKey.findProgramAddressSync(
    [asciiSeed(STELLAR_SEEDS.release), universe.toBuffer(), toLeBytes(index)],
    PROGRAM_ID
  )[0];
}

export function deriveVault(release: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [asciiSeed(STELLAR_SEEDS.releaseVault), release.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function deriveShare(release: PublicKey, contributor: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      asciiSeed(STELLAR_SEEDS.share),
      release.toBuffer(),
      contributor.toBuffer(),
    ],
    PROGRAM_ID
  )[0];
}
