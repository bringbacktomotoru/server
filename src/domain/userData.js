/**
 * Player UserData model and ServerDataLoader flat-array serializer.
 * 100% field-by-field parity with tools/server/persistence/user_data.py and 176.sk.sq.
 */

import { ALL_TUTORIAL_IDS, EPOCH_201511 } from "../constants.js";

const encoder = new TextEncoder();

export function gameServerTime() {
  return Math.max(0, Math.floor(Date.now() / 1000) - EPOCH_201511);
}

/**
 * Deterministic 9-digit integer friend code from UUID (matches Python sha256[:8] % 900_000_000 + 100_000_000).
 */
export async function makeFriendCode(uid) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(String(uid))));
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const top32 = view.getUint32(0, false); // big-endian first 4 bytes == hexdigest()[:8]
  return (top32 % 900_000_000) + 100_000_000;
}

export async function createDefaultUser(uid, { debug = false, skipTutorials = false } = {}) {
  const now = gameServerTime();
  const startGmoney = debug ? 50000 : 5000;
  const startFreerm = debug ? 1000 : 100;
  const endTutorialIds = debug || skipTutorials ? [...ALL_TUTORIAL_IDS] : [];
  const friendCode = await makeFriendCode(uid);

  return {
    version: 3,
    uuid: uid,
    friend_code: friendCode,
    name: "Player",
    sex: 0,
    rank: 1,
    rankexp: 0,
    gmoney: startGmoney,
    rmoney: 0,
    freerm: startFreerm,
    capture_hapiness_time: 0,
    next_uid: 100,
    // Room 1 init_furnitures from 79.sk.sq (rooms.conf): 8401 and 1703
    furnitures: [
      {
        furniture_id: 8401,
        uid: 1,
        exp: 0,
        level: 1,
        current_view_index: 0,
        product_type: 0,
        room_id: 1,
      },
      {
        furniture_id: 1703,
        uid: 2,
        exp: 0,
        level: 1,
        current_view_index: 0,
        product_type: 0,
        room_id: 1,
      },
    ],
    room_slots: [{ room_uid: 1, reside_charas: [109001] }],
    unlocked_slot_ids: [0],
    room_edits: [
      {
        uid: 1,
        room_id: 1,
        layouts: [
          [1, 0, 0, 0, 0],
          [2, 4, 0, 0, 0],
        ],
        panel_mission_id: 101,
        gmoney: startGmoney,
      },
    ],
    room_layout: [],
    // Costume 109001 = Hello Kitty (chara_id = 1)
    costumes: [
      {
        id: 109001,
        exp: 0,
        level: 1,
        health: 100,
        pat_time: 0,
        pat_power: 3,
        pat_mood: 0,
        closet_time: -1,
        motions: [],
      },
    ],
    work_rewards: [],
    items: {},
    purchase_records: {},
    gacha_data: [],
    end_tutorial_ids: endTutorialIds,
    costume_requests: [],
    mails: [],
    characters: [
      {
        id: 1,
        received_motion_reward_index: -1,
        motions: [5, 9, 10],
        rentals: {},
      },
    ],
    bonus_hapiness_num: 5,
    next_bonus_hapiness_recover_time: -1,
    last_ad_video_watch_time: 0,
    ad_video_watch_count: 0,
    panel_missions: [
      {
        id: 101,
        missions: [
          { id: 10, progress: 0, cleared: false, set_piece: false },
          { id: 20, progress: 0, cleared: false, set_piece: false },
          { id: 30, progress: 0, cleared: false, set_piece: false },
          { id: 40, progress: 0, cleared: false, set_piece: false },
        ],
        all_cleared: false,
        clear_date: -1,
        received_reward: false,
        prev_mid_list: [],
      },
    ],
    reply_records: {},
    created_at: now,
    last_login: now,
  };
}

