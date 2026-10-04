/**
 * Navbar Component
 * Requirements: 8.5
 */
const NavbarComponent = (() => {
  function show(user) {
    const navbar = document.getElementById('navbar');
    const sidebar = document.getElementById('sidebar');
    if (navbar) navbar.classList.remove('hidden');
    if (sidebar) sidebar.classList.remove('hidden');

    _updateUserInfo(user);
    _bindEvents();
  }

  function hide() {
    document.getElementById('navbar')?.classList.add('hidden');
    document.getElementById('sidebar')?.classList.add('hidden');
  }

  function _updateUserInfo(user) {
    if (!user) return;
    const name = user.name || user.nim || 'Student';
    const initial = name[0]?.toUpperCase() || '?';

    DOM.setText(document.getElementById('nav-user-name'), name);
    DOM.setText(document.getElementById('nav-user-nim'), `NIM: ${user.nim || '—'}`);
    DOM.setText(document.getElementById('nav-user-avatar'), initial);
  }

  function _bindEvents() {
    // Brand click (navigates to dashboard)
    const brand = document.getElementById('navbar-brand');
    if (brand && !brand._bound) {
      brand._bound = true;
      brand.addEventListener('click', () => {
        Router.navigate('#/dashboard');
      });
      brand.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          Router.navigate('#/dashboard');
        }
      });
    }

    // Navigation links
    const dashBtn = document.getElementById('nav-dashboard-btn');
    if (dashBtn && !dashBtn._bound) {
      dashBtn._bound = true;
      dashBtn.addEventListener('click', () => {
        Router.navigate('#/dashboard');
      });
    }

    const coursesBtn = document.getElementById('nav-courses-btn');
    if (coursesBtn && !coursesBtn._bound) {
      coursesBtn._bound = true;
      coursesBtn.addEventListener('click', () => {
        Router.navigate('#/courses');
      });
    }

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn && !logoutBtn._bound) {
      logoutBtn._bound = true;
      logoutBtn.addEventListener('click', async () => {
        logoutBtn.disabled = true;
        try {
          await AuthService.logout();
          NavbarComponent.hide();
          Router.navigate('#/login');
        } finally {
          logoutBtn.disabled = false;
        }
      });
    }

    // Hamburger menu
    const hamburger = document.getElementById('hamburger-btn');
    if (hamburger && !hamburger._bound) {
      hamburger._bound = true;
      hamburger.addEventListener('click', () => {
        SidebarComponent.toggle();
        const expanded = hamburger.getAttribute('aria-expanded') === 'true';
        hamburger.setAttribute('aria-expanded', String(!expanded));
        hamburger.classList.toggle('open');
      });
    }

    // Sidebar overlay
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay && !overlay._bound) {
      overlay._bound = true;
      overlay.addEventListener('click', () => {
        SidebarComponent.close();
        const hamburger = document.getElementById('hamburger-btn');
        hamburger?.classList.remove('open');
        hamburger?.setAttribute('aria-expanded', 'false');
      });
    }

    // Sidebar close button
    const sidebarClose = document.getElementById('sidebar-close');
    if (sidebarClose && !sidebarClose._bound) {
      sidebarClose._bound = true;
      sidebarClose.addEventListener('click', () => {
        SidebarComponent.close();
        const hamburger = document.getElementById('hamburger-btn');
        hamburger?.classList.remove('open');
        hamburger?.setAttribute('aria-expanded', 'false');
      });
    }
  }

  return { show, hide, updateUser: _updateUserInfo };
})();

window.NavbarComponent = NavbarComponent;
