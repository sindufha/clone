/**
 * Assignment Service
 * Fetches and caches assignment data
 * Requirements: 4.5, 4.6, 5.2, 5.6, 5.7
 */
const AssignmentService = (() => {
  const cache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate cache key from filter options
   * Requirements: 5.6
   */
  function cacheKey(filters = {}) {
    const { course = 'all', status = 'all', sortBy = 'dueDate', order = 'asc' } = filters;
    return `assignments:${course}:${status}:${sortBy}:${order}`;
  }

  /**
   * Check if cache entry is valid
   */
  function isCacheValid(entry) {
    return entry && Date.now() < entry.expiresAt;
  }

  /**
   * Get assignments with filters (with caching)
   * Requirements: 4.5, 4.6, 5.2, 5.5, 5.6
   */
  async function getAssignments(filters = {}) {
    const key = cacheKey(filters);
    const cached = cache.get(key);

    // Return cached if valid (Requirement 4.5)
    if (isCacheValid(cached)) {
      return cached.data;
    }

    // Build query string
    const params = new URLSearchParams();
    if (filters.course && filters.course !== 'all') params.set('course', filters.course);
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.sortBy) params.set('sortBy', filters.sortBy);
    if (filters.order)  params.set('order', filters.order);

    const query = params.toString() ? `?${params.toString()}` : '';
    const data = await API.get(`/api/assignments${query}`);

    // Store in cache (Requirement 4.6)
    cache.set(key, {
      data: data.assignments || [],
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_TTL,
    });

    return data.assignments || [];
  }

  /**
   * Get assignment by ID
   */
  async function getAssignmentById(id) {
    const cKey = `assignment:${id}`;
    const cached = cache.get(cKey);
    if (isCacheValid(cached)) return cached.data;

    const data = await API.get(`/api/assignments/${id}`);
    const assignment = data.assignment;

    cache.set(cKey, {
      data: assignment,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_TTL,
    });

    return assignment;
  }

  /**
   * Submit assignment
   */
  async function submitAssignment(id, formData) {
    const data = await API.post(`/api/assignments/${id}/submit`, formData);
    // Invalidate cache after submission
    clearCache();
    return data;
  }

  /**
   * Clear all assignment cache entries (Requirement 5.7)
   */
  function clearCache() {
    for (const key of cache.keys()) {
      if (key.startsWith('assignment')) cache.delete(key);
    }
  }

  return { getAssignments, getAssignmentById, submitAssignment, clearCache };
})();

window.AssignmentService = AssignmentService;
