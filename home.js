// Alpha home — logic (moved out of index.html so the browser can cache it)
const CF_API_BASE = 'https://alpha-auth.murwanashyakadieumerci540.workers.dev';
let CF_TOKEN = localStorage.getItem('alpha_token') || null;
let CU = null;
let UP = { display_name: '', bio: '', avatar_color: 'g2', avatar_url: null };
let allUsers = {};
let allPosts = [];
let moodIdx = 0, postAnon = false, lastPostTime = 0;
const POST_COOLDOWN = 5000;
const PAGE_SIZE = 8;               // posts rendered at once (was: all of them)
let renderLimit = PAGE_SIZE;
const MOODS = [
  { icon: 'fa-sun', l: 'Feeling good' }, { icon: 'fa-cloud-sun', l: 'Balanced' }, { icon: 'fa-cloud-rain', l: 'Chill' },
  { icon: 'fa-fire', l: 'Hustling' }, { icon: 'fa-cloud-moon', l: 'Night vibes' }
];
let currentFeedTab = 'trending';
let currentSearchQuery = '';
let selectedMedia = [];
const MAX_MEDIA_PER_POST = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const COMPRESS_IMAGE_ABOVE = 1.5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const postMediaMap = {};
const AV_CLASSES = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];
const META_MARK = '\u2063ALPHA_META\u2063';

function encodeMeta(text, meta) { return (text || '') + META_MARK + JSON.stringify(meta); }
function decodeMeta(raw) {
  if (!raw) return { text: '', meta: null };
  const idx = raw.indexOf(META_MARK);
  if (idx === -1) return { text: raw, meta: null };
  let meta = null;
  try { meta = JSON.parse(raw.slice(idx + META_MARK.length)); } catch (e) {}
  return { text: raw.slice(0, idx), meta };
}

const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------- API ----------
async function cfApi(endpoint, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (CF_TOKEN) opts.headers['Authorization'] = `Bearer ${CF_TOKEN}`;
  if (body) opts.body = JSON.stringify(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  opts.signal = controller.signal;
  let res;
  try { res = await fetch(`${CF_API_BASE}${endpoint}`, opts); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'Request timed out — check your connection' : e.message); }
  finally { clearTimeout(timer); }
  let data = {};
  try { data = await res.json(); } catch (e) { data = {}; }
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
  return data;
}

async function prepareUploadFile(file) {
  if (!file || !file.type) throw new Error('Invalid file');
  const isVideo = file.type.startsWith('video/');
  if (isVideo && file.size > MAX_VIDEO_BYTES) throw new Error('Video is too large. Please choose a video under 30 MB.');
  if (isVideo || file.size <= COMPRESS_IMAGE_ABOVE) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.78));
    if (!blob) return file;
    return new File([blob], (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } catch (_) { return file; }
}

function uploadFile(file) {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${CF_API_BASE}/upload`);
      if (CF_TOKEN) xhr.setRequestHeader('Authorization', `Bearer ${CF_TOKEN}`);
      xhr.timeout = 120000;
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(data); else reject(new Error(data.error || `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Upload failed — check your connection'));
      xhr.ontimeout = () => reject(new Error('Upload timed out — check your connection'));
      const fd = new FormData(); fd.append('file', file); xhr.send(fd);
    } catch (e) { reject(e); }
  });
}

