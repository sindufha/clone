/**
 * Login Component
 * Requirements: 1.1, 11.6, 12.4
 * Enhanced with Bootstrap Icons and smooth button state transitions
 */
const LoginComponent = (() => {

  function render() {
    const viewContainer = document.getElementById('view-container');
    if (!viewContainer) return;

    viewContainer.innerHTML = `
      <section class="login-page" aria-label="Login to LMS">
        <div class="login-bg" aria-hidden="true">
          <div class="login-bg-orb login-bg-orb-1"></div>
          <div class="login-bg-orb login-bg-orb-2"></div>
          <div class="login-bg-orb login-bg-orb-3"></div>
        </div>

        <div class="login-card">
          <header class="login-header">
            <div class="login-logo" aria-hidden="true">
              <i class="bi bi-mortarboard-fill text-primary" style="font-size:2rem"></i>
            </div>
            <h1 class="login-title">Welcome Back</h1>
            <p class="login-subtitle">Sign in to your LMS Portal</p>
          </header>

          <form id="login-form" class="login-form" novalidate aria-label="Login form">
            <div id="login-alert" class="login-alert hidden" role="alert" aria-live="assertive">
              <i class="bi bi-exclamation-circle-fill fs-5" aria-hidden="true"></i>
              <span id="login-alert-text"></span>
            </div>

            <div class="form-group">
              <label for="nim-input" class="form-label">
                Student ID (NIM) <span class="required" aria-hidden="true">*</span>
              </label>
              <div class="input-wrapper">
                <span class="input-icon" aria-hidden="true">
                  <i class="bi bi-person fs-5"></i>
                </span>
                <input
                  id="nim-input"
                  type="text"
                  class="form-input has-icon"
                  placeholder="Enter your NIM (e.g. 202457201062)"
                  autocomplete="username"
                  required
                  aria-required="true"
                  aria-describedby="nim-error"
                />
              </div>
              <p id="nim-error" class="form-error" aria-live="polite"></p>
            </div>

            <div class="form-group">
              <label for="password-input" class="form-label">
                Password <span class="required" aria-hidden="true">*</span>
              </label>
              <div class="input-wrapper">
                <span class="input-icon" aria-hidden="true">
                  <i class="bi bi-lock fs-5"></i>
                </span>
                <input
                  id="password-input"
                  type="password"
                  class="form-input has-icon has-action"
                  placeholder="Enter your password"
                  autocomplete="current-password"
                  required
                  aria-required="true"
                  aria-describedby="password-error"
                />
                <button type="button" class="input-action" id="toggle-password" aria-label="Toggle password visibility">
                  <i id="eye-icon" class="bi bi-eye fs-5"></i>
                </button>
              </div>
              <p id="password-error" class="form-error" aria-live="polite"></p>
            </div>

            <button
              type="submit"
              id="login-submit"
              class="btn btn-primary btn-full btn-lg login-submit-btn"
              aria-label="Sign in to your account"
            >
              <span id="login-submit-spinner" class="login-spinner hidden" aria-hidden="true"></span>
              <span id="login-submit-text">Sign In</span>
              <i id="login-submit-icon" class="bi bi-arrow-right" aria-hidden="true"></i>
            </button>
          </form>

          <footer class="login-footer">
            <p class="small text-white-50 mb-0">Academic portal for students of ITM Nganjuk</p>
          </footer>
        </div>
      </section>
    `;

    _bindEvents();
  }

  function _bindEvents() {
    const form      = document.getElementById('login-form');
    const nimInput  = document.getElementById('nim-input');
    const pwInput   = document.getElementById('password-input');
    const toggleBtn = document.getElementById('toggle-password');
    const submitBtn = document.getElementById('login-submit');

    // Password visibility toggle
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const isHidden = pwInput.type === 'password';
        pwInput.type = isHidden ? 'text' : 'password';
        toggleBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
        const eye = document.getElementById('eye-icon');
        if (eye) {
          eye.className = isHidden ? 'bi bi-eye-slash fs-5' : 'bi bi-eye fs-5';
        }
      });
    }

    // Clear field errors on input
    nimInput?.addEventListener('input', () => _clearError('nim-input', 'nim-error'));
    pwInput?.addEventListener('input', () => _clearError('password-input', 'password-error'));

    // Form submission
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await _handleSubmit(nimInput, pwInput, submitBtn);
    });

    // Auto-focus NIM
    nimInput?.focus();
  }

  async function _handleSubmit(nimInput, pwInput, submitBtn) {
    const nim = nimInput?.value?.trim();
    const password = pwInput?.value;

    let hasError = false;

    const nimErr = Validation.nim(nim);
    if (nimErr) { _showError('nim-input', 'nim-error', nimErr); hasError = true; }

    const pwErr = Validation.password(password);
    if (pwErr)  { _showError('password-input', 'password-error', pwErr); hasError = true; }

    if (hasError) return;

    // Loading state
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    const spinner = document.getElementById('login-submit-spinner');
    const text = document.getElementById('login-submit-text');
    const icon = document.getElementById('login-submit-icon');
    if (spinner) spinner.classList.remove('hidden');
    if (text) text.textContent = 'Signing in…';
    if (icon) icon.classList.add('hidden');
    _hideAlert();

    if (window.LoadingBar) window.LoadingBar.start();

    let isSuccess = false;
    try {
      await AuthService.login(nim, password);
      isSuccess = true;
      if (text) text.textContent = 'Signing in…';
      await Router.navigate('#/dashboard');
    } catch (err) {
      _showAlert(err.message || 'Invalid credentials. Please try again.');
    } finally {
      if (!isSuccess) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
        if (spinner) spinner.classList.add('hidden');
        if (text) text.textContent = 'Sign In';
        if (icon) icon.classList.remove('hidden');
        if (window.LoadingBar) window.LoadingBar.finish();
      }
    }
  }

  function _showError(inputId, errorId, message) {
    document.getElementById(inputId)?.classList.add('error');
    const errEl = document.getElementById(errorId);
    if (errEl) { errEl.textContent = message; errEl.style.display = 'flex'; }
  }

  function _clearError(inputId, errorId) {
    document.getElementById(inputId)?.classList.remove('error');
    const errEl = document.getElementById(errorId);
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
  }

  function _showAlert(message) {
    const alert = document.getElementById('login-alert');
    const text  = document.getElementById('login-alert-text');
    if (alert && text) {
      text.textContent = message;
      alert.classList.remove('hidden');
      alert.focus();
    }
  }

  function _hideAlert() {
    document.getElementById('login-alert')?.classList.add('hidden');
  }

  return { render };
})();

window.LoginComponent = LoginComponent;
