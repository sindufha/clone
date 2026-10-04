/**
 * Course Routes
 * GET /api/courses       - List all enrolled courses
 * GET /api/courses/:id   - Course detail
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { authMiddleware } = require('../middleware/authMiddleware');
const { parseCoursesFromHtml } = require('../utils/parser');
const { getLogger } = require('../config/logger');

const logger = getLogger();

/**
 * Create courses router
 * @param {SessionManager} sessionManager
 * @param {LMSProxy} lmsProxy
 * @param {AuthController} authController - for scraped data access
 */
function createCoursesRouter(sessionManager, lmsProxy, authController) {
  const router = express.Router();
  const auth = authMiddleware(sessionManager);

  /**
   * GET /api/courses
   * Returns list of all enrolled courses
   * Requirements: 7.1, 7.2
   */
  router.get('/', auth, asyncHandler(async (req, res) => {
    const session = req.session;
    let courses = [];

    // Try live fetch first
    if (session && session.lmsCookies && session.lmsCookies.size > 0) {
      try {
        const result = await lmsProxy.fetchCourses(session.lmsCookies);
        if (result.success && result.html) {
          const parsed = parseCoursesFromHtml(result.html);
          courses = parsed.length > 0 ? parsed : authController.getScrapedCourses();
        } else {
          courses = authController.getScrapedCourses();
        }
      } catch (err) {
        logger.warn('Live LMS courses fetch failed, using scraped', { error: err.message });
        courses = authController.getScrapedCourses();
      }
    } else {
      courses = authController.getScrapedCourses();
    }

    logger.info('Courses fetched', {
      total: courses.length,
      nim: session?.nim,
    });

    // Return courses without heavy section data for list view
    const courseList = courses.map(c => ({
      id: c.id,
      name: c.name,
      code: c.code,
      instructor: c.instructor,
      enrollmentStatus: c.enrollmentStatus,
      url: c.url,
      description: c.description,
    }));

    return res.status(200).json({
      success: true,
      total: courseList.length,
      courses: courseList,
    });
  }));

  /**
   * GET /api/courses/:id
   * Returns full course detail including sections and assignments
   * Requirements: 7.3, 7.4
   */
  router.get('/:id', auth, asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid course ID',
      });
    }

    const courses = authController.getScrapedCourses();
    const course = courses.find(c => c.id === id);

    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found',
      });
    }

    // Get assignments for this course
    const allAssignments = authController.getScrapedAssignments();
    const courseAssignments = allAssignments.filter(a => a.courseId === id || a.course === course.name);

    return res.status(200).json({
      success: true,
      course: {
        ...course,
        assignmentCount: courseAssignments.length,
        assignments: courseAssignments.map(a => ({
          id: a.id,
          title: a.title,
          dueDate: a.dueDate,
          submissionStatus: a.submissionStatus,
          gradingStatus: a.gradingStatus,
          url: a.url,
        })),
      },
    });
  }));

  return router;
}

module.exports = createCoursesRouter;
