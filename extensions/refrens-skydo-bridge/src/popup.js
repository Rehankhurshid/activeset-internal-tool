const $ = (id) => document.getElementById(id);

chrome.runtime.sendMessage({ type: 'STATUS' }, (res) => {
  const s = (res && res.data) || {};
  $('dot').className = `dot ${s.connected ? 'on' : 'off'}`;
  $('status').textContent = s.connected ? 'Paired' : 'Not paired';
  $('detail').textContent = s.connected
    ? `${s.pairedAs || 'this browser'} · via ${s.apiBase.replace(/^https?:\/\//, '')}`
    : 'Open Internal Tools on app.activeset.co to pair this browser.';
});

$('connect').onclick = () => chrome.runtime.sendMessage({ type: 'OPEN_TOOLS' }, () => window.close());
$('options').onclick = () => chrome.runtime.openOptionsPage();
