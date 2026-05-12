#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const DEFAULT_FOLDER = path.resolve(__dirname, "../univerces/everything");
const MIME_TYPES = {
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".obj": "text/plain; charset=utf-8",
  ".mtl": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function parseArgs(argv) {
  const args = {
    folder: DEFAULT_FOLDER,
    port: 8787,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--folder" && next) {
      args.folder = path.resolve(next);
      index += 1;
    } else if (arg === "--port" && next) {
      args.port = Number(next);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/serve-metadata.js [--folder path] [--port 8787]"
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.port) || args.port <= 0) {
    throw new Error("--port must be a positive integer");
  }

  return args;
}

function send(
  res,
  statusCode,
  body,
  contentType = "text/plain; charset=utf-8"
) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });
  res.end(body);
}

function resolveRequestPath(root, requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const decodedPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const filePath = path.resolve(root, decodedPath);
  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    return null;
  }
  return filePath;
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sanitizeFilename(filename) {
  const clean = path
    .basename(filename || "upload.bin")
    .replace(/[^\w.-]+/g, "-");
  return clean || "upload.bin";
}

function inferFilename(filename, contentType) {
  if (filename && filename !== "blob") return sanitizeFilename(filename);
  if (contentType?.includes("application/json")) return "metadata.json";
  if (contentType?.includes("text/plain")) return "asset.txt";
  if (contentType?.includes("model/gltf-binary")) return "asset.glb";
  if (contentType?.includes("image/png")) return "asset.png";
  if (contentType?.includes("image/jpeg")) return "asset.jpg";
  return sanitizeFilename(filename);
}

async function handleUpload(req, res, root, port) {
  const contentType = req.headers["content-type"] || "";
  const boundary =
    contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] ||
    contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
  if (!boundary) {
    send(
      res,
      400,
      JSON.stringify({ error: "Missing multipart boundary" }),
      "application/json; charset=utf-8"
    );
    return;
  }

  const body = await collectRequestBody(req);
  const delimiter = Buffer.from(`--${boundary}`);
  const start = body.indexOf(delimiter);
  if (start === -1) {
    send(
      res,
      400,
      JSON.stringify({ error: "Malformed multipart body" }),
      "application/json; charset=utf-8"
    );
    return;
  }

  const headerStart = start + delimiter.length + 2;
  const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), headerStart);
  if (headerEnd === -1) {
    send(
      res,
      400,
      JSON.stringify({ error: "Malformed multipart headers" }),
      "application/json; charset=utf-8"
    );
    return;
  }

  const headers = body.slice(headerStart, headerEnd).toString("utf8");
  const filename = headers.match(/filename="([^"]*)"/)?.[1] || "upload.bin";
  const fileContentType =
    headers.match(/content-type:\s*([^\r\n]+)/i)?.[1] || "";
  const dataStart = headerEnd + 4;
  const nextDelimiter = body.indexOf(
    Buffer.from(`\r\n--${boundary}`),
    dataStart
  );
  if (nextDelimiter === -1) {
    send(
      res,
      400,
      JSON.stringify({ error: "Missing multipart terminator" }),
      "application/json; charset=utf-8"
    );
    return;
  }

  const uploadsDir = path.join(root, "_", "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const safeName = inferFilename(filename, fileContentType);
  const storedName = `${Date.now()}-${safeName}`;
  const storedPath = path.join(uploadsDir, storedName);
  fs.writeFileSync(storedPath, body.slice(dataStart, nextDelimiter));

  const url = `http://127.0.0.1:${port}/_/uploads/${encodeURIComponent(
    storedName
  )}`;
  send(
    res,
    200,
    JSON.stringify({ ipfs_hash: url, cid: url, local: true }),
    "application/json; charset=utf-8"
  );
}

function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.folder);
  if (!fs.existsSync(root)) {
    throw new Error(`Folder does not exist: ${root}`);
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      send(res, 204, "");
      return;
    }

    if (req.method === "POST" && (req.url || "").startsWith("/_/upload")) {
      try {
        await handleUpload(req, res, root, args.port);
      } catch (error) {
        send(
          res,
          500,
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
          "application/json; charset=utf-8"
        );
      }
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, "Method not allowed");
      return;
    }

    const filePath = resolveRequestPath(root, req.url || "/");
    if (!filePath) {
      send(res, 403, "Forbidden");
      return;
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      send(res, 404, "Not found");
      return;
    }

    const contentType =
      MIME_TYPES[path.extname(filePath).toLowerCase()] ||
      "application/octet-stream";
    const body = req.method === "HEAD" ? "" : fs.readFileSync(filePath);
    send(res, 200, body, contentType);
  });

  server.listen(args.port, "127.0.0.1", () => {
    console.log(`Metadata server: http://127.0.0.1:${args.port}`);
    console.log(`Serving: ${root}`);
  });
}

main();
