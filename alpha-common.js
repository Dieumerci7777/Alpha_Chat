(function () {
  'use strict';

  var LS = {
    token: 'alpha_token',
    user: 'alpha_user',
    theme: 'alpha_theme',
    accent: 'alpha_settings_accent',
    font: 'alpha_font',
    density: 'alpha_density',
    wallpaper: 'alpha_wallpaper',
    wallpaperCustom: 'alpha_wallpaper_custom'
  };

  var DEFAULT_ACCENT = '#4f46e5'; // Alpha's actual brand indigo (index.html's --primary), also the "(default)" swatch in Settings

  var WALLPAPERS = [
    { id: 'none', label: 'Default', css: 'none' },
    { id: 'dawn', label: 'Dawn', css: 'linear-gradient(160deg, rgba(51,102,255,.12), rgba(92,133,255,.08))' },
    { id: 'forest', label: 'Forest', css: 'linear-gradient(160deg, rgba(16,185,129,.12), rgba(51,102,255,.08))' },
    { id: 'dusk', label: 'Dusk', css: 'linear-gradient(160deg, rgba(92,133,255,.15), rgba(229,72,77,.06))' },
    { id: 'mono', label: 'Mono', css: 'repeating-linear-gradient(45deg, rgba(120,120,120,.06) 0 2px, transparent 2px 14px)' }
  ];

  var FONT_STACKS = {
    default: "'Space Grotesk','Inter',-apple-system,BlinkMacSystemFont,sans-serif",
    inter: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
    poppins: "'Poppins','Inter',sans-serif",
    system: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
  };

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }
  function safeJSON(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }

  // ---------- color math (so ANY accent, not just the 4 presets, works) ----------
  function hexToRgb(hex) {
    hex = (hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var num = parseInt(hex, 16);
    if (isNaN(num)) return { r: 51, g: 102, b: 255 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  function toHex(n) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); }
  function shade(hex, percent) {
    var c = hexToRgb(hex);
    var t = percent < 0 ? 0 : 255;
    var p = Math.abs(percent);
    var r = c.r + (t - c.r) * p, g = c.g + (t - c.g) * p, b = c.b + (t - c.b) * p;
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }
  function rgba(hex, alpha) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
  }

  // ---------- icons (lucide) ----------
  // Several pages load lucide.js but never call lucide.createIcons(), so
  // their <i data-lucide="..."> icons were rendering as nothing. A couple
  // even call a global refreshIcons() that didn't exist anywhere. This
  // gives every page one real, always-on icon renderer: it draws icons
  // already in the page AND any added later (feed items, modals, toasts)
  // without every page having to remember to call it itself.
  var iconsPending = false;
  function renderIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { window.lucide.createIcons(); } catch (e) {}
    }
  }
  function scheduleRenderIcons() {
    if (iconsPending) return;
    iconsPending = true;
    requestAnimationFrame(function () { iconsPending = false; renderIcons(); });
  }
  function initIconObserver() {
    renderIcons();
    if (!window.MutationObserver || !document.body) return;
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes && mutations[i].addedNodes.length) { scheduleRenderIcons(); break; }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  // Global fallbacks: don't overwrite a page's own working implementation.
  if (typeof window.refreshIcons !== 'function') window.refreshIcons = renderIcons;

  // ---------- theme ----------
  function applyTheme(theme) {
    theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    return theme;
  }
  function initTheme() {
    var saved = safeGet(LS.theme) || 'light';
    return applyTheme(saved);
  }

  // ---------- accent color (mapped onto every naming convention in use) ----------
  function applyAccent(color) {
    color = color || safeGet(LS.accent) || DEFAULT_ACCENT;
    var light = shade(color, 0.35);
    var dark = shade(color, -0.25);
    var root = document.documentElement.style;

    var pairs = {
      // shared "Alpha Premium" system (ai/calls/chat/events/explore/groups/status/vault/settings)
      '--primary': color, '--primary-light': light, '--primary-dark': dark,
      '--accent': light, '--primary-l': rgba(color, 0.12), '--primary-l2': rgba(color, 0.06),
      '--accent-l': rgba(light, 0.12),
      // index.html's naming
      '--blue': color, '--blue2': light,
      // reels.html's naming
      '--alpha': color, '--alpha2': light,
      // index.html's hardcoded rgba(79,70,229,X) tints/shadows, keyed by alpha so any accent works.
      // Left as raw alpha-tint vars (not --primary-bg directly) so index.html's own light/dark
      // stylesheet rules can still each pick their own alpha level per theme.
      '--primary-a08': rgba(color, 0.08), '--primary-a15': rgba(color, 0.15),
      '--primary-a16': rgba(color, 0.16), '--primary-a20': rgba(color, 0.20),
      '--primary-a25': rgba(color, 0.25), '--primary-a30': rgba(color, 0.30),
      '--primary-a35': rgba(color, 0.35), '--primary-a40': rgba(color, 0.40),
      // login.html's naming
      '--violet': color, '--violet-dark': dark, '--violet-light': light,
      '--violet-l': rgba(color, 0.14), '--indigo': dark, '--coral': light, '--iris': color
    };
    for (var k in pairs) root.setProperty(k, pairs[k]);
    safeSet(LS.accent, color);
  }

  // ---------- nav icon badges (make every page's nav icons look like index.html's) ----------
  // index.html wraps each sidebar icon in a 30px rounded-square "badge" that goes from a plain
  // neutral chip to a blue gradient chip when active. The other pages' drawer/off-canvas nav
  // (.app-sidebar .app-nav-item) and bottom tab bar (.app-bottom-nav) only had plain icons with
  // no badge, so they read as a different app. This gives them the same badge treatment using
  // only the single brand blue (--primary/--primary-light), with no new colors introduced.
  function injectNavIconBadge() {
    var style = document.getElementById('alpha-common-navicon');
    if (!style) {
      style = document.createElement('style');
      style.id = 'alpha-common-navicon';
      document.head.appendChild(style);
    }
    style.textContent =
      '.app-sidebar .app-nav-item svg.lucide{' +
        'width:16px;height:16px;padding:7px;box-sizing:content-box;border-radius:10px;' +
        'background:var(--surface2,rgba(0,0,0,.04));color:var(--text2,var(--muted,#73767d));' +
        'flex-shrink:0;transition:background .18s,color .18s,box-shadow .18s;' +
      '}' +
      '.app-sidebar .app-nav-item:hover svg.lucide{background:var(--surface-solid,#fff);color:var(--text,#111214);}' +
      '.app-sidebar .app-nav-item.active svg.lucide{' +
        'background:linear-gradient(135deg,var(--primary,#3366FF),var(--primary-light,#5C85FF));' +
        'color:#fff;box-shadow:0 4px 10px rgba(51,102,255,.32);' +
      '}' +
      '.app-sidebar .app-nav-item.logout svg.lucide{background:transparent;}' +
      '.app-sidebar .app-nav-item.logout:hover svg.lucide{background:var(--danger-l,rgba(255,59,79,.12));color:var(--danger,#E5484D);}' +
      '.app-bottom-nav button.active svg.lucide,.mobile-bottom-nav button.active svg.lucide{color:var(--primary,#3366FF);}' +
      '.app-bottom-nav button.active,.mobile-bottom-nav button.active{color:var(--primary,#3366FF);}';
  }

  // ---------- font ----------
  function applyFont(id) {
    id = id || safeGet(LS.font) || 'default';
    var stack = FONT_STACKS[id] || FONT_STACKS.default;
    var style = document.getElementById('alpha-common-font');
    if (!style) {
      style = document.createElement('style');
      style.id = 'alpha-common-font';
      document.head.appendChild(style);
    }
    // Headings keep the display stack; body text follows the chosen font.
    style.textContent = 'html{--fb:' + stack + ';}' +
      'body,input,textarea,button,select{font-family:' + stack + ' !important;}';
    safeSet(LS.font, id);
  }

  // ---------- density ----------
  function applyDensity(id) {
    id = id || safeGet(LS.density) || 'comfortable';
    document.documentElement.setAttribute('data-density', id);
    var style = document.getElementById('alpha-common-density');
    if (!style) {
      style = document.createElement('style');
      style.id = 'alpha-common-density';
      document.head.appendChild(style);
    }
    style.textContent = id === 'compact'
      ? 'html[data-density="compact"] body{zoom:.93;}' +
        'html[data-density="compact"]{--r-sm:6px;--r-md:9px;--r-lg:12px;--r-xl:16px;--r-2xl:19px;}'
      : '';
    safeSet(LS.density, id);
  }

  // ---------- wallpaper (Settings -> synced into Chat) ----------
  function applyWallpaper() {
    var id = safeGet(LS.wallpaper) || 'none';
    // chat.html's real message-list container is #messages; #chat-messages is
    // kept as a fallback in case a future page names it that way instead.
    var target = document.getElementById('messages') || document.getElementById('chat-messages');
    if (!target) return; // only Chat renders a wallpaper surface
    if (id === 'custom') {
      var data = safeGet(LS.wallpaperCustom);
      target.style.backgroundImage = data ? 'url(' + data + ')' : 'none';
      target.style.backgroundSize = 'cover';
      target.style.backgroundPosition = 'center';
    } else {
      var w = WALLPAPERS.find(function (x) { return x.id === id; });
      target.style.backgroundImage = w && w.css !== 'none' ? w.css : 'none';
      target.style.backgroundSize = '';
      target.style.backgroundPosition = '';
    }
  }

  // ---------- session ----------
  function getToken() { return safeGet(LS.token); }
  function getUser() {
    var raw = safeJSON(safeGet(LS.user), null);
    if (!raw) return null;
    var cu = raw.CU || raw.cu || {};
    var up = raw.UP || raw.up || {};
    return {
      id: cu.id || cu.email || null,
      email: cu.email || cu.id || null,
      display_name: up.display_name || (cu.email ? cu.email.split('@')[0] : 'User'),
      bio: up.bio || '',
      avatar_color: up.avatar_color || 'av-blue',
      avatar_url: up.avatar_url || null
    };
  }
  function isLoggedIn() { return !!(getToken() && getUser() && getUser().id); }
  function requireAuth(redirectTo) {
    if (isLoggedIn()) return true;
    window.location.href = redirectTo || 'login.html';
    return false;
  }
  function logout(redirectTo) {
    try { localStorage.removeItem(LS.token); localStorage.removeItem(LS.user); } catch (e) {}
    window.location.href = redirectTo || 'login.html';
  }

  // ---------- fallback toast (only used if a page doesn't define its own) ----------
  function toast(msg, type) {
    if (typeof window.toast === 'function' && window.toast !== toast) {
      window.toast(msg, type);
      return;
    }
    var wrap = document.getElementById('alpha-common-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'alpha-common-toast-wrap';
      wrap.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
      document.body.appendChild(wrap);
    }
    var t = document.createElement('div');
    var bg = type === 'error' ? '#E5484D' : (type === 'info' ? '#3366FF' : '#16181c');
    t.textContent = msg;
    t.style.cssText = 'background:' + bg + ';color:#fff;padding:10px 18px;border-radius:99px;font:600 13px Inter,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;transition:opacity .2s;';
    wrap.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 250);
    }, 2400);
  }

  // ---------- app-shell bootstrap ----------
  // Every real page (chat, vaults, explore, etc.) used to be opened as its own
  // top-level document, so an incoming call only rang if you happened to be on
  // calls.html, and starting a call meant that page owned it — navigate away
  // and the call died. Shell.html already solves both problems (it polls for
  // invites globally and keeps the call alive in the parent window while the
  // page underneath navigates freely), it just wasn't the thing people actually
  // landed on. This makes any top-level, logged-in page load hand itself to
  // Shell.html instead, with itself as the page Shell should display.
  function bootstrapShell() {
    var page = (window.location.pathname.split('/').pop() || 'index.html');
    var SKIP = { 'shell.html': 1, 'login.html': 1, 'register.html': 1 };
    if (SKIP[page.toLowerCase()]) return;
    if (window.top !== window) return; // already inside Shell (or some other frame) — leave it alone
    if (!getToken()) return; // nothing to ring for if we're not logged in
    var qs = window.location.search;
    // Don't hijack a call deep-link opened straight from a push notification —
    // calls.html handles accept_room/start_call itself when it's top-level.
    if (page.toLowerCase() === 'calls.html' && /[?&](accept_room|start_call)=/.test(qs)) return;
    var target = page + qs + window.location.hash;
    window.location.replace('Shell.html?page=' + encodeURIComponent(target));
  }
  bootstrapShell();

  // ---------- run immediately (before body renders) to avoid any flash ----------
  initTheme();
  applyAccent(safeGet(LS.accent) || DEFAULT_ACCENT);

  // ---------- run once DOM exists, for the bits that touch <body>/specific nodes ----------
  document.addEventListener('DOMContentLoaded', function () {
    applyFont(safeGet(LS.font));
    applyDensity(safeGet(LS.density));
    applyWallpaper();
    injectNavIconBadge();
    initIconObserver();
  });

  // ---------- keep every open tab in sync when a setting changes elsewhere ----------
  window.addEventListener('storage', function (e) {
    if (e.key === LS.theme) applyTheme(e.newValue);
    else if (e.key === LS.accent) applyAccent(e.newValue);
    else if (e.key === LS.font) applyFont(e.newValue);
    else if (e.key === LS.density) applyDensity(e.newValue);
    else if (e.key === LS.wallpaper || e.key === LS.wallpaperCustom) applyWallpaper();
  });

  window.AlphaCommon = {
    DEFAULT_ACCENT: DEFAULT_ACCENT,
    WALLPAPERS: WALLPAPERS,
    applyTheme: applyTheme,
    applyAccent: applyAccent,
    setFont: applyFont,
    setDensity: applyDensity,
    applyWallpaper: applyWallpaper,
    injectNavIconBadge: injectNavIconBadge,
    renderIcons: renderIcons,
    getToken: getToken,
    getUser: getUser,
    isLoggedIn: isLoggedIn,
    requireAuth: requireAuth,
    logout: logout,
    toast: toast
  };
})();