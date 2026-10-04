import type { Assignment, AuthResponse, CourseDetail, CourseSummary, DashboardStats, SessionValidationResponse, SyncStatus } from '../shared/types';
let csrf = '';
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch('/api' + path, { ...init, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...init.headers } }); }
  catch { throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi internet.', 0); }
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !body) {
    if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(body?.error || 'Server belum dapat memproses permintaan.', response.status);
  }
  return body;
}
export async function login(username: string, password: string) {
  const result = await request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  csrf = result.csrfToken; return result;
}
export async function validateSession() {
  const result = await request<SessionValidationResponse>('/auth/session'); csrf = result.csrfToken; return result;
}
export async function logout(subscriptionEndpoint?: string) {
  await request('/auth/logout', { method: 'POST', body: JSON.stringify({ subscriptionEndpoint }) }); csrf = '';
}
export const getSyncStatus = () => request<SyncStatus>('/integration/status');
export const getDashboardStats = () => request<{ stats: DashboardStats }>('/dashboard/stats').then((result) => result.stats);
export const getCourses = () => request<{ courses: CourseSummary[] }>('/courses').then((result) => result.courses);
export const getCourse = (id: string) => request<{ course: CourseDetail }>('/courses/' + encodeURIComponent(id)).then((result) => result.course);
export const getAssignments = (filters: Record<string, string> = {}) => request<{ total: number; assignments: Assignment[] }>('/assignments?' + new URLSearchParams({ limit: '100', ...filters }));
export const ignoreAssignment = (id: string, ignored: boolean) => request('/assignments/' + encodeURIComponent(id) + '/ignore', { method: ignored ? 'POST' : 'DELETE', body: '{}' });
export const syncNow = () => request<{ workerAvailable: boolean }>('/integration/sync', { method: 'POST', body: '{}' });
export const connectMoodle = (nim: string, password: string) => request<{ workerAvailable: boolean }>('/integration/moodle', { method: 'PUT', body: JSON.stringify({ nim, password }) });
export const disconnectMoodle = () => request('/integration/moodle', { method: 'DELETE', body: '{}' });
export const selectCourse = (code: string, courseId: string) => request('/integration/courses/' + code, { method: 'PUT', body: JSON.stringify({ courseId }) });
