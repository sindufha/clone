/**
 * Client-side SPA Router (hash-based)
 * Requirements: 3.1, 5.7, 17.4, 9.10
 */
const Router = (() => {
  const routes = new Map();
  let currentRoute = null;
  let notFoundHandler = null;
  const history = [];

  let isNavigatingInternal = false;

  /**
   * Register a route
   * @param {string} path - e.g. '#/dashboard', '#/assignments/:id'
   * @param {Function} handler - async (params) => void
   */
  function register(path, handler) {
    routes.set(path, handler);
  }

  /**
   * Navigate to a path
   * @param {string} path - e.g. '#/dashboard' or '#/assignments/1234'
   * @param {Object} params - optional extra data passed to handler
   */
  async function navigate(path, params = {}) {
    if (currentRoute === path && Object.keys(params).length === 0) {
      return;
    }

    const start = Date.now();

    // Update browser hash without re-triggering hashchange listener
    isNavigatingInternal = true;
    if (window.location.hash !== path) {
      window.location.hash = path;
    }
    // Small timeout or immediate reset
    setTimeout(() => { isNavigatingInternal = false; }, 50);

    currentRoute = path;
    if (history.length === 0 || history[history.length - 1] !== path) {
      history.push(path);
    }

    // Update active nav button state across the app
    _updateNavActive(path);

    // Find matching route (support :param segments)
    let handler = null;
    let routeParams = { ...params };

    for (const [pattern, fn] of routes) {
      const match = matchRoute(pattern, path);
      if (match) {
        handler = fn;
        routeParams = { ...routeParams, ...match };
        break;
      }
    }

    if (!handler && notFoundHandler) handler = notFoundHandler;

    if (handler) {
      // Start sleek top progress bar
      if (window.LoadingBar) window.LoadingBar.start();

      // Scroll to top on navigation (Requirement 9.10)
      window.scrollTo(0, 0);

      const viewContainer = document.getElementById('view-container');
      if (viewContainer) {
        viewContainer.classList.remove('view-enter');
        requestAnimationFrame(() => {
          viewContainer.classList.add('view-enter');
        });
      }

      try {
        await handler(routeParams);
      } catch (err) {
        console.error('[Router] Handler error:', err);
        Alerts.error('Navigation error: ' + err.message);
      } finally {
        if (window.LoadingBar) window.LoadingBar.finish();
      }

      const elapsed = Date.now() - start;
      if (elapsed > 500) {
        console.warn(`[Router] Navigation to ${path} took ${elapsed}ms (>500ms)`);
      }
    }
  }

  function _updateNavActive(path) {
    const dashBtn = document.getElementById('nav-dashboard-btn');
    const coursesBtn = document.getElementById('nav-courses-btn');
    if (dashBtn) {
      dashBtn.classList.toggle('active', path.startsWith('#/dashboard') || path.startsWith('#/assignments'));
    }
    if (coursesBtn) {
      coursesBtn.classList.toggle('active', path.startsWith('#/courses'));
    }
  }

  /**
   * Navigate back
   */
  function back() {
    if (history.length > 1) {
      history.pop();
      const prev = history[history.length - 1];
      navigate(prev);
    } else {
      navigate('#/dashboard');
    }
  }

  /**
   * Match a route pattern against a path
   * Returns params object if match, null otherwise
   */
  function matchRoute(pattern, path) {
    // Strip hash
    const normPattern = pattern.replace(/^#/, '');
    const normPath = path.replace(/^#/, '');

    const patternParts = normPattern.split('/').filter(Boolean);
    const pathParts = normPath.split('/').filter(Boolean);

    if (patternParts.length !== pathParts.length) return null;

    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (patternParts[i] !== pathParts[i]) {
        return null;
      }
    }
    return params;
  }

  /**
   * Handle browser popstate (back/forward buttons)
   */
  function setup() {
    window.addEventListener('hashchange', () => {
      if (isNavigatingInternal) return;
      const path = window.location.hash || '#/';
      navigate(path);
    });

    // Handle initial hash
    const initial = window.location.hash || '#/';
    // Navigation will be triggered by app initialization
  }

  function setNotFound(handler) {
    notFoundHandler = handler;
  }

  function getCurrent() { return currentRoute; }

  return { register, navigate, back, setup, setNotFound, getCurrent };
})();

window.Router = Router;
