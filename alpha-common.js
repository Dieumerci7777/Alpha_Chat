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


/* ============================================================
   INCOMING CALLS ON EVERY PAGE
   Rings + shows Accept / Decline on any page except calls.html
   (calls.html has its own listener). Accepting opens
   calls.html?accept_room=… which joins the call automatically.
   ============================================================ */
(function () {
    if (window.__alphaIncoming) return;
    window.__alphaIncoming = true;
    if (window.top !== window) return;                                   // embedded pages: the top page listens
    var path = location.pathname.toLowerCase();
    if (/\/calls(\.html)?$/.test(path)) return;                          // calls page handles its own calls
    if (/\/(login|register)(\.html)?$/.test(path)) return;
    // pages that are about to redirect into Shell.html: let the Shell listen instead
    if (window.ALPHA_USE_SHELL === true && !/\/shell(\.html)?$/.test(path)) return;

    var API = 'https://alpha-auth.murwanashyakadieumerci540.workers.dev';
    var RING_MS = 30000, STALE_MS = 35000, POLL_MS = 2500;
    var seen = new Set();
    var cur = null, ringTimer = null, ringStop = null, polling = false, users = null;
    var origTitle = document.title, titleT = null, notif = null;

    // ---------- helpers ----------
    function token() { try { return localStorage.getItem('alpha_token'); } catch (e) { return null; } }
    function me() {
        try {
            var p = JSON.parse(localStorage.getItem('alpha_user') || 'null');
            var c = p && (p.CU || p);
            var id = c && (c.id || c.email);
            return { id: id, name: (p && p.UP && p.UP.display_name) || (c && c.display_name) || id };
        } catch (e) { return {}; }
    }
    function isMe(uid) { var m = me().id; return !!uid && !!m && String(uid).toLowerCase() === String(m).toLowerCase(); }
    function prefs() { try { return JSON.parse(localStorage.getItem('alpha_call_prefs') || '{}'); } catch (e) { return {}; } }
    function parseTs(ts) {
        if (typeof ts === 'string' && !/[zZ]|[+-]\d\d:?\d\d$/.test(ts)) ts = ts.replace(' ', 'T') + 'Z';
        return new Date(ts).getTime();
    }
    function api(path, method, body) {
        var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 12000);
        return fetch(API + path, {
            method: method || 'GET', signal: c.signal,
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
            body: body ? JSON.stringify(body) : undefined
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) {
                if (!r.ok) throw new Error((d && d.error) || r.status);
                return d;
            });
        }).then(function (d) { clearTimeout(t); return d; }, function (e) { clearTimeout(t); throw e; });
    }
    function sendSignal(to, payload) {
        if (!to) return;
        api('/notifications', 'POST', { to_uid: to, from_name: me().name, text: JSON.stringify(payload) }).catch(function () {});
    }
    function logMissed(c) {
        try {
            var k = 'alpha_calls_' + me().id;
            var list = JSON.parse(localStorage.getItem(k) || '[]');
            list.push({ id: 'c' + Date.now(), uid: c.from_uid, name: c.from_name, type: c.type, dur: 0, direction: 'in', ts: Date.now() });
            localStorage.setItem(k, JSON.stringify(list.slice(-80)));
        } catch (e) {}
    }

    // ---------- ringtone (uses the choice saved in call settings) ----------
    var ctx = null;
    function actx() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume().catch(function () {});
        return ctx;
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
        document.addEventListener(ev, function u() {
            try { actx(); } catch (e) {}
            if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) {} }
            document.removeEventListener(ev, u, true);
        }, true);
    });
    function note(c, f, t, d, v, type) {
        var g = c.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        g.connect(c.destination);
        f.forEach(function (x) { var o = c.createOscillator(); o.type = type || 'sine'; o.frequency.value = x; o.connect(g); o.start(t); o.stop(t + d + 0.05); });
    }
    var TONES = {
        classic: { ms: 2200, play: function (c, t, v) { [0, 0.5].forEach(function (o) { note(c, [480, 620], t + o, 0.4, v * 0.3); }); } },
        marimba: { ms: 2400, play: function (c, t, v) { [659, 784, 988, 784, 659, 988].forEach(function (f, i) { note(c, [f], t + i * 0.16, 0.3, v * 0.4, 'triangle'); }); } },
        digital: { ms: 1800, play: function (c, t, v) { [0, 0.2, 0.4, 0.8, 1].forEach(function (o) { note(c, [1000], t + o, 0.1, v * 0.2, 'square'); }); } },
        soft: { ms: 3000, play: function (c, t, v) { [523, 659, 784, 1046].forEach(function (f, i) { note(c, [f], t + i * 0.25, 1.1, v * 0.35); }); } }
    };
    function idbGet(k) {
        return new Promise(function (res) {
            try {
                var q = indexedDB.open('alpha_pro', 1);
                q.onupgradeneeded = function () { q.result.createObjectStore('f'); };
                q.onsuccess = function () {
                    try {
                        var r = q.result.transaction('f').objectStore('f').get(k);
                        r.onsuccess = function () { res(r.result || null); };
                        r.onerror = function () { res(null); };
                    } catch (e) { res(null); }
                };
                q.onerror = function () { res(null); };
            } catch (e) { res(null); }
        });
    }
    function startRing() {
        stopRing();
        var P = prefs(), vol = P.ringVol == null ? 0.8 : P.ringVol;
        var on = true, timer = null, audio = null, url = null, vib = null;
        ringStop = function () {
            on = false; clearInterval(timer); clearInterval(vib);
            try { navigator.vibrate(0); } catch (e) {}
            if (audio) { try { audio.pause(); } catch (e) {} }
            if (url) URL.revokeObjectURL(url);
        };
        if (P.vibrate !== false && navigator.vibrate) {
            var v = function () { try { navigator.vibrate([500, 250, 500, 250, 500]); } catch (e) {} };
            v(); vib = setInterval(v, 3000);
        }
        function builtIn() {
            if (!on) return;
            var tone = TONES[P.tone] || TONES.classic;
            var run = function () { try { var c = actx(); tone.play(c, c.currentTime + 0.02, vol); } catch (e) {} };
            run(); timer = setInterval(run, tone.ms);
        }
        if (P.tone === 'custom') {
            idbGet('ringtone').then(function (blob) {
                if (!blob || !on) return builtIn();
                try {
                    url = URL.createObjectURL(blob);
                    audio = new Audio(url); audio.loop = true; audio.volume = vol;
                    var pr = audio.play();
                    if (pr && pr.catch) pr.catch(builtIn);
                } catch (e) { builtIn(); }
            });
        } else builtIn();
    }
    function stopRing() { if (ringStop) { ringStop(); ringStop = null; } }

    // ---------- UI ----------
    var css = document.createElement('style');
    css.textContent =
        '#agIncoming{position:fixed;inset:0;z-index:2147483000;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;' +
        'background:radial-gradient(circle at 20% 10%,rgba(99,102,241,.35),transparent 55%),#0b0d12;color:#fff;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}' +
        '#agIncoming.show{display:flex;animation:agIn .25s ease}@keyframes agIn{from{opacity:0}to{opacity:1}}' +
        '#agIncoming img{width:120px;height:120px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.12);animation:agPulse 1.6s infinite;background:#151b24}' +
        '@keyframes agPulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}100%{box-shadow:0 0 0 28px rgba(34,197,94,0)}}' +
        '#agIncoming h2{font-size:26px;margin:10px 0 0}#agIncoming p{color:#94a3b8;font-size:14px;margin:0}' +
        '#agIncoming .row{display:flex;gap:44px;margin-top:34px}' +
        '#agIncoming button{width:64px;height:64px;border-radius:50%;border:0;color:#fff;font-size:24px;cursor:pointer;box-shadow:0 12px 30px rgba(0,0,0,.45);transition:.15s}' +
        '#agIncoming button:hover{transform:scale(1.06)}#agIncoming .acc{background:#22c55e}#agIncoming .dec{background:#ef4444}' +
        '#agIncoming span.l{display:block;font-size:11px;color:#94a3b8;margin-top:8px}' +
        '#agMissed{position:fixed;left:50%;transform:translateX(-50%);top:16px;z-index:2147483001;background:#151b24;color:#fff;border:1px solid #ef444466;border-radius:14px;' +
        'padding:10px 16px;font:600 13px Inter,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.4);display:none}';
    (document.head || document.documentElement).appendChild(css);

    var ov = document.createElement('div');
    ov.id = 'agIncoming';
    ov.innerHTML = '<img id="agAv" alt=""><h2 id="agName"></h2><p id="agKind"></p>' +
        '<div class="row">' +
        '<div><button class="dec" id="agDec" title="Decline" aria-label="Decline">\u2715</button><span class="l">Decline</span></div>' +
        '<div><button class="acc" id="agAcc" title="Accept" aria-label="Accept">\uD83D\uDCDE</button><span class="l">Accept</span></div>' +
        '</div>';
    var missed = document.createElement('div'); missed.id = 'agMissed';

    function wire() {
        document.body.appendChild(ov); document.body.appendChild(missed);
        document.getElementById('agAcc').onclick = accept;
        document.getElementById('agDec').onclick = decline;
    }
    if (document.body) wire(); else document.addEventListener('DOMContentLoaded', wire);

    function flashMissed(text) {
        missed.textContent = text; missed.style.display = 'block';
        setTimeout(function () { missed.style.display = 'none'; }, 5000);
    }
    function avatarFor(uid, name) {
        var fallback = 'https://ui-avatars.com/api/?background=27272a&color=fff&bold=true&name=' + encodeURIComponent(name || 'Alphagram User');
        var get = users ? Promise.resolve() : api('/users').then(function (list) { users = {}; (list || []).forEach(function (u) { users[u.email] = u; }); });
        return get.then(function () { return (users[uid] && users[uid].avatar_url) || fallback; }, function () { return fallback; });
    }
    function show(c) {
        cur = c;
        document.getElementById('agName').textContent = c.from_name;
        document.getElementById('agKind').textContent = c.is_group ? 'Incoming conference' : (c.type === 'video' ? 'Incoming video call' : 'Incoming voice call');
        document.getElementById('agAv').src = 'https://ui-avatars.com/api/?background=27272a&color=fff&bold=true&name=' + encodeURIComponent(c.from_name || 'A');
        avatarFor(c.from_uid, c.from_name).then(function (src) { if (cur === c) document.getElementById('agAv').src = src; });
        ov.classList.add('show');
        document.body.style.overflow = 'hidden';
        startRing();
        var flip = true;
        titleT = setInterval(function () { document.title = flip ? '\uD83D\uDCDE ' + c.from_name + ' is calling\u2026' : origTitle; flip = !flip; }, 900);
        try {
            if (document.hidden && prefs().notify !== false && 'Notification' in window && Notification.permission === 'granted') {
                notif = new Notification(c.from_name + ' is calling', {
                    body: c.is_group ? 'Conference invite' : (c.type === 'video' ? 'Incoming video call' : 'Incoming voice call'),
                    tag: 'alpha-call', renotify: true, requireInteraction: true, vibrate: [500, 250, 500], silent: false
                });
                notif.onclick = function () { window.focus(); notif.close(); };
            }
        } catch (e) {}
        ringTimer = setTimeout(function () { if (cur === c) miss(c); }, RING_MS);
    }
    function hide() {
        stopRing();
        clearTimeout(ringTimer); clearInterval(titleT); document.title = origTitle;
        try { if (notif) notif.close(); } catch (e) {}
        notif = null;
        ov.classList.remove('show'); document.body.style.overflow = ''; cur = null;
    }
    function miss(c) { logMissed(c); hide(); flashMissed('Missed call from ' + c.from_name); }
    function accept() {
        if (!cur) return;
        var c = cur;
        var q = new URLSearchParams({
            accept_room: c.room, accept_from: c.from_uid, accept_name: c.from_name, accept_type: c.type,
            accept_group: c.is_group ? '1' : '0', accept_host: c.host_uid || c.from_uid, notif_id: c.notif_id || ''
        });
        hide();
        location.href = 'calls.html?' + q.toString();
    }
    function decline() {
        if (!cur) return;
        var c = cur;
        sendSignal(c.from_uid, { type: 'call_invite', from_uid: me().id, from_name: me().name, action: 'decline', room: c.room });
        hide();
    }
    document.addEventListener('keydown', function (e) { if (cur && e.key === 'Escape') decline(); });

    // ---------- polling ----------
    function poll() {
        if (polling || !token() || !me().id) return;
        polling = true;
        api('/notifications').then(function (data) {
            var items = (data || [])
                .filter(function (n) { return typeof n.text === 'string' && n.text.charAt(0) === '{'; })
                .map(function (n) { try { return { n: n, p: JSON.parse(n.text) }; } catch (e) { return null; } })
                .filter(function (x) { return x && x.p && x.p.type === 'call_invite'; })
                .sort(function (a, b) { return a.n.id - b.n.id; });

            items.forEach(function (it) {
                var n = it.n, p = it.p;
                if (seen.has(n.id)) return;
                seen.add(n.id);
                api('/notifications/' + n.id, 'DELETE').catch(function () {});
                if (isMe(p.from_uid)) return;

                if (p.action === 'invite') {
                    if (Date.now() - parseTs(n.created_at) > STALE_MS) return;
                    if (cur) { sendSignal(p.from_uid, { type: 'call_invite', from_uid: me().id, from_name: me().name, action: 'decline', reason: 'busy', room: p.room }); return; }
                    show({
                        from_uid: p.from_uid, from_name: p.from_name || String(p.from_uid).split('@')[0], type: p.call_type || 'voice',
                        room: p.room, is_group: !!p.is_group, host_uid: p.host_uid, notif_id: n.id
                    });
                } else if (p.action === 'end' && cur && cur.room === p.room) {
                    miss(cur);
                }
            });
        }).catch(function () {}).then(function () { polling = false; });
    }
    setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
    window.addEventListener('online', poll);
    window.addEventListener('focus', poll);
    poll();
})();
