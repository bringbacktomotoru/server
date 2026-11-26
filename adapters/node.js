#!/usr/bin/env node
/**
 * Optional standalone Node.js 20+ HTTP server adapter for local development.
 * Uses MemoryStore by default and serves static files from ./public.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleRequest } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { MemoryStore } from "../src/storage/memoryStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");

const PORT = Number.parseInt(process.env.PORT || "5000", 10);
const HOST = process.env.HOST || "127.0.0.1";
const store = new MemoryStore();

const server = http.createServer(async (req, res) => {
  try {
    const config = loadConfig(process.env);
    const origin = `http://${req.headers.host || `127.0.0.1:${PORT}`}`;
    const url = new URL(req.url || "/", origin);

    const chunks = [];
    let totalBytes = 0;
    if (req.method !== "GET" && req.method !== "HEAD") {
      for await (const chunk of req) {
        totalBytes += chunk.length;
        if (totalBytes > config.maxRequestBodyBytes) {
          res.writeHead(413, { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" });
          res.end(JSON.stringify({ error: "Payload too large" }));
          return;
        }
        chunks.push(chunk);
      }
    }
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

    const webReq = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      body,
    });

    const webRes = await handleRequest(webReq, process.env, { store });
    if (webRes) {
      const buf = Buffer.from(await webRes.arrayBuffer());
      const headers = Object.fromEntries(webRes.headers.entries());
      headers["Content-Length"] = String(buf.byteLength);
      res.writeHead(webRes.status, headers);
      res.end(buf);
      return;
    }

    // Serve static file from ./public with strict directory boundary check
    const rawRel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const resolved = path.resolve(PUBLIC_DIR, rawRel);
    const isInsidePublic = resolved.startsWith(PUBLIC_DIR + path.sep);
    if (isInsidePublic && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      const stat = fs.statSync(resolved);
      const ext = path.extname(resolved).toLowerCase();
      const ct =
        ext === ".html"
          ? "text/html; charset=utf-8"
          : ext === ".json"
            ? "application/json; charset=utf-8"
            : "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": ct,
        "Content-Length": String(stat.size),
        "Cache-Control": "no-transform",
        "X-Content-Type-Options": "nosniff",
      });
      fs.createReadStream(resolved).pipe(res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify({ error: "Not found" }));
  } catch {
    res.writeHead(500, { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Tomoserver listening on http://${HOST}:${PORT}`);
});
