import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../server/db.js';

let masked = false;
const output = new Writable({ write(chunk, _encoding, done) { if (!masked) process.stdout.write(chunk); done(); } });
const prompt = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
try {
  const reset = process.argv.includes('--reset-password');
  const username = (await prompt.question('Username aplikasi: ')).trim();
  if (!/^[A-Za-z0-9_.-]{3,64}$/.test(username)) throw new Error('Username: 3–64 huruf/angka, titik, garis bawah, atau minus.');
  const name = reset ? '' : (await prompt.question('Nama tampilan: ')).trim().slice(0, 100);
  process.stdout.write('Password aplikasi (minimal 12 karakter): '); masked = true;
  const password = await prompt.question(''); masked = false; process.stdout.write('\n');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Password minimal 12 karakter dan maksimal 72 byte UTF-8.');
  const hash = await bcrypt.hash(password, 12);
  await withTransaction(async (client) => {
    if (reset) {
      const owner = (await client.query('UPDATE app_accounts SET password_hash=$2 WHERE username=$1 RETURNING id', [username, hash])).rows[0];
      if (!owner) throw new Error('Akun tidak ditemukan.');
      await client.query('DELETE FROM app_sessions WHERE account_id=$1', [owner.id]);
      await client.query('DELETE FROM push_subscriptions WHERE account_id=$1', [owner.id]);
    } else {
      if ((await client.query('SELECT id FROM app_accounts')).rows.length) throw new Error('Owner sudah ada. Gunakan --reset-password untuk mengganti password.');
      await client.query('INSERT INTO app_accounts(id,username,name,password_hash) VALUES($1,$2,$3,$4)', [randomUUID(), username, name || username, hash]);
    }
  });
  console.log(reset ? 'Password diganti; sesi dan push perangkat dicabut.' : 'Owner dibuat. Login dengan akun aplikasi ini, lalu hubungkan Moodle lewat Pengaturan.');
} catch (error) { masked = false; console.error(error instanceof Error && !('code' in error) ? error.message : 'Operasi akun gagal. Periksa koneksi database.'); process.exitCode = 1; }
finally { prompt.close(); await pool.end(); }
