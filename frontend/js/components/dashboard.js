/**
 * Dashboard Component
 * Main view with Bootstrap 5 layout, Chart.js analytics, filter bar, stats, and assignment grid
 * Requirements: 4.1-4.8, 5.1-5.8
 */
const DashboardComponent = (() => {
  let _assignments = [];
  let _courses = [];
  let _searchQuery = '';
  let _filters = { course: 'all', status: 'all', sortBy: 'dueDate', order: 'asc' };
  let _courseFilterListener = null;
  let _chartInstance = null;

  function _isObsoleteOverdue(a) {
    if (!a || a.submissionStatus === 'submitted') return false;
    if (a.overdueInfo) {
      const match = a.overdueInfo.match(/(\d+)\s*days?/i);
      if (match && parseInt(match[1], 10) > 50) return true;
    }
    if (a.dueDate) {
      const diff = Date.now() - new Date(a.dueDate).getTime();
      if (diff > 0 && Math.floor(diff / (1000 * 60 * 60 * 24)) > 50) return true;
    }
    return false;
  }

  async function render() {
    const viewContainer = document.getElementById('view-container');
    if (!viewContainer) return;

    const state = AppState.getState();
    const user = state.currentUser;

    viewContainer.innerHTML = `
      <div class="dashboard container-fluid p-0">
        <!-- Header & Analytics -->
        <div class="dashboard-header mb-4">
          <div class="row g-3 align-items-center mb-3">
            <div class="col-lg-7 col-12">
              <div class="welcome-text">
                <h1 class="h2 fw-bold text-gradient mb-1">
                  Hello, <span id="welcome-name">${_esc(user?.name || user?.nim || 'Student')}</span> 👋
                </h1>
                <p class="text-muted small mb-0" id="welcome-nim">
                  <span class="badge bg-light text-dark border me-2">NIM: ${_esc(user?.nim || '—')}</span>
                  <i class="bi bi-calendar3 me-1"></i><span id="welcome-date"></span>
                </p>
              </div>
            </div>

            <!-- Chart.js Completion Analytics Card -->
            <div class="col-lg-5 col-12">
              <div class="chart-widget-card" id="analytics-card">
                <div class="chart-canvas-wrapper">
                  <canvas id="assignment-chart"></canvas>
                  <div class="chart-center-text">
                    <span class="chart-center-percent" id="chart-percent">0%</span>
                    <span class="chart-center-label">Done</span>
                  </div>
                </div>
                <div class="chart-legend">
                  <div class="chart-legend-item">
                    <span class="chart-legend-label">
                      <span class="chart-legend-dot" style="background:#10b981"></span> Submitted
                    </span>
                    <strong id="legend-submitted">—</strong>
                  </div>
                  <div class="chart-legend-item">
                    <span class="chart-legend-label">
                      <span class="chart-legend-dot" style="background:#ef4444"></span> Overdue
                    </span>
                    <strong id="legend-overdue">—</strong>
                  </div>
                  <div class="chart-legend-item">
                    <span class="chart-legend-label">
                      <span class="chart-legend-dot" style="background:#f59e0b"></span> Pending
                    </span>
                    <strong id="legend-pending">—</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Filter Stat Chips -->
          <div class="dashboard-stats d-flex flex-wrap gap-2" id="dashboard-stats" aria-label="Assignment statistics filter buttons">
            <button type="button" id="chip-total" class="stat-chip chip-total active" aria-label="Show all assignments">
              <i class="bi bi-stack"></i>
              <span id="stat-total">—</span> Total
            </button>
            <button type="button" id="chip-pending" class="stat-chip chip-pending" aria-label="Show pending assignments">
              <i class="bi bi-hourglass-split"></i>
              <span id="stat-pending">—</span> Pending
            </button>
            <button type="button" id="chip-done" class="stat-chip chip-done" aria-label="Show submitted assignments">
              <i class="bi bi-check2-circle"></i>
              <span id="stat-done">—</span> Submitted
            </button>
            <button type="button" id="chip-overdue" class="stat-chip chip-overdue" aria-label="Show overdue assignments">
              <i class="bi bi-exclamation-octagon"></i>
              <span id="stat-overdue">—</span> Overdue
            </button>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="filter-bar" role="search" aria-label="Filter assignments">
          <!-- Top Row: Search Input & Action Buttons -->
          <div class="filter-bar-top">
            <div class="search-input-wrap">
              <i class="bi bi-search search-prefix-icon" aria-hidden="true"></i>
              <input type="search" id="filter-search" class="form-control filter-search-input"
                     placeholder="Search assignments by title or course..."
                     aria-label="Search assignments" />
            </div>
            <div class="filter-actions">
              <button id="clear-filters-btn" class="btn btn-outline-secondary btn-sm" aria-label="Clear all filters">
                <i class="bi bi-x-circle me-1"></i>Clear
              </button>
              <button id="refresh-btn" class="btn btn-primary btn-sm" aria-label="Refresh assignment list">
                <i class="bi bi-arrow-clockwise me-1"></i>Refresh
              </button>
            </div>
          </div>

          <!-- Controls Row: Filter Dropdowns -->
          <div class="filter-bar-controls">
            <div class="filter-control-item">
              <label for="filter-course" class="filter-control-label">
                <i class="bi bi-book"></i>Course:
              </label>
              <select id="filter-course" class="form-select form-select-sm filter-select" aria-label="Filter by course">
                <option value="all">All Courses</option>
              </select>
            </div>
            <div class="filter-control-item">
              <label for="filter-status" class="filter-control-label">
                <i class="bi bi-funnel"></i>Status:
              </label>
              <select id="filter-status" class="form-select form-select-sm filter-select" aria-label="Filter by status">
                <option value="all">All Status</option>
                <option value="not-submitted">Not Submitted</option>
                <option value="submitted">Submitted</option>
                <option value="overdue">Overdue</option>
                <option value="draft">Draft</option>
                <option value="graded">Graded</option>
                <option value="pending">Pending Grade</option>
              </select>
            </div>
            <div class="filter-control-item">
              <label for="filter-sort" class="filter-control-label">
                <i class="bi bi-sort-down"></i>Sort by:
              </label>
              <select id="filter-sort" class="form-select form-select-sm filter-select" aria-label="Sort assignments">
                <option value="dueDate">Due Date</option>
                <option value="title">Title</option>
                <option value="course">Course</option>
              </select>
            </div>
            <div class="filter-control-item">
              <label for="filter-order" class="filter-control-label">Order:</label>
              <select id="filter-order" class="form-select form-select-sm filter-select" aria-label="Sort order">
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Assignment Grid Section -->
        <div>
          <div class="d-flex align-items-center justify-content-between mb-3">
            <h2 class="section-title mb-0">
              Assignments <span class="section-count" id="section-count"></span>
            </h2>
          </div>
          <div id="assignment-grid" class="assignment-grid" aria-live="polite" aria-label="Assignment list">
            <!-- Skeleton rendered initially without layout shift -->
          </div>
        </div>
      </div>
    `;

    // Set welcome date
    DOM.setText(document.getElementById('welcome-date'), new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));

    _bindEvents();
    await _loadData();
  }

  async function _loadData(fresh = false) {
    const grid = document.getElementById('assignment-grid');
    if (!grid) return;

    // Show smooth skeleton only on first empty load
    if (!grid.children.length || fresh) {
      AssignmentListComponent.renderSkeleton(grid, 6);
    }

    try {
      if (window.LoadingBar) window.LoadingBar.start();

      // Check for pending course filter from navigation
      const pendingCourse = AppState.getState().pendingCourseFilter;
      if (pendingCourse) {
        AppState.setState({ pendingCourseFilter: null });
        _filters.course = pendingCourse === 'all' ? 'all' : pendingCourse;
      }

      // Load assignments and courses in parallel
      const [assignments, courses] = await Promise.all([
        AssignmentService.getAssignments(_filters),
        CourseService.getCourses(),
      ]);

      _assignments = assignments.filter(a => !_isObsoleteOverdue(a));
      _courses = courses;

      // Populate course filter dropdown
      _populateCourseFilter(courses);

      if (_filters.course !== 'all') {
        const matched = courses.find(c => c.id === _filters.course || c.name === _filters.course);
        if (matched) {
          _filters.course = matched.name;
          const select = document.getElementById('filter-course');
          if (select) select.value = matched.name;
          SidebarComponent.setActive(matched.id);
        }
      }

      // Render assignments and update analytics
      _renderFilteredGrid();
      _updateStats(_assignments);

      // Update sidebar
      SidebarComponent.load();

    } catch (err) {
      console.error('[Dashboard] Load error:', err);
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">
            <i class="bi bi-exclamation-triangle" style="font-size:2rem"></i>
          </div>
          <h3>Failed to Load Assignments</h3>
          <p>${_esc(err.message) || 'Please try again.'}</p>
          <button class="btn btn-primary" id="retry-load-btn" aria-label="Retry loading assignments">
            <i class="bi bi-arrow-repeat me-1"></i>Retry
          </button>
        </div>
      `;
      document.getElementById('retry-load-btn')?.addEventListener('click', () => refresh());
    } finally {
      if (window.LoadingBar) window.LoadingBar.finish();
    }
  }

  function _renderFilteredGrid() {
    let result = [..._assignments];

    // Apply live search query
    if (_searchQuery) {
      const q = _searchQuery.toLowerCase();
      result = result.filter(a =>
        (a.title && a.title.toLowerCase().includes(q)) ||
        (a.course && a.course.toLowerCase().includes(q))
      );
    }

    _renderGrid(result);
  }

  function _renderGrid(assignments) {
    const grid = document.getElementById('assignment-grid');
    if (!grid) return;
    AssignmentListComponent.render(assignments, grid);

    const count = document.getElementById('section-count');
    DOM.setText(count, `(${assignments.length})`);
    _updateChipActiveState();
  }

  function _updateStats(assignments) {
    const total   = assignments.length;
    const done    = assignments.filter(a => a.submissionStatus === 'submitted').length;
    const overdue = assignments.filter(a => a.submissionStatus !== 'submitted' && (a.isOverdue || a.submissionStatus === 'overdue')).length;
    const pending = assignments.filter(a => a.submissionStatus === 'not-submitted' && !a.isOverdue).length;

    DOM.setText(document.getElementById('stat-total'),   total);
    DOM.setText(document.getElementById('stat-pending'), pending);
    DOM.setText(document.getElementById('stat-done'),    done);
    DOM.setText(document.getElementById('stat-overdue'), overdue);

    DOM.setText(document.getElementById('legend-submitted'), done);
    DOM.setText(document.getElementById('legend-overdue'),   overdue);
    DOM.setText(document.getElementById('legend-pending'),   pending);

    // Update Chart.js donut chart smoothly
    _updateChart(total, done, overdue, pending);
  }

  function _updateChart(total, submitted, overdue, pending) {
    const canvas = document.getElementById('assignment-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const rate = total > 0 ? Math.round((submitted / total) * 100) : 0;
    DOM.setText(document.getElementById('chart-percent'), rate + '%');

    if (_chartInstance) {
      _chartInstance.data.datasets[0].data = [submitted, overdue, pending];
      _chartInstance.update('none');
      return;
    }

    _chartInstance = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Submitted', 'Overdue', 'Pending'],
        datasets: [{
          data: [submitted, overdue, pending],
          backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
          borderWidth: 3,
          borderColor: '#ffffff',
          hoverOffset: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '74%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.raw} assignments`
            }
          }
        },
        animation: {
          duration: 500,
        },
      }
    });
  }

  function _updateChipActiveState() {
    const currentStatus = _filters.status;
    document.getElementById('chip-total')?.classList.toggle('active', currentStatus === 'all');
    document.getElementById('chip-pending')?.classList.toggle('active', currentStatus === 'not-submitted');
    document.getElementById('chip-done')?.classList.toggle('active', currentStatus === 'submitted');
    document.getElementById('chip-overdue')?.classList.toggle('active', currentStatus === 'overdue');
  }

  function _populateCourseFilter(courses) {
    const select = document.getElementById('filter-course');
    if (!select) return;
    const currentVal = select.value || _filters.course;
    select.innerHTML = '<option value="all">All Courses</option>';
    courses.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      select.appendChild(opt);
    });
    if (currentVal && currentVal !== 'all') {
      const found = [...select.options].some(o => o.value === currentVal);
      if (found) select.value = currentVal;
    }
  }

  function _bindEvents() {
    // Stat chips: click to filter
    const chipMap = {
      'chip-total': 'all',
      'chip-pending': 'not-submitted',
      'chip-done': 'submitted',
      'chip-overdue': 'overdue',
    };

    Object.entries(chipMap).forEach(([chipId, statusValue]) => {
      const chip = document.getElementById(chipId);
      if (chip) {
        chip.addEventListener('click', () => {
          const statusSelect = document.getElementById('filter-status');
          if (statusSelect) {
            statusSelect.value = statusValue;
            _onFilterChange();
          }
        });
      }
    });

    // Search filter (real-time, no layout jumps)
    const searchInput = document.getElementById('filter-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        _searchQuery = e.target.value.trim();
        _renderFilteredGrid();
      });
    }

    // Filter dropdown changes
    ['filter-course', 'filter-status', 'filter-sort', 'filter-order'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', _onFilterChange);
    });

    // Clear filters button
    document.getElementById('clear-filters-btn')?.addEventListener('click', clearFilters);

    // Refresh button
    document.getElementById('refresh-btn')?.addEventListener('click', refresh);

    // Listen for sidebar course selection
    if (_courseFilterListener) {
      window.removeEventListener('course:filter', _courseFilterListener);
    }
    _courseFilterListener = (e) => {
      const courseId = e.detail.courseId;
      const filterSelect = document.getElementById('filter-course');
      if (!filterSelect) return;

      if (courseId === 'all') {
        filterSelect.value = 'all';
        _filters.course = 'all';
      } else {
        const course = _courses.find(c => c.id === courseId || c.name === courseId);
        if (course) {
          filterSelect.value = course.name;
          _filters.course = course.name;
        }
      }
      _applyFilters();
    };
    window.addEventListener('course:filter', _courseFilterListener);
  }

  async function _onFilterChange() {
    _filters = {
      course:  document.getElementById('filter-course')?.value  || 'all',
      status:  document.getElementById('filter-status')?.value  || 'all',
      sortBy:  document.getElementById('filter-sort')?.value    || 'dueDate',
      order:   document.getElementById('filter-order')?.value   || 'asc',
    };
    await _applyFilters();
  }

  async function _applyFilters() {
    const grid = document.getElementById('assignment-grid');
    if (!grid) return;

    // Smooth inline transition instead of violent skeleton wipe
    grid.style.opacity = '0.55';
    grid.style.transition = 'opacity 0.15s ease';

    try {
      if (window.LoadingBar) window.LoadingBar.start();
      const rawList = await AssignmentService.getAssignments(_filters);
      _assignments = rawList.filter(a => !_isObsoleteOverdue(a));
      _renderFilteredGrid();
    } catch (err) {
      Alerts.error('Failed to apply filters: ' + err.message);
    } finally {
      grid.style.opacity = '1';
      if (window.LoadingBar) window.LoadingBar.finish();
    }
  }

  function clearFilters() {
    _searchQuery = '';
    _filters = { course: 'all', status: 'all', sortBy: 'dueDate', order: 'asc' };

    const searchInput = document.getElementById('filter-search');
    if (searchInput) searchInput.value = '';

    const ids = ['filter-course', 'filter-status', 'filter-sort', 'filter-order'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = id === 'filter-sort' ? 'dueDate' : id === 'filter-order' ? 'asc' : 'all';
    });

    SidebarComponent.setActive('all');
    _applyFilters();
  }

  async function refresh() {
    AssignmentService.clearCache();
    CourseService.clearCache();
    await _loadData(true);
    Alerts.success('Assignments refreshed');
  }

  function _esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { render, clearFilters, refresh };
})();

window.DashboardComponent = DashboardComponent;
