/**
 * Runtime configuration parsed from environment variables.
 * Fails closed if SESSION_SECRET is absent or too short.
 */

export const MIN_SESSION_SECRET_LENGTH = 32;

function parseBool(val, defaultValue = false) {
  if (val === undefined || val === null || val === "") return defaultValue;
  if (typeof val === "boolean") return val;
  const s = String(val).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function parseIntSafe(val, defaultValue, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (val === undefined || val === null || val === "") return defaultValue;
  const n = Number.parseInt(String(val), 10);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.min(max, Math.max(min, n));
}

export function loadConfig(env = {}) {
  const rawSecret = typeof env.SESSION_SECRET === "string" ? env.SESSION_SECRET.trim() : "";
  const sessionSecret = rawSecret.length >= MIN_SESSION_SECRET_LENGTH ? rawSecret : "";

  return {
    sessionSecret,
    hasValidSessionSecret: sessionSecret.length >= MIN_SESSION_SECRET_LENGTH,
    blowfishKey: String(env.BLOWFISH_KEY || "test"),
    debugMode: parseBool(env.DEBUG_MODE, false),
    allowPlaintextRequests: parseBool(env.ALLOW_PLAINTEXT_REQUESTS, false),
    maintenanceMode: parseIntSafe(env.MAINTENANCE_MODE, 0, 0, 10),
    debugFriendCode: String(env.DEBUG_FRIENDCODE || ""),
    pkgVersion: parseIntSafe(env.PKG_VERSION, 1027, 1, 999999),
    sessionTtlSec: parseIntSafe(env.SESSION_TTL_SEC, 7 * 24 * 3600, 60, 30 * 24 * 3600),
    takeoverTtlSec: parseIntSafe(env.TAKEOVER_TTL_SEC, 24 * 3600, 60, 7 * 24 * 3600),
    maxRequestBodyBytes: parseIntSafe(env.MAX_REQUEST_BODY_BYTES, 512 * 1024, 1024, 5 * 1024 * 1024),
    maxDecompressedBytes: parseIntSafe(env.MAX_DECOMPRESSED_BYTES, 2 * 1024 * 1024, 1024, 10 * 1024 * 1024),
    enableReportStorage: parseBool(env.ENABLE_REPORT_STORAGE, false),
    logLevel: String(env.LOG_LEVEL || "info").toLowerCase(),
  };
}
