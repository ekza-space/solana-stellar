#!/usr/bin/env node
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile, copyFile, link, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const DEFAULT_RPC = "https://rpc.constantine.archway.io:443";
const DEFAULT_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://dweb.link/ipfs/",
];

const requireFromHere = createRequire(import.meta.url);

function loadCosmWasmClient() {
  const candidates = [
    () => requireFromHere("@cosmjs/cosmwasm-stargate"),
    () => createRequire("/private/tmp/stellar-scrape/package.json")("@cosmjs/cosmwasm-stargate"),
  ];

  for (const load of candidates) {
    try {
      return load().CosmWasmClient;
    } catch {
      // Try the next known location.
    }
  }

  throw new Error(
    "Cannot load @cosmjs/cosmwasm-stargate. Install it in this repo or in /private/tmp/stellar-scrape."
  );
}

function usage() {
  console.error(
    [
      "Usage:",
      "  node scripts/dump_stellar_universe.mjs <universe-address> [output-dir]",
      "",
      "Environment:",
      `  STELLAR_RPC=${DEFAULT_RPC}`,
      `  IPFS_GATEWAYS=${DEFAULT_GATEWAYS.join(",")}`,
    ].join("\n")
  );
}

function shortAddress(value) {
  return value ? `${value.slice(0, 10)}...${value.slice(-6)}` : "unknown";
}

function safeName(value, fallback = "untitled") {
  const normalized = String(value || fallback)
    .trim()
    .replace(/[^\w .-]+/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return normalized || fallback;
}

function jsonString(value) {
  return JSON.stringify(value, null, 2);
}

function formatDate(value) {
  if (!value) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const ms = String(Math.trunc(n)).length === 10 ? n * 1000 : n;
  return new Date(ms).toISOString();
}

function isRealHash(hash) {
  return Boolean(hash && typeof hash === "string" && hash !== "undefined" && hash !== "null");
}

function contentExtension(contentType, buffer) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  const head = buffer.subarray(0, 16);
  const ascii = head.toString("ascii");

  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return ".jpg";
  if (head[0] === 0x89 && ascii.slice(1, 4) === "PNG") return ".png";
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return ".gif";
  if (ascii.startsWith("RIFF") && buffer.subarray(8, 12).toString("ascii") === "WEBP") return ".webp";
  if (ascii.startsWith("glTF")) return ".glb";
  if (ascii.startsWith("PK\x03\x04")) return ".zip";

  const map = new Map([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
    ["image/gif", ".gif"],
    ["image/svg+xml", ".svg"],
    ["application/json", ".json"],
    ["model/gltf-binary", ".glb"],
    ["model/gltf+json", ".gltf"],
    ["text/plain", ".txt"],
    ["text/markdown", ".md"],
    ["application/octet-stream", ".bin"],
  ]);
  return map.get(type) || ".bin";
}

