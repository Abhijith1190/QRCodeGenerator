// Signed-in profile menu, shared by the generator and pricing pages.
//
// Spelling out the user's email in the header widened the right-hand actions
// group enough to shove the centred brand and the nav link off-centre, so a
// signed-in user collapses down to a single avatar button instead. Theme
// selection lives in here too, which is why the standalone toggle is hidden
// while signed in.
(() => {
  const THEME_KEY = 'codeforge-theme';

  function getThemePreference() {
    try {
      return localStorage.getItem(THEME_KEY) || 'system';
    } catch (e) {
      return 'system';
    }
  }

  // 'system' is stored as the absence of the key, which is exactly what the
  // inline loader in each page's <head> already expects.
  function setThemePreference(pref) {
    const root = document.documentElement;
    try {
      if (pref === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, pref);
    } catch (e) {}
    if (pref === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', pref);
  }

  function closeProfileMenu() {
    const menu = document.getElementById('profile-menu');
    const btn = document.getElementById('profile-btn');
    if (menu) menu.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  // Attached once: re-rendering the auth area must not stack listeners.
  document.addEventListener('click', (e) => {
    const area = document.getElementById('auth-area');
    if (area && !area.contains(e.target)) closeProfileMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeProfileMenu();
  });

  // Fills `area` with the avatar button and its dropdown. `onLogout` fires when
  // "Log out" is picked — each page owns its own confirmation modal.
  window.renderProfileMenu = function (area, { email, isPro, onLogout }) {
    area.innerHTML = `
      <button class="avatar-btn" id="profile-btn" type="button" aria-haspopup="true" aria-expanded="false"></button>
      <div class="profile-menu hidden" id="profile-menu" role="menu">
        <div class="profile-menu-head">
          <span class="profile-email"></span>
          ${isPro ? '<span class="pro-badge">PRO</span>' : ''}
        </div>
        <div class="profile-menu-group">
          <span class="profile-menu-label">Theme</span>
          <div class="theme-options" id="theme-options">
            <button type="button" data-theme-pref="light">Light</button>
            <button type="button" data-theme-pref="dark">Dark</button>
            <button type="button" data-theme-pref="system">System</button>
          </div>
        </div>
        <button type="button" class="profile-menu-item danger" id="profile-logout-btn">Log out</button>
      </div>
    `;

    // Set via textContent rather than interpolating into the markup above, so
    // the address is never parsed as HTML.
    const address = email || '';
    const btn = area.querySelector('#profile-btn');
    btn.textContent = address.trim().charAt(0).toUpperCase() || '?';
    btn.title = address;
    area.querySelector('.profile-email').textContent = address;

    const menu = area.querySelector('#profile-menu');

    function markActiveTheme() {
      const active = getThemePreference();
      area.querySelectorAll('#theme-options button').forEach((b) => {
        b.classList.toggle('active', b.dataset.themePref === active);
      });
    }
    markActiveTheme();

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const opening = menu.classList.contains('hidden');
      menu.classList.toggle('hidden', !opening);
      btn.setAttribute('aria-expanded', String(opening));
      if (opening) markActiveTheme();
    });

    area.querySelectorAll('#theme-options button').forEach((b) => {
      // The menu deliberately stays open so the change is visible immediately.
      b.addEventListener('click', () => {
        setThemePreference(b.dataset.themePref);
        markActiveTheme();
      });
    });

    area.querySelector('#profile-logout-btn').addEventListener('click', () => {
      closeProfileMenu();
      onLogout();
    });
  };

  window.closeProfileMenu = closeProfileMenu;
})();
