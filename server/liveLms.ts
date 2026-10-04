import axios, { type AxiosInstance } from 'axios';
import https from 'node:https';
import * as cheerio from 'cheerio';
import { randomUUID } from 'node:crypto';
import type { Assignment, CourseSummary } from '../shared/types.js';
import { getCurrentSemesterCourse, isCurrentSemesterCourse } from '../shared/currentSemester.js';

const baseUrl = (process.env.LMS_BASE_URL || 'https://lms.itmnganjuk.ac.id').replace(/\/$/, '');
const liveSessions = new Map<string, Map<string, string>>();

interface LiveLoginResult {
  success: boolean;
  cookies?: Map<string, string>;
  error?: string;
}

interface LiveCourse {
  id: string;
  name: string;
  url: string;
}

function createClient(): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: 30_000,
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
    httpsAgent: new https.Agent({ rejectUnauthorized: true, keepAlive: true }),
    headers: { 'User-Agent': 'LMS-UI-Remake/2.0' },
  });
}

function mergeCookies(target: Map<string, string>, headers: unknown): void {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const pair = value.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator > 0) target.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}

function cookieHeader(cookies: Map<string, string>): string {
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function idFromUrl(url: string): string | null {
  return url.match(/[?&]id=(\d+)/)?.[1] ?? null;
}

function absoluteUrl(url: string): string {
  return new URL(url, baseUrl).toString();
}

export async function authenticateLive(nim: string, password: string): Promise<LiveLoginResult> {
  const client = createClient();
  const cookies = new Map<string, string>();
  try {
    const loginPage = await client.get('/login/index.php');
    mergeCookies(cookies, loginPage.headers['set-cookie']);
    const $ = cheerio.load(String(loginPage.data));
    const loginToken = $('input[name="logintoken"]').attr('value') || '';
    const body = new URLSearchParams({ username: nim, password, logintoken: loginToken, redirect: '' });
    const response = await client.post('/login/index.php', body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader(cookies) },
    });
    mergeCookies(cookies, response.headers['set-cookie']);
    if (cookies.size === 0) return { success: false, error: 'LMS did not create a session.' };

    const verification = await client.get('/my/courses.php', { headers: { Cookie: cookieHeader(cookies) } });
    const html = String(verification.data).toLowerCase();
    if (html.includes('/login/index.php') || html.includes('login form')) {
      return { success: false, error: 'Invalid LMS credentials.' };
    }
    return { success: true, cookies };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reach the LMS.';
    return { success: false, error: message };
  }
}

export function attachLiveSession(apiToken: string, cookies: Map<string, string>): void {
  liveSessions.set(apiToken, cookies);
}

export function removeLiveSession(apiToken: string): void {
  liveSessions.delete(apiToken);
}

function cookiesFor(apiToken: string): Map<string, string> | null {
  return liveSessions.get(apiToken) ?? null;
}

async function fetchCourses(apiToken: string): Promise<LiveCourse[]> {
  const cookies = cookiesFor(apiToken);
  if (!cookies) return [];
  const response = await createClient().get('/my/courses.php', { headers: { Cookie: cookieHeader(cookies) } });
  const $ = cheerio.load(String(response.data));
  const courses = new Map<string, LiveCourse>();
  $('a[href*="/course/view.php?id="]').each((_, element) => {
    const url = absoluteUrl($(element).attr('href') || '');
    const id = idFromUrl(url);
    const name = $(element).text().replace(/\s+/g, ' ').trim();
    if (id && name && isCurrentSemesterCourse(name) && !courses.has(id)) {
      courses.set(id, { id, name, url });
    }
  });
  return [...courses.values()];
}

function parseAssignmentLinks(html: string, course: LiveCourse): Array<{ id: string; title: string; url: string }> {
  const $ = cheerio.load(html);
  const results = new Map<string, { id: string; title: string; url: string }>();
  $('a[href*="/mod/assign/view.php?id="]').each((_, element) => {
    const url = absoluteUrl($(element).attr('href') || '');
    const id = idFromUrl(url);
    const title = $(element).text().replace(/\s+/g, ' ').trim();
    if (id && title && !results.has(id)) results.set(id, { id, title, url });
  });
  return [...results.values()];
}

async function parseAssignmentStatus(client: AxiosInstance, cookies: Map<string, string>, item: { id: string; title: string; url: string }, course: LiveCourse): Promise<Assignment> {
  let status: Assignment['status'] = 'pending';
  let gradingStatus: Assignment['gradingStatus'] = 'not_graded';
  let description = '';
  try {
    const response = await client.get(item.url, { headers: { Cookie: cookieHeader(cookies) } });
    const $ = cheerio.load(String(response.data));
    description = $('main, [role="main"], .description').first().text().replace(/\s+/g, ' ').trim().slice(0, 500);
    const text = $.root().text().replace(/\s+/g, ' ').toLowerCase();
    if (text.includes('submitted for grading')) status = 'submitted';
    else if (text.includes('overdue')) status = 'overdue';
    if (text.includes('graded') && !text.includes('not graded')) gradingStatus = 'graded';
    else if (text.includes('grading status pending')) gradingStatus = 'pending';
  } catch {
    // The list remains useful when an individual detail request is unavailable.
  }
  return {
    id: item.id,
    courseId: course.id,
    courseName: course.name,
    courseUrl: course.url,
    title: item.title,
    url: item.url,
    description,
    dueAt: null,
    submittedAt: null,
    status,
    gradingStatus,
    points: null,
    isFinished: status === 'submitted',
    scrapedAt: new Date().toISOString(),
    checkedAt: null, verified: false, lastError: null, dismissedAt: null, archived: false,
  };
}

export async function fetchLiveAssignments(apiToken: string, includeDetails = false): Promise<Assignment[]> {
  const cookies = cookiesFor(apiToken);
  if (!cookies) return [];
  const client = createClient();
  const courses = await fetchCourses(apiToken);
  const assignments: Assignment[] = [];
  for (const course of courses) {
    const response = await client.get(course.url, { headers: { Cookie: cookieHeader(cookies) } });
    for (const item of parseAssignmentLinks(String(response.data), course)) {
      if (includeDetails) {
        assignments.push(await parseAssignmentStatus(client, cookies, item, course));
      } else {
        assignments.push({
          id: item.id,
          courseId: course.id,
          courseName: course.name,
          courseUrl: course.url,
          title: item.title,
          url: item.url,
          description: '',
          dueAt: null,
          submittedAt: null,
          status: 'pending',
          gradingStatus: 'not_graded',
          points: null,
          isFinished: false,
          scrapedAt: new Date().toISOString(),
          checkedAt: null, verified: false, lastError: null, dismissedAt: null, archived: false,
        });
      }
    }
  }
  return assignments;
}

export async function fetchLiveCourses(apiToken: string): Promise<CourseSummary[]> {
  const courses = await fetchCourses(apiToken);
  return courses.map((course) => ({
    id: course.id,
    name: course.name,
    code: getCurrentSemesterCourse(course.name)!.code,
    url: course.url,
    scrapedAt: new Date().toISOString(),
    activityCount: 0,
    assignmentCount: 0,
  }));
}

export function liveSessionId(): string {
  return randomUUID();
}
