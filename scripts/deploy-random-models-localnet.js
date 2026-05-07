#!/usr/bin/env node

const anchor = require("@coral-xyz/anchor");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  addAssetParent,
  approveAsset,
  createAsset,
  createClient,
  createUniverse,
  enumValue,
  nextUniverseIndex,
  PROGRAM_ID,
  submitAsset,
} = require("../sdk/dist/src");
const { Connection, Keypair, LAMPORTS_PER_SOL } = require("@solana/web3.js");

const DEFAULT_FOLDER = path.resolve(__dirname, "../univerces/everything");
const DEFAULT_ENDPOINT = "http://127.0.0.1:8899";
const MODEL_FORMATS = new Map([
  ["glb", new Set([".glb"])],
  ["obj", new Set([".obj"])],
  ["all", new Set([".glb", ".obj"])],
]);
const SERVICE_DIR_NAME = "_";
const EVERYTHING_LIBRARY_ATTRIBUTION = {
  title: "Everything Library - ANIMALS 0.2",
  source: "Everything Library - ANIMALS 0.2",
  author: "David OReilly",
  copyright: "Everything Library © David OReilly",
  sourceUrl: "http://davidoreilly.com/library",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  libraryLicenseUrl: "http://davidoreilly.com/library",
  creativeLicense: "Creative Commons Attribution 4.0 International License (CC BY 4.0)",
  softwareLicense: "MIT License",
  releasedAt: "2020-06-21",
  modified: false,
  modificationNote: "No model geometry, texture, rig, or animation changes were made by this seeding script.",
  note: "Original assets from the Everything Library ANIMALS pack. Attribution and license notice should be preserved in copies and derivatives.",
};
const EVERYTHING_LIBRARY_LICENSE_KIND = "ccBy4";
const EVERYTHING_LIBRARY_LICENSE_LABEL = "CC BY 4.0";
const EVERYTHING_LIBRARY_RIGHTS_NOTICE =
  "This 3D model is from Everything Library © David OReilly and is licensed under CC BY 4.0. The NFT/mint does not grant exclusive copyright ownership of the original model. The platform fee is charged only for minting/service infrastructure.";
const EVERYTHING_LIBRARY_DESCRIPTION =
  "3D animal model from Everything Library - ANIMALS 0.2 by David OReilly. Everything Library © David OReilly. Licensed under CC BY 4.0. Source: http://davidoreilly.com/library. License: https://creativecommons.org/licenses/by/4.0/. Modified: no model geometry, texture, rig, or animation changes were made by this seeding script.";

