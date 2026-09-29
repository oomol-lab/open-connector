import { oauthCompletionStrings, oauthCompletionStyles, oauthCompletionLocaleScript } from "./oauth-completion-page.ts";

/** The initial GET contains no account data and performs no authorization synchronization. */
export function renderSaasCompletionPage(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Complete connection</title>
<style>${oauthCompletionStyles}</style></head>
<body><main class="card" aria-live="polite">
<div class="header"><span id="badge" class="badge" hidden></span>
<h1 id="title">Completing connection</h1><p id="status" role="status">Checking your Console session…</p></div>
<div class="actions"><a id="login" class="button" href="/" target="_blank" rel="noopener" hidden>Open Console to sign in</a>
<button id="retry" class="button" type="button">Check again</button>
<button id="close" class="button" type="button" hidden>Close window</button>
<p id="note" class="close-note" hidden></p></div></main>
<script>
const STR = ${JSON.stringify(oauthCompletionStrings).replaceAll("<", "\\u003c")};
${oauthCompletionLocaleScript}
const language = pick();
const t = STR[language] || STR.en;
document.documentElement.lang = language;
document.title = t.checkingTitle;
const title = document.getElementById('title');
const status = document.getElementById('status');
const login = document.getElementById('login');
const close = document.getElementById('close');
const badge = document.getElementById('badge');
const note = document.getElementById('note');
title.textContent = t.checkingTitle;
status.textContent = t.checking;
login.textContent = t.signIn;
close.textContent = t.closeButton;
const tryClose = () => { window.close(); note.textContent = t.manualClose; };
close.addEventListener('click', tryClose);
const button = document.getElementById('retry');
button.textContent = t.retry;
const request = new URL(location.href).searchParams.get('request');
let timer;
let busy = false;
let terminal = false;
let failures = 0;
async function sync() {
  if (busy || terminal) return;
  clearTimeout(timer);
  if (!request) { status.textContent = t.missing; button.hidden = true; return; }
  busy = true;
  button.disabled = true;
  try {
    const session = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
    if (!session.ok || !(await session.json()).authenticated) {
      status.textContent = t.login; login.hidden = false;
      return;
    }
    login.hidden = true;
    const response = await fetch('/api/oauth/connection-requests/' + encodeURIComponent(request) + '/sync', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-OpenConnector-Request': 'sync' }, body: '{}'
    });
    if (!response.ok) {
      if ([401, 403, 404].includes(response.status)) { status.textContent = response.status === 401 ? t.login : response.status === 403 ? t.forbidden : t.notFound; login.hidden = response.status !== 401; return; }
      status.textContent = t.retrying;
      const retry = response.headers.get('Retry-After');
      const retryMs = retry ? (/^\\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 0;
      timer = setTimeout(sync, Math.max(2000, Math.min(30000, 2000 * 2 ** Math.min(failures++, 4)), Number.isFinite(retryMs) ? retryMs : 0));
      return;
    }
    failures = 0;
    const result = await response.json();
    if (result.request.status === 'connected') {
      terminal = true;
      document.title = title.textContent = t.title;
      status.textContent = t.body;
      badge.textContent = t.badge;
      badge.hidden = false;
      button.hidden = true;
      login.hidden = true;
      close.hidden = false;
      const message = { type: 'oauth.completed', service: result.request.service };
      if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('oomol-connect-oauth'); channel.postMessage(message); channel.close(); }
      if (window.opener) window.opener.postMessage(message, location.origin);
      if (result.returnUri) { location.assign(result.returnUri); return; }
      note.hidden = false;
      note.textContent = t.autoClose.replace('%N%', '2');
      setTimeout(tryClose, 2000);
      return;
    }
    if (result.request.status === 'failed' || result.request.status === 'expired') {
      terminal = true;
      status.textContent = result.request.status === 'expired' ? t.notFound : t.failed;
      button.hidden = true;
      close.hidden = false;
      if (result.returnUri) location.assign(result.returnUri);
      return;
    }
    status.textContent = t.waiting;
    timer = setTimeout(sync, 2000);
  } catch {
    status.textContent = t.network;
  } finally { busy = false; button.disabled = false; }
}
button.addEventListener('click', sync);
sync();
</script></body></html>`;
}
