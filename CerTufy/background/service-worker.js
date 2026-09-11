// background/service-worker.js
// CerTufy Service Worker v2.1

const DB_NAME = 'CerTufyDB';
const DB_VERSION = 5;

let _db = null;
let _openPromise = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  if (_openPromise) return _openPromise;

  _openPromise = new Promise((resolve, reject) => {
    const attempt = (v) => {
      const req = indexedDB.open(DB_NAME, v);
      req.onerror = () => {
        const err = req.error;
        if (err && err.name === 'VersionError') {
          const m = (err.message || '').match(/existing version \((\d+)\)/);
          const existing = m ? parseInt(m[1], 10) : v + 1;
          attempt(existing + 1);
          return;
        }
        _openPromise = null;
        reject(err || new Error('DB open failed'));
      };
      req.onsuccess = () => {
        _db = req.result;
        _db.onversionchange = () => { try { _db.close(); } catch (e) {} _db = null; _openPromise = null; };
        resolve(_db);
      };
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('watchHistory')) {
          const s = d.createObjectStore('watchHistory', { keyPath: 'id', autoIncrement: true });
          s.createIndex('videoId', 'videoId');
          s.createIndex('playlistId', 'playlistId');
          s.createIndex('completed', 'completed');
        }
        if (!d.objectStoreNames.contains('certificates')) {
          const s = d.createObjectStore('certificates', { keyPath: 'id', autoIncrement: true });
          s.createIndex('uniqueKey', 'uniqueKey', { unique: true });
          s.createIndex('verificationCode', 'verificationCode', { unique: true });
          s.createIndex('email', 'userEmail');
        }
        if (!d.objectStoreNames.contains('users')) d.createObjectStore('users', { keyPath: 'email' });
        if (!d.objectStoreNames.contains('analytics')) {
          const s = d.createObjectStore('analytics', { keyPath: 'id', autoIncrement: true });
          s.createIndex('type', 'type');
        }
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
      };
    };
    attempt(DB_VERSION);
  });

  return _openPromise;
}

