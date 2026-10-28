(function () {
  'use strict';

  var API_BASE = 'https://alpha-auth.murwanashyakadieumerci540.workers.dev';

  var LS = {
    token: 'alpha_token', user: 'alpha_user', theme: 'alpha_theme', accent: 'alpha_settings_accent',
    font: 'alpha_font', density: 'alpha_density', wallpaper: 'alpha_wallpaper',
    wallpaperCustom: 'alpha_wallpaper_custom', dataSaver: 'alpha_datasaver'
  };
  var DEFAULT_ACCENT = '#4f46e5';

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

  function safeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function safeSet(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }
  function safeJSON(str, fallback) { if (!str) return fallback; try { return JSON.parse(str); } catch (e) { return fallback; } }

  // ---------- optional Shell wrapper ----------
  // FIXED: this used to wrap EVERY page in Shell.html automatically. On GitHub Pages
  // file names are case-sensitive, so a missing/renamed Shell.html gave a blank page,
  // and every page loaded twice (outer shell + inner iframe), which was slow.
  // Now it is OFF by default. To turn it back on for a page, put this BEFORE the script tag:
  //   <script>window.ALPHA_USE_SHELL = true;</script>
  var redirecting = false;
  function bootstrapShell() {
    if (window.ALPHA_USE_SHELL !== true) return;
    var page = (window.location.pathname.split('/').pop() || 'index.html');
    var SKIP = { 'shell.html': 1, 'login.html': 1, 'register.html': 1 };
    if (SKIP[page.toLowerCase()]) return;
    if (window.top !== window) return;
    if (!safeGet(LS.token)) return;
    var qs = window.location.search;
    if (page.toLowerCase() === 'calls.html' && /[?&](accept_room|start_call)=/.test(qs)) return;
    redirecting = true;
    window.location.replace('Shell.html?page=' + encodeURIComponent(page + qs + window.location.hash));
  }
  bootstrapShell();
  if (redirecting) return;

  // ---------- color math ----------
  function hexToRgb(hex) {
    hex = (hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var num = parseInt(hex, 16);
    if (isNaN(num)) return { r: 79, g: 70, b: 229 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  function toHex(n) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); }
  function shade(hex, percent) {
    var c = hexToRgb(hex), t = percent < 0 ? 0 : 255, p = Math.abs(percent);
    return '#' + toHex(c.r + (t - c.r) * p) + toHex(c.g + (t - c.g) * p) + toHex(c.b + (t - c.b) * p);
  }
  function rgba(hex, a) { var c = hexToRgb(hex); return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')'; }

  // ---------- icons (lucide, only if a page loads it) ----------
  var iconsPending = false;
  function renderIcons() {
    if (!window.lucide || typeof window.lucide.createIcons !== 'function') return;
    if (!document.querySelector('[data-lucide]:not(svg)')) return;
    try { window.lucide.createIcons(); } catch (e) {}
  }
  function scheduleRenderIcons() {
    if (iconsPending) return;
    iconsPending = true;
    var run = function () { iconsPending = false; renderIcons(); };
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 300 }); else requestAnimationFrame(run);
  }
  function initIconObserver() {
    // Only watch the DOM when lucide is actually present (saves work on pages that don't use it)
    if (!window.lucide) return;
    renderIcons();
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function (m) {
      for (var i = 0; i < m.length; i++) if (m[i].addedNodes && m[i].addedNodes.length) { scheduleRenderIcons(); break; }
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (typeof window.refreshIcons !== 'function') window.refreshIcons = renderIcons;

  // ---------- theme ----------
  function applyTheme(theme) {
    theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    return theme;
  }
  function initTheme() {
    var saved = safeGet(LS.theme);
    if (!saved) saved = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    return applyTheme(saved);
  }

  // ---------- accent ----------
  function applyAccent(color) {
    color = color || safeGet(LS.accent) || DEFAULT_ACCENT;
    var light = shade(color, 0.35), dark = shade(color, -0.25), root = document.documentElement.style;
    var pairs = {
      '--primary': color, '--primary-light': light, '--primary-dark': dark,
      '--accent': light, '--primary-l': rgba(color, 0.12), '--primary-l2': rgba(color, 0.06),
      '--accent-l': rgba(light, 0.12), '--blue': color, '--blue2': light, '--alpha': color, '--alpha2': light,
      '--primary-rgb': hexToRgb(color).r + ',' + hexToRgb(color).g + ',' + hexToRgb(color).b,
      '--primary-a08': rgba(color, 0.08), '--primary-a15': rgba(color, 0.15), '--primary-a16': rgba(color, 0.16),
      '--primary-a20': rgba(color, 0.20), '--primary-a25': rgba(color, 0.25), '--primary-a30': rgba(color, 0.30),
      '--primary-a35': rgba(color, 0.35), '--primary-a40': rgba(color, 0.40),
      '--violet': color, '--violet-dark': dark, '--violet-light': light, '--violet-l': rgba(color, 0.14),
      '--indigo': dark, '--coral': light, '--iris': color
    };
    for (var k in pairs) root.setProperty(k, pairs[k]);
    safeSet(LS.accent, color);
  }

  function injectNavIconBadge() {
    var style = document.getElementById('alpha-common-navicon');
    if (!style) { style = document.createElement('style'); style.id = 'alpha-common-navicon'; document.head.appendChild(style); }
    style.textContent =
      '.app-sidebar .app-nav-item svg.lucide{width:16px;height:16px;padding:7px;box-sizing:content-box;border-radius:10px;background:var(--surface2,rgba(0,0,0,.04));color:var(--text2,var(--muted,#73767d));flex-shrink:0;transition:background .18s,color .18s,box-shadow .18s;}' +
      '.app-sidebar .app-nav-item:hover svg.lucide{background:var(--surface-solid,#fff);color:var(--text,#111214);}' +
      '.app-sidebar .app-nav-item.active svg.lucide{background:linear-gradient(135deg,var(--primary,#4f46e5),var(--primary-light,#818cf8));color:#fff;box-shadow:0 4px 10px var(--primary-a30,rgba(79,70,229,.32));}' +
      '.app-sidebar .app-nav-item.logout svg.lucide{background:transparent;}' +
      '.app-sidebar .app-nav-item.logout:hover svg.lucide{background:var(--danger-l,rgba(255,59,79,.12));color:var(--danger,#E5484D);}' +
      '.app-bottom-nav button.active svg.lucide,.mobile-bottom-nav button.active svg.lucide{color:var(--primary,#4f46e5);}' +
      '.app-bottom-nav button.active,.mobile-bottom-nav button.active{color:var(--primary,#4f46e5);}';
  }

  function applyFont(id) {
    id = id || safeGet(LS.font) || 'default';
    var stack = FONT_STACKS[id] || FONT_STACKS.default;
    var style = document.getElementById('alpha-common-font');
    if (!style) { style = document.createElement('style'); style.id = 'alpha-common-font'; document.head.appendChild(style); }
    style.textContent = 'html{--fb:' + stack + ';}body,input,textarea,button,select{font-family:' + stack + ' !important;}';
    safeSet(LS.font, id);
  }

  function applyDensity(id) {
    id = id || safeGet(LS.density) || 'comfortable';
    document.documentElement.setAttribute('data-density', id);
    var style = document.getElementById('alpha-common-density');
    if (!style) { style = document.createElement('style'); style.id = 'alpha-common-density'; document.head.appendChild(style); }
    style.textContent = id === 'compact'
      ? 'html[data-density="compact"] body{zoom:.93;}html[data-density="compact"]{--r-sm:6px;--r-md:9px;--r-lg:12px;--r-xl:16px;--r-2xl:19px;}'
      : '';
    safeSet(LS.density, id);
  }

  function isLowData() {
    var c = navigator.connection || {};
    return safeGet(LS.dataSaver) === '1' || c.saveData === true || /2g$/.test(c.effectiveType || '');
  }
  function applyDataSaver() {
    var on = isLowData();
    document.documentElement.toggleAttribute('data-lowdata', on);
    var style = document.getElementById('alpha-common-lowdata');
    if (on && !style && document.head) {
      style = document.createElement('style'); style.id = 'alpha-common-lowdata';
      style.textContent = 'html[data-lowdata] *{backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}';
      document.head.appendChild(style);
    } else if (!on && style) style.remove();
  }
  if (navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener('change', applyDataSaver);

  function applyWallpaper() {
    var id = safeGet(LS.wallpaper) || 'none';
    var target = document.getElementById('messages') || document.getElementById('chat-messages');
    if (!target) return;
    if (id === 'custom') {
      var data = safeGet(LS.wallpaperCustom);
      target.style.backgroundImage = data ? 'url(' + data + ')' : 'none';
      target.style.backgroundSize = 'cover'; target.style.backgroundPosition = 'center';
    } else {
      var w = WALLPAPERS.find(function (x) { return x.id === id; });
      target.style.backgroundImage = w && w.css !== 'none' ? w.css : 'none';
      target.style.backgroundSize = ''; target.style.backgroundPosition = '';
    }
  }

  // ---------- session ----------
  function getToken() { return safeGet(LS.token); }
  function getUser() {
    var raw = safeJSON(safeGet(LS.user), null);
    if (!raw) return null;
    var cu = raw.CU || raw.cu || {}, up = raw.UP || raw.up || {};
    return {
      id: cu.id || cu.email || null, email: cu.email || cu.id || null,
      display_name: up.display_name || (cu.email ? cu.email.split('@')[0] : 'User'),
      bio: up.bio || '', avatar_color: up.avatar_color || 'av-blue', avatar_url: up.avatar_url || null
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
    (window.top || window).location.href = redirectTo || 'login.html';
  }

  function api(path, opts) {
    opts = opts || {};
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, opts.timeout || 20000);
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (typeof FormData !== 'undefined' && opts.body instanceof FormData) delete headers['Content-Type'];
    var tok = getToken();
    if (tok) headers.Authorization = 'Bearer ' + tok;
    var init = Object.assign({}, opts, { headers: headers, signal: ctl.signal });
    delete init.timeout;
    return fetch(API_BASE + path, init).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (res.status === 401 && tok) { logout(); throw new Error('Session expired'); }
        if (!res.ok) throw new Error((data && data.error) || 'Request failed');
        return data;
      });
    }).catch(function (e) {
      if (e && e.name === 'AbortError') throw new Error('Connection too slow. Please try again.');
      throw e;
    }).then(function (d) { clearTimeout(timer); return d; }, function (e) { clearTimeout(timer); throw e; });
  }

  function compressImage(file, maxSide, quality) {
    maxSide = maxSide || 1280; quality = quality || 0.72;
    if (!file || !/^image\/(jpeg|png|webp|heic|heif)/i.test(file.type) || file.size < 200 * 1024) return Promise.resolve(file);
    var load = window.createImageBitmap ? createImageBitmap(file) : new Promise(function (ok, no) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () { URL.revokeObjectURL(u); ok(img); };
      img.onerror = function () { no(new Error('Not a valid image')); };
      img.src = u;
    });
    return load.then(function (img) {
      var k = Math.min(1, maxSide / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      if (img.close) img.close();
      return new Promise(function (ok) { c.toBlob(function (b) { ok(b && b.size < file.size ? b : file); }, 'image/jpeg', quality); });
    }).catch(function () { return file; });
  }

  function toast(msg, type) {
    if (typeof window.toast === 'function' && window.toast !== toast) { window.toast(msg, type); return; }
    var wrap = document.getElementById('alpha-common-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div'); wrap.id = 'alpha-common-toast-wrap';
      wrap.style.cssText = 'position:fixed;top:calc(18px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
      document.body.appendChild(wrap);
    }
    var t = document.createElement('div');
    t.textContent = msg; t.setAttribute('role', 'status');
    t.style.cssText = 'background:' + (type === 'error' ? '#E5484D' : type === 'info' ? '#4f46e5' : '#16181c') + ';color:#fff;padding:10px 18px;border-radius:99px;font:600 13px Inter,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;transition:opacity .2s;';
    wrap.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    setTimeout(function () { t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 250); }, 2400);
  }

  initTheme();
  applyAccent(safeGet(LS.accent) || DEFAULT_ACCENT);
  applyDataSaver();

  document.addEventListener('DOMContentLoaded', function () {
    applyFont(safeGet(LS.font)); applyDensity(safeGet(LS.density));
    applyWallpaper(); injectNavIconBadge(); initIconObserver();
  });

  window.addEventListener('storage', function (e) {
    if (e.key === LS.theme) applyTheme(e.newValue);
    else if (e.key === LS.accent) applyAccent(e.newValue);
    else if (e.key === LS.font) applyFont(e.newValue);
    else if (e.key === LS.density) applyDensity(e.newValue);
    else if (e.key === LS.dataSaver) applyDataSaver();
    else if (e.key === LS.wallpaper || e.key === LS.wallpaperCustom) applyWallpaper();
  });

  window.AlphaCommon = {
    API_BASE: API_BASE, DEFAULT_ACCENT: DEFAULT_ACCENT, WALLPAPERS: WALLPAPERS,
    applyTheme: applyTheme, applyAccent: applyAccent, setFont: applyFont, setDensity: applyDensity,
    applyWallpaper: applyWallpaper, applyDataSaver: applyDataSaver, isLowData: isLowData,
    injectNavIconBadge: injectNavIconBadge, renderIcons: renderIcons, getToken: getToken, getUser: getUser,
    isLoggedIn: isLoggedIn, requireAuth: requireAuth, logout: logout, api: api,
    compressImage: compressImage, toast: toast
  };
})();
