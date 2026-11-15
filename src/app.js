import { tr } from './i18n/index.js';
import { localization } from './i18n/index.js';
import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import path from 'node:path';
import { SqliteSessionStore } from './services/session-store.js';
import { recipeService, normalized } from './services/recipes.js';
import { imageService } from './services/images.js';
import { csrfToken, identify } from './middleware/security.js';
import { routes } from './routes/index.js';
import { scaleQuantity } from '../public/js/quantities.js';
import { commentService } from './services/comments.js';
export function createApp({ db, sqlite, config }) {
  sqlite.function('normalize_sl', { deterministic: true }, value => normalized(String(value ?? '')));
  const app = express(); app.disable('x-powered-by');
  Object.assign(app.locals, { user: null, csrf: '', path: '', flash: null, workspaces: [], inviteLink: null });
  if (config.trustProxy) app.set('trust proxy', 1);
  app.set('view engine', 'ejs'); app.set('views', path.resolve('src/views'));
  app.use(helmet({ contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'upgrade-insecure-requests': config.production ? [] : null } }, referrerPolicy: { policy: 'no-referrer' }, strictTransportSecurity: config.production ? undefined : false }));
  app.use(express.static(path.resolve('public'), { maxAge: config.production ? '1d' : 0 }));
  const store = new SqliteSessionStore(db); app.locals.sessionStore = store;
  app.use(session({ name: 'mk.sid', secret: config.secret, store, resave: false, saveUninitialized: false, cookie: { httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: 7 * 86400000 } }));
  app.use(csrfToken, identify(db), localization(db,config.production));
  app.use(express.urlencoded({ extended: false, limit: '512kb' }));

  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store'); res.locals.path = req.path;
    res.locals.flash = req.session.flash; delete req.session.flash;
    res.locals.inviteLink = req.session.inviteLink; delete req.session.inviteLink;
    res.locals.scaleQuantity = (quantity,base,target)=>scaleQuantity(quantity,base,target,req.language);
    res.locals.returnTo = req.path + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    res.locals.pageLink = page => { const params = new URLSearchParams(); for (const [k, v] of Object.entries(req.query)) if (typeof v === 'string' && k !== 'page') params.set(k, v); params.set('page', page); return '/recipes?' + params.toString(); };
    next();
  });
  app.use(routes(db, recipeService(db), imageService(db, config.uploadDir), config, commentService(db)));
  app.use((req, res) => res.status(404).render('error', { title: tr("common:s5dbe36ac6d2d"), message: tr("common:s201a7f839959") }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.code?.startsWith('LIMIT_') ? 422 : error.status || 500;
    // Database errors may contain bound values (including password hashes). Never log the full error.
    if (status >= 500) console.error('Request failed',{name:error.name,status,code:typeof error.code==='string'?error.code:undefined});
    res.status(status).render('error', { title: status === 404 ? tr("common:s5dbe36ac6d2d") : tr("common:sd17646da5179"), message: error.code?.startsWith('LIMIT_') ? tr("common:s6aa7c52d33d7") : status === 413 ? tr("common:s49fc89930055") : status === 400 ? tr("common:sfbe74a8a033f") : status < 500 ? error.message : tr("common:sfc674b2397c5") });
  });
  return app;
}
