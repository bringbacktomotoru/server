/**
 * Incoming request parser for /app_kitty/{entrance,main,report}.
 * Supports:
 *   1. Raw Base64+Blowfish body (standard SakanaGL GameConnection HTTPByteBufferSender)
 *   2. multipart/form-data with `params` field (HTTPMultiPartSender)
 *   3. Plain JSON (ONLY when config.allowPlaintextRequests === true)
 */

import { decryptPayload } from "../crypto/sakanaWire.js";

export class RequestParseError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "RequestParseError";
    this.status = status;
  }
}

export async function parseGameRequest(request, config) {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > config.maxRequestBodyBytes) {
    throw new RequestParseError("Payload too large", 413);
  }

  const cryptoOpts = {
    key: config.blowfishKey,
    maxDecompressedBytes: config.maxDecompressedBytes,
  };

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const paramsVal = form.get("params");
    if (typeof paramsVal === "string" && paramsVal.trim().length > 0) {
      if (paramsVal.length > config.maxRequestBodyBytes) {
        throw new RequestParseError("Multipart params too large", 413);
      }
      try {
        const decoded = decryptPayload(paramsVal, cryptoOpts);
        return { payload: isPlainObject(decoded) ? decoded : {}, wasEncrypted: true };
      } catch (err) {
        if (config.allowPlaintextRequests) {
          try {
            const parsed = JSON.parse(paramsVal);
            return { payload: isPlainObject(parsed) ? parsed : {}, wasEncrypted: false };
          } catch {
            throw new RequestParseError(`Invalid multipart payload: ${err.message}`, 400);
          }
        }
        throw new RequestParseError(`Failed to decrypt multipart payload: ${err.message}`, 400);
      }
    }
    if (config.allowPlaintextRequests) {
      const obj = {};
      for (const [k, v] of form.entries()) {
        if (typeof v === "string") obj[k] = v;
      }
      return { payload: obj, wasEncrypted: false };
    }
    throw new RequestParseError("Missing encrypted params field", 400);
  }

  const rawBuf = new Uint8Array(await request.arrayBuffer());
  if (rawBuf.byteLength > config.maxRequestBodyBytes) {
    throw new RequestParseError("Payload too large", 413);
  }

  const rawText = new TextDecoder("utf-8").decode(rawBuf).trim();
  if (!rawText) {
    return { payload: {}, wasEncrypted: false };
  }

  if (config.allowPlaintextRequests && (rawText.startsWith("{") || rawText.startsWith("["))) {
    try {
      const parsed = JSON.parse(rawText);
      return { payload: isPlainObject(parsed) ? parsed : {}, wasEncrypted: false };
    } catch {
      // Fall through to encrypted decoding
    }
  }

  try {
    const decoded = decryptPayload(rawText, cryptoOpts);
    return { payload: isPlainObject(decoded) ? decoded : {}, wasEncrypted: true };
  } catch (err) {
    if (config.allowPlaintextRequests) {
      try {
        const parsed = JSON.parse(rawText);
        return { payload: isPlainObject(parsed) ? parsed : {}, wasEncrypted: false };
      } catch {
        // Ignore
      }
    }
    throw new RequestParseError(`Failed to decrypt request: ${err.message}`, 400);
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
