import type { Assignment } from './types.js';

export const DAY_MS = 86_400_000;
export const POLL_MS = 15 * 60_000;
export const FRESH_MS = 20 * 60_000;

export function isArchived(dueAt: string | null, now = Date.now()): boolean {
  return dueAt !== null && Number.isFinite(Date.parse(dueAt)) && now - Date.parse(dueAt) > 15 * DAY_MS;
}
export function reminderHour(now = new Date()): boolean {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hourCycle: 'h23' }).format(now));
  return hour >= 7 && hour <= 22;
}
export function hourSlot(now = new Date()): string { return now.toISOString().slice(0, 13); }
export function reminderEligible(assignment: Assignment, now = Date.now()): boolean {
  const due = assignment.dueAt ? Date.parse(assignment.dueAt) : NaN;
  const checked = assignment.checkedAt ? Date.parse(assignment.checkedAt) : NaN;
  return assignment.verified && !assignment.dismissedAt && !assignment.archived &&
    ['pending', 'overdue', 'draft'].includes(assignment.status) &&
    Number.isFinite(due) && now >= due - 7 * DAY_MS && now <= due + 15 * DAY_MS &&
    Number.isFinite(checked) && checked <= now && now - checked <= FRESH_MS;
}
