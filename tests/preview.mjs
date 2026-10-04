// Isolated browser fixture. Never loads a real database or Moodle credentials.
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/preview';
process.env.APP_URL = 'http://localhost:4173';
process.env.NODE_ENV = 'test';
const { pool } = await import('../server/db.ts');
const { config } = await import('../server/config.ts');
const { applyMigrations } = await import('../server/migrations.ts');
const { createApp } = await import('../server/app.ts');
const { encrypt } = await import('../server/crypto.ts');
const { CURRENT_SEMESTER_COURSES } = await import('../shared/currentSemester.ts');
const db = new PGlite();
const query = async (sql, values = []) => {
  if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
  if (!values.length && /;\s*\S/.test(sql)) { await db.exec(sql); return { rows: [] }; }
  return db.query(sql, values);
};
pool.query = query; pool.connect = async () => ({ query, release() {} });
config.appUrl = 'http://localhost:4173'; config.production = false; config.encryptionKey = randomBytes(32).toString('base64');
config.vapidPrivate = ''; config.vapidPublic = '';
await applyMigrations({ query });
await query("INSERT INTO app_accounts(id,username,name,password_hash) VALUES('preview','preview','Mahasiswa',$1)", [await bcrypt.hash('preview-pass-123', 4)]);
await query("INSERT INTO moodle_connections(account_id,nim,credentials_cipher,last_sync_at) VALUES('preview','202400001',$1,now())", [encrypt({ nim: '202400001', password: 'fixture-only' }, 'preview')]);
const titles = ['Perancangan skema data warehouse', 'Pemetaan wilayah dengan QGIS', 'Rencana pengujian perangkat lunak', 'Implementasi autentikasi web', 'Praktikum REST API'];
for (let i = 0; i < CURRENT_SEMESTER_COURSES.length; i++) {
  const course = CURRENT_SEMESTER_COURSES[i]; const id = String(700 + i); const url = `https://lms.itmnganjuk.ac.id/course/view.php?id=${id}`;
  await query('INSERT INTO semester_course_links(account_id,code,selected_course_id,candidates) VALUES($1,$2,$3,$4::jsonb)', ['preview', course.code, id, JSON.stringify([{ id, name: course.name, url }])]);
  await query('INSERT INTO tracked_courses(account_id,id,code,name,source_name,url,sections) VALUES($1,$2,$3,$4,$4,$5,$6::jsonb)', ['preview', id, course.code, course.name, url,
    JSON.stringify([{ id: 0, position: 0, courseId: id, title: 'Pertemuan 1', content: 'Materi contoh untuk verifikasi.', activities: [{ id: 0, courseId: id, sectionId: 0, name: 'Materi perkuliahan', type: 'resource', link: url, position: 0 }] }])]);
  if (i < 5) await query('INSERT INTO tracked_assignments(account_id,id,course_id,title,url,description,due_at,status,verified,checked_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,now())',
    ['preview', String(1700 + i), id, titles[i], `https://lms.itmnganjuk.ac.id/mod/assign/view.php?id=${1700 + i}`, 'Instruksi contoh: kerjakan tugas dan kumpulkan melalui Moodle.',
      new Date(Date.now() + (i === 0 ? -2 : i + 1) * 86400000), ['overdue', 'pending', 'pending', 'draft', 'submitted'][i]]);
}
const server = createApp(true).listen(4173, '127.0.0.1', () => console.log('Fixture browser: http://localhost:4173 · akun preview / preview-pass-123 (data contoh, hanya localhost).'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(() => { void db.close().then(() => process.exit(0)); }); });
