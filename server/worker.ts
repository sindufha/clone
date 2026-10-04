import express from 'express';
import { config, validateProductionConfig } from './config.js';
import { workerSignature, equalSecret } from './crypto.js';
import { q } from './store.js';
import { synchronize } from './sync.js';
import { hourlyDigest } from './push.js';
import { closeDatabase } from './db.js';

validateProductionConfig();
const queue = new Set<string>();
let working = false; let stopping = false; let lastQuarter = ''; let lastCleanup = '';
async function drain(): Promise<void> {
  if (working || stopping) return;
  working = true;
  try {
    while (queue.size && !stopping) {
      const id = queue.values().next().value!; queue.delete(id);
      await synchronize(id);
      await hourlyDigest(id);
    }
  } catch { console.error('Worker gagal menyelesaikan pekerjaan; jadwal berikutnya akan mencoba lagi.'); }
  finally { working = false; }
}
async function scheduled(): Promise<void> {
  const now = new Date(); const quarter = `${now.toISOString().slice(0, 13)}:${Math.floor(now.getUTCMinutes() / 15)}`;
  if (quarter === lastQuarter || stopping) return;
  lastQuarter = quarter;
  try {
    const owners = (await q("SELECT account_id FROM moodle_connections WHERE state<>'needs_login'")).rows;
    for (const owner of owners) queue.add(owner.account_id);
    const day = now.toISOString().slice(0, 10);
    if (day !== lastCleanup) {
      await q('DELETE FROM app_sessions WHERE expires_at<=now()');
      await q("DELETE FROM notification_deliveries WHERE updated_at<now()-interval '30 days'");
      await q("DELETE FROM sync_runs WHERE started_at<now()-interval '30 days' AND status<>'running'");
      lastCleanup = day;
    }
    void drain();
  } catch { lastQuarter = ''; console.error('Database worker belum tersedia.'); }
}
const app = express();
app.get('/health', (_req, res) => res.json({ status: 'ok', working, queued: queue.size }));
app.post('/sync', express.text({ type: 'application/json', limit: '2kb' }), (req, res) => {
  const body = typeof req.body === 'string' ? req.body : '';
  if (!equalSecret(req.header('X-Worker-Signature') || '', workerSignature(body))) { res.sendStatus(403); return; }
  try {
    const data = JSON.parse(body) as { accountId: string; timestamp: number };
    if (typeof data.accountId !== 'string' || data.accountId.length > 100 || Math.abs(Date.now() - data.timestamp) > 30_000 || !Number.isFinite(data.timestamp)) throw new Error();
    queue.add(data.accountId); res.sendStatus(202); void drain();
  } catch { res.sendStatus(400); }
});
const server = app.listen(config.workerPort, process.env.WORKER_BIND || '127.0.0.1', () => {
  console.log('Worker polling Moodle aktif.'); void scheduled();
});
const timer = setInterval(() => void scheduled(), 30_000);
async function shutdown() {
  stopping = true; clearInterval(timer); server.close();
  const deadline = setTimeout(() => process.exit(1), 20_000);
  while (working) await new Promise((resolve) => setTimeout(resolve, 250));
  clearTimeout(deadline); await closeDatabase(); process.exit(0);
}
process.on('SIGINT', () => void shutdown()); process.on('SIGTERM', () => void shutdown());
