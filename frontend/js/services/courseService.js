/**
 * Course Service
 * Fetches and caches course data
 * Requirements: 7.1, 7.2, 7.6
 */
const CourseService = (() => {
  let _cache = null;
  let _cacheExpiry = 0;
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async function getCourses() {
    if (_cache && Date.now() < _cacheExpiry) return _cache;

    const data = await API.get('/api/courses');
    _cache = data.courses || [];
    _cacheExpiry = Date.now() + CACHE_TTL;
    return _cache;
  }

  async function getCourseById(id) {
    const data = await API.get(`/api/courses/${id}`);
    return data.course;
  }

  function clearCache() {
    _cache = null;
    _cacheExpiry = 0;
  }

  return { getCourses, getCourseById, clearCache };
})();

window.CourseService = CourseService;
