/**
 * API Client
 * Fetch wrapper with Bearer token injection, retries, and error handling
 * Requirements: 9.3, 11.1, 18.1, 18.2
 */
const API = (() => {
  const BASE_URL = '';
  const TIMEOUT_MS = 10000;
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff

  function getToken() {
    return sessionStorage.getItem('sessionToken');
  }

  function setToken(token) {
    sessionStorage.setItem('sessionToken', token);
  }

  function clearToken() {
    sessionStorage.removeItem('sessionToken');
  }

  /**
   * Make an authenticated fetch with timeout, retries, and error handling
   * Requirements: 18.1 (retry), 10.9 (Bearer token)
   */
  async function request(path, options = {}, retryCount = 0) {
    const token = getToken();
    const url = BASE_URL + path;

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Inject Bearer token (Requirement 10.9)
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Don't set Content-Type for FormData (multipart)
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    // Timeout via AbortController
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Handle 401 — session expired (Requirement 18.4)
      if (response.status === 401) {
        const data = await response.json().catch(() => ({}));
        if (data.expired) {
          // Attempt token refresh (handled by caller via event)
          window.dispatchEvent(new CustomEvent('session:expired'));
        }
        throw new APIError('Your session has expired. Please log in again.', 401);
      }

      // Handle 503 — LMS unavailable (Requirement 11.2)
      if (response.status === 503) {
        throw new APIError('Learning Management System is currently unavailable. Please try again in a few minutes.', 503);
      }

      // Handle other error statuses
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const msg = data.error || `Request failed with status ${response.status}`;
        throw new APIError(msg, response.status);
      }

      return await response.json();

    } catch (err) {
      clearTimeout(timeout);

      // Don't retry on auth errors
      if (err instanceof APIError && (err.status === 401 || err.status === 400)) {
        throw err;
      }

      // Network error or timeout → retry with backoff (Requirement 18.1)
      if (retryCount < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[retryCount] || 4000;
        await sleep(delay);
        return request(path, options, retryCount + 1);
      }

      // Max retries exhausted (Requirement 18.2)
      if (err.name === 'AbortError') {
        throw new APIError('Request timed out. Please check your connection.', 408);
      }

      if (err instanceof APIError) throw err;
      throw new APIError('Network error. Please check your connection.', 0);
    }
  }

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  const get = (path, opts = {}) => request(path, { ...opts, method: 'GET' });

  const post = (path, body, opts = {}) => request(path, {
    ...opts,
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
  });

  class APIError extends Error {
    constructor(message, status) {
      super(message);
      this.name = 'APIError';
      this.status = status;
    }
  }

  return { get, post, getToken, setToken, clearToken, APIError };
})();

window.API = API;
