/**
 * Handler registry for entrance and main game commands.
 */

const entranceHandlers = new Map();
const mainHandlers = new Map();

export function registerEntrance(cmdId, handler) {
  entranceHandlers.set(cmdId, handler);
}

export function registerMain(cmdId, handler) {
  mainHandlers.set(cmdId, handler);
}

export function getEntranceHandler(cmdId) {
  return entranceHandlers.get(cmdId) ?? null;
}

export function getMainHandler(cmdId) {
  return mainHandlers.get(cmdId) ?? null;
}

export function listEntranceHandlers() {
  return [...entranceHandlers.keys()].sort((a, b) => a - b);
}

export function listMainHandlers() {
  return [...mainHandlers.keys()].sort((a, b) => a - b);
}
