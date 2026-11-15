import path from 'node:path';
export function loadConfig(env = process.env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters. See README.');
  if (!['0', '1', undefined].includes(env.TRUST_PROXY)) throw new Error('TRUST_PROXY must be 0 or 1');
  const uploadDir = path.resolve(env.UPLOAD_DIR || './data/uploads');
  const publicDir = path.resolve('public');
  if (uploadDir === publicDir || uploadDir.startsWith(publicDir + path.sep)) throw new Error('Uploads must be outside public/');
  return { production: env.NODE_ENV === 'production', secret: env.SESSION_SECRET, databasePath: path.resolve(env.DATABASE_PATH || './data/kitchen.sqlite'), uploadDir, trustProxy: env.TRUST_PROXY === '1', port: Number(env.PORT || 3000), host: env.HOST || '127.0.0.1' };
}
