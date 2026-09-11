const $ = (id) => document.getElementById(id);
const tabBtns = document.querySelectorAll('.certufy-tab-btn');
const tabPanels = document.querySelectorAll('.certufy-tab-panel');

async function bg(payload) {
  try { return await chrome.runtime.sendMessage(payload) || { success: false }; }
  catch (e) { return { success: false, error: (e && e.message) || 'err' }; }
}
function toast(text, kind) {
  const old = document.querySelector('.certufy-toast'); if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'certufy-toast ' + (kind || '');
  el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;z-index:1000';
  if (kind === 'success') el.style.background = '#4CAF50';
  if (kind === 'error') el.style.background = '#f44336';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
function fmtTime(s) { if (!s || s < 0) return '0m'; const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return h > 0 ? `${h}h ${m}m` : `${m}m`; }
function fmtDate(s) { try { return new Date(s).toLocaleDateString(); } catch (e) { return 'N/A'; } }

function switchTab(id) {
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  tabPanels.forEach(p => p.classList.toggle('active', p.id === 'tab-' + id));
  if (id === 'current') loadCurrent();
  if (id === 'certificates') loadCerts();
  if (id === 'analytics') loadAnalytics();
  if (id === 'settings') loadSettings();
}
tabBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

async function loadCurrent() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
      $('current-video-title').textContent = 'No YouTube tab active';
      $('generate-cert-btn').disabled = true;
      $('playlist-section').style.display = 'none';
      return;
    }
    const r = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoInfo' }).catch(() => null);
    if (r && r.success && r.data) {
      const d = r.data;
      $('current-video-title').textContent = d.title || 'Unknown Video';
      $('current-playlist-title').textContent = d.playlistTitle ? '📚 ' + d.playlistTitle : '';
      const vp = d.videoDuration > 0 ? Math.min((d.watchedSeconds / d.videoDuration) * 100, 100) : 0;
      $('video-progress-bar').style.width = vp + '%';
      $('video-progress-text').textContent = Math.round(vp) + '%';
      const isPl = d.totalPlaylistVideos > 0;
      $('playlist-section').style.display = isPl ? 'block' : 'none';
      if (isPl) {
        const pp = Math.min((d.completedPlaylistVideos / d.totalPlaylistVideos) * 100, 100);
        $('playlist-progress-bar').style.width = pp + '%';
        $('playlist-progress-text').textContent = Math.round(pp) + '%';
      }
      const ready = isPl
        ? d.completedPlaylistVideos >= d.totalPlaylistVideos && d.totalPlaylistVideos > 0
        : !!d.isCompleted;
      $('generate-cert-btn').disabled = !ready;
    } else {
      $('current-video-title').textContent = 'No active video';
      $('generate-cert-btn').disabled = true;
    }
    const rr = await bg({ action: 'getResumeState' });
    if (rr.success && rr.data && rr.data.videoId) {
      $('resume-btn').style.display = 'block';
      $('resume-btn').textContent = `⏯️ Resume: ${rr.data.videoTitle || 'Video'}`;
    } else $('resume-btn').style.display = 'none';
  } catch (e) {
    $('current-video-title').textContent = 'Unable to reach tab';
    $('generate-cert-btn').disabled = true;
  }
}

async function loadCerts() {
  const em = await bg({ action: 'getSettings', key: 'currentUserEmail' });
  const email = em.success ? em.data : null;
  if (!email) {
    $('certificates-list').innerHTML = '<div class="certufy-empty-state"><span class="certufy-empty-icon">👤</span><span class="certufy-empty-text">Set profile in Settings</span></div>';
    $('cert-count').textContent = '0';
    return;
  }
  const r = await bg({ action: 'getCertificates', email });
  const certs = (r.success && r.data) ? r.data : [];
  $('cert-count').textContent = certs.length;
  if (certs.length === 0) {
    $('certificates-list').innerHTML = '<div class="certufy-empty-state"><span class="certufy-empty-icon">📭</span><span class="certufy-empty-text">No certificates yet</span></div>';
    return;
  }
  $('certificates-list').innerHTML = certs.map(c => `
    <div class="certufy-certificate-item">
      <div class="certufy-certificate-info">
        <div class="certufy-certificate-name">${c.videoTitle || 'Video'}</div>
        <div class="certufy-certificate-detail">${c.playlistTitle ? '📚 ' + c.playlistTitle + ' · ' : ''}${fmtDate(c.generatedDate)} · ${c.verificationCode}</div>
      </div>
      <div class="certufy-certificate-actions">
        <button class="certufy-btn certufy-btn-secondary certufy-btn-small" data-view="${c.id}">View</button>
        <button class="certufy-btn certufy-btn-success certufy-btn-small" data-verify="${c.verificationCode}">Verify</button>
      </div>
    </div>
  `).join('');
  $('certificates-list').querySelectorAll('[data-view]').forEach(b => {
    b.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL(`certificate/certificate.html?id=${b.dataset.view}`) });
    });
  });
  $('certificates-list').querySelectorAll('[data-verify]').forEach(b => {
    b.addEventListener('click', () => {
      switchTab('verify');
      $('verify-code-input').value = b.dataset.verify;
      doVerify();
    });
  });
}

