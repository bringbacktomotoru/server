/**
 * Session, UserData, Config, Telemetry, Tutorial, and Player Profile handlers.
 */

import { MAIN_CMD, RESPONSE_SUCCEED } from "../constants.js";
import { getGameRule } from "../domain/gameSettings.js";
import {
  addGm,
  gameServerTime,
  loadOrCreateUser,
  serializeUserdata,
} from "../domain/userData.js";
import { registerMain } from "./registry.js";

export function makeMainResponse(cmd, data = null, ret = RESPONSE_SUCCEED) {
  return {
    cmd,
    ret,
    server_time: gameServerTime(),
    ...(data ?? {}),
  };
}

export function extractIntParam(params, key = null, defaultValue = 0) {
  if (typeof params === "number" && Number.isFinite(params)) {
    return Math.trunc(params);
  }
  if (params && typeof params === "object" && key && key in params) {
    const n = Number(params[key]);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return defaultValue;
}

export function registerSessionHandlers() {
  // Zero-DB-cost session heartbeat
  registerMain(MAIN_CMD.SESSION_CHECK, async () => makeMainResponse(MAIN_CMD.SESSION_CHECK));

  registerMain(MAIN_CMD.GET_ALL, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    return makeMainResponse(MAIN_CMD.GET_ALL, { userdata: serializeUserdata(ud) });
  });

  registerMain(MAIN_CMD.UPDATE_USERDATA, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    return makeMainResponse(MAIN_CMD.UPDATE_USERDATA, { userdata: serializeUserdata(ud) });
  });

  registerMain(MAIN_CMD.SAVE_USERDATA, async () => makeMainResponse(MAIN_CMD.SAVE_USERDATA));

  registerMain(MAIN_CMD.GET_RM, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const freerm = Math.trunc(Number(ud.freerm ?? 100));
    const rmoney = Math.trunc(Number(ud.rmoney ?? 0));
    return makeMainResponse(MAIN_CMD.GET_RM, {
      free_rm: freerm,
      freerm,
      rmoney,
    });
  });

  registerMain(MAIN_CMD.GET_GM, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const gm = Math.trunc(Number(ud.gmoney ?? 5000));
    return makeMainResponse(MAIN_CMD.GET_GM, { gm, gmoney: gm });
  });

  registerMain(MAIN_CMD.LOAD_CONF, async ({ store }) => {
    const override = await store.getConfig("game_rule");
    const gameRule =
      override && typeof override === "object" ? { ...getGameRule(), ...override } : getGameRule();
    return makeMainResponse(MAIN_CMD.LOAD_CONF, {
      conf: {
        GameRule: JSON.stringify(gameRule),
        ConditionSetting: "[]",
      },
    });
  });

  registerMain(MAIN_CMD.SEND_LOG, async ({ params, uid, logger }) => {
    const text = typeof params === "string" ? params : JSON.stringify(params ?? "");
    if (text && text.trim()) {
      logger.debug("CLIENT_LOG", text.slice(0, 2000), { uid: String(uid).slice(0, 8) });
    }
    return makeMainResponse(MAIN_CMD.SEND_LOG);
  });

  registerMain(MAIN_CMD.CLIENT_REPORT, async () => makeMainResponse(MAIN_CMD.CLIENT_REPORT));
  registerMain(MAIN_CMD.REGISTER_TOKEN, async () => makeMainResponse(MAIN_CMD.REGISTER_TOKEN));

  // Tutorial & Player Profile
  registerMain(MAIN_CMD.END_TUTORIAL, async ({ store, params, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    let idsToAdd = [];
    if (params && typeof params === "object" && !Array.isArray(params)) {
      if (Array.isArray(params.ids)) {
        idsToAdd = params.ids.map((x) => Math.trunc(Number(x))).filter(Number.isFinite);
      } else if ("id" in params) {
        const n = Math.trunc(Number(params.id));
        if (Number.isFinite(n)) idsToAdd = [n];
      }
    } else if (typeof params === "number" && Number.isFinite(params)) {
      idsToAdd = [Math.trunc(params)];
    } else if (Array.isArray(params)) {
      idsToAdd = params.map((x) => Math.trunc(Number(x))).filter(Number.isFinite);
    }

    if (!Array.isArray(ud.end_tutorial_ids)) ud.end_tutorial_ids = [];
    let changed = false;
    for (const tid of idsToAdd.slice(0, 50)) {
      if (ud.end_tutorial_ids.length >= 200) break;
      if (!ud.end_tutorial_ids.includes(tid)) {
        ud.end_tutorial_ids.push(tid);
        changed = true;
      }
    }
    if (changed) {
      await store.savePlayer(uid, ud);
    }

    return makeMainResponse(MAIN_CMD.END_TUTORIAL, {
      new_panel_mission_ids: "[]",
      set_panel_mission_id: -1,
    });
  });

  registerMain(MAIN_CMD.TUTORIAL_ADD_HAPINESS, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    addGm(ud, 500);
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.TUTORIAL_ADD_HAPINESS);
  });

  registerMain(MAIN_CMD.INPUT_PLAYERINFO, async ({ store, params, uid, config }) => {
    if (params && typeof params === "object" && !Array.isArray(params)) {
      const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
      let changed = false;
      if ("name" in params) {
        ud.name = String(params.name).slice(0, 64);
        changed = true;
      }
      if ("sex" in params) {
        const s = Math.trunc(Number(params.sex));
        if (Number.isFinite(s)) {
          ud.sex = s;
          changed = true;
        }
      }
      if (changed) {
        await store.savePlayer(uid, ud);
      }
    }
    return makeMainResponse(MAIN_CMD.INPUT_PLAYERINFO);
  });
}
