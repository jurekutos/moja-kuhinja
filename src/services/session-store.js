import session from 'express-session';
import { eq, lt } from 'drizzle-orm';
import { sessions } from '../db/schema.js';
export class SqliteSessionStore extends session.Store {
  constructor(db) { super(); this.db = db; this.timer = setInterval(() => this.prune(), 900000); this.timer.unref(); this.prune(); }
  prune() { this.db.delete(sessions).where(lt(sessions.expires, Date.now())).run(); }
  get(sid, cb) { try { const row = this.db.select().from(sessions).where(eq(sessions.sid, sid)).get(); cb(null, row && row.expires > Date.now() ? JSON.parse(row.data) : null); } catch(e) { cb(e); } }
  set(sid, data, cb = () => {}) { try { const expires = data.cookie.expires ? new Date(data.cookie.expires).getTime() : Date.now() + 7 * 86400000; this.db.insert(sessions).values({ sid, data: JSON.stringify(data), expires }).onConflictDoUpdate({ target: sessions.sid, set: { data: JSON.stringify(data), expires } }).run(); cb(); } catch(e) { cb(e); } }
  destroy(sid, cb = () => {}) { try { this.db.delete(sessions).where(eq(sessions.sid, sid)).run(); cb(); } catch(e) { cb(e); } }
  touch(sid, data, cb) { this.set(sid, data, cb); }
  close() { clearInterval(this.timer); }
}
