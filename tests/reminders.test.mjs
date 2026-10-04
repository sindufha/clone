import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, FRESH_MS, isArchived, reminderEligible, reminderHour, hourSlot } from '../shared/reminders.ts';
const now = Date.parse('2026-10-04T03:00:00Z');
const task = (overrides = {}) => ({ status: 'pending', verified: true, dueAt: new Date(now + DAY_MS).toISOString(),
  checkedAt: new Date(now).toISOString(), dismissedAt: null, archived: false, ...overrides });
test('H-7 and overdue 15-day boundaries are inclusive; older deadlines are ignored', () => {
  assert.equal(reminderEligible(task({ dueAt: new Date(now + 7 * DAY_MS).toISOString() }), now), true);
  assert.equal(reminderEligible(task({ dueAt: new Date(now + 7 * DAY_MS + 1).toISOString() }), now), false);
  const boundary = new Date(now - 15 * DAY_MS).toISOString();
  assert.equal(isArchived(boundary, now), false);
  assert.equal(reminderEligible(task({ status: 'overdue', dueAt: boundary }), now), true);
  assert.equal(isArchived(boundary, now + 1), true);
  assert.equal(reminderEligible(task({ dueAt: boundary }), now + 1), false);
});
test('submitted, unknown, ignored, missing deadlines, invalid and stale data never trigger reminders', () => {
  for (const overrides of [{ status: 'submitted' }, { status: 'unknown' }, { verified: false }, { dismissedAt: '2026-10-04' },
    { dueAt: null }, { dueAt: 'garbage' }, { archived: true }, { checkedAt: null },
    { checkedAt: new Date(now - FRESH_MS - 1).toISOString() }, { checkedAt: new Date(now + 1).toISOString() }]) {
    assert.equal(reminderEligible(task(overrides), now), false, JSON.stringify(overrides));
  }
  assert.equal(reminderEligible(task({ status: 'draft' }), now), true);
});
test('notification window uses WIB regardless of server timezone and hourly slots are stable', () => {
  for (const [utc, expected] of [['2026-10-03T23:59:59Z', false], ['2026-10-04T00:00:00Z', true],
    ['2026-10-04T15:59:59Z', true], ['2026-10-04T16:00:00Z', false]]) assert.equal(reminderHour(new Date(utc)), expected);
  assert.equal(hourSlot(new Date('2026-10-04T03:59:59Z')), hourSlot(new Date(now)));
});
