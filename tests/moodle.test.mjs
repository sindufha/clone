import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoodleDate, parseAssignmentPage } from '../server/moodle.ts';
const html = (status, deadline, extra = '') => `<main>${extra}<table><tr><th>Submission status</th><td>${status}</td></tr><tr><th>Due date</th><td>${deadline}</td></tr><tr><th>Grading status</th><td>Not graded</td></tr></table></main>`;
test('Moodle dates in Indonesian and English resolve to UTC from WIB', () => {
  for (const value of ['Minggu, 4 Oktober 2026, 13:30 WIB', 'Sunday, 4 October 2026, 1:30 PM', '4 Oktober 2026 pukul 13.30'])
    assert.equal(parseMoodleDate(value), '2026-10-04T06:30:00.000Z');
  assert.equal(parseMoodleDate('2026-10-04T13:30:00+07:00'), '2026-10-04T06:30:00.000Z');
  for (const invalid of ['31 February 2026 12:00', 'yesterday', 'No due date', '4 October 2026', '']) assert.equal(parseMoodleDate(invalid), null);
});
test('only labeled due dates and submission statuses are used, not description/grade text', () => {
  const details = parseAssignmentPage(html('No submissions have been made yet', '4 October 2026, 13:30', '<div class="description">Submitted for grading. 5 October 2026 10:00</div>'), 'Asia/Jakarta', Date.parse('2026-10-04T05:00:00Z'));
  assert.equal(details.status, 'pending'); assert.equal(details.dueAt, '2026-10-04T06:30:00.000Z'); assert.equal(details.verified, true);
  assert.equal(parseAssignmentPage(html('Submitted for grading', '4 October 2026, 13:30')).status, 'submitted');
  assert.equal(parseAssignmentPage(html('Draft (not submitted)', '4 October 2026, 13:30')).status, 'draft');
  assert.equal(parseAssignmentPage(html('No attempt', '1 October 2026 13:30')).status, 'overdue');
  const unknown = parseAssignmentPage('<main><p>Submitted for grading</p><p>4 October 2026 13:30</p></main>');
  assert.equal(unknown.status, 'unknown'); assert.equal(unknown.dueAt, null); assert.equal(unknown.verified, false);
});
test('structured dates, Indonesian labels, no deadline and parser failures stay safe', () => {
  const result = parseAssignmentPage('<div class="activity-dates" data-region="activity-dates"><div><strong>Due:</strong><time datetime="2026-10-04T13:30:00+07:00">unreadable localized date</time></div></div><table><tr><td>Status pengumpulan</td><td>Belum dikumpulkan</td></tr></table>');
  assert.equal(result.dueAt, '2026-10-04T06:30:00.000Z'); assert.equal(result.verified, true);
  assert.equal(parseAssignmentPage(html('No attempt', 'unknown date')).verified, false);
  const noDate = parseAssignmentPage(html('No attempt', 'No due date'));
  assert.equal(noDate.dueAt, null); assert.equal(noDate.status, 'pending'); assert.equal(noDate.verified, true);
});
