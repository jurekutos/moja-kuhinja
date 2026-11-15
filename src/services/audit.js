import { auditEvents } from '../db/schema.js';
export function audit(db, actorId, action, workspaceId = null, targetUserId = null) {
  db.insert(auditEvents).values({ actorId, action, workspaceId, targetUserId, createdAt:new Date().toISOString() }).run();
}
