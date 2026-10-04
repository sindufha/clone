/**
 * Auth Service
 * Login, logout, session validation, token storage
 * Requirements: 1.4, 1.5, 3.1-3.4, 10.9
 */
const AuthService = (() => {
  let _refreshAttempted = false; // prevent infinite refresh loop (Requirement 3.6)

  /**
   * Login with NIM and password
   * Requirements: 1.1, 1.4, 1.5
   */
  async function login(nim, password) {
    const data = await API.post('/api/auth/login', { nim, password });

    if (data.success && data.sessionToken) {
      // Store token in sessionStorage only (Requirement 1.5)
      API.setToken(data.sessionToken);
      _refreshAttempted = false;

      AppState.setState({
        isAuthenticated: true,
        currentUser: data.user,
      });

      return data;
    }

    throw new Error(data.error || 'Login failed');
  }

  /**
   * Logout — clear server session and local state
   * Requirements: 19.1, 19.4
   */
  async function logout() {
    try {
      await API.post('/api/auth/logout', {});
    } catch (err) {
      // Logout locally even if server call fails
      console.warn('[AuthService] Logout server call failed:', err.message);
    } finally {
      API.clearToken();
      AppState.reset();
    }
  }

  /**
   * Validate existing session
   * Requirements: 3.1, 3.2, 3.3
   */
  async function validateSession() {
    const token = API.getToken();
    if (!token) return { authenticated: false };

    try {
      const data = await API.get('/api/auth/validate');

      if (data.valid) {
        _refreshAttempted = false;
        AppState.setState({
          isAuthenticated: true,
          currentUser: data.user,
        });
        return { authenticated: true, user: data.user };
      }

      // Expired → attempt refresh (Requirement 3.3)
      if (!_refreshAttempted) {
        return await refreshSession();
      }

      return { authenticated: false };
    } catch (err) {
      if (err.status === 401) {
        // Try refresh once (Requirement 3.6 — prevent infinite loops)
        if (!_refreshAttempted) return await refreshSession();
        API.clearToken();
        AppState.reset();
        return { authenticated: false };
      }
      throw err;
    }
  }

  /**
   * Refresh session token
   * Requirements: 3.4, 3.5
   */
  async function refreshSession() {
    _refreshAttempted = true;
    try {
      const data = await API.post('/api/auth/refresh', {});
      if (data.success && data.sessionToken) {
        API.setToken(data.sessionToken);
        return await validateSession();
      }
      API.clearToken();
      AppState.reset();
      return { authenticated: false };
    } catch (err) {
      API.clearToken();
      AppState.reset();
      return { authenticated: false };
    }
  }

  return { login, logout, validateSession, refreshSession };
})();

window.AuthService = AuthService;
