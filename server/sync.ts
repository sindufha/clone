import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import type { SerializedCookieJar } from 'tough-cookie';
import { CURRENT_SEMESTER_COURSES, getCurrentSemesterCourse } from '../shared/currentSemester.js';
import { DAY_MS, isArchived } from '../shared/reminders.js';
import { config } from './config.js';
import { decrypt, encrypt } from './crypto.js';
import { MoodleAuthError, MoodleClient } from './moodle.js';
import * as store from './store.js';

export async function synchronize(accountId: string): Promise<void> {
  const name = `sync:${accountId}`;
  const holder = await store.acquireLease(name);
  if (!holder) return;
  const started = new Date(); const runId = randomUUID();
  const abort = new AbortController(); const deadline = setTimeout(() => abort.abort(), 12 * 60_000);
  const heartbeat = setInterval(() => { store.renewLease(name, holder).then((valid) => { if (!valid) abort.abort(); }).catch(() => abort.abort()); }, 60_000);
  let courses = 0; let assignments = 0; let errors = 0; let status = 'failed'; let message = 'Sinkronisasi gagal. Akan dicoba pada jadwal berikutnya.';
  let generation = -1;
  try {
    const connection = await store.connection(accountId);
    if (!connection || connection.state === 'needs_login') return;
    generation = connection.generation;
    await store.q("UPDATE sync_runs SET status='interrupted',finished_at=now(),message='Worker dimulai ulang.' WHERE account_id=$1 AND status='running'", [accountId]);
    await store.q('INSERT INTO sync_runs(id,account_id) VALUES($1,$2)', [runId, accountId]);
    await store.withSyncGeneration(accountId, connection.generation, async () => {
      const credentials = decrypt<{ nim: string; password: string }>(connection.credentials_cipher, accountId);
      let cookies: SerializedCookieJar | undefined;
      try { if (connection.cookies_cipher) cookies = decrypt<SerializedCookieJar>(connection.cookies_cipher, accountId); } catch { /* fresh login */ }
      const client = new MoodleClient(cookies, config.lmsUrl, abort.signal);
      let login: Promise<void> | null = null;
      let relogged = false;
      let authEpoch = 0;
      const read = async <T>(operation: () => Promise<T>): Promise<T> => {
        for (let attempt = 0; attempt < 3; attempt++) {
          abort.signal.throwIfAborted();
          const observedEpoch = authEpoch;
          try { await pause(350, undefined, { signal: abort.signal }); return await operation(); }
          catch (error) {
            if (error instanceof MoodleAuthError) {
              // An older response may arrive after another request refreshed the cookie jar.
              if (authEpoch > observedEpoch) continue;
              if (!login && !relogged) {
                relogged = true; login = client.login(credentials.nim, credentials.password).then(() => { authEpoch++; });
              }
              if (!login) throw error;
              await login; login = null; continue;
            }
            if (attempt === 2 || abort.signal.aborted) throw error;
            await pause((attempt + 1) * 1500, undefined, { signal: abort.signal });
          }
        }
        throw new Error('Batas percobaan habis.');
      };
      const discovered = await read(() => client.courses());
      if (!discovered.length) throw new Error('Daftar mata kuliah belum dapat diverifikasi.');
      const archiveScan = !connection.last_archive_sync_at || started.getTime() - new Date(connection.last_archive_sync_at).getTime() >= DAY_MS;
      for (const course of CURRENT_SEMESTER_COURSES) {
        abort.signal.throwIfAborted();
        const candidates = discovered.filter((candidate) => getCurrentSemesterCourse(candidate.name)?.code === course.code);
        const selected = await store.saveCandidates(accountId, course.code, candidates);
        const candidate = candidates.find((item) => item.id === selected);
        if (!candidate) { errors++; continue; }
        try {
          const page = await read(() => client.course(candidate));
          await store.saveCourse(accountId, course.code, candidate, page.sections);
          courses++;
          const existing = (await store.q('SELECT id,due_at,checked_at,dismissed_at FROM tracked_assignments WHERE account_id=$1 AND course_id=$2', [accountId, candidate.id])).rows;
          let cursor = 0;
          const inspect = async () => {
            while (cursor < page.assignments.length) {
              const link = page.assignments[cursor++];
              const prior = existing.find((item) => item.id === link.id);
              if (prior?.dismissed_at || (!archiveScan && prior?.checked_at && isArchived(store.iso(prior.due_at), started.getTime()))) continue;
              try {
                const details = await read(() => client.assignment(link));
                await store.saveAssignment(accountId, candidate.id, link, details);
                assignments++; if (!details.verified) errors++;
              } catch (error) {
                if (error instanceof MoodleAuthError || error instanceof store.SyncObsolete || abort.signal.aborted) throw error;
                errors++; await store.markDetailError(accountId, candidate.id, link);
              }
            }
          };
          const results = await Promise.allSettled([inspect(), inspect()]);
          const failed = results.find((item) => item.status === 'rejected');
          if (failed?.status === 'rejected') throw failed.reason;
          await store.markPresent(accountId, candidate.id, page.assignments);
        } catch (error) {
          if (error instanceof MoodleAuthError || error instanceof store.SyncObsolete || abort.signal.aborted) throw error;
          errors++; await store.markCourseError(accountId, candidate.id);
        }
      }
      status = errors ? 'partial' : 'success';
      message = errors ? 'Sebagian data belum terverifikasi. Periksa pemetaan dan koneksi.' : 'Semua mata kuliah dalam whitelist selesai diperiksa.';
      await store.q(`UPDATE moodle_connections SET cookies_cipher=$2,state='connected',last_error=$3,last_sync_at=now(),
        last_archive_sync_at=CASE WHEN $4 THEN now() ELSE last_archive_sync_at END,
        sync_requested_at=CASE WHEN sync_requested_at<=$5 THEN NULL ELSE sync_requested_at END,updated_at=now() WHERE account_id=$1`,
      [accountId, encrypt(client.serialize(), accountId), errors ? message : null, archiveScan, started]);
    }, { name, holder });
  } catch (error) {
    if (error instanceof store.SyncObsolete) { status = 'interrupted'; message = 'Sinkronisasi telah digantikan atau koneksi berubah. Pemeriksaan baru akan dilanjutkan oleh worker.'; }
    else {
      const auth = error instanceof MoodleAuthError;
      status = auth ? 'needs_login' : 'failed';
      message = auth ? error.message : abort.signal.aborted ? 'Sinkronisasi melewati batas waktu. Akan dicoba lagi.' : 'Moodle gagal diperiksa. Pengingat ditunda sampai data terverifikasi.';
      try {
        await store.withSyncGeneration(accountId, generation, async () => {
          await store.q('UPDATE moodle_connections SET state=$2,last_error=$3 WHERE account_id=$1', [accountId, auth ? 'needs_login' : 'error', message]);
          await store.q('UPDATE tracked_assignments SET verified=false,last_error=$2 WHERE account_id=$1', [accountId, message]);
        }, { name, holder });
      } catch (fenceError) { if (!(fenceError instanceof store.SyncObsolete)) throw fenceError; status = 'interrupted'; }
    }
  } finally {
    clearTimeout(deadline); clearInterval(heartbeat);
    await store.q('UPDATE sync_runs SET finished_at=now(),status=$2,courses=$3,assignments=$4,errors=$5,message=$6 WHERE id=$1', [runId, status, courses, assignments, errors, message]);
    await store.releaseLease(name, holder);
  }
}
