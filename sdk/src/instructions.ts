import * as anchor from "@coral-xyz/anchor";
import type { AccountMeta, PublicKey } from "@solana/web3.js";

import type { StellarClient } from "./client";
import { systemProgram } from "./client";
import {
  deriveAsset,
  deriveAssetParent,
  deriveRegistry,
  deriveRelease,
  deriveShare,
  deriveVault,
  deriveUniverse,
  deriveUniverseIndex,
} from "./pda";
import { toNumber } from "./utils";

type EnumArg = Record<string, Record<string, never>>;

export async function nextUniverseIndex(
  client: StellarClient,
  owner: PublicKey
) {
  const universes = await client.program.account.universe.all();
  const ownerUniverses = universes
    .map(({ account }) => account as any)
    .filter((universe) => universe.owner?.equals?.(owner));

  if (!ownerUniverses.length) return 0;
  return (
    Math.max(...ownerUniverses.map((universe) => toNumber(universe.index))) + 1
  );
}

export async function createUniverse(
  client: StellarClient,
  args: {
    owner: PublicKey;
    universeIndex: number;
    metadataHash: string;
    projectType: EnumArg;
    collaborationPolicy: EnumArg;
    open: boolean;
  }
) {
  const registry = deriveRegistry();
  const registryAccount = await client.connection.getAccountInfo(registry);
  const registryData = registryAccount
    ? ((await client.program.account.registry.fetch(registry)) as any)
    : null;
  const globalIndex = registryData ? toNumber(registryData.universeCount) : 0;
  const universe = deriveUniverse(args.owner, args.universeIndex);
  const universeLookup = deriveUniverseIndex(globalIndex);
  const signature = await client.program.methods
    .createUniverse(
      new anchor.BN(args.universeIndex),
      args.metadataHash,
      args.projectType as any,
      args.collaborationPolicy as any,
      args.open
    )
    .accountsStrict({
      registry,
      universe,
      universeLookup,
      owner: args.owner,
      systemProgram: systemProgram(),
    })
    .rpc();

  return { universe, universeLookup, globalIndex, signature };
}

export async function updateUniverse(
  client: StellarClient,
  args: {
    universe: PublicKey;
    owner: PublicKey;
    metadataHash: string;
    open: boolean;
    collaborationPolicy: EnumArg;
  }
) {
  const signature = await client.program.methods
    .updateUniverse(
      args.metadataHash,
      args.open,
      args.collaborationPolicy as any
    )
    .accountsStrict({
      universe: args.universe,
      owner: args.owner,
    })
    .rpc();

  return { signature };
}

export async function closeUniverse(
  client: StellarClient,
  args: { universe: PublicKey; owner: PublicKey }
) {
  const signature = await client.program.methods
    .closeUniverse()
    .accountsStrict({
      universe: args.universe,
      owner: args.owner,
    })
    .rpc();

  return { signature };
}

export async function createAsset(
  client: StellarClient,
  args: {
    universe: PublicKey;
    creator: PublicKey;
    assetIndex: number;
    kind: EnumArg;
    subtype: EnumArg;
    licenseKind: EnumArg;
    metadataHash: string;
    previewHash: string;
  }
) {
  const asset = deriveAsset(args.universe, args.assetIndex);
  const signature = await client.program.methods
    .createAsset(
      new anchor.BN(args.assetIndex),
      args.kind as any,
      args.subtype as any,
      args.licenseKind as any,
      args.metadataHash,
      args.previewHash
    )
    .accountsStrict({
      universe: args.universe,
      asset,
      creator: args.creator,
      systemProgram: systemProgram(),
    })
    .rpc();

  return { asset, signature };
}

export async function updateAssetMetadata(
  client: StellarClient,
  args: {
    asset: PublicKey;
    creator: PublicKey;
    licenseKind: EnumArg;
    metadataHash: string;
    previewHash: string;
  }
) {
  const signature = await client.program.methods
    .updateAssetMetadata(
      args.licenseKind as any,
      args.metadataHash,
      args.previewHash
    )
    .accountsStrict({ asset: args.asset, creator: args.creator })
    .rpc();

  return { signature };
}

export async function addAssetParent(
  client: StellarClient,
  args: {
    childAsset: PublicKey;
    parentAsset: PublicKey;
    creator: PublicKey;
  }
) {
  const assetParent = deriveAssetParent(args.childAsset, args.parentAsset);
  const signature = await client.program.methods
    .addAssetParent()
    .accountsStrict({
      childAsset: args.childAsset,
      parentAsset: args.parentAsset,
      creator: args.creator,
      assetParent,
      systemProgram: systemProgram(),
    })
    .rpc();

  return { assetParent, signature };
}

export async function submitAsset(
  client: StellarClient,
  args: { asset: PublicKey; creator: PublicKey }
) {
  const signature = await client.program.methods
    .submitAsset()
    .accountsStrict({ asset: args.asset, creator: args.creator })
    .rpc();

  return { signature };
}

export async function approveAsset(
  client: StellarClient,
  args: { universe: PublicKey; asset: PublicKey; owner: PublicKey }
) {
  const signature = await client.program.methods
    .approveAsset()
    .accountsStrict({
      universe: args.universe,
      asset: args.asset,
      owner: args.owner,
    })
    .rpc();

  return { signature };
}

