import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { QueryResultRow } from 'pg';
import { pool, withTransaction } from './db.js';
import { CURRENT_SEMESTER_COURSES } from '../shared/currentSemester.js';
import { DAY_MS, isArchived } from '../shared/reminders.js';
import type { Assignment, AssignmentStatus, CourseCandidate, CourseDetail, CourseSection, CourseSummary, DashboardStats, SyncStatus } from '../shared/types.js';
import type { AssignmentDetails, AssignmentLink } from './moodle.js';

export const codes = CURRENT_SEMESTER_COURSES.map((course) => course.code);
const syncContext = new AsyncLocalStorage<{ accountId: string; generation: number; lease?: { name: string; holder: string } }>();
export class SyncObsolete extends Error {}
export const withSyncGeneration = <T>(accountId: string, generation: number, callback: () => Promise<T>, lease?: { name: string; holder: string }) =>
  syncContext.run({ accountId, generation, lease }, callback);
export async function q<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
  const context = syncContext.getStore();
  if (!context) return pool.query<T>(sql, values);
  return withTransaction(async (client) => {
    const current = await client.query('SELECT generation FROM moodle_connections WHERE account_id=$1 FOR UPDATE', [context.accountId]);
    if (current.rows[0]?.generation !== context.generation) throw new SyncObsolete('Koneksi berubah saat sinkronisasi.');
    if (context.lease) {
      const lease = await client.query('SELECT holder FROM job_leases WHERE name=$1 AND holder=$2 AND expires_at>clock_timestamp() FOR UPDATE', [context.lease.name, context.lease.holder]);
      if (!lease.rows.length) throw new SyncObsolete('Sinkronisasi sudah digantikan worker lain.');
    }
    return client.query<T>(sql, values);
  });
}
export const iso = (value: Date | string | null | undefined): string | null => value ? new Date(value).toISOString() : null;
export interface Connection extends QueryResultRow {
  account_id: string; nim: string; credentials_cipher: string; cookies_cipher: string | null;
  state: string; generation: number; last_sync_at: Date | null; last_archive_sync_at: Date | null;
  sync_requested_at: Date | null;
}
export async function connection(accountId: string): Promise<Connection | undefined> {
  return (await q<Connection>('SELECT * FROM moodle_connections WHERE account_id=$1', [accountId])).rows[0];
}
export async function saveConnection(accountId: string, nim: string, credentials: string, cookies: string): Promise<void> {
  await withTransaction(async (client) => {
    const previous = await client.query('SELECT nim FROM moodle_connections WHERE account_id=$1 FOR UPDATE', [accountId]);
    if (previous.rows[0] && previous.rows[0].nim !== nim) {
      await client.query('DELETE FROM tracked_courses WHERE account_id=$1', [accountId]);
      await client.query('DELETE FROM semester_course_links WHERE account_id=$1', [accountId]);
    }
    await client.query(`INSERT INTO moodle_connections(account_id,nim,credentials_cipher,cookies_cipher,sync_requested_at)
      VALUES($1,$2,$3,$4,now()) ON CONFLICT(account_id) DO UPDATE SET nim=$2,credentials_cipher=$3,
      cookies_cipher=$4,state='connected',last_error=NULL,generation=moodle_connections.generation+1,
      sync_requested_at=now(),updated_at=now()`, [accountId, nim, credentials, cookies]);
  });
}
export async function syncStatus(accountId: string): Promise<SyncStatus> {
  const [conn, runs, links] = await Promise.all([
    q('SELECT nim,state,last_error,last_sync_at,sync_requested_at FROM moodle_connections WHERE account_id=$1', [accountId]),
    q('SELECT * FROM sync_runs WHERE account_id=$1 ORDER BY started_at DESC LIMIT 1', [accountId]),
    q('SELECT * FROM semester_course_links WHERE account_id=$1', [accountId]),
  ]);
  const value = conn.rows[0]; const run = runs.rows[0];
  return {
    connected: Boolean(value), nim: value?.nim || null, state: value?.state || 'disconnected',
    lastError: value?.last_error || null, lastSyncAt: iso(value?.last_sync_at), requestedAt: iso(value?.sync_requested_at),
    latestRun: run ? { startedAt: iso(run.started_at)!, finishedAt: iso(run.finished_at), status: run.status,
      courses: run.courses, assignments: run.assignments, errors: run.errors, message: run.message } : null,
    courseLinks: CURRENT_SEMESTER_COURSES.map((course) => {
      const link = links.rows.find((row) => row.code === course.code);
      return { ...course, selectedCourseId: link?.selected_course_id || null, candidates: link?.candidates || [] };
    }),
  };
}
export async function saveCandidates(accountId: string, code: string, candidates: CourseCandidate[]): Promise<string | null> {
  const previous = (await q('SELECT selected_course_id FROM semester_course_links WHERE account_id=$1 AND code=$2', [accountId, code])).rows[0];
  const selected = candidates.some((candidate) => candidate.id === previous?.selected_course_id)
    ? previous.selected_course_id : candidates.length === 1 ? candidates[0].id : null;
  await q(`INSERT INTO semester_course_links(account_id,code,selected_course_id,candidates) VALUES($1,$2,$3,$4::jsonb)
    ON CONFLICT(account_id,code) DO UPDATE SET selected_course_id=$3,candidates=$4::jsonb,checked_at=now()`,
  [accountId, code, selected, JSON.stringify(candidates)]);
  return selected;
}
export async function selectCourse(accountId: string, code: string, id: string): Promise<boolean> {
  if (!codes.includes(code)) return false;
  return withTransaction(async (client) => {
    await client.query('SELECT generation FROM moodle_connections WHERE account_id=$1 FOR UPDATE', [accountId]);
    const result = await client.query(`UPDATE semester_course_links SET selected_course_id=$3 WHERE account_id=$1 AND code=$2
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(candidates) candidate WHERE candidate->>'id'=$3) RETURNING code`, [accountId, code, id]);
    if (result.rows.length) await client.query('UPDATE moodle_connections SET generation=generation+1 WHERE account_id=$1', [accountId]);
    return result.rows.length > 0;
  });
}
export async function saveCourse(accountId: string, code: string, candidate: CourseCandidate, sections: CourseSection[]): Promise<void> {
  const name = CURRENT_SEMESTER_COURSES.find((course) => course.code === code)?.name;
  if (!name) throw new Error('Mata kuliah di luar whitelist.');
  await q(`INSERT INTO tracked_courses(account_id,id,code,name,source_name,url,sections) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
    ON CONFLICT(account_id,id) DO UPDATE SET code=$3,name=$4,source_name=$5,url=$6,sections=$7::jsonb,checked_at=now()`,
  [accountId, candidate.id, code, name, candidate.name, candidate.url, JSON.stringify(sections)]);
}
export async function saveAssignment(accountId: string, courseId: string, link: AssignmentLink, details: AssignmentDetails): Promise<void> {
  await q(`INSERT INTO tracked_assignments(account_id,id,course_id,title,url,description,due_at,submitted_at,status,grading_status,verified,checked_at,last_error)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),$12) ON CONFLICT(account_id,id) DO UPDATE SET
    course_id=$3,title=$4,url=$5,description=$6,
    due_at=CASE WHEN $11 THEN $7::timestamptz ELSE tracked_assignments.due_at END,
    submitted_at=CASE WHEN $11 THEN $8::timestamptz ELSE tracked_assignments.submitted_at END,
    status=$9,grading_status=$10,verified=$11,checked_at=now(),last_error=$12,present=true,updated_at=now()`,
  [accountId, link.id, courseId, link.title, link.url, details.description, details.dueAt, details.submittedAt,
    details.status, details.gradingStatus, details.verified, details.lastError]);
}
export async function markDetailError(accountId: string, courseId: string, link: AssignmentLink): Promise<void> {
  await q(`INSERT INTO tracked_assignments(account_id,id,course_id,title,url,verified,last_error)
    VALUES($1,$2,$3,$4,$5,false,'Halaman tugas gagal diperiksa.') ON CONFLICT(account_id,id) DO UPDATE SET
    verified=false,last_error='Halaman tugas gagal diperiksa.',present=true,updated_at=now()`,
  [accountId, link.id, courseId, link.title, link.url]);
}
export async function markCourseError(accountId: string, courseId: string): Promise<void> {
  await q(`UPDATE tracked_assignments SET verified=false,last_error='Halaman mata kuliah gagal diperiksa.' WHERE account_id=$1 AND course_id=$2`, [accountId, courseId]);
}
export async function markPresent(accountId: string, courseId: string, links: AssignmentLink[]): Promise<void> {
  await q(`UPDATE tracked_assignments SET present=(id=ANY($3::text[])) WHERE account_id=$1 AND course_id=$2`,
    [accountId, courseId, links.map((link) => link.id)]);
}

