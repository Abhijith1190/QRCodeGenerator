(() => {
  // ---------- Auth (Supabase) ----------
  // Colorful presets, gradients, and custom eye colors require a signed-in
  // (free) account. Pro subscribers additionally get no watermark, no ads,
  // unlimited generations, and vector SVG export — see pricing.html.
  const authState = { user: null, ready: false, plan: 'free' };

  let supabaseClient = null;
  const cfg = window.SUPABASE_CONFIG;
  if (cfg && cfg.url && cfg.anonKey && !cfg.url.includes('YOUR_SUPABASE') && window.supabase) {
    supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
  }

  function isAuthed() {
    return !!authState.user;
  }

  // Pro (paid) status is looked up from the profiles table, which is only
  // ever written by the Stripe webhook — never trust a client-side flag.
  function isPro() {
    return isAuthed() && authState.plan === 'pro';
  }

  async function refreshProfilePlan() {
    if (!supabaseClient || !authState.user) {
      authState.plan = 'free';
      return;
    }
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

  function $$(id) { return document.getElementById(id); }

  function renderAuthArea() {
    const area = $$('auth-area');
    if (!area) return;
    // Theme selection lives in the profile menu once signed in, so the
    // standalone toggle would otherwise be a duplicate control.
    const themeToggle = $$('theme-toggle');
    if (themeToggle) themeToggle.classList.toggle('hidden', isAuthed());

    if (isAuthed()) {
      window.renderProfileMenu(area, {
        email: authState.user.email,
        isPro: isPro(),
        onLogout: () => openLogoutModal(),
      });
    } else {
      area.innerHTML = `<button class="btn-auth" id="auth-open-btn" type="button">Sign in</button>`;
      $$('auth-open-btn').addEventListener('click', () => openAuthModal());
    }
  }

  function updateGateUI() {
    const authed = isAuthed();
    const pro = isPro();

    document.querySelectorAll('.lock-badge:not(.pro-lock-badge)').forEach((b) => b.classList.toggle('hidden', authed));
    document.querySelectorAll('.pro-lock-badge').forEach((b) => b.classList.toggle('hidden', pro));

    const presetRow = $$('qr-presets');
    if (presetRow) presetRow.classList.toggle('is-locked', !authed);

    const gradientOption = $$('qr-gradient-option');
    if (gradientOption) gradientOption.textContent = authed ? 'Gradient' : 'Gradient (sign in)';

    const upsellNote = $$('pro-upsell-note');
    if (upsellNote) upsellNote.classList.toggle('hidden', pro);
  }

  function onAuthChanged() {
    renderAuthArea();
    updateGateUI();

    if (!isAuthed()) {
      // Logged out: fall back any active premium styling to the free defaults.
      authState.plan = 'free';
      const colorModeEl = $$('qr-color-mode');
      const cornerCustomEl = $$('qr-corner-custom-color');
      if (colorModeEl && colorModeEl.value === 'gradient') {
        colorModeEl.value = 'solid';
        if (typeof toggleColorModeControls === 'function') toggleColorModeControls();
      }
      if (cornerCustomEl && cornerCustomEl.checked) {
        cornerCustomEl.checked = false;
        if (typeof toggleCornerColorControl === 'function') toggleCornerColorControl();
      }
    }

    if (typeof render === 'function') render();

    refreshProfilePlan().then(() => {
      renderAuthArea();
      updateGateUI();
      if (typeof render === 'function') render();
    });
  }

  // ---------- Auth modal ----------
  function openAuthModal(tab) {
    const backdrop = $$('auth-modal-backdrop');
    if (!backdrop) return;
    if (tab) setAuthTab(tab);
    $$('auth-error').textContent = '';
    $$('auth-note').textContent = !supabaseClient
      ? 'Sign-in isn’t configured on this site yet.'
      : '';
    backdrop.classList.remove('hidden');
    $$('auth-email').focus();
  }

  function closeAuthModal() {
    const backdrop = $$('auth-modal-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
    $$('auth-form').reset();
    $$('auth-error').textContent = '';
    $$('auth-note').textContent = '';
  }

  function setAuthTab(tab) {
    document.querySelectorAll('.modal-tab').forEach((t) => t.classList.toggle('active', t.dataset.authtab === tab));
    $$('auth-submit-btn').textContent = tab === 'signup' ? 'Sign up' : 'Log in';
    $$('auth-modal-title').textContent = tab === 'signup' ? 'Create your free account' : 'Unlock colorful QR codes';
    $$('auth-form').dataset.mode = tab;
    $$('auth-error').textContent = '';
    $$('auth-note').textContent = '';
  }

  document.querySelectorAll('.modal-tab').forEach((btn) => {
    btn.addEventListener('click', () => setAuthTab(btn.dataset.authtab));
  });

  const authModalCloseBtn = $$('auth-modal-close');
  if (authModalCloseBtn) authModalCloseBtn.addEventListener('click', closeAuthModal);

  const authModalBackdrop = $$('auth-modal-backdrop');
  if (authModalBackdrop) {
    authModalBackdrop.addEventListener('click', (e) => {
      if (e.target === authModalBackdrop) closeAuthModal();
    });
  }

  // ---------- Logout confirmation modal ----------
  function openLogoutModal() {
    const backdrop = $$('logout-modal-backdrop');
    if (backdrop) backdrop.classList.remove('hidden');
  }

  function closeLogoutModal() {
    const backdrop = $$('logout-modal-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
  }

  const logoutModalBackdrop = $$('logout-modal-backdrop');
  if (logoutModalBackdrop) {
    logoutModalBackdrop.addEventListener('click', (e) => {
      if (e.target === logoutModalBackdrop) closeLogoutModal();
    });
  }

  const logoutModalCloseBtn = $$('logout-modal-close');
  if (logoutModalCloseBtn) logoutModalCloseBtn.addEventListener('click', closeLogoutModal);

  const logoutCancelBtn = $$('logout-cancel-btn');
  if (logoutCancelBtn) logoutCancelBtn.addEventListener('click', closeLogoutModal);

  const logoutConfirmBtn = $$('logout-confirm-btn');
  if (logoutConfirmBtn) {
    logoutConfirmBtn.addEventListener('click', async () => {
      logoutConfirmBtn.disabled = true;
      if (supabaseClient) await supabaseClient.auth.signOut();
      authState.user = null;
      onAuthChanged();
      logoutConfirmBtn.disabled = false;
      closeLogoutModal();
    });
  }

  // ---------- Per-IP hourly rate limit + bonus ad ----------
  // The actual counting happens server-side (a Supabase Edge Function backed
  // by a Postgres table keyed on the caller's real IP) since a static site
  // has no trustworthy way to see or track IPs on its own — anything done
  // purely in the browser could be bypassed by clearing localStorage or
  // just using a different browser. This call is fire-and-forget: it never
  // blocks or delays actually generating the code.
  function showBonusAdModal() {
    const backdrop = $$('bonus-ad-modal-backdrop');
    if (!backdrop) return;

    const slotEl = $$('ad-slot-bonus');
    const fallbackNote = $$('bonus-ad-fallback-note');
    const cfg = window.ADSENSE_CONFIG;

    let consent;
    try { consent = localStorage.getItem('ad-consent'); } catch (e) { consent = null; }

    const bonusSlotId = cfg && cfg.slots && cfg.slots.bonus;
    const canShowRealAd =
      cfg && cfg.publisherId && !cfg.publisherId.includes('YOUR_ADSENSE') &&
      consent === 'accepted' &&
      bonusSlotId && !bonusSlotId.includes('YOUR_AD_SLOT');

    // Ad delivery is inherently unreliable (ad blockers, invalid slots,
    // network hiccups) — a thrown error here must never prevent the modal
    // itself from opening, so the ad attempt is isolated in its own catch.
    let adShown = false;
    if (canShowRealAd) {
      try {
        slotEl.classList.remove('hidden');
        slotEl.innerHTML = `<ins class="adsbygoogle" style="display:block;width:100%;height:100%" data-ad-client="${cfg.publisherId}" data-ad-slot="${bonusSlotId}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        adShown = true;
      } catch (e) {
        adShown = false;
      }
    }

    if (adShown) {
      fallbackNote.classList.add('hidden');
    } else {
      slotEl.classList.add('hidden');
      slotEl.innerHTML = '';
      fallbackNote.classList.remove('hidden');
    }

    backdrop.classList.remove('hidden');
  }

  function closeBonusAdModal() {
    const backdrop = $$('bonus-ad-modal-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
  }

  const bonusAdCloseBtn = $$('bonus-ad-modal-close');
  if (bonusAdCloseBtn) bonusAdCloseBtn.addEventListener('click', closeBonusAdModal);

  const bonusAdContinueBtn = $$('bonus-ad-continue-btn');
  if (bonusAdContinueBtn) bonusAdContinueBtn.addEventListener('click', closeBonusAdModal);

  const bonusAdModalBackdrop = $$('bonus-ad-modal-backdrop');
  if (bonusAdModalBackdrop) {
    bonusAdModalBackdrop.addEventListener('click', (e) => {
      if (e.target === bonusAdModalBackdrop) closeBonusAdModal();
    });
  }

  async function checkRateLimitAndMaybeShowAd() {
    if (!supabaseClient) return; // not configured — fail open, no limit enforced
    if (isPro()) return; // Pro subscribers have unlimited generations
    try {
      const { data, error } = await supabaseClient.functions.invoke('check-rate-limit');
      if (!error && data && data.showAd) {
        showBonusAdModal();
      }
    } catch (e) {
      // Network hiccup or function not deployed yet — fail open silently.
    }
  }

  const authGoogleBtn = $$('auth-google-btn');
  if (authGoogleBtn) {
    authGoogleBtn.addEventListener('click', async () => {
      const errorEl = $$('auth-error');
      errorEl.textContent = '';
      if (!supabaseClient) {
        errorEl.textContent = 'Sign-in isn’t configured on this site yet. Add your Supabase project keys in config.js.';
        return;
      }
      authGoogleBtn.disabled = true;
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href },
      });
      if (error) {
        errorEl.textContent = error.message;
        authGoogleBtn.disabled = false;
      }
      // On success the browser navigates away to Google, then back to this
      // page; the existing getSession()/onAuthStateChange logic picks up
      // the resulting session automatically on load.
    });
  }

  const authForm = $$('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = authForm.dataset.mode || 'signin';
      const email = $$('auth-email').value.trim();
      const password = $$('auth-password').value;
      const errorEl = $$('auth-error');
      const noteEl = $$('auth-note');
      const submitBtn = $$('auth-submit-btn');
      errorEl.textContent = '';
      noteEl.textContent = '';

      if (!supabaseClient) {
        errorEl.textContent = 'Sign-in isn’t configured on this site yet. Add your Supabase project keys in config.js.';
        return;
      }

      submitBtn.disabled = true;
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = mode === 'signup' ? 'Signing up…' : 'Logging in…';

      try {
        if (mode === 'signup') {
          const { data, error } = await supabaseClient.auth.signUp({ email, password });
          if (error) {
            errorEl.textContent = error.message;
          } else if (data.session) {
            authState.user = data.user;
            onAuthChanged();
            closeAuthModal();
          } else {
            noteEl.textContent = 'Check your email to confirm your account, then log in.';
            setAuthTab('signin');
          }
        } else {
          const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
          if (error) {
            errorEl.textContent = error.message;
          } else if (data.session) {
            authState.user = data.user;
            onAuthChanged();
            closeAuthModal();
          }
        }
      } catch (err) {
        errorEl.textContent = 'Something went wrong. Please try again.';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }

  // Restore session on load and stay in sync across tabs / token refresh.
  if (supabaseClient) {
    supabaseClient.auth.getSession().then(({ data }) => {
      authState.user = data.session ? data.session.user : null;
      authState.ready = true;
      onAuthChanged();
    });
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      authState.user = session ? session.user : null;
      onAuthChanged();
    });
  } else {
    authState.ready = true;
  }

  renderAuthArea();
  updateGateUI();

  // ---------- Ads (Google AdSense) ----------
  // The base AdSense library is loaded via a static <script> tag directly in
  // <head> (see index.html/privacy.html) rather than injected here — Google's
  // site-verification step checks for it in the raw page source, which a
  // JS-injected tag might not satisfy. Consent instead gates the separate
  // step of actually requesting/rendering an ad into a slot.
  const adsCfg = window.ADSENSE_CONFIG;
  const adsConfigured = adsCfg && adsCfg.publisherId && !adsCfg.publisherId.includes('YOUR_ADSENSE');

  function renderAdUnits() {
    Object.entries(adsCfg.slots || {}).forEach(([key, slotId]) => {
      // "bonus" lives inside a modal that's hidden until the rate-limit
      // popup fires — requesting an ad into a hidden element violates
      // AdSense policy, so showBonusAdModal() renders it separately, only
      // once the modal (and slot) are actually visible.
      if (key === 'bonus') return;
      if (!slotId || slotId.includes('YOUR_AD_SLOT')) return;
      const container = $$('ad-slot-' + key);
      if (!container) return;
      try {
        container.classList.remove('hidden');
        container.innerHTML = `<ins class="adsbygoogle" style="display:block;width:100%;height:100%" data-ad-client="${adsCfg.publisherId}" data-ad-slot="${slotId}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        // One bad/blocked slot shouldn't stop the others from rendering.
      }
    });
  }

  function initAds() {
    if (!adsConfigured) return;

    let consent;
    try { consent = localStorage.getItem('ad-consent'); } catch (e) { consent = null; }

    if (consent === 'rejected') return; // script present for verification, but no ads rendered
    if (consent === 'accepted') {
      renderAdUnits();
    } else {
      const banner = $$('consent-banner');
      if (banner) banner.classList.remove('hidden');
    }
  }

  const consentAcceptBtn = $$('consent-accept-btn');
  if (consentAcceptBtn) {
    consentAcceptBtn.addEventListener('click', () => {
      try { localStorage.setItem('ad-consent', 'accepted'); } catch (e) {}
      $$('consent-banner').classList.add('hidden');
      renderAdUnits();
    });
  }

  const consentRejectBtn = $$('consent-reject-btn');
  if (consentRejectBtn) {
    consentRejectBtn.addEventListener('click', () => {
      try { localStorage.setItem('ad-consent', 'rejected'); } catch (e) {}
      $$('consent-banner').classList.add('hidden');
    });
  }

  initAds();

  // ---------- Theme toggle ----------
  const themeToggleBtn = document.getElementById('theme-toggle');
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

  const state = {
    mode: 'qr',
    qrType: 'url',
    logoImage: null,
  };

  const $ = (id) => document.getElementById(id);
  const errorMsg = $('error-msg');
  const qrContainer = $('qr-canvas-container');
  const barcodeSvg = $('barcode-svg');

  function getQrCanvas() {
    return qrContainer.querySelector('canvas');
  }

  function setError(msg) {
    errorMsg.textContent = msg || '';
  }

  // ---------- Mode switching ----------
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      $('qr-panel').classList.toggle('active', state.mode === 'qr');
      $('barcode-panel').classList.toggle('active', state.mode === 'barcode');
      qrContainer.classList.toggle('hidden', state.mode !== 'qr');
      barcodeSvg.classList.toggle('hidden', state.mode !== 'barcode');
    });
  });

  document.querySelectorAll('.type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.qrType = btn.dataset.type;
      document.querySelectorAll('#qr-fields .field-group').forEach((fg) => {
        fg.classList.toggle('hidden', fg.dataset.for !== state.qrType);
      });
    });
  });

  // ---------- Build QR payload ----------
  function escapeWifi(str) {
    return str.replace(/([\\;,:"])/g, '\\$1');
  }

  const SOCIAL_BASES = {
    instagram: 'https://instagram.com/',
    facebook: 'https://facebook.com/',
    x: 'https://x.com/',
    linkedin: 'https://linkedin.com/in/',
    tiktok: 'https://tiktok.com/@',
    youtube: 'https://youtube.com/@',
    telegram: 'https://t.me/',
    snapchat: 'https://snapchat.com/add/',
  };

  // "2026-09-28T14:30" -> "20260928T143000". Deliberately a floating local
  // time (no trailing Z): the event should start at 2pm wherever it's scanned,
  // not shift by the scanner's timezone.
  function toICalDate(value) {
    if (!value) return '';
    const compact = value.replace(/[-:]/g, '');
    return compact.length === 13 ? compact + '00' : compact;
  }

  function escapeICal(str) {
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function buildQrPayload() {
    switch (state.qrType) {
      case 'url': {
        const v = $('qr-url').value.trim();
        return v || 'https://example.com';
      }
      case 'text':
        return $('qr-text').value || '';
      case 'wifi': {
        const ssid = escapeWifi($('wifi-ssid').value || '');
        const pass = escapeWifi($('wifi-password').value || '');
        const enc = $('wifi-encryption').value;
        const hidden = $('wifi-hidden').checked ? 'true' : 'false';
        return `WIFI:T:${enc};S:${ssid};P:${enc === 'nopass' ? '' : pass};H:${hidden};;`;
      }
      case 'vcard': {
        const name = $('vcard-name').value || '';
        const phone = $('vcard-phone').value || '';
        const email = $('vcard-email').value || '';
        const org = $('vcard-org').value || '';
        const url = $('vcard-url').value || '';
        return `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nORG:${org}\nTEL:${phone}\nEMAIL:${email}\nURL:${url}\nEND:VCARD`;
      }
      case 'email': {
        const to = $('email-to').value || '';
        const subject = encodeURIComponent($('email-subject').value || '');
        const body = encodeURIComponent($('email-body').value || '');
        return `mailto:${to}?subject=${subject}&body=${body}`;
      }
      case 'sms': {
        const num = $('sms-number').value || '';
        const msg = encodeURIComponent($('sms-message').value || '');
        return `SMSTO:${num}:${msg}`;
      }
      case 'phone': {
        const num = $('phone-number').value || '';
        return `tel:${num}`;
      }
      case 'whatsapp': {
        // wa.me wants digits only — no +, spaces or dashes.
        const num = ($('whatsapp-number').value || '').replace(/\D/g, '');
        if (!num) return '';
        const msg = $('whatsapp-message').value || '';
        return `https://wa.me/${num}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
      }
      case 'social': {
        const user = ($('social-username').value || '').trim().replace(/^@/, '');
        const base = SOCIAL_BASES[$('social-platform').value];
        if (!user || !base) return '';
        return base + encodeURIComponent(user);
      }
      case 'location': {
        const lat = ($('location-lat').value || '').trim();
        const lng = ($('location-lng').value || '').trim();
        const query = lat && lng ? `${lat},${lng}` : ($('location-query').value || '').trim();
        if (!query) return '';
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
      }
      case 'event': {
        const title = ($('event-title').value || '').trim();
        if (!title) return '';
        const location = ($('event-location').value || '').trim();
        const description = ($('event-description').value || '').trim();
        const start = toICalDate($('event-start').value);
        const end = toICalDate($('event-end').value);
        let out = 'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\n';
        out += `SUMMARY:${escapeICal(title)}\n`;
        if (location) out += `LOCATION:${escapeICal(location)}\n`;
        if (description) out += `DESCRIPTION:${escapeICal(description)}\n`;
        if (start) out += `DTSTART:${start}\n`;
        if (end) out += `DTEND:${end}\n`;
        return out + 'END:VEVENT\nEND:VCALENDAR';
      }
      case 'review': {
        const id = ($('review-placeid').value || '').trim();
        if (!id) return '';
        return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(id)}`;
      }
      default:
        return '';
    }
  }

  // ---------- QR color / style helpers ----------
  function buildColorOptions() {
    const mode = $('qr-color-mode').value;
    if (mode === 'gradient') {
      return {
        gradient: {
          type: $('qr-gradient-type').value,
          rotation: (parseInt($('qr-gradient-rotation').value, 10) * Math.PI) / 180,
          colorStops: [
            { offset: 0, color: $('qr-gradient-c1').value },
            { offset: 1, color: $('qr-gradient-c2').value },
          ],
        },
      };
    }
    return { color: $('qr-fg').value };
  }

  function toggleColorModeControls() {
    const isGradient = $('qr-color-mode').value === 'gradient';
    $('qr-fg-solid-control').classList.toggle('hidden', isGradient);
    $('qr-fg-gradient-type-control').classList.toggle('hidden', !isGradient);
    $('qr-gradient-c1-control').classList.toggle('hidden', !isGradient);
    $('qr-gradient-c2-control').classList.toggle('hidden', !isGradient);
    $('qr-gradient-rotation-control').classList.toggle('hidden', !isGradient || $('qr-gradient-type').value !== 'linear');
  }

  function toggleCornerColorControl() {
    $('qr-corner-color-control').classList.toggle('hidden', !$('qr-corner-custom-color').checked);
  }

  function toggleFrameControls() {
    const style = $('qr-frame-style').value;
    $('qr-frame-color-control').classList.toggle('hidden', style === 'none');
    $('qr-frame-text-control').classList.toggle('hidden', style !== 'label-below' && style !== 'label-above');
  }

  $('qr-frame-style').addEventListener('change', toggleFrameControls);
  toggleFrameControls();

  const PRESETS = {
    classic: { mode: 'solid', fg: '#000000', dotStyle: 'square', cornerSquare: 'square', cornerDot: 'square', cornerCustom: false },
    sunset: { mode: 'gradient', gradientType: 'linear', c1: '#ff5f6d', c2: '#ffc371', rotation: 45, dotStyle: 'rounded', cornerSquare: 'extra-rounded', cornerDot: 'dot', cornerCustom: false },
    ocean: { mode: 'gradient', gradientType: 'linear', c1: '#00c6ff', c2: '#0072ff', rotation: 135, dotStyle: 'dots', cornerSquare: 'dot', cornerDot: 'dot', cornerCustom: true, cornerColor: '#003366' },
    berry: { mode: 'gradient', gradientType: 'radial', c1: '#a445b2', c2: '#d41872', rotation: 0, dotStyle: 'classy-rounded', cornerSquare: 'extra-rounded', cornerDot: 'dot', cornerCustom: false },
    forest: { mode: 'gradient', gradientType: 'linear', c1: '#11998e', c2: '#38ef7d', rotation: 45, dotStyle: 'extra-rounded', cornerSquare: 'extra-rounded', cornerDot: 'dot', cornerCustom: false },
    candy: { mode: 'gradient', gradientType: 'linear', c1: '#ff9a9e', c2: '#fecfef', rotation: 90, dotStyle: 'classy', cornerSquare: 'square', cornerDot: 'square', cornerCustom: true, cornerColor: '#c2185b' },
    midnight: { mode: 'gradient', gradientType: 'linear', c1: '#1e3a8a', c2: '#7c3aed', rotation: 45, dotStyle: 'dots', cornerSquare: 'extra-rounded', cornerDot: 'dot', cornerCustom: false },
    gold: { mode: 'gradient', gradientType: 'linear', c1: '#f59e0b', c2: '#b45309', rotation: 135, dotStyle: 'classy-rounded', cornerSquare: 'square', cornerDot: 'square', cornerCustom: false },
    mint: { mode: 'gradient', gradientType: 'radial', c1: '#06b6d4', c2: '#34d399', rotation: 0, dotStyle: 'extra-rounded', cornerSquare: 'extra-rounded', cornerDot: 'dot', cornerCustom: false },
    rose: { mode: 'gradient', gradientType: 'linear', c1: '#f43f5e', c2: '#be123c', rotation: 90, dotStyle: 'rounded', cornerSquare: 'square', cornerDot: 'dot', cornerCustom: true, cornerColor: '#881337' },
    slate: { mode: 'solid', fg: '#334155', dotStyle: 'classy', cornerSquare: 'square', cornerDot: 'square', cornerCustom: false },
    neon: { mode: 'gradient', gradientType: 'linear', c1: '#22c55e', c2: '#06b6d4', rotation: 45, dotStyle: 'square', cornerSquare: 'dot', cornerDot: 'dot', cornerCustom: false },
  };

  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    $('qr-color-mode').value = p.mode;
    if (p.mode === 'gradient') {
      $('qr-gradient-type').value = p.gradientType;
      $('qr-gradient-c1').value = p.c1;
      $('qr-gradient-c2').value = p.c2;
      $('qr-gradient-rotation').value = p.rotation;
      $('qr-gradient-rotation-val').textContent = p.rotation + '°';
    } else {
      $('qr-fg').value = p.fg;
    }
    $('qr-dot-style').value = p.dotStyle;
    $('qr-corner-square-style').value = p.cornerSquare;
    $('qr-corner-dot-style').value = p.cornerDot;
    $('qr-corner-custom-color').checked = !!p.cornerCustom;
    if (p.cornerCustom) $('qr-corner-color').value = p.cornerColor;
    toggleColorModeControls();
    toggleCornerColorControl();

    document.querySelectorAll('#qr-presets .preset-swatch').forEach((b) => {
      b.classList.toggle('active', b.dataset.preset === name);
    });
  }

  document.querySelectorAll('#qr-presets .preset-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isAuthed()) {
        openAuthModal('signin');
        return;
      }
      applyPreset(btn.dataset.preset);
    });
  });

  // Since generating now takes an explicit click, each swatch renders a real
  // miniature QR in its own style so the design is visible before choosing.
  // Short data + low error correction keeps the module grid readable at 56px.
  function renderPresetThumbnails() {
    if (typeof QRCodeStyling === 'undefined') return;
    document.querySelectorAll('#qr-presets .preset-swatch').forEach((btn) => {
      const p = PRESETS[btn.dataset.preset];
      if (!p) return;

      const colorOptions = p.mode === 'gradient'
        ? {
            gradient: {
              type: p.gradientType,
              rotation: (p.rotation * Math.PI) / 180,
              colorStops: [
                { offset: 0, color: p.c1 },
                { offset: 1, color: p.c2 },
              ],
            },
          }
        : { color: p.fg };
      const cornerOptions = p.cornerCustom ? { color: p.cornerColor } : colorOptions;

      try {
        const thumb = new QRCodeStyling({
          width: 56,
          height: 56,
          type: 'canvas',
          data: 'EQG',
          margin: 2,
          qrOptions: { errorCorrectionLevel: 'L' },
          backgroundOptions: { color: '#ffffff' },
          dotsOptions: Object.assign({ type: p.dotStyle }, colorOptions),
          cornersSquareOptions: Object.assign({ type: p.cornerSquare }, cornerOptions),
          cornersDotOptions: Object.assign({ type: p.cornerDot }, cornerOptions),
        });
        btn.innerHTML = '';
        thumb.append(btn);
      } catch (e) {
        // Leave the flat colour/gradient background as the fallback.
      }
    });
  }

  // Manually tweaking a style control invalidates the "active" preset badge.
  const STYLE_CONTROL_IDS = [
    'qr-dot-style', 'qr-color-mode', 'qr-fg', 'qr-gradient-type', 'qr-gradient-c1',
    'qr-gradient-c2', 'qr-gradient-rotation', 'qr-corner-square-style',
    'qr-corner-dot-style', 'qr-corner-custom-color', 'qr-corner-color',
  ];
  STYLE_CONTROL_IDS.forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener('input', () => {
      document.querySelectorAll('#qr-presets .preset-swatch').forEach((b) => b.classList.remove('active'));
    });
  });

  $('qr-color-mode').addEventListener('change', () => {
    if ($('qr-color-mode').value === 'gradient' && !isAuthed()) {
      $('qr-color-mode').value = 'solid';
      openAuthModal('signin');
      return;
    }
    toggleColorModeControls();
  });
  $('qr-gradient-type').addEventListener('change', () => { toggleColorModeControls(); });
  $('qr-corner-custom-color').addEventListener('change', () => {
    if ($('qr-corner-custom-color').checked && !isAuthed()) {
      $('qr-corner-custom-color').checked = false;
      openAuthModal('signin');
      return;
    }
    toggleCornerColorControl();
  });

  // ---------- QR rendering ----------
  // qr-code-styling draws to canvas asynchronously (it rasterizes an internal
  // SVG), so we track the in-flight render and only draw the logo overlay —
  // and only let downloads proceed — once that promise has resolved.
  let qrRenderToken = 0;
  let qrRenderPromise = Promise.resolve();
  let currentQrInstance = null; // kept for Pro's true-vector SVG export

  async function renderQr() {
    const token = ++qrRenderToken;
    const payload = buildQrPayload();
    const size = parseInt($('qr-size').value, 10);
    const bg = $('qr-bg').value;
    const ecl = $('qr-ecl').value;

    if (!payload) {
      qrContainer.innerHTML = '';
      setError('Enter some content to generate a QR code.');
      return;
    }

    const dotsOptions = Object.assign(
      { type: $('qr-dot-style').value },
      buildColorOptions()
    );

    let cornersSquareOptions = { type: $('qr-corner-square-style').value };
    let cornersDotOptions = { type: $('qr-corner-dot-style').value };
    if ($('qr-corner-custom-color').checked) {
      const cornerColor = $('qr-corner-color').value;
      cornersSquareOptions.color = cornerColor;
      cornersDotOptions.color = cornerColor;
    } else {
      Object.assign(cornersSquareOptions, buildColorOptions());
      Object.assign(cornersDotOptions, buildColorOptions());
    }

    try {
      const qr = new QRCodeStyling({
        width: size,
        height: size,
        type: 'canvas',
        data: payload,
        margin: Math.round(size * 0.03),
        qrOptions: { errorCorrectionLevel: ecl },
        backgroundOptions: { color: bg },
        dotsOptions,
        cornersSquareOptions,
        cornersDotOptions,
      });
      qrContainer.innerHTML = '';
      qr.append(qrContainer);
      currentQrInstance = qr;

      // Waiting on getRawData resolves only after the canvas pixels are
      // actually painted, since the constructor's own drawing is async.
      await qr.getRawData('png');
      if (token !== qrRenderToken) return; // superseded by a newer render

      setError('');

      const canvas = getQrCanvas();
      if (state.logoImage && canvas) {
        drawLogoOnCanvas(canvas, state.logoImage, size, bg);
      }
      // Order matters: the frame wraps the code, and the credit strip then
      // sits underneath the whole thing.
      if (canvas) applyFrame(canvas, bg);
      if (canvas) addWatermarkIfFree(canvas, bg);
    } catch (err) {
      if (token !== qrRenderToken) return;
      setError(err.message || 'Could not generate QR code with this data.');
    }
  }

  // Non-Pro generations get a small "EzyQRGen.com" credit strip below the
  // code. Upgrading to Pro removes it. Reads the canvas's own dimensions
  // rather than the configured QR size, since a frame may have grown it.
  function addWatermarkIfFree(canvas, bg) {
    if (isPro()) return;

    const w = canvas.width;
    const h = canvas.height;
    const footerHeight = Math.max(26, Math.round(w * 0.09));

    const snapshot = document.createElement('canvas');
    snapshot.width = w;
    snapshot.height = h;
    snapshot.getContext('2d').drawImage(canvas, 0, 0);

    canvas.width = w;
    canvas.height = h + footerHeight;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h + footerHeight);
    ctx.drawImage(snapshot, 0, 0);

    ctx.fillStyle = getWatermarkTextColor(bg);
    ctx.font = `600 ${Math.round(footerHeight * 0.42)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EzyQRGen.com', w / 2, h + footerHeight / 2);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function contrastTextOn(hex) {
    const c = (hex || '#000000').replace('#', '');
    if (c.length !== 6) return '#ffffff';
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#111827' : '#ffffff';
  }

  // Wraps the finished code in a border, optionally with a captioned bar.
  // Grows the canvas rather than shrinking the code, so the modules stay the
  // size the user asked for and scannability is unaffected.
  function applyFrame(canvas, bg) {
    const style = $('qr-frame-style').value;
    if (style === 'none') return;

    const w = canvas.width;
    const h = canvas.height;
    const color = $('qr-frame-color').value;
    const border = Math.max(3, Math.round(w * 0.018));
    // Padding here is not cosmetic: the frame line has to sit outside the
    // code's 4-module quiet zone or scanners cannot lock onto the pattern.
    // Sized for the worst case — a short payload, whose few large modules make
    // 4 modules a bigger absolute margin than a dense code needs.
    const pad = Math.max(24, Math.round(w * 0.15));
    const hasLabel = style === 'label-below' || style === 'label-above';
    const labelH = hasLabel ? Math.max(30, Math.round(w * 0.135)) : 0;

    const newW = w + (border + pad) * 2;
    const newH = h + (border + pad) * 2 + labelH;

    const snapshot = document.createElement('canvas');
    snapshot.width = w;
    snapshot.height = h;
    snapshot.getContext('2d').drawImage(canvas, 0, 0);

    canvas.width = newW;
    canvas.height = newH;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, newW, newH);

    const radius = Math.round(newW * 0.05);

    if (hasLabel) {
      // Fill the caption bar, clipped to the rounded outline so its outer
      // corners follow the frame instead of poking out square.
      const barY = style === 'label-above' ? border : newH - border - labelH;
      ctx.save();
      roundRectPath(ctx, border / 2, border / 2, newW - border, newH - border, radius);
      ctx.clip();
      ctx.fillStyle = color;
      ctx.fillRect(0, barY, newW, labelH);
      ctx.restore();

      const text = ($('qr-frame-text').value || 'SCAN ME').trim().toUpperCase();
      ctx.fillStyle = contrastTextOn(color);
      ctx.font = `700 ${Math.round(labelH * 0.4)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, newW / 2, barY + labelH / 2);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = border;
    roundRectPath(ctx, border / 2, border / 2, newW - border, newH - border, radius);
    ctx.stroke();

    ctx.drawImage(snapshot, border + pad, border + pad + (style === 'label-above' ? labelH : 0));
  }

  function getWatermarkTextColor(hex) {
    const c = (hex || '#ffffff').replace('#', '');
    if (c.length !== 6) return '#6b7280';
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#6b7280' : '#d1d5db';
  }

  function drawLogoOnCanvas(canvas, img, size, bg) {
    const ctx = canvas.getContext('2d');
    const logoSize = size * 0.22;
    const cx = size / 2;
    const cy = size / 2;
    const radius = logoSize / 2 + logoSize * 0.12;

    // White (or background-colored) circular backing so the logo stays scannable.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.restore();

    // Center-crop the source image to a square so non-square uploads aren't stretched.
    const srcSize = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const srcX = ((img.naturalWidth || img.width) - srcSize) / 2;
    const srcY = ((img.naturalHeight || img.height) - srcSize) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, logoSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      img,
      srcX, srcY, srcSize, srcSize,
      cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize
    );
    ctx.restore();
  }

  $('qr-logo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      state.logoImage = img;

      // A logo covers part of the code, so bump error correction to High
      // (remember the prior choice in case the user removes the logo).
      const eclSelect = $('qr-ecl');
      if (eclSelect.value !== 'H') {
        state.previousEcl = eclSelect.value;
        eclSelect.value = 'H';
      }

      $('qr-logo-preview').src = img.src;
      $('qr-logo-preview').classList.remove('hidden');
      $('qr-logo-clear').classList.remove('hidden');
      $('qr-logo-hint').textContent = 'Error correction was raised to High so the code still scans with the image on top.';
    };
    img.src = URL.createObjectURL(file);
  });

  $('qr-logo-clear').addEventListener('click', () => {
    state.logoImage = null;
    $('qr-logo').value = '';
    $('qr-logo-preview').classList.add('hidden');
    $('qr-logo-preview').src = '';
    $('qr-logo-clear').classList.add('hidden');
    $('qr-logo-hint').textContent = '';
    if (state.previousEcl) {
      $('qr-ecl').value = state.previousEcl;
      state.previousEcl = null;
    }
  });

  // ---------- Barcode rendering ----------
  function renderBarcode() {
    const format = $('barcode-format').value;
    const value = $('barcode-value').value.trim();
    const fg = $('barcode-fg').value;
    const bg = $('barcode-bg').value;
    const width = parseFloat($('barcode-width').value);
    const height = parseInt($('barcode-height').value, 10);
    const displayValue = $('barcode-show-text').checked;

    if (!value) {
      setError('Enter a value to encode.');
      barcodeSvg.innerHTML = '';
      return;
    }

    try {
      JsBarcode(barcodeSvg, value, {
        format,
        lineColor: fg,
        background: bg,
        width,
        height,
        displayValue,
        margin: 10,
      });
      setError('');
    } catch (err) {
      setError('Invalid data for ' + format + ' format.');
      barcodeSvg.innerHTML = '';
    }
  }

  // ---------- Range value labels ----------
  $('qr-size').addEventListener('input', () => {
    $('qr-size-val').textContent = $('qr-size').value;
  });
  $('qr-gradient-rotation').addEventListener('input', () => {
    $('qr-gradient-rotation-val').textContent = $('qr-gradient-rotation').value + '°';
  });
  $('barcode-width').addEventListener('input', () => {
    $('barcode-width-val').textContent = $('barcode-width').value;
  });
  $('barcode-height').addEventListener('input', () => {
    $('barcode-height-val').textContent = $('barcode-height').value;
  });

  // ---------- Central render ----------
  function render() {
    if (state.mode === 'qr') {
      qrRenderPromise = renderQr();
    } else {
      renderBarcode();
    }
  }

  // Generation only happens when the user explicitly clicks Generate —
  // editing fields/colors/styles just updates the form until then.
  function handleGenerateClick() {
    render(); // always immediate — never blocked by the rate-limit check
    checkRateLimitAndMaybeShowAd(); // fire-and-forget; may pop the bonus-ad modal
  }
  $('qr-generate-btn').addEventListener('click', handleGenerateClick);
  $('barcode-generate-btn').addEventListener('click', handleGenerateClick);

  // ---------- Downloads ----------
  $('download-png').addEventListener('click', async () => {
    if (state.mode === 'qr') {
      await qrRenderPromise;
      const canvas = getQrCanvas();
      if (canvas) downloadCanvasPng(canvas, 'qrcode.png');
    } else {
      svgToPng(barcodeSvg, 'barcode.png');
    }
  });

  $('download-svg').addEventListener('click', async () => {
    if (state.mode === 'qr') {
      if (!isPro()) {
        window.location.href = 'pricing.html';
        return;
      }
      await qrRenderPromise;
      if (currentQrInstance) currentQrInstance.download({ name: 'qrcode', extension: 'svg' });
    } else {
      downloadSvg(barcodeSvg, 'barcode.svg');
    }
  });

  function downloadCanvasPng(canvas, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function downloadSvg(svg, filename) {
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svg);
    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const blob = new Blob([source], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }

  function svgToPng(svg, filename) {
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const bbox = svg.getBBox ? svg.getBoundingClientRect() : { width: img.width, height: img.height };
      const w = svg.width.baseVal.value || img.width || 400;
      const h = svg.height.baseVal.value || img.height || 200;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = $('barcode-bg').value;
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      downloadCanvasPng(canvas, filename);
    };
    img.src = url;
  }

  // Use-case landing pages link straight to the relevant tab (e.g. /?type=wifi).
  // Matched by comparing against the buttons that exist rather than building a
  // selector from the query string.
  const requestedType = new URLSearchParams(window.location.search).get('type');
  if (requestedType) {
    document.querySelectorAll('.type-btn').forEach((b) => {
      if (b.dataset.type === requestedType) b.click();
    });
  }

  // Initial render
  render();
  renderPresetThumbnails();
})();