// ---------- Theme / back / search ----------
function initTheme() { setThemeIcon(); }
function setThemeIcon() { const b = document.getElementById('theme-toggle'); if (b) b.innerHTML = '<i class="fa-regular fa-circle-half-stroke"></i>'; }
window.toggleTheme = function () {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  AlphaCommon.applyTheme(cur);
  localStorage.setItem('alpha_theme', cur);
};
function initBackButton() {
  const btn = document.getElementById('index-back-btn');
  if (!btn) return;
  const ref = document.referrer;
  btn.style.display = (ref && ref.indexOf(location.origin) === 0 && !/\/index\.html([?#]|$)/.test(ref)) ? 'flex' : 'none';
}
window.toggleSearchBar = function () {
  const wrap = document.getElementById('search-bar-wrap'), btn = document.getElementById('search-toggle-btn');
  const show = !wrap.classList.contains('show');
  wrap.classList.toggle('show', show); btn.classList.toggle('active', show);
  if (show) document.getElementById('nav-search-input')?.focus(); else clearSearchBar();
};
window.clearSearchBar = function () { const i = document.getElementById('nav-search-input'); if (i) i.value = ''; searchPosts(''); };

// ---------- Toast / modal / lightbox ----------
const TOAST_ICONS = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
function toast(msg, type = 'success') {
  const wrap = document.getElementById('toast-wrap'); if (!wrap) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<i class="fa-solid ${TOAST_ICONS[type] || 'fa-wand-magic-sparkles'}"></i><span>${escapeHtml(msg)}</span><button class="toast-close" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>`;
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(16px)'; setTimeout(() => t.remove(), 300); }, 3000);
}
window.toast = toast;
function openModal(html) {
  const box = document.getElementById('modal-box');
  if (box) box.innerHTML = '<button class="modal-close" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>' + html;
  document.getElementById('modal-overlay')?.classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay')?.classList.remove('open'); }
let lbItems = [], lbIdx = 0;
window.openLB = function (postId, idx) {
  const media = postMediaMap[postId] || [];
  if (!media.length) return;
  lbItems = media; lbIdx = idx || 0; showLBItem();
  document.getElementById('lightbox')?.classList.add('open');
};
function showLBItem() {
  const item = lbItems[lbIdx]; if (!item) return;
  const img = document.getElementById('lb-img'), vid = document.getElementById('lb-video');
  if (item.type === 'video') { vid.src = item.url; vid.style.display = 'block'; img.style.display = 'none'; img.src = ''; }
  else { img.src = item.url; img.style.display = 'block'; vid.pause(); vid.removeAttribute('src'); vid.load(); vid.style.display = 'none'; }
  const multi = lbItems.length > 1;
  const counter = document.getElementById('lb-counter');
  counter.style.display = multi ? 'block' : 'none';
  counter.textContent = `${lbIdx + 1} / ${lbItems.length}`;
  document.getElementById('lb-prev').style.display = multi ? 'flex' : 'none';
  document.getElementById('lb-next').style.display = multi ? 'flex' : 'none';
}
window.lbNav = function (dir) { if (!lbItems.length) return; lbIdx = (lbIdx + dir + lbItems.length) % lbItems.length; showLBItem(); };
function closeLB() {
  document.getElementById('lightbox')?.classList.remove('open');
  const vid = document.getElementById('lb-video');
  if (vid) { vid.pause(); vid.removeAttribute('src'); vid.load(); }
}
window.closeLB = closeLB; window.closeModal = closeModal;

// ---------- Utilities ----------
function relTime(ts) {
  if (!ts) return 'now';
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function initials(n) { return (n || '?').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '?'; }
function gradClassFor(uid) { let h = 0; for (const c of String(uid || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV_CLASSES[h % AV_CLASSES.length]; }
function avatarHTML(uid, sizePx = 38, fontPx = 12) {
  const u = allUsers[uid] || {};
  if (u.avatar_url) return `<div class="avatar" style="width:${sizePx}px;height:${sizePx}px;font-size:${fontPx}px;"><img src="${escapeHtml(u.avatar_url)}" alt="" loading="lazy" decoding="async"></div>`;
  return `<div class="avatar ${gradClassFor(uid)}" style="width:${sizePx}px;height:${sizePx}px;font-size:${fontPx}px;">${escapeHtml(initials(u.display_name || '?'))}</div>`;
}
function linkify(t) {
  if (!t) return '';
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
    .replace(/(#\w+)/g, '<span class="tag">$1</span>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:var(--green);text-decoration:underline;">$1</a>');
}
function sanitizeInput(input) { const d = document.createElement('div'); d.textContent = input; return d.innerHTML; }

// ---------- Follow / Saved ----------
function followsKey() { return 'alpha_follows_' + (CU?.id || 'guest'); }
function loadFollows() { try { return JSON.parse(localStorage.getItem(followsKey()) || '[]'); } catch (e) { return []; } }
function saveFollows(l) { localStorage.setItem(followsKey(), JSON.stringify(l)); }
function isFollowing(uid) { return loadFollows().includes(uid); }
window.toggleFollow = function (uid) {
  let list = loadFollows(); const name = allUsers[uid]?.display_name || 'User';
  if (list.includes(uid)) { list = list.filter(x => x !== uid); toast('Unfollowed ' + name, 'info'); }
  else { list.push(uid); toast('Following ' + name); }
  saveFollows(list); renderFollowList();
};
function followButtonHTML(uid) {
  const f = isFollowing(uid);
  return `<button class="follow ${f ? 'following' : ''}" onclick="event.stopPropagation();toggleFollow('${uid}')">${f ? 'Following' : 'Follow'}</button>`;
}
function savedKey() { return 'alpha_saved_' + (CU?.id || 'guest'); }
function loadSaved() { try { return JSON.parse(localStorage.getItem(savedKey()) || '[]'); } catch (e) { return []; } }
function isSaved(id) { return loadSaved().includes(id); }
window.toggleSave = function (postId) {
  let list = loadSaved();
  if (list.includes(postId)) { list = list.filter(x => x !== postId); toast('Removed from Saved', 'info'); }
  else { list.push(postId); toast('Saved to your collection'); }
  localStorage.setItem(savedKey(), JSON.stringify(list));
  renderPosts(applyCurrentFilters());
};
window.viewSaved = function () {
  switchFeedTab('saved', document.querySelector('.tabs button[data-tab="saved"]'));
  document.querySelector('.center')?.scrollTo({ top: 0, behavior: 'smooth' });
};

// ---------- Likes ----------
function likedArr(p) {
  if (Array.isArray(p.liked_by)) return p.liked_by;
  try { const v = JSON.parse(p.liked_by || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
function normalizePost(p) { p.id = String(p.id); p.liked_by = likedArr(p); p.likes = p.liked_by.length; return p; }
function paintLike(postId, liked, count) {
  const card = document.getElementById('post-' + postId); if (!card) return;
  const btn = card.querySelector('.ax-btn.like');
  if (btn) { btn.classList.toggle('on', liked); btn.innerHTML = `<i class="${liked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>${liked ? 'Liked' : 'Like'}`; }
  const num = card.querySelector('.ax-likes span:last-child');
  if (num) num.innerHTML = `${count}<small> ${count === 1 ? 'like' : 'likes'}</small>`;
}
const likeBusy = new Set();
window.quickReact = async function (postId) {
  postId = String(postId);
  const p = allPosts.find(x => String(x.id) === postId);
  if (!p || !CU || likeBusy.has(postId)) return;
  likeBusy.add(postId);
  const before = likedArr(p), wasLiked = before.includes(CU.id);
  const next = wasLiked ? before.filter(u => u !== CU.id) : [...before, CU.id];
  p.liked_by = next; p.likes = next.length; paintLike(postId, !wasLiked, next.length);
  try {
    const r = await cfApi(`/posts/${postId}/like`, 'POST', { uid: CU.id });
    if (Array.isArray(r.liked_by)) { p.liked_by = r.liked_by; p.likes = r.liked_by.length; }
    else if (typeof r.likes === 'number') p.likes = r.likes;
    paintLike(postId, likedArr(p).includes(CU.id), p.likes);
  } catch (e) {
    p.liked_by = before; p.likes = before.length; paintLike(postId, wasLiked, before.length); toast('Could not update like', 'error');
  } finally { likeBusy.delete(postId); }
};

// ---------- Users ----------
let usersRequest = null;
async function loadUsers() {
  if (usersRequest) return usersRequest;
  usersRequest = (async () => {
    try {
      const data = await cfApi('/users');
      (data || []).forEach(u => allUsers[u.email] = u);
      renderOnlineList(); renderFollowList(); updateMeMini();
      loadStories();            // not awaited: stories no longer block the feed
      return allUsers;
    } catch (e) { console.warn('Load users error:', e); return allUsers; }
    finally { usersRequest = null; }
  })();
  return usersRequest;
}
function updateMeMini() {
  const nm = UP.display_name || 'User';
  const avEl = document.getElementById('me-mini-avatar');
  if (avEl) {
    if (UP.avatar_url) { avEl.innerHTML = `<img src="${escapeHtml(UP.avatar_url)}" alt="">`; avEl.className = 'avatar'; }
    else { avEl.className = 'avatar ' + gradClassFor(CU?.id || nm); avEl.textContent = initials(nm); }
  }
  const n = document.getElementById('me-mini-name'); if (n) n.textContent = nm;
  const h = document.getElementById('me-mini-handle'); if (h) h.textContent = '@' + (CU?.id || 'you').split('@')[0];
  const cAv = document.getElementById('compose-avatar');
  if (cAv) { if (UP.avatar_url) cAv.innerHTML = `<img src="${escapeHtml(UP.avatar_url)}" alt="">`; else cAv.textContent = initials(nm); }
}
function renderOnlineList() {
  const el = document.getElementById('online-list'); if (!el) return;
  const on = Object.entries(allUsers).filter(([uid]) => uid !== CU?.id);
  if (!on.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:4px 0;">No one online right now</div>'; return; }
  el.innerHTML = on.slice(0, 6).map(([uid, u]) => `<div class="friend online-user-row" onclick="goToChatWith('${uid}')">${avatarHTML(uid, 30, 10)}<div class="friend-info"><strong>${escapeHtml(u.display_name)}</strong><small>Tap to chat</small></div><span class="g-dot"></span></div>`).join('');
}
function renderFollowList() {
  const el = document.getElementById('follow-list'); if (!el) return;
  const others = Object.values(allUsers).filter(u => u.email !== CU?.id);
  if (!others.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:4px 0;">No one to suggest yet</div>'; return; }
  el.innerHTML = others.slice(0, 5).map(u => `<div class="friend">${avatarHTML(u.email, 30, 10)}<div class="friend-info"><strong>${escapeHtml(u.display_name)}</strong><small>Alpha member</small></div>${followButtonHTML(u.email)}</div>`).join('');
}
window.viewAllPeople = function () {
  const list = Object.values(allUsers).filter(u => u.email !== CU?.id);
  if (!list.length) { toast('No one else is on Alpha yet', 'info'); return; }
  openModal(`<div class="modal-title">People on Alpha</div>` + list.map(u => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);">${avatarHTML(u.email, 36, 12)}<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">${escapeHtml(u.display_name)}</div><div style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(u.bio || 'Alpha member')}</div></div>${followButtonHTML(u.email)}</div>`).join(''));
};

// ---------- Stories ----------
let statusCache = null, statusCacheAt = 0;
async function getStatuses(force) {
  if (!force && statusCache && Date.now() - statusCacheAt < 30000) return statusCache;
  statusCache = await cfApi('/status'); statusCacheAt = Date.now(); return statusCache;
}
async function loadStories() {
  const el = document.getElementById('stories-row'); if (!el) return;
  try {
    const data = await getStatuses(true);
    const byUser = {};
    data.forEach(s => { if (!byUser[s.uid] || new Date(s.created_at) > new Date(byUser[s.uid].created_at)) byUser[s.uid] = s; });
    const own = byUser[CU?.id];
    const others = Object.values(byUser).filter(s => s.uid !== CU?.id);
    let html = '';
    if (own) html += `<div class="person" onclick="openStoryViewer('${own.uid}')"><div class="person-avatar">${own.image_url && !isVideoUrl(own.image_url) ? `<img src="${escapeHtml(own.image_url)}" loading="lazy" decoding="async" alt="Your story">` : `<span>${escapeHtml(initials(UP.display_name))}</span>`}</div><button class="person-add-badge" onclick="event.stopPropagation();openStatusUpload();" title="Add to story"><i class="fa-solid fa-plus"></i></button><div class="person-name">Your story</div></div>`;
    else html += `<div class="person you" onclick="openStatusUpload()"><div class="person-avatar"><span>+</span></div><div class="person-name">Your story</div></div>`;
    others.slice(0, 10).forEach(s => {
      const user = allUsers[s.uid] || { display_name: s.author || 'User' };
      html += `<div class="person" onclick="openStoryViewer('${s.uid}')"><div class="person-avatar">${s.image_url && !isVideoUrl(s.image_url) ? `<img src="${escapeHtml(s.image_url)}" loading="lazy" decoding="async" alt="">` : `<span>${escapeHtml(initials(user.display_name))}</span>`}</div><div class="person-name">${escapeHtml(user.display_name)}</div></div>`;
    });
    el.innerHTML = html;
  } catch (e) {
    console.warn('Load stories error:', e);
    el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0;">Could not load stories</div>';
  }
}

let viewerStatuses = [], viewerIndex = 0, viewerTimer = null, viewerPaused = false, storyMuted = true;
function loadJSON(key, fb) { try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : fb; } catch (e) { return fb; } }
function saveJSON(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {} }
let storyViews = loadJSON('alpha_story_views', {});
let storyLikes = loadJSON('alpha_story_likes', {});
function isVideoUrl(url) { return !!url && /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url); }
const uiAvatar = n => `https://ui-avatars.com/api/?background=7046d8&color=fff&name=${encodeURIComponent(n || 'U')}`;

function recordStoryView(status) {
  if (!status || !CU?.id || status.uid === CU.id) return;
  const list = storyViews[status.id] || (storyViews[status.id] = []);
  if (list.some(v => v.uid === CU.id)) return;
  list.push({ uid: CU.id, name: UP.display_name || 'You', avatar: UP.avatar_url || null, time: new Date().toISOString() });
  saveJSON('alpha_story_views', storyViews);
  cfApi(`/status/${status.id}/view`, 'POST', { uid: CU.id }).catch(() => {});
}
function isStoryLikedByMe(id) { return (storyLikes[id] || []).some(v => v.uid === CU?.id); }
window.toggleStoryLike = function (forceLike) {
  const s = viewerStatuses[viewerIndex]; if (!s || !CU?.id) return;
  const list = storyLikes[s.id] || (storyLikes[s.id] = []);
  const already = list.some(v => v.uid === CU.id);
  const like = forceLike !== undefined ? forceLike : !already;
  if (like && !already) {
    list.push({ uid: CU.id, name: UP.display_name || 'You', avatar: UP.avatar_url || null, time: new Date().toISOString() });
    cfApi(`/status/${s.id}/like`, 'POST', { uid: CU.id }).catch(() => {});
    playStoryHeartBurst();
  } else if (!like && already) {
    storyLikes[s.id] = list.filter(v => v.uid !== CU.id);
    cfApi(`/status/${s.id}/unlike`, 'POST', { uid: CU.id }).catch(() => {});
  }
  saveJSON('alpha_story_likes', storyLikes); updateStoryLikeBtn();
  if (s.uid === CU.id) updateStoryViewersPill();
};
function updateStoryLikeBtn() {
  const s = viewerStatuses[viewerIndex], btn = document.getElementById('storyLikeBtn'); if (!s || !btn) return;
  const liked = isStoryLikedByMe(s.id);
  btn.classList.toggle('liked', liked);
  btn.innerHTML = liked ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
}
function playStoryHeartBurst() { const el = document.getElementById('storyHeartBurst'); if (!el) return; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
window.sendQuickReact = function (emoji) {
  const s = viewerStatuses[viewerIndex]; if (!s || !CU?.id) return;
  cfApi(`/status/${s.id}/reply`, 'POST', { uid: CU.id, author: UP.display_name, text: emoji }).catch(() => {});
  document.getElementById('storyQuickReacts').classList.remove('show'); toast(`${emoji} sent`);
};
window.toggleStoryQuickReacts = function () { document.getElementById('storyQuickReacts').classList.toggle('show'); };
window.sendStoryReply = async function () {
  const s = viewerStatuses[viewerIndex], input = document.getElementById('storyReplyInput');
  const text = (input.value || '').trim(); if (!s || !text || !CU?.id) return;
  const sendBtn = document.getElementById('storySendBtn'); sendBtn.disabled = true;
  try {
    await cfApi(`/status/${s.id}/reply`, 'POST', { uid: CU.id, author: UP.display_name, text }).catch(async () => {
      await cfApi('/messages', 'POST', { to: s.uid, from: CU.id, text: `Replied to your status: ${text}` }).catch(() => {});
    });
    toast('Reply sent');
  } catch (e) { toast('Reply sent'); }
  input.value = ''; sendBtn.classList.remove('active'); sendBtn.disabled = false;
};
window.pauseStoryTimer = () => { viewerPaused = true; };
window.resumeStoryTimer = () => { viewerPaused = false; };
window.toggleStoryMute = function () {
  storyMuted = !storyMuted;
  const v = document.querySelector('#storyContent video'); if (v) v.muted = storyMuted;
  document.getElementById('storyMuteIcon').className = storyMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
};
function updateStoryViewersPill() {
  const s = viewerStatuses[viewerIndex], pill = document.getElementById('storyViewersPill'); if (!s || !pill) return;
  const isOwner = s.uid === CU?.id; pill.classList.toggle('show', isOwner); if (!isOwner) return;
  const views = storyViews[s.id] || [];
  document.getElementById('storyViewersCount').textContent = `${views.length} view${views.length === 1 ? '' : 's'}`;
  document.getElementById('storyViewersAvatars').innerHTML = views.slice(-3).reverse().map(v => {
    const u = allUsers[v.uid] || {};
    return `<img src="${escapeHtml(u.avatar_url || v.avatar || uiAvatar(v.name))}" alt="">`;
  }).join('');
}
window.openStoryViewersSheet = function () {
  const s = viewerStatuses[viewerIndex]; if (!s || s.uid !== CU?.id) return;
  viewerPaused = true; document.getElementById('storySheetOverlay').classList.add('open'); switchStorySheetTab('views');
};
window.closeStoryViewersSheet = function () { document.getElementById('storySheetOverlay').classList.remove('open'); viewerPaused = false; };
window.switchStorySheetTab = function (tab) {
  const s = viewerStatuses[viewerIndex]; if (!s) return;
  document.getElementById('storySheetTabViews').classList.toggle('active', tab === 'views');
  document.getElementById('storySheetTabLikes').classList.toggle('active', tab === 'likes');
  const views = storyViews[s.id] || [], likes = storyLikes[s.id] || [];
  document.getElementById('storySheetViewsCount').textContent = views.length;
  document.getElementById('storySheetLikesCount').textContent = likes.length;
  const likedUids = new Set(likes.map(l => l.uid));
  const rows = (tab === 'views' ? views : likes).slice().reverse();
  const list = document.getElementById('storySheetList');
  if (!rows.length) { list.innerHTML = `<div class="story-sheet-empty"><i class="fa-regular ${tab === 'views' ? 'fa-eye' : 'fa-heart'}" style="font-size:22px;display:block;margin-bottom:8px;"></i>No one has ${tab === 'views' ? 'viewed' : 'liked'} this status yet.</div>`; return; }
  list.innerHTML = rows.map(v => {
    const u = allUsers[v.uid] || {}, name = u.display_name || v.name || 'User';
    const timeStr = v.time ? new Date(v.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="story-sheet-row"><img src="${escapeHtml(u.avatar_url || v.avatar || uiAvatar(name))}" alt=""><span class="sr-name">${escapeHtml(name)}</span>${tab === 'views' && likedUids.has(v.uid) ? '<i class="fa-solid fa-heart sr-heart"></i>' : ''}<span class="sr-time">${timeStr}</span></div>`;
  }).join('');
};
window.openStoryViewer = async function (uid) {
  try {
    const all = await getStatuses();
    viewerStatuses = all.filter(s => s.uid === uid).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (!viewerStatuses.length) { toast('No stories available', 'info'); return; }
    viewerIndex = 0;
    document.getElementById('storyViewer').classList.add('open');
    showStorySlide(); startStoryTimer();
  } catch (e) { toast('Failed to load stories: ' + e.message, 'error'); }
};
function showStorySlide() {
  const s = viewerStatuses[viewerIndex]; if (!s) { closeStoryViewer(); return; }
  const user = allUsers[s.uid] || { display_name: s.author || 'User' };
  document.getElementById('storyUser').innerHTML = `<img src="${escapeHtml(user.avatar_url || uiAvatar(user.display_name))}" alt=""><span>${escapeHtml(user.display_name)}</span>`;
  const content = document.getElementById('storyContent');
  content.innerHTML = '';
  const muteToggle = document.getElementById('storyMuteToggle'); muteToggle.style.display = 'none';
  if (s.image_url && isVideoUrl(s.image_url)) {
    const vid = document.createElement('video');
    vid.src = s.image_url; vid.playsInline = true; vid.autoplay = true; vid.muted = storyMuted; vid.onended = () => nextStorySlide();
    content.appendChild(vid); muteToggle.style.display = 'flex';
    document.getElementById('storyMuteIcon').className = storyMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
  } else if (s.image_url) {
    const img = document.createElement('img'); img.src = s.image_url; content.appendChild(img);
  } else {
    const div = document.createElement('div'); div.textContent = s.text || 'Status';
    Object.assign(div.style, { fontSize: '28px', fontWeight: '600', textAlign: 'center', padding: '20px', maxWidth: '80%', wordBreak: 'break-word' });
    content.appendChild(div);
  }
  document.getElementById('storyCaption').textContent = s.text || '';
  const isOwner = s.uid === CU?.id;
  document.getElementById('storyFooter').style.display = isOwner ? 'none' : 'flex';
  document.getElementById('storyQuickReacts').classList.remove('show');
  const replyInput = document.getElementById('storyReplyInput');
  replyInput.value = ''; replyInput.placeholder = `Reply to ${user.display_name}…`;
  document.getElementById('storySendBtn').classList.remove('active');
  updateStoryLikeBtn(); updateStoryViewersPill(); recordStoryView(s);
  document.getElementById('storyTimer').textContent = new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const pc = document.getElementById('storyProgress'); pc.innerHTML = '';
  viewerStatuses.forEach((_, i) => {
    const seg = document.createElement('div'); seg.className = 'progress-segment';
    const fill = document.createElement('div'); fill.className = 'fill';
    fill.style.width = i < viewerIndex ? '100%' : '0%';
    seg.appendChild(fill); pc.appendChild(seg);
  });
}
function startStoryTimer() {
  clearInterval(viewerTimer);
  let elapsed = 0, duration = 5000;
  const interval = 50, videoEl = document.querySelector('#storyContent video');
  if (videoEl) duration = isFinite(videoEl.duration) && videoEl.duration > 0 ? Math.min(videoEl.duration * 1000, 60000) : 15000;
  const fill = document.querySelectorAll('.progress-segment .fill')[viewerIndex]; if (!fill) return;
  viewerTimer = setInterval(() => {
    if (viewerPaused) return;
    if (videoEl && videoEl.paused && videoEl.currentTime === 0) return;
    elapsed += interval;
    fill.style.width = Math.min((elapsed / duration) * 100, 100) + '%';
    if (elapsed >= duration && !videoEl) { clearInterval(viewerTimer); nextStorySlide(); }
  }, interval);
}
function nextStorySlide() { if (viewerIndex < viewerStatuses.length - 1) { viewerIndex++; showStorySlide(); startStoryTimer(); } else closeStoryViewer(); }
function prevStorySlide() { if (viewerIndex > 0) { viewerIndex--; showStorySlide(); startStoryTimer(); } }
let lastStoryTapTime = 0, pressTimer;
const storyContentEl = document.getElementById('storyContent');
storyContentEl.addEventListener('click', function (e) {
  const now = Date.now(), isDouble = now - lastStoryTapTime < 300; lastStoryTapTime = now;
  if (isDouble) { const s = viewerStatuses[viewerIndex]; if (s && s.uid !== CU?.id) toggleStoryLike(true); else playStoryHeartBurst(); return; }
  if (viewerPaused) return;
  const rect = this.getBoundingClientRect();
  if (e.clientX - rect.left < rect.width / 2) prevStorySlide(); else nextStorySlide();
});
['mousedown', 'touchstart'].forEach(ev => storyContentEl.addEventListener(ev, () => { pressTimer = setTimeout(() => { viewerPaused = true; }, 300); }, { passive: true }));
['mouseup', 'mouseleave', 'touchend'].forEach(ev => storyContentEl.addEventListener(ev, () => { clearTimeout(pressTimer); viewerPaused = false; }));
window.closeStoryViewer = function () {
  document.getElementById('storyViewer').classList.remove('open');
  clearInterval(viewerTimer); viewerPaused = false;
  document.querySelector('#storyContent video')?.pause();
  document.getElementById('storyQuickReacts').classList.remove('show');
  document.getElementById('storySheetOverlay').classList.remove('open');
};
window.openStatusUpload = function () { window.location.href = 'status.html?upload=1'; };

// ---------- Feed ----------
window.switchFeedTab = function (tab, btn) {
  currentFeedTab = tab; renderLimit = PAGE_SIZE;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderPosts(applyCurrentFilters());
};
let postsRequest = null;
async function loadPosts() {
  if (postsRequest) return postsRequest;
  postsRequest = (async () => {
    try {
      const data = await cfApi('/posts');
      allPosts = (data || []).map(normalizePost);
      renderPosts(applyCurrentFilters());
      return allPosts;
    } catch (e) {
      if (!allPosts.length) document.getElementById('posts-container').innerHTML = '<div class="empty-state"><i class="fa-solid fa-wifi"></i><div class="et">Couldn’t load your feed</div><div class="es">Check your connection and try again.</div></div>';
      return [];
    } finally { postsRequest = null; }
  })();
  return postsRequest;
}
function applyCurrentFilters() {
  let list = [...allPosts];
  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase();
    list = list.filter(p => ((decodeMeta(p.content).text || '').toLowerCase().includes(q) || (p.author || '').toLowerCase().includes(q)));
  }
  return list;
}
function parsePostMedia(raw) {
  if (!raw) return [];
  try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed.filter(m => m && m.url); } catch (e) {}
  return [{ type: 'image', url: raw }];
}
function repostCountFor(postId) {
  return allPosts.filter(p => { const { meta } = decodeMeta(p.content); return meta && meta.kind === 'repost' && meta.origId === postId; }).length;
}
function renderPostMedia(p) {
  const media = parsePostMedia(p.image_url); if (!media.length) return '';
  postMediaMap[p.id] = media;
  const n = media.length;
  const tiles = media.map((m, i) => {
    const isVideo = m.type === 'video';
    const inner = isVideo
      ? `<video src="${escapeHtml(m.url)}" muted loop playsinline preload="none" data-feed-video></video><div class="video-overlay"><i class="fa-solid fa-play"></i></div><button class="video-mute-btn" onclick="event.stopPropagation();toggleFeedVideoMute(this)"><i class="fa-solid fa-volume-xmark"></i></button><div class="video-progress-track"><div class="video-progress-fill"></div></div>`
      : `<img src="${escapeHtml(m.url)}" loading="lazy" decoding="async" fetchpriority="low" alt="Post media">`;
    return `<div class="media-tile" onclick="openLB('${p.id}',${i})">${inner}</div>`;
  }).join('');
  const nav = n > 1 ? `<button class="media-nav-btn media-nav-prev" onclick="event.stopPropagation();scrollMedia(event,'${p.id}',-1)"><i class="fa-solid fa-chevron-left"></i></button><button class="media-nav-btn media-nav-next" onclick="event.stopPropagation();scrollMedia(event,'${p.id}',1)"><i class="fa-solid fa-chevron-right"></i></button><div class="media-count-badge" id="media-count-badge-${p.id}">1/${n}</div>` : '';
  const dots = n > 1 ? `<div class="media-dots" id="media-dots-${p.id}">${media.map((_, i) => `<span class="dot${i === 0 ? ' active' : ''}"></span>`).join('')}</div>` : '';
  return `<div class="feature-image"><div class="media-carousel" id="media-carousel-${p.id}" onscroll="onMediaScroll('${p.id}')">${tiles}</div>${nav}</div>${dots}`;
}
window.scrollMedia = function (evt, postId, dir) {
  evt.stopPropagation();
  const el = document.getElementById('media-carousel-' + postId);
  if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' });
};
window.onMediaScroll = function (postId) {
  const el = document.getElementById('media-carousel-' + postId), media = postMediaMap[postId];
  if (!el || !media || media.length < 2) return;
  const idx = Math.round(el.scrollLeft / el.clientWidth);
  const dots = document.getElementById('media-dots-' + postId);
  if (dots) [...dots.children].forEach((d, i) => d.classList.toggle('active', i === idx));
  const badge = document.getElementById('media-count-badge-' + postId);
  if (badge) badge.textContent = `${idx + 1}/${media.length}`;
};

// Polls
function getPollVotes(pollId, numOptions) {
  let v; try { v = JSON.parse(localStorage.getItem('alpha_poll_' + pollId)); } catch (e) {}
  if (!v || !Array.isArray(v.counts) || v.counts.length !== numOptions) {
    const seed = [...pollId].reduce((a, c) => a + c.charCodeAt(0), 0);
    v = { counts: Array.from({ length: numOptions }, (_, i) => ((seed * (i + 3)) % 11) + 2), myVote: null };
    localStorage.setItem('alpha_poll_' + pollId, JSON.stringify(v));
  }
  return v;
}
window.votePoll = function (pollId, idx, numOptions) {
  const v = getPollVotes(pollId, numOptions);
  if (v.myVote !== null) { toast('You already voted on this poll', 'info'); return; }
  v.counts[idx] = (v.counts[idx] || 0) + 1; v.myVote = idx;
  localStorage.setItem('alpha_poll_' + pollId, JSON.stringify(v));
  renderPosts(applyCurrentFilters()); toast('Vote counted');
};
function renderPoll(meta) {
  const opts = meta.options || [], v = getPollVotes(meta.id, opts.length);
  const total = v.counts.reduce((a, b) => a + b, 0) || 1, voted = v.myVote !== null;
  const rows = opts.map((label, i) => {
    const pct = Math.round((v.counts[i] / total) * 100), mine = v.myVote === i;
    const onclick = voted ? '' : `onclick="votePoll('${meta.id}',${i},${opts.length})"`;
    return `<div class="poll-option-row ${mine ? 'mine' : ''}" ${onclick}>${voted ? `<div class="poll-option-fill" style="width:${pct}%"></div>` : ''}<div class="poll-option-content"><span class="poll-option-label">${mine ? '<i class="fa-solid fa-circle-check"></i>' : ''}${escapeHtml(label)}</span>${voted ? `<span class="poll-option-pct">${pct}%</span>` : ''}</div></div>`;
  }).join('');
  return `<div class="poll-block"><div class="poll-question">${meta.question ? linkify(meta.question) : 'Poll'}</div>${rows}<div class="poll-meta">${total} vote${total === 1 ? '' : 's'} ${voted ? '· you voted' : '· tap an option to vote'}</div></div>`;
}
function renderQuoted(meta) {
  return `<div class="quoted-post"><div class="qp-header"><i class="fa-solid fa-quote-left"></i> ${escapeHtml(meta.origAuthor || 'Alpha member')}</div><div class="qp-body">${linkify((meta.origContent || '').slice(0, 220))}${meta.origMediaCount ? ` <span style="color:var(--text-muted);">(+${meta.origMediaCount} media)</span>` : ''}</div></div>`;
}
window.togglePostMenu = function (evt, postId) {
  evt.stopPropagation();
  document.querySelectorAll('.more-menu.show').forEach(m => { if (m.id !== 'menu-' + postId) m.classList.remove('show'); });
  document.getElementById('menu-' + postId)?.classList.toggle('show');
};
document.addEventListener('click', () => document.querySelectorAll('.more-menu.show').forEach(m => m.classList.remove('show')));

const openComments = new Set();
function postTypeOf(meta, media) {
  if (meta && meta.kind === 'poll') return { k: 'poll', label: 'Poll', icon: 'fa-chart-simple' };
  if (meta && meta.kind === 'repost') return { k: 'repost', label: 'Repost', icon: 'fa-retweet' };
  if (media.some(m => m.type === 'video')) return { k: 'video', label: 'Video', icon: 'fa-circle-play' };
  if (media.length) return { k: 'photo', label: media.length > 1 ? media.length + ' photos' : 'Photo', icon: 'fa-image' };
  return { k: 'text', label: 'Post', icon: 'fa-pen-nib' };
}
window.showMorePosts = function () { renderLimit += PAGE_SIZE; renderPosts(applyCurrentFilters()); };

function renderPosts(posts) {
  const el = document.getElementById('posts-container'); if (!el) return;
  if (!posts || !posts.length) {
    const msg = currentSearchQuery ? 'No posts match your search' : 'Be the first to share something';
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-feather"></i><div class="et">Nothing here yet</div><div class="es">${msg}</div></div>`; return;
  }
  let sorted = [...posts];
  const empty = (ic, t, s) => { el.innerHTML = `<div class="empty-state"><i class="fa-solid ${ic}"></i><div class="et">${t}</div><div class="es">${s}</div></div>`; };
  if (currentFeedTab === 'trending') sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  else if (currentFeedTab === 'recent') sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  else if (currentFeedTab === 'following') {
    const f = loadFollows(); sorted = sorted.filter(p => f.includes(p.uid));
    if (!sorted.length) return empty('fa-users', 'No posts yet', 'Follow people to see their posts here');
  } else if (currentFeedTab === 'saved') {
    const s = loadSaved(); sorted = sorted.filter(p => s.includes(p.id));
    if (!sorted.length) return empty('fa-bookmark', 'Nothing saved yet', 'Tap Save on any post to keep it here');
  }
  const total = sorted.length;
  sorted = sorted.slice(0, renderLimit);
  const meAvatar = avatarHTML(CU?.id, 30, 10);

  el.innerHTML = sorted.map(p => {
    const { text, meta } = decodeMeta(p.content);
    const media = parsePostMedia(p.image_url), t = postTypeOf(meta, media);
    const liked = (p.liked_by || []).includes(CU?.id), mine = p.uid === CU?.id;
    const user = allUsers[p.uid] || { display_name: p.author || 'User' };
    const displayUser = p.anonymous ? { display_name: 'Anonymous' } : user;
    const saved = isSaved(p.id), likes = p.likes || 0, cc = p.comment_count || 0, rp = repostCountFor(p.id);
    const open = openComments.has(p.id), isPoll = t.k === 'poll', isRepost = t.k === 'repost', id = p.id;
    return `<article class="post ax-post ax-t-${t.k}" id="post-${id}">
      <div class="ax-head">
        ${p.anonymous ? '<div class="avatar" style="width:42px;height:42px;border-radius:14px;"><i class="fa-solid fa-user-secret"></i></div>' : avatarHTML(p.uid, 42, 14)}
        <div class="ax-who">
          <div class="ax-name">${escapeHtml(displayUser.display_name)}${mine ? ' <span class="you-badge">You</span>' : ''}<span class="ax-chip"><i class="fa-solid ${t.icon}"></i>${t.label}</span></div>
          <div class="ax-sub">${relTime(p.created_at)}${p.mood ? ' · ' + escapeHtml(p.mood.replace('fa-', '').replace('-', ' ')) : ''}</div>
        </div>
        ${!mine && p.uid ? followButtonHTML(p.uid) : ''}
        <div class="more-wrap"><button class="more" onclick="togglePostMenu(event,'${id}')"><i class="fa-solid fa-ellipsis"></i></button>
          <div class="more-menu" id="menu-${id}">
            <button onclick="event.stopPropagation();sharePost('${id}');togglePostMenu(event,'${id}')"><i class="fa-solid fa-link"></i> Copy link</button>
            <button onclick="event.stopPropagation();toggleSave('${id}');togglePostMenu(event,'${id}')"><i class="fa-solid fa-bookmark"></i> ${saved ? 'Remove from saved' : 'Save post'}</button>
            ${mine ? `<button class="danger" onclick="event.stopPropagation();deletePost('${id}')"><i class="fa-solid fa-trash"></i> Delete post</button>` : ''}
          </div></div>
      </div>
      ${(text || isRepost || isPoll) ? `<div class="ax-body">${text ? `<div class="ax-text">${linkify(text)}</div>` : ''}${isRepost ? renderQuoted(meta) : ''}${isPoll ? renderPoll(meta) : ''}</div>` : ''}
      ${(!isPoll && media.length) ? `<div class="ax-media">${renderPostMedia(p)}</div>` : ''}
      <div class="ax-engage">
        <div class="ax-likes"><span class="ax-heart"><i class="fa-solid fa-heart"></i></span><span>${likes}<small> ${likes === 1 ? 'like' : 'likes'}</small></span></div>
        <div class="ax-counts"><span class="ax-pill" onclick="toggleComments('${id}')"><i class="fa-regular fa-comment"></i>${plural(cc, 'comment')}</span>${rp ? `<span class="ax-pill"><i class="fa-solid fa-retweet"></i>${plural(rp, 'repost')}</span>` : ''}</div>
      </div>
      <div class="ax-actions">
        <button class="ax-btn like ${liked ? 'on' : ''}" onclick="quickReact('${id}')"><i class="${liked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>${liked ? 'Liked' : 'Like'}</button>
        <button class="ax-btn comment" onclick="focusCommentInput('${id}')"><i class="fa-regular fa-comment"></i>Comment</button>
        <button class="ax-btn repost" onclick="openRepostModal('${id}')"><i class="fa-solid fa-retweet"></i>Repost</button>
        <button class="ax-btn share" onclick="sharePost('${id}')"><i class="fa-regular fa-paper-plane"></i>Share</button>
        <button class="ax-btn save ${saved ? 'on' : ''}" onclick="toggleSave('${id}')"><i class="${saved ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>${saved ? 'Saved' : 'Save'}</button>
      </div>
      <div class="ax-comments ${open ? 'open' : ''}" id="axc-${id}">
        <div class="ax-c-head" onclick="toggleComments('${id}')"><span>Comments · ${cc}</span><i class="fa-solid fa-chevron-down"></i></div>
        <div class="ax-c-list" id="comment-list-${id}"></div>
        <div class="ax-c-input">${meAvatar}<input class="comment-input" id="comment-input-${id}" placeholder="Write a comment…" onkeydown="if(event.key==='Enter'){event.preventDefault();submitComment('${id}')}"><button class="ax-c-send" onclick="submitComment('${id}')"><i class="fa-solid fa-paper-plane"></i></button></div>
      </div>
    </article>`;
  }).join('') + (total > sorted.length ? `<button class="load-more" onclick="showMorePosts()">Show more posts (${total - sorted.length} left)</button>` : '');

  setupFeedVideoObserver();
  openComments.forEach(id => { if (document.getElementById('comment-list-' + id)) loadComments(id); });
}
window.toggleComments = function (id) {
  const box = document.getElementById('axc-' + id); if (!box) return;
  const open = !box.classList.contains('open'); box.classList.toggle('open', open);
  if (open) { openComments.add(id); loadComments(id); } else openComments.delete(id);
};
window.focusCommentInput = function (id) {
  const box = document.getElementById('axc-' + id);
  if (box && !box.classList.contains('open')) { box.classList.add('open'); openComments.add(id); loadComments(id); }
  document.getElementById('comment-input-' + id)?.focus();
};

// Video autoplay (only the one on screen plays)
let feedVideoObserver = null;
function setupFeedVideoObserver() {
  if (feedVideoObserver) feedVideoObserver.disconnect();
  const videos = document.querySelectorAll('#posts-container [data-feed-video]');
  if (!videos.length) return;
  const lowData = window.AlphaCommon && AlphaCommon.isLowData && AlphaCommon.isLowData();
  feedVideoObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const v = entry.target;
      if (!lowData && entry.isIntersecting && entry.intersectionRatio >= 0.6) v.play().catch(() => {}); else v.pause();
    });
  }, { threshold: [0, 0.6, 1] });
  videos.forEach(v => {
    feedVideoObserver.observe(v);
    v.addEventListener('timeupdate', () => {
      const fill = v.closest('.media-tile')?.querySelector('.video-progress-fill');
      if (fill && v.duration) fill.style.width = ((v.currentTime / v.duration) * 100) + '%';
    });
    if (lowData) v.controls = true;
  });
}
window.toggleFeedVideoMute = function (btn) {
  const video = btn.closest('.media-tile').querySelector('video'); if (!video) return;
  video.muted = !video.muted;
  btn.innerHTML = video.muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
};

// ---------- Post actions ----------
window.createPost = async function () {
  const now = Date.now();
  if (now - lastPostTime < POST_COOLDOWN) { toast('Please wait before posting again', 'info'); return; }
  const ta = document.getElementById('post-text'), content = ta?.value?.trim() || '';
  const pollOpen = document.getElementById('poll-composer').classList.contains('show');
  let pollOptions = [];
  if (pollOpen) pollOptions = [...document.querySelectorAll('#poll-composer input')].map(i => i.value.trim()).filter(Boolean);
  const isPollPost = pollOpen && pollOptions.length >= 2;
  if (!content && !selectedMedia.length && !isPollPost) { toast('Write something, add media, or build a poll first', 'info'); return; }
  if (pollOpen && !isPollPost) { toast('A poll needs at least 2 options', 'info'); return; }
  lastPostTime = now;
  const btn = document.getElementById('post-btn'); btn.disabled = true;
  try {
    let bodyToSend, mediaJSON = null;
    if (isPollPost) {
      bodyToSend = encodeMeta('', { kind: 'poll', id: 'poll_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), question: content || 'Poll', options: pollOptions.slice(0, 6) });
    } else {
      bodyToSend = content;
      const media = [];
      for (let i = 0; i < selectedMedia.length; i++) {
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${i + 1}/${selectedMedia.length}`;
        const original = selectedMedia[i];
        const data = await uploadFile(await prepareUploadFile(original));
        media.push({ type: original.type.startsWith('video/') ? 'video' : 'image', url: data.url });
      }
      mediaJSON = media.length ? JSON.stringify(media) : null;
    }
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Posting...';
    await cfApi('/posts', 'POST', { content: sanitizeInput(bodyToSend || ''), image_url: mediaJSON, author: UP.display_name || 'User', uid: CU.id, mood: MOODS[moodIdx].icon, anonymous: postAnon ? 1 : 0 });
    ta.value = ''; clearComposeMedia(); closePollComposer(); toast('Posted'); loadPosts();
  } catch (e) { toast('Post failed: ' + e.message, 'error'); }
  btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Post';
};
window.focusComposer = function () {
  const card = document.getElementById('compose-card'), ta = document.getElementById('post-text');
  if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.remove('compose-highlight'); void card.offsetWidth; card.classList.add('compose-highlight'); }
  setTimeout(() => ta?.focus(), 350);
};
window.deletePost = async function (id) {
  id = String(id);
  const p = allPosts.find(x => String(x.id) === id);
  if (p && CU && p.uid !== CU.id) { toast('You can only delete your own posts', 'error'); return; }
  if (!confirm('Delete this post?')) return;
  const card = document.getElementById('post-' + id); if (card) card.style.opacity = '.4';
  try {
    await cfApi(`/posts/${id}`, 'DELETE');
    allPosts = allPosts.filter(x => String(x.id) !== id);
    renderPosts(applyCurrentFilters()); toast('Post deleted');
  } catch (e) { if (card) card.style.opacity = ''; toast(e.message || 'Delete failed', 'error'); }
};
window.sharePost = async function (id) {
  const url = location.origin + location.pathname + '?post=' + encodeURIComponent(id);
  try {
    if (navigator.share) await navigator.share({ title: 'Alpha', text: 'Check this post on Alpha', url });
    else if (navigator.clipboard) { await navigator.clipboard.writeText(url); toast('Link copied'); }
    else { const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Link copied'); }
  } catch (e) { if (e?.name !== 'AbortError') toast('Could not share this post', 'error'); }
};
window.openRepostModal = function (postId) {
  const p = allPosts.find(x => x.id === postId); if (!p) return;
  const { text } = decodeMeta(p.content);
  const author = allUsers[p.uid]?.display_name || p.author || 'Alpha member';
  openModal(`<div class="modal-title">Repost</div><div class="quoted-post" style="margin:0 0 12px;"><div class="qp-header"><i class="fa-solid fa-quote-left"></i> ${escapeHtml(author)}</div><div class="qp-body">${linkify((text || '').slice(0, 200))}</div></div><textarea id="repost-comment" placeholder="Add your own take (optional)…" rows="3" style="width:100%;border:1.5px solid var(--border);border-radius:var(--radius-md);padding:10px;background:var(--surface);color:var(--text-primary);font-size:13px;resize:vertical;"></textarea><button class="post-btn" style="margin-top:12px;width:100%;" onclick="submitRepost('${postId}')"><i class="fa-solid fa-retweet"></i> Repost now</button>`);
  document.getElementById('repost-comment')?.focus();
};
window.submitRepost = async function (origId) {
  const p = allPosts.find(x => x.id === origId); if (!p) return;
  const { text } = decodeMeta(p.content), media = parsePostMedia(p.image_url);
  const comment = document.getElementById('repost-comment')?.value?.trim() || '';
  const author = allUsers[p.uid]?.display_name || p.author || 'Alpha member';
  const meta = { kind: 'repost', origId, origUid: p.uid, origAuthor: author, origContent: text || '', origMediaCount: media.length };
  try {
    await cfApi('/posts', 'POST', { content: sanitizeInput(encodeMeta(comment, meta)), image_url: null, author: UP.display_name || 'User', uid: CU.id, mood: null, anonymous: 0 });
    closeModal(); toast('Reposted to your feed'); loadPosts();
  } catch (e) { toast('Repost failed: ' + e.message, 'error'); }
};
async function loadComments(id) {
  const el = document.getElementById('comment-list-' + id); if (!el) return;
  el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">Loading…</div>';
  try {
    const data = await cfApi(`/posts/${id}/comments`);
    if (!data?.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No comments yet</div>'; return; }
    el.innerHTML = data.map(c => {
      const user = allUsers[c.uid] || { display_name: c.author || 'User' };
      return `<div class="comment-row">${avatarHTML(c.uid, 26, 9)}<div><div class="comment-bubble"><span class="c-author">${escapeHtml(user.display_name)}</span> <span class="c-text">${escapeHtml(c.text)}</span></div><div class="comment-time">${relTime(c.created_at)}</div></div></div>`;
    }).join('');
  } catch (e) { el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">Error loading comments</div>'; }
}
window.submitComment = async function (id) {
  const inp = document.getElementById('comment-input-' + id), text = inp?.value?.trim(); if (!text) return;
  const btn = inp.nextElementSibling; if (btn) btn.disabled = true;
  try {
    await cfApi(`/posts/${id}/comments`, 'POST', { text: sanitizeInput(text), author: UP.display_name || 'User', uid: CU.id });
    inp.value = ''; openComments.add(id);
    await loadPosts(); toast('Comment posted');
  } catch (e) { toast('Comment failed', 'error'); }
  if (btn) btn.disabled = false;
};

// ---------- Media picker ----------
window.handleMediaSelect = function (input) {
  const files = Array.from(input.files || []); if (!files.length) return;
  const room = MAX_MEDIA_PER_POST - selectedMedia.length;
  if (room <= 0) { toast(`You can add up to ${MAX_MEDIA_PER_POST} items per post`, 'info'); input.value = ''; return; }
  const toAdd = files.slice(0, room);
  if (files.length > toAdd.length) toast(`Only added ${toAdd.length} — max ${MAX_MEDIA_PER_POST} items per post`, 'info');
  selectedMedia.push(...toAdd); input.value = ''; renderMediaPreview();
};
window.removeMediaAt = function (idx) { selectedMedia.splice(idx, 1); renderMediaPreview(); };
let previewObjectUrls = [];
function clearPreviewObjectUrls() { previewObjectUrls.forEach(u => URL.revokeObjectURL(u)); previewObjectUrls = []; }
function clearComposeMedia() { selectedMedia = []; clearPreviewObjectUrls(); renderMediaPreview(); }
function renderMediaPreview() {
  const grid = document.getElementById('compose-media-grid'); if (!grid) return;
  clearPreviewObjectUrls();
  if (!selectedMedia.length) { grid.classList.remove('show'); grid.innerHTML = ''; return; }
  grid.classList.add('show');
  grid.innerHTML = selectedMedia.map((f, i) => {
    const url = URL.createObjectURL(f); previewObjectUrls.push(url);
    const inner = f.type.startsWith('video/')
      ? `<video src="${url}" muted preload="none"></video><span class="media-video-badge"><i class="fa-solid fa-video"></i></span>`
      : `<img src="${url}" loading="lazy" decoding="async" alt="Selected media">`;
    return `<div class="compose-media-tile">${inner}<button class="media-remove" onclick="removeMediaAt(${i})" aria-label="Remove media"><i class="fa-solid fa-xmark"></i></button></div>`;
  }).join('') + (selectedMedia.length < MAX_MEDIA_PER_POST ? `<button class="compose-media-add" onclick="document.getElementById('post-media-input').click()" aria-label="Add media"><i class="fa-solid fa-plus"></i></button>` : '');
}

// ---------- Poll composer ----------
window.togglePollComposer = function () {
  const pc = document.getElementById('poll-composer'), btn = document.getElementById('poll-btn');
  const show = !pc.classList.contains('show'); pc.classList.toggle('show', show); btn.classList.toggle('active', show);
  if (show) document.getElementById('poll-opt-0')?.focus();
};
function closePollComposer() {
  const pc = document.getElementById('poll-composer');
  pc.classList.remove('show'); document.getElementById('poll-btn').classList.remove('active');
  pc.innerHTML = `<div class="poll-opt-row"><input type="text" id="poll-opt-0" placeholder="Option 1" maxlength="60"></div><div class="poll-opt-row"><input type="text" id="poll-opt-1" placeholder="Option 2" maxlength="60"></div><button class="poll-add-opt" id="poll-add-btn" onclick="addPollOption()"><i class="fa-solid fa-plus" style="font-size:10px;"></i> Add option</button>`;
}
window.addPollOption = function () {
  const pc = document.getElementById('poll-composer'), rows = pc.querySelectorAll('.poll-opt-row').length;
  if (rows >= 6) { toast('Max 6 options per poll', 'info'); return; }
  const row = document.createElement('div'); row.className = 'poll-opt-row';
  row.innerHTML = `<input type="text" id="poll-opt-${rows}" placeholder="Option ${rows + 1}" maxlength="60"><button class="poll-remove-opt" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>`;
  document.getElementById('poll-add-btn').before(row);
  if (rows + 1 >= 6) document.getElementById('poll-add-btn').style.display = 'none';
};
window.cycleMood = function () { moodIdx = (moodIdx + 1) % MOODS.length; document.getElementById('mood-btn').innerHTML = `<i class="fa-solid ${MOODS[moodIdx].icon}"></i>`; };
window.toggleAnon = function () {
  postAnon = !postAnon;
  const btn = document.getElementById('anon-btn');
  btn.innerHTML = `<i class="fa-solid ${postAnon ? 'fa-user-slash' : 'fa-user'}"></i>`; btn.classList.toggle('active', postAnon);
};
let searchDebounce;
window.searchPosts = function (val) {
  currentSearchQuery = (val || '').trim(); renderLimit = PAGE_SIZE;
  const navInput = document.getElementById('nav-search-input');
  if (navInput && navInput.value !== currentSearchQuery) navInput.value = currentSearchQuery;
  if (currentSearchQuery) {
    const wrap = document.getElementById('search-bar-wrap');
    if (wrap && !wrap.classList.contains('show')) { wrap.classList.add('show'); document.getElementById('search-toggle-btn')?.classList.add('active'); }
  }
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => renderPosts(applyCurrentFilters()), 150);
};

// ---------- Navigation ----------
const go = u => () => { window.location.href = u; };
window.goHome = go('index.html'); window.goToExplore = go('explore.html'); window.goToReels = go('reels.html');
window.goToChat = go('chat.html'); window.goToGroups = go('groups.html'); window.goToCalls = go('calls.html');
window.goToStatus = go('status.html'); window.goToEvents = go('events.html'); window.goToAI = go('ai.html');
window.goToVault = go('vaults.html'); window.goToSettings = go('settings.html');
window.goToChatWith = uid => { window.location.href = `chat.html?user=${encodeURIComponent(uid)}`; };
window.goIndexBack = function () { if (history.length > 1) history.back(); else goHome(); };
window.openMobileMenu = () => document.getElementById('mobile-menu-overlay').classList.add('show');
window.closeMobileMenu = () => document.getElementById('mobile-menu-overlay').classList.remove('show');
window.doLogout = function () {
  if (confirm('Sign out?')) { localStorage.removeItem('alpha_token'); localStorage.removeItem('alpha_user'); window.location.href = 'login.html'; }
};

// ---------- Init ----------
async function init() {
  initTheme(); initBackButton();
  if (new URLSearchParams(location.search).has('refresh')) { setTimeout(() => loadStories(), 500); history.replaceState(null, '', location.pathname); }
  CF_TOKEN = localStorage.getItem('alpha_token') || null;
  const savedUser = localStorage.getItem('alpha_user');
  if (!CF_TOKEN || !savedUser) { window.location.href = 'login.html'; return; }
  try { const parsed = JSON.parse(savedUser); CU = parsed.CU; UP = parsed.UP || UP; } catch (e) { window.location.href = 'login.html'; return; }
  if (!CU || !CU.id) { window.location.href = 'login.html'; return; }

  document.getElementById('posts-container').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  updateMeMini();
  await Promise.allSettled([loadUsers(), loadPosts()]);

  const deep = new URLSearchParams(location.search).get('post');
  if (deep) {
    const target = allPosts.findIndex(p => String(p.id) === deep);
    if (target >= renderLimit) { renderLimit = target + 1; renderPosts(applyCurrentFilters()); }
    switchFeedTab('trending', document.querySelector('.tabs button[data-tab="trending"]'));
    setTimeout(() => {
      const el = document.getElementById('post-' + deep);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('compose-highlight'); setTimeout(() => el.classList.remove('compose-highlight'), 1600); }
    }, 300);
  }
  const refresh = () => {
    if (document.hidden) return;
    const typing = document.activeElement?.classList?.contains('comment-input') && document.activeElement.value;
    if (!typing) loadPosts();
  };
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
document.getElementById('modal-overlay').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
window.addEventListener('storage', e => { if (e.key === 'alpha_status_ping') loadStories(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeLB(); closeMobileMenu(); }
  if (document.getElementById('lightbox')?.classList.contains('open')) {
    if (e.key === 'ArrowLeft') lbNav(-1);
    if (e.key === 'ArrowRight') lbNav(1);
  }
});
window.addEventListener('pagehide', clearPreviewObjectUrls);

init().catch(err => {
  console.error('Alpha init failed:', err);
  const c = document.getElementById('posts-container');
  if (c) c.innerHTML = '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div class="et">Something went wrong</div><div class="es">' + escapeHtml(err.message || err) + '</div></div>';
});