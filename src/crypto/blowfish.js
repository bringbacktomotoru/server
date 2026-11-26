/**
 * Pure JavaScript Blowfish ECB implementation (Bruce Schneier, 16 rounds).
 * Zero native dependencies — runs on any standard JavaScript runtime.
 */

import { P_INIT, S0_INIT, S1_INIT, S2_INIT, S3_INIT } from "./blowfishTables.js";

const encoder = new TextEncoder();
const cipherCache = new Map();

export class BlowfishECB {
  /**
   * @param {string | Uint8Array} key
   */
  constructor(key) {
    const keyBytes = typeof key === "string" ? encoder.encode(key) : key;
    if (!(keyBytes instanceof Uint8Array) || keyBytes.length < 1 || keyBytes.length > 56) {
      throw new RangeError("Blowfish key length must be between 1 and 56 bytes");
    }

    this.P = new Uint32Array(P_INIT);
    this.S0 = new Uint32Array(S0_INIT);
    this.S1 = new Uint32Array(S1_INIT);
    this.S2 = new Uint32Array(S2_INIT);
    this.S3 = new Uint32Array(S3_INIT);

    // Key schedule: XOR P-array with cyclic 32-bit big-endian key chunks
    let j = 0;
    for (let i = 0; i < 18; i++) {
      let data = 0;
      for (let k = 0; k < 4; k++) {
        data = ((data << 8) | keyBytes[j]) >>> 0;
        j = (j + 1) % keyBytes.length;
      }
      this.P[i] = (this.P[i] ^ data) >>> 0;
    }

    // Encrypt all-zero block iteratively to populate P and S boxes
    let l = 0;
    let r = 0;
    for (let i = 0; i < 18; i += 2) {
      [l, r] = this._encryptBlock(l, r);
      this.P[i] = l;
      this.P[i + 1] = r;
    }

    const sBoxes = [this.S0, this.S1, this.S2, this.S3];
    for (let boxIdx = 0; boxIdx < 4; boxIdx++) {
      const box = sBoxes[boxIdx];
      for (let i = 0; i < 256; i += 2) {
        [l, r] = this._encryptBlock(l, r);
        box[i] = l;
        box[i + 1] = r;
      }
    }
  }

  _f(x) {
    const a = (x >>> 24) & 0xff;
    const b = (x >>> 16) & 0xff;
    const c = (x >>> 8) & 0xff;
    const d = x & 0xff;
    return ((((this.S0[a] + this.S1[b]) >>> 0) ^ this.S2[c]) + this.S3[d]) >>> 0;
  }

  _encryptBlock(l, r) {
    const P = this.P;
    let xl = l >>> 0;
    let xr = r >>> 0;
    for (let i = 0; i < 16; i++) {
      xl = (xl ^ P[i]) >>> 0;
      xr = (xr ^ this._f(xl)) >>> 0;
      const tmp = xl;
      xl = xr;
      xr = tmp;
    }
    const tmp = xl;
    xl = xr;
    xr = tmp;
    xr = (xr ^ P[16]) >>> 0;
    xl = (xl ^ P[17]) >>> 0;
    return [xl, xr];
  }

  _decryptBlock(l, r) {
    const P = this.P;
    let xl = l >>> 0;
    let xr = r >>> 0;
    for (let i = 17; i >= 2; i--) {
      xl = (xl ^ P[i]) >>> 0;
      xr = (xr ^ this._f(xl)) >>> 0;
      const tmp = xl;
      xl = xr;
      xr = tmp;
    }
    const tmp = xl;
    xl = xr;
    xr = tmp;
    xr = (xr ^ P[1]) >>> 0;
    xl = (xl ^ P[0]) >>> 0;
    return [xl, xr];
  }

  /**
   * Encrypts data (length must be a multiple of 8 bytes).
   * @param {Uint8Array} input
   * @returns {Uint8Array}
   */
  encrypt(input) {
    if (input.length % 8 !== 0) {
      throw new RangeError(`Blowfish ECB input length must be a multiple of 8, got ${input.length}`);
    }
    const out = new Uint8Array(input.length);
    const inView = new DataView(input.buffer, input.byteOffset, input.byteLength);
    const outView = new DataView(out.buffer, out.byteOffset, out.byteLength);
    for (let off = 0; off < input.length; off += 8) {
      const [xl, xr] = this._encryptBlock(inView.getUint32(off, false), inView.getUint32(off + 4, false));
      outView.setUint32(off, xl, false);
      outView.setUint32(off + 4, xr, false);
    }
    return out;
  }

  /**
   * Decrypts data (length must be a multiple of 8 bytes).
   * @param {Uint8Array} input
   * @returns {Uint8Array}
   */
  decrypt(input) {
    if (input.length % 8 !== 0) {
      throw new RangeError(`Blowfish ECB ciphertext length must be a multiple of 8, got ${input.length}`);
    }
    const out = new Uint8Array(input.length);
    const inView = new DataView(input.buffer, input.byteOffset, input.byteLength);
    const outView = new DataView(out.buffer, out.byteOffset, out.byteLength);
    for (let off = 0; off < input.length; off += 8) {
      const [xl, xr] = this._decryptBlock(inView.getUint32(off, false), inView.getUint32(off + 4, false));
      outView.setUint32(off, xl, false);
      outView.setUint32(off + 4, xr, false);
    }
    return out;
  }
}

/**
 * Returns a cached BlowfishECB instance for a string key.
 * @param {string} key
 * @returns {BlowfishECB}
 */
export function getBlowfish(key = "test") {
  let cipher = cipherCache.get(key);
  if (!cipher) {
    cipher = new BlowfishECB(key);
    cipherCache.set(key, cipher);
  }
  return cipher;
}
