import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import type {
  Assignment,
  AssignmentStatus,
  CourseDetail,
  CourseSummary,
  DashboardStats,
  GradingStatus,
  User,
} from '../shared/types.js';
import { pool } from './db.js';
import { getCurrentSemesterCourse, isCurrentSemesterCourse } from '../shared/currentSemester.js';

interface SemesterCourseRow {
  id: string;
  name: string;
  code: string;
}

async function getCurrentSemesterCourseIds(): Promise<string[]> {
  const result = await pool.query<SemesterCourseRow>('SELECT id, name, code FROM courses');
  return result.rows
    .filter((course) => isCurrentSemesterCourse(course.name, course.code))
    .map((course) => course.id);
}

interface UserRow {
  id: string;
  nim: string;
  name: string;
  email: string;
  password_hash: string;
}

interface DashboardRow {
  courses: string;
  assignments: string;
  submitted: string;
  pending: string;
  overdue: string;
  completion_rate: string;
}

interface CourseSummaryRow {
  id: string;
  name: string;
  code: string;
  url: string;
  scraped_at: Date | string;
  activity_count: string;
  assignment_count: string;
}

interface CourseSectionRow {
  id: string;
  course_id: string;
  title: string;
  content: string;
  position: number;
}

interface ActivityRow {
  id: string;
  course_id: string;
  section_id: string | null;
  name: string;
  type: string;
  link: string;
  position: number;
}

interface AssignmentRow {
  id: string;
  course_id: string;
  course_name: string;
  course_url: string;
  title: string;
  url: string;
  description: string;
  due_at: Date | string | null;
  submitted_at: Date | string | null;
  status: AssignmentStatus;
  grading_status: GradingStatus;
  points: number | null;
  is_finished: boolean;
  scraped_at: Date | string;
}

function asIsoDate(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    nim: row.nim,
    name: row.name,
    email: row.email,
  };
}

function mapCourseSummary(row: CourseSummaryRow): CourseSummary {
  return {
    id: row.id,
    name: row.name,
    code: getCurrentSemesterCourse(row.name, row.code)?.code ?? row.code,
    url: row.url,
    scrapedAt: asIsoDate(row.scraped_at) ?? '',
    activityCount: Number(row.activity_count),
    assignmentCount: Number(row.assignment_count),
  };
}

function mapAssignment(row: AssignmentRow): Assignment {
  return {
    id: row.id,
    courseId: row.course_id,
    courseName: row.course_name,
    courseUrl: row.course_url,
    title: row.title,
    url: row.url,
    description: row.description,
    dueAt: asIsoDate(row.due_at),
    submittedAt: asIsoDate(row.submitted_at),
    status: row.status,
    gradingStatus: row.grading_status,
    points: row.points,
    isFinished: row.is_finished,
    scrapedAt: asIsoDate(row.scraped_at) ?? '',
    checkedAt: null, verified: false, lastError: null, dismissedAt: null, archived: false,
  };
}

export async function authenticate(nim: string, password: string): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, nim, name, email, password_hash FROM users WHERE nim = $1',
    [nim],
  );
  const user = rows[0];
  if (!user) return null;

  const matches = await bcrypt.compare(password, user.password_hash);
  return matches ? mapUser(user) : null;
}

export async function upsertLiveUser(nim: string): Promise<User> {
  const id = `lms-${nim}`;
  const email = `${nim}@student.itmnganjuk.ac.id`;
  const passwordHash = await bcrypt.hash(`live-session-${randomUUID()}`, 12);
  const result = await pool.query<UserRow>(
    `INSERT INTO users(id, nim, name, email, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(nim) DO UPDATE SET
       name = EXCLUDED.name,
       email = EXCLUDED.email,
       updated_at = now()
     RETURNING id, nim, name, email, password_hash`,
    [id, nim, nim, email, passwordHash],
  );
  return mapUser(result.rows[0]);
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomUUID();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO sessions(token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [tokenHash, userId, expiresAt],
  );

  return { token, expiresAt };
}

