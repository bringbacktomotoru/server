import { registerEntranceHandlers } from "./entrance.js";
import { registerGameplayHandlers } from "./mainGameplay.js";
import { registerSessionHandlers } from "./mainSession.js";
import { registerShopSocialHandlers } from "./mainShopSocial.js";

let initialized = false;

export function ensureHandlersRegistered() {
  if (initialized) return;
  registerEntranceHandlers();
  registerSessionHandlers();
  registerGameplayHandlers();
  registerShopSocialHandlers();
  initialized = true;
}

export {
  getEntranceHandler,
  getMainHandler,
  listEntranceHandlers,
  listMainHandlers,
} from "./registry.js";
