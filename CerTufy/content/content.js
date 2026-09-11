// content/content.js
// CerTufy Content Script v2.1

console.log('[CerTufy] Content script injected at', location.href);

if (!window.__certufyLoaded) {
  window.__certufyLoaded = true;

  // ============ Context guard ============
  let ctxOk = true;

  function ctxAlive() {
    try { return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id); }
    catch (e) { return false; }
  }
  function killCtx() {
    if (!ctxOk) return;
    ctxOk = false;
    stopTimers();
    console.warn('[CerTufy] Context invalidated — refresh the page.');
  }
  function msg(payload) {
    if (!ctxAlive()) { killCtx(); return Promise.resolve({ success: false, error: 'ctx' }); }
    try {
      return chrome.runtime.sendMessage(payload)
        .then(r => r || { success: false, error: 'no-response' })
        .catch(e => {
          const m = (e && e.message) || String(e);
          if (m.includes('Extension context invalidated') || m.includes('message port closed')) killCtx();
          return { success: false, error: m };
        });
    } catch (e) {
      const m = (e && e.message) || String(e);
      if (m.includes('Extension context invalidated')) killCtx();
      return Promise.resolve({ success: false, error: m });
    }
  }

  // ============ State ============
  const S = {
    videoId: null, playlistId: null,
    videoTitle: '', playlistTitle: '',
    duration: 0, watched: 0,
    lastCT: 0, lastTick: 0, lastSave: 0,
    wasAd: false,
    isCompleted: false, certReady: false,
    totalInPlaylist: 0, completedInPlaylist: 0,
    suspicious: false, forwardSeek: 0
  };

  // ============ DOM helpers ============
  const $id = (x) => document.getElementById(x);
  const $q = (s) => { try { return document.querySelector(s); } catch (e) { return null; } };
  const $qa = (s) => { try { return document.querySelectorAll(s); } catch (e) { return []; } };

  // ============ YouTube readers ============
  function rVid() { try { return new URL(location.href).searchParams.get('v'); } catch (e) { return null; } }
  function rPl() { try { return new URL(location.href).searchParams.get('list'); } catch (e) { return null; } }
  function rTitle() {
    const t = $q('h1.ytd-video-primary-info-renderer yt-formatted-string')
           || $q('#title h1 yt-formatted-string')
           || $q('meta[name="title"]');
    return t ? (t.textContent || t.getAttribute('content') || '').trim() : document.title.replace(/ - YouTube$/, '').trim();
  }
  function rPlTitle() {
    const t = $q('ytd-playlist-header-renderer h1')
           || $q('#playlist-header h1')
           || $q('h2.ytd-playlist-panel-renderer')
           || $q('.ytp-playlist-menu-title');
    return t ? t.textContent.trim() : 'YouTube Playlist';
  }
  function vid() { return $q('video'); }
  function playing() { const v = vid(); return !!(v && !v.paused && !v.ended && v.readyState > 2); }
  function inAd() {
    if ($q('.ytp-ad-player-overlay')) return true;
    const m = $q('.video-ads.ytp-ad-module');
    if (m && m.children.length > 0) return true;
    if ($q('.ytp-ad-interrupting')) return true;
    if ($q('.ytp-ad-badge')) return true;
    if ($q('.ytp-ad-text')) return true;
    return false;
  }
  function rPlTotal() {
    const sels = ['.ytp-playlist-panel-index', '.index-message-wrapper', 'ytd-playlist-panel-renderer .index-message-wrapper', '.ytp-playlist-menu-index'];
    for (const s of sels) {
      const el = $q(s);
      if (el) {
        const m = el.textContent.match(/(\d+)\s*\/\s*(\d+)/);
        if (m) { const t = parseInt(m[2], 10); if (t > 0) return t; }
      }
    }
    const panel = $q('ytd-playlist-panel-renderer');
    if (panel) {
      const m = panel.textContent.match(/(\d+)\s*\/\s*(\d+)/);
      if (m) { const t = parseInt(m[2], 10); if (t > 0 && t < 10000) return t; }
    }
    const items = $qa('ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer');
    if (items.length > 0) return items.length;
    return 0;
  }

  // ============ Overlay ============
  function buildOverlay() {
    const old = $id('certufy-overlay'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'certufy-overlay';
    el.className = 'certufy-overlay';
    el.innerHTML = `
      <div class="certufy-overlay-header">
        <span class="certufy-overlay-title">🎓 CerTufy</span>
        <button class="certufy-overlay-close" id="certufy-close">×</button>
      </div>
      <div class="certufy-overlay-content">
        <div class="certufy-progress-section">
          <div class="certufy-progress-label">Video Progress</div>
          <div class="certufy-progress-bar-container"><div class="certufy-progress-bar" id="certufy-vp" style="width:0%"></div></div>
          <div class="certufy-progress-text" id="certufy-vpt">0%</div>
        </div>
        <div class="certufy-progress-section" id="certufy-pl-wrap" style="display:none">
          <div class="certufy-progress-label" id="certufy-pl-label">Course Progress</div>
          <div class="certufy-progress-bar-container"><div class="certufy-progress-bar certufy-playlist-progress" id="certufy-pp" style="width:0%"></div></div>
          <div class="certufy-progress-text" id="certufy-ppt">0%</div>
        </div>
        <div class="certufy-warning" id="certufy-warn" style="display:none"></div>
        <button class="certufy-generate-btn" id="certufy-gen" disabled>🎓 Generate Certificate</button>
        <button class="certufy-resume-btn" id="certufy-res" style="display:none">⏯️ Resume Last Session</button>
      </div>
    `;
    document.body.appendChild(el);
    $id('certufy-close').addEventListener('click', () => { el.style.display = 'none'; if (S.certReady) showFab(); });
    $id('certufy-gen').addEventListener('click', openCertForm);
    $id('certufy-res').addEventListener('click', resumeSession);
    console.log('[CerTufy] Overlay built');
  }
  function showFab() {
    let f = $id('certufy-fab');
    if (!f) {
      f = document.createElement('button');
      f.id = 'certufy-fab';
      f.className = 'certufy-floating-btn';
      f.textContent = '🎓';
      f.title = 'CerTufy — Certificate Ready';
      f.addEventListener('click', () => { f.style.display = 'none'; const o = $id('certufy-overlay'); if (o) o.style.display = 'block'; });
      document.body.appendChild(f);
    }
    f.style.display = S.certReady ? 'flex' : 'none';
  }
  function hideFab() { const f = $id('certufy-fab'); if (f) f.style.display = 'none'; }
  function warn(t) { const w = $id('certufy-warn'); if (w) { w.textContent = t; w.style.display = 'block'; } }
  function unwarn() { const w = $id('certufy-warn'); if (w) { w.textContent = ''; w.style.display = 'none'; } }

  function render() {
    if (!S.videoId) return;
    const vPct = S.duration > 0 ? Math.min((S.watched / S.duration) * 100, 100) : 0;
    const vp = $id('certufy-vp'), vpt = $id('certufy-vpt');
    if (vp) vp.style.width = vPct + '%';
    if (vpt) vpt.textContent = Math.round(vPct) + '%';

    const isPl = S.playlistId && S.playlistId !== 'single';
    const wrap = $id('certufy-pl-wrap');
    if (wrap) wrap.style.display = isPl ? 'block' : 'none';
    if (isPl) {
      const total = S.totalInPlaylist, done = S.completedInPlaylist;
      const pPct = total > 0 ? Math.min((done / total) * 100, 100) : 0;
      const lbl = $id('certufy-pl-label');
      if (lbl) lbl.textContent = total > 0 ? `Course Progress (${done}/${total})` : `Course Progress (${done} done)`;
      const pp = $id('certufy-pp'), ppt = $id('certufy-ppt');
      if (pp) pp.style.width = pPct + '%';
      if (ppt) ppt.textContent = Math.round(pPct) + '%';
    }

    let ready;
    if (isPl) ready = S.totalInPlaylist > 0 && S.completedInPlaylist >= S.totalInPlaylist;
    else ready = S.isCompleted;
    const gen = $id('certufy-gen');
    if (gen) gen.disabled = !ready;
    S.certReady = ready;

    if (S.suspicious) warn('⚠️ Suspicious viewing. Watch continuously.');
    else unwarn();
    if (S.certReady) showFab(); else hideFab();
  }

  // ============ Playlist ============
  async function refreshPlaylist() {
    if (!S.playlistId || S.playlistId === 'single') return;
    const domTotal = rPlTotal();
    if (domTotal > 0 && domTotal !== S.totalInPlaylist) {
      S.totalInPlaylist = domTotal;
      await msg({ action: 'setPlaylistTotal', playlistId: S.playlistId, total: domTotal });
    } else if (domTotal > 0) {
      S.totalInPlaylist = domTotal;
    }
    const r = await msg({ action: 'getPlaylistProgress', playlistId: S.playlistId });
    if (r.success && r.data) {
      S.completedInPlaylist = r.data.completed || 0;
      if (!S.totalInPlaylist && r.data.total > 0) S.totalInPlaylist = r.data.total;
    }
  }

  // ============ Timers ============
  let tickT = null, plT = null;
  function stopTimers() {
    if (tickT) { clearInterval(tickT); tickT = null; }
    if (plT) { clearInterval(plT); plT = null; }
  }
  function startTimers() {
    stopTimers();
    S.lastTick = Date.now();
    S.lastSave = Date.now();
    tickT = setInterval(tick, 1000);
    plT = setInterval(() => {
      if (!ctxOk) return;
      if (S.playlistId && S.playlistId !== 'single') {
        refreshPlaylist().then(render).catch(() => {});
      }
    }, 3000);
  }

  async function tick() {
    if (!ctxOk) return;
    try {
      const v = vid();
      if (!v) return;
      const id = rVid();
      if (!id) return;
      if (id !== S.videoId) { await onVideoChange(); return; }

      const now = Date.now();
      const dt = (now - S.lastTick) / 1000;
      S.lastTick = now;
      const ad = inAd();
      const play = playing();
      const ct = v.currentTime;
      const dur = v.duration;

      if (dur && isFinite(dur) && dur > 0) S.duration = dur;
      if (ad && !S.wasAd) S.lastCT = ct;
      S.wasAd = ad;

      if (play && !ad && dt > 0.3 && dt < 3) {
        const delta = ct - S.lastCT;
        const expected = dt * (v.playbackRate || 1);
        if (delta > expected + 1.5 && delta > 0) {
          S.forwardSeek += delta;
          if (S.forwardSeek > 15 && !S.isCompleted) S.suspicious = true;
        }
        const continuous = Math.abs(delta - expected) < 1.5;
        if (continuous) S.watched = Math.min(S.watched + Math.min(dt, 2), S.duration);

        const pct = S.duration > 0 ? S.watched / S.duration : 0;
        if (pct >= 0.9 && !S.isCompleted && !S.suspicious) {
          S.isCompleted = true;
          console.log('[CerTufy] ✔ Video completed at', (pct * 100).toFixed(1) + '%');
          await msg({
            action: 'saveWatchProgress',
            data: {
              videoId: S.videoId, playlistId: S.playlistId || 'single',
              watchedSeconds: S.watched, videoDuration: S.duration,
              videoTitle: S.videoTitle, playlistTitle: S.playlistTitle,
              suspiciousActivity: S.suspicious
            }
          });
          if (S.playlistId && S.playlistId !== 'single') await refreshPlaylist();
        }
      }
      S.lastCT = ct;

      if (now - S.lastSave > 5000) {
        S.lastSave = now;
        await msg({
          action: 'saveWatchProgress',
          data: {
            videoId: S.videoId, playlistId: S.playlistId || 'single',
            watchedSeconds: S.watched, videoDuration: S.duration,
            videoTitle: S.videoTitle, playlistTitle: S.playlistTitle,
            suspiciousActivity: S.suspicious
          }
        });
        await msg({
          action: 'saveResumeState',
          data: {
            videoId: S.videoId, playlistId: S.playlistId,
            videoTitle: S.videoTitle, playlistTitle: S.playlistTitle,
            watchedSeconds: S.watched, url: location.href
          }
        });
      }
      render();
    } catch (e) {
      if ((e && e.message || '').includes('Extension context invalidated')) killCtx();
    }
  }

  async function onVideoChange() {
    if (!ctxOk) return;
    const id = rVid(), plid = rPl();
    if (!id) return;
    console.log('[CerTufy] Video change →', id, plid);
    if (S.videoId) {
      await msg({
        action: 'saveWatchProgress',
        data: {
          videoId: S.videoId, playlistId: S.playlistId || 'single',
          watchedSeconds: S.watched, videoDuration: S.duration,
          videoTitle: S.videoTitle, playlistTitle: S.playlistTitle,
          suspiciousActivity: S.suspicious
        }
      });
    }
    const plChanged = plid && plid !== S.playlistId;
    S.videoId = id;
    S.playlistId = plid || 'single';
    S.videoTitle = rTitle();
    S.playlistTitle = rPlTitle();
    S.duration = 0; S.watched = 0; S.lastCT = 0;
    S.lastTick = Date.now(); S.lastSave = Date.now();
    S.isCompleted = false; S.certReady = false;
    S.suspicious = false; S.forwardSeek = 0; S.wasAd = false;
    if (plChanged) { S.totalInPlaylist = 0; S.completedInPlaylist = 0; }

    const h = await msg({ action: 'getWatchHistory', videoId: S.videoId, playlistId: S.playlistId });
    if (h.success && h.data && h.data.length > 0) {
      const r = h.data[0];
      S.watched = r.watchedSeconds || 0;
      S.isCompleted = r.completed || false;
      S.suspicious = r.suspiciousActivity || false;
      if (r.videoDuration) S.duration = r.videoDuration;
    }
    if (S.playlistId && S.playlistId !== 'single') await refreshPlaylist();
    const rr = await msg({ action: 'getResumeState' });
    const b = $id('certufy-res');
    if (b) {
      if (rr.success && rr.data && rr.data.videoId && rr.data.videoId !== S.videoId) {
        b.style.display = 'block';
        b.textContent = `⏯️ Resume: ${rr.data.videoTitle || 'Video'}`;
      } else b.style.display = 'none';
    }
    render();
  }

  // ============ Certificate ============
  async function openCertForm() {
    if (!ctxAlive()) { alert('Extension reloaded. Refresh the page.'); return; }
    try {
      const em = await msg({ action: 'getSettings', key: 'currentUserEmail' });
      const userEmail = em.success ? (em.data || '') : '';
      let userName = '';
      if (userEmail) {
        const u = await msg({ action: 'getUser', email: userEmail });
        if (u.success && u.data) userName = u.data.name || '';
      }
      const pending = {
        videoId: S.videoId, playlistId: S.playlistId,
        videoTitle: S.videoTitle, playlistTitle: S.playlistTitle,
        userName, userEmail, template: 'Classic'
      };
      await chrome.storage.local.set({ pendingCertificateData: pending });
      const check = await chrome.storage.local.get('pendingCertificateData');
      if (!check || !check.pendingCertificateData) {
        alert('Failed to store certificate data.');
        return;
      }
      // ⭐ Content scripts cannot use chrome.tabs — ask the SW to open the tab
      const r = await msg({ action: 'openCertificateTab' });
      if (!r || !r.success) {
        alert('Could not open certificate tab: ' + ((r && r.error) || 'unknown'));
      }
    } catch (e) {
      alert('Error: ' + ((e && e.message) || 'unknown'));
    }
  }

  async function resumeSession() {
    const r = await msg({ action: 'getResumeState' });
    if (r.success && r.data && r.data.url) location.href = r.data.url;
  }

  // ============ Nav ============
  function watchNav() {
    let last = location.href;
    setInterval(() => {
      if (!ctxOk) return;
      if (location.href !== last) {
        last = location.href;
        const v = rVid();
        if (v && v !== S.videoId) onVideoChange();
      }
    }, 1000);
    document.addEventListener('yt-navigate-finish', () => {
      if (!ctxOk) return;
      const v = rVid();
      if (v && v !== S.videoId) onVideoChange();
    });
    setInterval(() => {
      if (!ctxOk) return;
      const v = vid();
      if (v && !v.__certufySeek) {
        v.__certufySeek = true;
        v.addEventListener('seeking', () => {
          try {
            const jump = Math.abs(v.currentTime - S.lastCT);
            if (jump > 2 && v.currentTime > S.lastCT) {
              S.forwardSeek += jump;
              if (S.forwardSeek > 15 && !S.isCompleted) S.suspicious = true;
            }
          } catch (e) {}
        });
      }
    }, 3000);
  }

  // ============ Init ============
  async function init() {
    try {
      if (!ctxAlive()) return;
      const id = rVid();
      if (!id) {
        setTimeout(init, 1500);
        return;
      }

      S.videoId = id;
      S.playlistId = rPl() || 'single';
      S.videoTitle = rTitle();
      S.playlistTitle = rPlTitle();
      console.log('[CerTufy] Init:', { videoId: S.videoId, playlistId: S.playlistId });

      const h = await msg({ action: 'getWatchHistory', videoId: S.videoId, playlistId: S.playlistId });
      if (h.success && h.data && h.data.length > 0) {
        const r = h.data[0];
        S.watched = r.watchedSeconds || 0;
        S.isCompleted = r.completed || false;
        S.suspicious = r.suspiciousActivity || false;
        if (r.videoDuration) S.duration = r.videoDuration;
      }

      if (S.playlistId && S.playlistId !== 'single') {
        setTimeout(() => refreshPlaylist().then(render).catch(() => {}), 1500);
        setTimeout(() => refreshPlaylist().then(render).catch(() => {}), 4000);
      }

      buildOverlay();
      render();

      const rr = await msg({ action: 'getResumeState' });
      const b = $id('certufy-res');
      if (b && rr.success && rr.data && rr.data.videoId && rr.data.videoId !== S.videoId) {
        b.style.display = 'block';
        b.textContent = `⏯️ Resume: ${rr.data.videoTitle || 'Video'}`;
      }

      watchNav();
      startTimers();
      setInterval(() => { if (!ctxAlive()) killCtx(); }, 10000);

      chrome.runtime.onMessage.addListener((m, s, sr) => {
        if (!ctxOk) { sr({ success: false, error: 'ctx' }); return true; }
        try {
          if (m.action === 'getVideoInfo') {
            sr({
              success: true,
              data: {
                title: S.videoTitle,
                playlistTitle: S.playlistTitle,
                watchedSeconds: S.watched,
                videoDuration: S.duration,
                isCompleted: S.isCompleted,
                totalPlaylistVideos: S.totalInPlaylist,
                completedPlaylistVideos: S.completedInPlaylist,
                suspiciousActivity: S.suspicious
              }
            });
          } else if (m.action === 'generateCertificate') {
            openCertForm();
            sr({ success: true });
          } else if (m.action === 'setDarkMode') {
            document.body.classList.toggle('certufy-dark-mode', !!m.enabled);
            sr({ success: true });
          } else {
            sr({ success: false, error: 'unknown' });
          }
        } catch (e) { sr({ success: false, error: (e && e.message) || 'err' }); }
        return true;
      });
    } catch (e) {
      console.error('[CerTufy] init error:', e);
    }
  }

  function cleanup() {
    stopTimers();
    const o = $id('certufy-overlay'); if (o) o.remove();
    const f = $id('certufy-fab'); if (f) f.remove();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.addEventListener('beforeunload', cleanup);

  window.CerTufy = { state: S, refreshPlaylist, render, rPlTotal };
}