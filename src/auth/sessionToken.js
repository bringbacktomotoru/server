/**
 * Stateless HMAC-SHA256 session tokens and PBKDF2 password hashing via Web Crypto API.
 * Eliminates extra DB roundtrips on every /app_kitty/main call.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");
const hmacKeyCache = new Map();

function toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function getHmacKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters");
  }
  let keyPromise = hmacKeyCache.get(secret);
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    hmacKeyCache.set(secret, keyPromise);
  }
  return keyPromise;
}

/**
 * Issues a signed stateless session token: `v1.<payload_b64url>.<sig_b64url>`
 */
export async function issueSessionToken(uuid, secret, ttlSec = 7 * 24 * 3600, debug = false) {
  const now = Math.floor(Date.now() / 1000);
  const body = toBase64Url(
    encoder.encode(
      JSON.stringify({
        u: String(uuid),
        iat: now,
        exp: now + ttlSec,
        d: debug ? 1 : 0,
      }),
    ),
  );
  const signingInput = `v1.${body}`;
  const key = await getHmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput)));
  return `${signingInput}.${toBase64Url(sig)}`;
}

/**
 * Verifies a signed stateless session token. Returns `{ uuid, iat, exp, debug }` or `null`.
 */
export async function verifySessionToken(token, secret) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;

  try {
    const signingInput = `${parts[0]}.${parts[1]}`;
    const sigBytes = fromBase64Url(parts[2]);
    const key = await getHmacKey(secret);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(signingInput));
    if (!valid) return null;

    const payload = JSON.parse(decoder.decode(fromBase64Url(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload.u !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp < now) return null;

    return {
      uuid: payload.u,
      iat: payload.iat,
      exp: payload.exp,
      debug: Boolean(payload.d),
    };
  } catch {
    return null;
  }
}

/**
 * Hashes a takeover password using PBKDF2-SHA256 + 16-byte random salt.
 */
export async function hashPassword(password) {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const saltHex = bytesToHex(saltBytes);
  const hashHex = await derivePasswordHash(String(password), saltBytes);
  return { hash: hashHex, salt: saltHex };
}

/**
 * Verifies a takeover password against a stored PBKDF2-SHA256 hash & salt in constant time.
 */
export async function verifyPassword(password, expectedHashHex, saltHex) {
  if (!expectedHashHex || !saltHex) return false;
  try {
    const saltBytes = hexToBytes(saltHex);
    const actualHex = await derivePasswordHash(String(password), saltBytes);
    if (actualHex.length !== expectedHashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < actualHex.length; i++) {
      diff |= actualHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

async function derivePasswordHash(password, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}