export async function rejectAsset(
  client: StellarClient,
  args: { universe: PublicKey; asset: PublicKey; owner: PublicKey }
) {
  const signature = await client.program.methods
    .rejectAsset()
    .accountsStrict({
      universe: args.universe,
      asset: args.asset,
      owner: args.owner,
    })
    .rpc();

  return { signature };
}

export async function closeAsset(
  client: StellarClient,
  args: {
    universe: PublicKey;
    asset: PublicKey;
    authority: PublicKey;
    rentReceiver: PublicKey;
  }
) {
  const signature = await client.program.methods
    .closeAsset()
    .accountsStrict({
      universe: args.universe,
      asset: args.asset,
      authority: args.authority,
      rentReceiver: args.rentReceiver,
    })
    .rpc();

  return { signature };
}

export async function createRelease(
  client: StellarClient,
  args: {
    universe: PublicKey;
    asset: PublicKey;
    owner: PublicKey;
    releaseIndex: number;
    metadataHash: string;
  }
) {
  const release = deriveRelease(args.universe, args.releaseIndex);
  const vault = deriveVault(release);
  const signature = await client.program.methods
    .createRelease(new anchor.BN(args.releaseIndex), args.metadataHash)
    .accountsStrict({
      universe: args.universe,
      asset: args.asset,
      release,
      vault,
      owner: args.owner,
      systemProgram: systemProgram(),
    })
    .rpc();

  return { release, vault, signature };
}

export async function addReleaseShare(
  client: StellarClient,
  args: {
    universe: PublicKey;
    release: PublicKey;
    contributor: PublicKey;
    owner: PublicKey;
    bps: number;
  }
) {
  const share = deriveShare(args.release, args.contributor);
  const signature = await client.program.methods
    .addReleaseShare(Number(args.bps))
    .accountsStrict({
      universe: args.universe,
      release: args.release,
      share,
      contributor: args.contributor,
      owner: args.owner,
      systemProgram: systemProgram(),
    })
    .rpc();

  return { share, signature };
}

export async function finalizeRelease(
  client: StellarClient,
  args: {
    universe: PublicKey;
    release: PublicKey;
    asset: PublicKey;
    owner: PublicKey;
  }
) {
  const signature = await client.program.methods
    .finalizeRelease()
    .accountsStrict({
      universe: args.universe,
      release: args.release,
      asset: args.asset,
      owner: args.owner,
    })
    .rpc();

  return { signature };
}

export async function finalizeLineageEqualRelease(
  client: StellarClient,
  args: {
    universe: PublicKey;
    release: PublicKey;
    asset: PublicKey;
    owner: PublicKey;
    assetCount: number;
    linkCount: number;
    remainingAccounts: AccountMeta[];
  }
) {
  const signature = await client.program.methods
    .finalizeLineageEqualRelease(args.assetCount, args.linkCount)
    .accountsStrict({
      universe: args.universe,
      release: args.release,
      asset: args.asset,
      owner: args.owner,
      systemProgram: systemProgram(),
    })
    .remainingAccounts(args.remainingAccounts)
    .rpc();

  return { signature };
}

export async function finalizeWeightedRelease(
  client: StellarClient,
  args: {
    universe: PublicKey;
    release: PublicKey;
    asset: PublicKey;
    owner: PublicKey;
    assetCount: number;
    linkCount: number;
    remainingAccounts: AccountMeta[];
  }
) {
  const signature = await client.program.methods
    .finalizeWeightedRelease(args.assetCount, args.linkCount)
    .accountsStrict({
      universe: args.universe,
      release: args.release,
      asset: args.asset,
      owner: args.owner,
      systemProgram: systemProgram(),
    })
    .remainingAccounts(args.remainingAccounts)
    .rpc();

  return { signature };
}

export async function linkAvatarData(
  client: StellarClient,
  args: {
    universe: PublicKey;
    release: PublicKey;
    owner: PublicKey;
    avatarData: PublicKey;
  }
) {
  const signature = await client.program.methods
    .linkAvatarData(args.avatarData)
    .accountsStrict({
      universe: args.universe,
      release: args.release,
      owner: args.owner,
    })
    .rpc();

  return { signature };
}

export async function depositRevenue(
  client: StellarClient,
  args: {
    release: PublicKey;
    payer: PublicKey;
    amountLamports: anchor.BN;
  }
) {
  const vault = deriveVault(args.release);
  const signature = await client.program.methods
    .depositRevenue(args.amountLamports)
    .accountsStrict({
      release: args.release,
      vault,
      payer: args.payer,
      systemProgram: systemProgram(),
    })
    .rpc();

  return { vault, signature };
}

export async function claimRevenue(
  client: StellarClient,
  args: {
    release: PublicKey;
    contributor: PublicKey;
  }
) {
  const vault = deriveVault(args.release);
  const share = deriveShare(args.release, args.contributor);
  const signature = await client.program.methods
    .claimRevenue()
    .accountsStrict({
      release: args.release,
      vault,
      share,
      contributor: args.contributor,
    })
    .rpc();

  return { vault, share, signature };
}
