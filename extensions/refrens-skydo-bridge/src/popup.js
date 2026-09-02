const $ = (id) => document.getElementById(id);

chrome.runtime.sendMessage({ type: 'STATUS' }, (res) => {
  const s = (res && res.data) || {};
  $('dot').className = `dot ${s.connected ? 'on' : 'off'}`;
  $('status').textContent = s.connected ? 'Refrens connected' : 'Refrens not connected';
  $('detail').textContent = s.connected
    ? `${s.urlKey || 'business'} · via ${s.hasApiKeys ? 'API keys' : 'an open Refrens tab'}`
    : 'Add API keys in settings, or open your Refrens dashboard in a tab.';
});

$('connect').onclick = () => chrome.runtime.sendMessage({ type: 'OPEN_REFRENS' }, () => window.close());
$('options').onclick = () => chrome.runtime.openOptionsPage();
