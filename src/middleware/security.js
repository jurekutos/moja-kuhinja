import { randomBytes, timingSafeEqual } from 'node:crypto';
import { eq, asc } from 'drizzle-orm';
import { users, members, households } from '../db/schema.js';
export function csrfToken(req, res, next) {
  req.session.csrf ||= randomBytes(32).toString('hex');
  res.locals.csrf = req.session.csrf; next();
}
export function verifyCsrf(req, res, next) {
  const token = req.body?._csrf || req.get('x-csrf-token');
  const expected = req.session.csrf;
  if (typeof token !== 'string' || !expected || Buffer.byteLength(token) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return res.status(403).render('error', { title: 'Zahteva je potekla', message: 'Varnostno preverjanje ni uspelo. Osvežite stran in poskusite znova.' });
  next();
}
export function identify(db) { return (req, res, next) => {
  const account=req.session.userId ? db.select({id:users.id,name:users.name,email:users.email,isModerator:users.isModerator,isSuperAdmin:users.isSuperAdmin,sessionVersion:users.sessionVersion}).from(users).where(eq(users.id,req.session.userId)).get() : null;
  if(req.session.userId && (!account || (req.session.authVersion ?? 0)!==account.sessionVersion)) { delete req.session.userId;delete req.session.authVersion;delete req.session.householdId; }
  const memberships = req.session.userId ? db.select({ id: users.id, name: users.name, email: users.email, isModerator: users.isModerator, isSuperAdmin:users.isSuperAdmin, householdId: members.householdId, householdName: households.name, role: members.role }).from(users).innerJoin(members, eq(members.userId, users.id)).innerJoin(households, eq(households.id, members.householdId)).where(eq(users.id, req.session.userId)).orderBy(asc(members.householdId)).all() : [];
  req.user = memberships.find(m => m.householdId === req.session.householdId) || memberships[0] || null;
  // A removed member can still sign in to accept a new invitation without regaining old workspace access.
  if (!req.user && req.session.userId) {
    if (account) req.user = { ...account, householdId: null, householdName: 'Brez prostora', role: 'viewer' };
  }
  res.locals.workspaces = memberships;
  if(req.user)req.user.sessionVersion=account.sessionVersion;
  if (req.user) req.session.householdId = req.user.householdId;
  res.locals.user = req.user; next();
}; }
export function requireAuth(req, res, next) { if (!req.user) return res.redirect('/login'); next(); }
export function requireEditor(req, res, next) { if (!['admin', 'editor'].includes(req.user?.role)) return res.status(403).render('error', { title: 'Dostop ni dovoljen', message: 'Za urejanje receptov potrebujete vlogo urednika ali skrbnika.' }); next(); }
export function requireAdmin(req, res, next) { if (req.user?.role !== 'admin') return res.status(403).render('error', { title: 'Dostop ni dovoljen', message: 'To dejanje lahko opravi samo skrbnik prostora.' }); next(); }
export function requireModerator(req, res, next) { if (!req.user?.isModerator) return res.status(403).render('error', { title: 'Dostop ni dovoljen', message: 'To dejanje lahko opravi samo moderator platforme.' }); next(); }
export function requireSuperAdmin(req,res,next) { if(!req.user?.isSuperAdmin)return res.status(403).render('error',{title:'Dostop ni dovoljen',message:'Ta stran je namenjena samo glavnemu skrbniku platforme.'});next(); }
