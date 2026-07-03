#!/usr/bin/env node

/**
 * Register the ProjectProfile capability cards of known consumer apps on
 * localnet: which model formats each app can actually load. Wallets/consoles
 * read these to warn BEFORE bridging a release into an app that cannot use
 * its model format (see docs/INTEGRATION.md "Model formats").
 *
 * Idempotent: re-running updates the profiles (authority = the payer wallet).
 */

const anchor = require("@coral-xyz/anchor");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createClient,
  registerProjectProfile,
  deriveProjectProfile,
} = require("../sdk/dist/src");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");

const DEFAULT_ENDPOINT = "http://127.0.0.1:8899";
const DEFAULT_WALLET = path.join(os.homedir(), ".config/solana/id.json");

/** The registry of known consumers and what they support. Extend as apps land
 *  new loaders; slugs must match what each app writes via
 *  record_release_deployment. */
const PROFILES = [
  {
    projectSlug: "arena",
    registryProgram: "D3a99Wj3eLLn4jbXU5rLDbaFT6giQiUbmcPkiyQSM8iZ",
    supportedFormats: ["vrm", "glb"],
  },
  {
    projectSlug: "avatar",
    registryProgram: "29KLLArkfCfRGPgTh4k4qzXvR2JkkXfRnnNZTKn54TKz",
    supportedFormats: ["glb"],
  },
  {
    projectSlug: "omoba",
    // omoba's on-chain registry program is not deployed on this localnet yet;
    // the game itself consumes arena cards. Default pubkey = "no program".
    registryProgram: null,
    supportedFormats: ["vrm", "glb"],
  },
];

function parseArgs(argv) {
  const args = { endpoint: DEFAULT_ENDPOINT, wallet: DEFAULT_WALLET };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--endpoint" && next) {
      args.endpoint = next;
      index += 1;
    } else if (arg === "--wallet" && next) {
      args.wallet = path.resolve(next);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/register-project-profiles-localnet.js [--endpoint url] [--wallet keypair.json]"
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(args.wallet, "utf8")))
  );
  const connection = new Connection(args.endpoint, "confirmed");
  const client = createClient(connection, new anchor.Wallet(payer));

  for (const entry of PROFILES) {
    const registryProgram = entry.registryProgram
      ? new PublicKey(entry.registryProgram)
      : PublicKey.default;
    const { profile, signature } = await registerProjectProfile(client, {
      projectSlug: entry.projectSlug,
      registryProgram,
      supportedFormats: entry.supportedFormats,
      authority: payer.publicKey,
    });
    console.log(
      `${entry.projectSlug}: formats=[${entry.supportedFormats.join(", ")}] profile=${profile.toBase58()} tx=${signature.slice(0, 16)}…`
    );
  }

  // Read-back proof.
  for (const entry of PROFILES) {
    const account = await client.program.account.projectProfile.fetch(
      deriveProjectProfile(entry.projectSlug)
    );
    console.log(
      `on-chain ${account.projectSlug}: [${account.supportedFormats.join(", ")}] registry=${account.registryProgram.toBase58()}`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error?.logs) console.error(error.logs.join("\n"));
  process.exit(1);
});
