/**
 * HTTP response builders tailored for SakanaGL's HTTPClient.sq:
 *  - Explicit Content-Length (avoids chunked encoding issues)
 *  - Cache-Control: no-transform (prevents proxy gzip/brotli that client cannot decode)
 *  - Encrypted responses wrapped in single-element JSON array `[ { ... } ]`
 */

import { encryptPayload } from "../crypto/sakanaWire.js";

const encoder = new TextEncoder();

export function encryptedGameResponse(resultObj, config, status = 200) {
  const payload = Array.isArray(resultObj) ? resultObj : [resultObj];
  const encoded = encryptPayload(payload, config.blowfishKey);
  const bodyBytes = encoder.encode(encoded);
  return new Response(bodyBytes, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": String(bodyBytes.byteLength),
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  const json = JSON.stringify(data);
  const bodyBytes = encoder.encode(json);
  return new Response(bodyBytes, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(bodyBytes.byteLength),
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}
