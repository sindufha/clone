/**
 * Assignment List Component
 * Renders assignment cards in a grid with status badges and Bootstrap Icons
 * Requirements: 4.2, 4.4, 4.7, 4.8
 */
const AssignmentListComponent = (() => {

  /**
   * Render assignment grid
   * @param {Array} assignments
   * @param {HTMLElement} container
   */
  function render(assignments, container) {
    if (!container) return;

    if (!assignments || assignments.length === 0) {
      container.innerHTML = _emptyState();
      return;
    }

    container.innerHTML = assignments.map(a => _cardHTML(a)).join('');

    // Bind click events
    container.querySelectorAll('.assignment-card').forEach(card => {
      const id = card.dataset.id;
      card.addEventListener('click', () => {
        Router.navigate(`#/assignments/${id}`);
      });
      // Keyboard accessibility
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          Router.navigate(`#/assignments/${id}`);
        }
      });
    });
  }

  /**
   * Render smooth skeleton loading placeholders
   * Requirements: 4.3, 9.2
   */
  function renderSkeleton(container, count = 6) {
    if (!container) return;
    container.innerHTML = Array(count).fill(_skeletonCard()).join('');
  }

  function _cardHTML(assignment) {
    const isSubmitted = assignment.submissionStatus === 'submitted';
    const isOverdue = !isSubmitted && (assignment.isOverdue || assignment.submissionStatus === 'overdue');
    const sub   = Format.submissionStatus(isOverdue ? 'overdue' : assignment.submissionStatus);
    const grade = Format.gradingStatus(assignment.gradingStatus);
    const cardCls = Format.cardStatusClass(assignment);
    const dueCls  = Format.countdownClass(assignment.dueDate, isSubmitted);
    const countdown = Format.countdown(assignment.dueDate, isSubmitted);

    return `
      <article
        class="assignment-card ${cardCls}"
        data-id="${assignment.id}"
        tabindex="0"
        role="button"
        aria-label="Assignment: ${assignment.title}. Status: ${isSubmitted ? 'Finished' : sub.label}. Click to view details."
      >
        <div class="card-header">
          <div>
            <h3 class="card-title">${_esc(assignment.title)}</h3>
            <div class="card-course">
              <i class="bi bi-book me-1 text-primary"></i>
              ${_esc(assignment.course)}
            </div>
          </div>
        </div>

        <div class="card-meta">
          ${isSubmitted ? `
            <div class="card-due finished" aria-label="Finished assignment">
              <i class="bi bi-check-circle-fill text-success"></i>
              <span class="text-success fw-semibold">Finished</span>
              ${assignment.dueDate ? `<span class="text-muted ms-1">· Due ${Format.date(assignment.dueDate)}</span>` : ''}
            </div>
          ` : countdown ? `
            <div class="card-due ${dueCls}" aria-label="Due: ${Format.date(assignment.dueDate)}">
              <i class="bi bi-clock me-1"></i>
              ${countdown}
            </div>
          ` : assignment.dueDate ? `
            <div class="card-due" aria-label="Due: ${Format.date(assignment.dueDate)}">
              <i class="bi bi-calendar-event me-1"></i>
              ${Format.date(assignment.dueDate)}
            </div>
          ` : `
            <div class="card-due text-muted">No due date</div>
          `}

          <div class="card-badges">
            <span class="badge ${sub.cls}" aria-label="Submission: ${sub.label}">
              <span aria-hidden="true">${sub.icon}</span> ${sub.label}
            </span>
            <span class="badge ${grade.cls}" aria-label="Grading: ${grade.label}">
              ${grade.label}
            </span>
          </div>
        </div>
      </article>
    `;
  }

  function _skeletonCard() {
    return `
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton skeleton-line w-80" style="height:18px"></div>
        <div class="skeleton skeleton-line w-60" style="height:12px;margin-top:var(--sp-2)"></div>
        <div style="margin-top:auto;display:flex;flex-direction:column;gap:var(--sp-2)">
          <div class="skeleton skeleton-line w-40" style="height:12px"></div>
          <div style="display:flex;gap:var(--sp-2);margin-top:var(--sp-1)">
            <div class="skeleton skeleton-badge" style="height:22px;width:75px"></div>
            <div class="skeleton skeleton-badge" style="height:22px;width:75px"></div>
          </div>
        </div>
      </div>
    `;
  }

  function _emptyState() {
    return `
      <div class="empty-state" role="status" aria-live="polite" style="grid-column: 1 / -1">
        <div class="empty-icon" aria-hidden="true">
          <i class="bi bi-inbox" style="font-size:2rem"></i>
        </div>
        <h3 class="h5 fw-bold">No Assignments Found</h3>
        <p class="text-muted small">No assignments match the selected filters. Try clearing your filters or check other courses.</p>
        <button class="btn btn-outline-primary btn-sm" onclick="DashboardComponent.clearFilters()" aria-label="Clear all filters">
          <i class="bi bi-x-circle me-1"></i>Clear Filters
        </button>
      </div>
    `;
  }

  function _esc(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { render, renderSkeleton };
})();

window.AssignmentListComponent = AssignmentListComponent;
