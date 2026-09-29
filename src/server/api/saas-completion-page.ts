/** The initial GET contains no account data and performs no authorization synchronization. */
export function renderSaasCompletionPage(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Complete connection</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:32rem;margin:12vh auto;padding:1.5rem;color:#172033}button,a{font:inherit}button{padding:.5rem 1rem;cursor:pointer}a{color:#2455ad}</style></head>
<body><h1>Complete your connection</h1><p id="status">Checking your Console session…</p>
<p><a href="/" target="_blank" rel="noopener">Open Console to sign in</a></p><button id="retry" type="button">Check again</button>
<script>
const status = document.getElementById('status');
const button = document.getElementById('retry');
const request = new URL(location.href).searchParams.get('request');
let timer;
let busy = false;
let failures = 0;
async function sync() {
  if (busy) return;
  clearTimeout(timer);
  if (!request) { status.textContent = 'The authorization request is missing.'; return; }
  busy = true;
  button.disabled = true;
  try {
    const session = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
    if (!session.ok || !(await session.json()).authenticated) {
      status.textContent = 'Return to the client that started authorization, or sign in to Console and check again.';
      return;
    }
    const response = await fetch('/api/oauth/connection-requests/' + encodeURIComponent(request) + '/sync', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-OpenConnector-Request': 'sync' }, body: '{}'
    });
    if (!response.ok) {
      if ([401, 403, 404].includes(response.status)) { status.textContent = 'Sign in to Console to check this request, or return to the initiating client.'; return; }
      status.textContent = 'The connection could not be checked yet. Retrying…';
      const retry = response.headers.get('Retry-After');
      const retryMs = retry ? (/^\\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 0;
      timer = setTimeout(sync, Math.max(2000, Math.min(30000, 2000 * 2 ** Math.min(failures++, 4)), Number.isFinite(retryMs) ? retryMs : 0));
      return;
    }
    failures = 0;
    const result = await response.json();
    if (result.request.status === 'connected') {
      status.textContent = 'Connection complete. You can return to the initiating client.';
      const message = { type: 'oauth.completed', service: result.request.service };
      if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('oomol-connect-oauth'); channel.postMessage(message); channel.close(); }
      if (window.opener) window.opener.postMessage(message, location.origin);
      if (result.returnUri) location.assign(result.returnUri);
      return;
    }
    if (result.request.status === 'failed') {
      status.textContent = result.request.errorMessage || 'Authorization could not be completed. Return to the initiating client.';
      if (result.returnUri) location.assign(result.returnUri);
      return;
    }
    status.textContent = 'Waiting for authorization to be confirmed…';
    timer = setTimeout(sync, 2000);
  } catch {
    status.textContent = 'The connection could not be checked. Check again when the service is available.';
  } finally { busy = false; button.disabled = false; }
}
button.addEventListener('click', sync);
sync();
</script></body></html>`;
}
