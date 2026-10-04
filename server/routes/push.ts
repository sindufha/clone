import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth, requireCsrf } from '../auth.js';
import { config } from '../config.js';
import { pushConfigured, sendPush, subscriptionId, validPushEndpoint } from '../push.js';
import type { PushRow } from '../push.js';
import { q } from '../store.js';

export const pushRouter = Router();
pushRouter.use(requireAuth, requireCsrf);
pushRouter.get('/settings', async (req, res) => {
  const result = await q('SELECT reminders_enabled FROM app_accounts WHERE id=$1', [req.user!.id]);
  res.json({ success: true, configured: pushConfigured(), publicKey: config.vapidPublic, enabled: result.rows[0].reminders_enabled });
});
pushRouter.put('/settings', async (req, res) => {
  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: 'Pengaturan tidak valid.' }); return; }
  await q('UPDATE app_accounts SET reminders_enabled=$2 WHERE id=$1', [req.user!.id, parsed.data.enabled]);
  res.json({ success: true });
});
pushRouter.post('/subscriptions', async (req, res) => {
  const parsed = z.object({ endpoint: z.string().max(2000).refine(validPushEndpoint),
    keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}=?=?$/) }) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: 'Langganan push tidak valid.' }); return; }
  if (!pushConfigured()) { res.status(503).json({ success: false, error: 'Web Push belum dikonfigurasi pada server.' }); return; }
  const { endpoint, keys } = parsed.data;
  await q(`INSERT INTO push_subscriptions(id,account_id,session_token_hash,endpoint,p256dh,auth) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(endpoint) DO UPDATE SET account_id=$2,session_token_hash=$3,p256dh=$5,auth=$6`,
  [subscriptionId(), req.user!.id, req.sessionHash, endpoint, keys.p256dh, keys.auth]);
  res.json({ success: true });
});
pushRouter.delete('/subscriptions', async (req, res) => {
  if (typeof req.body?.endpoint !== 'string') { res.status(400).json({ success: false, error: 'Endpoint wajib diisi.' }); return; }
  await q('DELETE FROM push_subscriptions WHERE account_id=$1 AND endpoint=$2', [req.user!.id, req.body.endpoint]);
  res.json({ success: true });
});
pushRouter.post('/test', rateLimit({ windowMs: 60_000, limit: 2, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
  const subscription = (await q<PushRow>('SELECT * FROM push_subscriptions WHERE account_id=$1 AND endpoint=$2', [req.user!.id, req.body?.endpoint || ''])).rows[0];
  if (!subscription) { res.status(400).json({ success: false, error: 'Aktifkan notifikasi pada perangkat ini dahulu.' }); return; }
  try { await sendPush(subscription, { title: 'NEXUS siap mengingatkan', body: 'Notifikasi perangkat ini sudah terhubung.', url: '/?tab=pengaturan', tag: 'nexus-test', timestamp: Date.now() }); }
  catch { res.status(503).json({ success: false, error: 'Pengiriman gagal. Aktifkan ulang notifikasi dan coba lagi.' }); return; }
  res.json({ success: true });
});
