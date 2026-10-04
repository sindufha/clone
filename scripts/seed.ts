import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import type { AssignmentStatus, GradingStatus } from '../shared/types.js';
import { getCurrentSemesterCourse, isCurrentSemesterCourse } from '../shared/currentSemester.js';

interface RawCourse {
  courseName: string;
  courseUrl: string;
  scrapedAt: string;
  sections?: Array<{
    title?: string;
    content?: string;
    activities?: Array<{ name?: string; type?: string; link?: string }>;
  }>;
}

interface RawCoursesFile {
  courses: RawCourse[];
}

interface RawAssignment {
  courseName: string;
  courseUrl: string;
  assignmentTitle: string;
  assignmentUrl: string;
  description: string;
  scrapedAt: string;
  submissionStatus?: string;
  gradingStatus?: string;
  overdueInfo?: string;
  points?: string;
}

interface RawAssignmentsFile {
  assignments: RawAssignment[];
}

interface NormalizedCourse {
  id: string;
  name: string;
  code: string;
  description: string;
  url: string;
  scrapedAt: string;
  sections: Array<{
    title: string;
    content: string;
    position: number;
    activities: Array<{ name: string; type: string; link: string; position: number }>;
  }>;
}

interface NormalizedAssignment {
  id: string;
  courseId: string;
  courseName: string;
  courseUrl: string;
  title: string;
  url: string;
  description: string;
  dueAt: string;
  submittedAt: string | null;
  status: AssignmentStatus;
  gradingStatus: GradingStatus;
  points: number | null;
  isFinished: boolean;
  scrapedAt: string;
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for seeding.');
}

function extractId(url: string): string | null {
  return url.match(/[?&]id=(\d+)/)?.[1] ?? null;
}

function cleanText(value: string, limit = 20_000): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function courseCode(name: string, id: string): string {
  return getCurrentSemesterCourse(name)?.code ?? `COURSE-${id}`;
}

