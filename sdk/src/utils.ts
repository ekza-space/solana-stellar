import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export type ExplorerCluster = "localnet" | "devnet" | "mainnet";

export function asciiSeed(value: string): Uint8Array {
  return Uint8Array.from(Array.from(value).map((char) => char.charCodeAt(0)));
}

export function toLeBytes(value: number | anchor.BN): Uint8Array {
  const bn = anchor.BN.isBN(value) ? value : new anchor.BN(value);
  return Uint8Array.from(bn.toArray("le", 8));
}

export function enumValue<T extends string>(value: T) {
  return { [value]: {} } as Record<T, Record<string, never>>;
}

export function safePublicKey(value: string | null | undefined) {
  if (!value?.trim()) return null;
  try {
    return new PublicKey(value.trim());
  } catch {
    return null;
  }
}

export function toNumber(value: unknown): number {
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof value.toNumber === "function"
  ) {
    return value.toNumber();
  }

  return Number(value ?? 0);
}

export function publicKeyString(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "toBase58" in value &&
    typeof value.toBase58 === "function"
  ) {
    return value.toBase58();
  }

  return String(value ?? "");
}

export function enumKey(value: unknown): string {
  if (!value || typeof value !== "object") return "unknown";
  return Object.keys(value)[0] || "unknown";
}

export function lamportsFromSol(value: string): anchor.BN {
  const parsed = Number(value || "0");
  if (!Number.isFinite(parsed) || parsed <= 0) return new anchor.BN(0);
  return new anchor.BN(Math.round(parsed * anchor.web3.LAMPORTS_PER_SOL));
}

export function explorerUrl(
  signature: string,
  endpoint: string,
  cluster?: ExplorerCluster
) {
  if (
    cluster === "localnet" ||
    endpoint.includes("127.0.0.1") ||
    endpoint.includes("localhost")
  ) {
    return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(
      endpoint
    )}`;
  }

  if (cluster === "devnet" || endpoint.includes("devnet")) {
    return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  }

  return `https://explorer.solana.com/tx/${signature}`;
}
