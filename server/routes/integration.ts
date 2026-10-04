import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth, requireCsrf } from '../auth.js';
import { encrypt, workerSignature } from '../crypto.js';
import { config } from '../config.js';
import { MoodleClient, MoodleAuthError } from '../moodle.js';
import * as store from '../store.js';

export async function requestSync(accountId: string): Promise<boolean> {
  await store.q('UPDATE moodle_connections SET sync_requested_at=now() WHERE account_id=$1', [accountId]);
  const body = JSON.stringify({ accountId, timestamp: Date.now() });
  try {
    const response = await fetch(`${config.workerUrl}/sync`, { method: 'POST', body,
      headers: { 'Content-Type': 'application/json', 'X-Worker-Signature': workerSignature(body) }, signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch { return false; }
}
export const integrationRouter = Router();
integrationRouter.use(requireAuth, requireCsrf);
integrationRouter.get('/status', async (req, res) => res.json({ success: true, ...await store.syncStatus(req.user!.id) }));
integrationRouter.use(rateLimit({ windowMs: 60_000, limit: 3, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { success: false, error: 'Tunggu satu menit sebelum meminta sinkronisasi lagi.' } }));
integrationRouter.put('/moodle', async (req, res) => {
  const parsed = z.object({ nim: z.string().regex(/^\d{5,30}$/), password: z.string().min(1).max(1024) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: 'Isi NIM dan password Moodle yang valid.' }); return; }
  const client = new MoodleClient(undefined, config.lmsUrl, AbortSignal.timeout(90_000));
  try { await client.login(parsed.data.nim, parsed.data.password); }
  catch (error) { res.status(error instanceof MoodleAuthError ? 400 : 503).json({ success: false,
    error: error instanceof MoodleAuthError ? error.message : 'Moodle sedang tidak dapat dihubungi. Coba lagi nanti.' }); return; }
  const id = req.user!.id;
  await store.saveConnection(id, parsed.data.nim, encrypt(parsed.data, id), encrypt(client.serialize(), id));
  res.status(202).json({ success: true, workerAvailable: await requestSync(id) });
});
integrationRouter.delete('/moodle', async (req, res) => {
  await store.q('DELETE FROM moodle_connections WHERE account_id=$1', [req.user!.id]);
  await store.q("UPDATE tracked_assignments SET verified=false,last_error='Koneksi Moodle telah dihapus.' WHERE account_id=$1", [req.user!.id]);
  res.json({ success: true });
});
integrationRouter.post('/sync', async (req, res) => {
  if (!await store.connection(req.user!.id)) { res.status(409).json({ success: false, error: 'Hubungkan Moodle terlebih dahulu.' }); return; }
  res.status(202).json({ success: true, workerAvailable: await requestSync(req.user!.id) });
});
integrationRouter.put('/courses/:code', async (req, res) => {
  const parsed = z.object({ courseId: z.string().regex(/^\d+$/) }).safeParse(req.body);
  if (!parsed.success || !await store.selectCourse(req.user!.id, String(req.params.code), parsed.data.courseId)) {
    res.status(400).json({ success: false, error: 'Pilihan mata kuliah tidak tersedia.' }); return;
  }
  res.status(202).json({ success: true, workerAvailable: await requestSync(req.user!.id) });
});