const joined = `FROM tracked_assignments a JOIN tracked_courses c ON c.account_id=a.account_id AND c.id=a.course_id
  JOIN semester_course_links l ON l.account_id=c.account_id AND l.selected_course_id=c.id AND l.code=c.code`;
function mapAssignment(row: QueryResultRow, now: number): Assignment {
  const dueAt = iso(row.due_at);
  const status: AssignmentStatus = row.status === 'pending' && dueAt && Date.parse(dueAt) < now ? 'overdue' : row.status;
  return { id: row.id, courseId: row.course_id, courseName: row.course_name, courseUrl: row.course_url, title: row.title,
    url: row.url, description: row.description, dueAt, submittedAt: iso(row.submitted_at), status,
    gradingStatus: row.grading_status, points: null, isFinished: status === 'submitted', scrapedAt: iso(row.first_seen_at)!,
    checkedAt: iso(row.checked_at), verified: row.verified && !row.last_error, lastError: row.last_error,
    dismissedAt: iso(row.dismissed_at), archived: !row.present || isArchived(dueAt, now) };
}
export interface AssignmentQuery {
  course?: string; status?: string; search?: string; scope?: 'active' | 'archived' | 'ignored';
  sortBy?: string; order?: 'asc' | 'desc'; limit?: number; offset?: number;
}
export async function listAssignments(accountId: string, filters: AssignmentQuery = {}, now = Date.now()): Promise<{ total: number; assignments: Assignment[] }> {
  const values: unknown[] = [accountId, codes, new Date(now - 15 * DAY_MS).toISOString()];
  const clauses = ['a.account_id=$1', 'c.code=ANY($2::text[])'];
  if (filters.scope === 'archived') clauses.push('(NOT a.present OR a.due_at < $3::timestamptz)');
  else if (filters.scope === 'ignored') clauses.push('a.dismissed_at IS NOT NULL', '$3::timestamptz IS NOT NULL');
  else clauses.push('a.present', 'a.dismissed_at IS NULL', '(a.due_at IS NULL OR a.due_at >= $3::timestamptz)');
  if (filters.course && filters.course !== 'all') { values.push(filters.course); clauses.push(`(a.course_id=$${values.length} OR c.code=$${values.length})`); }
  if (filters.status && filters.status !== 'all') {
    if (filters.status === 'overdue' || filters.status === 'pending') {
      values.push(new Date(now).toISOString());
      clauses.push(filters.status === 'overdue' ? `(a.status='overdue' OR (a.status='pending' AND a.due_at < $${values.length}::timestamptz))`
        : `(a.status='pending' AND (a.due_at IS NULL OR a.due_at >= $${values.length}::timestamptz))`);
    } else { values.push(filters.status); clauses.push(`a.status=$${values.length}`); }
  }
  if (filters.search) { values.push(`%${filters.search}%`); clauses.push(`(a.title ILIKE $${values.length} OR c.name ILIKE $${values.length})`); }
  const where = clauses.join(' AND ');
  const total = (await q(`SELECT count(*)::int AS total ${joined} WHERE ${where}`, values)).rows[0].total;
  const sort = filters.sortBy === 'title' ? 'a.title' : filters.sortBy === 'course' ? 'c.name' : filters.sortBy === 'latest' ? 'a.first_seen_at' : 'a.due_at';
  const order = filters.order === 'desc' ? 'DESC' : 'ASC';
  values.push(filters.limit || 100, filters.offset || 0);
  const result = await q(`SELECT a.*,c.name AS course_name,c.url AS course_url ${joined} WHERE ${where}
    ORDER BY ${sort} ${order} NULLS LAST,a.id LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
  return { total, assignments: result.rows.map((row) => mapAssignment(row, now)) };
}
export async function getAssignment(accountId: string, id: string): Promise<Assignment | null> {
  const result = await q(`SELECT a.*,c.name AS course_name,c.url AS course_url ${joined}
    WHERE a.account_id=$1 AND a.id=$2 AND c.code=ANY($3::text[])`, [accountId, id, codes]);
  return result.rows[0] ? mapAssignment(result.rows[0], Date.now()) : null;
}
export async function dismissAssignment(accountId: string, id: string, ignored: boolean): Promise<boolean> {
  if (!await getAssignment(accountId, id)) return false;
  await q(`UPDATE tracked_assignments SET dismissed_at=$3,dismissal_reason=$4 WHERE account_id=$1 AND id=$2`,
    [accountId, id, ignored ? new Date() : null, ignored ? 'group' : null]);
  return true;
}
export async function listCourses(accountId: string): Promise<CourseSummary[]> {
  const rows = (await q(`SELECT c.*,count(a.id) FILTER (WHERE a.present AND a.dismissed_at IS NULL
    AND (a.due_at IS NULL OR a.due_at>= $3::timestamptz))::int AS assignment_count
    FROM tracked_courses c JOIN semester_course_links l ON l.account_id=c.account_id AND l.code=c.code AND l.selected_course_id=c.id
    LEFT JOIN tracked_assignments a ON a.account_id=c.account_id AND a.course_id=c.id
    WHERE c.account_id=$1 AND c.code=ANY($2::text[]) GROUP BY c.account_id,c.id`,
    [accountId, codes, new Date(Date.now() - 15 * DAY_MS).toISOString()])).rows;
  return CURRENT_SEMESTER_COURSES.map((course) => {
    const row = rows.find((candidate) => candidate.code === course.code);
    return { id: row?.id || course.code, ...course, url: row?.url || '', scrapedAt: iso(row?.checked_at) || '',
      assignmentCount: row?.assignment_count || 0,
      activityCount: row ? row.sections.reduce((total: number, section: CourseSection) => total + section.activities.length, 0) : 0,
      available: Boolean(row) };
  });
}
export async function getCourse(accountId: string, id: string): Promise<CourseDetail | null> {
  const row = (await q(`SELECT c.* FROM tracked_courses c JOIN semester_course_links l
    ON l.account_id=c.account_id AND l.code=c.code AND l.selected_course_id=c.id
    WHERE c.account_id=$1 AND c.id=$2 AND c.code=ANY($3::text[])`, [accountId, id, codes])).rows[0];
  if (!row) return null;
  const summary = (await listCourses(accountId)).find((course) => course.id === id)!;
  return { ...summary, description: `Materi dan aktivitas ${row.name} dari Moodle.`, sections: row.sections };
}
export async function dashboardStats(accountId: string): Promise<DashboardStats> {
  const now = Date.now();
  const [courses, list] = await Promise.all([listCourses(accountId), listAssignments(accountId, { limit: 10000 }, now)]);
  const submitted = list.assignments.filter((item) => item.status === 'submitted').length;
  return { courses: courses.filter((course) => course.available).length, assignments: list.total, submitted,
    pending: list.assignments.filter((item) => item.status === 'pending' || item.status === 'draft').length,
    overdue: list.assignments.filter((item) => item.status === 'overdue').length,
    unknown: list.assignments.filter((item) => item.status === 'unknown').length,
    completionRate: list.total ? Math.round(submitted / list.total * 1000) / 10 : 0 };
}
export async function acquireLease(name: string, holder = randomUUID()): Promise<string | null> {
  const result = await q(`INSERT INTO job_leases(name,holder,expires_at) VALUES($1,$2,now()+interval '3 minutes')
    ON CONFLICT(name) DO UPDATE SET holder=$2,expires_at=now()+interval '3 minutes'
    WHERE job_leases.expires_at<=now() RETURNING holder`, [name, holder]);
  return result.rows[0]?.holder || null;
}
export async function renewLease(name: string, holder: string): Promise<boolean> {
  return (await q(`UPDATE job_leases SET expires_at=now()+interval '3 minutes' WHERE name=$1 AND holder=$2 AND expires_at>now() RETURNING holder`, [name, holder])).rows.length > 0;
}
export async function releaseLease(name: string, holder: string): Promise<void> {
  await q('DELETE FROM job_leases WHERE name=$1 AND holder=$2', [name, holder]);
}
