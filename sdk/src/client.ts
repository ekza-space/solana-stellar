import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

import idl from "../idl/solana_stellar.json";
import type { SolanaStellar } from "../idl/solana_stellar";

export const IDL = idl as anchor.Idl & { address: string };
export const PROGRAM_ID = new PublicKey(IDL.address);
export const SYSTEM_PROGRAM_ID = SystemProgram.programId;

export type StellarProgram = anchor.Program<SolanaStellar>;

export type StellarClient = {
  connection: Connection;
  provider: anchor.AnchorProvider;
  program: StellarProgram;
};

export type CreateClientOptions = anchor.web3.ConfirmOptions;

export type AnchorWalletLike = {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(
    tx: T
  ): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[]
  ): Promise<T[]>;
};

export function createProgram(provider: anchor.Provider): StellarProgram {
  return new anchor.Program(
    IDL as anchor.Idl,
    provider
  ) as unknown as StellarProgram;
}

export function createClient(
  connection: Connection,
  wallet: AnchorWalletLike,
  options: CreateClientOptions = {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  }
): StellarClient {
  const provider = new anchor.AnchorProvider(
    connection,
    wallet as anchor.Wallet,
    options
  );
  return {
    connection,
    provider,
    program: createProgram(provider),
  };
}

export function systemProgram() {
  return SYSTEM_PROGRAM_ID;
}

export type { SolanaStellar };
