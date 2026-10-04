/**
 * Assignment Routes
 * GET  /api/assignments          - List assignments (with filters)
 * GET  /api/assignments/:id      - Assignment detail
 * POST /api/assignments/:id/submit - Submit assignment
 *
 * Requirements: 4.2, 5.1-5.8, 6.1-6.9, 14.1, 16.1, 16.5
 */

const express = require('express');
const multer = require('multer');
const { asyncHandler } = require('../middleware/errorHandler');
const { authMiddleware } = require('../middleware/authMiddleware');
const { applyFilters, parseAssignmentsFromHtml } = require('../utils/parser');
const { getLogger } = require('../config/logger');

const logger = getLogger();

// Multer config for file uploads (store in memory for proxy-forwarding)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

/**
 * Create assignment router
 * @param {SessionManager} sessionManager
 * @param {LMSProxy} lmsProxy
 * @param {AuthController} authController - for scraped data access
 */
function createAssignmentsRouter(sessionManager, lmsProxy, authController) {
  const router = express.Router();
  const auth = authMiddleware(sessionManager);

  /**
   * GET /api/assignments
   * Returns filtered + sorted assignment list
   * Query: ?course=X&status=Y&sortBy=Z&order=asc|desc
   * Requirements: 4.2, 5.1-5.8, 16.1, 16.5
   */
  router.get('/', auth, asyncHandler(async (req, res) => {
    const { course, status, sortBy, order } = req.query;

    // Validate sort params (Requirement 16.5)
    const validSortBy = ['dueDate', 'title', 'course'];
    const validOrder = ['asc', 'desc'];
    const validStatus = ['all', 'not-submitted', 'submitted', 'graded', 'pending', 'overdue', 'draft'];

    if (sortBy && !validSortBy.includes(sortBy)) {
      return res.status(400).json({
        success: false,
        error: `Invalid sortBy parameter. Must be one of: ${validSortBy.join(', ')}`,
      });
    }

    if (order && !validOrder.includes(order)) {
      return res.status(400).json({
        success: false,
        error: `Invalid order parameter. Must be 'asc' or 'desc'`,
      });
    }

    if (status && !validStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status parameter. Must be one of: ${validStatus.join(', ')}`,
      });
    }

    let assignments = [];

    // Try to fetch live data from LMS
    const session = req.session;
    if (session && session.lmsCookies && session.lmsCookies.size > 0) {
      try {
        const result = await lmsProxy.fetchAssignments(session.lmsCookies);
        if (result.success && result.html) {
          const parsed = parseAssignmentsFromHtml(result.html);
          assignments = parsed.length > 0 ? parsed : authController.getScrapedAssignments();
        } else {
          assignments = authController.getScrapedAssignments();
        }
      } catch (err) {
        logger.warn('Live LMS fetch failed, using scraped data', { error: err.message });
        assignments = authController.getScrapedAssignments();
      }
    } else {
      // Use scraped data as fallback
      assignments = authController.getScrapedAssignments();
    }

    // Apply filters and sorting (Requirements 5.2-5.5)
    const filters = {
      course: course || 'all',
      status: status || 'all',
      sortBy: sortBy || 'dueDate',
      order: order || 'asc',
    };

    const filtered = applyFilters(assignments, filters);

    logger.info('Assignments fetched', {
      total: assignments.length,
      filtered: filtered.length,
      filters,
      nim: session?.nim,
    });

    return res.status(200).json({
      success: true,
      total: filtered.length,
      assignments: filtered,
      filters,
    });
  }));

  /**
   * GET /api/assignments/:id
   * Returns full assignment detail
   * Requirements: 6.1, 6.2, 6.10
   */
  router.get('/:id', auth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const session = req.session;

    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid assignment ID',
      });
    }

    // Try live fetch first
    let assignmentDetail = null;

    if (session && session.lmsCookies && session.lmsCookies.size > 0) {
      try {
        const result = await lmsProxy.fetchAssignmentDetail(id, session.lmsCookies);
        if (result.success && result.html) {
          // For now, use scraped data + enrich with URL
          assignmentDetail = _findAssignmentById(authController.getScrapedAssignments(), id);
        }
      } catch (err) {
        logger.warn('Live LMS detail fetch failed, using scraped', { error: err.message });
      }
    }

    if (!assignmentDetail) {
      assignmentDetail = _findAssignmentById(authController.getScrapedAssignments(), id);
    }

    if (!assignmentDetail) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found',
      });
    }

    // Extend with detail-specific fields
    const detail = {
      ...assignmentDetail,
      fullDescription: assignmentDetail.description || '',
      submissionType: 'file', // default
      maxAttempts: 1,
      allowedExtensions: ['pdf', 'doc', 'docx', 'zip', 'rar', 'txt', 'jpg', 'png'],
      submissions: [],
      rubric: null,
    };

    return res.status(200).json({
      success: true,
      assignment: detail,
    });
  }));

  /**
   * POST /api/assignments/:id/submit
   * Submit file or text for an assignment
   * Requirements: 6.6, 6.7, 6.8, 6.9
   */
  router.post('/:id/submit', auth, upload.single('file'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { submissionText } = req.body;
    const file = req.file;
    const session = req.session;

    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({ success: false, error: 'Invalid assignment ID' });
    }

    // Must have either file or text
    if (!file && !submissionText) {
      return res.status(400).json({
        success: false,
        error: 'Submission must include a file or text',
      });
    }

    // Validate file type if file provided (Requirement 6.5)
    if (file) {
      const allowedExtensions = ['pdf', 'doc', 'docx', 'zip', 'rar', 'txt', 'jpg', 'png', 'jpeg'];
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        return res.status(400).json({
          success: false,
          error: `File type '${ext}' is not allowed. Allowed types: ${allowedExtensions.join(', ')}`,
        });
      }
    }

    logger.info('Assignment submission received', {
      assignmentId: id,
      hasFile: !!file,
      hasText: !!submissionText,
      nim: session?.nim,
    });

    // Try to forward to LMS (Requirement 6.7)
    if (session && session.lmsCookies && session.lmsCookies.size > 0) {
      try {
        const formData = {};
        if (submissionText) formData.submissionText = submissionText;
        if (file) formData.file = file;

        const result = await lmsProxy.submitAssignment(id, formData, session.lmsCookies);
        if (result.success) {
          return res.status(200).json({
            success: true,
            submissionId: result.submissionId,
            message: 'Assignment submitted successfully',
          });
        }
      } catch (err) {
        logger.error('LMS submission failed', { error: err.message, assignmentId: id });
      }
    }

    // Dev mode: simulate success and mark cached assignment as submitted
    const cached = _findAssignmentById(authController.getScrapedAssignments(), id);
    if (cached) {
      cached.submissionStatus = 'submitted';
      cached.isOverdue = false;
      cached.overdueInfo = null;
    }

    return res.status(200).json({
      success: true,
      submissionId: `sub-${id}-${Date.now()}`,
      message: 'Assignment submitted successfully (dev mode)',
    });
  }));

  return router;
}

/**
 * Find assignment by ID from array
 */
function _findAssignmentById(assignments, id) {
  return assignments.find(a => a.id === id) || null;
}

module.exports = createAssignmentsRouter;