function idbReq(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const os = tx.objectStore(store);
    const r = fn(os);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
const dbAdd = (s, d) => idbReq(s, 'readwrite', os => os.add(d));
const dbPut = (s, d) => idbReq(s, 'readwrite', os => os.put(d));
const dbGet = (s, k) => idbReq(s, 'readonly', os => os.get(k));
const dbAll = (s) => idbReq(s, 'readonly', os => os.getAll());
const dbByIndex = (s, i, v) => idbReq(s, 'readonly', os => os.index(i).getAll(v));
const dbClear = (s) => idbReq(s, 'readwrite', os => os.clear());

async function getSetting(k, fb = null) { try { const r = await dbGet('settings', k); return r ? r.value : fb; } catch (e) { return fb; } }
const setSetting = (k, v) => dbPut('settings', { key: k, value: v });

function newCode() {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
function makeKey(vid, plid, email) {
  const clean = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${clean(plid) || 'single'}_${clean(vid)}_${clean(email)}`;
}

async function getWatchHistory(videoId, playlistId) {
  if (!videoId) return [];
  const all = await dbByIndex('watchHistory', 'videoId', videoId);
  return all.filter(r => r.playlistId === (playlistId || 'single'));
}

async function saveWatchProgress(d) {
  if (!d || !d.videoId) return;
  const plid = d.playlistId || 'single';
  const all = await dbByIndex('watchHistory', 'videoId', d.videoId);
  const existing = all.find(r => r.playlistId === plid);

  const watched = Math.max(0, Number(d.watchedSeconds) || 0);
  const duration = Math.max(0, Number(d.videoDuration) || 0);
  const pct = duration > 0 ? watched / duration : 0;
  const suspicious = !!d.suspiciousActivity;
  const completed = pct >= 0.9 && !suspicious;

  if (existing) {
    existing.watchedSeconds = Math.max(existing.watchedSeconds || 0, watched);
    existing.videoDuration = duration || existing.videoDuration;
    existing.videoTitle = d.videoTitle || existing.videoTitle || 'YouTube Video';
    existing.playlistTitle = d.playlistTitle || existing.playlistTitle || '';
    const newPct = existing.videoDuration > 0 ? existing.watchedSeconds / existing.videoDuration : 0;
    existing.completed = newPct >= 0.9 && !suspicious;
    existing.suspiciousActivity = suspicious || existing.suspiciousActivity;
    existing.lastUpdated = Date.now();
    await dbPut('watchHistory', existing);
  } else {
    await dbAdd('watchHistory', {
      videoId: d.videoId, playlistId: plid,
      watchedSeconds: watched, videoDuration: duration,
      videoTitle: d.videoTitle || 'YouTube Video',
      playlistTitle: d.playlistTitle || '',
      userId: d.userId || 'anonymous',
      completed, suspiciousActivity: suspicious,
      firstWatched: Date.now(), lastUpdated: Date.now()
    });
  }
}

async function getPlaylistProgress(playlistId) {
  if (!playlistId) return { total: 0, completed: 0, percentage: 0 };
  const rows = await dbByIndex('watchHistory', 'playlistId', playlistId);
  const clean = rows.filter(r => r.completed === true && !r.suspiciousActivity).length;
  const stored = Number(await getSetting(`playlist_${playlistId}_total`, 0)) || 0;
  const total = stored || rows.length || 0;
  return { total, completed: clean, percentage: total > 0 ? Math.min((clean / total) * 100, 100) : 0 };
}

async function generateCertificate(d) {
  if (!d) throw new Error('No data');
  const { videoId, playlistId, videoTitle, playlistTitle, userName, userEmail, template, force } = d;
  if (!userName || !userName.trim()) throw new Error('Name is required');
  if (!userEmail || !userEmail.includes('@')) throw new Error('Valid email is required');
  if (!videoId) throw new Error('Missing video ID');

  const isPlaylist = playlistId && playlistId !== 'single';

  if (!force) {
    if (isPlaylist) {
      const prog = await getPlaylistProgress(playlistId);
      if (prog.total > 0 && prog.completed < prog.total) {
        throw new Error(`Course not complete: ${prog.completed}/${prog.total}`);
      }
    } else {
      const h = await getWatchHistory(videoId, 'single');
      if (h.length === 0) throw new Error('No watch history for this video');
      const rec = h[0];
      const pct = rec.videoDuration > 0 ? rec.watchedSeconds / rec.videoDuration : 0;
      if (pct < 0.9) throw new Error(`Video not watched to 90% (currently ${Math.round(pct * 100)}%)`);
      if (rec.suspiciousActivity) throw new Error('Certificate blocked: suspicious viewing');
    }
  }

  const uKey = makeKey(videoId, playlistId, userEmail);
  const dupes = await dbByIndex('certificates', 'uniqueKey', uKey);
  if (dupes.length > 0) throw new Error('Certificate already exists for this video and email');

  let code = newCode();
  for (let i = 0; i < 8; i++) {
    const clash = await dbByIndex('certificates', 'verificationCode', code);
    if (clash.length === 0) break;
    code = newCode();
  }

  const cert = {
    uniqueKey: uKey, verificationCode: code,
    videoId, playlistId: playlistId || 'single',
    videoTitle: videoTitle || 'YouTube Video',
    playlistTitle: playlistTitle || '',
    userName: userName.trim(), userEmail: userEmail.trim(),
    template: template || 'Classic',
    generatedDate: new Date().toISOString(),
    verified: false, verificationCount: 0
  };
  cert.id = await dbAdd('certificates', cert);

  await dbPut('users', { email: userEmail.trim(), name: userName.trim(), created: Date.now(), lastUpdated: Date.now() });
  await setSetting('currentUserEmail', userEmail.trim());

  await dbAdd('analytics', {
    type: 'certificate_generated', timestamp: Date.now(),
    userId: userEmail, data: { certificateId: cert.id, videoId, playlistId, template }
  });

  return cert;
}

async function verifyCertificate(code) {
  if (!code) return { valid: false, message: 'No code' };
  const norm = String(code).trim().toUpperCase();
  const rows = await dbByIndex('certificates', 'verificationCode', norm);
  if (!rows || rows.length === 0) return { valid: false, message: 'Certificate not found' };
  const c = rows[0];
  c.verificationCount = (c.verificationCount || 0) + 1;
  c.verified = true;
  c.lastVerified = new Date().toISOString();
  await dbPut('certificates', c);
  return {
    valid: true,
    certificate: {
      userName: c.userName, videoTitle: c.videoTitle,
      playlistTitle: c.playlistTitle || '',
      verificationCode: c.verificationCode,
      generatedDate: c.generatedDate,
      verificationCount: c.verificationCount
    }
  };
}

// ============================================================
// Message Handlers
// ============================================================
const handlers = {
  ping: async () => 'pong',

  getWatchHistory: async (m) => getWatchHistory(m.videoId, m.playlistId),

  saveWatchProgress: async (m) => { await saveWatchProgress(m.data); return true; },

  markVideoCompleted: async (m) => {
    const d = m.data || {};
    const all = await dbByIndex('watchHistory', 'videoId', d.videoId);
    const existing = all.find(r => r.playlistId === (d.playlistId || 'single'));
    if (existing) {
      const pct = existing.videoDuration > 0 ? existing.watchedSeconds / existing.videoDuration : 0;
      if (pct >= 0.9 && !existing.suspiciousActivity) {
        existing.completed = true;
        existing.lastUpdated = Date.now();
        await dbPut('watchHistory', existing);
      }
    }
    return true;
  },

  getPlaylistProgress: async (m) => getPlaylistProgress(m.playlistId),

  setPlaylistTotal: async (m) => {
    if (m.playlistId && m.total > 0) await setSetting(`playlist_${m.playlistId}_total`, Number(m.total) || 0);
    return true;
  },

  generateCertificate: async (m) => generateCertificate(m.data),

  getCertificates: async (m) => m.email ? dbByIndex('certificates', 'email', m.email) : [],

  getCertificate: async (m) => dbGet('certificates', m.id),

  verifyCertificate: async (m) => verifyCertificate(m.code),

  saveUser: async (m) => {
    const d = m.data || {};
    if (d.email) {
      await dbPut('users', { email: d.email, name: d.name || '', created: Date.now(), lastUpdated: Date.now() });
      await setSetting('currentUserEmail', d.email);
    }
    return true;
  },

  getUser: async (m) => m.email ? dbGet('users', m.email) : null,

  getSettings: async (m) => getSetting(m.key, null),

  setSettings: async (m) => { await setSetting(m.key, m.value); return true; },

  getResumeState: async () => (await chrome.storage.local.get('resumeState')).resumeState || null,

  saveResumeState: async (m) => {
    await chrome.storage.local.set({ resumeState: { ...(m.data || {}), savedAt: Date.now() } });
    return true;
  },

  clearResumeState: async () => { await chrome.storage.local.remove('resumeState'); return true; },

  getAllWatchHistory: async () => dbAll('watchHistory'),

  addAnalyticsEvent: async (m) => {
    await dbAdd('analytics', { type: m.type, timestamp: Date.now(), userId: 'anonymous', data: m.data || {} });
    return true;
  },

  // ⭐ Content scripts CANNOT use chrome.tabs — they ask the SW to open the tab.
  openCertificateTab: async (m) => {
    const q = m && m.query ? m.query : '';
    const url = chrome.runtime.getURL('certificate/certificate.html' + q);
    await chrome.tabs.create({ url });
    return true;
  },

  openVerifyTab: async (m) => {
    const q = m && m.query ? m.query : '';
    const url = chrome.runtime.getURL('verify/verify.html' + q);
    await chrome.tabs.create({ url });
    return true;
  },

  exportData: async () => ({
    version: 5,
    exportedAt: new Date().toISOString(),
    watchHistory: await dbAll('watchHistory'),
    certificates: await dbAll('certificates'),
    users: await dbAll('users'),
    analytics: await dbAll('analytics'),
    settings: await dbAll('settings')
  }),

  importData: async (m) => {
    const d = m.data || {};
    for (const s of ['watchHistory', 'certificates', 'users', 'analytics', 'settings']) {
      if (Array.isArray(d[s])) {
        await dbClear(s);
        for (const item of d[s]) { try { await dbPut(s, item); } catch (e) {} }
      }
    }
    return true;
  },

  clearAllData: async () => {
    for (const s of ['watchHistory', 'certificates', 'users', 'analytics', 'settings']) await dbClear(s);
    await chrome.storage.local.remove('resumeState');
    return true;
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const a = message && message.action;
  const fn = handlers[a];
  if (!fn) {
    sendResponse({ success: false, error: 'Unknown action: ' + a });
    return true;
  }
  Promise.resolve()
    .then(() => fn(message, sender))
    .then((data) => sendResponse({ success: true, data }))
    .catch((e) => {
      const m = (e && e.message) || String(e) || 'error';
      console.error('[CerTufy SW]', a, '-', m);
      sendResponse({ success: false, error: m });
    });
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  try {
    if ((await getSetting('darkMode', null)) === null) await setSetting('darkMode', false);
    if ((await getSetting('notificationsEnabled', null)) === null) await setSetting('notificationsEnabled', true);
  } catch (e) {}
});

openDB().catch(e => console.warn('[CerTufy] DB warmup failed:', e));
console.log('[CerTufy SW] Service worker loaded');