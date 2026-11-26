/**
 * Entrance / authentication endpoint handlers.
 */

import {
  hashPassword,
  issueSessionToken,
  verifyPassword,
} from "../auth/sessionToken.js";
import {
  ENTRANCE_CMD,
  RESPONSE_INVALID_REQUEST,
  RESPONSE_NOT_ALLOWED,
  RESPONSE_SUCCEED,
  RESPONSE_TAKEOVER_EQUAL,
  RESPONSE_TAKEOVER_MISS,
} from "../constants.js";
import {
  createDefaultUser,
  gameServerTime,
  loadOrCreateUser,
  serializeUserdata,
} from "../domain/userData.js";
import { registerEntrance } from "./registry.js";

const VALID_UUID_RE = /^[a-zA-Z0-9._-]{4,128}$/;
const VALID_TAKEOVER_CODE_RE = /^TK[0-9A-F]{8}$/;
const MAX_PASSWORD_LENGTH = 128;

export function makeEntranceResponse(cmd, data = null, ret = RESPONSE_SUCCEED) {
  return {
    cmd,
    ret,
    server_time: gameServerTime(),
    ...(data ?? {}),
  };
}

function sanitizeUuid(raw) {
  if (typeof raw === "string" && VALID_UUID_RE.test(raw.trim())) {
    return raw.trim();
  }
  return crypto.randomUUID();
}

function generateTakeoverCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return `TK${hex.toUpperCase()}`;
}

export function registerEntranceHandlers() {
  registerEntrance(ENTRANCE_CMD.AUTH, async ({ store, params, config }) => {
    const uid = sanitizeUuid(params.uuid);
    const { ud, isNew } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    if (!isNew) {
      ud.last_login = gameServerTime();
      await store.savePlayer(uid, ud);
    }

    const sessionId = await issueSessionToken(
      uid,
      config.sessionSecret,
      config.sessionTtlSec,
      config.debugMode,
    );

    return makeEntranceResponse(ENTRANCE_CMD.AUTH, {
      uuid: uid,
      sessionId,
      addr: null,
      first_login: isNew,
      userdata: serializeUserdata(ud),
    });
  });

  registerEntrance(ENTRANCE_CMD.AGREED_TOS, async () => {
    return makeEntranceResponse(ENTRANCE_CMD.AGREED_TOS);
  });

  registerEntrance(ENTRANCE_CMD.TAKEOVER_ISSUE, async ({ store, params, config }) => {
    const uid = sanitizeUuid(params.uuid);
    const password = String(params.password ?? "");
    if (password.length > MAX_PASSWORD_LENGTH) {
      return makeEntranceResponse(ENTRANCE_CMD.TAKEOVER_ISSUE, null, RESPONSE_INVALID_REQUEST);
    }

    const code = generateTakeoverCode();
    const { hash, salt } = await hashPassword(password);
    const nowUnix = Math.floor(Date.now() / 1000);

    await store.saveTakeoverCode(code, {
      uuid: uid,
      passwordHash: hash,
      salt,
      createdAt: nowUnix,
      expiresAt: nowUnix + config.takeoverTtlSec,
    });

    return makeEntranceResponse(ENTRANCE_CMD.TAKEOVER_ISSUE, {
      takeover_code: code,
    });
  });

  registerEntrance(ENTRANCE_CMD.TAKEOVER_USE, async ({ store, params }) => {
    const code = String(params.takeover_code ?? "").trim().toUpperCase();
    const password = String(params.password ?? "");

    if (!VALID_TAKEOVER_CODE_RE.test(code) || password.length > MAX_PASSWORD_LENGTH) {
      return makeEntranceResponse(ENTRANCE_CMD.TAKEOVER_USE, null, RESPONSE_TAKEOVER_MISS);
    }

    const entry = await store.getTakeoverCode(code);
    if (!entry) {
      return makeEntranceResponse(ENTRANCE_CMD.TAKEOVER_USE, null, RESPONSE_TAKEOVER_MISS);
    }

    const ok = await verifyPassword(password, entry.passwordHash, entry.salt);
    if (!ok) {
      return makeEntranceResponse(ENTRANCE_CMD.TAKEOVER_USE, null, RESPONSE_TAKEOVER_MISS);
    }

    if (typeof params.uuid === "string" && params.uuid.trim() === entry.uuid) {
      return makeEntranceResponse(ENTRANCE_CMD.TAKEOVER_USE, null, RESPONSE_TAKEOVER_EQUAL);
    }

    // Single-use takeover code: revoke after successful transfer
    await store.deleteTakeoverCode(code);

    return makeEntranceResponse(ENTRANCE_CMD.TAKEOVER_USE, {
      uuid: entry.uuid,
    });
  });

  const debugAuthHandler = async ({ store, params, cmd, config }) => {
    if (!config.debugMode) {
      return makeEntranceResponse(cmd, null, RESPONSE_NOT_ALLOWED);
    }

    const uid = sanitizeUuid(params.uuid);
    const ud = await createDefaultUser(uid, { debug: false });
    if (
      cmd === ENTRANCE_CMD.DEBUG_TUTORIALEND_DATA ||
      cmd === ENTRANCE_CMD.DEBUG_COMPLETE_DATA
    ) {
      ud.end_tutorial_ids = [1, 2, 3, 4, 5];
    }
    if (cmd === ENTRANCE_CMD.DEBUG_COMPLETE_DATA) {
      ud.gmoney = 999999;
      ud.room_edits[0].gmoney = 999999;
      ud.freerm = 9999;
    }
    await store.savePlayer(uid, ud);

    const sessionId = await issueSessionToken(uid, config.sessionSecret, config.sessionTtlSec, true);

    return makeEntranceResponse(cmd, {
      uuid: uid,
      sessionId,
      addr: null,
      first_login: true,
      userdata: serializeUserdata(ud),
    });
  };

  registerEntrance(ENTRANCE_CMD.DEBUG_NEW_DATA, debugAuthHandler);
  registerEntrance(ENTRANCE_CMD.DEBUG_TEST_DATA, debugAuthHandler);
  registerEntrance(ENTRANCE_CMD.DEBUG_TUTORIALEND_DATA, debugAuthHandler);
  registerEntrance(ENTRANCE_CMD.DEBUG_COMPLETE_DATA, debugAuthHandler);
}
