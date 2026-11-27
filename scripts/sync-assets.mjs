#!/usr/bin/env node
/**
 * Copies SXR bundle files from ../game/.cache/sxr/ into ./public/dl/,
 * verifying file sizes and MD5 checksums against DEFAULT_PKG_MANIFEST.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PKG_MANIFEST } from "../src/domain/pkgManifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const srcDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(rootDir, "../game/.cache/sxr");
const dstDir = path.join(rootDir, "public", "dl");

if (!fs.existsSync(srcDir)) {
  console.error(`Source SXR directory not found: ${srcDir}`);
  process.exit(1);
}

fs.mkdirSync(dstDir, { recursive: true });

const expectedFiles = [
  { name: "main.sxr", ...DEFAULT_PKG_MANIFEST.mainsxr },
  ...DEFAULT_PKG_MANIFEST.sxrlist.map((s) => ({
    name: `${s.sxrname}-${Number(s.version).toString(16).padStart(4, "0")}.sxr`,
    ...s,
  })),
];

let totalBytes = 0;
for (const entry of expectedFiles) {
  const from = path.join(srcDir, entry.name);
  const to = path.join(dstDir, entry.name);
  if (!fs.existsSync(from)) {
    console.error(`Missing SXR bundle: ${from}`);
    process.exit(1);
  }
  const data = fs.readFileSync(from);
  const md5 = crypto.createHash("md5").update(data).digest("hex").toUpperCase();
  if (data.length !== entry.size || md5 !== entry.md5) {
    console.warn(
      `[WARN] ${entry.name} differs from default manifest (size=${data.length}/${entry.size}, md5=${md5}/${entry.md5})`,
    );
  }
  if (data.length > 25 * 1024 * 1024) {
    console.error(`[ERROR] ${entry.name} exceeds 25 MiB per-file asset limit!`);
    process.exit(1);
  }
  fs.writeFileSync(to, data);
  totalBytes += data.length;
  console.log(`  OK  ${entry.name.padEnd(14)} ${(data.length / 1024 / 1024).toFixed(2)} MiB  MD5=${md5}`);
}

console.log(`\nSynced ${expectedFiles.length} SXR bundles (${(totalBytes / 1024 / 1024).toFixed(2)} MiB total) to ${dstDir}`);
