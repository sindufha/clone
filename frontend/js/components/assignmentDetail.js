/**
 * Assignment Detail Component
 * Information and status overview view with Bootstrap layout and icons
 * (Assignment submission is managed on the original LMS)
 */
const AssignmentDetailComponent = (() => {

  async function render(params) {
    const { id } = params;
    const viewContainer = document.getElementById('view-container');
    if (!viewContainer) return;

    viewContainer.innerHTML = `
      <div class="detail-page">
        <button class="btn btn-outline-secondary btn-sm mb-4" id="back-btn" aria-label="Go back to dashboard">
          <i class="bi bi-arrow-left me-1"></i> Back to Dashboard
        </button>
        <div class="page-spinner" id="detail-loading" aria-live="polite" aria-label="Loading assignment">
          <div class="spinner"></div>
        </div>
        <div id="detail-content" class="hidden"></div>
      </div>
    `;

    document.getElementById('back-btn')?.addEventListener('click', () => Router.navigate('#/dashboard'));

    try {
      if (window.LoadingBar) window.LoadingBar.start();
      const assignment = await AssignmentService.getAssignmentById(id);
      _renderDetail(assignment);
    } catch (err) {
      document.getElementById('detail-loading')?.remove();
      DOM.setHTML(document.getElementById('detail-content'), `
        <div class="empty-state">
          <div class="empty-icon text-danger">
            <i class="bi bi-exclamation-triangle" style="font-size:2rem"></i>
          </div>
          <h3>Failed to Load Assignment</h3>
          <p class="text-muted small">${_esc(err.message) || 'Please try again.'}</p>
          <button class="btn btn-primary btn-sm" id="error-back-btn">
            <i class="bi bi-arrow-left me-1"></i> Go Back
          </button>
        </div>
      `);
      document.getElementById('error-back-btn')?.addEventListener('click', () => Router.navigate('#/dashboard'));
      document.getElementById('detail-content')?.classList.remove('hidden');
    } finally {
      if (window.LoadingBar) window.LoadingBar.finish();
    }
  }

  function _renderDetail(assignment) {
    document.getElementById('detail-loading')?.classList.add('hidden');
    const container = document.getElementById('detail-content');
    if (!container) return;

    const isSubmitted = assignment.submissionStatus === 'submitted';
    const isOverdue = !isSubmitted && (assignment.isOverdue || assignment.submissionStatus === 'overdue');
    const sub = Format.submissionStatus(isOverdue ? 'overdue' : assignment.submissionStatus);
    const grade = Format.gradingStatus(assignment.gradingStatus);
    const countdown = isSubmitted ? null : Format.countdown(assignment.dueDate);

    container.innerHTML = `
      <header class="detail-header mb-4">
        <div class="card-badges mb-3 d-flex flex-wrap gap-2">
          <span class="badge ${sub.cls}" aria-label="Submission status: ${sub.label}">
            <span aria-hidden="true">${sub.icon}</span> ${sub.label}
          </span>
          ${isSubmitted ? `
          <span class="badge bg-success-subtle text-success border border-success-subtle fw-semibold">
            <i class="bi bi-check-circle-fill me-1"></i>Finished
          </span>
          ` : ''}
          <span class="badge ${grade.cls}" aria-label="Grading status: ${grade.label}">
            ${grade.label}
          </span>
          ${isOverdue ? `<span class="badge badge-overdue"><i class="bi bi-exclamation-triangle-fill me-1"></i>${assignment.overdueInfo || 'Past Due'}</span>` : ''}
        </div>

        <h1 class="detail-title h3 fw-bold mb-2">${_esc(assignment.title)}</h1>

        <div class="card-course text-muted mb-3 d-flex align-items-center gap-2">
          <i class="bi bi-book-half text-primary fs-5"></i>
          <span class="fw-semibold">${_esc(assignment.course)}</span>
        </div>

        <div class="detail-meta pt-3 border-top d-flex flex-wrap gap-4 text-muted small">
          <div class="detail-meta-item d-flex align-items-center gap-2">
            <i class="bi bi-calendar-event text-primary"></i>
            <span><strong>Due:</strong> ${Format.date(assignment.dueDate) || 'No due date'}</span>
          </div>

          ${isSubmitted ? `
          <div class="detail-meta-item d-flex align-items-center gap-2">
            <i class="bi bi-check-circle-fill text-success"></i>
            <span class="text-success fw-semibold">Finished (Submitted)</span>
          </div>
          ` : countdown ? `
          <div class="detail-meta-item d-flex align-items-center gap-2">
            <i class="bi bi-hourglass-split text-warning"></i>
            <span><strong>Remaining:</strong> ${countdown}</span>
          </div>
          ` : ''}

          ${assignment.points ? `
          <div class="detail-meta-item d-flex align-items-center gap-2">
            <i class="bi bi-trophy text-warning"></i>
            <span><strong>Points:</strong> ${assignment.points}</span>
          </div>
          ` : ''}

          <div class="detail-meta-item d-flex align-items-center gap-2">
            <i class="bi bi-file-earmark-code text-info"></i>
            <span><strong>ID:</strong> #${assignment.id}</span>
          </div>
        </div>
      </header>

      <!-- Description / Instructions -->
      ${assignment.fullDescription || assignment.description ? `
      <section class="detail-section mb-4" aria-label="Assignment description">
        <h2 class="detail-section-title h5 fw-bold mb-3 d-flex align-items-center gap-2">
          <i class="bi bi-card-text text-primary"></i> Instructions & Description
        </h2>
        <div class="detail-description p-3 rounded bg-light border" style="font-size:0.9rem;line-height:1.7;white-space:pre-wrap;color:#334155">${_esc(assignment.fullDescription || assignment.description)}</div>
      </section>
      ` : ''}

      <!-- Status & LMS Portal Action -->
      <section class="detail-section" aria-label="Assignment status and LMS action">
        <h2 class="detail-section-title h5 fw-bold mb-3 d-flex align-items-center gap-2">
          <i class="bi bi-box-arrow-up-right text-primary"></i> Academic LMS Portal
        </h2>
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-3 py-2">
          <div>
            <p class="fw-semibold mb-1">
              Submission Status: <span class="badge ${sub.cls}">${sub.label}</span>
            </p>
            <p class="text-muted small mb-0">
              Submit your files and review official grading criteria on the ITM Nganjuk Moodle portal.
            </p>
          </div>

          <div class="d-flex align-items-center gap-2 flex-wrap">
            <button id="bottom-back-btn" class="btn btn-outline-secondary btn-sm" aria-label="Back to dashboard">
              <i class="bi bi-arrow-left me-1"></i> Back to Dashboard
            </button>

            ${assignment.url ? `
            <a href="${_esc(assignment.url)}" target="_blank" rel="noopener noreferrer"
               id="open-lms-btn" class="btn btn-primary btn-sm" aria-label="Open assignment in original LMS">
              <i class="bi bi-box-arrow-up-right me-1"></i> Open in LMS
            </a>
            ` : ''}
          </div>
        </div>
      </section>
    `;

    container.classList.remove('hidden');

    // Wire bottom back button
    document.getElementById('bottom-back-btn')?.addEventListener('click', () => {
      Router.navigate('#/dashboard');
    });
  }

  function _esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { render };
})();

window.AssignmentDetailComponent = AssignmentDetailComponent;
