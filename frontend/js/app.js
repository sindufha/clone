/**
 * LMS Portal — Main Application Entry Point
 * Wires router, state, services, and initial view
 * Requirements: 3.1, 9.1, 9.2, 9.3, 17.4
 */

(async function init() {
  console.log('[App] Initializing LMS Portal...');

  // ── Setup Router ──────────────────────────────────────────────────────────
  Router.setup();

  Router.register('#/login', async () => {
    NavbarComponent.hide();
    AppState.setState({ currentView: 'login' });
    LoginComponent.render();
  });

  Router.register('#/dashboard', async () => {
    const state = AppState.getState();
    if (!state.isAuthenticated) {
      Router.navigate('#/login');
      return;
    }
    AppState.setState({ currentView: 'dashboard' });
    NavbarComponent.show(state.currentUser);
    await DashboardComponent.render();
  });

  Router.register('#/assignments/:id', async (params) => {
    const state = AppState.getState();
    if (!state.isAuthenticated) {
      Router.navigate('#/login');
      return;
    }
    AppState.setState({ currentView: 'assignment-detail' });
    NavbarComponent.show(state.currentUser);
    await AssignmentDetailComponent.render(params);
  });

  Router.register('#/courses', async () => {
    const state = AppState.getState();
    if (!state.isAuthenticated) {
      Router.navigate('#/login');
      return;
    }
    AppState.setState({ currentView: 'courses' });
    NavbarComponent.show(state.currentUser);
    SidebarComponent.load();
    const viewContainer = document.getElementById('view-container');
    if (viewContainer) {
      viewContainer.innerHTML = `
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-6);flex-wrap:wrap;gap:var(--sp-4)">
            <div>
              <h1 style="font-size:var(--font-size-3xl);font-weight:var(--fw-black);margin-bottom:var(--sp-1)">My Courses</h1>
              <p style="color:var(--color-text-3);font-size:var(--font-size-sm)">Select a course to view its assignments on the dashboard</p>
            </div>
            <button id="courses-back-btn" class="btn btn-secondary btn-sm" aria-label="Back to dashboard">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
              </svg>
              Back to Dashboard
            </button>
          </div>
          <div id="courses-container"></div>
        </div>
      `;
      document.getElementById('courses-back-btn')?.addEventListener('click', () => {
        Router.navigate('#/dashboard');
      });
      CourseListComponent.render(document.getElementById('courses-container'));
    }
  });

  Router.register('#/courses/:id', async (params) => {
    const state = AppState.getState();
    if (!state.isAuthenticated) { Router.navigate('#/login'); return; }
    // Set course filter and navigate to dashboard
    AppState.setState({ pendingCourseFilter: params.id });
    SidebarComponent.setActive(params.id);
    Router.navigate('#/dashboard');
  });

  Router.setNotFound(async () => {
    const state = AppState.getState();
    if (state.isAuthenticated) {
      Router.navigate('#/dashboard');
    } else {
      Router.navigate('#/login');
    }
  });

  // ── Handle session expiry events ──────────────────────────────────────────
  window.addEventListener('session:expired', async () => {
    console.warn('[App] Session expired — redirecting to login');
    NavbarComponent.hide();
    AppState.reset();
    API.clearToken();
    Router.navigate('#/login');
    Alerts.warning('Your session has expired. Please log in again.');
  });

  // ── State observer: react to auth changes ─────────────────────────────────
  AppState.subscribe((state, prev) => {
    // Log state transitions
    if (state.isAuthenticated !== prev.isAuthenticated) {
      console.log('[App] Auth state changed:', state.isAuthenticated);
    }
  });

  // ── Boot: validate existing session ──────────────────────────────────────
  await _boot();

  console.log('[App] LMS Portal ready');
})();

/**
 * Boot sequence:
 * 1. Check for existing session token
 * 2. If found → validate → navigate to dashboard
 * 3. If not found → show login page
 * Requirements: 3.1, 9.1
 */
async function _boot() {
  const token = API.getToken();

  if (!token) {
    console.log('[App] No token — showing login');
    await Router.navigate('#/login');
    return;
  }

  // Show sleek branded preloader while validating
  if (window.LoadingBar) window.LoadingBar.start();
  const viewContainer = document.getElementById('view-container');
  if (viewContainer) {
    viewContainer.innerHTML = `
      <div class="d-flex flex-column align-items-center justify-content-center" style="min-height:75vh" aria-label="Loading application">
        <div class="brand-icon mb-3" style="width:52px;height:52px;font-size:1.5rem">
          <i class="bi bi-mortarboard-fill text-white"></i>
        </div>
        <div class="spinner-border text-primary mb-2" role="status" style="width:2rem;height:2rem"></div>
        <p class="text-muted small">Loading LMS Portal…</p>
      </div>
    `;
  }

  console.log('[App] Validating existing session...');
  try {
    const result = await AuthService.validateSession();

    if (result.authenticated) {
      console.log('[App] Session valid — navigating to dashboard');
      NavbarComponent.show(result.user);
      await Router.navigate('#/dashboard');
    } else {
      console.log('[App] Session invalid — showing login');
      await Router.navigate('#/login');
    }
  } catch (err) {
    console.warn('[App] Session validation error:', err.message);
    await Router.navigate('#/login');
  } finally {
    if (window.LoadingBar) window.LoadingBar.finish();
  }
}
