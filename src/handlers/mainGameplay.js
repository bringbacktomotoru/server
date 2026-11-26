/**
 * Costumes, Work, Production, Furniture Layout, and Room Character handlers.
 */

import { FIRST_COSTUME_IDS, MAIN_CMD } from "../constants.js";
import {
  addGm,
  allocUid,
  ensureCostume,
  gameServerTime,
  loadOrCreateUser,
} from "../domain/userData.js";
import { extractIntParam, makeMainResponse } from "./mainSession.js";
import { registerMain } from "./registry.js";

function extractFurnitureId(params) {
  if (params && typeof params === "object" && !Array.isArray(params)) {
    const raw = params.furniture_id ?? params.shop_id ?? 8401;
    const n = Math.trunc(Number(raw));
    return Number.isFinite(n) ? n : 8401;
  }
  if (Array.isArray(params) && params.length > 0) {
    const n = Math.trunc(Number(params[0]));
    return Number.isFinite(n) ? n : 8401;
  }
  return 8401;
}

export function registerGameplayHandlers() {
  // ---- Costumes & Work ----
  registerMain(MAIN_CMD.SELECT_FIRST_COSTUME, async ({ store, params, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const idx = extractIntParam(params, "idx", 0);
    const cosId =
      idx >= 0 && idx < FIRST_COSTUME_IDS.length ? FIRST_COSTUME_IDS[idx] : FIRST_COSTUME_IDS[0];
    ensureCostume(ud, cosId);
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.SELECT_FIRST_COSTUME, { costume_id: cosId });
  });

  registerMain(MAIN_CMD.WORK_START, async ({ params }) => {
    const workId = extractIntParam(params, "work_id", 1);
    return makeMainResponse(MAIN_CMD.WORK_START, {
      work_id: workId,
      start_time: gameServerTime(),
    });
  });

  registerMain(MAIN_CMD.WORK_UPDATE, async () =>
    makeMainResponse(MAIN_CMD.WORK_UPDATE, { remaining_time: 0 }),
  );

  registerMain(MAIN_CMD.WORK_COMPLETE, async ({ store, params, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const workId = extractIntParam(params, "work_id", 1);
    addGm(ud, 200);
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.WORK_COMPLETE, {
      work_id: workId,
      reward_index: 0,
      reward0: null,
    });
  });

  registerMain(MAIN_CMD.WORK_CANCEL, async ({ params }) => {
    const workId = extractIntParam(params, "work_id", 1);
    return makeMainResponse(MAIN_CMD.WORK_CANCEL, { work_id: workId });
  });

  registerMain(MAIN_CMD.WORK_SHORTENING, async ({ store, params, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const workId = extractIntParam(params, "work_id", 1);
    return makeMainResponse(MAIN_CMD.WORK_SHORTENING, {
      work_id: workId,
      rmoney: Math.trunc(Number(ud.rmoney ?? 0)),
      freerm: Math.trunc(Number(ud.freerm ?? 100)),
    });
  });

  registerMain(MAIN_CMD.LEVEL_UP_COSTUME, async ({ store, params, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const cosId = extractIntParam(params, "costume_id", -1);
    let newLevel = 2;
    if (cosId >= 0) {
      for (const c of ud.costumes ?? []) {
        if (c.id === cosId) {
          c.level = Math.trunc(Number(c.level ?? 1)) + 1;
          newLevel = c.level;
          break;
        }
      }
      await store.savePlayer(uid, ud);
    }
    return makeMainResponse(MAIN_CMD.LEVEL_UP_COSTUME, { costume_level: newLevel });
  });

  registerMain(MAIN_CMD.PAT_COSTUME, async ({ store, params, uid, config }) => {
    const cosId = extractIntParam(params, "costume_id", -1);
    if (cosId >= 0) {
      const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
      const now = gameServerTime();
      for (const c of ud.costumes ?? []) {
        if (c.id === cosId) {
          c.pat_time = now;
          break;
        }
      }
      await store.savePlayer(uid, ud);
    }
    return makeMainResponse(MAIN_CMD.PAT_COSTUME);
  });

  registerMain(MAIN_CMD.RENTAL_COSTUME, async () => {
    const now = gameServerTime();
    return makeMainResponse(MAIN_CMD.RENTAL_COSTUME, {
      time_limit: now + 3600,
      server_time: now,
    });
  });

  registerMain(MAIN_CMD.COSTUMEREQUEST_RECIEVE, async () =>
    makeMainResponse(MAIN_CMD.COSTUMEREQUEST_RECIEVE),
  );
  registerMain(MAIN_CMD.COSTUMEREQUEST_TIMEOUT, async () =>
    makeMainResponse(MAIN_CMD.COSTUMEREQUEST_TIMEOUT),
  );
  registerMain(MAIN_CMD.COSTUMEREQUEST_FIRST, async () =>
    makeMainResponse(MAIN_CMD.COSTUMEREQUEST_FIRST),
  );

  // ---- Production ----
  registerMain(MAIN_CMD.PRODUCT_UPDATE, async () =>
    makeMainResponse(MAIN_CMD.PRODUCT_UPDATE, { production_list: [] }),
  );

  registerMain(MAIN_CMD.PRODUCT_START, async () =>
    makeMainResponse(MAIN_CMD.PRODUCT_START, {
      start_time: gameServerTime(),
      product_time: 60,
      reward_states: "[0]",
    }),
  );

  registerMain(MAIN_CMD.PRODUCT_COMPLETE, async () =>
    makeMainResponse(MAIN_CMD.PRODUCT_COMPLETE, { reward: [] }),
  );

  registerMain(MAIN_CMD.PRODUCT_LEVELUP_START, async () =>
    makeMainResponse(MAIN_CMD.PRODUCT_LEVELUP_START, {
      start_time: gameServerTime(),
      product_time: 60,
      reward_states: "[0]",
    }),
  );

  registerMain(MAIN_CMD.PRODUCT_LEVELUP_COMPLETE, async () =>
    makeMainResponse(MAIN_CMD.PRODUCT_LEVELUP_COMPLETE),
  );
  registerMain(MAIN_CMD.PRODUCT_SHORTEN, async () => makeMainResponse(MAIN_CMD.PRODUCT_SHORTEN));

  registerMain(MAIN_CMD.PRODUCT_CANCEL, async ({ params }) =>
    makeMainResponse(MAIN_CMD.PRODUCT_CANCEL, { uid: extractIntParam(params, "uid", 0) }),
  );

  registerMain(MAIN_CMD.PRODUCT_DELIVER_COMPLETE, async () =>
    makeMainResponse(MAIN_CMD.PRODUCT_DELIVER_COMPLETE),
  );
  registerMain(MAIN_CMD.PRODUCT_FINISH, async () => makeMainResponse(MAIN_CMD.PRODUCT_FINISH));

  registerMain(MAIN_CMD.PRODUCT_RECIEVE_TIMEOUT, async ({ params }) =>
    makeMainResponse(MAIN_CMD.PRODUCT_RECIEVE_TIMEOUT, { uid: extractIntParam(params, "uid", 0) }),
  );

  registerMain(MAIN_CMD.PRODUCT_TAP, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    addGm(ud, 10);
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.PRODUCT_TAP, {
      add_gm: 10,
      bonus_hapiness: 0,
      bonus_recover_time: -1,
    });
  });

  registerMain(MAIN_CMD.PRODUCT_REWARDSTATE_CHANGE, async () =>
    makeMainResponse(MAIN_CMD.PRODUCT_REWARDSTATE_CHANGE, { finished_uids: null }),
  );

  // ---- Furniture & Room Layout ----
  registerMain(MAIN_CMD.LAYOUT_EDIT, async () => makeMainResponse(MAIN_CMD.LAYOUT_EDIT));
  registerMain(MAIN_CMD.LAYOUT_REMOVE, async () => makeMainResponse(MAIN_CMD.LAYOUT_REMOVE));

  registerMain(MAIN_CMD.LAYOUT_BUY, async ({ store, params, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const now = gameServerTime();
    const buyUid = allocUid(ud);
    const furnId = extractFurnitureId(params);
    if (!Array.isArray(ud.furnitures)) ud.furnitures = [];
    if (ud.furnitures.length < 1000) {
      ud.furnitures.push({
        furniture_id: furnId,
        uid: buyUid,
        exp: 0,
        level: 1,
        current_view_index: 0,
        product_type: 0,
        room_id: 1,
      });
    }
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.LAYOUT_BUY, {
      buy_uid: buyUid,
      deliver_start_time: now,
      product_time: 180,
    });
  });

  registerMain(MAIN_CMD.LAYOUT_BUY_NO_DELIVER, async ({ store, params, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const buyUid = allocUid(ud);
    const furnId = extractFurnitureId(params);
    if (!Array.isArray(ud.furnitures)) ud.furnitures = [];
    if (ud.furnitures.length < 1000) {
      ud.furnitures.push({
        furniture_id: furnId,
        uid: buyUid,
        exp: 0,
        level: 1,
        current_view_index: 0,
        product_type: 0,
        room_id: 1,
      });
    }
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.LAYOUT_BUY_NO_DELIVER, { buy_uid: buyUid });
  });

  // ---- Room Characters ----
  registerMain(MAIN_CMD.ADD_ROOM_CHARA, async () =>
    makeMainResponse(MAIN_CMD.ADD_ROOM_CHARA, { recover_health: 0 }),
  );

  registerMain(MAIN_CMD.REMOVE_ROOM_CHARA, async () =>
    makeMainResponse(MAIN_CMD.REMOVE_ROOM_CHARA, { closet_time: gameServerTime() }),
  );

  registerMain(MAIN_CMD.CHANGE_ROOM_CHARA, async () =>
    makeMainResponse(MAIN_CMD.CHANGE_ROOM_CHARA, {
      closet_time: gameServerTime(),
      recover_health: "[0,0]",
    }),
  );
}
