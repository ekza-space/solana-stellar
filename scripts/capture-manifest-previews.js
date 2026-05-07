#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair } = require("@solana/web3.js");
const { createClient, enumValue, updateAssetMetadata } = require("../sdk/dist/src");

const DEFAULT_FOLDER = path.resolve(__dirname, "../univerces/everything");
const DEFAULT_ENDPOINT = "http://127.0.0.1:8899";

function parseArgs(argv) {
  const args = {
    folder: DEFAULT_FOLDER,
    appUrl: "http://localhost:53328",
    endpoint: DEFAULT_ENDPOINT,
    metadataBaseUrl: "http://127.0.0.1:8787",
    limit: "all",
    updateChainPreview: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--folder" && next) {
      args.folder = path.resolve(next);
      index += 1;
    } else if (arg === "--app-url" && next) {
      args.appUrl = next.replace(/\/+$/, "");
      index += 1;
    } else if (arg === "--endpoint" && next) {
      args.endpoint = next;
      index += 1;
    } else if (arg === "--metadata-base-url" && next) {
      args.metadataBaseUrl = next.replace(/\/+$/, "");
      index += 1;
    } else if (arg === "--limit" && next) {
      args.limit = next === "all" ? "all" : Number(next);
      index += 1;
    } else if (arg === "--update-chain-preview") {
      args.updateChainPreview = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/capture-manifest-previews.js [--folder path] [--app-url http://localhost:53328] [--endpoint http://127.0.0.1:8899] [--metadata-base-url http://127.0.0.1:8787] [--limit all|3] [--update-chain-preview]"
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (
    args.limit !== "all" &&
    (!Number.isInteger(args.limit) || args.limit < 1)
  ) {
    throw new Error("--limit must be a positive integer or all");
  }

  return args;
}

function requirePlaywright() {
  const candidates = [
    "playwright",
    "/tmp/ekza-pw/node_modules/playwright",
    process.env.PLAYWRIGHT_PATH,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(
    "Playwright is not available. Run: mkdir -p /tmp/ekza-pw && cd /tmp/ekza-pw && npm init -y && npm install playwright && npx playwright install chromium"
  );
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function localMetadataFile(folder, metadataFileOrUrl) {
  if (!metadataFileOrUrl) return null;
  const relativePath = metadataFileOrUrl.startsWith("http")
    ? new URL(metadataFileOrUrl).pathname.replace(/^\/+/, "")
    : metadataFileOrUrl;
  return path.join(folder, relativePath);
}

function previewUrl(previewFile, folder, metadataBaseUrl) {
  const relativePath = path
    .relative(folder, previewFile)
    .split(path.sep)
    .join("/");
  return `${metadataBaseUrl}/${relativePath}`;
}

function loadKeypair(filePath) {
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf8")));
  return Keypair.fromSecretKey(secretKey);
}

async function updatePreviewHashOnChain({
  client,
  owner,
  assetAddress,
  metadataHash,
  previewHash,
}) {
  if (!assetAddress || !metadataHash || !previewHash) return null;

  const { signature } = await updateAssetMetadata(client, {
    asset: new anchor.web3.PublicKey(assetAddress),
    creator: owner.publicKey,
    licenseKind: enumValue("ccBy4"),
    metadataHash,
    previewHash,
  });

  return signature;
}

async function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.join(args.folder, "_", "deployment-manifest.json");
  const manifest = loadJson(manifestPath);
  const previewDir = path.join(args.folder, "_", "previews");
  fs.mkdirSync(previewDir, { recursive: true });

  const keypairPath = path.join(args.folder, manifest.ownerKeypair);
  const owner = fs.existsSync(keypairPath) ? loadKeypair(keypairPath) : null;
  const client =
    owner && args.updateChainPreview
      ? createClient(new Connection(args.endpoint, "confirmed"), new anchor.Wallet(owner), {
          commitment: "processed",
          preflightCommitment: "processed",
        })
      : null;

  const { chromium } = requirePlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.addInitScript(() => localStorage.clear());

  const selectedAssets = manifest.assets
    .filter((asset) => asset.modelAssetAddress && asset.modelAssetIndex != null)
    .slice(0, args.limit === "all" ? undefined : args.limit);
  const captured = [];
  const failed = [];

  for (const asset of selectedAssets) {
    try {
      const modelFile = path.join(args.folder, asset.sourceFile);
      if (!fs.existsSync(modelFile)) {
        console.warn(`Skipping missing model file: ${modelFile}`);
        failed.push({ title: asset.title, reason: "missing model file" });
        continue;
      }

      console.log(`Capturing preview for ${asset.title}: ${asset.sourceFile}`);
      await page.goto(`${args.appUrl}/create`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.getByRole("button", { name: "Asset" }).click();
      await page.setInputFiles('input[type="file"]', modelFile);
      const canvas = page.locator("canvas");
      await canvas.waitFor({ timeout: 60_000 });
      await canvas.scrollIntoViewIfNeeded();
      await page.waitForTimeout(2_500);

      const safeTitle = String(asset.title || asset.modelAssetAddress)
        .replace(/[^\w.-]+/g, "-")
        .slice(0, 60);
      const fileName = `${asset.modelAssetIndex}-${safeTitle}.png`;
      const filePath = path.join(previewDir, fileName);
      await canvas.screenshot({ path: filePath });
      const urlForMetadata = previewUrl(
        filePath,
        args.folder,
        args.metadataBaseUrl
      );

      const projectMetadataFile = localMetadataFile(
        args.folder,
        asset.metadataFile || asset.metadataHash
      );
      const modelMetadataFile = localMetadataFile(
        args.folder,
        asset.modelAssetMetadataFile || asset.modelAssetMetadataHash
      );
      if (projectMetadataFile && fs.existsSync(projectMetadataFile)) {
        const metadata = loadJson(projectMetadataFile);
        metadata.ipfs_img_hash = urlForMetadata;
        metadata.preview_ipfs_hash = urlForMetadata;
        writeJson(projectMetadataFile, metadata);
      }
      if (modelMetadataFile && fs.existsSync(modelMetadataFile)) {
        const metadata = loadJson(modelMetadataFile);
        metadata.preview_ipfs_hash = urlForMetadata;
        writeJson(modelMetadataFile, metadata);
      }

      asset.previewFile = path.relative(args.folder, filePath);
      asset.previewUrl = urlForMetadata;
      if (client && owner) {
        asset.previewUpdateSignature = await updatePreviewHashOnChain({
          client,
          owner,
          assetAddress: asset.address,
          metadataHash: asset.metadataHash,
          previewHash: urlForMetadata,
        });
        asset.modelAssetPreviewUpdateSignature = await updatePreviewHashOnChain({
          client,
          owner,
          assetAddress: asset.modelAssetAddress,
          metadataHash: asset.modelAssetMetadataHash,
          previewHash: urlForMetadata,
        });
      }
      captured.push({ title: asset.title, url: urlForMetadata });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to capture preview for ${asset.title}: ${reason}`);
      failed.push({ title: asset.title, sourceFile: asset.sourceFile, reason });
    }
  }

  manifest.updatedAt = new Date().toISOString();
  writeJson(manifestPath, manifest);
  await browser.close();

  console.log(
    JSON.stringify({ manifest: manifestPath, captured, failed }, null, 2)
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
