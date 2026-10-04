/**
 * LMS HTML Parser & Data Normalizer
 * Parses LMS HTML responses and normalizes scraped JSON data
 * into canonical API response format.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 16.1, 16.2, 16.3
 */

const cheerio = require('cheerio');
const { getLogger } = require('../config/logger');
const logger = getLogger();

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract assignment ID from LMS URL
 * e.g. https://lms.itmnganjuk.ac.id/mod/assign/view.php?id=1921 → "1921"
 */
function extractIdFromUrl(url) {
  if (!url) return null;
  try {
    const match = url.match(/[?&]id=(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Extract course ID from course URL
 * e.g. https://lms.itmnganjuk.ac.id/course/view.php?id=36 → "36"
 */
function extractCourseIdFromUrl(url) {
  return extractIdFromUrl(url);
}

/**
 * Normalize submission status string → canonical enum
 * Canonical: 'submitted' | 'not-submitted' | 'draft' | 'overdue'
 */
function normalizeSubmissionStatus(raw, overdueInfo) {
  if (!raw) return 'not-submitted';
  const lower = raw.toLowerCase();

  if (lower.includes('submitted for grading')) return 'submitted';
  if (lower.includes('draft')) return 'draft';
  if (lower.includes('no submission') || lower.includes('no submissions')) {
    if (overdueInfo) return 'overdue';
    return 'not-submitted';
  }
  if (lower.includes('submitted')) return 'submitted';
  return 'not-submitted';
}

/**
 * Normalize grading status string → canonical enum
 * Canonical: 'graded' | 'not-graded' | 'pending'
 */
function normalizeGradingStatus(raw) {
  if (!raw) return 'not-graded';
  const lower = raw.toLowerCase();
  if (lower.includes('graded') && !lower.includes('not graded')) return 'graded';
  if (lower.includes('pending')) return 'pending';
  return 'not-graded';
}

/**
 * Parse LMS date string to ISO 8601
 * e.g. "Monday, 16 April 2026, 11:59 PM" → "2026-04-16T23:59:00.000Z"
 * Requirements: 14.3
 */
function parseLmsDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  if (!clean || clean === '-') return null;

  // Try "Monday, 16 April 2026, 11:59 PM" format
  const lmsPattern = /\w+,\s+(\d+)\s+(\w+)\s+(\d{4}),?\s+(\d+):(\d+)\s*(AM|PM)/i;
  const match = clean.match(lmsPattern);
  if (match) {
    const months = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
    };
    const day = parseInt(match[1], 10);
    const month = months[match[2].toLowerCase()];
    const year = parseInt(match[3], 10);
    let hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    const ampm = match[6].toUpperCase();

    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;

    const date = new Date(Date.UTC(year, month, day, hour, minute, 0));
    if (!isNaN(date.getTime())) return date.toISOString();
  }

  // Try native Date parsing as fallback
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();

  return null;
}

/**
 * Determine if assignment is overdue based on overdueInfo string
 */
function isOverdue(overdueInfo) {
  return !!(overdueInfo && overdueInfo.trim().length > 0);
}

/**
 * Check if an assignment is unsubmitted and overdue by > 50 days (obsolete/different semester)
 */
function isObsoleteOverdue(assignment) {
  if (!assignment || assignment.submissionStatus === 'submitted') return false;
  if (assignment.overdueInfo) {
    const match = assignment.overdueInfo.match(/(\d+)\s*days?/i);
    if (match && parseInt(match[1], 10) > 50) return true;
  }
  if (assignment.dueDate) {
    const d = new Date(assignment.dueDate);
    if (!isNaN(d.getTime())) {
      const diffDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 50) return true;
    }
  }
  return false;
}

// ─── Scraped JSON Normalizer ─────────────────────────────────────────────────

/**
 * Normalize a single assignment from the scraped JSON format
 * into canonical Assignment API format.
 *
 * Requirements: 14.2, 16.2
 */
function normalizeAssignment(raw) {
  try {
    const url = raw.assignmentUrl || raw.url || '';
    const id = extractIdFromUrl(url);
    if (!id) {
      logger.warn('Assignment missing ID, skipping', { url });
      return null;
    }

    const courseUrl = raw.courseUrl || '';
    const courseId = extractCourseIdFromUrl(courseUrl) || 'unknown';

    const subStatus = normalizeSubmissionStatus(raw.submissionStatus, raw.overdueInfo);
    const gradStatus = normalizeGradingStatus(raw.gradingStatus);

    // Derive due date from description text if not directly available
    let dueDate = parseLmsDate(raw.dueDate) || parseLmsDate(raw.cutoffDate);

    // Try to extract a date from description heuristically
    if (!dueDate && raw.description) {
      const dateMatch = raw.description.match(
        /\b(\w+day,\s+\d+\s+\w+\s+\d{4},?\s+\d+:\d+\s*(?:AM|PM))\b/i
      );
      if (dateMatch) dueDate = parseLmsDate(dateMatch[1]);
    }

    const assignment = {
      id,
      title: raw.assignmentTitle || raw.title || 'Untitled Assignment',
      course: raw.courseName || 'Unknown Course',
      courseId,
      courseUrl,
      dueDate: dueDate || null,
      submissionStatus: subStatus,
      gradingStatus: gradStatus,
      url,
      description: (raw.description || '').substring(0, 500),
      points: raw.points ? parseInt(raw.points, 10) : null,
      earnedPoints: null,
      overdueInfo: subStatus === 'submitted' ? null : (raw.overdueInfo || null),
      isOverdue: subStatus !== 'submitted' && (subStatus === 'overdue' || isOverdue(raw.overdueInfo)),
    };

    // Validate required fields (Requirement 16.2)
    if (!assignment.title || !assignment.course) {
      logger.warn('Assignment missing required fields', { id, title: assignment.title });
    }

    return assignment;
  } catch (err) {
    logger.error('Failed to normalize assignment', { error: err.message, raw });
    return null;
  }
}

/**
 * Normalize all assignments from scraped JSON file
 * Returns array of canonical Assignment objects
 */
function normalizeAssignments(scrapedData) {
  if (!scrapedData || !Array.isArray(scrapedData.assignments)) {
    logger.error('Invalid scraped assignments data structure');
    return [];
  }

  const results = [];
  for (const raw of scrapedData.assignments) {
    const normalized = normalizeAssignment(raw);
    if (normalized && !isObsoleteOverdue(normalized)) {
      results.push(normalized);
    }
  }

  logger.info(`Normalized ${results.length}/${scrapedData.assignments.length} assignments`);
  return results;
}

/**
 * Normalize a single course from scraped JSON
 * Requirements: 14.5
 */
function normalizeCourse(raw) {
  try {
    const url = raw.courseUrl || raw.url || '';
    const id = extractCourseIdFromUrl(url);
    if (!id) {
      logger.warn('Course missing ID, skipping', { url });
      return null;
    }

    // Extract instructor from sections if available
    let instructor = raw.instructor || 'Unknown Instructor';
    if (raw.sections && Array.isArray(raw.sections)) {
      for (const section of raw.sections) {
        if (section.content && section.content.toLowerCase().includes('instruktur')) {
          instructor = section.content.trim().split('\n')[0] || instructor;
        }
      }
    }

    return {
      id,
      name: raw.courseName || raw.title || 'Unknown Course',
      code: raw.courseCode || id,
      instructor,
      enrollmentStatus: 'active',
      url,
      description: raw.description || `Course ${raw.courseName || ''}`.trim(),
      sections: (raw.sections || []).map(s => ({
        title: s.title || '',
        activities: (s.activities || []).map(a => ({
          name: a.name || '',
          type: a.type || '',
          link: a.link || '',
        })),
      })),
    };
  } catch (err) {
    logger.error('Failed to normalize course', { error: err.message });
    return null;
  }
}

/**
 * Normalize all courses from scraped JSON file
 */
function normalizeCourses(scrapedData) {
  if (!scrapedData || !Array.isArray(scrapedData.courses)) {
    logger.error('Invalid scraped courses data structure');
    return [];
  }

  const results = [];
  for (const raw of scrapedData.courses) {
    const normalized = normalizeCourse(raw);
    if (normalized) results.push(normalized);
  }

  logger.info(`Normalized ${results.length}/${scrapedData.courses.length} courses`);
  return results;
}

// ─── HTML Parser (for live LMS responses) ────────────────────────────────────

/**
 * Parse assignment list from LMS HTML page
 * Requirements: 14.1, 14.2, 14.3
 */
function parseAssignmentsFromHtml(html) {
  if (!html || typeof html !== 'string') {
    logger.warn('Empty or invalid HTML for assignment parsing');
    return [];
  }

  const $ = cheerio.load(html);
  const assignments = [];

  // Try multiple selectors for LMS assignment elements
  const assignmentSelectors = [
    '.activity.assign',
    '[data-activityname]',
    '.aalink',
    'a[href*="/mod/assign/view.php"]',
  ];

  const foundLinks = new Set();

  for (const selector of assignmentSelectors) {
    $(selector).each((_, el) => {
      try {
        let link, title, courseName;

        if (selector === 'a[href*="/mod/assign/view.php"]') {
          link = $(el).attr('href');
          title = $(el).text().trim();
          // Try to find course name from parent context
          courseName = $(el).closest('[data-course]').attr('data-course') ||
                       $(el).closest('.course-section').find('.section-title').text().trim() ||
                       'Unknown Course';
        } else {
          const anchor = $(el).find('a[href*="/mod/assign/"]').first();
          if (!anchor.length) return;
          link = anchor.attr('href');
          title = anchor.find('.instancename').first().text().trim() ||
                  anchor.text().trim();
          courseName = $(el).closest('.course-section').find('.section-title').text().trim() ||
                       'Unknown Course';
        }

        if (!link || foundLinks.has(link)) return;
        foundLinks.add(link);

        const id = extractIdFromUrl(link);
        if (!id) return;

        assignments.push({
          id,
          title: title || 'Untitled',
          course: courseName,
          courseId: 'unknown',
          url: link,
          dueDate: null,
          submissionStatus: 'not-submitted',
          gradingStatus: 'not-graded',
          isOverdue: false,
        });
      } catch (err) {
        logger.warn('Failed to parse assignment element', { error: err.message });
      }
    });

    if (assignments.length > 0) break;
  }

  logger.info(`Parsed ${assignments.length} assignments from HTML`);
  return assignments;
}

/**
 * Parse courses from LMS HTML page
 * Requirements: 14.5
 */
function parseCoursesFromHtml(html) {
  if (!html || typeof html !== 'string') {
    logger.warn('Empty or invalid HTML for course parsing');
    return [];
  }

  const $ = cheerio.load(html);
  const courses = [];
  const foundIds = new Set();

  $('a[href*="/course/view.php"]').each((_, el) => {
    const url = $(el).attr('href');
    const id = extractCourseIdFromUrl(url);
    if (!id || foundIds.has(id)) return;
    foundIds.add(id);

    const name = $(el).text().trim() ||
                 $(el).attr('title') || 'Unknown Course';

    courses.push({
      id,
      name,
      code: id,
      instructor: 'Unknown Instructor',
      enrollmentStatus: 'active',
      url,
      description: '',
      sections: [],
    });
  });

  logger.info(`Parsed ${courses.length} courses from HTML`);
  return courses;
}

// ─── Filter & Sort Helpers ────────────────────────────────────────────────────

/**
 * Apply filter options to an assignment list
 * Requirements: 5.2, 5.3, 5.5
 */
function applyFilters(assignments, filters = {}) {
  let result = assignments.filter(a => !isObsoleteOverdue(a));

  const { course, status, sortBy, order } = filters;

  // Filter by course name or ID
  if (course && course !== 'all') {
    result = result.filter(a =>
      a.course.toLowerCase() === course.toLowerCase() ||
      a.courseId === course
    );
  }

  // Filter by submission status
  if (status && status !== 'all') {
    result = result.filter(a => {
      if (status === 'overdue') return a.submissionStatus !== 'submitted' && (a.isOverdue || a.submissionStatus === 'overdue');
      if (status === 'submitted') return a.submissionStatus === 'submitted';
      if (status === 'not-submitted') return a.submissionStatus === 'not-submitted' && !a.isOverdue;
      if (status === 'draft') return a.submissionStatus === 'draft';
      if (status === 'graded') return a.gradingStatus === 'graded';
      if (status === 'pending') return a.gradingStatus === 'pending';
      return true;
    });
  }

  // Sort
  const dir = order === 'desc' ? -1 : 1;
  if (sortBy === 'title') {
    result.sort((a, b) => dir * a.title.localeCompare(b.title));
  } else if (sortBy === 'course') {
    result.sort((a, b) => dir * a.course.localeCompare(b.course));
  } else {
    // Default: sort by dueDate (nulls last)
    result.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return dir * (new Date(a.dueDate) - new Date(b.dueDate));
    });
  }

  return result;
}

module.exports = {
  normalizeAssignment,
  normalizeAssignments,
  normalizeCourse,
  normalizeCourses,
  parseAssignmentsFromHtml,
  parseCoursesFromHtml,
  applyFilters,
  parseLmsDate,
  normalizeSubmissionStatus,
  normalizeGradingStatus,
};
