import 'dotenv/config';

export const config = {
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  port: Number(process.env.PORT || 4000),
  workerPort: Number(process.env.WORKER_PORT || 4001),
  workerUrl: process.env.WORKER_URL || 'http://127.0.0.1:4001',
  lmsUrl: process.env.LMS_BASE_URL || 'https://lms.itmnganjuk.ac.id',
  lmsTimezone: process.env.LMS_TIMEZONE || 'Asia/Jakarta',
  production: process.env.NODE_ENV === 'production',
  encryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY || '',
  vapidPublic: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivate: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || '',
};

export function validateProductionConfig(): void {
  if (!config.production) return;
  if (new URL(config.appUrl).protocol !== 'https:') throw new Error('APP_URL produksi harus HTTPS.');
  if (new URL(config.lmsUrl).protocol !== 'https:') throw new Error('LMS_BASE_URL harus HTTPS.');
  if (Buffer.from(config.encryptionKey, 'base64').length !== 32) throw new Error('Kunci enkripsi harus 32 byte dalam base64.');
  if (!/^[A-Za-z0-9_-]{87}$/.test(config.vapidPublic) || !/^[A-Za-z0-9_-]{43}$/.test(config.vapidPrivate) || !/^(?:mailto:|https:\/\/)/.test(config.vapidSubject)) {
    throw new Error('Konfigurasi VAPID wajib diisi untuk produksi.');
  }
}
