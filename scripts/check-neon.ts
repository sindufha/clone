import { config as dotenv } from 'dotenv';
import { Pool } from 'pg';
import { applyMigrations } from '../server/migrations.js';
dotenv({ path: '.env.test.local', override: true });
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url || new URL(url).hostname !== 'ep-wispy-fog-azskm9dd.c-3.ap-southeast-1.aws.neon.tech') throw new Error('Uji ini hanya boleh memakai branch nexus-pwa-implementation.');
const pool = new Pool({ connectionString: url, max: 1 });
const client = await pool.connect();
try {
  const before = (await client.query('SELECT (SELECT count(*) FROM users)::int AS users,(SELECT count(*) FROM courses)::int AS courses,(SELECT count(*) FROM assignments)::int AS assignments')).rows[0];
  await applyMigrations(client); await applyMigrations(client);
  const after = (await client.query('SELECT (SELECT count(*) FROM users)::int AS users,(SELECT count(*) FROM courses)::int AS courses,(SELECT count(*) FROM assignments)::int AS assignments')).rows[0];
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Jumlah snapshot lama berubah.');
  const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('app_accounts','app_sessions','moodle_connections','semester_course_links','tracked_assignments','push_subscriptions','notification_deliveries') ORDER BY table_name")).rows;
  if (tables.length !== 7) throw new Error('Tabel baru belum lengkap.');
  console.log('PASS: migrasi Neon branch uji, idempoten, snapshot lama utuh.', { preserved: before, tables: tables.length });
} catch (error) { console.error('Uji Neon gagal:', error instanceof Error && !('code' in error) ? error.message : 'Periksa koneksi atau SQL migrasi.'); process.exitCode = 1; }
finally { client.release(); await pool.end(); }