function parseLastModified(description: string): string | null {
  const match = description.match(
    /Last modified\s+([A-Za-z]+,\s+\d+\s+[A-Za-z]+\s+\d{4},?\s+\d+:\d+\s*(?:AM|PM))/i,
  );
  if (!match) return null;
  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mockDueDate(scrapedAt: string, id: string, status: AssignmentStatus): string {
  const timestamp = new Date(scrapedAt).getTime();
  const numericId = Number(id) || 1;

  if (status === 'overdue') {
    return new Date(timestamp - (1 + (numericId % 3)) * 24 * 60 * 60 * 1000).toISOString();
  }

  if (status === 'pending') {
    return new Date(timestamp + (7 + (numericId % 10)) * 24 * 60 * 60 * 1000).toISOString();
  }

  return new Date(timestamp - (8 + (numericId % 18)) * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeStatus(raw: RawAssignment): {
  status: AssignmentStatus;
  gradingStatus: GradingStatus;
} {
  const submission = (raw.submissionStatus ?? '').toLowerCase();
  const grading = (raw.gradingStatus ?? '').toLowerCase();

  const status: AssignmentStatus = submission.includes('submitted')
    ? 'submitted'
    : raw.overdueInfo
      ? 'overdue'
      : 'pending';

  const gradingStatus: GradingStatus = grading.includes('pending')
    ? 'pending'
    : grading.includes('graded') && !grading.includes('not graded')
      ? 'graded'
      : 'not_graded';

  return { status, gradingStatus };
}

function normalizeCourse(raw: RawCourse): NormalizedCourse | null {
  const id = extractId(raw.courseUrl);
  if (!id) return null;

  const sections = (raw.sections ?? []).map((section, position) => ({
    title: cleanText(section.title || `Section ${position + 1}`, 300),
    content: cleanText(section.content || ''),
    position,
    activities: (section.activities ?? [])
      .map((activity, activityPosition) => ({
        name: cleanText(activity.name || 'Untitled activity', 300),
        type: cleanText(activity.type || 'resource', 100),
        link: cleanText(activity.link || '', 1000),
        position: activityPosition,
      }))
      .filter((activity) => activity.link.length > 0),
  }));

  return {
    id,
    name: cleanText(raw.courseName || `Course ${id}`, 300),
    code: courseCode(raw.courseName || '', id),
    description: `${raw.courseName || `Course ${id}`} course materials and activities from the LMS snapshot.`,
    url: cleanText(raw.courseUrl, 1000),
    scrapedAt: raw.scrapedAt,
    sections,
  };
}

function normalizeAssignment(raw: RawAssignment): NormalizedAssignment | null {
  const id = extractId(raw.assignmentUrl);
  const courseId = extractId(raw.courseUrl);
  if (!id || !courseId) return null;

  const { status, gradingStatus } = normalizeStatus(raw);
  const scrapedAt = raw.scrapedAt || new Date().toISOString();

  return {
    id,
    courseId,
    courseName: cleanText(raw.courseName || 'Unknown Course', 300),
    courseUrl: cleanText(raw.courseUrl, 1000),
    title: cleanText(raw.assignmentTitle || 'Untitled Assignment', 300),
    url: cleanText(raw.assignmentUrl, 1000),
    description: cleanText(raw.description || ''),
    dueAt: mockDueDate(scrapedAt, id, status),
    submittedAt: parseLastModified(raw.description || ''),
    status,
    gradingStatus,
    points: raw.points ? Number.parseInt(raw.points, 10) : null,
    isFinished: status === 'submitted',
    scrapedAt,
  };
}

async function seed(): Promise<void> {
  const [coursesFile, assignmentsFile] = await Promise.all([
    readFile(path.join(rootDir, 'courses-data.json'), 'utf8'),
    readFile(path.join(rootDir, 'assignments-data.json'), 'utf8'),
  ]);

  const courses = (JSON.parse(coursesFile) as RawCoursesFile).courses
    .filter((course) => isCurrentSemesterCourse(course.courseName))
    .map(normalizeCourse)
    .filter((course): course is NormalizedCourse => course !== null);

  const courseIds = new Set(courses.map((course) => course.id));

  const assignments = (JSON.parse(assignmentsFile) as RawAssignmentsFile).assignments
    .map(normalizeAssignment)
    .filter((assignment): assignment is NormalizedAssignment =>
      assignment !== null && courseIds.has(assignment.courseId),
    );

  const demoNim = process.env.DEMO_NIM || '000000000001';
  const demoPassword = process.env.DEMO_PASSWORD || 'student123';
  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const reset = process.argv.includes('--reset');
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (reset) {
        await client.query(
          'TRUNCATE TABLE assignments, course_activities, course_sections, courses, sessions, users RESTART IDENTITY CASCADE',
        );
      }

      await client.query(
        `INSERT INTO users(id, nim, name, email, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(nim) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           updated_at = now()`,
        ['demo-student', demoNim, 'Demo Student', `${demoNim}@student.itmnganjuk.ac.id`, passwordHash],
      );

      for (const course of courses) {
        await client.query(
          `INSERT INTO courses(id, name, code, description, url, scraped_at, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT(id) DO UPDATE SET
             name = EXCLUDED.name,
             code = EXCLUDED.code,
             description = EXCLUDED.description,
             url = EXCLUDED.url,
             scraped_at = EXCLUDED.scraped_at,
             raw_data = EXCLUDED.raw_data,
             updated_at = now()`,
          [
            course.id,
            course.name,
            course.code,
            course.description,
            course.url,
            course.scrapedAt,
            JSON.stringify(course),
          ],
        );

        await client.query('DELETE FROM course_activities WHERE course_id = $1', [course.id]);
        await client.query('DELETE FROM course_sections WHERE course_id = $1', [course.id]);

        for (const section of course.sections) {
          const sectionResult = await client.query<{ id: string }>(
            `INSERT INTO course_sections(course_id, title, content, position)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [course.id, section.title, section.content, section.position],
          );
          const sectionId = sectionResult.rows[0]?.id;

          for (const activity of section.activities) {
            await client.query(
              `INSERT INTO course_activities(course_id, section_id, name, type, link, position)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [course.id, sectionId, activity.name, activity.type, activity.link, activity.position],
            );
          }
        }
      }

      for (const assignment of assignments) {
        await client.query(
          `INSERT INTO assignments(
             id, course_id, course_name, course_url, title, url, description,
             due_at, submitted_at, status, grading_status, points, is_finished, scraped_at
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12, $13, $14
           )
           ON CONFLICT(id) DO UPDATE SET
             course_id = EXCLUDED.course_id,
             course_name = EXCLUDED.course_name,
             course_url = EXCLUDED.course_url,
             title = EXCLUDED.title,
             url = EXCLUDED.url,
             description = EXCLUDED.description,
             due_at = EXCLUDED.due_at,
             submitted_at = EXCLUDED.submitted_at,
             status = EXCLUDED.status,
             grading_status = EXCLUDED.grading_status,
             points = EXCLUDED.points,
             is_finished = EXCLUDED.is_finished,
             scraped_at = EXCLUDED.scraped_at,
             updated_at = now()`,
          [
            assignment.id,
            assignment.courseId,
            assignment.courseName,
            assignment.courseUrl,
            assignment.title,
            assignment.url,
            assignment.description,
            assignment.dueAt,
            assignment.submittedAt,
            assignment.status,
            assignment.gradingStatus,
            assignment.points,
            assignment.isFinished,
            assignment.scrapedAt,
          ],
        );
      }

      await client.query('COMMIT');
      console.log(`Seeded ${courses.length} courses and ${assignments.length} assignments.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

seed().catch((error: unknown) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
