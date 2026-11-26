/**
 * Runtime-agnostic Web-Standard HTTP router for Tomotoru (SakanaGL / app_kitty protocol).
 * Returns a `Response` for handled API routes, or `null` to let static hosting serve assets.
 */

import { verifySessionToken } from "./auth/sessionToken.js";
import { loadConfig } from "./config.js";
import {
  ENTRANCE_CMD_NAMES,
  MAIN_CMD_NAMES,
  RESPONSE_ERROR_OTHERS,
  RESPONSE_INVALID_REQUEST,
  RESPONSE_SESSION_CLOSED,
  RESPONSE_SUCCEED,
  RESPONSE_UNAVAILABLE,
} from "./constants.js";
import { buildPkgManifest, DEFAULT_PKG_MANIFEST } from "./domain/pkgManifest.js";
import { gameServerTime } from "./domain/userData.js";
import {
  ensureHandlersRegistered,
  getEntranceHandler,
  getMainHandler,
} from "./handlers/index.js";
import { createLogger } from "./http/logger.js";
import { parseGameRequest, RequestParseError } from "./http/requestParser.js";
import { encryptedGameResponse, jsonResponse } from "./http/responseBuilder.js";
import { SqlStore } from "./storage/sqlStore.js";

const SAFE_CONF_NAME_RE = /^[a-zA-Z0-9._-]{1,64}$/;

/**
 * Handles an incoming Request. Returns `Response | null`.
 * @param {Request} request
 * @param {Record<string, any>} [env]
 * @param {{ store?: any, waitUntil?: (p: Promise<any>) => void }} [ctx]
 */
