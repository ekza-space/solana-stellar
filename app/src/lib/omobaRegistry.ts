import * as anchor from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import { SystemProgram } from "@solana/web3.js";
import { Buffer } from "buffer";

import idl from "./solana_omoba_registry.json";
import {
  deriveReleaseDeployment,
  PROGRAM_ID as STELLAR_PROGRAM_ID,
  RELEASE_DEPLOYMENT_PROJECT_OMOBA,
} from "./stellar";

export const OMOBA_REGISTRY_PROGRAM_ID = new anchor.web3.PublicKey(idl.address);

const AVATAR_PDA_SEED = "avatar_v1";
const REGISTRY_PDA_SEED = "avatar_registry";
const ESCROW_PDA_SEED = "avatar_escrow";
const STELLAR_LINK_PDA_SEED = "stellar_avatar_link";
const STELLAR_RELEASE_LINK_PDA_SEED = "stellar_release_link";

function toLeBytes(value: number) {
  return new anchor.BN(value).toArrayLike(Buffer, "le", 8);
}

export function createOmobaRegistryProgram(provider: anchor.AnchorProvider) {
  return new anchor.Program(idl as anchor.Idl, provider);
}

export function deriveOmobaRegistry() {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(REGISTRY_PDA_SEED)],
    OMOBA_REGISTRY_PROGRAM_ID
  )[0];
}

export function deriveOmobaAvatarData(index: number) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(AVATAR_PDA_SEED), toLeBytes(index)],
    OMOBA_REGISTRY_PROGRAM_ID
  )[0];
}

export function deriveOmobaEscrow(index: number) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(ESCROW_PDA_SEED), toLeBytes(index)],
    OMOBA_REGISTRY_PROGRAM_ID
  )[0];
}

export function deriveOmobaStellarLink(avatarData: PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(STELLAR_LINK_PDA_SEED), avatarData.toBuffer()],
    OMOBA_REGISTRY_PROGRAM_ID
  )[0];
}

export function deriveOmobaReleaseLink(stellarRelease: PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(STELLAR_RELEASE_LINK_PDA_SEED), stellarRelease.toBuffer()],
    OMOBA_REGISTRY_PROGRAM_ID
  )[0];
}

export async function nextOmobaAvatarIndex(
  program: anchor.Program
): Promise<number> {
  try {
    const registry = await (program.account as any).avatarRegistry.fetch(
      deriveOmobaRegistry()
    );
    const nextIndex = (registry as any).nextIndex;
    return nextIndex?.toNumber?.() ?? Number(nextIndex ?? 0);
  } catch {
    return 0;
  }
}

export async function publishOmobaAvatarFromStellar(args: {
  provider: anchor.AnchorProvider;
  universe: PublicKey;
  release: PublicKey;
  vault: PublicKey;
  uriIpfsHash: string;
  maxSupply: anchor.BN;
  mintingFeePerMint: anchor.BN;
}) {
  const program = createOmobaRegistryProgram(args.provider);
  const avatarIndex = await nextOmobaAvatarIndex(program);
  const registry = deriveOmobaRegistry();
  const avatarData = deriveOmobaAvatarData(avatarIndex);
  const escrow = deriveOmobaEscrow(avatarIndex);
  const stellarLink = deriveOmobaStellarLink(avatarData);
  const stellarReleaseLink = deriveOmobaReleaseLink(args.release);
  const stellarReleaseDeployment = deriveReleaseDeployment(
    args.release,
    RELEASE_DEPLOYMENT_PROJECT_OMOBA
  );

  const signature = await program.methods
    .initializeAvatarFromStellar(
      args.uriIpfsHash,
      args.maxSupply,
      args.mintingFeePerMint
    )
    .accountsStrict({
      registry,
      avatarData,
      payer: args.provider.publicKey!,
      escrow,
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
    avatarIndex,
    registry,
    avatarData,
    escrow,
    stellarLink,
    stellarReleaseLink,
    stellarReleaseDeployment,
  };
}
