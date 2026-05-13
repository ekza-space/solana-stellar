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
  deriveAssetParent,
  enumValue,
  nextUniverseIndex,
  PROGRAM_ID,
  submitAsset,
} = require("../sdk/dist/src");
const { Connection, Keypair, LAMPORTS_PER_SOL } = require("@solana/web3.js");

const DEFAULT_FOLDER = path.resolve(__dirname, "../univerces/wotori");
const DEFAULT_ENDPOINT = "http://127.0.0.1:8899";
const SERVICE_DIR_NAME = "_";
const MAX_ON_CHAIN_POINTER_LEN = 96;
const WOTORI_LICENSE_KIND = "unknown";
const WOTORI_RIGHTS_NOTICE =
  "Original rights and licensing were not specified in the scraped Wotori Studio Stellar universe dump. Verify rights before public minting, resale, or derivative distribution.";

function parseArgs(argv) {
  const args = {
    folder: DEFAULT_FOLDER,
    dumpDir: null,
    endpoint: DEFAULT_ENDPOINT,
    metadataBaseUrl: "http://127.0.0.1:8787",
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
    } else if (arg === "--dump-dir" && next) {
      args.dumpDir = path.resolve(next);
      index += 1;
    } else if (arg === "--endpoint" && next) {
      args.endpoint = next;
      index += 1;
    } else if (arg === "--metadata-base-url" && next) {
      args.metadataBaseUrl = next.replace(/\/+$/, "");
      index += 1;
    } else if (arg === "--airdrop-sol" && next) {
      args.airdropSol = Number(next);
      index += 1;
    } else if (arg === "--skip-airdrop") {
      args.airdropSol = 0;
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

  if (!Number.isFinite(args.airdropSol) || args.airdropSol < 0) {
    throw new Error("--airdrop-sol must be a non-negative number");
  }

  return args;
}

function printHelpAndExit() {
  console.log(`Usage:
  node scripts/deploy-wotori-universe-localnet.js [--folder path] [--dump-dir path] [--endpoint http://127.0.0.1:8899] [--metadata-base-url http://127.0.0.1:8787] [--new-universe] [--dry-run]

Creates or reuses a Wotori Studio universe owner keypair under <folder>/_
and maps the scraped Archway Stellar universe dump into Solana Stellar:
one on-chain entity asset per dumped project, plus all dumped media assets
linked under that entity and linked to their legacy source asset when present.`);
  process.exit(0);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function loadOrCreateKeypair(keypairPath) {
  if (fs.existsSync(keypairPath)) {
    const secretKey = Uint8Array.from(
      JSON.parse(fs.readFileSync(keypairPath, "utf8"))
    );
    return { keypair: Keypair.fromSecretKey(secretKey), created: false };
  }

  const keypair = Keypair.generate();
  writeJson(keypairPath, Array.from(keypair.secretKey));
  fs.chmodSync(keypairPath, 0o600);
  return { keypair, created: true };
}

function shortHash(value, length = 16) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, length);
}

