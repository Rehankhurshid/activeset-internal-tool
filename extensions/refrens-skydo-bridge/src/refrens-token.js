/* Runs on www.refrens.com/app/*.

   Refrens keeps its API token in sessionStorage under `__at`, which is per-tab
   and never leaves the browser. A content script shares the page's origin and
   storage, so it can read it and pass it to our service worker. The token goes
   to chrome.storage.local and nowhere else -- no remote endpoint sees it. */

function currentUrlKey() {
  // /app/<business-url-key>/...
  const m = location.pathname.match(/^\/app\/([^/]+)/);
  const slug = m && m[1];
  // /app/invoices/<id> is a share view, not a business workspace.
  return slug && !['invoices', 'login', 'signup'].includes(slug) ? slug : null;
}

let lastSent = '';

function relayToken() {
  const token = sessionStorage.getItem('__at');
  const urlKey = currentUrlKey();
  if (!token || token === lastSent) return;
  lastSent = token;
  chrome.runtime.sendMessage({ type: 'REFRENS_TOKEN', token, urlKey }, () => void chrome.runtime.lastError);
}

relayToken();
// Refrens rotates the token in the background; re-check periodically and on focus.
setInterval(relayToken, 60_000);
window.addEventListener('focus', relayToken);
