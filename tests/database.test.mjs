import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import webpush from 'web-push';
import express from 'express';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/never_used';
process.env.APP_URL = 'http://localhost:5173';
const { pool } = await import('../server/db.ts');
const { config } = await import('../server/config.ts');
const { applyMigrations } = await import('../server/migrations.ts');
const { createApp } = await import('../server/app.ts');
const { MoodleClient } = await import('../server/moodle.ts');
const { synchronize } = await import('../server/sync.ts');
const { hourlyDigest, validPushEndpoint } = await import('../server/push.ts');
const { encrypt } = await import('../server/crypto.ts');
const store = await import('../server/store.ts');
const { CURRENT_SEMESTER_COURSES } = await import('../shared/currentSemester.ts');

test('personal database and API flow, worker filtering, reconnection and hourly delivery', { timeout: 120000 }, async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  const query = async (sql, values = []) => {
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] }; // embedded PG has no advisory locking across processes
    if (!values.length && /;\s*\S/.test(sql)) { await database.exec(sql); return { rows: [], rowCount: 0 }; }
    const result = await database.query(sql, values); return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  t.mock.method(pool, 'query', query);
  t.mock.method(pool, 'connect', async () => ({ query, release() {} }));
  await database.exec(await readFile(new URL('../database/migrations/001_initial.sql', import.meta.url), 'utf8'));
  await query("INSERT INTO schema_migrations(version) VALUES('001_initial')");
  await query("INSERT INTO users(id,nim,name,email,password_hash) VALUES('demo','demo','Old Demo','demo@test.test','legacy')");
  await applyMigrations({ query }); await applyMigrations({ query });
  assert.equal((await query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, 2);
  assert.equal((await query('SELECT name FROM users')).rows[0].name, 'Old Demo');
  const hash = await bcrypt.hash('testing-password-only', 4);
  await query("INSERT INTO app_accounts(id,username,name,password_hash) VALUES('owner','student','Mahasiswa',$1)", [hash]);
  await assert.rejects(query("INSERT INTO app_accounts(id,username,name,password_hash) VALUES('other','other','Other',$1)", [hash]));
  const instance = createApp().listen(0, '127.0.0.1'); await new Promise((resolve) => instance.once('listening', resolve));
  t.after(() => new Promise((resolve) => instance.close(resolve)));
  const root = `http://127.0.0.1:${instance.address().port}/api`;
  let cookie = ''; let csrf = '';
  async function request(path, method = 'GET', body = {}, headers = {}) {
    const response = await fetch(root + path, { method, headers: { Cookie: cookie, Origin: config.appUrl, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...headers },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json(), response };
  }
  await t.test('auth uses HttpOnly cookies, CSRF and owner scope; demo sessions cannot access data', async () => {
    assert.equal((await request('/courses')).status, 401);
    assert.equal((await request('/auth/login', 'POST', { username: 'demo', password: 'legacy' })).status, 401);
    assert.equal((await request('/auth/login', 'POST', { username: 'student', password: 'a'.repeat(73) })).status, 400);
    const login = await request('/auth/login', 'POST', { username: 'student', password: 'testing-password-only' });
    assert.equal(login.status, 200); assert.match(login.response.headers.get('set-cookie'), /HttpOnly/i); assert.match(login.response.headers.get('set-cookie'), /SameSite=Strict/i);
    cookie = login.response.headers.get('set-cookie').split(';')[0]; csrf = login.body.csrfToken;
    assert.equal('sessionToken' in login.body, false);
    const session = await request('/auth/session'); assert.equal(session.body.expiresAt, login.body.expiresAt); assert.equal(session.body.csrfToken, csrf);
    assert.equal((await request('/push/settings', 'PUT', { enabled: false }, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await request('/push/settings', 'PUT', { enabled: false }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('/courses')).body.courses.length, 9);
  });
  config.encryptionKey = randomBytes(32).toString('base64');
  let allowLogin = true; let submitted = false; let breakDetail = false; let expire = false; let concurrentExpiry = false; const fetched = [];
  const moodle = express(); moodle.use(express.urlencoded({ extended: false }));
  moodle.get('/login/index.php', (_req, res) => res.send('<form><input name="logintoken" value="test-token"><input name="password"></form>'));
  moodle.post('/login/index.php', (req, res) => {
    if (!allowLogin || req.body.username !== '202400001' || req.body.password !== 'mock-password') { res.redirect('/login/index.php'); return; }
    expire = false; res.cookie('MoodleSession', 'mock-session', { path: '/' }); res.redirect('/my/');
  });
  moodle.use((req, res, next) => {
    if (expire || !req.headers.cookie?.includes('MoodleSession=mock-session')) {
      if (req.query.id === '2700') setTimeout(() => res.redirect('/login/index.php'), 1000);
      else res.redirect('/login/index.php');
    } else next();
  });
  moodle.get('/my/', (_req, res) => res.send('<a href="/login/logout.php">Logout</a>'));
  moodle.get('/my/courses.php', (_req, res) => res.send([...CURRENT_SEMESTER_COURSES.map((course, index) => `<a href="/course/view.php?id=${700 + index}">${course.name} (${course.code})</a>`), '<a href="/course/view.php?id=999">Jaringan Komputer</a>'].join('')));
  moodle.get('/course/view.php', (req, res) => {
    fetched.push(req.query.id); const id = Number(req.query.id);
    if (id === 700 && concurrentExpiry) { concurrentExpiry = false; expire = true; }
    res.send(`<div class="course-content"><li class="section"><h3 class="sectionname">Tugas</h3><a href="/mod/assign/view.php?id=${id + 1000}">Tugas ${id}</a>${id === 700 ? '<a href="/mod/assign/view.php?id=2700">Tugas kedua</a>' : ''}</li></div>`);
  });
  moodle.get('/mod/assign/view.php', (req, res) => {
    if (breakDetail && req.query.id === '1700') { res.status(503).send('Unavailable'); return; }
    const date = new Date(Date.now() + 86400000).toISOString();
    res.send(`<div class="activity-description">Kerjakan tugas ini.</div><table><tr><th>Due date</th><td><time datetime="${date}">Deadline</time></td></tr><tr><th>Submission status</th><td>${submitted && req.query.id === '1700' ? 'Submitted for grading' : 'No submissions have been made yet'}</td></tr></table>`);
  });
  const source = moodle.listen(0, '127.0.0.1'); await new Promise((resolve) => source.once('listening', resolve));
  t.after(() => new Promise((resolve) => source.close(resolve)));
  config.lmsUrl = `http://127.0.0.1:${source.address().port}`;
  await t.test('worker reauthenticates, reads only whitelist courses, persists real dates and preserves manual dismissal', async () => {
    const client = new MoodleClient(); await client.login('202400001', 'mock-password');
    await store.saveConnection('owner', '202400001', encrypt({ nim: '202400001', password: 'mock-password' }, 'owner'), encrypt(client.serialize(), 'owner'));
    expire = true; await synchronize('owner');
    assert.equal(fetched.includes('999'), false);
    assert.equal((await store.listAssignments('owner')).total, 10);
    assert.equal((await store.dashboardStats('owner')).courses, 9);
    const item = await store.getAssignment('owner', '1700'); assert.equal(item.verified, true); assert.ok(item.dueAt);
    assert.equal((await request('/assignments/1700/ignore', 'POST')).status, 200);
    await synchronize('owner'); assert.ok((await store.getAssignment('owner', '1700')).dismissedAt);
    assert.equal((await store.listAssignments('owner', { scope: 'ignored' })).total, 1);
    assert.equal((await request('/assignments/1700/ignore', 'DELETE')).status, 200);
    assert.equal((await store.listAssignments('owner', { scope: 'ignored' })).total, 0);
    await query("UPDATE tracked_assignments SET due_at=now()-interval '16 days' WHERE id='1701'");
    assert.equal((await store.listAssignments('owner', { scope: 'archived' })).total, 1);
    assert.equal((await store.listAssignments('owner')).total, 9);
    assert.equal((await request('/courses/999')).status, 404);
    assert.equal((await request('/assignments?course=999')).body.total, 0);
    assert.equal((await request('/assignments?limit=2&offset=2')).body.assignments.length, 2);
  });
  await t.test('late authentication errors from concurrent requests retry with the refreshed cookie jar', async () => {
    concurrentExpiry = true; await synchronize('owner');
    assert.equal((await store.connection('owner')).state, 'connected');
    assert.equal((await store.getAssignment('owner', '1700')).verified, true);
    assert.equal((await store.getAssignment('owner', '2700')).verified, true);
  });
  await t.test('mapping requires a choice for ambiguous courses and generation fencing rejects obsolete writes', async () => {
    const original = (await store.syncStatus('owner')).courseLinks[0].candidates[0];
    await query("DELETE FROM semester_course_links WHERE code='SIN504'");
    const alternative = { ...original, id: '888', name: original.name + ' kelas lain' };
    assert.equal(await store.saveCandidates('owner', 'SIN504', [original, alternative]), null);
    assert.equal(await store.selectCourse('owner', 'SIN999', original.id), false);
    assert.equal(await store.selectCourse('owner', 'SIN504', '999'), false);
    assert.equal(await store.selectCourse('owner', 'SIN504', original.id), true);
    await assert.rejects(store.withSyncGeneration('owner', 999, () => store.q('SELECT 1')), store.SyncObsolete);
  });
  await t.test('hourly digests deduplicate across restart and devices; submitted and stale tasks are excluded', async () => {
    const vapid = webpush.generateVAPIDKeys(); config.vapidPublic = vapid.publicKey; config.vapidPrivate = vapid.privateKey; config.vapidSubject = 'mailto:test@example.com';
    await query("INSERT INTO push_subscriptions(id,account_id,endpoint,p256dh,auth) VALUES('p1','owner','https://fcm.googleapis.com/test1','x','x'),('p2','owner','https://fcm.googleapis.com/test2','x','x')");
    const sent = []; t.mock.method(webpush, 'sendNotification', async (_subscription, payload) => { sent.push(JSON.parse(payload)); return {}; });
    const time = Date.parse('2026-10-04T03:00:00Z');
    await query('UPDATE tracked_assignments SET checked_at=$1,due_at=$2,status=$3,verified=true,last_error=NULL', [new Date(time), new Date(time + 86400000), 'pending']);
    await hourlyDigest('owner', time); await hourlyDigest('owner', time);
    assert.equal(sent.length, 2); assert.equal(sent[0].title, '10 tugas menunggu dikumpulkan');
    await query("UPDATE tracked_assignments SET status='submitted'");
    await hourlyDigest('owner', time + 3600000); assert.equal(sent.length, 2);
    await query("UPDATE tracked_assignments SET status='pending'");
    await hourlyDigest('owner', time + 7200000); assert.equal(sent.length, 2); // now stale
    assert.equal(validPushEndpoint('https://127.0.0.1/private'), false);
    assert.equal(validPushEndpoint('https://fcm.googleapis.com.example.org/'), false);
    assert.equal(validPushEndpoint('https://fcm.googleapis.com/test'), true);
  });
  await t.test('expired worker lease can be replaced; the old holder cannot write or release the new lease', async () => {
    const name = 'test-lease:owner'; const first = await store.acquireLease(name, 'first');
    assert.equal(first, 'first'); assert.equal(await store.acquireLease(name, 'second'), null);
    await query("UPDATE job_leases SET expires_at=now()-interval '1 second' WHERE name=$1", [name]);
    assert.equal(await store.acquireLease(name, 'second'), 'second');
    assert.equal(await store.renewLease(name, 'first'), false);
    const generation = (await store.connection('owner')).generation;
    await assert.rejects(store.withSyncGeneration('owner', generation, () => store.q('SELECT 1'), { name, holder: 'first' }), store.SyncObsolete);
    await store.releaseLease(name, 'first');
    assert.equal((await query('SELECT holder FROM job_leases WHERE name=$1', [name])).rows[0].holder, 'second');
    await store.releaseLease(name, 'second');
  });
  await t.test('detail failure preserves known deadline but disables reminders; subsequent submit stops reminders', async () => {
    const before = (await store.getAssignment('owner', '1700')).dueAt;
    breakDetail = true; await synchronize('owner');
    const failed = await store.getAssignment('owner', '1700'); assert.equal(failed.verified, false); assert.equal(failed.dueAt, before);
    breakDetail = false; submitted = true; await synchronize('owner');
    assert.equal((await store.getAssignment('owner', '1700')).status, 'submitted');
    allowLogin = false; expire = true; await synchronize('owner'); assert.equal((await store.connection('owner')).state, 'needs_login');
  });
  await t.test('logout removes session and current device subscriptions', async () => {
    const session = (await query('SELECT token_hash FROM app_sessions')).rows[0];
    await query('UPDATE push_subscriptions SET session_token_hash=$1 WHERE id=$2', [session.token_hash, 'p1']);
    assert.equal((await request('/auth/logout', 'POST')).status, 200);
    assert.equal((await request('/auth/session')).status, 401);
    assert.equal((await query('SELECT id FROM push_subscriptions')).rows[0].id, 'p2');
  });
});
