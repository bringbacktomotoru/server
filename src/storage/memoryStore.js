/**
 * In-memory persistence store implementing the same async interface as SqlStore.
 * Used for unit/E2E tests and zero-config local runs.
 */

export class MemoryStore {
  constructor() {
    this.players = new Map();
    this.takeoverCodes = new Map();
    this.configs = new Map();
    this.reports = [];
  }

  async getPlayer(uuid) {
    const raw = this.players.get(uuid);
    return raw ? JSON.parse(raw) : null;
  }

  async savePlayer(uuid, userData) {
    this.players.set(uuid, JSON.stringify(userData));
  }

  async deletePlayer(uuid) {
    return this.players.delete(uuid);
  }

  async saveTakeoverCode(code, entry) {
    this.takeoverCodes.set(code, { ...entry });
  }

  async getTakeoverCode(code) {
    const entry = this.takeoverCodes.get(code);
    if (!entry) return null;
    const now = Math.floor(Date.now() / 1000);
    if (entry.expiresAt < now) {
      this.takeoverCodes.delete(code);
      return null;
    }
    return { ...entry };
  }

  async deleteTakeoverCode(code) {
    this.takeoverCodes.delete(code);
  }

  async getConfig(key) {
    return this.configs.has(key) ? structuredClone(this.configs.get(key)) : null;
  }

  async setConfig(key, value) {
    this.configs.set(key, structuredClone(value));
  }

  async saveReport(uuid, cmd, payload) {
    this.reports.push({
      uuid: uuid ?? null,
      cmd: cmd ?? null,
      payload: structuredClone(payload),
      createdAt: Math.floor(Date.now() / 1000),
    });
  }

  async ping() {
    return true;
  }
}