function fileHash(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function safeSlug(value, fallback = "item") {
  const slug = String(value || fallback)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function urlForRelativePath(relativePath, metadataBaseUrl) {
  return `${metadataBaseUrl}/${relativePath
    .split(path.sep)
    .map(encodeURIComponent)
    .join("/")}`;
}

function pointerForFile(folder, file, metadataBaseUrl) {
  return urlForRelativePath(path.relative(folder, file), metadataBaseUrl);
}

function assertOnChainPointer(value, label) {
  if (value.length > MAX_ON_CHAIN_POINTER_LEN) {
    throw new Error(
      `${label} is ${value.length} chars, max ${MAX_ON_CHAIN_POINTER_LEN}: ${value}`
    );
  }
}

function loadManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  return readJson(manifestPath);
}

function discoverDumpDir(folder, explicitDumpDir) {
  if (explicitDumpDir) {
    const manifestPath = path.join(explicitDumpDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Dump manifest does not exist: ${manifestPath}`);
    }
    return explicitDumpDir;
  }

  const dumpsDir = path.join(folder, "dumps");
  const candidates = fs.existsSync(dumpsDir)
    ? fs
        .readdirSync(dumpsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(dumpsDir, entry.name))
        .filter((dir) => fs.existsSync(path.join(dir, "manifest.json")))
        .sort((a, b) => a.localeCompare(b))
    : [];

  if (!candidates.length) {
    throw new Error(
      `No dump directory with manifest.json found under ${dumpsDir}. Pass --dump-dir.`
    );
  }

  return candidates[candidates.length - 1];
}

function loadProjectDirs(dumpDir) {
  const projectsRoot = path.join(dumpDir, "projects");
  const byAddress = new Map();
  if (!fs.existsSync(projectsRoot)) return byAddress;

  for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(projectsRoot, entry.name);
    const projectJson = path.join(dir, "project.json");
    if (!fs.existsSync(projectJson)) continue;
    const project = readJson(projectJson);
    if (project.address) byAddress.set(project.address, dir);
  }

  return byAddress;
}

function findFirstFile(dir, predicate) {
  if (!dir || !fs.existsSync(dir)) return null;
  return (
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(dir, entry.name))
      .find(predicate) || null
  );
}

function findProjectCover(projectDir) {
  return findFirstFile(path.join(projectDir, "media"), (file) =>
    path.basename(file).startsWith("project-cover.")
  );
}

function findAssetDir(projectDir, legacyAsset) {
  const assetsRoot = path.join(projectDir, "assets");
  if (!fs.existsSync(assetsRoot)) return null;

  const idPrefix = `${String(legacyAsset.id).padStart(3, "0")}-`;
  for (const entry of fs.readdirSync(assetsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(idPrefix)) continue;
    return path.join(assetsRoot, entry.name);
  }

  return null;
}

function findAssetMedia(assetDir) {
  const mediaDir = path.join(assetDir || "", "media");
  const mediaFile = findFirstFile(
    mediaDir,
    (file) => !path.basename(file).startsWith("asset-preview-")
  );
  const previewFile = findFirstFile(mediaDir, (file) =>
    path.basename(file).startsWith("asset-preview-")
  );
  return { mediaFile, previewFile };
}

function normalizeDescription(value, fallback) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") {
    return fallback;
  }
  return trimmed;
}

function formatLegacyDate(value) {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const ms = String(Math.trunc(n)).length === 10 ? n * 1000 : n;
  return new Date(ms).toISOString();
}

function mediumLabel(asset) {
  return [asset.medium_type, asset.medium_sub_type].filter(Boolean).join(" ");
}

function assetTitle(project, asset) {
  const title = project.info?.title || project.address || "Entity";
  const medium = mediumLabel(asset) || "asset";
  return `${title} ${String(asset.id).padStart(3, "0")} ${medium}`;
}

function fallbackAssetDescription(project, asset) {
  const title = project.info?.title || project.address || "Entity";
  const medium = mediumLabel(asset) || "creative";
  return `${title} ${medium} asset migrated from the Wotori Studio Archway Stellar universe dump.`;
}

function assetKind(mediumType) {
  const normalized = String(mediumType || "").toLowerCase();
  if (normalized === "img" || normalized === "image") return "image";
  if (
    normalized === "3d" ||
    normalized === "model" ||
    normalized === "model3d"
  ) {
    return "model3D";
  }
  if (normalized === "animation") return "animation";
  if (normalized === "audio") return "audio";
  if (normalized === "script") return "script";
  if (normalized === "text" || normalized === "metadata") return "metadata";
  return "other";
}

function assetSubtype(mediumSubType) {
  const normalized = String(mediumSubType || "").toLowerCase();
  if (normalized === "concept") return "concept";
  if (normalized === "sketch") return "sketch";
  if (normalized === "texture") return "texture";
  if (normalized === "model" || normalized === "mesh") return "mesh";
  if (normalized === "rig") return "rig";
  if (normalized === "motion" || normalized === "animation") return "motion";
  if (normalized === "preview") return "preview";
  if (normalized === "final") return "final";
  return "other";
}

function buildMigrationPlan({ dump, dumpDir, folder }) {
  const projectDirs = loadProjectDirs(dumpDir);
  const projects = (dump.projects || []).map((project, index) => {
    const projectDir = projectDirs.get(project.address) || null;
    const coverFile = projectDir ? findProjectCover(projectDir) : null;
    const assets = (project.assets || []).map((asset) => {
      const assetDir = projectDir ? findAssetDir(projectDir, asset) : null;
      const { mediaFile, previewFile } = findAssetMedia(assetDir);
      return {
        legacyAsset: asset,
        assetDir,
        mediaFile,
        previewFile,
        mediaRelativePath: mediaFile ? path.relative(folder, mediaFile) : null,
        previewRelativePath: previewFile
          ? path.relative(folder, previewFile)
          : null,
      };
    });

    return {
      order: index + 1,
      project,
      projectDir,
      coverFile,
      coverRelativePath: coverFile ? path.relative(folder, coverFile) : null,
      assets,
    };
  });

  const sourceLinks = [];
  for (const projectPlan of projects) {
    const ids = new Set(
      projectPlan.assets.map(({ legacyAsset }) => Number(legacyAsset.id))
    );
    for (const { legacyAsset } of projectPlan.assets) {
      const sourceId = Number(legacyAsset.source_id || 0);
      if (
        sourceId > 0 &&
        ids.has(sourceId) &&
        sourceId !== Number(legacyAsset.id)
      ) {
        sourceLinks.push({
          projectAddress: projectPlan.project.address,
          childLegacyAssetId: Number(legacyAsset.id),
          parentLegacyAssetId: sourceId,
        });
      }
    }
  }

  return {
    universe: dump.universe || {},
    sourceUniverseAddress: dump.universeAddress,
    projectCount: projects.length,
    assetCount: projects.reduce(
      (count, project) => count + project.assets.length,
      0
    ),
    entityParentLinkCount: projects.reduce(
      (count, project) => count + project.assets.length,
      0
    ),
    sourceParentLinkCount: sourceLinks.length,
    projects,
  };
}

function copyOrLink(source, destination) {
  ensureDir(path.dirname(destination));
  if (fs.existsSync(destination)) return;
  try {
    fs.linkSync(source, destination);
  } catch {
    fs.copyFileSync(source, destination);
  }
}

function prepareMedia({ args, serviceDir, sourceFile, prefix }) {
  if (!sourceFile) return null;
  const sha256 = fileHash(sourceFile);
  const extension = path.extname(sourceFile).toLowerCase() || ".bin";
  const filename = `${safeSlug(prefix)}-${sha256.slice(0, 16)}${extension}`;
  const destination = path.join(serviceDir, "media", filename);
  copyOrLink(sourceFile, destination);
  const url = pointerForFile(args.folder, destination, args.metadataBaseUrl);
  assertOnChainPointer(url, "media pointer");
  const stats = fs.statSync(sourceFile);
  return {
    file: path.relative(args.folder, destination),
    sourceFile: path.relative(args.folder, sourceFile),
    url,
    sha256,
    bytes: stats.size,
    extension,
  };
}

function metadataPointer(args, metadataFile) {
  const pointer = pointerForFile(
    args.folder,
    metadataFile,
    args.metadataBaseUrl
  );
  assertOnChainPointer(pointer, "metadata pointer");
  return pointer;
}

function buildUniverseMetadata({ args, dump, plan }) {
  const metadata = {
    type: "universe",
    title: plan.universe.name || "Wotori Studio",
    name: plan.universe.name || "Wotori Studio",
    description:
      plan.universe.description ||
      "Wotori Studio universe migrated from the original Archway Stellar contract.",
    source: "archway-stellar-dump",
    sourceUniverseAddress: plan.sourceUniverseAddress,
    sourceRpc: dump.rpc,
    scrapedAt: dump.scrapedAt,
    open: plan.universe.open,
    originalUniverse: plan.universe,
    projectCount: plan.projectCount,
    assetCount: plan.assetCount,
    rightsNotice: WOTORI_RIGHTS_NOTICE,
    migration: {
      script: path.basename(__filename),
      folder: path.relative(process.cwd(), args.folder),
      createdAt: new Date().toISOString(),
    },
  };

  return metadata;
}

function buildEntityMetadata({
  projectPlan,
  projectCover,
  sourceUniverseAddress,
}) {
  const { project, order } = projectPlan;
  const info = project.info || {};
  const title = info.title || project.address || `Entity ${order}`;
  return {
    type: "entity",
    title,
    name: title,
    description: normalizeDescription(
      info.description,
      `${title} entity migrated from the Wotori Studio Archway Stellar universe dump.`
    ),
    project_type: info.project_type || "entity",
    open: info.open,
    source: "archway-stellar-dump",
    sourceUniverseAddress,
    sourceProjectAddress: project.address,
    legacyOwner: project.owner,
    legacyProject: info,
    cover: projectCover
      ? {
          originalIpfsHash: info.img_ipfs_hash || "",
          ipfsHash: projectCover.url,
          localUrl: projectCover.url,
          localFile: projectCover.file,
          sourceFile: projectCover.sourceFile,
          sha256: projectCover.sha256,
          bytes: projectCover.bytes,
        }
      : null,
    ipfs_img_hash: projectCover?.url || info.img_ipfs_hash || "",
    preview_ipfs_hash: projectCover?.url || "",
    original_ipfs_img_hash: info.img_ipfs_hash || "",
    assetCount: project.assets?.length || 0,
    rightsNotice: WOTORI_RIGHTS_NOTICE,
    createdAt: formatLegacyDate(planTimestamp(info)) || null,
    migratedAt: new Date().toISOString(),
  };

  function planTimestamp(projectInfo) {
    return projectInfo.timestamp || projectInfo.date_time_utc || null;
  }
}

function buildAssetMetadata({
  assetPlan,
  media,
  preview,
  project,
  sourceUniverseAddress,
}) {
  const asset = assetPlan.legacyAsset;
  const title = assetTitle(project, asset);
  const description = normalizeDescription(
    asset.description,
    fallbackAssetDescription(project, asset)
  );
  return {
    type: "asset",
    title,
    description,
    entityTitle: project.info?.title || "",
    source: "archway-stellar-dump",
    sourceUniverseAddress,
    sourceProjectAddress: project.address,
    legacyOwner: project.owner,
    legacyAssetId: asset.id,
    source_id: asset.source_id,
    medium_type: asset.medium_type || "",
    medium_sub_type: asset.medium_sub_type || "",
    ipfs_hash: media?.url || asset.ipfs_hash || "",
    ipfs_img_hash:
      assetKind(asset.medium_type) === "image" ? media?.url || "" : "",
    preview_ipfs_hash:
      preview?.url ||
      (assetKind(asset.medium_type) === "image" ? media?.url : "") ||
      "",
    original_ipfs_hash: asset.ipfs_hash || "",
    original_preview_ipfs_hash: asset.preview_ipfs_hash || "",
    local_media_url: media?.url || "",
    local_preview_url: preview?.url || "",
    media,
    preview,
    license_kind: WOTORI_LICENSE_KIND,
    rightsNotice: WOTORI_RIGHTS_NOTICE,
    createdAt: formatLegacyDate(asset.date_time_utc),
    migratedAt: new Date().toISOString(),
  };
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
  if (sol <= 0 || before >= sol * LAMPORTS_PER_SOL) {
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

async function createFreshUniverse({
  args,
  client,
  dump,
  metadataDir,
  owner,
  plan,
}) {
  const universeIndex = await nextUniverseIndex(client, owner.publicKey);
  const metadataFile = path.join(
    metadataDir,
    `universe-${universeIndex}-${shortHash(
      plan.sourceUniverseAddress || "wotori"
    )}.json`
  );
  writeJson(metadataFile, buildUniverseMetadata({ args, dump, plan }));

  const universeMetadataHash = metadataPointer(args, metadataFile);
  const {
    universe,
    globalIndex,
    signature: universeSignature,
  } = await createUniverse(client, {
    owner: owner.publicKey,
    universeIndex,
    metadataHash: universeMetadataHash,
    projectType: enumValue("metadata"),
    collaborationPolicy: enumValue("custom"),
    open: plan.universe.open !== false,
  });
  await waitForAccount(client.connection, universe, "universe");

  return {
    universe: universe.toBase58(),
    universeIndex,
    universeGlobalIndex: globalIndex,
    universeMetadataFile: path.relative(args.folder, metadataFile),
    universeMetadataHash,
    universeSignature,
    entities: [],
  };
}

async function createApprovedAsset({
  client,
  universe,
  owner,
  assetIndex,
  kind,
  subtype,
  metadataHash,
  previewHash,
  label,
}) {
  const { asset, signature: createSignature } = await createAsset(client, {
    universe,
    creator: owner.publicKey,
    assetIndex,
    kind,
    subtype,
    licenseKind: enumValue(WOTORI_LICENSE_KIND),
    metadataHash,
    previewHash,
  });
  await waitForAccount(client.connection, asset, label);
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

async function createDraftAsset({
  client,
  universe,
  owner,
  assetIndex,
  kind,
  subtype,
  metadataHash,
  previewHash,
  label,
}) {
  const { asset, signature: createSignature } = await createAsset(client, {
    universe,
    creator: owner.publicKey,
    assetIndex,
    kind,
    subtype,
    licenseKind: enumValue(WOTORI_LICENSE_KIND),
    metadataHash,
    previewHash,
  });
  await waitForAccount(client.connection, asset, label);
  return { asset, createSignature };
}

function enumKey(value) {
  if (!value || typeof value !== "object") return "unknown";
  return Object.keys(value)[0] || "unknown";
}

async function fetchAssetStatus(client, assetAddress) {
  const asset = await client.program.account.asset.fetch(assetAddress);
  return enumKey(asset.status);
}

async function requireDraftForLink(client, assetAddress, title) {
  const status = await fetchAssetStatus(client, assetAddress);
  if (status !== "draft") {
    throw new Error(
      `Cannot add missing parent links for ${title}: asset is ${status}. Re-run with make seed-new-wotori-localnet for a fresh universe.`
    );
  }
}

async function submitAndApproveAsset({
  client,
  universe,
  owner,
  assetAddress,
  manifestAsset,
}) {
  const asset = new anchor.web3.PublicKey(assetAddress);
  const status = await fetchAssetStatus(client, asset);
  if (status === "approved") {
    manifestAsset.status = "approved";
    return;
  }

  if (status === "draft") {
    const { signature: submitSignature } = await submitAsset(client, {
      asset,
      creator: owner.publicKey,
    });
    manifestAsset.submitSignature = submitSignature;
  } else if (status !== "submitted") {
    throw new Error(
      `Cannot approve ${manifestAsset.title}: unexpected asset status ${status}`
    );
  }

  const { signature: approveSignature } = await approveAsset(client, {
    universe,
    asset,
    owner: owner.publicKey,
  });
  manifestAsset.approveSignature = approveSignature;
  manifestAsset.status = "approved";
}

async function ensureParentLink({
  client,
  childAsset,
  parentAsset,
  creator,
  label,
}) {
  const assetParent = deriveAssetParent(childAsset, parentAsset);
  const existing = await client.connection.getAccountInfo(
    assetParent,
    "confirmed"
  );
  if (existing) {
    return { assetParent, reused: true, signature: null };
  }

  const { signature } = await addAssetParent(client, {
    childAsset,
    parentAsset,
    creator: creator.publicKey,
  });
  await waitForAccount(client.connection, assetParent, label);
  return { assetParent, reused: false, signature };
}

function findManifestEntity(manifest, projectAddress) {
  return (manifest.entities || []).find(
    (entity) => entity.sourceProjectAddress === projectAddress
  );
}

function findManifestAsset(entity, legacyAssetId) {
  return (entity.assets || []).find(
    (asset) => Number(asset.legacyAssetId) === Number(legacyAssetId)
  );
}

function writeDeploymentManifest(manifestPath, manifest) {
  manifest.assets = (manifest.entities || []).flatMap((entity) => {
    const entityAsset = {
      type: "entity",
      index: entity.index,
      address: entity.address,
      title: entity.title,
      sourceProjectAddress: entity.sourceProjectAddress,
      projectType: entity.projectType,
      metadataFile: entity.metadataFile,
      metadataHash: entity.metadataHash,
      previewFile: entity.previewFile,
      previewUrl: entity.previewUrl,
      childAssetCount: entity.assets?.length || 0,
    };
    const childAssets = (entity.assets || []).map((asset) => ({
      ...asset,
      type: "asset",
      entityAddress: entity.address,
      entityTitle: entity.title,
      sourceProjectAddress: entity.sourceProjectAddress,
    }));
    return [entityAsset, ...childAssets];
  });
  manifest.assetLinks = (manifest.entities || []).flatMap((entity) =>
    (entity.assets || []).flatMap((asset) => {
      const links = [];
      if (asset.entityParentLink) {
        links.push({
          type: "entity",
          childAsset: asset.address,
          parentAsset: entity.address,
          parentLink: asset.entityParentLink,
        });
      }
      if (asset.sourceParentLink) {
        const parent = (entity.assets || []).find(
          (candidate) =>
            Number(candidate.legacyAssetId) === Number(asset.sourceId)
        );
        links.push({
          type: "source",
          childAsset: asset.address,
          parentAsset: parent?.address || "",
          parentLegacyAssetId: asset.sourceId,
          parentLink: asset.sourceParentLink,
        });
      }
      return links;
    })
  );
  manifest.updatedAt = new Date().toISOString();
  writeJson(manifestPath, manifest);
}

async function deployEntity({
  args,
  client,
  metadataDir,
  owner,
  plan,
  projectPlan,
  serviceDir,
  universe,
  nextAssetIndex,
}) {
  const { project, order } = projectPlan;
  const title = project.info?.title || project.address || `Entity ${order}`;
  const cover = prepareMedia({
    args,
    serviceDir,
    sourceFile: projectPlan.coverFile,
    prefix: `entity-${String(order).padStart(3, "0")}-${title}-cover`,
  });
  const metadataFile = path.join(
    metadataDir,
    `entity-${String(order).padStart(3, "0")}-${shortHash(
      project.address
    )}.json`
  );
  const metadata = buildEntityMetadata({
    projectPlan,
    projectCover: cover,
    sourceUniverseAddress: plan.sourceUniverseAddress,
  });
  writeJson(metadataFile, metadata);

  const metadataHash = metadataPointer(args, metadataFile);
  const previewHash = cover?.url || "";
  if (previewHash) assertOnChainPointer(previewHash, "entity preview pointer");
  console.log(`Creating entity ${nextAssetIndex}: ${title}`);
  const entityAsset = await createApprovedAsset({
    client,
    universe,
    owner,
    assetIndex: nextAssetIndex,
    kind: enumValue("metadata"),
    subtype: enumValue("preview"),
    metadataHash,
    previewHash,
    label: "entity asset",
  });

  return {
    index: nextAssetIndex,
    address: entityAsset.asset.toBase58(),
    title,
    sourceProjectAddress: project.address,
    projectType: project.info?.project_type || "",
    metadataFile: path.relative(args.folder, metadataFile),
    metadataHash,
    previewFile: cover?.file || null,
    previewUrl: previewHash,
    createSignature: entityAsset.createSignature,
    submitSignature: entityAsset.submitSignature,
    approveSignature: entityAsset.approveSignature,
    assets: [],
  };
}

function refreshEntityMetadata({
  args,
  entity,
  plan,
  projectPlan,
  serviceDir,
}) {
  if (!entity.metadataFile) return;
  const { project, order } = projectPlan;
  const title = project.info?.title || project.address || `Entity ${order}`;
  const cover = prepareMedia({
    args,
    serviceDir,
    sourceFile: projectPlan.coverFile,
    prefix: `entity-${String(order).padStart(3, "0")}-${title}-cover`,
  });
  const metadataFile = path.join(args.folder, entity.metadataFile);
  writeJson(
    metadataFile,
    buildEntityMetadata({
      projectPlan,
      projectCover: cover,
      sourceUniverseAddress: plan.sourceUniverseAddress,
    })
  );
  entity.previewFile = cover?.file || entity.previewFile || null;
  entity.previewUrl = cover?.url || entity.previewUrl || "";
}

function prepareLegacyAssetMetadata({
  args,
  assetPlan,
  metadataDir,
  plan,
  projectPlan,
  serviceDir,
  nextAssetIndex,
}) {
  const { legacyAsset } = assetPlan;
  const media = prepareMedia({
    args,
    serviceDir,
    sourceFile: assetPlan.mediaFile,
    prefix: `asset-${String(projectPlan.order).padStart(3, "0")}-${String(
      legacyAsset.id
    ).padStart(3, "0")}-${legacyAsset.medium_type || "media"}`,
  });
  const preview = prepareMedia({
    args,
    serviceDir,
    sourceFile: assetPlan.previewFile,
    prefix: `asset-${String(projectPlan.order).padStart(3, "0")}-${String(
      legacyAsset.id
    ).padStart(3, "0")}-preview`,
  });
  const metadataFile = path.join(
    metadataDir,
    `asset-${nextAssetIndex}-${String(legacyAsset.id).padStart(
      3,
      "0"
    )}-${shortHash(`${projectPlan.project.address}:${legacyAsset.id}`)}.json`
  );
  const metadata = buildAssetMetadata({
    assetPlan: { ...assetPlan, media, preview },
    media,
    preview,
    project: projectPlan.project,
    sourceUniverseAddress: plan.sourceUniverseAddress,
  });
  writeJson(metadataFile, metadata);

  return { media, preview, metadataFile };
}

function refreshLegacyAssetMetadata({
  args,
  asset,
  assetPlan,
  plan,
  projectPlan,
  serviceDir,
}) {
  if (!asset.metadataFile) return;
  const metadataDir = path.dirname(path.join(args.folder, asset.metadataFile));
  const { media, preview, metadataFile } = prepareLegacyAssetMetadata({
    args,
    assetPlan,
    metadataDir,
    plan,
    projectPlan,
    serviceDir,
    nextAssetIndex: asset.index,
  });
  asset.mediaFile = media?.file || null;
  asset.mediaUrl = media?.url || "";
  asset.previewFile = preview?.file || null;
  asset.previewUrl =
    preview?.url ||
    (assetKind(assetPlan.legacyAsset.medium_type) === "image"
      ? media?.url
      : "") ||
    asset.previewUrl ||
    "";
  asset.metadataFile = path.relative(args.folder, metadataFile);
}

async function deployLegacyAssetDraft({
  args,
  assetPlan,
  client,
  metadataDir,
  owner,
  plan,
  projectPlan,
  serviceDir,
  universe,
  nextAssetIndex,
}) {
  const { legacyAsset } = assetPlan;
  const title = assetTitle(projectPlan.project, legacyAsset);
  const { media, preview, metadataFile } = prepareLegacyAssetMetadata({
    args,
    assetPlan,
    metadataDir,
    plan,
    projectPlan,
    serviceDir,
    nextAssetIndex,
  });

  const metadataHash = metadataPointer(args, metadataFile);
  const previewHash =
    preview?.url ||
    (assetKind(legacyAsset.medium_type) === "image" ? media?.url : "") ||
    "";
  if (previewHash) assertOnChainPointer(previewHash, "asset preview pointer");
  console.log(`Creating draft asset ${nextAssetIndex}: ${title}`);
  const createdAsset = await createDraftAsset({
    client,
    universe,
    owner,
    assetIndex: nextAssetIndex,
    kind: enumValue(assetKind(legacyAsset.medium_type)),
    subtype: enumValue(assetSubtype(legacyAsset.medium_sub_type)),
    metadataHash,
    previewHash,
    label: "legacy asset",
  });

  return {
    index: nextAssetIndex,
    address: createdAsset.asset.toBase58(),
    title,
    legacyAssetId: legacyAsset.id,
    sourceId: legacyAsset.source_id,
    mediumType: legacyAsset.medium_type || "",
    mediumSubType: legacyAsset.medium_sub_type || "",
    metadataFile: path.relative(args.folder, metadataFile),
    metadataHash,
    mediaFile: media?.file || null,
    mediaUrl: media?.url || "",
    previewFile: preview?.file || null,
    previewUrl: previewHash,
    originalIpfsHash: legacyAsset.ipfs_hash || "",
    originalPreviewIpfsHash: legacyAsset.preview_ipfs_hash || "",
    createSignature: createdAsset.createSignature,
    status: "draft",
  };
}

async function ensureEntityParentLinks({ client, entity, owner }) {
  const parentAsset = new anchor.web3.PublicKey(entity.address);
  for (const asset of entity.assets || []) {
    if (asset.entityParentLink) continue;
    const childAsset = new anchor.web3.PublicKey(asset.address);
    await requireDraftForLink(client, childAsset, asset.title);
    const entityLink = await ensureParentLink({
      client,
      childAsset,
      parentAsset,
      creator: owner,
      label: "entity parent link",
    });
    asset.entityParentLink = entityLink.assetParent.toBase58();
    asset.entityParentLinkReused = entityLink.reused;
    asset.entityParentSignature = entityLink.signature;
  }
}

async function ensureLegacySourceLinks({ client, entity, owner }) {
  const byLegacyId = new Map(
    (entity.assets || []).map((asset) => [Number(asset.legacyAssetId), asset])
  );

  for (const asset of entity.assets || []) {
    if (asset.sourceParentLink) continue;
    const sourceId = Number(asset.sourceId || 0);
    const parent = byLegacyId.get(sourceId);
    if (!sourceId || !parent || Number(asset.legacyAssetId) === sourceId) {
      continue;
    }

    const childAsset = new anchor.web3.PublicKey(asset.address);
    const parentAsset = new anchor.web3.PublicKey(parent.address);
    await requireDraftForLink(client, childAsset, asset.title);
    const link = await ensureParentLink({
      client,
      childAsset,
      parentAsset,
      creator: owner,
      label: "legacy source parent link",
    });
    asset.sourceParentLink = link.assetParent.toBase58();
    asset.sourceParentLinkReused = link.reused;
    asset.sourceParentSignature = link.signature;
  }
}

async function approveEntityAssets({ client, entity, owner, universe }) {
  for (const asset of entity.assets || []) {
    if (asset.status === "approved" && asset.approveSignature) continue;
    await submitAndApproveAsset({
      client,
      universe,
      owner,
      assetAddress: asset.address,
      manifestAsset: asset,
    });
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.folder)) {
    throw new Error(`Folder does not exist: ${args.folder}`);
  }

  const dumpDir = discoverDumpDir(args.folder, args.dumpDir);
  const dump = readJson(path.join(dumpDir, "manifest.json"));
  const plan = buildMigrationPlan({ dump, dumpDir, folder: args.folder });

  const serviceDir = path.join(args.folder, SERVICE_DIR_NAME);
  const metadataDir = path.join(serviceDir, "metadata");
  const keypairPath = path.join(serviceDir, "universe-owner-keypair.json");
  const manifestPath = path.join(serviceDir, "deployment-manifest.json");
  const previousManifest = args.newUniverse ? null : loadManifest(manifestPath);

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          folder: args.folder,
          dumpDir,
          endpoint: args.endpoint,
          metadataBaseUrl: args.metadataBaseUrl,
          keypairPath,
          keypairExists: fs.existsSync(keypairPath),
          existingUniverse: previousManifest?.universe || null,
          newUniverse: args.newUniverse || !previousManifest,
          universeTitle: plan.universe.name || "Wotori Studio",
          sourceUniverseAddress: plan.sourceUniverseAddress,
          entitiesToMap: plan.projectCount,
          assetsToMap: plan.assetCount,
          entityParentLinks: plan.entityParentLinkCount,
          legacySourceLinks: plan.sourceParentLinkCount,
          entities: plan.projects.map((projectPlan) => ({
            title:
              projectPlan.project.info?.title || projectPlan.project.address,
            projectType: projectPlan.project.info?.project_type || "",
            sourceProjectAddress: projectPlan.project.address,
            assets: projectPlan.assets.length,
            coverFile: projectPlan.coverRelativePath,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  ensureDir(metadataDir);
  ensureDir(path.join(serviceDir, "media"));

  const { keypair: owner, created } = loadOrCreateKeypair(keypairPath);
  const connection = new Connection(args.endpoint, "confirmed");
  await assertProgramDeployed(connection);
  const airdrop = await confirmAirdrop(
    connection,
    owner.publicKey,
    args.airdropSol
  );
  const wallet = new anchor.Wallet(owner);
  const client = createClient(connection, wallet, {
    commitment: "processed",
    preflightCommitment: "processed",
  });

  const manifest =
    previousManifest ||
    (await createFreshUniverse({
      args,
      client,
      dump,
      metadataDir,
      owner,
      plan,
    }));
  manifest.endpoint = args.endpoint;
  manifest.programId = PROGRAM_ID.toBase58();
  manifest.owner = owner.publicKey.toBase58();
  manifest.ownerKeypair = path.relative(args.folder, keypairPath);
  manifest.ownerKeypairCreated = created;
  manifest.ownerAirdrop = airdrop;
  manifest.source = "archway-stellar-dump";
  manifest.sourceUniverseAddress = plan.sourceUniverseAddress;
  manifest.dumpDir = path.relative(args.folder, dumpDir);
  manifest.entities = manifest.entities || [];
  manifest.createdAt = manifest.createdAt || new Date().toISOString();
  writeDeploymentManifest(manifestPath, manifest);

  const universe = new anchor.web3.PublicKey(manifest.universe);
  const universeAccount = await client.program.account.universe.fetch(universe);
  let nextAssetIndex = universeAccount.assetCount.toNumber();

  for (const projectPlan of plan.projects) {
    let entity = findManifestEntity(manifest, projectPlan.project.address);
    if (!entity) {
      entity = await deployEntity({
        args,
        client,
        metadataDir,
        owner,
        plan,
        projectPlan,
        serviceDir,
        universe,
        nextAssetIndex,
      });
      nextAssetIndex += 1;
      manifest.entities.push(entity);
      writeDeploymentManifest(manifestPath, manifest);
    } else {
      refreshEntityMetadata({
        args,
        entity,
        plan,
        projectPlan,
        serviceDir,
      });
      writeDeploymentManifest(manifestPath, manifest);
    }

    entity.assets = entity.assets || [];
    for (const assetPlan of projectPlan.assets) {
      let deployedAsset = findManifestAsset(entity, assetPlan.legacyAsset.id);
      if (deployedAsset) {
        refreshLegacyAssetMetadata({
          args,
          asset: deployedAsset,
          assetPlan,
          plan,
          projectPlan,
          serviceDir,
        });
        writeDeploymentManifest(manifestPath, manifest);
        continue;
      }

      deployedAsset = await deployLegacyAssetDraft({
        args,
        assetPlan,
        client,
        metadataDir,
        owner,
        plan,
        projectPlan,
        serviceDir,
        universe,
        nextAssetIndex,
      });
      nextAssetIndex += 1;
      entity.assets.push(deployedAsset);
      writeDeploymentManifest(manifestPath, manifest);
    }

    await ensureEntityParentLinks({ client, entity, owner });
    writeDeploymentManifest(manifestPath, manifest);
    await ensureLegacySourceLinks({ client, entity, owner });
    writeDeploymentManifest(manifestPath, manifest);
    await approveEntityAssets({ client, entity, owner, universe });
    writeDeploymentManifest(manifestPath, manifest);
  }

  manifest.summary = {
    entities: manifest.entities.length,
    assets: manifest.entities.reduce(
      (count, entity) => count + (entity.assets?.length || 0),
      0
    ),
    entityParentLinks: manifest.entities.reduce(
      (count, entity) =>
        count +
        (entity.assets || []).filter((asset) => asset.entityParentLink).length,
      0
    ),
    legacySourceLinks: manifest.entities.reduce(
      (count, entity) =>
        count +
        (entity.assets || []).filter((asset) => asset.sourceParentLink).length,
      0
    ),
  };
  writeDeploymentManifest(manifestPath, manifest);

  console.log(JSON.stringify(manifest, null, 2));
  console.log(
    `\nSeeded Wotori universe ${manifest.universe}: ${manifest.summary.entities} entities, ${manifest.summary.assets} assets.`
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