async function loadAnalytics() {
  const em = await bg({ action: 'getSettings', key: 'currentUserEmail' });
  const email = em.success ? em.data : null;
  let certCount = 0;
  if (email) {
    const c = await bg({ action: 'getCertificates', email });
    if (c.success && c.data) certCount = c.data.length;
  }
  const h = await bg({ action: 'getAllWatchHistory' });
  const rows = (h.success && Array.isArray(h.data)) ? h.data : [];
  const uniq = new Set();
  let completed = 0, watchSec = 0;
  const pl = new Map();
  for (const r of rows) {
    if (!r.videoId) continue;
    uniq.add(r.videoId);
    if (r.completed && !r.suspiciousActivity) completed++;
    watchSec += r.watchedSeconds || 0;
    if (r.playlistId && r.playlistId !== 'single') {
      if (!pl.has(r.playlistId)) pl.set(r.playlistId, { total: 0, done: 0 });
      const p = pl.get(r.playlistId);
      p.total++;
      if (r.completed && !r.suspiciousActivity) p.done++;
    }
  }
  let plDone = 0;
  pl.forEach(p => { if (p.total > 0 && p.done >= p.total) plDone++; });
  $('total-videos').textContent = uniq.size;
  $('completed-videos').textContent = completed;
  $('total-watch-time').textContent = fmtTime(watchSec);
  $('certificates-earned').textContent = certCount;
  $('playlists-completed').textContent = plDone;
  $('completion-rate').textContent = uniq.size > 0 ? Math.round((completed / uniq.size) * 100) + '%' : '0%';
}

async function loadSettings() {
  const em = await bg({ action: 'getSettings', key: 'currentUserEmail' });
  if (em.success && em.data) {
    const u = await bg({ action: 'getUser', email: em.data });
    if (u.success && u.data) {
      $('user-name').value = u.data.name || '';
      $('user-email').value = u.data.email || '';
    }
  }
  const dm = await bg({ action: 'getSettings', key: 'darkMode' });
  if (dm.success) {
    $('dark-mode-toggle').checked = dm.data === true;
    document.body.classList.toggle('dark-mode', dm.data === true);
  }
  const nf = await bg({ action: 'getSettings', key: 'notificationsEnabled' });
  if (nf.success) $('notifications-toggle').checked = nf.data !== false;
}

async function doVerify() {
  const code = ($('verify-code-input').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 12) {
    $('verify-result').className = 'certufy-verify-result error';
    $('verify-result').style.display = 'block';
    $('verify-result').innerHTML = '<div>✘ Invalid code (must be 12 chars)</div>';
    return;
  }
  const r = await bg({ action: 'verifyCertificate', code });
  if (r.success && r.data && r.data.valid) {
    const c = r.data.certificate;
    $('verify-result').className = 'certufy-verify-result success';
    $('verify-result').style.display = 'block';
    $('verify-result').innerHTML = `<div>✔ Verified</div><div style="margin-top:6px"><strong>${c.userName}</strong><br>${c.videoTitle}<br>${c.playlistTitle ? '📚 ' + c.playlistTitle + '<br>' : ''}${fmtDate(c.generatedDate)}</div>`;
  } else {
    $('verify-result').className = 'certufy-verify-result error';
    $('verify-result').style.display = 'block';
    $('verify-result').innerHTML = `<div>✘ ${(r.data && r.data.message) || 'Not found'}</div>`;
  }
}

$('generate-cert-btn').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    await chrome.tabs.sendMessage(tab.id, { action: 'generateCertificate' });
    window.close();
  } catch (e) { toast('Could not reach YouTube tab.', 'error'); }
});
$('resume-btn').addEventListener('click', async () => {
  const r = await bg({ action: 'getResumeState' });
  if (r.success && r.data && r.data.url) { chrome.tabs.create({ url: r.data.url }); window.close(); }
});
$('save-user-btn').addEventListener('click', async () => {
  const name = $('user-name').value.trim();
  const email = $('user-email').value.trim();
  if (!name || !email.includes('@')) { toast('Enter valid name and email.', 'error'); return; }
  await bg({ action: 'saveUser', data: { name, email } });
  toast('Profile saved.', 'success');
});
$('dark-mode-toggle').addEventListener('change', async () => {
  const on = $('dark-mode-toggle').checked;
  document.body.classList.toggle('dark-mode', on);
  await bg({ action: 'setSettings', key: 'darkMode', value: on });
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) await chrome.tabs.sendMessage(tab.id, { action: 'setDarkMode', enabled: on });
  } catch (e) {}
});
$('notifications-toggle').addEventListener('change', async () => {
  await bg({ action: 'setSettings', key: 'notificationsEnabled', value: $('notifications-toggle').checked });
});
$('export-data-btn').addEventListener('click', async () => {
  const r = await bg({ action: 'exportData' });
  if (!r.success) { toast('Export failed.', 'error'); return; }
  const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `certufy-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Exported.', 'success');
});
$('import-data-btn').addEventListener('click', () => $('import-file-input').click());
$('import-file-input').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const r = await bg({ action: 'importData', data });
    toast(r.success ? 'Imported.' : 'Import failed.', r.success ? 'success' : 'error');
  } catch (err) { toast('Invalid JSON.', 'error'); }
  e.target.value = '';
});
$('clear-data-btn').addEventListener('click', async () => {
  if (!confirm('Clear ALL data? Cannot be undone.')) return;
  const r = await bg({ action: 'clearAllData' });
  toast(r.success ? 'Cleared.' : 'Failed.', r.success ? 'success' : 'error');
});
$('refresh-analytics-btn').addEventListener('click', loadAnalytics);
$('verify-btn').addEventListener('click', doVerify);
$('verify-code-input').addEventListener('keypress', e => { if (e.key === 'Enter') doVerify(); });
$('verify-code-input').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
});

(async () => {
  const dm = await bg({ action: 'getSettings', key: 'darkMode' });
  if (dm.success && dm.data === true) {
    document.body.classList.add('dark-mode');
    $('dark-mode-toggle').checked = true;
  }
  switchTab('current');
})();