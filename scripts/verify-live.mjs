#!/usr/bin/env node
/**
 * End-to-end smoke test against a running tomoserver instance.
 * Usage: node scripts/verify-live.mjs http://127.0.0.1:5000
 */

import crypto from "node:crypto";
import { decryptPayload, encryptPayload } from "../src/crypto/sakanaWire.js";
import { DEFAULT_PKG_MANIFEST } from "../src/domain/pkgManifest.js";

const baseUrl = (process.argv[2] || "http://127.0.0.1:5000").replace(/\/+$/, "");

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function postEnc(path, payload) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: encryptPayload(payload),
  });
  assert(res.status === 200, `${path} returned HTTP ${res.status}`);
  const text = await res.text();
  const decoded = decryptPayload(text);
  assert(Array.isArray(decoded) && decoded.length === 1, `${path} did not return 1-item array`);
  return decoded[0];
}

async function main() {
  console.log(`Verifying tomoserver at ${baseUrl} ...`);

  // 1. Health
  const healthRes = await fetch(`${baseUrl}/health`);
  const health = await healthRes.json();
  assert(healthRes.status === 200 && health.status === "healthy", `Health failed: ${JSON.stringify(health)}`);
  console.log("  [OK] GET /health ->", JSON.stringify(health));

  // 2. Setting & Pkg
  const setting = await (await fetch(`${baseUrl}/setting.json`)).json();
  assert(setting.release_pkg_version === 1027 && setting.mode === 0, `Unexpected setting: ${JSON.stringify(setting)}`);
  console.log("  [OK] GET /setting.json -> version=" + setting.release_pkg_version);

  const pkg = await (await fetch(`${baseUrl}/pkg.json`)).json();
  assert(pkg.version === 1027 && pkg.sxrlist.length === 8, `Unexpected pkg: ${JSON.stringify(pkg)}`);
  console.log("  [OK] GET /pkg.json -> sxrlist=" + pkg.sxrlist.length);

  // 3. Static SXR asset download & MD5 check
  const sxr6 = DEFAULT_PKG_MANIFEST.sxrlist.find((s) => s.sxrname === "6");
  const sxr6Res = await fetch(`${baseUrl}/dl/6-0100.sxr`);
  assert(sxr6Res.status === 200, `GET /dl/6-0100.sxr returned ${sxr6Res.status}`);
  const sxr6Buf = Buffer.from(await sxr6Res.arrayBuffer());
  const sxr6Md5 = crypto.createHash("md5").update(sxr6Buf).digest("hex").toUpperCase();
  assert(sxr6Buf.length === sxr6.size && sxr6Md5 === sxr6.md5, `6-0100.sxr mismatch: len=${sxr6Buf.length}, md5=${sxr6Md5}`);
  console.log(`  [OK] GET /dl/6-0100.sxr -> ${sxr6Buf.length} bytes, MD5 verified`);

  // 4. Encrypted AUTH -> persistence -> GET_ALL
  const testUuid = `smoke-${crypto.randomBytes(6).toString("hex")}`;
  const auth = await postEnc("/app_kitty/entrance", {
    uuid: testUuid,
    cmd: 0,
    platform_id: 1,
    sk_ver: 100,
  });
  assert(auth.ret === 1 && auth.first_login === true && auth.addr === null && auth.sessionId, `Auth failed: ${JSON.stringify(auth)}`);
  console.log(`  [OK] POST /app_kitty/entrance (AUTH) -> uid=${testUuid}, first_login=true`);

  const sid = auth.sessionId;
  const info = await postEnc("/app_kitty/main", {
    sid,
    cmd: 400,
    params: { name: "TestKitty", sex: 1 },
    seq: 1,
  });
  assert(info.ret === 1, "INPUT_PLAYERINFO failed");

  const tap = await postEnc("/app_kitty/main", {
    sid,
    cmd: 1500,
    params: {},
    seq: 2,
  });
  assert(tap.ret === 1 && tap.add_gm === 20, "COMUNICATION_TAP failed");

  // Re-auth with same UUID to prove database persisted mutations across requests
  const auth2 = await postEnc("/app_kitty/entrance", {
    uuid: testUuid,
    cmd: 0,
    platform_id: 1,
    sk_ver: 100,
  });
  assert(auth2.ret === 1 && auth2.first_login === false, "Second auth should not be first_login");
  assert(auth2.userdata[1] === "TestKitty" && auth2.userdata[5] === 5020, `Persisted userdata mismatch: name=${auth2.userdata[1]}, gm=${auth2.userdata[5]}`);
  console.log(`  [OK] Persistence verified across re-login (name=${auth2.userdata[1]}, gm=${auth2.userdata[5]})`);

  // 5. Takeover flow
  const tk = await postEnc("/app_kitty/entrance", {
    uuid: testUuid,
    cmd: 10,
    password: "smoke-password",
  });
  assert(tk.ret === 1 && tk.takeover_code, "TAKEOVER_ISSUE failed");

  const tkBad = await postEnc("/app_kitty/entrance", {
    uuid: "other-device",
    cmd: 11,
    takeover_code: tk.takeover_code,
    password: "wrong",
  });
  assert(tkBad.ret === -100, "TAKEOVER_USE wrong password should return -100");

  const tkOk = await postEnc("/app_kitty/entrance", {
    uuid: "other-device",
    cmd: 11,
    takeover_code: tk.takeover_code,
    password: "smoke-password",
  });
  assert(tkOk.ret === 1 && tkOk.uuid === testUuid, "TAKEOVER_USE failed");
  console.log(`  [OK] Takeover flow verified (code=${tk.takeover_code})`);

  // 6. Report
  const rep = await postEnc("/app_kitty/report", {
    uuid: testUuid,
    cmd: 0,
    params: { log: "live smoke verification" },
  });
  assert(rep.ret === 1, "REPORT failed");
  console.log("  [OK] POST /app_kitty/report -> ret=1");

  console.log("\nALL VERIFICATIONS PASSED!");
}

main().catch((err) => {
  console.error("\nVERIFICATION FAILED:", err);
  process.exit(1);
});
