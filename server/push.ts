import webpush from 'web-push';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { hourSlot, reminderEligible, reminderHour } from '../shared/reminders.js';
import * as store from './store.js';
import type { QueryResultRow } from 'pg';
export interface PushRow extends QueryResultRow { id: string; endpoint: string; p256dh: string; auth: string; }

export function validPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname)
        || url.hostname.endsWith('.notify.windows.com'));
  } catch { return false; }
}
export function pushConfigured(): boolean { return Boolean(config.vapidPublic && config.vapidPrivate && config.vapidSubject); }
export async function sendPush(subscription: { endpoint: string; p256dh: string; auth: string }, payload: object): Promise<void> {
  if (!pushConfigured()) throw new Error('Web Push belum dikonfigurasi.');
  await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), {
    vapidDetails: { subject: config.vapidSubject, publicKey: config.vapidPublic, privateKey: config.vapidPrivate },
    TTL: 3300, urgency: 'normal', topic: 'nexus-hourly', timeout: 10_000,
  });
}
export async function hourlyDigest(accountId: string, now = Date.now()): Promise<void> {
  if (!pushConfigured() || !reminderHour(new Date(now))) return;
  const owner = (await store.q('SELECT reminders_enabled FROM app_accounts WHERE id=$1', [accountId])).rows[0];
  const connection = await store.connection(accountId);
  if (!owner?.reminders_enabled || connection?.state !== 'connected') return;
  const { assignments } = await store.listAssignments(accountId, { limit: 10000 }, now);
  const pending = assignments.filter((item) => reminderEligible(item, now));
  if (!pending.length) return;
  const payload = { title: `${pending.length} tugas menunggu dikumpulkan`,
    body: pending.slice(0, 3).map((item) => `${item.title.slice(0, 70)} · ${new Date(item.dueAt!).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`).join('\n'),
    url: '/?tab=tugas', tag: 'nexus-deadlines', timestamp: now };
  const subscriptions = (await store.q<PushRow>('SELECT * FROM push_subscriptions WHERE account_id=$1', [accountId])).rows;
  for (const subscription of subscriptions) {
    const claimed = await store.q(`INSERT INTO notification_deliveries(subscription_id,slot,status) VALUES($1,$2,'sending')
      ON CONFLICT DO NOTHING RETURNING slot`, [subscription.id, hourSlot(new Date(now))]);
    if (!claimed.rows.length) continue;
    // A timeout can mean the provider accepted the message. Do not resend ambiguous deliveries.
    let status = 'sent';
    for (let attempt = 1; attempt <= 2; attempt++) {
      try { await sendPush(subscription, payload); break; }
      catch (error) {
        const code = (error as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await store.q('DELETE FROM push_subscriptions WHERE id=$1', [subscription.id]); status = 'failed'; break;
        }
        if (attempt === 1 && (code === 429 || (code && code >= 500))) {
          await store.q('UPDATE notification_deliveries SET attempts=2 WHERE subscription_id=$1 AND slot=$2', [subscription.id, hourSlot(new Date(now))]);
          await new Promise((resolve) => setTimeout(resolve, 1000)); continue;
        }
        status = code ? 'failed' : 'uncertain'; break;
      }
    }
    await store.q('UPDATE notification_deliveries SET status=$3,updated_at=now() WHERE subscription_id=$1 AND slot=$2', [subscription.id, hourSlot(new Date(now)), status]);
  }
}
export const subscriptionId = () => randomUUID();
