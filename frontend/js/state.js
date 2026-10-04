/**
 * AppState — Client-side state management with observer pattern
 * Requirements: 17.1-17.7
 */
const AppState = (() => {
  let state = {
    isAuthenticated: false,
    currentUser: null,        // { nim, name, email }
    assignments: [],
    courses: [],
    currentView: 'login',     // 'login' | 'dashboard' | 'assignment-detail' | 'course-detail'
    loading: false,
    loadingContext: null,
    error: null,
    activeFilters: {
      course: 'all',
      status: 'all',
      sortBy: 'dueDate',
      order: 'asc',
    },
    activeCourse: null,       // selected course filter
    theme: 'light',
  };

  const observers = new Set();
  let errorClearTimer = null;

  /**
   * Validate state consistency (Requirement 17.7)
   */
  function validateState(s) {
    // Invariant: isAuthenticated = true ⟹ currentUser ≠ null
    if (s.isAuthenticated && !s.currentUser) {
      console.warn('[AppState] Inconsistency: isAuthenticated=true but currentUser=null. Fixing...');
      s.isAuthenticated = false;
    }
    // Invariant: not authenticated ⟹ assignments = []
    if (!s.isAuthenticated && s.assignments.length > 0) {
      s.assignments = [];
    }
    return s;
  }

  /**
   * Merge updates into state and notify all observers
   * Requirements: 17.1, 17.2
   */
  function setState(updates) {
    const prev = { ...state };
    state = validateState({ ...state, ...updates });

    // Notify all observers (Requirement 17.1)
    for (const observer of observers) {
      try {
        observer(state, prev);
      } catch (err) {
        console.error('[AppState] Observer error:', err);
      }
    }
  }

  /**
   * Subscribe to state changes
   * Returns unsubscribe function (Requirement 17.3)
   */
  function subscribe(observer) {
    observers.add(observer);
    return () => observers.delete(observer); // unsubscribe
  }

  /**
   * Get current state snapshot
   */
  function getState() {
    return { ...state };
  }

  /**
   * Set loading state (Requirement 17.6 — prevent excessive re-renders)
   */
  function setLoading(loading, context = null) {
    setState({ loading, loadingContext: loading ? context : null });
  }

  /**
   * Set error state with optional auto-clear
   */
  function setError(error, autoClearMs = 0) {
    if (errorClearTimer) clearTimeout(errorClearTimer);
    setState({ error });
    if (error && autoClearMs > 0) {
      errorClearTimer = setTimeout(() => setState({ error: null }), autoClearMs);
    }
  }

  /**
   * Clear all user state on logout (Requirement 17.5)
   */
  function reset() {
    state = {
      isAuthenticated: false,
      currentUser: null,
      assignments: [],
      courses: [],
      currentView: 'login',
      loading: false,
      loadingContext: null,
      error: null,
      activeFilters: {
        course: 'all', status: 'all', sortBy: 'dueDate', order: 'asc',
      },
      activeCourse: null,
      theme: 'light',
    };
    // Notify
    for (const observer of observers) {
      try { observer(state, {}); } catch (err) { /* ignore */ }
    }
  }

  return { setState, subscribe, getState, setLoading, setError, reset };
})();

window.AppState = AppState;
