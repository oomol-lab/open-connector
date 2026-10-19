import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";

/** Render only escaped client metadata; the browser posts the opaque consent handle. */
export function renderMcpConsentPage(details: ConsentDescription, handle: string): string {
  const publisher = details.clientDomain
    ? `Client domain: <strong>${escapeHtml(details.clientDomain)}</strong>`
    : "This client's name is self-reported and has not been verified.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize OpenConnector</title>
<style>body{font:16px/1.6 system-ui,sans-serif;background:#f7f7f5;color:#242424;margin:0;padding:32px 20px}main{max-width:520px;margin:40px auto;padding:32px;background:white;border:1px solid #ddd;border-radius:16px}h1{font-size:25px;line-height:1.3}input,button{box-sizing:border-box;font:inherit;padding:12px;border:1px solid #aaa;border-radius:8px}input{width:100%;margin:8px 0 20px}button{cursor:pointer;background:#222;color:white}button[value=deny]{background:white;color:#222;margin-left:12px}small{display:block;color:#555}strong{overflow-wrap:anywhere}</style></head>
<body><main><small>OPENCONNECTOR</small><h1>Allow ${escapeHtml(details.clientName)} to use your gateway?</h1>
<p>${publisher}</p><p>Authorization returns to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? "<p>This sends access to an app on your computer. Continue only if you started this connection.</p>" : ""}
<p>This grants access to discover and run Actions using your connected accounts, including write Actions. Your gateway's policies still apply. It does not grant access to administrator settings, raw proxies, or triggers.</p>
<p>A separate API Key will appear in your console. Delete it there to revoke this connection.</p>
<p>Access can be refreshed for up to 30 days without asking again.</p>
<form method="post" action="/oauth/mcp/authorize"><input type="hidden" name="handle" value="${escapeHtml(handle)}">
<label for="admin-token">Administrator token</label><input id="admin-token" type="password" name="admin_token" autocomplete="off" required maxlength="1024">
<small>Your administrator token stays with OpenConnector and is never sent to the client.</small>
<p><button name="decision" value="approve">Allow access</button><button name="decision" value="deny" formnovalidate>Deny</button></p></form></main></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}