function mediaLabel(ref) {
  const parts = [ref.role, ref.mediumType, ref.mediumSubType, ref.assetId].filter(Boolean);
  return safeName(parts.join("-"), ref.role || "media").toLowerCase();
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function writeJson(file, value) {
  await ensureDir(path.dirname(file));
  await writeFile(file, `${jsonString(value)}\n`);
}

async function writeText(file, value) {
  await ensureDir(path.dirname(file));
  await writeFile(file, value);
}

async function querySmart(client, contract, msg) {
  return client.queryContractSmart(contract, msg);
}

async function downloadWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "stellar-universe-dumper/1.0" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return {
      url,
      contentType: response.headers.get("content-type") || "",
      buffer: Buffer.from(arrayBuffer),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function downloadIpfs(hash, mediaRoot, gateways, timeoutMs) {
  const errors = [];
  for (const gateway of gateways) {
    const url = `${gateway.replace(/\/?$/, "/")}${hash}`;
    try {
      const result = await downloadWithTimeout(url, timeoutMs);
      const ext = contentExtension(result.contentType, result.buffer);
      const file = path.join(mediaRoot, `${hash}${ext}`);
      await writeFile(file, result.buffer);
      const metadata = {
        hash,
        url: result.url,
        contentType: result.contentType,
        extension: ext,
        bytes: result.buffer.length,
      };
      await writeJson(path.join(mediaRoot, `${hash}.meta.json`), metadata);
      return { ok: true, ...metadata, file };
    } catch (error) {
      errors.push({ gateway, error: error.message });
    }
  }
  return { ok: false, hash, errors };
}

async function copyOrLink(source, destination) {
  await ensureDir(path.dirname(destination));
  try {
    await link(source, destination);
  } catch {
    await copyFile(source, destination);
  }
}

function collectMediaRefs(project) {
  const refs = [];
  const projectTitle = project.info?.title || project.address;
  if (isRealHash(project.info?.img_ipfs_hash)) {
    refs.push({
      hash: project.info.img_ipfs_hash,
      role: "project-cover",
      owner: project.owner,
      projectAddress: project.address,
      projectTitle,
    });
  }

  for (const asset of project.assets || []) {
    if (isRealHash(asset.ipfs_hash)) {
      refs.push({
        hash: asset.ipfs_hash,
        role: "asset",
        owner: project.owner,
        projectAddress: project.address,
        projectTitle,
        assetId: asset.id,
        mediumType: asset.medium_type,
        mediumSubType: asset.medium_sub_type,
      });
    }
    if (isRealHash(asset.preview_ipfs_hash)) {
      refs.push({
        hash: asset.preview_ipfs_hash,
        role: "asset-preview",
        owner: project.owner,
        projectAddress: project.address,
        projectTitle,
        assetId: asset.id,
        mediumType: asset.medium_type,
        mediumSubType: asset.medium_sub_type,
      });
    }
  }
  return refs;
}

async function maybeReadText(file) {
  try {
    const stats = await stat(file);
    if (stats.size > 512 * 1024) return null;
    const buffer = await readFile(file);
    const sample = buffer.subarray(0, Math.min(buffer.length, 256));
    if (sample.includes(0)) return null;
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

function projectMarkdown(project, refs) {
  const info = project.info || {};
  const lines = [
    `# ${info.title || project.address}`,
    "",
    `Address: ${project.address}`,
    `Owner: ${project.owner}`,
    `Type: ${info.project_type || ""}`,
    `Open: ${info.open}`,
    `Assets: ${(project.assets || []).length}`,
    "",
    "## Description",
    "",
    info.description || "No description.",
    "",
    "## Popup Text",
    "",
    info.description || "undefined project description",
    "",
    "## Media",
    "",
    ...refs.map((ref) => `- ${ref.role}: ${ref.hash}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function assetMarkdown(asset, textContent) {
  const lines = [
    `# Asset ${asset.id}`,
    "",
    `Medium type: ${asset.medium_type || ""}`,
    `Medium subtype: ${asset.medium_sub_type || ""}`,
    `Minter: ${asset.minter || ""}`,
    `Title: ${asset.title || ""}`,
    `Description: ${asset.description || ""}`,
    `IPFS hash: ${asset.ipfs_hash || ""}`,
    `Preview IPFS hash: ${asset.preview_ipfs_hash || ""}`,
    `Source ID: ${asset.source_id ?? ""}`,
    `Created: ${formatDate(asset.date_time_utc)}`,
    "",
  ];
  if (textContent) {
    lines.push("## Downloaded Text", "", textContent, "");
  }
  return `${lines.join("\n")}\n`;
}

function readArgs() {
  const [, , universeAddress, outputDir] = process.argv;
  if (!universeAddress) {
    usage();
    process.exit(2);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    universeAddress,
    outputDir:
      outputDir ||
      path.resolve(
        "dumps",
        `stellar_universe_${universeAddress.slice(0, 12)}_${stamp}`
      ),
    rpc: process.env.STELLAR_RPC || DEFAULT_RPC,
    gateways: (process.env.IPFS_GATEWAYS || DEFAULT_GATEWAYS.join(","))
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

async function main() {
  const { universeAddress, outputDir, rpc, gateways } = readArgs();
  const CosmWasmClient = loadCosmWasmClient();
  const absoluteOutputDir = path.resolve(outputDir);
  const mediaRoot = path.join(absoluteOutputDir, "_ipfs");

  await ensureDir(mediaRoot);
  const client = await CosmWasmClient.connect(rpc);

  console.log(`Connected to ${rpc}`);
  console.log(`Dumping universe ${universeAddress}`);

  const universe = await querySmart(client, universeAddress, { entity_info: {} });
  const allEntities = await querySmart(client, universeAddress, { all_entities: {} });
  const owners = allEntities.all_entities || {};
  const projectAddresses = Object.values(owners).flat();

  await writeJson(path.join(absoluteOutputDir, "raw", "universe_entity_info.json"), universe);
  await writeJson(path.join(absoluteOutputDir, "raw", "all_entities.json"), allEntities);

  const projects = [];
  let index = 0;
  for (const [owner, addresses] of Object.entries(owners)) {
    for (const address of addresses) {
      index += 1;
      console.log(`[${index}/${projectAddresses.length}] Query project ${shortAddress(address)}`);
      const [info, assetResponse] = await Promise.all([
        querySmart(client, address, { project_info: {} }),
        querySmart(client, address, { all_assets: {} }),
      ]);
      projects.push({
        owner,
        address,
        info,
        assets: Array.isArray(assetResponse.all_assets) ? assetResponse.all_assets : [],
      });
    }
  }

  const allRefs = projects.flatMap(collectMediaRefs);
  const uniqueHashes = [...new Set(allRefs.map((ref) => ref.hash))];
  const mediaByHash = {};

  console.log(`Downloading ${uniqueHashes.length} unique IPFS files`);
  for (let i = 0; i < uniqueHashes.length; i += 1) {
    const hash = uniqueHashes[i];
    console.log(`[${i + 1}/${uniqueHashes.length}] IPFS ${hash}`);
    mediaByHash[hash] = await downloadIpfs(hash, mediaRoot, gateways, 45000);
  }

  for (let i = 0; i < projects.length; i += 1) {
    const project = projects[i];
    const projectDir = path.join(
      absoluteOutputDir,
      "projects",
      `${String(i + 1).padStart(3, "0")}-${safeName(project.info?.title)}-${project.address.slice(0, 12)}`
    );
    const refs = collectMediaRefs(project);
    await ensureDir(projectDir);
    await writeJson(path.join(projectDir, "project.json"), project);
    await writeText(path.join(projectDir, "description.md"), projectMarkdown(project, refs));
    await writeText(path.join(projectDir, "popup.txt"), `${project.info?.description || "undefined project description"}\n`);

    for (const ref of refs.filter((item) => item.role === "project-cover")) {
      const media = mediaByHash[ref.hash];
      if (media?.ok) {
        const dest = path.join(projectDir, "media", `project-cover${media.extension}`);
        await copyOrLink(media.file, dest);
        ref.localPath = path.relative(absoluteOutputDir, dest);
      }
    }

    for (const asset of project.assets || []) {
      const assetDir = path.join(
        projectDir,
        "assets",
        `${String(asset.id).padStart(3, "0")}-${safeName(`${asset.medium_type || "asset"}-${asset.medium_sub_type || ""}`)}`
      );
      await ensureDir(assetDir);
      await writeJson(path.join(assetDir, "asset.json"), asset);

      let textContent = null;
      const assetRefs = refs.filter((ref) => ref.assetId === asset.id);
      for (const ref of assetRefs) {
        const media = mediaByHash[ref.hash];
        if (!media?.ok) continue;
        const dest = path.join(assetDir, "media", `${mediaLabel(ref)}${media.extension}`);
        await copyOrLink(media.file, dest);
        ref.localPath = path.relative(absoluteOutputDir, dest);
        if (asset.medium_type === "text" && ref.role === "asset") {
          textContent = await maybeReadText(media.file);
          if (textContent) await writeText(path.join(assetDir, "text_content.txt"), textContent);
        }
      }
      await writeText(path.join(assetDir, "description.md"), assetMarkdown(asset, textContent));
    }
  }

  const failedMedia = Object.values(mediaByHash).filter((item) => !item.ok);
  const manifest = {
    scrapedAt: new Date().toISOString(),
    rpc,
    universeAddress,
    universe,
    allEntities,
    projectCount: projects.length,
    assetCount: projects.reduce((sum, project) => sum + project.assets.length, 0),
    mediaCount: uniqueHashes.length,
    failedMediaCount: failedMedia.length,
    mediaByHash,
    projects,
  };

  await writeJson(path.join(absoluteOutputDir, "manifest.json"), manifest);

  const summary = [
    `# Stellar Universe Dump`,
    "",
    `Universe: ${universe.name || universeAddress}`,
    `Address: ${universeAddress}`,
    `Description: ${universe.description || ""}`,
    `Scraped at: ${manifest.scrapedAt}`,
    `Projects: ${manifest.projectCount}`,
    `Assets: ${manifest.assetCount}`,
    `Unique IPFS files: ${manifest.mediaCount}`,
    `Failed IPFS downloads: ${manifest.failedMediaCount}`,
    "",
    "## Projects",
    "",
    ...projects.map((project, i) => {
      const info = project.info || {};
      return `${i + 1}. ${info.title || project.address} (${project.address}) - ${project.assets.length} assets`;
    }),
    "",
    "Raw blockchain responses are in `raw/`. Deduplicated IPFS payloads are in `_ipfs/`.",
    "Each project folder contains `project.json`, `description.md`, `popup.txt`, media copies, and per-asset folders.",
    "",
  ];
  await writeText(path.join(absoluteOutputDir, "README.md"), `${summary.join("\n")}\n`);

  console.log(`Done: ${absoluteOutputDir}`);
  if (failedMedia.length) {
    console.log(`Warning: ${failedMedia.length} IPFS files failed. See manifest.json.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
