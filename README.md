# tomoserver

JavaScript server implementation of the **Tomotoru** (Sanrio Characters / SakanaGL `app_kitty`) game protocol.

## Purpose

Provides the backend endpoints required by the Tomotoru game client:

- Package version and manifest checks (`/setting.json`, `/pkg.json`, `/dl/*`)
- Encrypted session authentication and account transfer codes (`/app_kitty/entrance`)
- Encrypted gameplay commands with persistent player saves (`/app_kitty/main`)
- Client telemetry handling (`/app_kitty/report`)
- Health check endpoint (`/health`)

## Local Usage

```bash
npm install
npm run lint
npm test
npm start
```
