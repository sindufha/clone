import axios, { type AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar, type SerializedCookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import { DateTime } from 'luxon';
import type { AssignmentStatus, CourseCandidate, CourseSection, GradingStatus } from '../shared/types.js';
import { config } from './config.js';

export class MoodleAuthError extends Error {
  constructor(message = 'Sesi Moodle berakhir. Hubungkan ulang akun Moodle.') { super(message); }
}
export interface AssignmentLink { id: string; title: string; url: string; }
export interface AssignmentDetails {
  description: string; dueAt: string | null; submittedAt: string | null;
  status: AssignmentStatus; gradingStatus: GradingStatus; verified: boolean; lastError: string | null;
}
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const normalizeLabel = (value: string) => clean(value).toLowerCase().replace(/[:\uFF1A]$/, '');
const months: Record<string, string> = {
  januari: 'January', februari: 'February', maret: 'March', april: 'April', mei: 'May', juni: 'June',
  juli: 'July', agustus: 'August', september: 'September', oktober: 'October', november: 'November', desember: 'December',
};
export function parseMoodleDate(value: string, timezone = config.lmsTimezone): string | null {
  let text = clean(value);
  if (!text || /^(?:-|none|no due date|tidak ada|tidak ditentukan)$/i.test(text)) return null;
  if (/^\d{10,13}$/.test(text)) {
    const ms = Number(text) * (text.length === 10 ? 1000 : 1);
    return DateTime.fromMillis(ms).isValid ? new Date(ms).toISOString() : null;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const parsed = DateTime.fromISO(text, { zone: timezone });
    return parsed.isValid ? parsed.toUTC().toISO() : null;
  }
  text = text.replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Senin|Selasa|Rabu|Kamis|Jumat|Jum'at|Sabtu|Minggu),?\s*/i, '')
    .replace(/\b(?:WIB|UTC\+7|GMT\+7)\b/gi, '').replace(/\bpukul\b/gi, '')
    .replace(/\b(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\b/gi, (month) => months[month.toLowerCase()])
    .replace(/,(?=\s*\d{1,2}[:.])/g, '').replace(/(\d{1,2})\.(\d{2})(?=\s|$)/, '$1:$2');
  text = clean(text);
  for (const format of ['d LLLL yyyy h:mm a', 'd LLLL yyyy H:mm', 'd LLL yyyy H:mm', 'yyyy-MM-dd H:mm', 'dd/MM/yyyy H:mm']) {
    const parsed = DateTime.fromFormat(text, format, { locale: 'en', zone: timezone });
    if (parsed.isValid) return parsed.toUTC().toISO();
  }
  return null; // Never infer a deadline from arbitrary description dates.
}

export function parseAssignmentPage(html: string, timezone = config.lmsTimezone, now = Date.now()): AssignmentDetails {
  const $ = cheerio.load(html);
  const labels = new Map<string, { text: string; structured: string | null }>();
  $('tr').each((_, row) => {
    const cells = $(row).children('th,td');
    if (cells.length < 2) return;
    const value = cells.eq(1);
    labels.set(normalizeLabel(cells.eq(0).text()), { text: clean(value.text()),
      structured: value.find('time[datetime]').attr('datetime') || value.find('[data-timestamp]').attr('data-timestamp') || null });
  });
  $('[data-region="activity-dates"] strong, .activity-dates strong, dt').each((_, node) => {
    const element = $(node);
    const parent = element.is('dt') ? element.next('dd') : element.parent();
    const clone = parent.clone(); clone.find('strong').remove();
    labels.set(normalizeLabel(element.text()), { text: clean(clone.text()),
      structured: parent.find('time[datetime]').attr('datetime') || parent.find('[data-timestamp]').attr('data-timestamp') || null });
  });
  const get = (names: string[]) => names.map((name) => labels.get(name)).find(Boolean);
  const due = get(['due date', 'due', 'batas waktu', 'tenggat waktu', 'tanggal jatuh tempo', 'jatuh tempo']);
  const submission = get(['submission status', 'status pengumpulan', 'status pengiriman', 'status penyerahan']);
  const rawStatus = normalizeLabel(submission?.text || $('[data-region="submission-status"]').first().text());
  let status: AssignmentStatus = 'unknown';
  if (/submitted for grading|dikumpulkan untuk dinilai|dikirim untuk dinilai|diserahkan untuk dinilai/.test(rawStatus)) status = 'submitted';
  else if (/\bdraft\b|\bdraf\b/.test(rawStatus)) status = 'draft';
  else if (/no submissions?|no attempt|not submitted|belum (?:ada )?(?:pengumpulan|dikumpulkan|dikirim)|tidak ada (?:pengumpulan|kiriman)/.test(rawStatus)) status = 'pending';
  const dueAt = due ? parseMoodleDate(due.structured || due.text, timezone) : null;
  const noDueDate = !due || /^(?:-|none|no due date|tidak ada|tidak ditentukan)$/i.test(due.text);
  if (status === 'pending' && dueAt && Date.parse(dueAt) < now) status = 'overdue';
  const grade = normalizeLabel(get(['grading status', 'status penilaian'])?.text || '');
  const gradingStatus: GradingStatus = /not graded|belum dinilai/.test(grade) ? 'not_graded'
    : /graded|sudah dinilai|telah dinilai/.test(grade) ? 'graded' : /pending|menunggu/.test(grade) ? 'pending' : 'not_graded';
  const verified = status !== 'unknown' && (dueAt !== null || noDueDate);
  return {
    description: clean($('.activity-description, [data-region="assignment-intro"], .description').first().text()).slice(0, 10_000),
    dueAt, submittedAt: parseMoodleDate(get(['last modified', 'terakhir diubah', 'terakhir dimodifikasi'])?.text || '', timezone),
    status, gradingStatus, verified,
    lastError: verified ? null : status === 'unknown' ? 'Status pengumpulan belum dapat diverifikasi.' : 'Format deadline Moodle belum dikenali.',
  };
}

export class MoodleClient {
  readonly jar: CookieJar;
  private client: AxiosInstance;
  private base: URL;
  constructor(cookies?: SerializedCookieJar, baseUrl = config.lmsUrl, signal?: AbortSignal) {
    this.base = new URL(baseUrl);
    if (this.base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(this.base.hostname)) {
      throw new Error('Alamat Moodle harus menggunakan HTTPS.');
    }
    this.jar = cookies ? CookieJar.deserializeSync(cookies) : new CookieJar();
    this.client = wrapper(axios.create({
      baseURL: this.base.origin, jar: this.jar, withCredentials: true, timeout: 30_000, maxRedirects: 5, signal,
      headers: { 'User-Agent': 'NEXUS-LMS/3.0 (personal semester monitor)' },
      beforeRedirect: (options) => {
        if (options.hostname !== this.base.hostname || options.protocol !== this.base.protocol ||
            String(options.port || (options.protocol === 'https:' ? 443 : 80)) !== String(this.base.port || (this.base.protocol === 'https:' ? 443 : 80))) {
          throw new MoodleAuthError('Moodle mengarahkan login ke layanan lain. Hubungkan akun secara manual.');
        }
      },
    }));
  }
  serialize(): SerializedCookieJar { const serialized = this.jar.serializeSync(); if (!serialized) throw new Error('Sesi Moodle tidak dapat disimpan.'); return serialized; }
  private url(value: string): string | null {
    try { const url = new URL(value, this.base); return url.origin === this.base.origin ? url.href : null; } catch { return null; }
  }
  private async get(path: string): Promise<string> {
    const url = this.url(path);
    if (!url) throw new Error('Tautan di luar Moodle diabaikan.');
    const response = await this.client.get(url);
    const html = String(response.data);
    const $ = cheerio.load(html);
    if ($('form input[name="password"]').length || /\/login\/index\.php/.test(response.request?.res?.responseUrl || '')) {
      throw new MoodleAuthError();
    }
    return html;
  }
  async login(nim: string, password: string): Promise<void> {
    const page = await this.client.get('/login/index.php');
    const $ = cheerio.load(String(page.data));
    const loginToken = $('input[name="logintoken"]').attr('value');
    if (!loginToken || $('input[name*="otp"], [class*="captcha"]').length) throw new MoodleAuthError('Login Moodle memerlukan verifikasi tambahan atau format login berubah.');
    await this.client.post('/login/index.php', new URLSearchParams({ username: nim, password, logintoken: loginToken }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const html = await this.get('/my/');
    if (!/logout\.php|["']?sesskey["']?\s*:\s*["'][^"']+/.test(html)) {
      throw new MoodleAuthError('NIM/password Moodle salah atau sesi login belum terverifikasi.');
    }
  }
  async courses(): Promise<CourseCandidate[]> {
    const found = new Map<string, CourseCandidate>();
    let next: string | null = '/my/courses.php';
    let sesskey: string | undefined;
    const visited = new Set<string>();
    for (let page = 0; next && page < 10 && !visited.has(next); page++) {
      visited.add(next);
      const html = await this.get(next);
      sesskey ||= html.match(/["']?sesskey["']?\s*:\s*["']([^"']+)["']/)?.[1];
      const $ = cheerio.load(html);
      $('a[href*="/course/view.php?"]').each((_, node) => {
        const url = this.url($(node).attr('href') || '');
        const id = url && new URL(url).searchParams.get('id');
        const name = clean($(node).find('.coursename, .coursefullname').text() || $(node).text());
        if (url && id && /^\d+$/.test(id) && name && !found.has(id)) found.set(id, { id, name, url });
      });
      const nextHref = $('a[rel="next"], .pagination .page-item:not(.disabled) a[aria-label="Next"], .pagination a[aria-label="Berikutnya"]').first().attr('href');
      next = nextHref ? this.url(nextHref) : null;
    }
    if (sesskey) {
      for (let offset = 0; offset < 1000; offset += 100) {
        try {
          const response = await this.client.post(`/lib/ajax/service.php?sesskey=${encodeURIComponent(sesskey)}`, [{
            index: 0, methodname: 'core_course_get_enrolled_courses_by_timeline_classification',
            args: { classification: 'all', limit: 100, offset, sort: 'fullname' },
          }]);
          const courses = response.data?.[0]?.data?.courses;
          if (response.data?.[0]?.error || !Array.isArray(courses)) break;
          for (const course of courses) {
            const id = String(course.id); const url = this.url(`/course/view.php?id=${id}`);
            if (url && /^\d+$/.test(id) && typeof course.fullname === 'string') found.set(id, { id, name: clean(course.fullname), url });
          }
          if (courses.length < 100) break;
        } catch { break; } // HTML discovery remains available if this Moodle version has no AJAX method.
      }
    }
    return [...found.values()];
  }
  async course(candidate: CourseCandidate): Promise<{ assignments: AssignmentLink[]; sections: CourseSection[] }> {
    const html = await this.get(candidate.url);
    const $ = cheerio.load(html);
    if (!$('.course-content, [data-for="course_content"], #page-course-view-topics, #page-course-view-weeks').length) {
      throw new Error('Struktur halaman mata kuliah belum dikenali.');
    }
    const links = new Map<string, AssignmentLink>();
    $('a[href*="/mod/assign/view.php?"]').each((_, node) => {
      const url = this.url($(node).attr('href') || '');
      const id = url && new URL(url).searchParams.get('id');
      const title = clean($(node).find('.instancename').text() || $(node).text()).replace(/\s*Assignment$/i, '').trim();
      if (url && id && /^\d+$/.test(id) && title) links.set(id, { id, title, url });
    });
    const sections: CourseSection[] = [];
    $('.course-content li.section, [data-for="section"]').each((position, node) => {
      const activities: CourseSection['activities'] = [];
      $(node).find('a[href*="/mod/"]').each((index, activity) => {
        const link = this.url($(activity).attr('href') || '');
        const name = clean($(activity).find('.instancename').text() || $(activity).text());
        if (link && name) activities.push({ id: index, courseId: candidate.id, sectionId: position, name, type: 'resource', link, position: index });
      });
      sections.push({ id: position, position, courseId: candidate.id, title: clean($(node).find('.sectionname').first().text()) || `Bagian ${position + 1}`,
        content: clean($(node).find('.summary').first().text()).slice(0, 2000), activities });
    });
    return { assignments: [...links.values()], sections };
  }
  async assignment(link: AssignmentLink): Promise<AssignmentDetails> {
    return parseAssignmentPage(await this.get(link.url));
  }
}
