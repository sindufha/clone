import express from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { cookieName, hashToken, requireAuth, requireCsrf, type AuthenticatedRequest } from '../auth.js';
import { q } from '../store.js';

export const authRouter = express.Router();
const loginSchema = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72) });
authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: 'Isi username dan password aplikasi.' }); return; }
  const account = (await q('SELECT * FROM app_accounts WHERE username=$1', [parsed.data.username])).rows[0];
  const valid = await bcrypt.compare(parsed.data.password, account?.password_hash || '$2b$12$C6UzMDM.H6dfI/f/IKcEe.ouHZXMKaCJHCQrMq43dBW9fXV5CU5tK');
  if (!account || !valid) { res.status(401).json({ success: false, error: 'Username atau password aplikasi salah.' }); return; }
  const token = randomBytes(32).toString('base64url'); const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 86_400_000);
  await q('INSERT INTO app_sessions(token_hash,account_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)', [hashToken(token), account.id, csrfToken, expiresAt]);
  res.cookie(cookieName(), token, { httpOnly: true, secure: config.production, sameSite: 'strict', path: '/', maxAge: 30 * 86_400_000 });
  res.json({ success: true, user: { id: account.id, username: account.username, name: account.name, nim: '', email: '' }, csrfToken, expiresAt: expiresAt.toISOString() });
});
authRouter.use(requireAuth, requireCsrf);
authRouter.get('/session', (req: AuthenticatedRequest, res) => {
  res.json({ success: true, user: req.user, csrfToken: req.csrfToken, expiresAt: req.sessionExpiresAt });
});
authRouter.post('/logout', async (req: AuthenticatedRequest, res) => {
  const endpoint = typeof req.body?.subscriptionEndpoint === 'string' ? req.body.subscriptionEndpoint : null;
  await q('DELETE FROM push_subscriptions WHERE account_id=$1 AND (session_token_hash=$2 OR endpoint=$3)', [req.user!.id, req.sessionHash, endpoint]);
  await q('DELETE FROM app_sessions WHERE token_hash=$1', [req.sessionHash]);
  res.clearCookie(cookieName(), { httpOnly: true, secure: config.production, sameSite: 'strict', path: '/' });
  res.json({ success: true });
});
