const $ = (id) => document.getElementById(id);
const KEYS = ['appId', 'appSecret', 'refrensUrlKey', 'preferHostedPdf', 'sessionToken'];

chrome.storage.local.get(KEYS, (s) => {
  $('appId').value = s.appId || '';
  $('appSecret').value = s.appSecret || '';
  $('urlKey').value = s.refrensUrlKey || '';
  $('preferHostedPdf').checked = !!s.preferHostedPdf;
  $('sess').textContent = s.sessionToken
    ? 'session token captured from a Refrens tab'
    : 'no session token — open Refrens in a tab, or use API keys above';
});

$('save').onclick = () => {
  chrome.storage.local.set({
    appId: $('appId').value.trim(),
    appSecret: $('appSecret').value.trim(),
    refrensUrlKey: $('urlKey').value.trim(),
    apiToken: null,        // force a fresh exchange with the new keys
    apiTokenExp: 0
  }, () => {
    $('saved').textContent = 'Saved';
    setTimeout(() => ($('saved').textContent = ''), 2000);
  });
};

$('preferHostedPdf').onchange = () =>
  chrome.storage.local.set({ preferHostedPdf: $('preferHostedPdf').checked });

$('clear').onclick = () =>
  chrome.storage.local.remove(['sessionToken', 'sessionTokenExp', 'apiToken', 'apiTokenExp'], () => location.reload());