export async function handleRequest(request, env = {}, ctx = {}) {
  ensureHandlersRegistered();

  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const config = loadConfig(env);
  const logger = createLogger(config.logLevel);

  const getStore = () => {
    if (ctx.store) return ctx.store;
    if (env.DB) return new SqlStore(env.DB);
    throw new Error("No storage backend configured");
  };

  // ---- Health Check (zero DB cost to prevent unauthenticated quota exhaustion) ----
  if (path === "/health") {
    if (method !== "GET" && method !== "HEAD") {
      return jsonResponse({ error: "Method not allowed" }, 405, { Allow: "GET, HEAD" });
    }
    return jsonResponse({ status: "healthy" });
  }

  // ---- Game Settings & Package Manifest ----
  if ((path === "/setting.json" || path === "/dl/setting.json") && method === "GET") {
    let override = null;
    try {
      if (ctx.store || env.DB) {
        override = await getStore().getConfig("setting");
      }
    } catch (err) {
      logger.warn("SETTING", "Failed reading setting override", { error: err.message });
    }

    const base = {
      release_pkg_version: config.pkgVersion,
      min_pkg_version: config.pkgVersion,
      min_sk_ver_ios: 0,
      min_sk_ver_android: 0,
      mode: config.maintenanceMode,
      debug_friendcode: config.debugFriendCode,
      server_time: Math.floor(Date.now() / 1000),
    };
    const merged =
      override && typeof override === "object"
        ? { ...base, ...override, server_time: Math.floor(Date.now() / 1000) }
        : base;
    return jsonResponse(merged);
  }

  if ((path === "/pkg.json" || path === "/dl/pkg.json") && method === "GET") {
    let baseManifest = DEFAULT_PKG_MANIFEST;
    try {
      if (ctx.store || env.DB) {
        const override = await getStore().getConfig("pkg_json");
        if (override && typeof override === "object") {
          baseManifest = override;
        }
      }
    } catch (err) {
      logger.warn("PKG", "Failed reading pkg_json override", { error: err.message });
    }
    return jsonResponse(buildPkgManifest(baseManifest, url.origin));
  }

  if (path === "/conf/gamesetting.conf" && method === "GET") {
    return jsonResponse({
      version: config.pkgVersion,
      language: "JP",
      timezone: "UTC",
      debug: config.debugMode,
    });
  }

  if (path.startsWith("/conf/") && method === "GET") {
    const confName = path.slice("/conf/".length);
    if (!SAFE_CONF_NAME_RE.test(confName)) {
      return jsonResponse({ error: "Invalid config name" }, 400);
    }
    return jsonResponse({ version: config.pkgVersion, config: confName });
  }

  // ---- Encrypted Game API: /app_kitty/entrance ----
  if (path === "/app_kitty/entrance") {
    if (method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, { Allow: "POST" });
    }
    if (!config.hasValidSessionSecret) {
      logger.error("ENTRANCE", "Missing or weak SESSION_SECRET");
      return encryptedGameResponse(
        { cmd: 0, ret: RESPONSE_UNAVAILABLE, server_time: gameServerTime() },
        config,
      );
    }

    let parsed;
    try {
      parsed = await parseGameRequest(request, config);
    } catch (err) {
      logger.warn("ENTRANCE", "Request parse failed", { error: err.message });
      return encryptedGameResponse(
        { cmd: 0, ret: RESPONSE_INVALID_REQUEST, server_time: gameServerTime() },
        config,
      );
    }

    const params = parsed.payload;
    const cmd = Number.isFinite(Number(params.cmd)) ? Math.trunc(Number(params.cmd)) : 0;
    const cmdName = ENTRANCE_CMD_NAMES[cmd] || `CMD_${cmd}`;

    try {
      const handler = getEntranceHandler(cmd);
      if (!handler) {
        logger.warn("ENTRANCE", "Unknown entrance command", { cmd });
        return encryptedGameResponse(
          { cmd, ret: RESPONSE_INVALID_REQUEST, server_time: gameServerTime() },
          config,
        );
      }

      const store = getStore();
      const result = await handler({ store, params, cmd, config, logger });

      logger.info("ENTRANCE", `${cmdName}(${cmd})`, {
        enc: parsed.wasEncrypted,
        uid: String(result.uuid ?? params.uuid ?? "-").slice(0, 8),
        ret: result.ret,
      });
      return encryptedGameResponse(result, config);
    } catch (err) {
      logger.error("ENTRANCE", `Unhandled error in ${cmdName}`, { error: err.message });
      return encryptedGameResponse(
        { cmd, ret: RESPONSE_ERROR_OTHERS, server_time: gameServerTime() },
        config,
      );
    }
  }

  // ---- Encrypted Game API: /app_kitty/main ----
  if (path === "/app_kitty/main") {
    if (method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, { Allow: "POST" });
    }
    if (!config.hasValidSessionSecret) {
      logger.error("MAIN", "Missing or weak SESSION_SECRET");
      return encryptedGameResponse(
        { cmd: 0, ret: RESPONSE_UNAVAILABLE, server_time: gameServerTime() },
        config,
      );
    }

    let parsed;
    try {
      parsed = await parseGameRequest(request, config);
    } catch (err) {
      logger.warn("MAIN", "Request parse failed", { error: err.message });
      return encryptedGameResponse(
        { cmd: 0, ret: RESPONSE_INVALID_REQUEST, server_time: gameServerTime() },
        config,
      );
    }

    const reqData = parsed.payload;
    const cmd = Number.isFinite(Number(reqData.cmd)) ? Math.trunc(Number(reqData.cmd)) : 900;
    const cmdName = MAIN_CMD_NAMES[cmd] || `CMD_${cmd}`;
    const sid = typeof reqData.sid === "string" ? reqData.sid : "";

    let uid = null;
    if (sid) {
      const verified = await verifySessionToken(sid, config.sessionSecret);
      if (!verified) {
        logger.warn("MAIN", "Invalid or expired session token", { cmd, cmdName });
        return encryptedGameResponse(
          { cmd, ret: RESPONSE_SESSION_CLOSED, server_time: gameServerTime() },
          config,
        );
      }
      uid = verified.uuid;
    } else if (config.debugMode && typeof reqData.uuid === "string" && reqData.uuid) {
      uid = reqData.uuid;
    } else {
      logger.warn("MAIN", "Missing session token", { cmd, cmdName });
      return encryptedGameResponse(
        { cmd, ret: RESPONSE_SESSION_CLOSED, server_time: gameServerTime() },
        config,
      );
    }

    const cmdParams = reqData.params === undefined || reqData.params === null ? {} : reqData.params;

    try {
      const store = getStore();
      const handler = getMainHandler(cmd);
      const result = handler
        ? await handler({ store, params: cmdParams, uid, cmd, config, logger })
        : { cmd, ret: RESPONSE_SUCCEED, server_time: gameServerTime() };

      logger.info("MAIN", `${cmdName}(${cmd})`, {
        uid: String(uid).slice(0, 8),
        ret: result.ret,
      });
      return encryptedGameResponse(result, config);
    } catch (err) {
      logger.error("MAIN", `Unhandled error in ${cmdName}`, {
        uid: String(uid).slice(0, 8),
        error: err.message,
      });
      return encryptedGameResponse(
        { cmd, ret: RESPONSE_ERROR_OTHERS, server_time: gameServerTime() },
        config,
      );
    }
  }

  // ---- Encrypted Game API: /app_kitty/report ----
  if (path === "/app_kitty/report") {
    if (method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, { Allow: "POST" });
    }

    let data = {};
    let wasEncrypted = false;
    try {
      const parsed = await parseGameRequest(request, config);
      data = parsed.payload;
      wasEncrypted = parsed.wasEncrypted;
    } catch (err) {
      if (err instanceof RequestParseError) {
        logger.warn("REPORT", "Malformed report payload", { error: err.message });
      }
    }

    const uid = typeof data.uuid === "string" ? data.uuid.slice(0, 128) : null;
    const cmd = Number.isFinite(Number(data.cmd)) ? Math.trunc(Number(data.cmd)) : 0;
    logger.info("REPORT", "Client report received", {
      uid: uid ? uid.slice(0, 8) : "-",
      enc: wasEncrypted,
      cmd,
    });

    if (config.enableReportStorage && (ctx.store || env.DB)) {
      const boundedPayload = JSON.stringify(data).slice(0, 16384);
      const savePromise = getStore()
        .saveReport(uid, cmd, boundedPayload)
        .catch((err) => logger.warn("REPORT", "Failed persisting report", { error: err.message }));
      if (typeof ctx.waitUntil === "function") {
        ctx.waitUntil(savePromise);
      } else {
        await savePromise;
      }
    }

    return encryptedGameResponse({ ret: RESPONSE_SUCCEED, server_time: gameServerTime() }, config);
  }

  // Not an API route -> fall through to static assets (`public/`)
  return null;
}
