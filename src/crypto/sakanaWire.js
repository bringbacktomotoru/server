/**
 * SakanaGL / Tomotoru wire encryption & framing.
 *
 * Frame layout (before Blowfish ECB):
 *   [flag: 1 byte]   0 = raw UTF-8 JSON, 1 = RFC 1950 zlib-compressed UTF-8 JSON (when json >= 10240 bytes)
 *   [size: 4 bytes]  little-endian uint32 byte length of body (fallback to BE on decrypt)
 *   [body: size]     UTF-8 JSON or zlib-compressed bytes
 *   [pad: 0..7]      zero padding to 8-byte Blowfish block size
 * Transport: Base64 ASCII string.
 */

import { Unzlib, zlibSync } from "fflate";
import { getBlowfish } from "./blowfish.js";

export const DEFAULT_BLOWFISH_KEY = "test";
export const BLOCK_SIZE = 8;
export const COMPRESS_THRESHOLD = 10240;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const cleaned = b64.trim();
  if (!cleaned) {
    throw new Error("Empty Base64 input");
  }
  const binary = atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function padBlockZero(data) {
  const rem = data.length % BLOCK_SIZE;
  if (rem === 0) return data;
  const padded = new Uint8Array(data.length + (BLOCK_SIZE - rem));
  padded.set(data, 0);
  return padded;
}

/**
 * Streaming RFC 1950 zlib decompression with strict bounded memory (prevents zip-bomb OOM).
 * @param {Uint8Array} compressed
 * @param {number} maxBytes
 * @returns {Uint8Array}
 */
function safeUnzlib(compressed, maxBytes) {
  const chunks = [];
  let total = 0;
  let streamErr = null;
  let finished = false;

  const inflater = new Unzlib((chunk, final) => {
    if (streamErr) return;
    total += chunk.length;
    if (total > maxBytes) {
      streamErr = new Error(`Decompressed payload exceeds limit (${total} > ${maxBytes})`);
      return;
    }
    chunks.push(chunk);
    if (final) finished = true;
  });

  const step = 4096;
  for (let off = 0; off < compressed.length; off += step) {
    const end = Math.min(off + step, compressed.length);
    const isLast = end === compressed.length;
    inflater.push(compressed.subarray(off, end), isLast);
    if (streamErr) throw streamErr;
  }

  if (streamErr) throw streamErr;
  if (!finished) {
    throw new Error("Truncated zlib stream");
  }

  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

/**
 * Encrypts a JSON-serializable payload using the SakanaGL wire format.
 * @param {unknown} data
 * @param {string} [key="test"]
 * @returns {string} Base64 ciphertext
 */
export function encryptPayload(data, key = DEFAULT_BLOWFISH_KEY) {
  const jsonBytes = encoder.encode(JSON.stringify(data));
  let flag = 0;
  let body = jsonBytes;

  if (jsonBytes.length >= COMPRESS_THRESHOLD) {
    flag = 1;
    body = zlibSync(jsonBytes);
  }

  const framed = new Uint8Array(5 + body.length);
  framed[0] = flag;
  const view = new DataView(framed.buffer, framed.byteOffset, framed.byteLength);
  view.setUint32(1, body.length, true); // little-endian (ebb.endian = 0)
  framed.set(body, 5);

  const encrypted = getBlowfish(key).encrypt(padBlockZero(framed));
  return bytesToBase64(encrypted);
}

/**
 * Decrypts a Base64 + Blowfish ECB framed payload from the game client.
 * @param {string} encoded
 * @param {{ key?: string, maxDecompressedBytes?: number }} [options]
 * @returns {any}
 */
export function decryptPayload(encoded, options = {}) {
  const key = options.key ?? DEFAULT_BLOWFISH_KEY;
  const maxDecompressedBytes = options.maxDecompressedBytes ?? 2 * 1024 * 1024;

  if (typeof encoded !== "string") {
    throw new TypeError("Encrypted payload must be a Base64 string");
  }

  const raw = base64ToBytes(encoded);
  if (raw.length === 0 || raw.length % BLOCK_SIZE !== 0) {
    throw new Error(`Invalid Blowfish ciphertext length: ${raw.length}`);
  }

  const decrypted = getBlowfish(key).decrypt(raw);
  if (decrypted.length < 5) {
    throw new Error("Decrypted payload too short for SakanaGL header");
  }

  const flag = decrypted[0];
  const view = new DataView(decrypted.buffer, decrypted.byteOffset, decrypted.byteLength);
  let size = view.getUint32(1, true); // LE first

  if ((flag !== 0 && flag !== 1) || 5 + size > decrypted.length) {
    const sizeBe = view.getUint32(1, false);
    if ((flag === 0 || flag === 1) && 5 + sizeBe <= decrypted.length) {
      size = sizeBe;
    } else {
      throw new Error(`Invalid SakanaGL frame header: flag=${flag}, size=${size}`);
    }
  }

  let body = decrypted.subarray(5, 5 + size);
  if (flag === 1) {
    body = safeUnzlib(body, maxDecompressedBytes);
  }

  return JSON.parse(decoder.decode(body));
}
