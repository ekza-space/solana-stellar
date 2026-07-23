#!/usr/bin/env node

const anchor = require("@coral-xyz/anchor");
const fs = require("node:fs");
const path = require("node:path");

const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const STELLAR_PROGRAM_ID = new anchor.web3.PublicKey(
  "3rVXfq7LLSLqbDzvZuSrQoMytwczLj2Q8Hue62rxPZAA"
);
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";

const PACKS = [
  { slug: "aetherlings", expectedGameEntries: 22 },
  { slug: "glasswrights", expectedGameEntries: 22 },
  { slug: "neko-samurai", expectedGameEntries: 22 },
  { slug: "wotori-starter-pack", expectedGameEntries: 34 },
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function enumName(value) {
  return value && typeof value === "object" ? Object.keys(value)[0] : "";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
  const genesisHash = await connection.getGenesisHash();
  assert(
    genesisHash === DEVNET_GENESIS_HASH,
    `expected devnet genesis ${DEVNET_GENESIS_HASH}, got ${genesisHash}`
  );

  const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const idl = readJson(
    path.resolve(__dirname, "../target/idl/solana_stellar.json")
  );
  const program = new anchor.Program(idl, provider);
  assert(
    program.programId.equals(STELLAR_PROGRAM_ID),
    `IDL program mismatch: ${program.programId.toBase58()}`
  );

  const summaries = [];
  for (const pack of PACKS) {
    const packDir = path.resolve(__dirname, "../univerces", pack.slug);
    const dump = readJson(path.join(packDir, "dump", "manifest.json"));
    const deployment = readJson(
      path.join(packDir, "_", "deployment-manifest.json")
    );

    assert(
      deployment.genesisHash === DEVNET_GENESIS_HASH,
      `${pack.slug}: deployment genesis mismatch`
    );
    assert(
      deployment.programId === STELLAR_PROGRAM_ID.toBase58(),
      `${pack.slug}: deployment program mismatch`
    );
    assert(deployment.universe, `${pack.slug}: universe is missing`);
    assert(
      deployment.entities?.length === dump.projects?.length,
      `${pack.slug}: deployment is incomplete (${
        deployment.entities?.length || 0
      }/${dump.projects?.length || 0})`
    );

    const gameProjects = (dump.projects || []).filter((project) => {
      const type = project.info?.project_type;
      return type === "character" || type === "prop";
    });
    assert(
      gameProjects.length === pack.expectedGameEntries,
      `${pack.slug}: unexpected game entry count ${gameProjects.length}`
    );

    const entitiesBySource = new Map(
      deployment.entities.map((entity) => [entity.sourceProjectAddress, entity])
    );
    for (const project of gameProjects) {
      const entity = entitiesBySource.get(project.address);
      assert(
        entity?.address,
        `${pack.slug}/${project.address}: address missing`
      );
      assert(
        entity.previewUrl || entity.metadataHash,
        `${pack.slug}/${project.address}: CID missing`
      );
    }

    const universeAddress = new anchor.web3.PublicKey(deployment.universe);
    const universeInfo = await connection.getAccountInfo(
      universeAddress,
      "confirmed"
    );
    assert(
      universeInfo?.owner.equals(STELLAR_PROGRAM_ID),
      `${pack.slug}: universe is not owned by Solana Stellar`
    );
    const universe = await program.account.universe.fetch(universeAddress);
    assert(
      universe.owner.equals(new anchor.web3.PublicKey(deployment.owner)),
      `${pack.slug}: universe owner mismatch`
    );

    const entityAddresses = deployment.entities.map(
      (entity) => new anchor.web3.PublicKey(entity.address)
    );
    const entityInfos = await connection.getMultipleAccountsInfo(
      entityAddresses,
      "confirmed"
    );
    const entityAccounts = await program.account.asset.fetchMultiple(
      entityAddresses
    );
    entityAddresses.forEach((address, index) => {
      const label = `${pack.slug}/${deployment.entities[index].sourceProjectAddress}`;
      assert(entityInfos[index], `${label}: account missing`);
      assert(
        entityInfos[index].owner.equals(STELLAR_PROGRAM_ID),
        `${label}: wrong program owner`
      );
      assert(entityAccounts[index], `${label}: account decode failed`);
      assert(
        entityAccounts[index].universe.equals(universeAddress),
        `${label}: wrong universe`
      );
      assert(
        enumName(entityAccounts[index].status) === "approved",
        `${label}: status is ${enumName(entityAccounts[index].status)}`
      );
    });

    summaries.push({
      slug: pack.slug,
      universe: universeAddress.toBase58(),
      owner: universe.owner.toBase58(),
      entities: deployment.entities.length,
      gameEntries: gameProjects.length,
      universeMetadataHash: deployment.universeMetadataHash,
    });
  }

  console.log(
    JSON.stringify(
      {
        cluster: "devnet",
        genesisHash,
        programId: STELLAR_PROGRAM_ID.toBase58(),
        packs: summaries,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
