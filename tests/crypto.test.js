import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BlowfishECB, getBlowfish } from "../src/crypto/blowfish.js";
import {
  base64ToBytes,
  COMPRESS_THRESHOLD,
  decryptPayload,
  encryptPayload,
} from "../src/crypto/sakanaWire.js";
import { makeFriendCode } from "../src/domain/userData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pythonBin = path.resolve(__dirname, "../../tomotoru/.venv/bin/python");
const tomotoruRoot = path.resolve(__dirname, "../../tomotoru");

describe("BlowfishECB & SakanaGL wire protocol", () => {
  it("matches standard Blowfish ECB test vector", () => {
    // Official Schneier test vector: key = "abcdefghijklmnopqrstuvwxyz", pt = 0x424c4f5746495348 -> ct = 0x324ed0fef413a203
    const bf = new BlowfishECB("abcdefghijklmnopqrstuvwxyz");
    const pt = new Uint8Array([0x42, 0x4c, 0x4f, 0x57, 0x46, 0x49, 0x53, 0x48]);
    const ct = bf.encrypt(pt);
    expect(Buffer.from(ct).toString("hex")).toBe("324ed0fef413a203");
    expect(Buffer.from(bf.decrypt(ct)).toString("hex")).toBe("424c4f5746495348");
  });

  it("roundtrips small payload with flag=0 and little-endian size", () => {
    const payload = [{ ret: 1, sessionId: "abc-123", server_time: 1700000000, jp: "ハローキティ" }];
    const encoded = encryptPayload(payload);
    expect(typeof encoded).toBe("string");

    const raw = getBlowfish("test").decrypt(base64ToBytes(encoded));
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    expect(raw[0]).toBe(0);
    const size = view.getUint32(1, true);
    expect(size).toBeGreaterThan(0);
    expect(5 + size).toBeLessThanOrEqual(raw.length);

    expect(decryptPayload(encoded)).toEqual(payload);
  });

  it("roundtrips large compressed payload (>= 10240 bytes) with flag=1", () => {
    const payload = [{ ret: 1, blob: "A".repeat(COMPRESS_THRESHOLD + 500) }];
    const encoded = encryptPayload(payload);

    const raw = getBlowfish("test").decrypt(base64ToBytes(encoded));
    expect(raw[0]).toBe(1);
    expect(decryptPayload(encoded)).toEqual(payload);
  });

  it("rejects corrupt inputs and enforces decompressed size limit", () => {
    expect(() => decryptPayload("not-valid-base64!!!")).toThrow();
    expect(() => decryptPayload(btoa("123"))).toThrow(/length/i);

    const big = encryptPayload([{ blob: "X".repeat(COMPRESS_THRESHOLD + 2000) }]);
    expect(() => decryptPayload(big, { maxDecompressedBytes: 1024 })).toThrow(/limit/i);
  });

  it("is 100% cross-compatible bit-for-bit with Python tools/server/crypto.py", async () => {
    if (!fs.existsSync(pythonBin)) {
      return;
    }

    const cases = [
      [{ ret: 1, cmd: 0, msg: "hello world", jp: "ハローキティの部屋" }],
      [{ ret: 1, big: "SANRIO_".repeat(2000) }],
    ];

    const jsEncrypted = cases.map((c) => encryptPayload(c));

    const pyScript = `
import json, sys
try:
    from server.python.crypto import encrypt_payload, decrypt_payload
    from server.python.persistence.user_data import _make_friend_code
except ImportError:
    from tools.server.crypto import encrypt_payload, decrypt_payload
    from tools.server.persistence.user_data import _make_friend_code

inp = json.loads(sys.argv[1])
js_decoded_in_py = [decrypt_payload(e) for e in inp["js_encrypted"]]
py_encrypted = [encrypt_payload(c) for c in inp["cases"]]
friend_code = _make_friend_code("player-cross-test-001")
print(json.dumps({
    "js_decoded_in_py": js_decoded_in_py,
    "py_encrypted": py_encrypted,
    "friend_code": friend_code,
}, ensure_ascii=False))
`;

    const out = execFileSync(
      pythonBin,
      ["-c", pyScript, JSON.stringify({ cases, js_encrypted: jsEncrypted })],
      { cwd: tomotoruRoot, encoding: "utf-8" },
    );
    const res = JSON.parse(out);

    expect(res.js_decoded_in_py).toEqual(cases);
    for (let i = 0; i < cases.length; i++) {
      expect(decryptPayload(res.py_encrypted[i])).toEqual(cases[i]);
    }
    expect(await makeFriendCode("player-cross-test-001")).toBe(res.friend_code);
  });
});
