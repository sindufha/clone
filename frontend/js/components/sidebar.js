/**
 * Sidebar Component
 * Course list in sidebar with collapsible panel
 * Requirements: 7.1, 8.5, 8.8
 */
const SidebarComponent = (() => {
  let _courses = [];
  let _activeId = 'all';

  async function load() {
    const container = document.getElementById('sidebar-courses');
    if (!container) return;

    container.innerHTML = `<div class="course-item"><div class="skeleton skeleton-line w-80"></div></div>`.repeat(4);

    try {
      _courses = await CourseService.getCourses();
      render(_courses, _activeId);
    } catch (err) {
      container.innerHTML = `<p class="text-muted" style="padding:var(--sp-3);font-size:var(--font-size-xs);">Failed to load courses</p>`;
    }
  }

  function render(courses, activeId = 'all') {
    const container = document.getElementById('sidebar-courses');
    if (!container) return;

    const items = [
      // "All Courses" item
      _courseItemHTML({ id: 'all', name: 'All Courses', code: '', instructor: '' }, activeId === 'all'),
      ...courses.map(c => _courseItemHTML(c, c.id === activeId)),
    ];

    container.innerHTML = items.join('');

    // Bind click and keyboard events
    container.querySelectorAll('.course-item').forEach(el => {
      const selectCourse = () => {
        const id = el.dataset.courseId;
        setActive(id);
        AppState.setState({ pendingCourseFilter: id });

        // If not on dashboard, navigate to dashboard
        if (Router.getCurrent() !== '#/dashboard') {
          Router.navigate('#/dashboard');
        } else {
          window.dispatchEvent(new CustomEvent('course:filter', { detail: { courseId: id } }));
        }

        // Close sidebar on mobile/tablet
        if (window.innerWidth < 1024) close();
      };

      el.addEventListener('click', selectCourse);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectCourse();
        }
      });
    });
  }

  function _courseItemHTML(course, isActive) {
    const initials = course.id === 'all'
      ? `<i class="bi bi-collection-fill" style="font-size:16px"></i>`
      : Format.courseInitials(course.name);

    return `
      <div class="course-item ${isActive ? 'active' : ''}" data-course-id="${course.id}"
           role="button" tabindex="0"
           aria-label="Filter by ${course.name}" aria-pressed="${isActive}">
        <div class="course-avatar">${initials}</div>
        <div class="course-info">
          <div class="course-name">${course.name}</div>
          ${course.instructor && course.instructor !== 'Unknown Instructor'
            ? `<div class="course-count">${course.instructor}</div>` : ''}
        </div>
      </div>
    `;
  }

  function setActive(courseId) {
    _activeId = courseId;
    render(_courses, _activeId);
  }

  function open() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar?.classList.add('open');
    overlay?.classList.remove('hidden');
    overlay?.classList.add('open');
  }

  function close() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar?.classList.remove('open');
    overlay?.classList.remove('open');
    overlay?.classList.add('hidden');
  }

  function toggle() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar?.classList.contains('open')) close();
    else open();
  }

  return { load, render, setActive, open, close, toggle };
})();

window.SidebarComponent = SidebarComponent;
