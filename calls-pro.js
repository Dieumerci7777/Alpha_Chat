/* ============================================================
   Alphagram — calls-pro.js
   Add AFTER the main inline <script> in calls.html:
       <script src="calls-pro.js"></script>
   Upgrades: echo/noise control, HD video + simulcast, device settings,
   ringtones (built-in or your own file), background notifications,
   same-room mode + feedback detection, spotlight layout, network quality,
   audio-blocked recovery, flip camera, fullscreen.
   ============================================================ */
(function () {
    const LS = 'alpha_call_prefs';
    const DEF = { mic: '', cam: '', spk: '', vol: 1, ns: true, ec: true, agc: true, quality: 'hd',
                  tone: 'classic', ringVol: 0.8, vibrate: true, notify: true, spot: false };
    let P = Object.assign({}, DEF);
    try { Object.assign(P, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) {}
    const save = () => { try { localStorage.setItem(LS, JSON.stringify(P)); } catch (e) {} };

    const QUAL = {
        data: { res: { width: 640, height: 360, frameRate: 15 },  enc: { maxBitrate: 450000,  maxFramerate: 15 } },
        std:  { res: { width: 960, height: 540, frameRate: 24 },  enc: { maxBitrate: 1000000, maxFramerate: 24 } },
        hd:   { res: { width: 1280, height: 720, frameRate: 30 }, enc: { maxBitrate: 1800000, maxFramerate: 30 } },
        fhd:  { res: { width: 1920, height: 1080, frameRate: 30 }, enc: { maxBitrate: 3500000, maxFramerate: 30 } }
    };

    let sameRoom = false, bannerShown = false, doubleTalk = 0, spotUid = null;

    // ---------------- audio / video constraints ----------------
    function audioC() {
        return { echoCancellation: P.ec, noiseSuppression: P.ns, autoGainControl: P.agc,
                 voiceIsolation: P.ns, channelCount: 1, deviceId: P.mic || undefined };
    }

    // ---------------- styles ----------------
    const st = document.createElement('style');
    st.textContent = `
    .g-q{position:absolute;top:8px;right:8px;font-size:11px;z-index:2;text-shadow:0 1px 4px #000}
    .g-q[data-q=excellent],.g-q[data-q=good]{color:#34d399}.g-q[data-q=poor]{color:#f5b942}
    .g-q[data-q=lost]{color:#ef4444}.g-q[data-q=unknown]{color:#94a3b8}
    .group-tiles.spotlight{grid-template-columns:repeat(6,1fr)!important;grid-template-rows:minmax(0,1fr) 110px;grid-auto-rows:110px;padding-bottom:150px}
    .group-tiles.spotlight .group-tile.spot{grid-column:1/-1;grid-row:1}
    #proBanner{position:absolute;top:calc(110px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:47;display:none;align-items:center;gap:10px;
      background:rgba(15,19,27,.95);border:1px solid rgba(245,185,66,.4);color:#f5e6c4;padding:10px 14px;border-radius:14px;font-size:12.5px;max-width:92vw;backdrop-filter:blur(14px)}
    #proBanner button{padding:6px 12px;border-radius:9px;font-weight:700;font-size:12px;background:linear-gradient(135deg,var(--ag-text-2),var(--primary));color:#fff;white-space:nowrap}
    #proBanner button.ghost{background:rgba(255,255,255,.1)}
    .pro-row{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
    .pro-row label{font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em}
    .pro-row select{width:100%;padding:9px 10px;border:1.5px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text-primary);font-size:13px}
    .pro-tog{display:flex;align-items:center;justify-content:space-between;padding:7px 0;font-size:13px;font-weight:600}
    .pro-tog input{width:18px;height:18px;accent-color:var(--primary)}
    .pro-h{font-size:12px;font-weight:800;color:var(--primary);margin:14px 0 8px;text-transform:uppercase;letter-spacing:.08em}
    .pro-btns{display:flex;gap:8px;flex-wrap:wrap}
    .pro-btns button{padding:8px 12px;border-radius:10px;background:var(--surface-hover);font-size:12px;font-weight:700;border:1px solid var(--border)}
    .pro-tip{font-size:11.5px;color:var(--text-muted);line-height:1.5;margin-top:6px}
    #proSettings .modal{max-width:440px}`;
    document.head.appendChild(st);

    // ---------------- UI injection ----------------
    function ctrl(id, icon, label, fn, cls) {
        const w = document.createElement('div');
        w.className = 'ctrl-wrap';
        w.innerHTML = `<button class="ctrl-btn ${cls || ''}" id="${id}"><i class="fa-solid ${icon}"></i></button><span>${label}</span>`;
        w.firstChild.addEventListener('click', fn);
        return w;
    }
    const anchor = $('ctrlHand').parentElement;
    [ctrl('ctrlSame', 'fa-people-roof', 'Same room', () => setSameRoom(!sameRoom)),
     ctrl('ctrlLayout', 'fa-table-cells-large', 'Layout', toggleLayout),
     ctrl('ctrlFlip', 'fa-camera-rotate', 'Flip', flipCamera),
     ctrl('ctrlSet', 'fa-sliders', 'Settings', openSettings)]
        .reverse().forEach(el => anchor.after(el));

    const tr = document.querySelector('.stage-topbar-right');
    const fs = document.createElement('button');
    fs.className = 'stage-icon-btn'; fs.title = 'Fullscreen';
    fs.innerHTML = '<i class="fa-solid fa-expand"></i>';
    fs.onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {}); };
    tr.prepend(fs);

    const gear = document.createElement('button');
    gear.className = 'circle-btn'; gear.title = 'Call settings';
    gear.innerHTML = '<i class="fa-solid fa-sliders"></i>';
    gear.onclick = openSettings;
    document.querySelector('.top-actions')?.prepend(gear);

    const banner = document.createElement('div');
    banner.id = 'proBanner';
    banner.innerHTML = `<span id="proBannerText"></span><button id="proBannerAct"></button><button class="ghost" onclick="this.parentElement.style.display='none'">Dismiss</button>`;
    $('stageRoot').appendChild(banner);
    function showBanner(text, actLabel, act) {
        $('proBannerText').textContent = text;
        const b = $('proBannerAct'); b.textContent = actLabel; b.onclick = () => { act(); banner.style.display = 'none'; };
        banner.style.display = 'flex';
        setTimeout(() => { banner.style.display = 'none'; }, 15000);
    }

    const sheet = document.createElement('div');
    sheet.className = 'modal-overlay'; sheet.id = 'proSettings';
    sheet.innerHTML = `<div class="modal">
      <button class="modal-close" onclick="document.getElementById('proSettings').classList.remove('show')"><i class="fa-solid fa-xmark"></i></button>
      <div class="modal-title">Call settings</div><div class="modal-sub">Saved on this device</div>

      <div class="pro-h">Ringtone</div>
      <div class="pro-row"><label>Incoming call sound</label>
        <select id="psTone">
          <option value="classic">Classic ring</option><option value="marimba">Marimba</option>
          <option value="digital">Digital</option><option value="soft">Soft chime</option>
          <option value="custom">My own file (e.g. my phone's ringtone)</option></select></div>
      <div class="pro-btns" style="margin-bottom:10px">
        <button id="psPick"><i class="fa-solid fa-folder-open"></i> Choose file</button>
        <button id="psPreview"><i class="fa-solid fa-play"></i> Preview</button></div>
      <input type="file" id="psFile" accept="audio/*" style="display:none">
      <div class="pro-row"><label>Ringtone volume</label><input type="range" id="psRingVol" min="0" max="1" step="0.05"></div>
      <label class="pro-tog">Vibrate on incoming call <input type="checkbox" id="psVib"></label>
      <label class="pro-tog">Show notification when app is in background <input type="checkbox" id="psNotify"></label>

      <div class="pro-h">Audio</div>
      <div class="pro-row"><label>Microphone</label><select id="psMic"></select></div>
      <div class="pro-row" id="psSpkRow"><label>Speaker</label><select id="psSpk"></select></div>
      <div class="pro-row"><label>Speaker volume</label><input type="range" id="psVol" min="0" max="1" step="0.05"></div>
      <label class="pro-tog">Noise suppression <input type="checkbox" id="psNs"></label>
      <label class="pro-tog">Echo cancellation <input type="checkbox" id="psEc"></label>
      <label class="pro-tog">Auto volume (gain control) <input type="checkbox" id="psAgc"></label>
      <div class="pro-tip">Two phones/laptops in the same room will always squeal at each other. Use headphones, or tap <b>Same room</b> during the call on the extra device.</div>

      <div class="pro-h">Video</div>
      <div class="pro-row"><label>Camera</label><select id="psCam"></select></div>
      <div class="pro-row"><label>Quality</label><select id="psQ">
        <option value="data">Data saver (360p)</option><option value="std">Standard (540p)</option>
        <option value="hd">HD (720p)</option><option value="fhd">Full HD (1080p)</option></select></div>
    </div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', e => { if (e.target === sheet) sheet.classList.remove('show'); });

    async function fillDevices() {
        let list = [];
        try { list = await navigator.mediaDevices.enumerateDevices(); } catch (e) {}
        const fill = (id, kind, cur) => {
            const items = list.filter(d => d.kind === kind), el = $(id);
            el.innerHTML = '<option value="">Default</option>' + items.map((d, i) =>
                `<option value="${escapeHTML(d.deviceId)}">${escapeHTML(d.label || kind + ' ' + (i + 1))}</option>`).join('');
            el.value = cur || '';
            return items.length;
        };
        fill('psMic', 'audioinput', P.mic);
        fill('psCam', 'videoinput', P.cam);
        $('psSpkRow').style.display = fill('psSpk', 'audiooutput', P.spk) ? '' : 'none';
    }
    async function openSettings() {
        $('psTone').value = P.tone; $('psRingVol').value = P.ringVol; $('psVol').value = P.vol;
        $('psVib').checked = P.vibrate; $('psNotify').checked = P.notify;
        $('psNs').checked = P.ns; $('psEc').checked = P.ec; $('psAgc').checked = P.agc; $('psQ').value = P.quality;
        sheet.classList.add('show');
        fillDevices();
    }
    navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (sheet.classList.contains('show')) fillDevices(); });

    const LKS = () => window.LivekitClient.Track.Source;
    async function restartMic() {
        const pub = lkRoom?.localParticipant.getTrackPublication(LKS().Microphone);
        try { await pub?.track?.restartTrack(audioC()); } catch (e) { toast('Could not apply audio setting', 'error'); }
    }
    async function switchDev(kind, id) {
        try { await lkRoom?.switchActiveDevice(kind, id || 'default'); } catch (e) { toast('Could not switch device', 'error'); }
    }
    const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
    on('psMic', 'change', e => { P.mic = e.target.value; save(); switchDev('audioinput', P.mic); });
    on('psSpk', 'change', e => { P.spk = e.target.value; save(); switchDev('audiooutput', P.spk); });
    on('psCam', 'change', e => { P.cam = e.target.value; save(); switchDev('videoinput', P.cam); });
    on('psVol', 'input', e => { P.vol = +e.target.value; save(); applyOutput(); });
    on('psRingVol', 'input', e => { P.ringVol = +e.target.value; save(); });
    on('psVib', 'change', e => { P.vibrate = e.target.checked; save(); });
    on('psNotify', 'change', e => {
        P.notify = e.target.checked; save();
        if (P.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    });
    ['Ns', 'Ec', 'Agc'].forEach(k => on('ps' + k, 'change', e => { P[k.toLowerCase()] = e.target.checked; save(); restartMic(); }));
    on('psQ', 'change', async e => {
        P.quality = e.target.value; save();
        const pub = lkRoom?.localParticipant.getTrackPublication(LKS().Camera);
        try { await pub?.track?.restartTrack({ resolution: QUAL[P.quality].res, deviceId: P.cam || undefined }); } catch (err) {}
        toast('Video quality: ' + e.target.selectedOptions[0].text, 'info');
    });
    on('psTone', 'change', async e => {
        if (e.target.value === 'custom' && !(await idbGet('ringtone'))) { $('psFile').click(); return; }
        P.tone = e.target.value; save();
    });
    on('psPick', 'click', () => $('psFile').click());
    on('psFile', 'change', async e => {
        const f = e.target.files[0]; if (!f) return;
        if (f.size > 8 * 1024 * 1024) { toast('File too large (max 8 MB)', 'error'); return; }
        await idbPut('ringtone', f);
        P.tone = 'custom'; $('psTone').value = 'custom'; save();
        toast('Ringtone saved: ' + f.name);
    });
    on('psPreview', 'click', () => { if (R.active) { stopRingtone(); return; } startRingtone(); setTimeout(stopRingtone, 5000); });

    // ---------------- IndexedDB (custom ringtone) ----------------
    function idb() { return new Promise((res, rej) => { const q = indexedDB.open('alpha_pro', 1);
        q.onupgradeneeded = () => q.result.createObjectStore('f'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
    async function idbGet(k) { try { const d = await idb(); return await new Promise(r => { const q = d.transaction('f').objectStore('f').get(k);
        q.onsuccess = () => r(q.result || null); q.onerror = () => r(null); }); } catch (e) { return null; } }
    async function idbPut(k, v) { try { const d = await idb(); return await new Promise(r => { const t = d.transaction('f', 'readwrite');
        t.objectStore('f').put(v, k); t.oncomplete = () => r(true); t.onerror = () => r(false); }); } catch (e) { return false; } }

    // ---------------- ringtones ----------------
    const R = { ctx: null, timer: null, vib: null, audio: null, url: null, active: false, notif: null };
    function actx() {
        if (!R.ctx) R.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (R.ctx.state === 'suspended') R.ctx.resume().catch(() => {});
        return R.ctx;
    }
    function note(c, freqs, t, d, v, type) {
        const g = c.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d); g.connect(c.destination);
        freqs.forEach(f => { const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + d + 0.05); });
    }
    const TONES = {
        classic: { ms: 2200, play: (c, t, v) => [0, .5].forEach(o => note(c, [480, 620], t + o, .4, v * .3)) },
        marimba: { ms: 2400, play: (c, t, v) => [659, 784, 988, 784, 659, 988].forEach((f, i) => note(c, [f], t + i * .16, .3, v * .4, 'triangle')) },
        digital: { ms: 1800, play: (c, t, v) => [0, .2, .4, .8, 1].forEach(o => note(c, [1000], t + o, .1, v * .2, 'square')) },
        soft:    { ms: 3000, play: (c, t, v) => [523, 659, 784, 1046].forEach((f, i) => note(c, [f], t + i * .25, 1.1, v * .35)) },
        back:    { ms: 3000, play: (c, t, v) => note(c, [425], t, 1, v * .12) }
    };
    function loopTone(tone) {
        const run = () => { const c = actx(); tone.play(c, c.currentTime + 0.02, P.ringVol); };
        run(); R.timer = setInterval(run, tone.ms);
    }
    async function startRingtone() {
        stopRingtone(); R.active = true;
        if (P.vibrate && navigator.vibrate) {
            const v = () => { try { navigator.vibrate([500, 250, 500, 250, 500]); } catch (e) {} };
            v(); R.vib = setInterval(v, 3000);
        }
        if (P.tone === 'custom') {
            const blob = await idbGet('ringtone');
            if (blob && R.active) {
                try {
                    R.url = URL.createObjectURL(blob);
                    R.audio = new Audio(R.url); R.audio.loop = true; R.audio.volume = P.ringVol;
                    await R.audio.play();
                    return;
                } catch (e) { /* autoplay blocked or bad file → fall through to built-in */ }
            }
        }
        if (R.active) loopTone(TONES[P.tone] || TONES.classic);
    }
    function startRingback() { stopRingtone(); R.active = true; loopTone(TONES.back); }
    function stopRingtone() {
        R.active = false;
        if (R.timer) { clearInterval(R.timer); R.timer = null; }
        if (R.vib) { clearInterval(R.vib); R.vib = null; try { navigator.vibrate(0); } catch (e) {} }
        if (R.audio) { try { R.audio.pause(); } catch (e) {} R.audio = null; }
        if (R.url) { URL.revokeObjectURL(R.url); R.url = null; }
        if (R.notif) { try { R.notif.close(); } catch (e) {} R.notif = null; }
    }
    startRingtone = startRingtone; // (explicit: replaces the original globals)
    window.startRingtone = startRingtone;

    // unlock audio on first gesture so ringing is allowed later
    const unlock = () => {
        actx();
        if (P.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
        ['pointerdown', 'keydown', 'touchstart'].forEach(e => document.removeEventListener(e, unlock, true));
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(e => document.addEventListener(e, unlock, true));

    // background notification for incoming calls
    const _sic = showIncomingCall;
    showIncomingCall = function (d) {
        _sic(d);
        try {
            if (P.notify && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                const n = new Notification((d.from_name || 'Someone') + ' is calling', {
                    body: (d.is_group ? 'Conference invite' : (d.type === 'video' ? 'Incoming video call' : 'Incoming voice call')),
                    tag: 'alpha-call', renotify: true, requireInteraction: true, vibrate: [500, 250, 500], silent: false
                });
                n.onclick = () => { window.focus(); n.close(); };
                R.notif = n;
            }
        } catch (e) {}
    };

    // ---------------- same-room mode / echo ----------------
    function applyOutput() {
        document.querySelectorAll('audio').forEach(a => {
            if (a === R.audio) return;
            a.muted = sameRoom || window.__proHold || P.vol === 0;
            a.volume = P.vol;
        });
    }
    function setSameRoom(v) {
        sameRoom = v;
        $('ctrlSame').classList.toggle('on', v);
        applyOutput();
        if (lkRoom) {
            if (v && micOn()) toggleMic();
            else if (!v && !micOn()) toggleMic();
        }
        toast(v ? 'Same-room mode: mic & speaker are off on THIS device (use it for video/chat only)'
                : 'Same-room mode off', 'info');
    }
    // detect acoustic feedback: both you and someone else "speaking" for ~4s
    setInterval(() => {
        if (!lkRoom || !callInProgress || sameRoom) { doubleTalk = 0; return; }
        const lp = lkRoom.localParticipant;
        const remote = Array.from(lkRoom.remoteParticipants.values()).some(p => p.isSpeaking);
        if (lp.isSpeaking && remote && lp.audioLevel > 0.05) doubleTalk++; else doubleTalk = Math.max(0, doubleTalk - 1);
        if (doubleTalk >= 8 && !bannerShown) {
            bannerShown = true;
            showBanner('Possible echo: are you in the same room as another participant? Use headphones, or silence this device.',
                       'Same-room mode', () => setSameRoom(true));
        }
    }, 500);

    // ---------------- layout / quality / camera ----------------
    function toggleLayout() { P.spot = !P.spot; save(); paintLayout(); toast(P.spot ? 'Speaker view' : 'Grid view', 'info'); }
    function paintLayout() {
        const w = $('groupTiles'); if (!w) return;
        w.classList.toggle('spotlight', !!(P.spot && isGroupCall));
        w.querySelectorAll('.group-tile').forEach(t => t.classList.remove('spot'));
        if (!P.spot || !isGroupCall) return;
        const pick = [pinnedParticipant, spotUid, remoteIds()[0], CU.id].find(u => u && $(groupTileId(u)));
        $(groupTileId(pick))?.classList.add('spot');
    }
    function paintQuality() {
        if (!lkRoom || !isGroupCall) return;
        allIds().forEach(uid => {
            const t = $(groupTileId(uid)); if (!t) return;
            let q = t.querySelector('.g-q');
            if (!q) { q = document.createElement('span'); q.className = 'g-q'; q.innerHTML = '<i class="fa-solid fa-signal"></i>'; t.appendChild(q); }
            const c = getP(uid)?.connectionQuality || 'unknown';
            q.dataset.q = c; q.title = 'Connection: ' + c;
        });
    }
    async function flipCamera() {
        if (!lkRoom) return;
        const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
        if (cams.length < 2) { toast('Only one camera found', 'info'); return; }
        const cur = lkRoom.getActiveDevice?.('videoinput');
        const i = cams.findIndex(c => c.deviceId === cur);
        const next = cams[(i + 1) % cams.length];
        P.cam = next.deviceId; save();
        await switchDev('videoinput', next.deviceId);
    }

    const _rgt = renderGroupTiles;
    renderGroupTiles = function () { _rgt(); paintQuality(); paintLayout(); applyOutput(); };
    const _uts = updateTileStates;
    updateTileStates = function () { _uts(); paintLayout(); };
    const _hts = handleTrackSubscribed;
    handleTrackSubscribed = function (a, b, c) { _hts(a, b, c); setTimeout(applyOutput, 0); };
    const _rcs = resetCallState;
    resetCallState = function () {
        _rcs();
        sameRoom = false; bannerShown = false; doubleTalk = 0; spotUid = null;
        $('ctrlSame')?.classList.remove('on'); banner.style.display = 'none';
        document.querySelectorAll('audio').forEach(a => { a.muted = false; });
    };

    // ---------------- upgraded LiveKit join ----------------
    function extend(r, LK) {
        const E = LK.RoomEvent, live = () => lkRoom === r;
        r.on(E.AudioPlaybackStatusChanged, () => {
            if (live() && !r.canPlaybackAudio)
                showBanner('Your browser blocked call audio.', 'Enable audio', () => r.startAudio().catch(() => {}));
        });
        r.on(E.ConnectionQualityChanged, (q, p) => {
            if (!live()) return;
            paintQuality();
            if (p.isLocal && (q === 'poor' || q === 'lost')) toast('Your connection is weak', 'info');
        });
        r.on(E.ActiveSpeakersChanged, sp => {
            if (!live() || !sp || !sp.length) return;
            const top = sp.find(s => !s.isLocal);
            if (top) { spotUid = top.identity; if (P.spot) paintLayout(); }
        });
        r.on(E.MediaDevicesError, () => toast('Mic/camera error — check permissions', 'error'));
        r.on(E.ParticipantConnected, () => setTimeout(applyOutput, 300));
    }

    joinLiveKitRoom = async function (room, type) {
        const LK = window.LivekitClient;
        if (!LK) throw new Error('LiveKit library not loaded');
        const token = await getLiveKitToken(room, CU.id);
        const q = QUAL[P.quality] || QUAL.hd;
        const r = new LK.Room({
            adaptiveStream: true, dynacast: true, stopLocalTrackOnUnpublish: true,
            audioCaptureDefaults: audioC(),
            videoCaptureDefaults: { resolution: q.res, deviceId: P.cam || undefined },
            audioOutput: P.spk ? { deviceId: P.spk } : undefined,
            publishDefaults: { dtx: true, red: true, simulcast: true, videoEncoding: q.enc,
                               screenShareEncoding: { maxBitrate: 2500000, maxFramerate: 15 } }
        });
        lkRoom = r;
        bindRoomEvents(r, LK);
        extend(r, LK);

        await r.connect(LIVEKIT_URL, token);
        try { await r.startAudio(); } catch (e) {}
        if (lkRoom !== r) return;

        if (isGroupCall && remoteIds().length === 0 && !hostUid) { isHost = true; hostUid = CU.id; }

        const partner = chatPartner ? allUsers[chatPartner] : null;
        showCallUI('active',
            isGroupCall ? 'Conference' : (partner?.display_name || nameOf(chatPartner)),
            isGroupCall ? avatarSrc({ display_name: 'Group' }) : avatarSrc(partner), type);

        if (isGroupCall) renderGroupTiles();
        await enableLocalMedia(type);
        absorbExistingParticipants();
        if (isGroupCall || callDirection === 'in') startTimer();

        if (callDirection === 'in' && !isGroupCall) {
            aloneTimer = setTimeout(() => {
                if (callInProgress && remoteIds().length === 0) { toast('The caller already left', 'info'); endCall(true); }
            }, 10000);
        }
        // big meetings: join muted so nobody blasts the room
        if (isGroupCall && remoteIds().length >= 5 && micOn()) { toggleMic(); toast('Joined muted (large meeting)', 'info'); }
        applyOutput();
        updateParticipantCount();
        updateParticipantsPanel();
    };

    enableLocalMedia = async function (type) {
        const lp = lkRoom.localParticipant;
        try { await lp.setMicrophoneEnabled(true, audioC()); setMicUI(true); }
        catch (e) { setMicUI(false); toast('Microphone unavailable — check browser permission', 'error'); }

        if (type === 'video') {
            try {
                const pub = await lp.setCameraEnabled(true, { resolution: QUAL[P.quality].res, deviceId: P.cam || undefined });
                localCamTrack = pub?.track || null;
                setCamUI(true);
                if (localCamTrack) localCamTrack.attach($('localVideo'));
            } catch (e) { setCamUI(false); toast('Camera unavailable — joined with audio only', 'error'); }
        } else setCamUI(false);
        afterLocalCamChange();
    };

    // wire the originals that were already captured by the page
    window.startRingback = startRingback;
    window.stopRingtone = stopRingtone;
    window.__pro = { applyOutput, paintQuality, paintLayout, setSameRoom, P };
})();


/* ============================================================
   Alphagram — calls-pro2.js   (load AFTER calls-pro.js)
   <script src="calls-pro.js"></script>
   <script src="calls-pro2.js"></script>
   Large meetings (paged grid, 200 client cap), waiting room, lock,
   webinar mode (allow-to-speak), recording, live captions + transcript,
   background blur / image, host tools, invite throttling.
   ============================================================ */
(function () {
    const PRO_MAX = 200;
    const esc = escapeHTML;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const PRO = window.__pro;

    let RS = { lobby: false, locked: false, webinar: false, chatOff: false };
    let waiting = new Map(), allowed = new Set();
    let holdMedia = false, pendingType = 'video', inLobby = false, stateKnown = false, lobbyPath = false;
    let page = 0, speakOrder = [], renderedKey = '', rt = null, dirty = false;
    const audioEls = new Map();
    let rec = null, recTimer = null, recSecs = 0, recBy = new Set();
    let ccOn = false, recog = null, ccLang = localStorage.getItem('alpha_cc_lang') || 'en-US', transcript = [];
    let bgKind = localStorage.getItem('alpha_bg') || 'none', bgImg = null, fxMod = null;

    // ---------------- styles ----------------
    const st = document.createElement('style');
    st.textContent = `
    .group-tiles.count-many{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
    #proPager{position:absolute;left:50%;bottom:calc(150px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:41;display:none;align-items:center;gap:6px;
      background:rgba(18,24,34,.85);border:1px solid var(--stage-line);border-radius:20px;padding:4px 6px;backdrop-filter:blur(14px);color:#fff;font-size:12px;font-weight:700}
    #proPager button{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.08);color:#fff}
    #proLobby{position:absolute;inset:0;z-index:60;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;background:rgba(8,10,14,.92);color:#fff;padding:20px}
    #proLobby button{padding:10px 22px;border-radius:12px;background:var(--red);color:#fff;font-weight:700}
    #proAdmit{position:absolute;top:calc(64px + env(safe-area-inset-top));right:14px;z-index:47;display:none;width:min(300px,90vw);max-height:50vh;overflow:auto;background:rgba(15,19,27,.96);
      border:1px solid rgba(250,204,21,.35);border-radius:14px;padding:10px;color:#fff;font-size:13px;backdrop-filter:blur(16px)}
    #proAdmit .h{font-weight:800;color:var(--host-gold);margin-bottom:6px}
    #proAdmit .r{display:flex;align-items:center;gap:6px;padding:4px 0}#proAdmit .r span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #proAdmit button{padding:5px 10px;border-radius:8px;background:var(--green);color:#fff;font-size:11px;font-weight:700}#proAdmit button.d{background:rgba(255,255,255,.12)}
    #proCaps{position:absolute;left:50%;bottom:calc(150px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:41;width:min(640px,92vw);display:flex;flex-direction:column;gap:4px;pointer-events:none;align-items:center}
    #proCaps div{background:rgba(0,0,0,.72);color:#fff;padding:5px 12px;border-radius:10px;font-size:14px;line-height:1.35;max-width:100%}
    #proCaps b{color:#facc15;margin-right:6px;font-size:12px}
    #proRec{display:none;align-items:center;gap:6px;color:#fff}#proRec.show{display:inline-flex}
    #proRec::before{content:"";width:8px;height:8px;border-radius:50%;background:#ef4444;animation:pulse-dot 1s infinite}
    #proMore .modal{max-width:460px}
    .pro-hand{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px}.pro-hand span{flex:1}
    #proPeopleSearch{width:100%;padding:8px 12px;border-radius:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08);color:#fff;font-size:12px;outline:0;margin-bottom:6px}
    #proSelAll{display:none;margin-bottom:8px;padding:7px 12px;border-radius:10px;background:var(--primary-bg);color:var(--primary);font-weight:700;font-size:12px}`;
    document.head.appendChild(st);

    // ---------------- DOM ----------------
    const root = $('stageRoot');
    const mk = (tag, id, html, parent) => { const e = document.createElement(tag); e.id = id; if (html) e.innerHTML = html; (parent || root).appendChild(e); return e; };
    const audioBox = mk('div', 'proAudioBox', '', document.body); audioBox.style.display = 'none';
    mk('div', 'proPager', '<button id="pgPrev"><i class="fa-solid fa-chevron-left"></i></button><span id="pgLbl"></span><button id="pgNext"><i class="fa-solid fa-chevron-right"></i></button>');
    mk('div', 'proLobby', '<i class="fa-solid fa-hourglass-half" style="font-size:34px"></i><h2>Waiting for the host to let you in…</h2><p style="color:var(--stage-muted)">Your mic and camera are off until you are admitted.</p><button onclick="endCall()">Leave</button>');
    mk('div', 'proAdmit');
    mk('div', 'proCaps');
    const recPill = document.createElement('span');
    recPill.className = 'stage-pill'; recPill.innerHTML = '<span id="proRec"><span id="proRecT">REC</span></span>';
    document.querySelector('.stage-topbar-left').appendChild(recPill);
    $('participantsList').insertAdjacentHTML('beforebegin', '<input id="proPeopleSearch" placeholder="Search participants…">');
    $('contactsScroll').insertAdjacentHTML('beforebegin', '<button id="proSelAll">Select everyone</button>');

    function ctrl(id, icon, label, fn) {
        const w = document.createElement('div'); w.className = 'ctrl-wrap';
        w.innerHTML = `<button class="ctrl-btn" id="${id}"><i class="fa-solid ${icon}"></i></button><span>${label}</span>`;
        w.firstChild.onclick = fn; return w;
    }
    const after = $('ctrlSet').parentElement;
    after.after(ctrl('ctrlMore', 'fa-ellipsis', 'More', openMore));
    after.after(ctrl('ctrlCC', 'fa-closed-captioning', 'Captions', () => setCC(!ccOn)));

    const more = mk('div', 'proMore', `<div class="modal">
      <button class="modal-close" onclick="document.getElementById('proMore').classList.remove('show')"><i class="fa-solid fa-xmark"></i></button>
      <div class="modal-title">Meeting tools</div><div class="modal-sub">Recording, captions, effects and host controls</div>
      <div class="pro-h">Recording &amp; captions</div>
      <div class="pro-btns"><button id="mbRec">● Record</button><button id="mbCC">Captions</button><button id="mbTr">Download transcript</button></div>
      <div class="pro-row" style="margin-top:10px"><label>Caption language (your speech)</label><select id="mbLang">
        <option value="en-US">English</option><option value="fr-FR">Français</option><option value="sw-KE">Kiswahili</option>
        <option value="es-ES">Español</option><option value="pt-BR">Português</option><option value="ar-SA">العربية</option>
        <option value="zh-CN">中文</option><option value="hi-IN">हिन्दी</option><option value="de-DE">Deutsch</option></select></div>
      <div class="pro-h">Background</div>
      <div class="pro-btns"><button data-bg="none">None</button><button data-bg="blur-l">Blur</button><button data-bg="blur-h">Strong blur</button><button id="mbImg">Image…</button></div>
      <input type="file" id="mbImgF" accept="image/*" style="display:none">
      <div id="mbHost" style="display:none">
        <div class="pro-h">Host controls</div>
        <label class="pro-tog">Waiting room for people joining by ID <input type="checkbox" id="mbLobby"></label>
        <label class="pro-tog">Lock meeting (no new joiners by ID) <input type="checkbox" id="mbLock"></label>
        <label class="pro-tog">Webinar mode (attendees muted until allowed) <input type="checkbox" id="mbWeb"></label>
        <label class="pro-tog">Disable attendee chat <input type="checkbox" id="mbChat"></label>
        <div class="pro-btns" style="margin:8px 0"><button id="mbMuteAll">Mute everyone</button><button id="mbLower">Lower all hands</button></div>
        <div class="pro-h">Raised hands</div><div id="mbHands" class="pro-tip">None</div>
      </div></div>`);
    more.className = 'modal-overlay';
    more.addEventListener('click', e => { if (e.target === more) more.classList.remove('show'); });

    // ---------------- limits, invites, toasts ----------------
    window.toggleContactSelect = function (cb) {
        if (cb.checked) {
            const cur = contactsMode === 'add' ? remoteIds().length + 1 : 1;
            if (cur + contactsSelected.size >= PRO_MAX) { cb.checked = false; toast(`Max ${PRO_MAX} people per meeting`, 'info'); return; }
            contactsSelected.add(cb.value);
        } else contactsSelected.delete(cb.value);
    };
    const _ocm = window.openContactsModal;
    window.openContactsModal = function (m) {
        _ocm(m);
        const multi = m === 'group' || m === 'add';
        $('proSelAll').style.display = multi ? 'block' : 'none';
        if (m === 'group') $('contactsSub').textContent = `Invite up to ${PRO_MAX - 1} people, or start alone and share the meeting ID`;
    };
    $('proSelAll').onclick = () => {
        $('contactsScroll').querySelectorAll('input[type=checkbox]').forEach(cb => {
            if (!cb.checked) { cb.checked = true; toggleContactSelect(cb); }
        });
    };
    let active = 0; const queue = [];
    const pump = () => { while (active < 6 && queue.length) { active++; queue.shift()(); } };
    const _si = sendInvite;
    sendInvite = function (uid, g) {
        return new Promise(res => { queue.push(() => _si(uid, g).finally(() => { active--; res(); pump(); })); pump(); });
    };
    addMembersToCall = async function (selected) {
        if (!callInProgress) { toast('No active meeting', 'info'); return; }
        const toInvite = selected.filter(u => !isSelf(u) && !remoteIds().includes(u));
        if (!toInvite.length) return;
        if (remoteIds().length + 1 + toInvite.length > PRO_MAX) { toast(`Max ${PRO_MAX} people per meeting`, 'info'); return; }
        if (!isGroupCall) switchToGroupLayout();
        await Promise.all(toInvite.map(u => sendInvite(u, true)));
        toast(`Invited ${toInvite.length} ${toInvite.length === 1 ? 'person' : 'people'}`);
    };
    const _toast = toast;
    toast = function (m, t) { if (/ (joined|left)$/.test(m) && remoteIds().length > 8) return; _toast(m, t); };
    const _fr = floatReaction;
    floatReaction = function (e) { if (document.querySelectorAll('.reaction-float').length < 12) _fr(e); };

    // ---------------- scalable participants / tiles ----------------
    getP = function (uid) {
        if (!lkRoom) return null;
        return isSelf(uid) ? lkRoom.localParticipant : (lkRoom.remoteParticipants.get(uid) || null);
    };
    remoteIds = function () {
        if (!lkRoom) return [];
        return Array.from(lkRoom.remoteParticipants.keys()).filter(i => !isSelf(i) && !waiting.has(i));
    };
    const PAGE = () => innerWidth < 760 ? 6 : innerWidth < 1200 ? 12 : 16;

    function visibleIds() {
        const others = remoteIds();
        const sc = u => (u === pinnedParticipant ? -2000 : (speakOrder.indexOf(u) >= 0 ? speakOrder.indexOf(u) : 1000)) - (raisedHands.has(u) ? 500 : 0);
        const size = PAGE();
        const head = others.filter(u => sc(u) < 1000).sort((a, b) => sc(a) - sc(b)).slice(0, size - 1);
        const tail = others.filter(u => !head.includes(u)).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
        const ordered = [CU.id, ...head, ...tail];
        const pages = Math.max(1, Math.ceil(ordered.length / size));
        page = Math.min(page, pages - 1);
        return { ids: ordered.slice(page * size, page * size + size), pages, total: ordered.length };
    }
    function makeTile(uid) {
        const isMe = isSelf(uid), user = allUsers[uid];
        const first = isMe ? 'You' : ((user?.display_name || uid).split(' ')[0] || uid);
        const d = document.createElement('div');
        d.className = 'group-tile' + (isMe ? ' me' : '');
        d.id = groupTileId(uid); d.dataset.uid = uid;
        d.innerHTML = `<video id="${groupVideoId(uid)}" autoplay playsinline ${isMe ? 'muted' : ''}></video>
            <div class="g-avatar"><img src="${esc(avatarSrc(user || { display_name: isMe ? UP.display_name : uid }))}"></div>
            <span class="g-name"><span class="hand-icon">✋</span>${esc(first)}${uid === hostUid ? ' 👑' : ''}</span>
            <span class="g-mic-off"><i class="fa-solid fa-microphone-slash"></i></span>`;
        return d;
    }
    function doRender() {
        const wrap = $('groupTiles');
        if (!wrap || !lkRoom || !isGroupCall) return;
        const v = visibleIds();
        $('proPager').style.display = v.pages > 1 ? 'flex' : 'none';
        $('pgLbl').textContent = `${page + 1}/${v.pages} · ${v.total} people`;
        const have = new Map(Array.from(wrap.children).map(c => [c.dataset.uid, c]));
        const key = v.ids.join('|') + '#' + hostUid;
        if (key === renderedKey && v.ids.every(u => have.has(u))) { updateTileStates(); return; }
        renderedKey = key;
        have.forEach((el, uid) => {
            if (v.ids.includes(uid)) return;
            try { (isSelf(uid) ? localCamTrack : groupVideoTracks[uid])?.detach($(groupVideoId(uid))); } catch (e) {}
            el.remove();
        });
        v.ids.forEach(uid => {
            let el = have.get(uid);
            if (!el) {
                el = makeTile(uid);
                wrap.appendChild(el);
                const vid = $(groupVideoId(uid));
                if (isSelf(uid)) { if (localCamTrack && camOn()) localCamTrack.attach(vid); }
                else if (groupVideoTracks[uid]) groupVideoTracks[uid].attach(vid);
            } else wrap.appendChild(el);
        });
        const n = v.ids.length, spot = wrap.classList.contains('spotlight');
        wrap.className = 'group-tiles ' + (n <= 6 ? 'count-' + n : 'count-many') + (spot ? ' spotlight' : '');
        updateTileStates(); PRO.paintQuality(); PRO.paintLayout(); PRO.applyOutput();
        updateParticipantsPanel();
    }
    renderGroupTiles = function () {
        if (rt) { dirty = true; return; }
        doRender();
        rt = setTimeout(() => { rt = null; if (dirty) { dirty = false; doRender(); } }, 250);
    };
    $('pgPrev').onclick = () => { page = Math.max(0, page - 1); renderedKey = ''; doRender(); };
    $('pgNext').onclick = () => { page++; renderedKey = ''; doRender(); };

    handleTrackSubscribed = function (track, pub, participant) {
        const LK = window.LivekitClient, id = participant.identity, src = pub?.source;
        if (src === LK.Track.Source.ScreenShare) { if (track.kind === 'video') showScreenShare(id, track); return; }
        if (src === LK.Track.Source.ScreenShareAudio) {
            const el = track.attach(); el.style.display = 'none'; document.body.appendChild(el); extraAudioEls.push(el); PRO.applyOutput(); return;
        }
        if (track.kind === 'video') {
            groupVideoTracks[id] = track;
            if (isGroupCall) { const el = $(groupVideoId(id)); if (el) track.attach(el); } else track.attach($('remoteVideo'));
        } else if (track.kind === 'audio') {
            groupAudioTracks[id] = track;
            if (isGroupCall) {
                audioEls.get(id)?.remove();
                const el = track.attach(); el.style.display = 'none'; audioBox.appendChild(el); audioEls.set(id, el);
            } else track.attach($('remoteAudio'));
            PRO.applyOutput();
        }
        updateRemoteStates(); updateParticipantsPanel();
    };

    // throttled participants panel + search
    const _upp = updateParticipantsPanel; let upT = null;
    function applyFilter() {
        const q = $('proPeopleSearch').value.toLowerCase().trim();
        document.querySelectorAll('#participantsList .participant-row').forEach(r => { r.style.display = !q || r.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    }
    updateParticipantsPanel = function () {
        if (upT) return;
        upT = setTimeout(() => { upT = null; _upp(); applyFilter(); }, 200);
    };
    $('proPeopleSearch').addEventListener('input', applyFilter);

    // ---------------- room events ----------------
    const _bre = bindRoomEvents;
    bindRoomEvents = function (r, LK) {
        _bre(r, LK);
        const E = LK.RoomEvent, live = () => lkRoom === r;
        r.on(E.ParticipantConnected, p => { if (live() && isHost) broadcastRoomState(p.identity); });
        r.on(E.ParticipantDisconnected, p => {
            if (!live()) return;
            waiting.delete(p.identity); allowed.delete(p.identity);
            speakOrder = speakOrder.filter(u => u !== p.identity);
            audioEls.get(p.identity)?.remove(); audioEls.delete(p.identity);
            renderAdmit();
        });
        r.on(E.TrackUnsubscribed, (t, pub, p) => {
            if (live() && p && t.kind === 'audio' && pub?.source === LK.Track.Source.Microphone) { audioEls.get(p.identity)?.remove(); audioEls.delete(p.identity); }
        });
        r.on(E.ActiveSpeakersChanged, sp => {
            if (!live()) return;
            let changed = false;
            (sp || []).filter(s => !s.isLocal).forEach(s => {
                if (speakOrder[0] !== s.identity) { speakOrder = [s.identity, ...speakOrder.filter(u => u !== s.identity)].slice(0, 30); changed = true; }
            });
            if (changed && page === 0 && isGroupCall && !visibleIds().ids.includes(speakOrder[0])) renderGroupTiles();
        });
    };

    // ---------------- room state / waiting room / webinar ----------------
    function broadcastRoomState(to) {
        sendData({ type: 'room_state', ...RS, waiting: Array.from(waiting, ([uid, name]) => ({ uid, name })) }, to);
    }
    function renderAdmit() {
        const box = $('proAdmit');
        if (!isHost || !waiting.size) { box.style.display = 'none'; return; }
        box.style.display = 'block';
        box.innerHTML = `<div class="h">Waiting room (${waiting.size})</div>` +
            Array.from(waiting, ([u, n]) => `<div class="r"><span>${esc(n)}</span><button data-a="admit" data-u="${esc(u)}">Admit</button><button class="d" data-a="deny" data-u="${esc(u)}">✕</button></div>`).join('') +
            (waiting.size > 1 ? '<div class="r"><button data-a="all">Admit all</button></div>' : '');
    }
    $('proAdmit').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        const a = b.dataset.a, u = b.dataset.u;
        if (a === 'all') Array.from(waiting.keys()).forEach(admit);
        else if (a === 'admit') admit(u);
        else if (a === 'deny') { waiting.delete(u); sendData({ type: 'deny', target: u }, u); broadcastRoomState(); renderGroupTiles(); renderAdmit(); }
    });
    function admit(uid) {
        waiting.delete(uid);
        sendData({ type: 'admit', target: uid });
        broadcastRoomState(); renderGroupTiles(); renderAdmit();
    }
    async function releaseHold() {
        holdMedia = false; window.__proHold = false; inLobby = false;
        $('proLobby').style.display = 'none';
        PRO.applyOutput();
        await enableLocalMedia(pendingType);
        afterLocalCamChange();
        if (RS.webinar && !isHost && !allowed.has(CU.id) && micOn()) toggleMic();
        renderGroupTiles(); updateParticipantCount();
    }
    const _jm = joinMeetingById;
    joinMeetingById = async function (id) { lobbyPath = true; try { return await _jm(id); } finally { lobbyPath = false; } };
    const _jl = joinLiveKitRoom;
    joinLiveKitRoom = async function (room, type) {
        if (!lobbyPath) return _jl(room, type);
        lobbyPath = false; holdMedia = true; pendingType = type; window.__proHold = true; stateKnown = false;
        await _jl(room, type);
        for (let i = 0; i < 30 && !stateKnown && lkRoom && lkRoom.remoteParticipants.size > 0; i++) await sleep(100);
        if (!lkRoom) return;
        if (isHost || !stateKnown) { await releaseHold(); return; }
        if (RS.locked) { toast('This meeting is locked', 'info'); endCall(true); return; }
        if (RS.lobby) {
            inLobby = true; $('proLobby').style.display = 'flex';
            sendData({ type: 'knock', name: UP.display_name || nameOf(CU.id) }, hostUid);
            return;
        }
        await releaseHold();
    };
    const _elm = enableLocalMedia;
    enableLocalMedia = async function (t) {
        if (holdMedia) { setMicUI(false); setCamUI(false); return; }
        await _elm(t); reapplyBg();
    };

    const _hdm = handleDataMessage;
    handleDataMessage = function (msg, from) {
        if (waiting.has(from) && msg.type !== 'knock') return;
        switch (msg.type) {
            case 'room_state':
                if (isHost) return;
                RS = { lobby: !!msg.lobby, locked: !!msg.locked, webinar: !!msg.webinar, chatOff: !!msg.chatOff };
                waiting = new Map((msg.waiting || []).filter(w => !isSelf(w.uid)).map(w => [w.uid, w.name]));
                stateKnown = true;
                if (RS.webinar && !allowed.has(CU.id) && !holdMedia && micOn()) toggleMic();
                renderGroupTiles(); updateParticipantCount();
                return;
            case 'knock':
                if (!isHost) return;
                waiting.set(from, msg.name || nameOf(from));
                toast(`${msg.name || nameOf(from)} is waiting to join`, 'info');
                broadcastRoomState(); renderAdmit(); renderGroupTiles();
                return;
            case 'admit':
                waiting.delete(msg.target); renderAdmit(); renderGroupTiles();
                if (isSelf(msg.target) && inLobby) releaseHold();
                return;
            case 'deny':
                if (isSelf(msg.target)) { toast('The host did not admit you', 'error'); endCall(true); }
                return;
            case 'allow_speak':
                if (isSelf(msg.target)) {
                    if (msg.on) { allowed.add(CU.id); toast('The host allowed you to speak — unmute now', 'success'); }
                    else { allowed.delete(CU.id); if (micOn()) toggleMic(); }
                }
                return;
            case 'lower_hands':
                if (raisedHands.has(CU.id)) toggleRaiseHand();
                return;
            case 'rec':
                msg.on ? recBy.add(msg.name || nameOf(from)) : recBy.delete(msg.name || nameOf(from));
                paintRec(); if (msg.on) toast(`${msg.name || nameOf(from)} started recording`, 'info');
                return;
            case 'caption': showCaption(msg); return;
        }
        _hdm(msg, from);
    };
    const _tm = window.toggleMic;
    window.toggleMic = function () {
        if (RS.webinar && !isHost && !allowed.has(CU.id) && !micOn()) { toast('Webinar mode: raise your hand and wait for the host to allow you to speak', 'info'); return; }
        return _tm();
    };
    const _scm = window.sendChatMessage;
    window.sendChatMessage = function (s) {
        if (RS.chatOff && !isHost) { toast('The host disabled chat', 'info'); return; }
        return _scm(s);
    };
    const _rhu = refreshHostUI;
    refreshHostUI = function (r) { _rhu(r); if (!isHost) $('proAdmit').style.display = 'none'; else renderAdmit(); };

    // ---------------- captions ----------------
    function setCC(on) {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (on && !SR) { toast('Live captions are not supported in this browser (use Chrome, Edge or Safari)', 'error'); return; }
        ccOn = on; paintCC();
        if (!on) { try { recog?.stop(); } catch (e) {} recog = null; $('proCaps').innerHTML = ''; return; }
        recog = new SR(); recog.continuous = true; recog.interimResults = true; recog.lang = ccLang;
        let last = 0;
        recog.onresult = e => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const r = e.results[i], text = r[0].transcript.trim();
                if (!text || !micOn()) continue;
                if (!r.isFinal && Date.now() - last < 450) continue;
                last = Date.now();
                const m = { type: 'caption', name: UP.display_name || 'You', text, final: r.isFinal };
                showCaption(m); sendData(m);
            }
        };
        recog.onend = () => { if (ccOn && callInProgress) setTimeout(() => { try { recog.start(); } catch (e) {} }, 250); };
        recog.onerror = ev => { if (ev.error === 'not-allowed') { toast('Captions need microphone permission', 'error'); setCC(false); } };
        try { recog.start(); } catch (e) {}
        toast('Captions on — they show people who also have captions on', 'info');
    }
    function paintCC() { $('ctrlCC').classList.toggle('on', ccOn); $('mbCC').textContent = ccOn ? 'Captions: ON' : 'Captions'; }
    const capEls = new Map();
    function showCaption(m) {
        if (!ccOn) return;
        const box = $('proCaps'); let el = capEls.get(m.name);
        if (!el) { el = document.createElement('div'); capEls.set(m.name, el); box.appendChild(el); }
        el.innerHTML = `<b>${esc(m.name)}</b>${esc(m.text)}`;
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.remove(); capEls.delete(m.name); }, m.final ? 4000 : 2500);
        if (m.final) transcript.push(`[${new Date().toLocaleTimeString()}] ${m.name}: ${m.text}`);
        while (box.children.length > 3) box.firstChild.remove();
    }
    function download(blob, name) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    // ---------------- recording (this tab + everyone's audio + your mic) ----------------
    function paintRec() {
        const on = !!rec || recBy.size > 0;
        $('proRec').classList.toggle('show', on);
        $('proRecT').textContent = rec ? 'REC ' + fmt(recSecs) : (recBy.size ? 'Being recorded' : 'REC');
        $('mbRec').textContent = rec ? '■ Stop recording' : '● Record';
    }
    const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    async function toggleRec() {
        if (rec) { rec.stop(); return; }
        if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') { toast('Recording is not supported on this device', 'error'); return; }
        let disp;
        try { disp = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true, preferCurrentTab: true, selfBrowserSurface: 'include', systemAudio: 'include' }); }
        catch (e) { return; }
        const ac = new (window.AudioContext || window.webkitAudioContext)(), dest = ac.createMediaStreamDestination();
        if (disp.getAudioTracks().length) ac.createMediaStreamSource(new MediaStream(disp.getAudioTracks())).connect(dest);
        const mic = lkRoom?.localParticipant.getTrackPublication(window.LivekitClient.Track.Source.Microphone)?.track?.mediaStreamTrack;
        if (mic) ac.createMediaStreamSource(new MediaStream([mic])).connect(dest);
        const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || '';
        const chunks = [], mr = new MediaRecorder(new MediaStream([...disp.getVideoTracks(), ...dest.stream.getAudioTracks()]), mime ? { mimeType: mime, videoBitsPerSecond: 2500000 } : undefined);
        mr.ondataavailable = e => e.data.size && chunks.push(e.data);
        mr.onstop = () => {
            disp.getTracks().forEach(t => t.stop()); ac.close().catch(() => {});
            clearInterval(recTimer); rec = null;
            download(new Blob(chunks, { type: mime || 'video/webm' }), `alphagram-meeting-${Date.now()}.${mime.includes('mp4') ? 'mp4' : 'webm'}`);
            sendData({ type: 'rec', on: false, name: UP.display_name }); paintRec(); toast('Recording saved to your downloads');
        };
        disp.getVideoTracks()[0].addEventListener('ended', () => { if (rec) rec.stop(); });
        mr.start(1000); rec = mr; recSecs = 0;
        recTimer = setInterval(() => { recSecs++; paintRec(); }, 1000);
        sendData({ type: 'rec', on: true, name: UP.display_name }); paintRec();
        toast('Recording — everyone has been notified', 'info');
    }

    // ---------------- background effects (blur / image) ----------------
    async function applyBg(kind) {
        const t = localCamTrack;
        if (!t) { toast('Turn your camera on first', 'info'); return; }
        try {
            if (kind === 'none') { await t.stopProcessor(); }
            else {
                fxMod = fxMod || await import('https://cdn.jsdelivr.net/npm/@livekit/track-processors@0.5/+esm');
                if (fxMod.supportsBackgroundProcessors && !fxMod.supportsBackgroundProcessors()) throw new Error('unsupported');
                const proc = kind === 'blur-l' ? fxMod.BackgroundBlur(6) : kind === 'blur-h' ? fxMod.BackgroundBlur(18) : fxMod.VirtualBackground(bgImg);
                await t.setProcessor(proc);
            }
            bgKind = kind; if (kind !== 'image') localStorage.setItem('alpha_bg', kind);
        } catch (e) { toast('Background effects are not supported on this device', 'error'); }
    }
    function reapplyBg() { if (bgKind === 'blur-l' || bgKind === 'blur-h') setTimeout(() => applyBg(bgKind), 400); }
    const _tc = window.toggleCam;
    window.toggleCam = async function () { await _tc(); if (camOn()) reapplyBg(); };

    // ---------------- More / host tools modal ----------------
    function renderHands() {
        const el = $('mbHands'), hands = Array.from(raisedHands).filter(u => !isSelf(u));
        el.innerHTML = hands.length ? hands.map(u => `<div class="pro-hand"><span>✋ ${esc(nameOf(u))}</span>
            <button data-sp="${esc(u)}" data-on="${allowed.has(u) ? 0 : 1}" class="pro-btn">${allowed.has(u) ? 'Revoke' : 'Allow to speak'}</button></div>`).join('') : 'None';
        el.querySelectorAll('button').forEach(b => { b.style.cssText = 'padding:5px 10px;border-radius:8px;background:var(--surface-hover);border:1px solid var(--border);font-size:11px;font-weight:700'; });
    }
    function openMore() {
        $('mbHost').style.display = isHost ? 'block' : 'none';
        $('mbLobby').checked = RS.lobby; $('mbLock').checked = RS.locked; $('mbWeb').checked = RS.webinar; $('mbChat').checked = RS.chatOff;
        $('mbLang').value = ccLang; paintRec(); paintCC(); renderHands();
        more.classList.add('show');
    }
    const hostSet = (k, v) => { if (!isHost) return; RS[k] = v; broadcastRoomState(); if (k === 'webinar' && v) { hostAction('mute_all'); allowed.clear(); } };
    $('mbLobby').onchange = e => hostSet('lobby', e.target.checked);
    $('mbLock').onchange = e => hostSet('locked', e.target.checked);
    $('mbWeb').onchange = e => hostSet('webinar', e.target.checked);
    $('mbChat').onchange = e => hostSet('chatOff', e.target.checked);
    $('mbMuteAll').onclick = () => hostAction('mute_all');
    $('mbLower').onclick = () => { sendData({ type: 'lower_hands' }); raisedHands.clear(); updateTileStates(); renderHands(); };
    $('mbHands').addEventListener('click', e => {
        const b = e.target.closest('[data-sp]'); if (!b) return;
        const u = b.dataset.sp, on = b.dataset.on === '1';
        on ? allowed.add(u) : allowed.delete(u);
        sendData({ type: 'allow_speak', target: u, on }, u); renderHands();
    });
    $('mbRec').onclick = toggleRec;
    $('mbCC').onclick = () => setCC(!ccOn);
    $('mbLang').onchange = e => { ccLang = e.target.value; localStorage.setItem('alpha_cc_lang', ccLang); if (ccOn) { setCC(false); setCC(true); } };
    $('mbTr').onclick = () => transcript.length ? download(new Blob([transcript.join('\n')], { type: 'text/plain' }), 'alphagram-transcript.txt') : toast('No transcript yet — turn captions on', 'info');
    more.querySelectorAll('[data-bg]').forEach(b => b.onclick = () => applyBg(b.dataset.bg));
    $('mbImg').onclick = () => $('mbImgF').click();
    $('mbImgF').onchange = e => { const f = e.target.files[0]; if (f) { bgImg = URL.createObjectURL(f); bgKind = 'image'; applyBg('image'); } };

    // ---------------- keyboard + cleanup ----------------
    document.addEventListener('keydown', e => {
        if (!callInProgress || callState !== 'active' || /input|textarea|select/i.test(e.target.tagName || '')) return;
        if (e.key === 'ArrowRight') $('pgNext').click();
        else if (e.key === 'ArrowLeft') $('pgPrev').click();
        else if (e.key === 'c' || e.key === 'C') setCC(!ccOn);
    });
    window.addEventListener('resize', () => { renderedKey = ''; if (isGroupCall && callInProgress) renderGroupTiles(); });

    const _rcs = resetCallState;
    resetCallState = function () {
        if (rec) { try { rec.stop(); } catch (e) {} }
        setCC(false);
        RS = { lobby: false, locked: false, webinar: false, chatOff: false };
        waiting.clear(); allowed.clear(); recBy.clear(); transcript = []; speakOrder = [];
        audioEls.forEach(el => el.remove()); audioEls.clear();
        holdMedia = false; window.__proHold = false; inLobby = false; stateKnown = false; page = 0; renderedKey = '';
        $('proLobby').style.display = 'none'; $('proAdmit').style.display = 'none'; $('proPager').style.display = 'none';
        more.classList.remove('show'); paintRec();
        _rcs();
    };
})();


