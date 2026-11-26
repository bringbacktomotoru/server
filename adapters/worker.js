/**
 * Web-Standard Fetch handler entrypoint for serverless/edge runtimes with static asset binding.
 */

import { handleRequest } from "../src/app.js";

export default {
  async fetch(request, env, ctx) {
    const response = await handleRequest(request, env, {
      waitUntil: (promise) => ctx.waitUntil(promise),
    });

    if (response !== null) {
      return response;
    }

    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
};
