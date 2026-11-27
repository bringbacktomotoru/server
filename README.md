# Tomoserver

[![CI](https://github.com/bringbacktomotoru/server/actions/workflows/ci.yml/badge.svg)](https://github.com/bringbacktomotoru/server/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/bringbacktomotoru/server)](https://github.com/bringbacktomotoru/server/releases/latest)

Tomoserver is the JavaScript backend for **Tomotoru (Hello Kitty Happy Life)**. Run it locally to test the Android client, or host it separately for an online build. It implements the SakanaGL `app_kitty` protocol for sign-in, account transfers, gameplay, and telemetry, and serves package metadata and game bundle downloads.

The **official Online APK** from [Tomotoru Builds](https://github.com/bringbacktomotoru/builds/releases) connects over the Internet to the server run by this project's maintainer. The server must be available to play, and it stores your progress. For your own server, build a custom APK that points to it, or use `online-test` for local testing.

The **Offline APK** has its own server built into the app. It needs no Internet or separate server and saves progress on your device. The [v0.0.1 archive](https://github.com/bringbacktomotoru/builds/releases/tag/v0.0.1) contains the unmodified original APK, which is neither revival edition.

## Quick start

Use **Node.js 22.13+** (CI runs on Node.js 22). From this checkout:

```bash
npm ci
PORT=18880 SESSION_SECRET="$(openssl rand -hex 32)" npm start
```

In another terminal, check that the server is reachable:

```bash
curl --fail http://127.0.0.1:18880/health
```

The Node adapter defaults to `127.0.0.1:5000` when `HOST` and `PORT` are unset. Port `18880` matches the Android `online-test` build. Local player progress is stored in memory and resets when the server exits.

### Connect the Android client

1. Follow the [tools build guide](https://github.com/bringbacktomotoru/tools#quick-start) to extract the base APK's SXR bundles and build the `online-test` APK.
2. From this checkout, run `node scripts/sync-assets.mjs ../tools/.cache/sxr` (adjust the path if your tools checkout has a different name). The bundles are served from `public/dl/` and are not part of this repository.
3. With the server running on port `18880`, run `adb reverse tcp:18880 tcp:18880` and launch the `online-test` APK on the device connected through ADB.

The default manifest matches the base APK's bundles. If you serve patched bundles, configure a matching manifest.

## Server entry points

| Entry point | Runtime | Player storage |
| --- | --- | --- |
| [`adapters/node.js`](adapters/node.js) | Standalone Node.js (`npm start`) | In memory until restart |
| [`adapters/worker.js`](adapters/worker.js) | Cloudflare Workers | D1 via the `DB` binding |
| [`functions/[[path]].js`](functions/%5B%5Bpath%5D%5D.js) | Cloudflare Pages Functions | D1 via the `DB` binding |

All three share the request handler in [`src/app.js`](src/app.js). For a D1-backed instance, bind `DB` and apply the [initial migration](migrations/0001_init.sql). Supply `SESSION_SECRET` through the runtime environment; session and gameplay routes require at least 32 characters. See [`.env.example`](.env.example) for other runtime settings.

## Development

```bash
npm run lint
npm test
```

For local HTTP checks and notes on the end-to-end smoke test, see the [wiki's verification guide](https://github.com/bringbacktomotoru/server/wiki/Local-Setup#verify-an-instance).

To include the optional Python protocol comparison, install the dev dependencies in a sibling `tools` checkout. For a different checkout path, run `TOMOTORU_TOOLS_DIR=/path/to/tools npm test`.

## Project links

- [Server wiki](https://github.com/bringbacktomotoru/server/wiki) — setup, configuration, and HTTP endpoints
- [Game](https://github.com/bringbacktomotoru/game) — preserved client sources and technical documentation
- [Tools](https://github.com/bringbacktomotoru/tools) — reverse-engineering utilities and the APK builder
- [Builds](https://github.com/bringbacktomotoru/builds/releases) — downloadable Android APKs
- [Offline server](https://github.com/bringbacktomotoru/offline) — the Java backend embedded in offline APKs
