/**
 * Course List Component
 * Renders enrolled course cards with direct filter navigation and Bootstrap Icons
 */
const CourseListComponent = (() => {
  async function render(container) {
    if (!container) return;

    container.innerHTML = `<div class="page-spinner"><div class="spinner"></div></div>`;

    try {
      if (window.LoadingBar) window.LoadingBar.start();
      const courses = await CourseService.getCourses();

      if (!courses.length) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">
              <i class="bi bi-inbox" style="font-size:2rem"></i>
            </div>
            <h3 class="h5 fw-bold">No Courses Found</h3>
            <p class="text-muted small">You don't appear to be enrolled in any courses.</p>
          </div>`;
        return;
      }

      container.innerHTML = `
        <div class="assignment-grid">
          ${courses.map(c => `
            <div class="assignment-card course-card"
                 data-course-id="${c.id}"
                 tabindex="0"
                 role="button"
                 aria-label="Course: ${_esc(c.name)}. Click to view assignments.">
              <div class="card-header">
                <div>
                  <div class="user-avatar" style="width:48px;height:48px;font-size:1rem;margin-bottom:var(--sp-3)">
                    ${Format.courseInitials(c.name)}
                  </div>
                  <h3 class="card-title">${_esc(c.name)}</h3>
                  ${c.instructor ? `
                  <div class="card-course text-muted small d-flex align-items-center gap-1">
                    <i class="bi bi-person text-primary"></i>
                    <span>${_esc(c.instructor)}</span>
                  </div>` : ''}
                </div>
              </div>
              <div class="card-footer" style="margin-top:var(--sp-4);padding-top:var(--sp-3);border-top:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between">
                <span class="badge bg-light text-muted border">${c.code ? `Code: ${_esc(c.code)}` : 'Active'}</span>
                <span class="text-primary fw-semibold small d-inline-flex align-items-center gap-1">
                  View Assignments <i class="bi bi-arrow-right"></i>
                </span>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      // Bind click and keyboard handlers
      container.querySelectorAll('.course-card').forEach(card => {
        const select = () => {
          const courseId = card.dataset.courseId;
          Router.navigate(`#/courses/${courseId}`);
        };

        card.addEventListener('click', select);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            select();
          }
        });
      });

    } catch (err) {
      container.innerHTML = `<p class="text-muted small">Failed to load courses: ${_esc(err.message)}</p>`;
    } finally {
      if (window.LoadingBar) window.LoadingBar.finish();
    }
  }

  function _esc(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render };
})();

window.CourseListComponent = CourseListComponent;
