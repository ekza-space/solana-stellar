#!/usr/bin/env node

/**
 * Seed the Open Source Avatars dataset (https://www.opensourceavatars.com,
 * local snapshot at ~/git/opensourceavatars) into a Solana Stellar universe on
 * localnet, finalize a release per avatar, and (by default) publish each one
 * into Ekza Arena as a skin-only Avatar card so players can build characters
 * from them and mint gear.
 *
 * Analogous to deploy-wotori-universe-localnet.js / deploy-random-models-localnet.js.
 *
 * Per avatar directory (<folder>/avatars/<collection>/<id>/):
 *   meta.json + model.vrm + thumbnail.png
 * we create:
 *   1. project asset (model3D/preview, license from meta: CC0|CC-BY, custom policy)
 *   2. child model asset (model3D/mesh) linked via asset parent
 *   3. release: create -> 100% share to owner -> finalize
 *   4. arena publish: register_arena_asset_from_stellar (skin-only Avatar card)
 *
 * Licensing: every metadata JSON carries the upstream author/license and
 * attribution notice; CC-BY collections REQUIRE attribution downstream.
 */

const anchor = require("@coral-xyz/anchor");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  addAssetParent,
  approveAsset,
  createAsset,
  createClient,
  createRelease,
  createUniverse,
  addReleaseShare,
  finalizeRelease,
  deriveReleaseDeployment,
  enumValue,
  nextUniverseIndex,
  PROGRAM_ID,
  submitAsset,
} = require("../sdk/dist/src");
const { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } =
  require("@solana/web3.js");

const DEFAULT_FOLDER = path.resolve(__dirname, "../../../opensourceavatars");
const DEFAULT_ENDPOINT = "http://127.0.0.1:8899";
const DEFAULT_ARENA_IDL = path.resolve(
  __dirname,
  "../../solana-ekza-arena/target/idl/solana_ekza_arena.json"
);
const SERVICE_DIR_NAME = "_";
const ARENA_PROJECT_SLUG = "arena";
/** On-chain metadata_hash / preview_hash are capped at 96 chars, so long
 * avatar paths are exposed through short symlinks under <folder>/_/p|m/. */
const MAX_ON_CHAIN_POINTER_LEN = 96;

const DATASET_ATTRIBUTION = {
  dataset: "Open Source Avatars",
  homepage: "https://www.opensourceavatars.com",
  registrySource: "https://github.com/ToxSam/open-source-avatars",
  note: "License is defined per collection upstream and resolved onto each avatar. CC0 avatars are public domain; CC-BY avatars require attribution to their author in copies and derivatives.",
};

const LICENSE_MAP = new Map([
  ["CC0", { kind: "cc0", label: "CC0 1.0 (public domain)" }],
  ["CC-BY", { kind: "ccBy4", label: "CC BY 4.0 (attribution required)" }],
]);

