(function () {
  'use strict';

  var API_BASE = 'https://alpha-auth.murwanashyakadieumerci540.workers.dev';

  var LS = {
    token: 'alpha_token', user: 'alpha_user', theme: 'alpha_theme', accent: 'alpha_settings_accent',
    font: 'alpha_font', density: 'alpha_density', wallpaper: 'alpha_wallpaper',
    wallpaperCustom: 'alpha_wallpaper_custom', dataSaver: 'alpha_datasaver'
  };
  var DEFAULT_ACCENT = '#0f766e';

  var WALLPAPERS = [
    { id: 'none', label: 'Plain', css: 'none' },
    { id: 'aurora', label: 'Aurora', css: 'radial-gradient(70% 70% at 15% 10%,color-mix(in srgb,var(--ag-primary) 45%,transparent),transparent),radial-gradient(70% 70% at 90% 100%,color-mix(in srgb,var(--ag-primary) 30%,transparent),transparent)' },
    { id: 'dusk', label: 'Dusk', css: 'linear-gradient(165deg,color-mix(in srgb,var(--ag-primary) 40%,transparent),transparent)' },
    { id: 'dots', label: 'Dots', css: 'radial-gradient(color-mix(in srgb,var(--ag-primary) 50%,transparent) 1.4px,transparent 1.6px) 0 0/12px 12px' },
    { id: 'grid', label: 'Grid', css: 'linear-gradient(color-mix(in srgb,var(--ag-primary) 25%,transparent) 1px,transparent 1px) 0 0/14px 14px,linear-gradient(90deg,color-mix(in srgb,var(--ag-primary) 25%,transparent) 1px,transparent 1px) 0 0/14px 14px' },
    { id: 'waves', label: 'Waves', css: 'radial-gradient(120% 70% at 50% 130%,color-mix(in srgb,var(--ag-primary) 50%,transparent),transparent 70%)' }
  ];
  // A small, curated set: six accents that all pass contrast on white and on dark.
  var ACCENTS = [
    { id: 'teal',   label: 'Teal',   color: '#0f766e' },
    { id: 'indigo', label: 'Indigo', color: '#4f46e5' },
    { id: 'ocean',  label: 'Ocean',  color: '#0369a1' },
    { id: 'violet', label: 'Violet', color: '#7c3aed' },
    { id: 'rose',   label: 'Rose',   color: '#e11d48' },
    { id: 'amber',  label: 'Amber',  color: '#c2410c' }
  ];

  var FONT_STACKS = {
    default: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
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
    if (typeof applyAccent === 'function') applyAccent();
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
    if (!/^#[0-9a-f]{6}$/i.test(color)) color = DEFAULT_ACCENT;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var c = hexToRgb(color);
    var primary = dark ? shade(color, 0.38) : color;
    // A <style> rule (not inline) so it also reaches <body>, which the dark theme re-declares
    var st = document.getElementById('alpha-common-accent');
    if (!st) { st = document.createElement('style'); st.id = 'alpha-common-accent'; (document.head || document.documentElement).appendChild(st); }
    st.textContent = ':root,html[data-theme],html[data-theme] body,body.dark{' +
      '--ag-primary:' + primary + '!important;' +
      '--ag-primary-hover:' + (dark ? shade(color, 0.58) : shade(color, -0.2)) + '!important;' +
      '--ag-soft:' + (dark ? shade(color, -0.72) : shade(color, 0.89)) + '!important;' +
      '--ag-on-primary:' + (dark ? '#06100f' : '#ffffff') + '!important;' +
      '--ag-glow:' + rgba(primary, dark ? 0.25 : 0.28) + '!important;}';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', primary);
    return color;
  }
  function setAccent(color) { safeSet(LS.accent, color); applyAccent(color); }

  function injectNavIconBadge() {
    var style = document.getElementById('alpha-common-navicon');
    if (!style) { style = document.createElement('style'); style.id = 'alpha-common-navicon'; document.head.appendChild(style); }
    style.textContent =
      '.app-sidebar .app-nav-item svg.lucide{width:16px;height:16px;padding:7px;box-sizing:content-box;border-radius:10px;background:var(--surface2,rgba(0,0,0,.04));color:var(--text2,var(--muted,#73767d));flex-shrink:0;transition:background .18s,color .18s,box-shadow .18s;}' +
      '.app-sidebar .app-nav-item:hover svg.lucide{background:var(--surface-solid,#fff);color:var(--text,#111214);}' +
      '.app-sidebar .app-nav-item.active svg.lucide{background:var(--primary,#0a0a0a);color:var(--on-primary,#fff);}' +
      '.app-sidebar .app-nav-item.logout svg.lucide{background:transparent;}' +
      '.app-sidebar .app-nav-item.logout:hover svg.lucide{background:var(--danger-l,rgba(255,59,79,.12));color:var(--danger,#E5484D);}' +
      '.app-bottom-nav button.active svg.lucide,.mobile-bottom-nav button.active svg.lucide{color:var(--primary,#0a0a0a);}' +
      '.app-bottom-nav button.active,.mobile-bottom-nav button.active{color:var(--primary,#0a0a0a);}';
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
    var root = document.documentElement;
    if (id === 'custom') {
      var data = safeGet(LS.wallpaperCustom);
      if (!data) id = 'none';
      else root.style.setProperty('--ag-wall-img', 'url("' + data + '")');
    }
    if (id === 'none') root.removeAttribute('data-wall'); else root.setAttribute('data-wall', id);
  }
  function setWallpaper(id) { safeSet(LS.wallpaper, id); applyWallpaper(); }

  // ---------- page transitions + load bar ----------
  (function () {
    var root = document.documentElement;
    // Browsers with cross-page View Transitions animate natively (see alphagram.css)
    if ('onpageswap' in window) root.setAttribute('data-vt', '');
    function clearNav() { root.classList.remove('ag-leaving', 'ag-loading'); }
    window.addEventListener('pageshow', function () { clearNav(); root.classList.remove('ag-hide-nav'); });
    // Hide bars while scrolling down, show them again on any scroll up
    var lastY = new WeakMap();
    document.addEventListener('scroll', function (e) {
      var t = e.target === document ? document.scrollingElement : e.target;
      if (!t || !('scrollTop' in t) || /^(TEXTAREA|INPUT)$/.test(t.tagName)) return;
      if (t !== document.scrollingElement && t.clientHeight < window.innerHeight * 0.5) return;
      var y = t.scrollTop, d = y - (lastY.get(t) || 0);
      if (Math.abs(d) < 10) return;
      lastY.set(t, y);
      if (y < 60 || d < 0) root.classList.remove('ag-hide-nav');
      else if (y > 80) root.classList.add('ag-hide-nav');
    }, { capture: true, passive: true });
    window.addEventListener('beforeunload', function () { root.classList.add('ag-loading'); });
    document.addEventListener('DOMContentLoaded', function () {
      if (!document.getElementById('ag-progress')) {
        var bar = document.createElement('div'); bar.id = 'ag-progress'; bar.setAttribute('aria-hidden', 'true');
        document.body.appendChild(bar);
      }
    });
    // Fallback exit animation for plain links where View Transitions are missing
    document.addEventListener('click', function (e) {
      if (root.hasAttribute('data-vt') || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      var u; try { u = new URL(a.href, location.href); } catch (x) { return; }
      if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search) || !/\.html?$|\/$/.test(u.pathname)) return;
      e.preventDefault();
      root.classList.add('ag-leaving');
      setTimeout(function () { location.href = u.href; }, 170);
    });
  })();

  // ---------- appearance panel (accent, theme, wallpaper) ----------
  function openAppearance() {
    if (document.getElementById('ag-appearance')) return;
    var ov = document.createElement('div'); ov.className = 'ag-panel-ov'; ov.id = 'ag-appearance';
    var curAccent = (safeGet(LS.accent) || DEFAULT_ACCENT).toLowerCase();
    var curWall = safeGet(LS.wallpaper) || 'none';
    var curTheme = safeGet(LS.theme) || 'auto';
    var html = '<div class="ag-panel" role="dialog" aria-modal="true" aria-label="Appearance"><header><h3>Appearance</h3><button class="ag-x" aria-label="Close">\u2715</button></header>' +
      '<h4>Color</h4><div class="ag-swatches">' + ACCENTS.map(function (a) {
        return '<button class="ag-sw' + (a.color === curAccent ? ' on' : '') + '" data-c="' + a.color + '" style="background:' + a.color + '" title="' + a.label + '" aria-label="' + a.label + '"></button>';
      }).join('') + '</div>' +
      '<h4>Theme</h4><div class="ag-seg">' + [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']].map(function (t) {
        return '<button data-t="' + t[0] + '" class="' + (t[0] === curTheme ? 'on' : '') + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      '<h4>Wallpaper</h4><div class="ag-walls">' + WALLPAPERS.map(function (w) {
        return '<button class="ag-wall' + (w.id === curWall ? ' on' : '') + '" data-w="' + w.id + '"><span>' + w.label + '</span></button>';
      }).join('') + '<button class="ag-wall' + (curWall === 'custom' ? ' on' : '') + '" data-w="upload"><span>Your photo</span></button></div>' +
      '<input type="file" accept="image/*" hidden id="ag-wall-file"><button class="ag-reset">Reset to default</button></div>';
    ov.innerHTML = html;
    document.body.appendChild(ov);
    var panel = ov.firstChild;
    function close() { document.removeEventListener('keydown', key); ov.remove(); }
    function key(e) { if (e.key === 'Escape') close(); }
    function mark(sel, attr, val) {
      Array.prototype.forEach.call(panel.querySelectorAll(sel), function (el) { el.classList.toggle('on', el.getAttribute(attr) === val); });
    }
    document.addEventListener('keydown', key);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    panel.querySelector('.ag-x').onclick = close;
    panel.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.dataset.c) { setAccent(t.dataset.c); mark('.ag-sw', 'data-c', t.dataset.c); }
      else if (t.dataset.t) {
        if (t.dataset.t === 'auto') { try { localStorage.removeItem(LS.theme); } catch (x) {} applyTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
        else { safeSet(LS.theme, t.dataset.t); applyTheme(t.dataset.t); }
        mark('.ag-seg button', 'data-t', t.dataset.t);
      }
      else if (t.dataset.w === 'upload') document.getElementById('ag-wall-file').click();
      else if (t.dataset.w) { setWallpaper(t.dataset.w); mark('.ag-wall', 'data-w', t.dataset.w); }
      else if (t.classList.contains('ag-reset')) {
        setAccent(DEFAULT_ACCENT); setWallpaper('none'); try { localStorage.removeItem(LS.theme); } catch (x) {}
        applyTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        mark('.ag-sw', 'data-c', DEFAULT_ACCENT); mark('.ag-wall', 'data-w', 'none'); mark('.ag-seg button', 'data-t', 'auto');
        toast('Appearance reset');
      }
    });
    document.getElementById('ag-wall-file').onchange = function () {
      var f = this.files && this.files[0]; if (!f) return;
      compressImage(f, 1400, 0.7).then(function (blob) {
        var fr = new FileReader();
        fr.onload = function () {
          try { localStorage.setItem(LS.wallpaperCustom, fr.result); safeSet(LS.wallpaper, 'custom'); applyWallpaper(); mark('.ag-wall', 'data-w', 'upload'); panel.querySelector('[data-w="upload"]').classList.add('on'); toast('Wallpaper set'); }
          catch (x) { toast('That photo is too large. Try a smaller one.', 'error'); }
        };
        fr.readAsDataURL(blob);
      });
    };
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-ag-appearance]');
    if (t) { e.preventDefault(); openAppearance(); }
  });
  function injectAppearanceButton() {
    var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (window.ALPHA_NO_APPEARANCE_BUTTON || /^(shell|login|register|calls|chat)\.html$/.test(page)) return;
    if (document.querySelector('[data-ag-appearance]') || document.querySelector('.ag-app-fab')) return;
    var b = document.createElement('button'); b.className = 'ag-app-fab'; b.setAttribute('aria-label', 'Appearance');
    b.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="10" r="1.2" fill="currentColor"/><path d="M12 21c-1.5 0-2-1.3-1.2-2.4.8-1 .2-2.1-1-2.1H8"/></svg>';
    b.onclick = openAppearance;
    document.body.appendChild(b);
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
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'alpha-common-toast-wrap'; document.body.appendChild(wrap); }
    var t = document.createElement('div');
    t.className = 'ag-toast' + (type ? ' ' + type : '');
    t.textContent = msg; t.setAttribute('role', 'status');
    wrap.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 250); }, 2400);
  }

  // Pop-up dialog. Returns a promise: true = confirmed, false = cancelled.
  function confirmBox(o) {
    o = o || {};
    return new Promise(function (done) {
      var ov = document.createElement('div');
      ov.className = 'ag-overlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;padding:16px';
      var m = document.createElement('div');
      m.className = 'ag-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
      var h = document.createElement('h3'); h.textContent = o.title || 'Are you sure?';
      var p = document.createElement('p'); p.textContent = o.text || '';
      var row = document.createElement('div'); row.className = 'ag-actions';
      var no = document.createElement('button'); no.textContent = o.cancel || 'Cancel';
      var ok = document.createElement('button'); ok.textContent = o.ok || 'Confirm';
      ok.className = o.danger ? 'ag-danger' : 'ag-ok';
      function close(v) { document.removeEventListener('keydown', key); ov.remove(); done(v); }
      function key(e) { if (e.key === 'Escape') close(false); }
      no.onclick = function () { close(false); }; ok.onclick = function () { close(true); };
      ov.onclick = function (e) { if (e.target === ov) close(false); };
      document.addEventListener('keydown', key);
      row.appendChild(no); row.appendChild(ok);
      m.appendChild(h); if (o.text) m.appendChild(p); m.appendChild(row);
      ov.appendChild(m); document.body.appendChild(ov); ok.focus();
    });
  }

  initTheme();
  applyAccent();
  applyWallpaper();
  applyDataSaver();

  document.addEventListener('DOMContentLoaded', function () {
    applyFont(safeGet(LS.font)); applyDensity(safeGet(LS.density));
    applyWallpaper(); injectNavIconBadge(); initIconObserver(); injectAppearanceButton();
    if (location.hash === '#appearance') openAppearance();
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
    applyTheme: applyTheme, applyAccent: applyAccent, setAccent: setAccent, ACCENTS: ACCENTS, setWallpaper: setWallpaper, openAppearance: openAppearance, setFont: applyFont, setDensity: applyDensity,
    applyWallpaper: applyWallpaper, applyDataSaver: applyDataSaver, isLowData: isLowData,
    injectNavIconBadge: injectNavIconBadge, renderIcons: renderIcons, getToken: getToken, getUser: getUser,
    isLoggedIn: isLoggedIn, requireAuth: requireAuth, logout: logout, api: api,
    compressImage: compressImage, toast: toast, confirm: confirmBox
  };
})();
