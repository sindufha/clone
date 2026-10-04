import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import axios from 'axios';
import express from 'express';
import {
  CURRENT_SEMESTER_COURSES,
  getCurrentSemesterCourse,
  isCurrentSemesterCourse,
} from '../shared/currentSemester.ts';

// This suite must never connect to the configured Neon database.
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/semester_whitelist_test';
const { pool } = await import('../server/db.ts');
const { attachLiveSession, removeLiveSession, fetchLiveCourses, fetchLiveAssignments } =
  await import('../server/liveLms.ts');
const { coursesRouter } = await import('../server/routes/courses.ts');
const { assignmentsRouter } = await import('../server/routes/assignments.ts');
const { dashboardRouter } = await import('../server/routes/dashboard.ts');

const readSnapshot = async (filename) =>
  JSON.parse(await readFile(new URL(`../${filename}`, import.meta.url), 'utf8'));
const { courses: rawCourses, assignments: rawAssignments } =
  await readSnapshot('tests/fixtures/semester-snapshot.json');
const idFromUrl = (url) => new URL(url).searchParams.get('id');
const expectedSnapshotIds = ['19', '119', '124', '182', '183', '188'];

test('whitelist contains the nine subjects from the class schedule', () => {
  assert.deepEqual(CURRENT_SEMESTER_COURSES.map((course) => course.code), [
    'SIN504', 'SIN502', 'SIN508', 'SIN303', 'SIN304', 'SIN501', 'SIN506', 'SIN507', 'SIN505',
  ]);
  for (const course of CURRENT_SEMESTER_COURSES) {
    assert.equal(getCurrentSemesterCourse(course.name)?.code, course.code);
    assert.equal(getCurrentSemesterCourse(`${course.name} (${course.code})`)?.code, course.code);
    assert.equal(getCurrentSemesterCourse(`${course.code} ${course.name}`)?.code, course.code);
  }
});

test('LMS cohort labels and Web 2 aliases resolve to the schedule subject codes', () => {
  const cases = [
    ['SI2024 Data Warehouse', 'SI2024', 'SIN504'],
    ['SI2024 Arsitektur Enterprise', 'SI2024', 'SIN505'],
    ['SI2024 Penjaminan Kualitas Perangkat Lunak', 'SI2024', 'SIN508'],
    ['  pemrograman   web 2  ', '', 'SIN303'],
    ['Praktikum Pemrograman Web 2', '', 'SIN304'],
    ['SIN501 KECERDASAN BUATAN', '', 'SIN501'],
  ];
  for (const [name, code, expected] of cases) {
    assert.equal(getCurrentSemesterCourse(name, code)?.code, expected);
  }
});

test('previous subjects, unknown names and conflicting explicit codes are rejected', () => {
  for (const name of [
    'PEMROGRAMAN WEB I', 'SI2024 Jaringan Komputer', 'SI2024 Keamanan Sistem Informasi',
    'SI2024 Rekayasa Perangkat Lunak', 'Praktikum Pemrograman Web I',
    'Data Warehouse Lanjutan', 'SIN403 Pemrograman Web II', '', 'Unknown Course',
  ]) {
    assert.equal(isCurrentSemesterCourse(name), false, name);
  }
  assert.equal(isCurrentSemesterCourse('Data Warehouse', 'SIN999'), false);
  assert.equal(isCurrentSemesterCourse('SIN303 Pemrograman Web II', 'SIN304'), false);
});

test('the synthetic snapshot retains six courses and only five related assignments', () => {
  const courses = rawCourses.filter((course) => isCurrentSemesterCourse(course.courseName));
  const ids = new Set(courses.map((course) => idFromUrl(course.courseUrl)));
  const assignments = rawAssignments.filter((assignment) => ids.has(idFromUrl(assignment.courseUrl)));
  assert.deepEqual([...ids].sort(), [...expectedSnapshotIds].sort());
  assert.equal(assignments.length, 5);
  assert.ok(assignments.every((assignment) => isCurrentSemesterCourse(assignment.courseName)));
});

test('live data excludes other subjects before fetching their pages or assignments', async (t) => {
  const currentCourses = CURRENT_SEMESTER_COURSES.map((course, index) => ({
    id: String(700 + index), name: `${course.name} (${course.code})`,
  }));
  const extraCourses = [{ id: '999', name: 'PEMROGRAMAN WEB I' }];
  const requests = [];
  t.mock.method(axios, 'create', () => ({
    async get(url) {
      requests.push(url);
      if (url === '/my/courses.php') {
        return { data: [...currentCourses, ...extraCourses].map((course) =>
          `<a href="/course/view.php?id=${course.id}">${course.name}</a>`,
        ).join('') };
      }
      const course = currentCourses.find((item) => url.includes(`/course/view.php?id=${item.id}`));
      if (course) {
        return { data: `<a href="/mod/assign/view.php?id=${Number(course.id) + 1000}">Current assignment</a>` };
      }
      if (url.includes('/mod/assign/view.php?id=')) {
        return { data: '<main>Submitted for grading</main>' };
      }
      assert.fail(`Unexpected LMS request: ${url}`);
    },
  }));
  const token = 'live-whitelist-test';
  attachLiveSession(token, new Map([['MoodleSession', 'test-only']]));
  t.after(() => removeLiveSession(token));
  const courses = await fetchLiveCourses(token);
  const assignments = await fetchLiveAssignments(token);
  const detailedAssignments = await fetchLiveAssignments(token, true);
  assert.deepEqual(courses.map((course) => course.code), CURRENT_SEMESTER_COURSES.map((course) => course.code));
  assert.equal(assignments.length, 9);
  assert.equal(detailedAssignments.length, 9);
  assert.ok(detailedAssignments.every((assignment) => assignment.status === 'submitted'));
  assert.ok(requests.every((url) => !url.includes('id=999')));
});

test('an empty live semester does not include unrelated subjects', async (t) => {
  t.mock.method(axios, 'create', () => ({
    get: async () => ({ data: '<a href="/course/view.php?id=172">SI2024 Jaringan Komputer</a>' }),
  }));
  const token = 'empty-whitelist-test';
  attachLiveSession(token, new Map([['MoodleSession', 'test-only']]));
  t.after(() => removeLiveSession(token));
  assert.deepEqual(await fetchLiveCourses(token), []);
  assert.deepEqual(await fetchLiveAssignments(token), []);
});