function parseArgs(argv) {
  const args = {
    folder: DEFAULT_FOLDER,
    collections: "all",
    count: 10,
    endpoint: DEFAULT_ENDPOINT,
    metadataBaseUrl: "http://127.0.0.1:8787",
    arenaIdl: DEFAULT_ARENA_IDL,
    skipArena: false,
    newUniverse: false,
    dryRun: false,
    airdropSol: 10,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--folder" && next) {
      args.folder = path.resolve(next);
      index += 1;
    } else if (arg === "--collections" && next) {
      args.collections = next;
      index += 1;
    } else if (arg === "--count" && next) {
      args.count = next === "all" ? "all" : Number(next);
      index += 1;
    } else if (arg === "--endpoint" && next) {
      args.endpoint = next;
      index += 1;
    } else if (arg === "--metadata-base-url" && next) {
      args.metadataBaseUrl = next.replace(/\/+$/, "");
      index += 1;
    } else if (arg === "--arena-idl" && next) {
      args.arenaIdl = path.resolve(next);
      index += 1;
    } else if (arg === "--airdrop-sol" && next) {
      args.airdropSol = Number(next);
      index += 1;
    } else if (arg === "--skip-arena") {
      args.skipArena = true;
    } else if (arg === "--new-universe") {
      args.newUniverse = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (
    args.count !== "all" &&
    (!Number.isInteger(args.count) || args.count < 0)
  ) {
    throw new Error("--count must be a non-negative integer or all");
  }
  return args;
}

function printHelpAndExit() {
  console.log(`Usage:
  node scripts/deploy-opensource-avatars-localnet.js \\
    [--folder ~/git/opensourceavatars] [--collections all|id1,id2] [--count 10|all] \\
    [--endpoint http://127.0.0.1:8899] [--metadata-base-url http://127.0.0.1:8787] \\
    [--arena-idl ../solana-ekza-arena/target/idl/solana_ekza_arena.json] \\
    [--skip-arena] [--new-universe] [--dry-run]

Seeds Open Source Avatars into a Stellar universe on localnet: project asset +
model asset + finalized release per avatar, then publishes each release into
Ekza Arena as a skin-only Avatar card (omit with --skip-arena). Serve the
dataset folder first:
  node scripts/serve-metadata.js --folder ~/git/opensourceavatars --port 8787`);
  process.exit(0);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadOrCreateKeypair(keypairPath) {
  if (fs.existsSync(keypairPath)) {
    const secretKey = Uint8Array.from(
      JSON.parse(fs.readFileSync(keypairPath, "utf8"))
    );
    return { keypair: Keypair.fromSecretKey(secretKey), created: false };
  }
  const keypair = Keypair.generate();
  fs.writeFileSync(
    keypairPath,
    JSON.stringify(Array.from(keypair.secretKey), null, 2)
  );
  fs.chmodSync(keypairPath, 0o600);
  return { keypair, created: true };
}

function shortHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return slug || "avatar";
}

function pointer(relativePath, metadataBaseUrl) {
  return `${metadataBaseUrl}/${relativePath
    .split(path.sep)
    .map(encodeURIComponent)
    .join("/")}`;
}

/** Expose a long dataset file through a short stable symlink so the on-chain
 * pointer fits the 96-char hash budget. */
function shortAlias(folder, subdir, sourceRelative, extension) {
  const aliasDir = path.join(folder, SERVICE_DIR_NAME, subdir);
  ensureDir(aliasDir);
  const alias = path.join(
    SERVICE_DIR_NAME,
    subdir,
    `${shortHash(sourceRelative)}${extension}`
  );
  const aliasAbsolute = path.join(folder, alias);
  if (!fs.existsSync(aliasAbsolute)) {
    fs.symlinkSync(
      path.relative(path.dirname(aliasAbsolute), path.join(folder, sourceRelative)),
      aliasAbsolute
    );
  }
  return alias;
}

function assertPointerFits(value, label) {
  if (value.length > MAX_ON_CHAIN_POINTER_LEN) {
    throw new Error(
      `${label} pointer exceeds ${MAX_ON_CHAIN_POINTER_LEN} chars (${value.length}): ${value}`
    );
  }
  return value;
}

function loadDatasetManifest(folder) {
  const manifestPath = path.join(folder, "manifest.json");
  return fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : null;
}

function listAvatarDirs(folder, collectionsArg) {
  const avatarsRoot = path.join(folder, "avatars");
  if (!fs.existsSync(avatarsRoot)) {
    throw new Error(`No avatars/ directory in ${folder}`);
  }
  const localCollections = fs
    .readdirSync(avatarsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const wanted =
    collectionsArg === "all"
      ? localCollections
      : collectionsArg.split(",").map((value) => value.trim());
  for (const collection of wanted) {
    if (!localCollections.includes(collection)) {
      throw new Error(
        `Collection ${collection} not found locally. Available: ${localCollections.join(", ")}`
      );
    }
  }

  const avatars = [];
  for (const collection of wanted) {
    const collectionDir = path.join(avatarsRoot, collection);
    for (const entry of fs.readdirSync(collectionDir, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      const avatarDir = path.join(collectionDir, entry.name);
      const metaPath = path.join(avatarDir, "meta.json");
      const modelPath = path.join(avatarDir, "model.vrm");
      if (!fs.existsSync(metaPath) || !fs.existsSync(modelPath)) continue;
      avatars.push({
        collection,
        dir: path.relative(folder, avatarDir),
        meta: JSON.parse(fs.readFileSync(metaPath, "utf8")),
        hasThumbnail: fs.existsSync(path.join(avatarDir, "thumbnail.png")),
      });
    }
  }
  return avatars;
}

function shuffle(values) {
  return values
    .map((value) => ({ value, order: crypto.randomInt(0, 2 ** 31 - 1) }))
    .sort((a, b) => a.order - b.order)
    .map(({ value }) => value);
}

function licenseFor(meta) {
  const license = LICENSE_MAP.get(meta.license);
  if (!license) {
    throw new Error(
      `Unsupported license "${meta.license}" for avatar ${meta.id} — extend LICENSE_MAP deliberately (mind attribution requirements).`
    );
  }
  return license;
}

function attributionFor(meta) {
  return {
    ...DATASET_ATTRIBUTION,
    name: meta.name,
    author: meta.author,
    collection: meta.collection_name,
    collectionId: meta.collection_id,
    license: meta.license,
    sourceModelUrl: meta.model_file_url,
    sourceThumbnailUrl: meta.thumbnail_url,
    sourceUrl: meta.source_url || null,
    rightsNotice:
      meta.license === "CC0"
        ? "CC0 1.0: dedicated to the public domain by its author. No attribution legally required; credit is appreciated."
        : `CC BY 4.0: © ${meta.author}. Attribution to the author is REQUIRED in copies and derivatives. The mint does not transfer copyright.`,
  };
}

async function waitForAccount(connection, publicKey, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const account = await connection.getAccountInfo(publicKey, "confirmed");
    if (account) return account;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${label} ${publicKey.toBase58()}`);
}

async function confirmAirdrop(connection, publicKey, sol) {
  const before = await connection.getBalance(publicKey);
  if (sol <= 0 || before >= sol * LAMPORTS_PER_SOL) {
    return { requested: false, balanceLamports: before };
  }
  const signature = await connection.requestAirdrop(
    publicKey,
    sol * LAMPORTS_PER_SOL
  );
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return {
    requested: true,
    signature,
    balanceLamports: await connection.getBalance(publicKey),
  };
}

async function assertProgramDeployed(connection, programId, label, hint) {
  const account = await connection.getAccountInfo(programId);
  if (!account) {
    throw new Error(
      `${label} program ${programId.toBase58()} is not deployed on the selected localnet. ${hint}`
    );
  }
}

function loadManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

// ---------------------------------------------------------------------------
// Ekza Arena publish (register_arena_asset_from_stellar, skin-only)
// ---------------------------------------------------------------------------

function loadArenaProgram(args, client) {
  if (args.skipArena) return null;
  if (!fs.existsSync(args.arenaIdl)) {
    throw new Error(
      `Arena IDL not found at ${args.arenaIdl}. Run anchor build in solana-ekza-arena or pass --arena-idl / --skip-arena.`
    );
  }
  const idl = JSON.parse(fs.readFileSync(args.arenaIdl, "utf8"));
  return new anchor.Program(idl, client.provider);
}

const arenaPda = {
  registry: (programId) =>
    PublicKey.findProgramAddressSync([Buffer.from("arena_registry")], programId)[0],
  asset: (programId, index) =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("arena_asset_v1"),
        new anchor.BN(index).toArrayLike(Buffer, "le", 8),
      ],
      programId
    )[0],
  stellarLink: (programId, arenaAsset) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("stellar_arena_link"), arenaAsset.toBuffer()],
      programId
    )[0],
  releaseLink: (programId, release) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("stellar_release_link"), release.toBuffer()],
      programId
    )[0],
};

async function publishToArena({
  args,
  arenaProgram,
  metadataDir,
  owner,
  universe,
  release,
  vault,
  avatar,
}) {
  const registry = arenaPda.registry(arenaProgram.programId);
  let nextIndex = 0;
  try {
    const registryAccount =
      await arenaProgram.account.arenaRegistry.fetch(registry);
    nextIndex = registryAccount.nextIndex.toNumber();
  } catch {
    nextIndex = 0;
  }
  const arenaAsset = arenaPda.asset(arenaProgram.programId, nextIndex);

  // Skin-only Arena card metadata: identity + art pointers, ZERO stats
  // (balance is rolled on-chain by the Arena mint, per the gate contract).
  const cardMetadataFile = path.join(
    metadataDir,
    `arena-${nextIndex}-${shortHash(`${avatar.dir}:arena`)}.json`
  );
  fs.writeFileSync(
    cardMetadataFile,
    JSON.stringify(
      {
        type: "arena-avatar-card",
        name: avatar.meta.name,
        description: `${avatar.meta.name} — Open Source Avatars skin published from Stellar release ${release.toBase58()}.`,
        image: avatar.thumbnailPointer || avatar.meta.thumbnail_url || "",
        model_vrm: avatar.modelPointer,
        source_model_url: avatar.meta.model_file_url,
        attribution: attributionFor(avatar.meta),
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  const cardMetadataPointer = pointer(
    path.relative(args.folder, cardMetadataFile),
    args.metadataBaseUrl
  );

  const archetypeId = slugify(
    `osa_${avatar.meta.name}_${shortHash(avatar.meta.id)}`
  );
  const signature = await arenaProgram.methods
    .registerArenaAssetFromStellar({
      metadataIpfsHash: cardMetadataPointer,
      cardKind: { avatar: {} },
      archetypeId,
      slotMask: 15, // all four gear slots
      skillIds: [],
    })
    .accountsStrict({
      registry,
      arenaAsset,
      payer: owner.publicKey,
      stellarLink: arenaPda.stellarLink(arenaProgram.programId, arenaAsset),
      stellarProgram: PROGRAM_ID,
      stellarUniverse: universe,
      stellarRelease: release,
      stellarVault: vault,
      stellarReleaseDeployment: deriveReleaseDeployment(
        release,
        ARENA_PROJECT_SLUG
      ),
      stellarReleaseLink: arenaPda.releaseLink(arenaProgram.programId, release),
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  return {
    arenaProgram: arenaProgram.programId.toBase58(),
    arenaAsset: arenaAsset.toBase58(),
    arenaAssetIndex: nextIndex,
    archetypeId,
    cardMetadataFile: path.relative(args.folder, cardMetadataFile),
    cardMetadataPointer,
    signature,
  };
}

// ---------------------------------------------------------------------------
// Stellar seeding
// ---------------------------------------------------------------------------

async function createFreshUniverse({ args, client, metadataDir, owner, dataset }) {
  const universeIndex = await nextUniverseIndex(client, owner.publicKey);
  const universeMetadataFile = path.join(
    metadataDir,
    `universe-${universeIndex}-${shortHash(`${Date.now()}:${owner.publicKey.toBase58()}`)}.json`
  );
  fs.writeFileSync(
    universeMetadataFile,
    JSON.stringify(
      {
        type: "universe",
        name: "Open Source Avatars Localnet",
        title: "Open Source Avatars Localnet",
        description:
          "Localnet universe seeded from the Open Source Avatars dataset (opensourceavatars.com, registry by ToxSam). VRM avatars by Polygonal-Mind, ToxSam, NeonGlitch86 and others; licensed per collection as CC0 or CC BY 4.0. CC-BY avatars require attribution to their authors.",
        attribution: {
          ...DATASET_ATTRIBUTION,
          collections: dataset?.collections || [],
          licenseBreakdown: dataset?.license_breakdown || {},
        },
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  const universeMetadataHash = assertPointerFits(
    pointer(path.relative(args.folder, universeMetadataFile), args.metadataBaseUrl),
    "universe metadata"
  );

  const { universe, globalIndex, signature } = await createUniverse(client, {
    owner: owner.publicKey,
    universeIndex,
    metadataHash: universeMetadataHash,
    projectType: enumValue("model3D"),
    open: true,
  });
  await waitForAccount(client.connection, universe, "universe");

  return {
    universe: universe.toBase58(),
    universeIndex,
    universeGlobalIndex: globalIndex,
    universeMetadataFile: path.relative(args.folder, universeMetadataFile),
    universeMetadataHash,
    universeSignature: signature,
    assets: [],
  };
}

async function seedAvatar({
  args,
  client,
  arenaProgram,
  metadataDir,
  owner,
  universe,
  avatar,
  assetIndex,
  releaseIndex,
}) {
  const meta = avatar.meta;
  const license = licenseFor(meta);
  const attribution = attributionFor(meta);
  const title = meta.name || meta.id;

  // Short aliases keep the on-chain preview/metadata pointers under 96 chars.
  const thumbnailAlias = avatar.hasThumbnail
    ? shortAlias(args.folder, "p", path.join(avatar.dir, "thumbnail.png"), ".png")
    : null;
  const modelAlias = shortAlias(
    args.folder,
    "m",
    path.join(avatar.dir, "model.vrm"),
    ".vrm"
  );
  const previewPointer = thumbnailAlias
    ? assertPointerFits(pointer(thumbnailAlias, args.metadataBaseUrl), "preview")
    : "";
  const modelPointer = pointer(modelAlias, args.metadataBaseUrl);
  avatar.thumbnailPointer = previewPointer;
  avatar.modelPointer = modelPointer;

  // 1. Project asset.
  const projectMetadataFile = path.join(
    metadataDir,
    `a-${assetIndex}-${shortHash(`${avatar.dir}:project`)}.json`
  );
  fs.writeFileSync(
    projectMetadataFile,
    JSON.stringify(
      {
        type: "project",
        open: true,
        title,
        description: `${title} — VRM avatar from the Open Source Avatars dataset (${meta.collection_name}, by ${meta.author}, ${license.label}).`,
        attribution,
        rightsNotice: attribution.rightsNotice,
        license_kind: meta.license,
        license_label: license.label,
        project_type: "avatar",
        sourceDir: avatar.dir,
        ipfs_img_hash: previewPointer,
        preview_ipfs_hash: previewPointer,
        model_source_file: path.join(avatar.dir, "model.vrm"),
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  const projectMetadataHash = assertPointerFits(
    pointer(path.relative(args.folder, projectMetadataFile), args.metadataBaseUrl),
    "project metadata"
  );

  console.log(`[${assetIndex}] ${title} (${meta.collection_id}, ${meta.license})`);
  const { asset: projectAsset } = await createAsset(client, {
    universe,
    creator: owner.publicKey,
    assetIndex,
    kind: enumValue("model3D"),
    subtype: enumValue("preview"),
    licenseKind: enumValue(license.kind),
    metadataHash: projectMetadataHash,
    previewHash: previewPointer,
    collaborationPolicy: enumValue("custom"),
  });
  await waitForAccount(client.connection, projectAsset, "project asset");
  await submitAsset(client, { asset: projectAsset, creator: owner.publicKey });
  await approveAsset(client, {
    universe,
    asset: projectAsset,
    owner: owner.publicKey,
  });

  // 2. Model child asset.
  const modelMetadataFile = path.join(
    metadataDir,
    `a-${assetIndex + 1}-${shortHash(`${avatar.dir}:model`)}.json`
  );
  fs.writeFileSync(
    modelMetadataFile,
    JSON.stringify(
      {
        type: "asset",
        title: `${title} VRM Model`,
        description: `${title} VRM avatar model. ${attribution.rightsNotice}`,
        attribution,
        license_inherited: true,
        inherited_from_asset: projectAsset.toBase58(),
        medium_type: "3d",
        medium_sub_type: "model",
        format: "VRM",
        ipfs_hash: modelPointer,
        preview_ipfs_hash: previewPointer,
        source_model_url: meta.model_file_url,
        alternate_models: meta.alternate_models || {},
        model_source_file: path.join(avatar.dir, "model.vrm"),
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  const modelMetadataHash = assertPointerFits(
    pointer(path.relative(args.folder, modelMetadataFile), args.metadataBaseUrl),
    "model metadata"
  );

  const { asset: modelAsset } = await createAsset(client, {
    universe,
    creator: owner.publicKey,
    assetIndex: assetIndex + 1,
    kind: enumValue("model3D"),
    subtype: enumValue("mesh"),
    licenseKind: enumValue(license.kind),
    metadataHash: modelMetadataHash,
    previewHash: previewPointer,
    collaborationPolicy: enumValue("custom"),
  });
  await waitForAccount(client.connection, modelAsset, "model asset");
  await addAssetParent(client, {
    childAsset: modelAsset,
    parentAsset: projectAsset,
    creator: owner.publicKey,
  });
  await submitAsset(client, { asset: modelAsset, creator: owner.publicKey });
  await approveAsset(client, {
    universe,
    asset: modelAsset,
    owner: owner.publicKey,
  });

  // 3. Release: create -> 100% owner share -> finalize.
  const releaseMetadataFile = path.join(
    metadataDir,
    `r-${releaseIndex}-${shortHash(`${avatar.dir}:release`)}.json`
  );
  fs.writeFileSync(
    releaseMetadataFile,
    JSON.stringify(
      {
        type: "release",
        title: `${title} Release`,
        description: `Finalized localnet release of ${title} (Open Source Avatars).`,
        attribution,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  const releaseMetadataHash = assertPointerFits(
    pointer(path.relative(args.folder, releaseMetadataFile), args.metadataBaseUrl),
    "release metadata"
  );

  const { release, vault } = await createRelease(client, {
    universe,
    asset: projectAsset,
    owner: owner.publicKey,
    releaseIndex,
    metadataHash: releaseMetadataHash,
  });
  await waitForAccount(client.connection, release, "release");
  await addReleaseShare(client, {
    universe,
    release,
    contributor: owner.publicKey,
    owner: owner.publicKey,
    bps: 10_000,
  });
  await finalizeRelease(client, {
    universe,
    release,
    asset: projectAsset,
    owner: owner.publicKey,
  });

  // 4. Publish into Ekza Arena (skin-only Avatar card).
  let arena = null;
  if (arenaProgram) {
    arena = await publishToArena({
      args,
      arenaProgram,
      metadataDir,
      owner,
      universe,
      release,
      vault,
      avatar,
    });
    console.log(
      `    -> arena card ${arena.arenaAssetIndex} (${arena.archetypeId})`
    );
  }

  return {
    id: meta.id,
    title,
    collection: meta.collection_id,
    author: meta.author,
    license: meta.license,
    sourceDir: avatar.dir,
    projectAssetIndex: assetIndex,
    projectAsset: projectAsset.toBase58(),
    projectMetadataFile: path.relative(args.folder, projectMetadataFile),
    modelAssetIndex: assetIndex + 1,
    modelAsset: modelAsset.toBase58(),
    modelMetadataFile: path.relative(args.folder, modelMetadataFile),
    previewPointer,
    modelPointer,
    releaseIndex,
    release: release.toBase58(),
    vault: vault.toBase58(),
    releaseMetadataFile: path.relative(args.folder, releaseMetadataFile),
    arena,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.folder)) {
    throw new Error(`Folder does not exist: ${args.folder}`);
  }

  const serviceDir = path.join(args.folder, SERVICE_DIR_NAME);
  const metadataDir = path.join(serviceDir, "metadata");
  const keypairPath = path.join(serviceDir, "universe-owner-keypair.json");
  const manifestPath = path.join(serviceDir, "deployment-manifest.json");
  const previousManifest = args.newUniverse ? null : loadManifest(manifestPath);
  const dataset = loadDatasetManifest(args.folder);

  const allAvatars = listAvatarDirs(args.folder, args.collections);
  const deployedDirs = new Set(
    previousManifest?.assets?.map((asset) => asset.sourceDir) || []
  );
  const available = allAvatars.filter((avatar) => !deployedDirs.has(avatar.dir));
  const selected =
    args.count === "all"
      ? available
      : shuffle(available).slice(0, args.count);
  if (selected.length === 0) {
    throw new Error("No undeployed avatars available for the selection.");
  }
  if (args.count !== "all" && selected.length < args.count) {
    throw new Error(
      `Need ${args.count} undeployed avatars, found ${selected.length}.`
    );
  }

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          folder: args.folder,
          endpoint: args.endpoint,
          metadataBaseUrl: args.metadataBaseUrl,
          collections: args.collections,
          publishArena: !args.skipArena,
          arenaIdl: args.skipArena ? null : args.arenaIdl,
          existingUniverse: previousManifest?.universe || null,
          alreadyDeployed: deployedDirs.size,
          available: available.length,
          selected: selected.map((avatar) => ({
            dir: avatar.dir,
            name: avatar.meta.name,
            license: avatar.meta.license,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  ensureDir(metadataDir);
  const { keypair: owner, created } = loadOrCreateKeypair(keypairPath);
  const connection = new Connection(args.endpoint, "confirmed");
  await assertProgramDeployed(
    connection,
    PROGRAM_ID,
    "Solana Stellar",
    "Run make deploy-localnet in solana-stellar first."
  );
  const airdrop = await confirmAirdrop(connection, owner.publicKey, args.airdropSol);
  const wallet = new anchor.Wallet(owner);
  const client = createClient(connection, wallet, {
    commitment: "processed",
    preflightCommitment: "processed",
  });
  const arenaProgram = loadArenaProgram(args, client);
  if (arenaProgram) {
    await assertProgramDeployed(
      connection,
      arenaProgram.programId,
      "Ekza Arena",
      "Deploy solana-ekza-arena to the localnet or pass --skip-arena."
    );
  }

  const universeState =
    previousManifest ||
    (await createFreshUniverse({ args, client, metadataDir, owner, dataset }));
  const universe = new PublicKey(universeState.universe);
  const universeAccount = await client.program.account.universe.fetch(universe);
  let nextAssetIndex = universeAccount.assetCount.toNumber();
  let nextReleaseIndex = universeAccount.releaseCount.toNumber();

  const seeded = [];
  for (const avatar of selected) {
    const result = await seedAvatar({
      args,
      client,
      arenaProgram,
      metadataDir,
      owner,
      universe,
      avatar,
      assetIndex: nextAssetIndex,
      releaseIndex: nextReleaseIndex,
    });
    nextAssetIndex += 2;
    nextReleaseIndex += 1;
    seeded.push(result);
  }

  const manifest = {
    dataset: DATASET_ATTRIBUTION.dataset,
    endpoint: args.endpoint,
    programId: PROGRAM_ID.toBase58(),
    arenaProgramId: arenaProgram ? arenaProgram.programId.toBase58() : null,
    owner: owner.publicKey.toBase58(),
    ownerKeypair: path.relative(args.folder, keypairPath),
    ownerKeypairCreated: created,
    ownerAirdrop: airdrop,
    universe: universeState.universe,
    universeIndex: universeState.universeIndex,
    universeGlobalIndex: universeState.universeGlobalIndex,
    universeMetadataFile: universeState.universeMetadataFile,
    universeMetadataHash: universeState.universeMetadataHash,
    universeSignature: universeState.universeSignature,
    assets: [...(universeState.assets || []), ...seeded],
    createdAt: previousManifest?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(
    `\nSeeded ${seeded.length} avatar(s) into universe ${manifest.universe}` +
      (arenaProgram
        ? `; published ${seeded.filter((entry) => entry.arena).length} arena card(s).`
        : " (arena publish skipped).")
  );
  console.log(`Deployment manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error?.logs) {
    console.error(error.logs.join("\n"));
  }
  process.exit(1);
});
