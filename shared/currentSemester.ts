export interface SemesterCourse {
  code: string;
  name: string;
}

// Semester whitelist transcribed from the student's class schedule.
export const CURRENT_SEMESTER_COURSES: readonly SemesterCourse[] = [
  { code: 'SIN504', name: 'Data Warehouse' },
  { code: 'SIN502', name: 'Sistem Informasi Geografis' },
  { code: 'SIN508', name: 'Penjaminan Kualitas Perangkat Lunak' },
  { code: 'SIN303', name: 'Pemrograman Web II' },
  { code: 'SIN304', name: 'Praktikum Pemrograman Web II' },
  { code: 'SIN501', name: 'Kecerdasan Buatan' },
  { code: 'SIN506', name: 'Etika Profesi' },
  { code: 'SIN507', name: 'Statistika' },
  { code: 'SIN505', name: 'Arsitektur Enterprise' },
];

function normalizeCourseName(name: string): string {
  return name
    .normalize('NFKC')
    .toUpperCase()
    .replace(/^\s*SI\d{4}\b/, '') // LMS cohort label, not a subject code.
    .replace(/\bII\b/g, '2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function getCurrentSemesterCourse(name: string, code = ''): SemesterCourse | undefined {
  const explicitCodes = `${code} ${name}`.toUpperCase().match(/\bSIN\d{3}\b/g);
  if (explicitCodes) {
    // An explicit subject code takes precedence over a similar course title.
    return CURRENT_SEMESTER_COURSES.find((course) =>
      explicitCodes.every((explicitCode) => explicitCode === course.code),
    );
  }

  const normalizedName = normalizeCourseName(name);
  return CURRENT_SEMESTER_COURSES.find((course) =>
    normalizeCourseName(course.name) === normalizedName,
  );
}

export function isCurrentSemesterCourse(name: string, code = ''): boolean {
  return getCurrentSemesterCourse(name, code) !== undefined;
}
