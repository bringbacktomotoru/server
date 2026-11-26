/**
 * Structured JSON logger with secret redaction.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const REDACT_KEYS = new Set(["password", "secret", "token", "authorization", "session_secret"]);

function sanitize(value) {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitize);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = sanitize(v);
    }
  }
  return out;
}

export function createLogger(level = "info") {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function emit(lvl, tag, message, meta) {
    if ((LEVELS[lvl] ?? 2) > threshold) return;
    const entry = {
      ts: new Date().toISOString(),
      level: lvl,
      tag,
      msg: message,
      ...(meta ? { meta: sanitize(meta) } : {}),
    };
    const line = JSON.stringify(entry);
    if (lvl === "error") console.error(line);
    else if (lvl === "warn") console.warn(line);
    else console.log(line);
  }

  return {
    error: (tag, msg, meta) => emit("error", tag, msg, meta),
    warn: (tag, msg, meta) => emit("warn", tag, msg, meta),
    info: (tag, msg, meta) => emit("info", tag, msg, meta),
    debug: (tag, msg, meta) => emit("debug", tag, msg, meta),
  };
}
