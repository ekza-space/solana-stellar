import * as anchor from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { Buffer } from "buffer";

import idl from "../../../target/idl/solana_stellar.json";
import type { SolanaStellar } from "../../../target/types/solana_stellar";

export const PROGRAM_ID = new PublicKey(idl.address);

export type StellarClient = {
  provider: anchor.AnchorProvider;
  program: anchor.Program<SolanaStellar>;
};

export type TxResult = {
  signature: string;
  explorerUrl: string;
};

export function createClient(connection: Connection, wallet: AnchorWallet): StellarClient {
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new anchor.Program(idl as anchor.Idl, provider) as unknown as anchor.Program<SolanaStellar>;
  return { provider, program };
}

export function explorerUrl(signature: string, endpoint: string) {
  const cluster = endpoint.includes("devnet") ? "devnet" : "custom";
  if (endpoint.includes("127.0.0.1") || endpoint.includes("localhost")) {
    return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(endpoint)}`;
  }
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

export function toLeBytes(value: number) {
  return new anchor.BN(value).toArrayLike(Buffer, "le", 8);
}

export function enumValue<T extends string>(value: T) {
  return { [value]: {} } as Record<T, Record<string, never>>;
}

export function safePublicKey(value: string) {
  if (!value.trim()) return null;
  try {
    return new PublicKey(value.trim());
  } catch {
    return null;
  }
}

export function lamportsFromSol(value: string) {
  const parsed = Number(value || "0");
  if (!Number.isFinite(parsed) || parsed <= 0) return new anchor.BN(0);
  return new anchor.BN(Math.round(parsed * anchor.web3.LAMPORTS_PER_SOL));
}

export function deriveUniverse(owner: PublicKey, index: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("universe"), owner.toBuffer(), toLeBytes(index)],
    PROGRAM_ID,
  )[0];
}

export function deriveAsset(universe: PublicKey, index: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("asset"), universe.toBuffer(), toLeBytes(index)],
    PROGRAM_ID,
  )[0];
}

export function deriveAssetParent(child: PublicKey, parent: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("link"), child.toBuffer(), parent.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function deriveRelease(universe: PublicKey, index: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("release"), universe.toBuffer(), toLeBytes(index)],
    PROGRAM_ID,
  )[0];
}

export function deriveVault(release: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("release_vault"), release.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function deriveShare(release: PublicKey, contributor: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("share"), release.toBuffer(), contributor.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export const systemProgram = SystemProgram.programId;
