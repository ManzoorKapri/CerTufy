const $ = (id) => document.getElementById(id);

async function bg(payload) {
  try { return await chrome.runtime.sendMessage(payload) || { success: false }; }
  catch (e) { return { success: false, error: (e && e.message) || 'err' }; }
}
function toast(text, kind) {
  const old = document.querySelector('.certufy-cert-toast'); if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'certufy-cert-toast';
  el.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:12px 22px;border-radius:8px;font-size:14px;z-index:1000';
  if (kind === 'success') el.style.background = '#4CAF50';
  if (kind === 'error') el.style.background = '#f44336';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
function fmtDate(s) { try { return new Date(s).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}); } catch (e) { return 'N/A'; } }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

let currentCert = null;

function renderCertHTML(c) {
  const tpl = (c.template || 'Classic').toLowerCase();
  const isClassic = tpl === 'classic';
  return `
    <div class="certufy-certificate ${tpl}">
      ${isClassic ? '<div class="certufy-cert-seal">★</div>' : ''}
      <div class="certufy-cert-title">CERTIFICATE OF COMPLETION</div>
      <div class="certufy-cert-subtitle">This certifies that</div>
      <div class="certufy-cert-name">${esc(c.userName)}</div>
      <div class="certufy-cert-divider"></div>
      <div class="certufy-cert-details">has successfully completed the ${c.playlistTitle ? 'course' : 'video'}<br><strong>${esc(c.videoTitle)}</strong>${c.playlistTitle ? '<br>Course: ' + esc(c.playlistTitle) : ''}</div>
      <div class="certufy-cert-details">Date: ${fmtDate(c.generatedDate)}</div>
      <div class="certufy-cert-code">Verification Code: ${c.verificationCode}</div>
      <div class="certufy-cert-footer-text">● CerTufy — Verifiable Certificates ●</div>
    </div>
  `;
}

function showDisplay(cert) {
  currentCert = cert;
  $('cert-form-view').style.display = 'none';
  $('cert-display-view').style.display = 'block';
  $('cert-display-wrapper').innerHTML = renderCertHTML(cert);
  $('cert-status').textContent = '● Viewing Certificate';
}
function showForm() {
  $('cert-form-view').style.display = 'block';
  $('cert-display-view').style.display = 'none';
  $('cert-status').textContent = '● Ready';
}

async function generate() {
  const name = $('cert-name').value.trim();
  const email = $('cert-email').value.trim();
  const template = $('cert-template').value;
  $('cert-form-error').textContent = '';
  if (!name) { $('cert-form-error').textContent = '✘ Name required'; return; }
  if (!email || !email.includes('@')) { $('cert-form-error').textContent = '✘ Valid email required'; return; }

  const pending = await chrome.storage.local.get('pendingCertificateData');
  const p = pending.pendingCertificateData;
  if (!p || !p.videoId) {
    $('cert-form-error').textContent = '✘ No video data. Watch a video first.';
    return;
  }

  $('generate-cert-submit').disabled = true;
  $('generate-cert-submit').textContent = '⏳ Generating...';

  const r = await bg({
    action: 'generateCertificate',
    data: {
      videoId: p.videoId,
      playlistId: p.playlistId,
      videoTitle: p.videoTitle,
      playlistTitle: p.playlistTitle,
      userName: name,
      userEmail: email,
      template
    }
  });

  $('generate-cert-submit').disabled = false;
  $('generate-cert-submit').textContent = '🎓 Generate';

  if (r.success && r.data) {
    await chrome.storage.local.remove('pendingCertificateData');
    showDisplay(r.data);
    toast('Certificate generated!', 'success');
  } else {
    $('cert-form-error').textContent = '✘ ' + (r.error || 'Generation failed');
    toast(r.error || 'Failed', 'error');
  }
}

async function loadById(id) {
  const r = await bg({ action: 'getCertificate', id: parseInt(id, 10) });
  if (r.success && r.data) showDisplay(r.data);
  else { toast('Not found', 'error'); showForm(); }
}

function downloadHTML() {
  if (!currentCert) return;
  const styleUrl = document.querySelector('link[rel="stylesheet"]')?.href || '';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Certificate - ${esc(currentCert.userName)}</title><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="${styleUrl}"></head><body style="display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5;margin:0;padding:20px">${renderCertHTML(currentCert)}</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `certificate-${currentCert.verificationCode}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Downloaded!', 'success');
}

function shareCert() {
  if (!currentCert) return;
  const url = chrome.runtime.getURL('verify/verify.html?code=' + currentCert.verificationCode);
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Link copied!', 'success')).catch(() => fallbackCopy(url));
  else fallbackCopy(url);
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Link copied!', 'success'); } catch (e) { toast('Copy failed', 'error'); }
  document.body.removeChild(ta);
}

$('generate-cert-submit').addEventListener('click', generate);
$('cancel-btn').addEventListener('click', () => window.close());
$('back-btn').addEventListener('click', () => { if ($('cert-display-view').style.display !== 'none') showForm(); else window.close(); });
$('download-html-btn').addEventListener('click', downloadHTML);
$('print-pdf-btn').addEventListener('click', () => window.print());
$('share-btn').addEventListener('click', shareCert);

(async () => {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (id) { await loadById(id); return; }

  const p = await chrome.storage.local.get('pendingCertificateData');
  const d = p.pendingCertificateData;
  if (d) {
    $('cert-name').value = d.userName || '';
    $('cert-email').value = d.userEmail || '';
    if (d.template) $('cert-template').value = d.template;
    $('cert-status').textContent = '● Ready — ' + (d.videoTitle || 'video');
  } else {
    $('cert-status').textContent = '● No pending data';
    $('cert-form-error').textContent = 'Watch a video first, then click Generate.';
    $('generate-cert-submit').disabled = true;
  }
})();