export async function deleteSession(token: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

export async function validateSession(token: string): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `SELECT u.id, u.nim, u.name, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const courseIds = await getCurrentSemesterCourseIds();
  const result = await pool.query<DashboardRow>(`
    SELECT
      (SELECT count(*)::text FROM courses WHERE id = ANY($1::text[])) AS courses,
      count(a.id)::text AS assignments,
      count(a.id) FILTER (WHERE a.status = 'submitted')::text AS submitted,
      count(a.id) FILTER (WHERE a.status = 'pending')::text AS pending,
      count(a.id) FILTER (WHERE a.status = 'overdue')::text AS overdue,
      CASE
        WHEN count(a.id) = 0 THEN '0'
        ELSE round(
          100.0 * count(a.id) FILTER (WHERE a.status = 'submitted') / count(a.id),
          1
        )::text
      END AS completion_rate
    FROM assignments a
    WHERE a.course_id = ANY($1::text[])
  `, [courseIds]);

  const row = result.rows[0];
  return {
    courses: Number(row.courses),
    assignments: Number(row.assignments),
    submitted: Number(row.submitted),
    pending: Number(row.pending),
    overdue: Number(row.overdue),
    completionRate: Number(row.completion_rate),
  };
}

export async function listCourses(): Promise<CourseSummary[]> {
  const result = await pool.query<CourseSummaryRow>(`
    SELECT
      c.id,
      c.name,
      c.code,
      c.url,
      c.scraped_at,
      count(DISTINCT ca.id)::text AS activity_count,
      count(DISTINCT a.id)::text AS assignment_count
    FROM courses c
    LEFT JOIN course_sections cs ON cs.course_id = c.id
    LEFT JOIN course_activities ca ON ca.course_id = c.id
    LEFT JOIN assignments a ON a.course_id = c.id
    GROUP BY c.id
    ORDER BY c.name ASC
  `);

  return result.rows
    .filter((course) => isCurrentSemesterCourse(course.name, course.code))
    .map(mapCourseSummary);
}

export async function getCourse(id: string): Promise<CourseDetail | null> {
  const courses = await listCourses();
  const summary = courses.find((course) => course.id === id);
  if (!summary) return null;

  const sectionResult = await pool.query<CourseSectionRow>(
    `SELECT id, course_id, title, content, position
     FROM course_sections
     WHERE course_id = $1
     ORDER BY position ASC`,
    [id],
  );

  const activityResult = await pool.query<ActivityRow>(
    `SELECT id, course_id, section_id, name, type, link, position
     FROM course_activities
     WHERE course_id = $1
     ORDER BY section_id NULLS FIRST, position ASC`,
    [id],
  );

  return {
    ...summary,
    description: `${summary.name} course materials and activities from the LMS snapshot.`,
    sections: sectionResult.rows.map((section) => ({
      id: Number(section.id),
      courseId: section.course_id,
      title: section.title,
      content: section.content,
      position: section.position,
      activities: activityResult.rows
        .filter((activity) =>
          activity.section_id ? Number(activity.section_id) === Number(section.id) : false,
        )
        .map((activity) => ({
          id: Number(activity.id),
          courseId: activity.course_id,
          sectionId: activity.section_id ? Number(activity.section_id) : null,
          name: activity.name,
          type: activity.type,
          link: activity.link,
          position: activity.position,
        })),
    })),
  };
}

export interface AssignmentQuery {
  course?: string;
  status?: AssignmentStatus | 'all';
  search?: string;
  sortBy: 'dueAt' | 'scrapedAt' | 'title' | 'course';
  order: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export async function listAssignments(query: AssignmentQuery): Promise<{
  total: number;
  assignments: Assignment[];
}> {
  const courseIds = await getCurrentSemesterCourseIds();
  const clauses = [
    'a.course_id = ANY($1::text[])',
    "a.status IN ('submitted', 'pending', 'overdue', 'draft')",
  ];
  const values: unknown[] = [courseIds];

  if (query.course && query.course !== 'all') {
    values.push(query.course);
    clauses.push(`a.course_id = $${values.length}`);
  }

  if (query.status && query.status !== 'all') {
    values.push(query.status);
    clauses.push(`a.status = $${values.length}`);
  }

  if (query.search) {
    values.push(`%${query.search}%`);
    clauses.push(`(a.title ILIKE $${values.length} OR a.course_name ILIKE $${values.length})`);
  }

  const sortColumn =
    query.sortBy === 'title' ? 'a.title' : query.sortBy === 'course' ? 'a.course_name' : query.sortBy === 'scrapedAt' ? 'a.scraped_at' : 'a.due_at';
  const where = clauses.join(' AND ');

  const totalResult = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM assignments a WHERE ${where}`,
    values,
  );

  values.push(query.limit, query.offset);
  const result = await pool.query<AssignmentRow>(
    `SELECT
       a.id, a.course_id, a.course_name, a.course_url, a.title, a.url, a.description,
       a.due_at, a.submitted_at, a.status, a.grading_status, a.points, a.is_finished, a.scraped_at
     FROM assignments a
     WHERE ${where}
     ORDER BY ${sortColumn} ${query.order.toUpperCase()} NULLS LAST, a.title ASC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return {
    total: Number(totalResult.rows[0]?.total ?? 0),
    assignments: result.rows.map(mapAssignment),
  };
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const courseIds = await getCurrentSemesterCourseIds();
  const result = await pool.query<AssignmentRow>(
    'SELECT * FROM assignments WHERE id = $1 AND course_id = ANY($2::text[])',
    [id, courseIds],
  );
  return result.rows[0] ? mapAssignment(result.rows[0]) : null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