function parseArgs(argv) {
  const args = {
    folder: DEFAULT_FOLDER,
    count: 10,
    endpoint: DEFAULT_ENDPOINT,
    metadataBaseUrl: "http://127.0.0.1:8787",
    modelFormat: "glb",
    newUniverse: false,
    dryRun: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--folder" && next) {
      args.folder = path.resolve(next);
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
    } else if (arg === "--model-format" && next) {
      args.modelFormat = next.toLowerCase();
      index += 1;
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
  if (!MODEL_FORMATS.has(args.modelFormat)) {
    throw new Error("--model-format must be one of: glb, obj, all");
  }

  return args;
}

function printHelpAndExit() {
  console.log(`Usage:
  node scripts/deploy-random-models-localnet.js [--folder path] [--count 0|10|all] [--endpoint http://127.0.0.1:8899] [--metadata-base-url http://127.0.0.1:8787] [--model-format glb|obj|all] [--new-universe]

Creates or reuses a universe owner keypair under <folder>/_ and deploys random
.glb models into the existing manifest universe by default. Use
--model-format obj or --model-format all only for local loader diagnostics. Use
--new-universe to force a fresh universe.`);
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

function listModelFiles(folder, modelFormat) {
  const modelExtensions = MODEL_FORMATS.get(modelFormat);
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(folder, entry.name))
    .filter((filePath) =>
      modelExtensions.has(path.extname(filePath).toLowerCase())
    )
    .sort((a, b) => a.localeCompare(b));
}

function shuffle(values) {
  return values
    .map((value) => ({ value, order: crypto.randomInt(0, 2 ** 31 - 1) }))
    .sort((a, b) => a.order - b.order)
    .map(({ value }) => value);
}

function assetTitle(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

function shortHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function metadataPointer(metadataFile, metadataBaseUrl) {
  return `${metadataBaseUrl}/${SERVICE_DIR_NAME}/metadata/${path.basename(
    metadataFile
  )}`;
}

function modelPointer(relativePath, metadataBaseUrl) {
  return `${metadataBaseUrl}/${relativePath
    .split(path.sep)
    .map(encodeURIComponent)
    .join("/")}`;
}

function assetFilePointer(relativePath, metadataBaseUrl) {
  return `${metadataBaseUrl}/${relativePath
    .split(path.sep)
    .map(encodeURIComponent)
    .join("/")}`;
}

function findPreviewFile(folder, title) {
  const previewsDir = path.join(folder, SERVICE_DIR_NAME, "previews");
  if (fs.existsSync(previewsDir)) {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const previewFile = fs
      .readdirSync(previewsDir)
      .find((file) => new RegExp(`-${escapedTitle}\\.png$`).test(file));

    if (previewFile) return path.join(SERVICE_DIR_NAME, "previews", previewFile);
  }

  return null;
}

async function waitForAccount(connection, publicKey, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const account = await connection.getAccountInfo(publicKey, "confirmed");
    if (account) return account;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(
    `Timed out waiting for ${label} account ${publicKey.toBase58()}`
  );
}

async function confirmAirdrop(connection, publicKey, sol) {
  const before = await connection.getBalance(publicKey);
  if (before >= sol * LAMPORTS_PER_SOL) {
    return { requested: false, balanceLamports: before };
  }

  const signature = await connection.requestAirdrop(
    publicKey,
    sol * LAMPORTS_PER_SOL
  );
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  const after = await connection.getBalance(publicKey);
  return { requested: true, signature, balanceLamports: after };
}

async function assertProgramDeployed(connection) {
  const account = await connection.getAccountInfo(PROGRAM_ID);
  if (!account) {
    throw new Error(
      `Solana Stellar program ${PROGRAM_ID.toBase58()} is not deployed on the selected localnet. Run make deploy-localnet first.`
    );
  }
}

function loadManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

async function createFreshUniverse({
  args,
  client,
  metadataDir,
  owner,
  selectedCount,
}) {
  const universeIndex = await nextUniverseIndex(client, owner.publicKey);
  const universeMetadataFile = path.join(
    metadataDir,
    `universe-${universeIndex}-${shortHash(
      `${Date.now()}:${owner.publicKey.toBase58()}`
    )}.json`
  );
  const universeMetadata = {
    type: "universe",
    name: "Everything Localnet",
    title: "Everything Localnet",
    description:
      "Localnet universe seeded from Everything Library - ANIMALS 0.2, a collection of 3D animal models by David OReilly. Creative assets are licensed under Creative Commons Attribution 4.0 International; software/application materials are licensed under MIT. Source and license: http://davidoreilly.com/library.",
    attribution: EVERYTHING_LIBRARY_ATTRIBUTION,
    rightsNotice: EVERYTHING_LIBRARY_RIGHTS_NOTICE,
    sourceFolder: path.relative(process.cwd(), args.folder),
    modelFormat: args.modelFormat,
    modelCount: selectedCount,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    universeMetadataFile,
    JSON.stringify(universeMetadata, null, 2)
  );

  const universeMetadataHash = metadataPointer(
    universeMetadataFile,
    args.metadataBaseUrl
  );
  const {
    universe,
    globalIndex,
    signature: universeSignature,
  } = await createUniverse(client, {
    owner: owner.publicKey,
    universeIndex,
    metadataHash: universeMetadataHash,
    projectType: enumValue("model3D"),
    collaborationPolicy: enumValue("custom"),
    open: true,
  });
  await waitForAccount(client.connection, universe, "universe");

  return {
    universe: universe.toBase58(),
    universeIndex,
    universeGlobalIndex: globalIndex,
    universeMetadataFile: path.relative(args.folder, universeMetadataFile),
    universeMetadataHash,
    universeSignature,
    assets: [],
  };
}

async function createApprovedAsset({
  client,
  universe,
  owner,
  assetIndex,
  kind,
  subtype,
  licenseKind = enumValue(EVERYTHING_LIBRARY_LICENSE_KIND),
  metadataHash,
  previewHash = "",
}) {
  const { asset, signature: createSignature } = await createAsset(client, {
    universe,
    creator: owner.publicKey,
    assetIndex,
    kind,
    subtype,
    licenseKind,
    metadataHash,
    previewHash,
  });
  await waitForAccount(client.connection, asset, "asset");
  const { signature: submitSignature } = await submitAsset(client, {
    asset,
    creator: owner.publicKey,
  });
  const { signature: approveSignature } = await approveAsset(client, {
    universe,
    asset,
    owner: owner.publicKey,
  });

  return { asset, createSignature, submitSignature, approveSignature };
}

async function createModelAssetForProject({
  args,
  client,
  metadataDir,
  owner,
  universe,
  projectAsset,
  assetIndex,
  sourceFile,
  title,
  previewHash,
}) {
  const fileExtension = path.extname(sourceFile).toLowerCase();
  const metadataFile = path.join(
    metadataDir,
    `asset-${assetIndex}-model-${shortHash(`${sourceFile}:${Date.now()}`)}.json`
  );
  const metadata = {
    type: "asset",
    title: `${title} 3D Model`,
    description: `${title} 3D model. ${EVERYTHING_LIBRARY_DESCRIPTION}`,
    attribution: EVERYTHING_LIBRARY_ATTRIBUTION,
    rightsNotice: EVERYTHING_LIBRARY_RIGHTS_NOTICE,
    license_inherited: true,
    inherited_from_asset: projectAsset.toBase58(),
    medium_type: "3d",
    medium_sub_type: "model",
    source_id: 0,
    ipfs_hash: modelPointer(sourceFile, args.metadataBaseUrl),
    preview_ipfs_hash: previewHash || "",
    sourceFile,
    model_source_file: sourceFile,
    fileExtension,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

  const metadataHash = metadataPointer(metadataFile, args.metadataBaseUrl);
  console.log(
    `Creating model asset ${assetIndex} for ${projectAsset.toBase58()} from ${sourceFile}`
  );
  const { asset, signature: createSignature } = await createAsset(client, {
    universe,
    creator: owner.publicKey,
    assetIndex,
    kind: enumValue("model3D"),
    subtype: enumValue("mesh"),
    licenseKind: enumValue("unknown"),
    metadataHash,
    previewHash: previewHash || "",
  });
  await waitForAccount(client.connection, asset, "model asset");
  const { assetParent, signature: parentSignature } = await addAssetParent(
    client,
    {
      childAsset: asset,
      parentAsset: projectAsset,
      creator: owner.publicKey,
    }
  );
  await waitForAccount(client.connection, assetParent, "asset parent");
  const { signature: submitSignature } = await submitAsset(client, {
    asset,
    creator: owner.publicKey,
  });
  const { signature: approveSignature } = await approveAsset(client, {
    universe,
    asset,
    owner: owner.publicKey,
  });

  return {
    index: assetIndex,
    address: asset.toBase58(),
    metadataFile: path.relative(args.folder, metadataFile),
    metadataHash,
    parentLink: assetParent.toBase58(),
    parentSignature,
    createSignature,
    submitSignature,
    approveSignature,
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
  const creatingNewUniverse = args.newUniverse || !previousManifest;
  if (creatingNewUniverse && args.count !== "all" && args.count < 1) {
    throw new Error(
      "Creating a new universe requires --count >= 1 so it is not left empty."
    );
  }

  const files = listModelFiles(args.folder, args.modelFormat);
  const deployedSources = new Set(
    previousManifest?.assets?.map((asset) => asset.sourceFile) || []
  );
  const availableFiles = files.filter(
    (filePath) => !deployedSources.has(path.relative(args.folder, filePath))
  );
  const availableFilesWithViewportPreviews = availableFiles.filter((filePath) =>
    findPreviewFile(args.folder, assetTitle(filePath))
  );
  const selectableFiles =
    availableFilesWithViewportPreviews.length >=
    (args.count === "all" ? availableFiles.length : args.count)
      ? availableFilesWithViewportPreviews
      : availableFiles;
  const selectedFiles =
    args.count === "all"
      ? selectableFiles
      : shuffle(selectableFiles).slice(0, args.count);
  if (selectedFiles.length === 0 && creatingNewUniverse) {
    throw new Error(
      `No undeployed ${args.modelFormat} model files are available`
    );
  }
  if (args.count !== "all" && selectedFiles.length < args.count) {
    throw new Error(
      `Need ${args.count} undeployed model files, found ${selectedFiles.length} in ${args.folder}`
    );
  }

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          folder: args.folder,
          endpoint: args.endpoint,
          metadataBaseUrl: args.metadataBaseUrl,
          modelFormat: args.modelFormat,
          keypairPath,
          keypairExists: fs.existsSync(keypairPath),
          existingUniverse: previousManifest?.universe || null,
          newUniverse: creatingNewUniverse,
          alreadyDeployed: deployedSources.size,
          projectsToCreate: selectedFiles.length,
          modelAssetsToCreate: selectedFiles.length,
          selectedFiles,
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
  await assertProgramDeployed(connection);
  const airdrop = await confirmAirdrop(connection, owner.publicKey, 10);
  const wallet = new anchor.Wallet(owner);
  const client = createClient(connection, wallet, {
    commitment: "processed",
    preflightCommitment: "processed",
  });
  const universeState =
    previousManifest ||
    (await createFreshUniverse({
      args,
      client,
      metadataDir,
      owner,
      selectedCount: selectedFiles.length,
    }));
  const universe = new anchor.web3.PublicKey(universeState.universe);
  const universeAccount = await client.program.account.universe.fetch(universe);
  let nextAssetIndex = universeAccount.assetCount.toNumber();

  const assets = [];
  const existingAssets = universeState.assets || [];
  for (const existingAsset of existingAssets) {
    if (existingAsset.modelAssetAddress || !existingAsset.sourceFile) continue;

    const projectAsset = new anchor.web3.PublicKey(existingAsset.address);
    const title = existingAsset.title || assetTitle(existingAsset.sourceFile);
    const previewFile = findPreviewFile(args.folder, title);
    const previewHash = previewFile
      ? assetFilePointer(previewFile, args.metadataBaseUrl)
      : existingAsset.previewUrl || "";
    const modelAsset = await createModelAssetForProject({
      args,
      client,
      metadataDir,
      owner,
      universe,
      projectAsset,
      assetIndex: nextAssetIndex,
      sourceFile: existingAsset.sourceFile,
      title,
      previewHash,
    });
    nextAssetIndex += 1;

    existingAsset.modelAssetIndex = modelAsset.index;
    existingAsset.modelAssetAddress = modelAsset.address;
    existingAsset.modelAssetMetadataFile = modelAsset.metadataFile;
    existingAsset.modelAssetMetadataHash = modelAsset.metadataHash;
    existingAsset.modelAssetParentLink = modelAsset.parentLink;
    existingAsset.modelAssetParentSignature = modelAsset.parentSignature;
    existingAsset.modelAssetCreateSignature = modelAsset.createSignature;
    existingAsset.modelAssetSubmitSignature = modelAsset.submitSignature;
    existingAsset.modelAssetApproveSignature = modelAsset.approveSignature;
  }

  for (let index = 0; index < selectedFiles.length; index += 1) {
    const filePath = selectedFiles[index];
    const projectIndex = nextAssetIndex;
    const relativePath = path.relative(args.folder, filePath);
    const title = assetTitle(filePath);
    const previewFile = findPreviewFile(args.folder, title);
    const previewHash = previewFile
      ? assetFilePointer(previewFile, args.metadataBaseUrl)
      : "";
    const metadataFile = path.join(
      metadataDir,
      `asset-${projectIndex}-project-${shortHash(
        `${relativePath}:${Date.now()}`
      )}.json`
    );
    const metadata = {
      type: "project",
      open: true,
      title,
      description: `${title} character project. ${EVERYTHING_LIBRARY_DESCRIPTION}`,
      attribution: EVERYTHING_LIBRARY_ATTRIBUTION,
      rightsNotice: EVERYTHING_LIBRARY_RIGHTS_NOTICE,
      license_kind: EVERYTHING_LIBRARY_LICENSE_KIND,
      license_label: EVERYTHING_LIBRARY_LICENSE_LABEL,
      project_type: "creature",
      sourceFile: relativePath,
      model_source_file: relativePath,
      ipfs_img_hash: previewHash,
      preview_ipfs_hash: previewHash,
      fileExtension: path.extname(filePath).toLowerCase(),
      modelFormat: args.modelFormat,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

    const metadataHash = metadataPointer(metadataFile, args.metadataBaseUrl);
    const projectAsset = await createApprovedAsset({
      client,
      universe,
      owner,
      assetIndex: projectIndex,
      kind: enumValue("model3D"),
      subtype: enumValue("preview"),
      licenseKind: enumValue(EVERYTHING_LIBRARY_LICENSE_KIND),
      metadataHash,
      previewHash,
    });

    nextAssetIndex += 1;
    const modelAsset = await createModelAssetForProject({
      args,
      client,
      metadataDir,
      owner,
      universe,
      projectAsset: projectAsset.asset,
      assetIndex: nextAssetIndex,
      sourceFile: relativePath,
      title,
      previewHash,
    });
    nextAssetIndex += 1;

    assets.push({
      index: projectIndex,
      address: projectAsset.asset.toBase58(),
      title,
      sourceFile: relativePath,
      metadataFile: path.relative(args.folder, metadataFile),
      metadataHash,
      previewFile,
      previewUrl: previewHash,
      createSignature: projectAsset.createSignature,
      submitSignature: projectAsset.submitSignature,
      approveSignature: projectAsset.approveSignature,
      modelAssetIndex: modelAsset.index,
      modelAssetAddress: modelAsset.address,
      modelAssetMetadataFile: modelAsset.metadataFile,
      modelAssetMetadataHash: modelAsset.metadataHash,
      modelAssetParentLink: modelAsset.parentLink,
      modelAssetParentSignature: modelAsset.parentSignature,
      modelAssetCreateSignature: modelAsset.createSignature,
      modelAssetSubmitSignature: modelAsset.submitSignature,
      modelAssetApproveSignature: modelAsset.approveSignature,
    });
  }

  const manifest = {
    endpoint: args.endpoint,
    programId: PROGRAM_ID.toBase58(),
    modelFormat: args.modelFormat,
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
    assets: [...existingAssets, ...assets],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify(manifest, null, 2));
  console.log(
    `\nSeeded universe ${manifest.universe}: ${assets.length} project(s), ${
      assets.filter((asset) => asset.modelAssetAddress).length
    } model asset(s).`
  );
  console.log(`\nDeployment manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error?.logs) {
    console.error(error.logs.join("\n"));
  }
  process.exit(1);
});
