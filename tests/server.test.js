import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/app.js";
import {
  ENTRANCE_CMD,
  MAIN_CMD,
  RESPONSE_INVALID_REQUEST,
  RESPONSE_NOT_ALLOWED,
  RESPONSE_SESSION_CLOSED,
  RESPONSE_SUCCEED,
  RESPONSE_TAKEOVER_EQUAL,
  RESPONSE_TAKEOVER_MISS,
  RESPONSE_UNAVAILABLE,
} from "../src/constants.js";
import { decryptPayload, encryptPayload } from "../src/crypto/sakanaWire.js";
import { ensureHandlersRegistered, listMainHandlers } from "../src/handlers/index.js";
import { MemoryStore } from "../src/storage/memoryStore.js";

/**
 * Exact JS mirror of 176.sk.bin UserData.load(ServerDataLoader).
 * Verifies every element is consumed and idx === datas.length at loader.close().
 */
function consumeUserdataArray(datas) {
  let idx = 0;
  const get = () => {
    expect(idx).toBeLessThan(datas.length);
    return datas[idx++];
  };

  const parsed = {
    friend_code: get(),
    name: get(),
    sex: get(),
    rank: get(),
    rankexp: get(),
    gmoney: get(),
    rmoney: get(),
    freerm: get(),
    capture_hapiness_time: get(),
  };

  // 1. FurnitureData (7 fields)
  const fNum = get();
  parsed.furnitures = [];
  for (let i = 0; i < fNum; i++) {
    const [fid, uid, _exp, lvl, _viewIdx, ptype, roomId] = Array.from({ length: 7 }, get);
    expect(ptype).toBe(0);
    parsed.furnitures.push({ furniture_id: fid, uid, level: lvl, room_id: roomId });
  }

  // 2. RoomSlotData
  const slotNum = get();
  for (let i = 0; i < slotNum; i++) {
    get(); // room_uid
    const resideLen = get();
    for (let j = 0; j < resideLen; j++) get();
  }

  // 3. Unlocked slots
  const unlockedNum = get();
  for (let i = 0; i < unlockedNum; i++) get();

  // 4. RoomEditData
  const roomNum = get();
  for (let i = 0; i < roomNum; i++) {
    get(); // uid
    get(); // room_id
    const flen = get();
    expect(flen).toBe(0);
    get(); // panel_mission_id
    get(); // gmoney
  }

  // 5. room_layout 2D
  const rlSize = get();
  for (let i = 0; i < rlSize; i++) {
    const rowLen = get();
    for (let j = 0; j < rowLen; j++) get();
  }

  // 6. CostumeData
  const cosNum = get();
  parsed.costumes = [];
  for (let i = 0; i < cosNum; i++) {
    const [cid, _exp, lvl] = Array.from({ length: 8 }, get);
    const mNum = get();
    for (let j = 0; j < mNum; j++) get();
    const hasWork = get();
    expect(hasWork).toBe(0);
    parsed.costumes.push({ id: cid, level: lvl });
  }

  // 7. WorkRewardData
  expect(get()).toBe(0);

  // 8. Items
  const itemNum = get();
  for (let i = 0; i < itemNum; i++) {
    get();
    get();
  }

  // 9. Purchase records
  const prNum = get();
  for (let i = 0; i < prNum; i++) {
    get();
    get();
  }

  // 10. GachaData
  expect(get()).toBe(0);

  // 11. End tutorial IDs
  const tutNum = get();
  parsed.end_tutorial_ids = [];
  for (let i = 0; i < tutNum; i++) parsed.end_tutorial_ids.push(get());

  // 12. Costume requests
  expect(get()).toBe(0);

  // 13. Mails
  expect(get()).toBe(0);

  // 14. Characters
  const chNum = get();
  for (let i = 0; i < chNum; i++) {
    get(); // id
    const mlen = get();
    for (let j = 0; j < mlen; j++) get();
    get(); // received_motion_reward_index
    const rlen = get();
    for (let j = 0; j < rlen; j++) {
      get();
      get();
      get();
    }
  }

  // 15. Bonus happiness & ad video
  for (let i = 0; i < 4; i++) get();

  // 16. Panel missions
  const pmNum = get();
  for (let i = 0; i < pmNum; i++) {
    get(); // id
    const mLen = get();
    for (let j = 0; j < mLen; j++) {
      get();
      get();
      get();
      get();
    }
    get(); // all_cleared
    get(); // clear_date
    get(); // received_reward
    const prevLen = get();
    for (let j = 0; j < prevLen; j++) get();
  }

  // 17. Reply records
  const repNum = get();
  for (let i = 0; i < repNum; i++) {
    const k = get();
    const v = get();
    expect(typeof k).toBe("string");
    expect(typeof v).toBe("string");
  }

  expect(idx).toBe(datas.length);
  return parsed;
}