/* ============================================================
   DISPLAY POLISH — hide-UI / wide screen, tidy dock, messages
   ============================================================ */
(function () {
    const UK = 'alpha_ui_prefs';
    let U = { auto: false, float: true, fit: false };
    try { Object.assign(U, JSON.parse(localStorage.getItem(UK) || '{}')); } catch (e) {}
    const saveU = () => { try { localStorage.setItem(UK, JSON.stringify(U)); } catch (e) {} };
    let manual = false, autoH = false, idle = null, revealedAt = 0;
    const root = $('stageRoot');

    // ---------- CSS ----------
    const css = document.createElement('style');
    css.textContent = `
    #stageRoot .stage-topbar,#stageRoot .stage-dock-wrap,#stageRoot .quick-send-bar{transition:opacity .25s,transform .25s}
    #stageRoot.ui-hidden .stage-topbar{opacity:0;transform:translateY(-12px);pointer-events:none}
    #stageRoot.ui-hidden .stage-topbar *,#stageRoot.ui-hidden .stage-dock-wrap *,#stageRoot.ui-hidden .quick-send-bar *{pointer-events:none!important}
    #stageRoot.ui-hidden .stage-dock-wrap,#stageRoot.ui-hidden .quick-send-bar{opacity:0;transform:translateY(16px);pointer-events:none}
    #stageRoot.ui-hidden #proMenu,#stageRoot.ui-hidden .reactions-popup{display:none}
    #stageRoot.ui-hidden .group-tiles{padding:2px;gap:2px}
    #stageRoot.ui-hidden .group-tiles.spotlight{padding-bottom:64px}
    #stageRoot.ui-hidden .live-comments-rail{bottom:24px}
    #stageRoot.ui-hidden #proPager{bottom:16px}
    #stageRoot.ui-hidden #proCaps{bottom:64px}
    #stageRoot.fit-contain .group-tile video,#stageRoot.fit-contain .stage-video-wrap video{object-fit:contain;background:#000}
    #proUiShow{position:absolute;top:calc(12px + env(safe-area-inset-top));right:12px;z-index:60;width:40px;height:40px;border-radius:50%;display:none;place-items:center;
      background:rgba(20,25,35,.55);color:#fff;border:1px solid var(--stage-line);backdrop-filter:blur(10px);opacity:.5;transition:.2s}
    #proUiShow:hover{opacity:1}

    #stageRoot .live-comments-rail{bottom:calc(170px + env(safe-area-inset-bottom));max-height:38vh}
    #stageRoot #proPager,#stageRoot #proCaps{bottom:calc(168px + env(safe-area-inset-bottom))}
    #proMenu{position:absolute;left:50%;bottom:calc(176px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(8px);z-index:43;display:grid;
      grid-template-columns:repeat(4,64px);gap:12px 8px;padding:14px;border-radius:20px;background:rgba(14,18,26,.94);border:1px solid var(--stage-line);
      backdrop-filter:blur(20px);opacity:0;pointer-events:none;transition:.18s;box-shadow:0 20px 50px rgba(0,0,0,.45)}
    #proMenu.show{opacity:1;pointer-events:auto;transform:translateX(-50%)}
    #proMenu .ctrl-wrap span{display:block!important;font-size:10px}
    #proMenu .ctrl-btn{width:52px;height:52px}

    #stageRoot .ctrl-btn{width:46px;height:46px;border-radius:14px;font-size:17px;transition:.15s}
    #stageRoot .ctrl-btn:hover{transform:translateY(-2px)}#stageRoot .ctrl-btn:active{transform:scale(.94)}
    #stageRoot .ctrl-btn.leave,#stageRoot .ctrl-btn.end-all{width:auto;padding:0 14px}
    #stageRoot .ctrl-btn.leave{background:rgba(239,68,68,.2);color:#fecaca;border-color:rgba(239,68,68,.35)}
    #stageRoot .ctrl-btn.leave:hover{background:var(--red);color:#fff}
    #stageRoot .stage-icon-btn{width:38px;height:38px}
    .stage-pill{white-space:nowrap}

    .chat-sys{align-self:center;font-size:11px;color:var(--stage-muted);background:rgba(255,255,255,.05);padding:3px 10px;border-radius:10px;text-align:center}
    .chat-msg-bubble{white-space:pre-wrap}
    .live-comment .lc-bubble{max-width:calc(100% - 34px)}

    body.in-call .toast-wrap{top:calc(74px + env(safe-area-inset-top))!important;bottom:auto!important;left:50%!important;right:auto!important;transform:translateX(-50%);
      width:max-content;max-width:92vw;align-items:center}
    body.in-call .toast{background:rgba(15,19,27,.92);color:#fff;border:1px solid var(--stage-line);border-radius:20px;padding:8px 14px;font-size:12.5px;animation:toastDown .3s ease}
    @keyframes toastDown{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none}}

    @media(max-width:760px){
      #stageRoot .ctrl-btn{width:40px;height:40px;font-size:15px}
      #stageRoot .ctrl-btn.leave,#stageRoot .ctrl-btn.end-all{height:40px}
      .stage-dock{max-width:calc(100vw - 16px);overflow-x:auto;flex-wrap:nowrap;scrollbar-width:none}.ctrl-wrap{flex-shrink:0}
      #callTypePill{display:none}
      #proMenu{grid-template-columns:repeat(4,56px);bottom:calc(140px + env(safe-area-inset-bottom))}
      #stageRoot .live-comments-rail{bottom:calc(138px + env(safe-area-inset-bottom))}
      #stageRoot #proPager,#stageRoot #proCaps{bottom:calc(136px + env(safe-area-inset-bottom))}
    }`;
    document.head.appendChild(css);

    // ---------- dock: keep essentials, move the rest into a "More" menu ----------
    const mkCtrl = (id, icon, label, fn) => {
        const w = document.createElement('div'); w.className = 'ctrl-wrap';
        w.innerHTML = `<button class="ctrl-btn" id="${id}"><i class="fa-solid ${icon}"></i></button><span>${label}</span>`;
        w.firstChild.onclick = fn; return w;
    };
    const menu = document.createElement('div'); menu.id = 'proMenu'; root.appendChild(menu);
    ['ctrlCC', 'ctrlSame', 'ctrlLayout', 'ctrlFlip', 'ctrlSet', 'ctrlMore'].forEach(id => { const w = $(id)?.parentElement; if (w) menu.appendChild(w); });
    $('ctrlMore').innerHTML = '<i class="fa-solid fa-toolbox"></i>';
    const tl = $('ctrlMore').nextElementSibling; if (tl) tl.textContent = 'Tools';
    menu.appendChild(mkCtrl('ctrlFit', 'fa-expand', 'Fit / Fill', toggleFit));
    menu.appendChild(mkCtrl('ctrlHide', 'fa-eye-slash', 'Hide UI', () => setManual(true)));
    document.querySelector('.ctrl-btn.add')?.parentElement.after(mkCtrl('ctrlMenu', 'fa-ellipsis', 'More', toggleMenu));

    const T = { ctrlMic: 'Mute / unmute (M)', ctrlCam: 'Camera on / off (V)', ctrlShare: 'Share screen', ctrlHand: 'Raise hand (H)', ctrlMenu: 'More options',
                ctrlCC: 'Live captions (C)', ctrlSame: 'Same-room mode', ctrlLayout: 'Grid / speaker view', ctrlFlip: 'Switch camera', ctrlSet: 'Call settings',
                ctrlMore: 'Recording, effects, host tools', ctrlFit: 'Fit or fill video', ctrlHide: 'Hide controls (W)' };
    Object.entries(T).forEach(([id, t]) => { const b = $(id); if (b) { b.title = t; b.setAttribute('aria-label', t); } });
    document.querySelector('.ctrl-btn.add')?.setAttribute('title', 'Add people');
    document.querySelector('.ctrl-btn.leave')?.setAttribute('title', 'Leave call');
    document.querySelectorAll('.stage-topbar-right .stage-icon-btn').forEach((b, i) => { b.title = ['Reactions', 'Chat', 'People', 'Fullscreen'][i] || ''; });

    function menuOpen() { return menu.classList.contains('show'); }
    function toggleMenu() { menu.classList.toggle('show'); $('ctrlMenu').classList.toggle('on', menuOpen()); }
    function closeMenu() { menu.classList.remove('show'); $('ctrlMenu')?.classList.remove('on'); }
    menu.addEventListener('click', e => { if (e.target.closest('button')) setTimeout(closeMenu, 0); });
    document.addEventListener('click', e => { if (menuOpen() && !menu.contains(e.target) && !$('ctrlMenu').contains(e.target)) closeMenu(); });

    // ---------- hide UI / wide screen ----------
    const eye = document.createElement('button');
    eye.className = 'stage-icon-btn'; eye.title = 'Hide controls (W)'; eye.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
    eye.onclick = () => setManual(true);
    document.querySelector('.stage-topbar-right').prepend(eye);
    const show = document.createElement('button');
    show.id = 'proUiShow'; show.title = 'Show controls (W)'; show.innerHTML = '<i class="fa-solid fa-eye"></i>';
    show.onclick = () => setManual(false);
    root.appendChild(show);

    function paint() {
        root.classList.toggle('ui-hidden', manual || autoH);
        root.classList.toggle('fit-contain', !!U.fit);
        show.style.display = manual ? 'grid' : 'none';
    }
    function setManual(v) {
        manual = v;
        if (v) { closeMenu(); closePanel(); $('reactionsPopup').classList.remove('show'); toast('Controls hidden — tap the eye (or press W) to bring them back', 'info'); }
        paint(); poke();
    }
    function toggleFit() { U.fit = !U.fit; saveU(); paint(); toast(U.fit ? 'Fit: whole picture visible' : 'Fill: picture fills the screen', 'info'); }

    function busy() {
        return menuOpen() || participantsPanelOpen || document.querySelector('.modal-overlay.show') ||
               /input|textarea|select/i.test(document.activeElement?.tagName || '');
    }
    function poke() {
        if (autoH) { autoH = false; revealedAt = Date.now(); paint(); }
        clearTimeout(idle);
        if (U.auto && callInProgress && callState === 'active' && !manual)
            idle = setTimeout(() => { if (busy()) return poke(); autoH = true; paint(); }, 5000);
    }
    ['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach(ev => root.addEventListener(ev, poke, { passive: true }));
    root.addEventListener('click', e => { if (Date.now() - revealedAt < 350) { e.stopPropagation(); e.preventDefault(); } }, true);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeMenu();
        if (!callInProgress || callState !== 'active' || e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test(e.target.tagName || '')) return;
        if (e.key === 'w' || e.key === 'W') setManual(!manual);
    });

    // ---------- display options in the Tools modal ----------
    $('mbHost').insertAdjacentHTML('beforebegin', `
        <div class="pro-h">Display</div>
        <label class="pro-tog">Auto-hide controls when idle (wide screen) <input type="checkbox" id="mbAuto"></label>
        <label class="pro-tog">Show floating messages over the video <input type="checkbox" id="mbFloat"></label>`);
    $('mbAuto').checked = U.auto; $('mbFloat').checked = U.float;
    $('mbAuto').onchange = e => { U.auto = e.target.checked; saveU(); poke(); };
    $('mbFloat').onchange = e => { U.float = e.target.checked; saveU(); if (!U.float) $('liveCommentsRail').innerHTML = ''; };

    // ---------- messages ----------
    const _slc = spawnLiveComment;
    spawnLiveComment = function (m, me) { if (U.float) _slc(m, me); };
    function addSys(text) {
        const box = $('chatMessages'); if (!box) return;
        box.querySelector('.chat-empty')?.remove();
        const d = document.createElement('div'); d.className = 'chat-sys'; d.textContent = text;
        box.appendChild(d); box.scrollTop = box.scrollHeight;
    }
    const SYS = /( joined| left|raised a hand|started recording|is now the host|removed )/;
    const _t2 = toast;
    toast = function (m, t) {
        _t2(m, t);
        const w = $('toast-wrap'); while (w && w.children.length > 3) w.firstChild.remove();
        if (callInProgress && SYS.test(String(m)) && (!/ (joined|left)$/.test(String(m)) || remoteIds().length <= 8)) addSys(String(m));
    };

    // ---------- lifecycle ----------
    const _scu = showCallUI;
    showCallUI = function (s, n, a, t) { _scu(s, n, a, t); paint(); if (s === 'active') poke(); };
    const _rcs2 = resetCallState;
    resetCallState = function () { manual = false; autoH = false; clearTimeout(idle); closeMenu(); _rcs2(); paint(); };
    paint();
})();
