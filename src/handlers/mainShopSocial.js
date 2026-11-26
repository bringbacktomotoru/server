/**
 * Items, Happiness, Panel Missions, Replies, Ad Video, Shop, Rooms, Gacha, IAP, Mail, Motions & Capture handlers.
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

function rollGachaReward(ud) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const cosId = FIRST_COSTUME_IDS[buf[0] % FIRST_COSTUME_IDS.length];
  ensureCostume(ud, cosId);
  const rewardUid = allocUid(ud);
  // 114.sk.sq:1468-1540 expects 6-element JSON array: [uid, kind, id, num, target_id, rank]
  return JSON.stringify([rewardUid, 1, cosId, 1, 0, 1]);
}

export function registerShopSocialHandlers() {
  // ---- Items & Happiness ----
  registerMain(MAIN_CMD.USE_ONCE_ITEM, async () => makeMainResponse(MAIN_CMD.USE_ONCE_ITEM));
  registerMain(MAIN_CMD.USE_BOOST_ITEM, async () => makeMainResponse(MAIN_CMD.USE_BOOST_ITEM));

  registerMain(MAIN_CMD.COMUNICATION_TAP, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    addGm(ud, 20);
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.COMUNICATION_TAP, {
      add_gm: 20,
      bonus_hapiness: 0,
      bonus_recover_time: -1,
    });
  });

  registerMain(MAIN_CMD.ADD_POOL_HAPINESS, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    addGm(ud, 50);
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.ADD_POOL_HAPINESS);
  });

  // ---- Panel Missions & Dialog ----
  registerMain(MAIN_CMD.PANELMISSION_SELECT, async () =>
    makeMainResponse(MAIN_CMD.PANELMISSION_SELECT),
  );
  registerMain(MAIN_CMD.PANELMISSION_SEND_PROGRESS, async () =>
    makeMainResponse(MAIN_CMD.PANELMISSION_SEND_PROGRESS),
  );
  registerMain(MAIN_CMD.PANELMISSION_SETPIECE, async () =>
    makeMainResponse(MAIN_CMD.PANELMISSION_SETPIECE),
  );
  registerMain(MAIN_CMD.PANELMISSION_SHOWEDEVENT, async () =>
    makeMainResponse(MAIN_CMD.PANELMISSION_SHOWEDEVENT, { clear_date: gameServerTime() }),
  );
  registerMain(MAIN_CMD.PANELMISSION_RECEIVE_REWARD, async () =>
    makeMainResponse(MAIN_CMD.PANELMISSION_RECEIVE_REWARD, {
      new_panel_mission_ids: "[]",
      set_panel_mission_id: -1,
    }),
  );

  registerMain(MAIN_CMD.SELECT_REPLYKEY, async ({ store, params, uid, config }) => {
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const isSafeKey = (k) => k.length > 0 && k.length <= 128 && !FORBIDDEN_KEYS.has(k);

    if (params && typeof params === "object" && !Array.isArray(params)) {
      const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
      if (!ud.reply_records || typeof ud.reply_records !== "object") ud.reply_records = {};
      let changed = false;
      const existingCount = () => Object.keys(ud.reply_records).length;

      if (Array.isArray(params.keys) && Array.isArray(params.values)) {
        const len = Math.min(params.keys.length, params.values.length, 20);
        for (let i = 0; i < len; i++) {
          const k = String(params.keys[i]);
          if (!isSafeKey(k)) continue;
          if (!(k in ud.reply_records) && existingCount() >= 500) break;
          ud.reply_records[k] = String(params.values[i]).slice(0, 256);
          changed = true;
        }
      } else if ("key" in params) {
        const k = String(params.key);
        if (isSafeKey(k) && (k in ud.reply_records || existingCount() < 500)) {
          ud.reply_records[k] = String(params.val ?? "").slice(0, 256);
          changed = true;
        }
      }
      if (changed) {
        await store.savePlayer(uid, ud);
      }
    }
    return makeMainResponse(MAIN_CMD.SELECT_REPLYKEY);
  });

  registerMain(MAIN_CMD.RECIEVE_AD_VIDEO_REWARD, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const now = gameServerTime();
    ud.last_ad_video_watch_time = now;
    ud.ad_video_watch_count = Math.trunc(Number(ud.ad_video_watch_count ?? 0)) + 1;
    addGm(ud, 100);
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.RECIEVE_AD_VIDEO_REWARD, { last_time: now });
  });

  // ---- Shop, Rooms & Gacha ----
  registerMain(MAIN_CMD.SELL_FURNITURE, async ({ store, params, uid, config }) => {
    const targetUid = extractIntParam(params, "uid", -1);
    if (targetUid >= 0) {
      const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
      ud.furnitures = (ud.furnitures ?? []).filter((f) => f.uid !== targetUid);
      addGm(ud, 100);
      await store.savePlayer(uid, ud);
    }
    return makeMainResponse(MAIN_CMD.SELL_FURNITURE);
  });

  registerMain(MAIN_CMD.SELL_ROOM, async () => makeMainResponse(MAIN_CMD.SELL_ROOM));

  registerMain(MAIN_CMD.SHOP_BUY, async ({ store, params, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const rewardUid = allocUid(ud);
    if (params && typeof params === "object" && !Array.isArray(params)) {
      const rawShopId = params.shop_id ?? params.id;
      const shopIdInt = Math.trunc(Number(rawShopId));
      if (Number.isFinite(shopIdInt) && shopIdInt >= 0) {
        if (!ud.purchase_records || typeof ud.purchase_records !== "object") {
          ud.purchase_records = {};
        }
        const key = String(shopIdInt);
        if (key in ud.purchase_records || Object.keys(ud.purchase_records).length < 1000) {
          ud.purchase_records[key] = Math.trunc(Number(ud.purchase_records[key] ?? 0)) + 1;
        }
      }
    }
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.SHOP_BUY, {
      reward0: JSON.stringify([rewardUid, 1, 109001, 1, 0]),
      reward1: null,
    });
  });

  registerMain(MAIN_CMD.UNLOCK_ROOM, async () =>
    makeMainResponse(MAIN_CMD.UNLOCK_ROOM, {
      room_ids: "[]",
      furniture_layouts: "[]",
      new_panel_mission_ids: "[]",
      set_panel_mission_id: -1,
    }),
  );

  registerMain(MAIN_CMD.EXECUTE_GACHA, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const rewardJson = rollGachaReward(ud);
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.EXECUTE_GACHA, {
      reward0: rewardJson,
      reward1: null,
    });
  });

  registerMain(MAIN_CMD.EXECUTE_LIMIT_GACHA, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const rewardJson = rollGachaReward(ud);
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.EXECUTE_LIMIT_GACHA, {
      st: 0,
      reward0: rewardJson,
      reward1: null,
    });
  });

  registerMain(MAIN_CMD.EXECUTE_STEP_GACHA, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const rewardJson = rollGachaReward(ud);
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.EXECUTE_STEP_GACHA, {
      st: 0,
      reward0: rewardJson,
      reward1: null,
    });
  });

  registerMain(MAIN_CMD.ROOM_BUY, async () =>
    makeMainResponse(MAIN_CMD.ROOM_BUY, { room_uids: [] }),
  );

  registerMain(MAIN_CMD.ROOM_UNLOCK_SLOT, async ({ store, params, uid, config }) => {
    let slotIds = [];
    if (params && typeof params === "object" && !Array.isArray(params)) {
      if (Array.isArray(params.room_slot_ids)) {
        slotIds = params.room_slot_ids.map((x) => Math.trunc(Number(x))).filter(Number.isFinite);
      } else if ("slot_id" in params) {
        const n = Math.trunc(Number(params.slot_id));
        if (Number.isFinite(n)) slotIds = [n];
      }
    }
    if (slotIds.length > 0) {
      const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
      if (!Array.isArray(ud.unlocked_slot_ids)) ud.unlocked_slot_ids = [];
      let changed = false;
      for (const sid of slotIds.slice(0, 50)) {
        if (ud.unlocked_slot_ids.length >= 200) break;
        if (!ud.unlocked_slot_ids.includes(sid)) {
          ud.unlocked_slot_ids.push(sid);
          changed = true;
        }
      }
      if (changed) await store.savePlayer(uid, ud);
    }
    return makeMainResponse(MAIN_CMD.ROOM_UNLOCK_SLOT);
  });

  registerMain(MAIN_CMD.ROOM_SLOT_EDIT, async () => makeMainResponse(MAIN_CMD.ROOM_SLOT_EDIT));
  registerMain(MAIN_CMD.ROOM_SLOT_SELECT, async () => makeMainResponse(MAIN_CMD.ROOM_SLOT_SELECT));

  // ---- In-App Purchase (Offline Bypass) ----
  registerMain(MAIN_CMD.CHARGE_RM, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    ud.freerm = Math.trunc(Number(ud.freerm ?? 100)) + 100;
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.CHARGE_RM, {
      add_room: -1,
      add_rm: 100,
      bonus_rm: 0,
      productIds: "",
    });
  });

  registerMain(MAIN_CMD.RESTORE_RM, async () =>
    makeMainResponse(MAIN_CMD.RESTORE_RM, {
      add_rm: 0,
      bonus_rm: 0,
      productIds: "",
      room_ids: null,
    }),
  );

  // ---- Mail ----
  registerMain(MAIN_CMD.RECEIVE_NEW_MAIL, async () =>
    makeMainResponse(MAIN_CMD.RECEIVE_NEW_MAIL, { mails: [] }),
  );
  registerMain(MAIN_CMD.SET_READ_MAIL_FLAG, async () =>
    makeMainResponse(MAIN_CMD.SET_READ_MAIL_FLAG),
  );
  registerMain(MAIN_CMD.DELETE_MAIL, async () => makeMainResponse(MAIN_CMD.DELETE_MAIL));

  registerMain(MAIN_CMD.RECEIVE_MAIL_ITEM, async () =>
    makeMainResponse(MAIN_CMD.RECEIVE_MAIL_ITEM, {
      reward: JSON.stringify([0, 0, 0, 100, 0]),
    }),
  );

  registerMain(MAIN_CMD.RECEIVE_ALL_MAIL_ITEM, async () =>
    makeMainResponse(MAIN_CMD.RECEIVE_ALL_MAIL_ITEM, { rewards: [] }),
  );

  registerMain(MAIN_CMD.DELETE_MAILS, async () =>
    makeMainResponse(MAIN_CMD.DELETE_MAILS, { idxes: [] }),
  );

  // ---- Motions & Capture ----
  registerMain(MAIN_CMD.CHARA_MOTION_REWARD, async () =>
    makeMainResponse(MAIN_CMD.CHARA_MOTION_REWARD),
  );

  registerMain(MAIN_CMD.UPDATE_CAPTURE_TIME, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const nextTime = gameServerTime() + 3600;
    ud.capture_hapiness_time = nextTime;
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.UPDATE_CAPTURE_TIME, { next: nextTime });
  });

  registerMain(MAIN_CMD.EXECUTE_CAPTURE_HAPINESS, async ({ store, uid, config }) => {
    // 375.sk.sq:2022-2030 reads reward as int GM amount!
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    const nextTime = gameServerTime() + 3600;
    ud.capture_hapiness_time = nextTime;
    addGm(ud, 100);
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.EXECUTE_CAPTURE_HAPINESS, {
      reward: 100,
      next: nextTime,
    });
  });

  registerMain(MAIN_CMD.RECEIVE_SHARE_BONUS, async ({ store, uid, config }) => {
    const { ud } = await loadOrCreateUser(store, uid, { debug: config.debugMode });
    addGm(ud, 100);
    await store.savePlayer(uid, ud);
    return makeMainResponse(MAIN_CMD.RECEIVE_SHARE_BONUS);
  });
}