export async function loadOrCreateUser(
  store,
  uid,
  { debug = false, skipTutorials = false } = {},
) {
  let ud = await store.getPlayer(uid);
  if (!ud || ud.friend_code === undefined || Number(ud.version ?? 0) < 3) {
    ud = await createDefaultUser(uid, { debug, skipTutorials });
    await store.savePlayer(uid, ud);
    return { ud, isNew: true };
  }
  if (skipTutorials) {
    let migrated = false;
    if (!Array.isArray(ud.end_tutorial_ids) || ud.end_tutorial_ids.length < ALL_TUTORIAL_IDS.length) {
      ud.end_tutorial_ids = [...ALL_TUTORIAL_IDS];
      migrated = true;
    }
    if (
      Array.isArray(ud.room_edits) &&
      ud.room_edits.length > 0 &&
      Array.isArray(ud.room_edits[0].layouts) &&
      ud.room_edits[0].layouts.length === 0 &&
      Array.isArray(ud.furnitures) &&
      ud.furnitures.length >= 2
    ) {
      ud.room_edits[0].layouts = [
        [toInt(ud.furnitures[0].uid, 1), 0, 0, 0, 0],
        [toInt(ud.furnitures[1].uid, 2), 4, 0, 0, 0],
      ];
      migrated = true;
    }
    if (migrated) {
      await store.savePlayer(uid, ud);
    }
  }
  return { ud, isNew: false };
}

export function allocUid(ud) {
  const next = toInt(ud.next_uid, 100);
  ud.next_uid = next + 1;
  return next;
}

export function addGm(ud, delta) {
  ud.gmoney = toInt(ud.gmoney, 5000) + delta;
  if (Array.isArray(ud.room_edits) && ud.room_edits.length > 0) {
    ud.room_edits[0].gmoney = toInt(ud.room_edits[0].gmoney, 5000) + delta;
  }
}

export function ensureCostume(ud, costumeId) {
  if (!Array.isArray(ud.costumes)) ud.costumes = [];
  if (!ud.costumes.some((c) => toInt(c.id) === costumeId)) {
    ud.costumes.push({
      id: costumeId,
      exp: 0,
      level: 1,
      health: 100,
      pat_time: 0,
      pat_power: 3,
      pat_mood: 0,
      closet_time: -1,
      motions: [],
    });
  }
}

