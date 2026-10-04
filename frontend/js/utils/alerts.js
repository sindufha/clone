/**
 * Alert / Toast Notification System
 * Requirements: 11.1, 11.2, 11.3
 */
const Alerts = (() => {
  let container = null;

  function getContainer() {
    if (!container) container = document.getElementById('toast-container');
    return container;
  }

  const ICONS = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };

  /**
   * Show a toast notification
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {number} duration - ms before auto-dismiss (0 = no auto-dismiss)
   */
  function showToast(message, type = 'info', duration = 5000) {
    const c = getContainer();
    if (!c) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <span class="toast-icon">${ICONS[type] || ICONS.info}</span>
      <span class="toast-msg">${message}</span>
      <button class="toast-close" aria-label="Dismiss notification">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    const dismiss = () => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 350);
    };

    toast.querySelector('.toast-close').addEventListener('click', dismiss);

    c.appendChild(toast);

    if (duration > 0) setTimeout(dismiss, duration);
    return dismiss;
  }

  const success = (msg, dur) => showToast(msg, 'success', dur);
  const error   = (msg, dur) => showToast(msg, 'error', dur || 7000);
  const warning = (msg, dur) => showToast(msg, 'warning', dur);
  const info    = (msg, dur) => showToast(msg, 'info', dur);

  /**
   * Show inline field error message
   */
  function showFieldError(fieldEl, message) {
    if (!fieldEl) return;
    fieldEl.classList.add('error');
    let errEl = fieldEl.parentElement?.nextElementSibling;
    if (!errEl || !errEl.classList.contains('form-error')) {
      errEl = document.createElement('p');
      errEl.className = 'form-error';
      fieldEl.closest('.input-wrapper, .form-group')?.after(errEl) ||
        fieldEl.after(errEl);
    }
    errEl.textContent = message;
    errEl.style.display = 'flex';
  }

  function clearFieldError(fieldEl) {
    if (!fieldEl) return;
    fieldEl.classList.remove('error');
    let errEl = fieldEl.parentElement?.nextElementSibling;
    if (errEl?.classList.contains('form-error')) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }
  }

  return { showToast, success, error, warning, info, showFieldError, clearFieldError };
})();

window.Alerts = Alerts;
