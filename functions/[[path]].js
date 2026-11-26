/**
 * Catch-all HTTP router for dynamic game API routes and static asset fallback.
 */

import { handleRequest } from "../src/app.js";

export async function onRequest(context) {
  const response = await handleRequest(context.request, context.env, {
    waitUntil: (promise) => context.waitUntil(promise),
  });

  if (response !== null) {
    return response;
  }

  return context.next();
}
