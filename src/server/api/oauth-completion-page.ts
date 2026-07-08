import { escapeHtml } from "./http-utils.ts";

const oauthCompletionChannelName = "oomol-connect-oauth";
const oauthCompletedType = "oauth.completed";

export function renderOAuthCompletionPage(service: string): string {
  const payload = scriptJson({
    type: oauthCompletedType,
    service,
  });
  const escapedService = escapeHtml(service);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connected ${escapedService}</title>
<style>
:root {
  --background: hsl(0 0% 100%);
  --foreground: hsl(222.2 84% 4.9%);
  --card: hsl(0 0% 100%);
  --card-foreground: hsl(222.2 84% 4.9%);
  --muted: hsl(210 40% 96.1%);
  --muted-foreground: hsl(215.4 16.3% 46.9%);
  --border: hsl(214.3 31.8% 91.4%);
  --primary: hsl(222.2 47.4% 11.2%);
  --primary-foreground: hsl(210 40% 98%);
  --ring: hsl(222.2 84% 4.9%);
}
* {
  box-sizing: border-box;
}
body {
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--background);
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.card {
  width: min(100%, 420px);
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card);
  color: var(--card-foreground);
  box-shadow: 0 1px 2px hsl(222.2 84% 4.9% / 0.04), 0 12px 32px hsl(222.2 84% 4.9% / 0.08);
}
.header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.badge {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 2px 10px;
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}
h1 {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
}
p {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 14px;
  line-height: 22px;
}
code {
  border-radius: 6px;
  background: var(--muted);
  padding: 2px 6px;
  color: var(--foreground);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
}
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
}
.button {
  appearance: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--foreground);
  padding: 8px 14px;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  cursor: pointer;
}
.button:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
.button:hover {
  background: var(--muted);
}
.close-note {
  font-size: 12px;
  line-height: 18px;
}
</style>
</head>
<body>
<main class="card" role="status" aria-live="polite">
  <div class="header">
    <span class="badge">Connected</span>
    <h1>Connection ready</h1>
    <p>OAuth finished for <code>${escapedService}</code>. Return to OOMOL Connect to continue.</p>
  </div>
  <div class="actions">
    <button class="button" type="button" onclick="window.close()">Close window</button>
    <p class="close-note">Automatically closing in 5 seconds.</p>
  </div>
</main>
<script>(()=>{if("BroadcastChannel" in window){const channel=new BroadcastChannel(${scriptJson(oauthCompletionChannelName)});channel.postMessage(${payload});channel.close();}setTimeout(()=>window.close(),5000);})();</script>
</body>
</html>`;
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