function toInt(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * Serializes player save dict into the exact flat array consumed by 176.sk.sq ServerDataLoader.
 */
export function serializeUserdata(ud) {
  const out = [
    toInt(ud.friend_code, 100000001),
    String(ud.name ?? "Player"),
    toInt(ud.sex, 0),
    toInt(ud.rank, 1),
    toInt(ud.rankexp, 0),
    toInt(ud.gmoney, 5000),
    toInt(ud.rmoney, 0),
    toInt(ud.freerm, 100),
    toInt(ud.capture_hapiness_time, 0),
  ];

  // 1. FurnitureData list (7 ints per item)
  const furnitures = Array.isArray(ud.furnitures) ? ud.furnitures : [];
  out.push(furnitures.length);
  for (const f of furnitures) {
    out.push(
      toInt(f.furniture_id),
      toInt(f.uid),
      toInt(f.exp, 0),
      toInt(f.level, 1),
      toInt(f.current_view_index, 0),
      toInt(f.product_type, 0),
      toInt(f.room_id ?? f.room_idx, 1),
    );
  }

  // 2. RoomSlotData list
  const roomSlots = Array.isArray(ud.room_slots) ? ud.room_slots : [];
  out.push(roomSlots.length);
  for (const slot of roomSlots) {
    const reside = Array.isArray(slot.reside_charas) ? slot.reside_charas : [];
    out.push(toInt(slot.room_uid, 1), reside.length);
    for (const c of reside) out.push(toInt(c));
  }

  // 3. Unlocked slot IDs
  const unlocked = Array.isArray(ud.unlocked_slot_ids) ? ud.unlocked_slot_ids : [];
  out.push(unlocked.length);
  for (const sid of unlocked) out.push(toInt(sid));

  // 4. RoomEditData list (uid, room_id, furniture_num, *layouts, panel_mission_id, gmoney)
  const roomEdits = Array.isArray(ud.room_edits) ? ud.room_edits : [];
  out.push(roomEdits.length);
  for (const reItem of roomEdits) {
    const layouts = Array.isArray(reItem.layouts) ? reItem.layouts : [];
    out.push(toInt(reItem.uid, 1), toInt(reItem.room_id, 1), layouts.length);
    for (const lay of layouts) {
      for (const v of lay) out.push(v);
    }
    out.push(toInt(reItem.panel_mission_id, -1), toInt(reItem.gmoney, 5000));
  }

  // 5. room_layout 2D array
  const roomLayout = Array.isArray(ud.room_layout) ? ud.room_layout : [];
  out.push(roomLayout.length);
  for (const row of roomLayout) {
    out.push(row.length);
    for (const v of row) out.push(toInt(v));
  }

  // 6. CostumeData list (163.sk.sq:50-72)
  const costumes = Array.isArray(ud.costumes) ? ud.costumes : [];
  out.push(costumes.length);
  for (const c of costumes) {
    const motions = Array.isArray(c.motions) ? c.motions : [];
    out.push(
      toInt(c.id),
      toInt(c.exp, 0),
      toInt(c.level, 1),
      toInt(c.health, 100),
      toInt(c.pat_time, 0),
      toInt(c.pat_power, 3),
      toInt(c.pat_mood, 0),
      toInt(c.closet_time, -1),
      motions.length,
    );
    for (const m of motions) out.push(toInt(m));
    out.push(0); // has_work_data = 0
  }

  // 7. WorkRewardData list
  out.push(0);

  // 8. Items map (id:int, nums:int)
  const items = ud.items && typeof ud.items === "object" ? Object.entries(ud.items) : [];
  out.push(items.length);
  for (const [k, v] of items) {
    out.push(toInt(k), toInt(v));
  }

  // 9. Purchase records map (id:int, nums:int)
  const purchases =
    ud.purchase_records && typeof ud.purchase_records === "object"
      ? Object.entries(ud.purchase_records)
      : [];
  out.push(purchases.length);
  for (const [k, v] of purchases) {
    out.push(toInt(k), toInt(v));
  }

  // 10. GachaData list
  out.push(0);

  // 11. End tutorial IDs
  const endTuts = Array.isArray(ud.end_tutorial_ids) ? ud.end_tutorial_ids : [];
  out.push(endTuts.length);
  for (const tid of endTuts) out.push(toInt(tid));

  // 12. CostumeRequestData list
  out.push(0);

  // 13. MailData list
  out.push(0);

  // 14. CharacterData list (162.sk.sq:26-47)
  const characters = Array.isArray(ud.characters) ? ud.characters : [];
  out.push(characters.length);
  for (const ch of characters) {
    const motions = Array.isArray(ch.motions) ? ch.motions : [5, 9, 10];
    const rentals =
      ch.rentals && typeof ch.rentals === "object" ? Object.entries(ch.rentals) : [];
    out.push(toInt(ch.id), motions.length);
    for (const m of motions) out.push(toInt(m));
    out.push(toInt(ch.received_motion_reward_index, -1), rentals.length);
    for (const [rkey, rval] of rentals) {
      out.push(toInt(rkey), toInt(rval?.id, 0), toInt(rval?.time_limit, 0));
    }
  }

  // 15. Bonus happiness & ad video stats (4 ints)
  out.push(
    toInt(ud.bonus_hapiness_num, 5),
    toInt(ud.next_bonus_hapiness_recover_time, -1),
    toInt(ud.last_ad_video_watch_time, 0),
    toInt(ud.ad_video_watch_count, 0),
  );

  // 16. PanelMissionData list (172.sk.sq + 171.sk.sq)
  const panelMissions = Array.isArray(ud.panel_missions) ? ud.panel_missions : [];
  out.push(panelMissions.length);
  for (const pm of panelMissions) {
    const missions = Array.isArray(pm.missions) ? pm.missions : [];
    out.push(toInt(pm.id), missions.length);
    for (const m of missions) {
      out.push(
        toInt(m.id),
        toInt(m.progress, 0),
        m.cleared ? 1 : 0,
        m.set_piece ? 1 : 0,
      );
    }
    const prevMids = Array.isArray(pm.prev_mid_list) ? pm.prev_mid_list : [];
    out.push(
      pm.all_cleared ? 1 : 0,
      toInt(pm.clear_date, -1),
      pm.received_reward ? 1 : 0,
      prevMids.length,
    );
    for (const mid of prevMids) out.push(toInt(mid));
  }

  // 17. Reply records map (key:str, val:str)
  const replies =
    ud.reply_records && typeof ud.reply_records === "object" ? Object.entries(ud.reply_records) : [];
  out.push(replies.length);
  for (const [k, v] of replies) {
    out.push(String(k), String(v));
  }

  return out;
}