function makeEnv(extra = {}) {
  return {
    SESSION_SECRET: "test-secret-key-0123456789abcdef0123456789",
    BLOWFISH_KEY: "test",
    DEBUG_MODE: "false",
    ALLOW_PLAINTEXT_REQUESTS: "false",
    LOG_LEVEL: "error",
    ...extra,
  };
}

async function postEnc(store, env, path, payload) {
  const enc = encryptPayload(payload);
  const req = new Request(`https://example.invalid${path}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: enc,
  });
  const res = await handleRequest(req, env, { store });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-length")).toBeTruthy();
  expect(res.headers.get("cache-control")).toContain("no-transform");
  const text = await res.text();
  const decoded = decryptPayload(text);
  expect(Array.isArray(decoded)).toBe(true);
  expect(decoded.length).toBe(1);
  return decoded[0];
}

describe("Tomoserver E2E protocol & handlers", () => {
  it("serves health, setting.json, pkg.json, and conf endpoints", async () => {
    const store = new MemoryStore();
    const env = makeEnv();

    const h = await handleRequest(new Request("https://example.invalid/health"), env, {
      store,
    });
    expect(await h.json()).toEqual({ status: "healthy" });
    expect(h.headers.get("x-content-type-options")).toBe("nosniff");

    for (const p of ["/setting.json", "/dl/setting.json"]) {
      const r = await handleRequest(new Request(`https://example.invalid${p}`), env, {
        store,
      });
      const body = await r.json();
      expect(body.release_pkg_version).toBe(1027);
      expect(body.min_pkg_version).toBe(1027);
      expect(body.mode).toBe(0);
    }

    for (const p of ["/pkg.json", "/dl/pkg.json"]) {
      const r = await handleRequest(new Request(`https://example.invalid${p}`), env, {
        store,
      });
      const body = await r.json();
      expect(body.version).toBe(1027);
      expect(body.mainsxr.url).toBe("https://example.invalid/dl/main.sxr");
      expect(body.sxrlist.length).toBe(8);
    }
  });

  it("handles full auth + gameplay persistence + ServerDataLoader validation", async () => {
    const store = new MemoryStore();
    const env = makeEnv();

    // 1. Auth
    const auth = await postEnc(store, env, "/app_kitty/entrance", {
      uuid: "player-test-001",
      cmd: ENTRANCE_CMD.AUTH,
      platform_id: 1,
      sk_ver: 100,
    });
    expect(auth.ret).toBe(RESPONSE_SUCCEED);
    expect(auth.first_login).toBe(true);
    expect(auth.addr).toBeNull();
    expect(typeof auth.sessionId).toBe("string");
    expect(auth.sessionId.startsWith("v1.")).toBe(true);

    const sid = auth.sessionId;
    const ud = consumeUserdataArray(auth.userdata);
    expect(ud.name).toBe("Player");
    expect(ud.gmoney).toBe(5000);
    expect(ud.freerm).toBe(100);
    expect(ud.end_tutorial_ids).toEqual([]);

    // 2. Input player info
    let r = await postEnc(store, env, "/app_kitty/main", {
      sid,
      cmd: MAIN_CMD.INPUT_PLAYERINFO,
      params: { name: "KittyFan", sex: 2 },
      seq: 1,
    });
    expect(r.ret).toBe(RESPONSE_SUCCEED);

    // 3. Select first costume
    r = await postEnc(store, env, "/app_kitty/main", {
      sid,
      cmd: MAIN_CMD.SELECT_FIRST_COSTUME,
      params: 0,
      seq: 2,
    });
    expect(r.ret).toBe(RESPONSE_SUCCEED);
    expect(r.costume_id).toBe(109001);

    // 4. Buy furniture
    r = await postEnc(store, env, "/app_kitty/main", {
      sid,
      cmd: MAIN_CMD.LAYOUT_BUY,
      params: { furniture_id: 2001 },
      seq: 3,
    });
    expect(r.ret).toBe(RESPONSE_SUCCEED);
    expect(r.buy_uid).toBeGreaterThanOrEqual(100);
    expect(r.product_time).toBe(180);

    // 5. Execute gacha (6-element JSON array)
    r = await postEnc(store, env, "/app_kitty/main", {
      sid,
      cmd: MAIN_CMD.EXECUTE_GACHA,
      params: {},
      seq: 4,
    });
    expect(r.ret).toBe(RESPONSE_SUCCEED);
    expect(JSON.parse(r.reward0).length).toBe(6);

    // 6. End tutorial & communication tap
    r = await postEnc(store, env, "/app_kitty/main", {
      sid,
      cmd: MAIN_CMD.END_TUTORIAL,
      params: { ids: [1] },
      seq: 5,
    });
    expect(r.ret).toBe(RESPONSE_SUCCEED);
    expect(JSON.parse(r.new_panel_mission_ids)).toEqual([]);

    r = await postEnc(store, env, "/app_kitty/main", {
      sid,
      cmd: MAIN_CMD.COMUNICATION_TAP,
      params: {},
      seq: 6,
    });
    expect(r.ret).toBe(RESPONSE_SUCCEED);
    expect(r.add_gm).toBe(20);

    // 7. GET_ALL verifies all mutations & passes ServerDataLoader
    const allResp = await postEnc(store, env, "/app_kitty/main", {
      sid,
      cmd: MAIN_CMD.GET_ALL,
      params: {},
      seq: 7,
    });
    expect(allResp.ret).toBe(RESPONSE_SUCCEED);
    const ud2 = consumeUserdataArray(allResp.userdata);
    expect(ud2.name).toBe("KittyFan");
    expect(ud2.sex).toBe(2);
    expect(ud2.gmoney).toBe(5020);
    expect(ud2.costumes.some((c) => c.id === 109001)).toBe(true);
    expect(ud2.furnitures.some((f) => f.furniture_id === 2001)).toBe(true);
    expect(ud2.end_tutorial_ids).toContain(1);

    // 8. LOAD_CONF, CAPTURE, REGISTER_TOKEN, DELETE_MAIL, REPORT
    const conf = await postEnc(store, env, "/app_kitty/main", {
      sid,
      cmd: MAIN_CMD.LOAD_CONF,
      params: {},
      seq: 8,
    });
    expect(conf.ret).toBe(RESPONSE_SUCCEED);
    expect(typeof conf.conf.GameRule).toBe("string");

    const cap = await postEnc(store, env, "/app_kitty/main", {
      sid,
      cmd: MAIN_CMD.EXECUTE_CAPTURE_HAPINESS,
      params: {},
      seq: 9,
    });
    expect(cap.ret).toBe(RESPONSE_SUCCEED);
    expect(typeof cap.reward).toBe("number");

    const regTok = await postEnc(store, env, "/app_kitty/main", {
      sid,
      cmd: MAIN_CMD.REGISTER_TOKEN,
      params: {},
      seq: 10,
    });
    expect(regTok.cmd).toBe(MAIN_CMD.REGISTER_TOKEN);

    const delMail = await postEnc(store, env, "/app_kitty/main", {
      sid,
      cmd: MAIN_CMD.DELETE_MAIL,
      params: {},
      seq: 11,
    });
    expect(delMail.cmd).toBe(MAIN_CMD.DELETE_MAIL);

    const rep = await postEnc(store, env, "/app_kitty/report", {
      uuid: "player-test-001",
      cmd: 0,
      params: { log: "test report" },
    });
    expect(rep.ret).toBe(RESPONSE_SUCCEED);
  });

  it("enforces session security, debug gate, and single-use takeover codes", async () => {
    const store = new MemoryStore();
    const prodEnv = makeEnv({ DEBUG_MODE: "false" });

    // Invalid sessionId -> RESPONSE_SESSION_CLOSED (-2)
    const badSid = await postEnc(store, prodEnv, "/app_kitty/main", {
      sid: "v1.tampered.token",
      cmd: MAIN_CMD.GET_ALL,
      params: {},
    });
    expect(badSid.ret).toBe(RESPONSE_SESSION_CLOSED);

    // Debug entrance command blocked in production
    const blockedDebug = await postEnc(store, prodEnv, "/app_kitty/entrance", {
      uuid: "someone",
      cmd: ENTRANCE_CMD.DEBUG_COMPLETE_DATA,
    });
    expect(blockedDebug.ret).toBe(RESPONSE_NOT_ALLOWED);

    // Takeover flow with hashed password + single-use revocation
    const issue = await postEnc(store, prodEnv, "/app_kitty/entrance", {
      uuid: "orig-uuid-999",
      cmd: ENTRANCE_CMD.TAKEOVER_ISSUE,
      password: "secret",
    });
    expect(issue.ret).toBe(RESPONSE_SUCCEED);
    const code = issue.takeover_code;
    expect(code).toMatch(/^TK[0-9A-F]{8}$/);

    // Wrong password
    const badPw = await postEnc(store, prodEnv, "/app_kitty/entrance", {
      uuid: "new-dev",
      cmd: ENTRANCE_CMD.TAKEOVER_USE,
      takeover_code: code,
      password: "wrong",
    });
    expect(badPw.ret).toBe(RESPONSE_TAKEOVER_MISS);

    // Correct password succeeds
    const goodPw = await postEnc(store, prodEnv, "/app_kitty/entrance", {
      uuid: "new-dev",
      cmd: ENTRANCE_CMD.TAKEOVER_USE,
      takeover_code: code,
      password: "secret",
    });
    expect(goodPw.ret).toBe(RESPONSE_SUCCEED);
    expect(goodPw.uuid).toBe("orig-uuid-999");

    // Reusing the same code fails (single-use)
    const replay = await postEnc(store, prodEnv, "/app_kitty/entrance", {
      uuid: "third-dev",
      cmd: ENTRANCE_CMD.TAKEOVER_USE,
      takeover_code: code,
      password: "secret",
    });
    expect(replay.ret).toBe(RESPONSE_TAKEOVER_MISS);
  });

  it("supports debug mode saves with all 19 tutorials skipped", async () => {
    const store = new MemoryStore();
    const debugEnv = makeEnv({ DEBUG_MODE: "true" });

    const auth = await postEnc(store, debugEnv, "/app_kitty/entrance", {
      uuid: "debug-player",
      cmd: ENTRANCE_CMD.AUTH,
    });
    const ud = consumeUserdataArray(auth.userdata);
    expect(ud.end_tutorial_ids.length).toBe(19);
    expect(ud.gmoney).toBe(50000);
    expect(ud.freerm).toBe(1000);
  });

  it("executes every registered main handler without errors", async () => {
    ensureHandlersRegistered();
    const store = new MemoryStore();
    const env = makeEnv();
    const auth = await postEnc(store, env, "/app_kitty/entrance", {
      uuid: "sweep-player",
      cmd: ENTRANCE_CMD.AUTH,
    });
    const sid = auth.sessionId;
    const allCmds = listMainHandlers();
    expect(allCmds.length).toBeGreaterThanOrEqual(75);

    for (const cmd of allCmds) {
      const r = await postEnc(store, env, "/app_kitty/main", { sid, cmd, params: {}, seq: 1 });
      expect(r.ret).toBe(RESPONSE_SUCCEED);
      expect(r.cmd).toBe(cmd);
    }
  });

  it("enforces fail-closed security controls against abuse and injection", async () => {
    const store = new MemoryStore();
    const env = makeEnv();

    // 1. Missing or weak SESSION_SECRET must fail closed
    const weakRes = await postEnc(store, makeEnv({ SESSION_SECRET: "short" }), "/app_kitty/entrance", {
      uuid: "u1",
      cmd: ENTRANCE_CMD.AUTH,
    });
    expect(weakRes.ret).toBe(RESPONSE_UNAVAILABLE);

    // 2. GET method rejected on /app_kitty/* endpoints
    for (const p of ["/app_kitty/entrance", "/app_kitty/main", "/app_kitty/report"]) {
      const getRes = await handleRequest(new Request(`https://example.invalid${p}`), env, { store });
      expect(getRes.status).toBe(405);
    }

    // 3. Unknown entrance command never mints a session
    const unknownEnt = await postEnc(store, env, "/app_kitty/entrance", {
      uuid: "attacker-uuid",
      cmd: 9999,
    });
    expect(unknownEnt.ret).toBe(RESPONSE_INVALID_REQUEST);
    expect(unknownEnt.sessionId).toBeUndefined();

    // 4. Plaintext JSON rejected when ALLOW_PLAINTEXT_REQUESTS=false
    const plainRes = await handleRequest(
      new Request("https://example.invalid/app_kitty/entrance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid: "u1", cmd: 0 }),
      }),
      env,
      { store },
    );
    const plainDecoded = decryptPayload(await plainRes.text());
    expect(plainDecoded[0].ret).toBe(RESPONSE_INVALID_REQUEST);

    // 5. Path traversal / malformed conf name rejected
    const badConf = await handleRequest(new Request("https://example.invalid/conf/..%2Fetc%2Fpasswd"), env, {
      store,
    });
    expect(badConf.status).toBe(400);

    // 6. Oversized takeover password rejected before PBKDF2
    const longPw = await postEnc(store, env, "/app_kitty/entrance", {
      uuid: "u1",
      cmd: ENTRANCE_CMD.TAKEOVER_ISSUE,
      password: "a".repeat(200),
    });
    expect(longPw.ret).toBe(RESPONSE_INVALID_REQUEST);

    // 7. Same-UUID takeover rejected with RESPONSE_TAKEOVER_EQUAL
    const tk = await postEnc(store, env, "/app_kitty/entrance", {
      uuid: "same-user",
      cmd: ENTRANCE_CMD.TAKEOVER_ISSUE,
      password: "pw",
    });
    const sameRes = await postEnc(store, env, "/app_kitty/entrance", {
      uuid: "same-user",
      cmd: ENTRANCE_CMD.TAKEOVER_USE,
      takeover_code: tk.takeover_code,
      password: "pw",
    });
    expect(sameRes.ret).toBe(RESPONSE_TAKEOVER_EQUAL);

    // 8. Prototype pollution keys ignored in SELECT_REPLYKEY & SHOP_BUY
    const auth = await postEnc(store, env, "/app_kitty/entrance", {
      uuid: "proto-test",
      cmd: ENTRANCE_CMD.AUTH,
    });
    await postEnc(store, env, "/app_kitty/main", {
      sid: auth.sessionId,
      cmd: MAIN_CMD.SELECT_REPLYKEY,
      params: { keys: ["__proto__", "constructor", "safe_key"], values: ["bad", "bad", "ok"] },
    });
    await postEnc(store, env, "/app_kitty/main", {
      sid: auth.sessionId,
      cmd: MAIN_CMD.SHOP_BUY,
      params: { shop_id: "__proto__" },
    });
    const saved = await store.getPlayer("proto-test");
    expect(Object.keys(saved.reply_records)).toEqual(["safe_key"]);
    expect(Object.keys(saved.purchase_records)).toEqual([]);
  });
});
