import 'dotenv/config';
import { Pool } from 'pg';
import { applyMigrations } from '../server/migrations.js';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL_UNPOOLED diperlukan.');
const pool = new Pool({ connectionString: url, max: 1 });
try {
  const client = await pool.connect();
  try { await applyMigrations(client); } finally { client.release(); }
} catch { console.error('Migrasi gagal. Periksa koneksi direct database dan hak akses.'); process.exitCode = 1; }
finally { await pool.end(); }
