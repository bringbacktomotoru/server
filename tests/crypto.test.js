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
const gameRoot = process.env.TOMOTORU_GAME_DIR
  ? path.resolve(process.env.TOMOTORU_GAME_DIR)
  : path.resolve(__dirname, "../../game");
const pythonBin = path.join(gameRoot, ".venv", "bin", "python");
const hasGameCodec = fs.existsSync(pythonBin) &&
  fs.existsSync(path.join(gameRoot, "tests", "sakana_wire.py"));

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

  it("matches the game's nine-digit friend code", async () => {
    expect(await makeFriendCode("player-cross-test-001")).toBe(137078568);
  });

  it.skipIf(!hasGameCodec)("is compatible with the game's Python test codec", () => {
    const cases = [
      [{ ret: 1, cmd: 0, msg: "hello world", jp: "ハローキティの部屋" }],
      [{ ret: 1, big: "SANRIO_".repeat(2000) }],
    ];

    const jsEncrypted = cases.map((c) => encryptPayload(c));

    const pyScript = `
import json, sys
from tests.sakana_wire import encrypt_payload, decrypt_payload

inp = json.loads(sys.argv[1])
js_decoded_in_py = [decrypt_payload(e) for e in inp["js_encrypted"]]
py_encrypted = [encrypt_payload(c) for c in inp["cases"]]
print(json.dumps({
    "js_decoded_in_py": js_decoded_in_py,
    "py_encrypted": py_encrypted,
}, ensure_ascii=False))
`;

    const out = execFileSync(
      pythonBin,
      ["-c", pyScript, JSON.stringify({ cases, js_encrypted: jsEncrypted })],
      { cwd: gameRoot, encoding: "utf-8" },
    );
    const res = JSON.parse(out);

    expect(res.js_decoded_in_py).toEqual(cases);
    for (let i = 0; i < cases.length; i++) {
      expect(decryptPayload(res.py_encrypted[i])).toEqual(cases[i]);
    }
  });
});
