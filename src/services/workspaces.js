import { randomBytes, createHash } from 'node:crypto';
import argon2 from 'argon2';
import { and, eq, asc, isNull } from 'drizzle-orm';
import { households, members, users, invitations } from '../db/schema.js';
const fail = (message, status = 422) => { throw Object.assign(new Error(message), { status }); };
export const roles = ['admin', 'editor', 'viewer'];
const digest = token => createHash('sha256').update(token).digest('hex');
export function workspaceService(db) {
  function invite(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail('Povabilo ni veljavno ali je poteklo.', 404);
    const row = db.select().from(invitations).where(eq(invitations.tokenHash, digest(token))).get();
    if (!row || row.usedAt || row.revokedAt || row.expiresAt <= Date.now()) fail('Povabilo ni veljavno ali je poteklo.', 404);
    return { ...row, householdName: row.householdId ? db.select().from(households).where(eq(households.id, row.householdId)).get().name : null };
  }
  function requireAdmin(user) {
    const member = db.select().from(members).where(and(eq(members.userId, user.id), eq(members.householdId, user.householdId))).get();
    if (member?.role !== 'admin') fail('To dejanje lahko opravi samo skrbnik prostora.', 403);
  }
  return {
    invite,
    list(user) { return db.select({ userId: users.id, name: users.name, email: users.email, role: members.role }).from(members).innerJoin(users, eq(users.id, members.userId)).where(eq(members.householdId, user.householdId)).orderBy(asc(users.id)).all(); },
    invitations(user, platform = false) {
      if (platform ? !user.isModerator : user.role !== 'admin') fail('Dostop ni dovoljen.', 403);
      return db.select().from(invitations).where(platform ? isNull(invitations.householdId) : eq(invitations.householdId, user.householdId)).orderBy(asc(invitations.id)).all();
    },
    createInvitation(user, input, platform = false) {
      if (platform) { if (!db.select().from(users).where(and(eq(users.id, user.id), eq(users.isModerator, true))).get()) fail('Dostop ni dovoljen.', 403); }
      else requireAdmin(user);
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail('Vnesite veljaven e-poštni naslov.');
      const role = platform ? 'admin' : input.role;
      if (!roles.includes(role)) fail('Izberite veljavno vlogo.');
      const token = randomBytes(32).toString('hex');
      db.insert(invitations).values({ email, role, householdId: platform ? null : user.householdId, createdBy: user.id, tokenHash: digest(token), createdAt: new Date().toISOString(), expiresAt: Date.now() + 7 * 86400000 }).run();
      return `/join/${token}`;
    },
    revoke(user, invitationId, platform = false) {
      if (platform) { if (!user.isModerator) fail('Dostop ni dovoljen.', 403); } else requireAdmin(user);
      const row = db.select().from(invitations).where(and(eq(invitations.id, invitationId), platform ? isNull(invitations.householdId) : eq(invitations.householdId, user.householdId))).get();
      if (!row) fail('Povabilo ne obstaja.', 404);
      db.update(invitations).set({ revokedAt: new Date().toISOString() }).where(eq(invitations.id, row.id)).run();
    },
    changeMember(user, targetId, role) {
      requireAdmin(user);
      if (role !== 'remove' && !roles.includes(role)) fail('Izberite veljavno vlogo.');
      db.transaction(tx => {
        const where = and(eq(members.userId, targetId), eq(members.householdId, user.householdId));
        const target = tx.select().from(members).where(where).get();
        if (!target) fail('Član ne obstaja.', 404);
        const admins = tx.select().from(members).where(and(eq(members.householdId, user.householdId), eq(members.role, 'admin'))).all();
        if (target.role === 'admin' && role !== 'admin' && admins.length <= 1) fail('Prostor mora imeti vsaj enega skrbnika. Najprej določite drugega skrbnika.');
        if (role === 'remove') tx.delete(members).where(where).run();
        else tx.update(members).set({ role }).where(where).run();
      });
    },
    async accept(token, input, currentUser) {
      const initial = invite(token);
      const email = initial.email;
      let account = currentUser;
      let newAccount;
      if (account) { if (account.email !== email) fail('To povabilo je namenjeno drugemu e-poštnemu naslovu. Odjavite se in uporabite pravi račun.', 403); }
      else {
        if (db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()) fail('Račun s tem naslovom že obstaja. Najprej se prijavite in nato sprejmite povabilo.');
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        const password = typeof input.password === 'string' ? input.password : '';
        if (!name || name.length > 100) fail('Vnesite ime z največ 100 znaki.');
        if (password.length < 8 || password.length > 1024) fail('Geslo mora vsebovati od 8 do 1024 znakov.');
        if (password !== input.confirmation) fail('Gesli se ne ujemata.');
        newAccount = { name, email, passwordHash: await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }) };
      }
      const workspaceName = typeof input.workspaceName === 'string' ? input.workspaceName.trim() : '';
      if (!initial.householdId && (!workspaceName || workspaceName.length > 100)) fail('Vnesite ime novega prostora z največ 100 znaki.');
      return db.transaction(tx => {
        const fresh = invite(token); // Recheck expiry/use after slow password hashing.
        if (newAccount) {
          if (tx.select({ id: users.id }).from(users).where(eq(users.email, email)).get()) fail('Račun že obstaja. Prijavite se.');
          account = tx.insert(users).values(newAccount).returning({ id: users.id }).get();
        }
        const householdId = fresh.householdId || tx.insert(households).values({ name: workspaceName }).returning({ id: households.id }).get().id;
        tx.insert(members).values({ userId: account.id, householdId, role: fresh.householdId ? fresh.role : 'admin' }).onConflictDoNothing().run();
        tx.update(invitations).set({ usedAt: new Date().toISOString() }).where(eq(invitations.id, fresh.id)).run();
        return { userId: account.id, householdId };
      });
    },
    switch(user, householdId) {
      if (!db.select().from(members).where(and(eq(members.userId, user.id), eq(members.householdId, householdId))).get()) fail('Prostor ni na voljo.', 404);
      return householdId;
    },
  };
}
