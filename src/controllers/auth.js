import { tr } from '../i18n/index.js';
import { localizedUrl,stripLanguage } from '../i18n/urls.js';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';
import { randomBytes } from 'node:crypto';
export function authController(db) {
  // A valid dummy hash gives unknown accounts the same expensive verification path.
  const dummyHash = argon2.hash(randomBytes(32), { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  return {
    loginPage(req, res) { const returnTo=typeof req.query.returnTo==='string'?stripLanguage(req.query.returnTo):'';if(/^\/community(?:\/[1-9]\d*(?:-[a-z0-9-]+)?)?$/.test(returnTo))req.session.loginReturn=returnTo;if (req.user) return res.redirect('/kitchen'); res.render('auth/login', { title: tr("auth:s5d0d38cc1cf9"), errors: [], email: '' }); },
    async login(req, res, next) {
      const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
      const password = typeof req.body.password === 'string' ? req.body.password : '';
      const user = db.select().from(users).where(eq(users.email, email)).get();
      const valid = await argon2.verify(user?.passwordHash || await dummyHash, password.length <= 1024 ? password : '').catch(() => false);
      const current=user && db.select({hash:users.passwordHash,version:users.sessionVersion}).from(users).where(eq(users.id,user.id)).get();
      if (!valid || !user || !current || current.hash!==user.passwordHash || password.length > 1024) return res.status(422).render('auth/login', { title: tr("auth:s7bcd197ef8f7"), errors: [tr("auth:scc14b37b31eb")], email });
      const destination = /^[a-f0-9]{64}$/.test(req.session.pendingInvite || '') ? `/join/${req.session.pendingInvite}` : req.session.loginReturn || '/kitchen';
      req.session.regenerate(error => { if (error) return next(error); req.session.userId = user.id;req.session.authVersion=current.version; req.session.save(error => error ? next(error) : res.redirect(localizedUrl(destination,user.language || 'sl'))); });
    },
    logout(req, res, next) { req.session.destroy(error => { if (error) return next(error); res.clearCookie('mk.sid', { path: '/' }); res.redirect('/login'); }); },
  };
}
