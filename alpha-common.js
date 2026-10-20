(function () {
  'use strict';

  var API_BASE = 'https://alpha-auth.murwanashyakadieumerci540.workers.dev';

  var LS = {
    token: 'alpha_token',
    user: 'alpha_user',
    theme: 'alpha_theme',
    accent: 'alpha_settings_accent',
    font: 'alpha_font',
    density: 'alpha_density',
    wallpaper: 'alpha_wallpaper',
    wallpaperCustom: 'alpha_wallpaper_custom',
    dataSaver: 'alpha_datasaver'
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

  // ---------- 0. leave early if we are about to be wrapped by Shell.html ----------
  // Before: the page kept downloading and running while the redirect happened, then loaded
  // a second time inside the shell. window.stop() cancels that wasted first load.
  var redirecting = false;
  function bootstrapShell() {
    var page = (window.location.pathname.split('/').pop() || 'index.html');
    var SKIP = { 'shell.html': 1, 'login.html': 1, 'register.html': 1 };
    if (SKIP[page.toLowerCase()]) return;
    if (window.top !== window) return;
    if (!safeGet(LS.token)) return;
    var qs = window.location.search;
    if (page.toLowerCase() === 'calls.html' && /[?&](accept_room|start_call)=/.test(qs)) return;
    var target = page + qs + window.location.hash;
    redirecting = true;
    window.location.replace('Shell.html?page=' + encodeURIComponent(target));
    try { window.stop(); } catch (e) {}
  }
  bootstrapShell();
  if (redirecting) return; // nothing else on this page matters, it is being replaced

  // ---------- color math ----------
  function hexToRgb(hex) {
    hex = (hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var num = parseInt(hex, 16);
    if (isNaN(num)) return { r: 79, g: 70, b: 229 }; // brand indigo (was the old blue)
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  function toHex(n) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); }
  function shade(hex, percent) {
    var c = hexToRgb(hex);
    var t = percent < 0 ? 0 : 255;
    var p = Math.abs(percent);
    return '#' + toHex(c.r + (t - c.r) * p) + toHex(c.g + (t - c.g) * p) + toHex(c.b + (t - c.b) * p);
  }
  function rgba(hex, alpha) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
  }

  // ---------- icons (lucide) ----------
  // Cheap guard: only call createIcons() when there is actually an un-rendered icon,
  // so feeds that add many nodes don't rescan the whole document every frame.
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
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 300 });
    else requestAnimationFrame(run);
  }
  function initIconObserver() {
    renderIcons();
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes && mutations[i].addedNodes.length) { scheduleRenderIcons(); break; }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (typeof window.refreshIcons !== 'function') window.refreshIcons = renderIcons;

  // ---------- theme (follows the phone's setting until the user picks one) ----------
  function applyTheme(theme) {
    theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    return theme;
  }
  function initTheme() {
    var saved = safeGet(LS.theme);
    if (!saved) {
      var prefersDark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
      saved = prefersDark ? 'dark' : 'light';
    }
    return applyTheme(saved);
  }

  // ---------- accent color ----------
  function applyAccent(color) {
    color = color || safeGet(LS.accent) || DEFAULT_ACCENT;
    var light = shade(color, 0.35);
    var dark = shade(color, -0.25);
    var root = document.documentElement.style;

    var pairs = {
      '--primary': color, '--primary-light': light, '--primary-dark': dark,
      '--accent': light, '--primary-l': rgba(color, 0.12), '--primary-l2': rgba(color, 0.06),
      '--accent-l': rgba(light, 0.12),
      '--blue': color, '--blue2': light,
      '--alpha': color, '--alpha2': light,
      '--primary-a08': rgba(color, 0.08), '--primary-a15': rgba(color, 0.15),
      '--primary-a16': rgba(color, 0.16), '--primary-a20': rgba(color, 0.20),
      '--primary-a25': rgba(color, 0.25), '--primary-a30': rgba(color, 0.30),
      '--primary-a35': rgba(color, 0.35), '--primary-a40': rgba(color, 0.40),
      '--violet': color, '--violet-dark': dark, '--violet-light': light,
      '--violet-l': rgba(color, 0.14), '--indigo': dark, '--coral': light, '--iris': color
    };
    for (var k in pairs) root.setProperty(k, pairs[k]);
    safeSet(LS.accent, color);
  }

  // ---------- nav icon badges ----------
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
        'background:linear-gradient(135deg,var(--primary,#4f46e5),var(--primary-light,#818cf8));' +
        'color:#fff;box-shadow:0 4px 10px var(--primary-a30,rgba(79,70,229,.32));' +   // follows the accent now
      '}' +
      '.app-sidebar .app-nav-item.logout svg.lucide{background:transparent;}' +
      '.app-sidebar .app-nav-item.logout:hover svg.lucide{background:var(--danger-l,rgba(255,59,79,.12));color:var(--danger,#E5484D);}' +
      '.app-bottom-nav button.active svg.lucide,.mobile-bottom-nav button.active svg.lucide{color:var(--primary,#4f46e5);}' +
      '.app-bottom-nav button.active,.mobile-bottom-nav button.active{color:var(--primary,#4f46e5);}';
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

  // ---------- low-data / low-end-phone mode ----------
  // On when: the user turned on "Data saver" in Settings, Android's Data Saver is on,
  // or the connection is 2G. Pages can read AlphaCommon.isLowData() (e.g. skip video
  // preloading) and CSS can use html[data-lowdata].
  function isLowData() {
    var c = navigator.connection || {};
    return safeGet(LS.dataSaver) === '1' || c.saveData === true || /2g$/.test(c.effectiveType || '');
  }
  function applyDataSaver() {
    var on = isLowData();
    document.documentElement.toggleAttribute('data-lowdata', on);
    var style = document.getElementById('alpha-common-lowdata');
    if (on && !style && document.head) {
      style = document.createElement('style');
      style.id = 'alpha-common-lowdata';
      // backdrop-filter is the single most expensive effect on cheap Android GPUs
      style.textContent = 'html[data-lowdata] *{backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}';
      document.head.appendChild(style);
    } else if (!on && style) {
      style.remove();
    }
  }
  if (navigator.connection && navigator.connection.addEventListener) {
    navigator.connection.addEventListener('change', applyDataSaver);
  }

  // ---------- wallpaper ----------
  function applyWallpaper() {
    var id = safeGet(LS.wallpaper) || 'none';
    var target = document.getElementById('messages') || document.getElementById('chat-messages');
    if (!target) return;
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
    // If we are inside Shell.html, leave the shell too
    (window.top || window).location.href = redirectTo || 'login.html';
  }

  // ---------- shared API helper ----------
  // One place for: base URL, auth header, 20 s timeout (slow networks otherwise hang forever),
  // clean error messages, and automatic sign-out when the session has expired.
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

  // ---------- image compression (use before EVERY photo upload) ----------
  // A phone photo is 3-8 MB. This turns it into ~100-300 KB JPEG before it leaves the phone.
  // Resolves to a Blob (or the original file if it is already small / not an image).
  function compressImage(file, maxSide, quality) {
    maxSide = maxSide || 1280; quality = quality || 0.72;
    if (!file || !/^image\/(jpeg|png|webp|heic|heif)/i.test(file.type) || file.size < 200 * 1024) {
      return Promise.resolve(file);
    }
    var load = window.createImageBitmap
      ? createImageBitmap(file)
      : new Promise(function (ok, no) {
          var img = new Image(), u = URL.createObjectURL(file);
          img.onload = function () { URL.revokeObjectURL(u); ok(img); };
          img.onerror = function () { no(new Error('Not a valid image')); };
          img.src = u;
        });
    return load.then(function (img) {
      var w = img.width, h = img.height, k = Math.min(1, maxSide / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      if (img.close) img.close();
      return new Promise(function (ok) {
        c.toBlob(function (blob) { ok(blob && blob.size < file.size ? blob : file); }, 'image/jpeg', quality);
      });
    }).catch(function () { return file; });
  }

  // ---------- fallback toast ----------
  function toast(msg, type) {
    if (typeof window.toast === 'function' && window.toast !== toast) {
      window.toast(msg, type);
      return;
    }
    var wrap = document.getElementById('alpha-common-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'alpha-common-toast-wrap';
      wrap.style.cssText = 'position:fixed;top:calc(18px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
      document.body.appendChild(wrap);
    }
    var t = document.createElement('div');
    var bg = type === 'error' ? '#E5484D' : (type === 'info' ? '#4f46e5' : '#16181c');
    t.textContent = msg;
    t.setAttribute('role', 'status');
    t.style.cssText = 'background:' + bg + ';color:#fff;padding:10px 18px;border-radius:99px;font:600 13px Inter,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;transition:opacity .2s;';
    wrap.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 250);
    }, 2400);
  }

  // ---------- run immediately (before body renders) ----------
  initTheme();
  applyAccent(safeGet(LS.accent) || DEFAULT_ACCENT);
  applyDataSaver();

  document.addEventListener('DOMContentLoaded', function () {
    applyFont(safeGet(LS.font));
    applyDensity(safeGet(LS.density));
    applyWallpaper();
    injectNavIconBadge();
    initIconObserver();
  });

  // ---------- keep every open tab in sync ----------
  window.addEventListener('storage', function (e) {
    if (e.key === LS.theme) applyTheme(e.newValue);
    else if (e.key === LS.accent) applyAccent(e.newValue);
    else if (e.key === LS.font) applyFont(e.newValue);
    else if (e.key === LS.density) applyDensity(e.newValue);
    else if (e.key === LS.dataSaver) applyDataSaver();
    else if (e.key === LS.wallpaper || e.key === LS.wallpaperCustom) applyWallpaper();
  });

  window.AlphaCommon = {
    API_BASE: API_BASE,
    DEFAULT_ACCENT: DEFAULT_ACCENT,
    WALLPAPERS: WALLPAPERS,
    applyTheme: applyTheme,
    applyAccent: applyAccent,
    setFont: applyFont,
    setDensity: applyDensity,
    applyWallpaper: applyWallpaper,
    applyDataSaver: applyDataSaver,
    isLowData: isLowData,
    injectNavIconBadge: injectNavIconBadge,
    renderIcons: renderIcons,
    getToken: getToken,
    getUser: getUser,
    isLoggedIn: isLoggedIn,
    requireAuth: requireAuth,
    logout: logout,
    api: api,
    compressImage: compressImage,
    toast: toast
  };
})();
