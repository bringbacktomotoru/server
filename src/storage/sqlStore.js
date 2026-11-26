/**
 * SQL persistence store for players, takeover codes, dynamic config, and reports.
 */

export class SqlStore {
  /**
   * @param {any} db Prepared-statement SQL database handle
   */
  constructor(db) {
    if (!db) {
      throw new Error("SqlStore requires a valid database handle (env.DB)");
    }
    this.db = db;
  }

  async getPlayer(uuid) {
    const row = await this.db
      .prepare("SELECT data FROM players WHERE uuid = ?")
      .bind(uuid)
      .first();
    if (!row || typeof row.data !== "string") return null;
    return JSON.parse(row.data);
  }

  async savePlayer(uuid, userData) {
    const now = Math.floor(Date.now() / 1000);
    const version = Number(userData.version ?? 3);
    const serialized = JSON.stringify(userData);
    await this.db
      .prepare(
        `INSERT INTO players (uuid, data, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(uuid) DO UPDATE SET
           data = excluded.data,
           version = excluded.version,
           updated_at = excluded.updated_at`,
      )
      .bind(uuid, serialized, version, now, now)
      .run();
  }

  async deletePlayer(uuid) {
    const res = await this.db.prepare("DELETE FROM players WHERE uuid = ?").bind(uuid).run();
    return Boolean(res?.meta?.changes);
  }

  async saveTakeoverCode(code, entry) {
    await this.db
      .prepare(
        `INSERT INTO takeover_codes (code, uuid, password_hash, salt, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET
           uuid = excluded.uuid,
           password_hash = excluded.password_hash,
           salt = excluded.salt,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at`,
      )
      .bind(code, entry.uuid, entry.passwordHash, entry.salt, entry.createdAt, entry.expiresAt)
      .run();
  }

  async getTakeoverCode(code) {
    const row = await this.db
      .prepare("SELECT code, uuid, password_hash, salt, created_at, expires_at FROM takeover_codes WHERE code = ?")
      .bind(code)
      .first();
    if (!row) return null;
    const now = Math.floor(Date.now() / 1000);
    if (Number(row.expires_at) < now) {
      await this.deleteTakeoverCode(code);
      return null;
    }
    return {
      code: row.code,
      uuid: row.uuid,
      passwordHash: row.password_hash,
      salt: row.salt,
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
    };
  }

  async deleteTakeoverCode(code) {
    await this.db.prepare("DELETE FROM takeover_codes WHERE code = ?").bind(code).run();
  }

  async getConfig(key) {
    const row = await this.db
      .prepare("SELECT value FROM server_config WHERE key = ?")
      .bind(key)
      .first();
    if (!row || typeof row.value !== "string") return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  async saveReport(uuid, cmd, payload) {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare("INSERT INTO client_reports (uuid, cmd, payload, created_at) VALUES (?, ?, ?, ?)")
      .bind(uuid ?? null, Number.isFinite(cmd) ? cmd : null, JSON.stringify(payload), now)
      .run();
  }

  async ping() {
    const row = await this.db.prepare("SELECT 1 AS ok").first();
    return Boolean(row && row.ok === 1);
  }
}
