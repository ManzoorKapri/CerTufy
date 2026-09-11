const $ = (id) => document.getElementById(id);
async function bg(p) { try { return await chrome.runtime.sendMessage(p) || { success: false }; } catch (e) { return { success: false, error: (e && e.message) || 'err' }; } }
function fmtDate(s) { try { return new Date(s).toLocaleDateString(); } catch (e) { return 'N/A'; } }

async function doVerify() {
  const code = ($('verify-code-input').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 12) {
    $('verify-result').className = 'certufy-verify-result error';
    $('verify-result').style.display = 'block';
    $('verify-result').innerHTML = '<div>✘ Invalid code — must be 12 characters.</div>';
    return;
  }
  const r = await bg({ action: 'verifyCertificate', code });
  if (r.success && r.data && r.data.valid) {
    const c = r.data.certificate;
    $('verify-result').className = 'certufy-verify-result success';
    $('verify-result').style.display = 'block';
    $('verify-result').innerHTML = `<div><strong>✔ Certificate Verified</strong></div><div style="margin-top:8px"><strong>Recipient:</strong> ${c.userName}<br><strong>Video:</strong> ${c.videoTitle}<br>${c.playlistTitle ? '<strong>Course:</strong> ' + c.playlistTitle + '<br>' : ''}<strong>Issued:</strong> ${fmtDate(c.generatedDate)}<br><strong>Code:</strong> ${c.verificationCode}</div>`;
    $('verify-status').textContent = '● Verified';
  } else {
    $('verify-result').className = 'certufy-verify-result error';
    $('verify-result').style.display = 'block';
    $('verify-result').innerHTML = `<div>✘ ${(r.data && r.data.message) || 'Certificate not found.'}</div>`;
    $('verify-status').textContent = '● Not Found';
  }
}
$('verify-btn').addEventListener('click', doVerify);
$('verify-code-input').addEventListener('keypress', e => { if (e.key === 'Enter') doVerify(); });
$('verify-code-input').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); });
$('back-btn').addEventListener('click', () => window.close());
(async () => {
  const code = new URLSearchParams(location.search).get('code');
  if (code) { $('verify-code-input').value = code; await doVerify(); }
})();