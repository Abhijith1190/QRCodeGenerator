(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- Supabase client (same project as app.js) ----------
  const authState = { user: null, plan: 'free' };
  let supabaseClient = null;
  const cfg = window.SUPABASE_CONFIG;
  if (cfg && cfg.url && cfg.anonKey && !cfg.url.includes('YOUR_SUPABASE') && window.supabase) {
    supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
  }

  function isAuthed() { return !!authState.user; }
  function isPro() { return isAuthed() && authState.plan === 'pro'; }

  async function refreshProfilePlan() {
    if (!supabaseClient || !authState.user) { authState.plan = 'free'; return; }
    try {
      const { data } = await supabaseClient
        .from('profiles')
        .select('plan')
        .eq('id', authState.user.id)
        .single();
      authState.plan = (data && data.plan) || 'free';
    } catch (e) {
      authState.plan = 'free';
    }
  }

  // ---------- Auth area / modal (mirrors app.js) ----------
  function renderAuthArea() {
    const area = $('auth-area');
    if (!area) return;
    // Theme selection lives in the profile menu once signed in, so the
    // standalone toggle would otherwise be a duplicate control.
    const themeToggle = $('theme-toggle');
    if (themeToggle) themeToggle.classList.toggle('hidden', isAuthed());

    if (isAuthed()) {
      window.renderProfileMenu(area, {
        email: authState.user.email,
        isPro: isPro(),
        onLogout: () => openLogoutModal(),
      });
    } else {
      area.innerHTML = `<button class="btn-auth" id="auth-open-btn" type="button">Sign in</button>`;
      $('auth-open-btn').addEventListener('click', () => openAuthModal());
    }
  }

  function openAuthModal(tab) {
    const backdrop = $('auth-modal-backdrop');
    if (!backdrop) return;
    if (tab) setAuthTab(tab);
    $('auth-error').textContent = '';
    $('auth-note').textContent = !supabaseClient ? 'Sign-in isn’t configured on this site yet.' : '';
    backdrop.classList.remove('hidden');
    $('auth-email').focus();
  }

  function closeAuthModal() {
    const backdrop = $('auth-modal-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
    $('auth-form').reset();
    $('auth-error').textContent = '';
    $('auth-note').textContent = '';
  }

  function setAuthTab(tab) {
    document.querySelectorAll('.modal-tab').forEach((t) => t.classList.toggle('active', t.dataset.authtab === tab));
    $('auth-submit-btn').textContent = tab === 'signup' ? 'Sign up' : 'Log in';
    $('auth-modal-title').textContent = tab === 'signup' ? 'Create your free account' : 'Sign in to upgrade';
    $('auth-form').dataset.mode = tab;
    $('auth-error').textContent = '';
    $('auth-note').textContent = '';
  }

  document.querySelectorAll('.modal-tab').forEach((btn) => {
    btn.addEventListener('click', () => setAuthTab(btn.dataset.authtab));
  });

  const authModalCloseBtn = $('auth-modal-close');
  if (authModalCloseBtn) authModalCloseBtn.addEventListener('click', closeAuthModal);

  const authModalBackdrop = $('auth-modal-backdrop');
  if (authModalBackdrop) {
    authModalBackdrop.addEventListener('click', (e) => {
      if (e.target === authModalBackdrop) closeAuthModal();
    });
  }

  // Once signed in, if the user was trying to upgrade, continue automatically.
  let pendingUpgradeAfterAuth = false;

  function onAuthChanged() {
    renderAuthArea();
    refreshProfilePlan().then(() => {
      renderAuthArea();
      updatePlanCards();
      if (pendingUpgradeAfterAuth && isAuthed()) {
        pendingUpgradeAfterAuth = false;
        startCheckout();
      }
    });
  }

  const authGoogleBtn = $('auth-google-btn');
  if (authGoogleBtn) {
    authGoogleBtn.addEventListener('click', async () => {
      if (!supabaseClient) return;
      await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href },
      });
    });
  }

  const authForm = $('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!supabaseClient) return;
      const mode = authForm.dataset.mode || 'signin';
      const email = $('auth-email').value.trim();
      const password = $('auth-password').value;
      $('auth-error').textContent = '';
      try {
        if (mode === 'signup') {
          const { data, error } = await supabaseClient.auth.signUp({ email, password });
          if (error) throw error;
          if (data.user && !data.session) {
            $('auth-note').textContent = 'Check your email to confirm your account, then sign in.';
            return;
          }
          authState.user = data.user;
          closeAuthModal();
          onAuthChanged();
        } else {
          const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
          if (error) throw error;
          authState.user = data.user;
          closeAuthModal();
          onAuthChanged();
        }
      } catch (err) {
        $('auth-error').textContent = err.message || 'Something went wrong.';
      }
    });
  }

  // ---------- Logout modal ----------
  function openLogoutModal() {
    const backdrop = $('logout-modal-backdrop');
    if (backdrop) backdrop.classList.remove('hidden');
  }
  function closeLogoutModal() {
    const backdrop = $('logout-modal-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
  }
  const logoutClose = $('logout-modal-close');
  if (logoutClose) logoutClose.addEventListener('click', closeLogoutModal);
  const logoutCancel = $('logout-cancel-btn');
  if (logoutCancel) logoutCancel.addEventListener('click', closeLogoutModal);
  const logoutConfirm = $('logout-confirm-btn');
  if (logoutConfirm) {
    logoutConfirm.addEventListener('click', async () => {
      if (supabaseClient) await supabaseClient.auth.signOut();
      closeLogoutModal();
    });
  }
  const logoutBackdrop = $('logout-modal-backdrop');
  if (logoutBackdrop) {
    logoutBackdrop.addEventListener('click', (e) => {
      if (e.target === logoutBackdrop) closeLogoutModal();
    });
  }

  if (supabaseClient) {
    supabaseClient.auth.getSession().then(({ data }) => {
      authState.user = data.session ? data.session.user : null;
      onAuthChanged();
    });
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      authState.user = session ? session.user : null;
      onAuthChanged();
    });
  } else {
    renderAuthArea();
  }

  // ---------- Theme toggle ----------
  const themeToggleBtn = $('theme-toggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const root = document.documentElement;
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const currentlyDark = root.getAttribute('data-theme')
        ? root.getAttribute('data-theme') === 'dark'
        : systemPrefersDark;
      const next = currentlyDark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('codeforge-theme', next); } catch (e) {}
    });
  }

  // ---------- Billing toggle + plan cards ----------
  let billingCycle = 'monthly';
  let stripeConfigured = false;
  const toggleBtn = $('billing-toggle-btn');

  function updatePlanCards() {
    const stripeCfg = window.STRIPE_CONFIG;
    stripeConfigured = !!(stripeCfg
      && stripeCfg.publishableKey && !stripeCfg.publishableKey.includes('YOUR_STRIPE')
      && stripeCfg.prices && stripeCfg.prices.monthly && !stripeCfg.prices.monthly.includes('YOUR_STRIPE')
      && stripeCfg.prices.yearly && !stripeCfg.prices.yearly.includes('YOUR_STRIPE'));

    if (!stripeConfigured) $('waitlist-form').classList.add('hidden');

    if (billingCycle === 'yearly') {
      $('pro-price').textContent = '$39';
      $('pro-price-suffix').textContent = '/year';
      $('pro-price-sub').textContent = 'Billed yearly, cancel anytime';
    } else {
      $('pro-price').textContent = '$4.99';
      $('pro-price-suffix').textContent = '/month';
      $('pro-price-sub').textContent = 'Billed monthly, cancel anytime';
    }

    const upgradeBtn = $('upgrade-btn');
    const note = $('pricing-note');
    if (!stripeConfigured) {
      upgradeBtn.textContent = 'Notify me when Pro launches';
      upgradeBtn.disabled = false;
      note.textContent = 'Pro checkout isn’t live yet — leave your email and we’ll let you know.';
    } else if (isPro()) {
      upgradeBtn.textContent = 'Manage subscription';
      upgradeBtn.disabled = false;
      note.textContent = 'You’re on Pro. Manage billing or cancel anytime.';
    } else {
      upgradeBtn.textContent = 'Upgrade to Pro';
      upgradeBtn.disabled = false;
      note.textContent = '';
    }

    const freeBtn = $('free-plan-btn');
    if (freeBtn) freeBtn.textContent = isAuthed() ? 'Your current plan' : 'Get started free';
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      billingCycle = billingCycle === 'monthly' ? 'yearly' : 'monthly';
      toggleBtn.classList.toggle('on', billingCycle === 'yearly');
      $('label-monthly').classList.toggle('active', billingCycle === 'monthly');
      $('label-yearly').classList.toggle('active', billingCycle === 'yearly');
      updatePlanCards();
    });
  }

  const freePlanBtn = $('free-plan-btn');
  if (freePlanBtn) {
    freePlanBtn.addEventListener('click', () => {
      if (!isAuthed()) openAuthModal('signup');
      else window.location.href = '/';
    });
  }

  async function startCheckout() {
    const stripeCfg = window.STRIPE_CONFIG;
    const priceId = stripeCfg.prices[billingCycle];
    const upgradeBtn = $('upgrade-btn');
    const note = $('pricing-note');
    upgradeBtn.disabled = true;
    note.textContent = 'Redirecting to secure checkout…';
    try {
      const { data, error } = await supabaseClient.functions.invoke('create-checkout-session', {
        body: { priceId },
      });
      if (error || !data || !data.url) throw error || new Error((data && data.error) || 'Checkout failed');
      window.location.href = data.url;
    } catch (err) {
      note.textContent = 'Could not start checkout. Please try again in a moment.';
      upgradeBtn.disabled = false;
    }
  }

  async function openBillingPortal() {
    const upgradeBtn = $('upgrade-btn');
    const note = $('pricing-note');
    upgradeBtn.disabled = true;
    note.textContent = 'Opening billing portal…';
    try {
      const { data, error } = await supabaseClient.functions.invoke('create-portal-session');
      if (error || !data || !data.url) throw error || new Error((data && data.error) || 'Portal failed');
      window.location.href = data.url;
    } catch (err) {
      note.textContent = 'Could not open billing portal. Please try again in a moment.';
      upgradeBtn.disabled = false;
    }
  }

  const upgradeBtn = $('upgrade-btn');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => {
      if (!stripeConfigured) {
        $('waitlist-form').classList.toggle('hidden');
        if (!$('waitlist-form').classList.contains('hidden')) $('waitlist-email').focus();
        return;
      }
      if (!supabaseClient) return;
      if (isPro()) {
        openBillingPortal();
        return;
      }
      if (!isAuthed()) {
        pendingUpgradeAfterAuth = true;
        openAuthModal('signup');
        return;
      }
      startCheckout();
    });
  }

  // ---------- Waitlist ("Notify me") ----------
  const waitlistForm = $('waitlist-form');
  if (waitlistForm) {
    waitlistForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const note = $('pricing-note');
      const email = $('waitlist-email').value.trim();
      const submitBtn = $('waitlist-submit');
      submitBtn.disabled = true;
      try {
        if (!supabaseClient) throw new Error('Not configured');
        // Plain insert (not upsert): upsert defaults to requesting the row
        // back, which Postgres RLS blocks since there's intentionally no
        // SELECT policy (nobody but us should be able to read the list).
        // A duplicate email (already on the list) is treated as success.
        const { error } = await supabaseClient.from('pro_waitlist').insert({ email });
        if (error && error.code !== '23505') throw error;
        waitlistForm.classList.add('hidden');
        note.textContent = 'Thanks! We’ll email you the moment Pro is live.';
      } catch (err) {
        submitBtn.disabled = false;
        note.textContent = 'Something went wrong — please try again.';
      }
    });
  }

  // ---------- Checkout return banners ----------
  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') {
    $('checkout-success-banner').classList.remove('hidden');
  } else if (params.get('checkout') === 'cancelled') {
    $('checkout-cancelled-banner').classList.remove('hidden');
  }

  updatePlanCards();
})();
