const $ = (id) => document.getElementById(id);

function refresh() {
  chrome.runtime.sendMessage({ type: 'STATUS' }, (res) => {
    const s = (res && res.data) || {};
    $('dot').className = `dot ${s.connected ? 'on' : 'off'}`;
    $('status').textContent = s.connected ? 'Paired' : 'Not paired';
    $('detail').textContent = s.connected
      ? `${s.pairedAs || 'this browser'} · ${s.apiBase.replace(/^https?:\/\//, '')}` +
        (s.pairedAt ? ` · since ${new Date(s.pairedAt).toLocaleDateString()}` : '')
      : 'Pair from Internal Tools on app.activeset.co.';
    $('unpair').disabled = !s.connected;
  });
}

chrome.storage.local.get('preferHostedPdf', (s) => {
  $('preferHostedPdf').checked = !!s.preferHostedPdf;
});
$('preferHostedPdf').onchange = () =>
  chrome.storage.local.set({ preferHostedPdf: $('preferHostedPdf').checked });

$('open').onclick = () => chrome.runtime.sendMessage({ type: 'OPEN_TOOLS' });
$('unpair').onclick = () => chrome.runtime.sendMessage({ type: 'UNPAIR' }, refresh);

refresh();
