import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { config } from './config.js';
import { equalSecret } from './crypto.js';
import { q, iso } from './store.js';
import type { User } from '../shared/types.js';

export interface AuthenticatedRequest extends Request {
  user?: User; sessionHash?: string; csrfToken?: string; sessionExpiresAt?: string;
}
export const cookieName = () => config.production ? '__Host-nexus_session' : 'nexus_session';
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function sessionCookie(req: Request): string | null {
  const value = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName()}=`))?.slice(cookieName().length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export const requireAuth: RequestHandler = async (req: AuthenticatedRequest, res, next) => {
  const token = sessionCookie(req);
  if (!token) { res.status(401).json({ success: false, error: 'Silakan masuk ke aplikasi.' }); return; }
  const result = await q(`SELECT a.id,a.username,a.name,c.nim,s.csrf_token,s.expires_at
    FROM app_sessions s JOIN app_accounts a ON a.id=s.account_id
    LEFT JOIN moodle_connections c ON c.account_id=a.id WHERE s.token_hash=$1 AND s.expires_at>now()`, [hashToken(token)]);
  const row = result.rows[0];
  if (!row) { res.status(401).json({ success: false, error: 'Sesi berakhir. Silakan masuk kembali.' }); return; }
  req.user = { id: row.id, username: row.username, name: row.name, nim: row.nim || '', email: '' };
  req.sessionHash = hashToken(token); req.csrfToken = row.csrf_token; req.sessionExpiresAt = iso(row.expires_at)!;
  next();
};
export const requireOrigin: RequestHandler = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
  if (req.headers.origin !== new URL(config.appUrl).origin || !req.is('application/json')) {
    res.status(403).json({ success: false, error: 'Permintaan perubahan harus berasal dari aplikasi.' }); return;
  }
  next();
};
export const requireCsrf: RequestHandler = (req: AuthenticatedRequest, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
  if (!req.csrfToken || !equalSecret(req.header('x-csrf-token') || '', req.csrfToken)) {
    res.status(403).json({ success: false, error: 'Token keamanan sesi tidak valid. Muat ulang halaman.' }); return;
  }
  next();
};
