import { escapeHtml } from "./http-utils.ts";

const oauthCompletionChannelName = "oomol-connect-oauth";
const oauthCompletedType = "oauth.completed";

// Client-side translations. English is also the server-rendered default in the
// markup below, so the page stays meaningful without JavaScript. `bodyBefore`
// and `bodyAfter` wrap the (already-escaped) service <code> element, which the
// script never rewrites, so no service value is ever injected as HTML.
const oauthCompletionStrings = {
  en: {
    badge: "Connected",
    title: "Connection ready",
    bodyBefore: "OAuth finished for ",
    bodyAfter: ". Return to OOMOL Connect to continue.",
    closeButton: "Close window",
    autoClose: "Automatically closing in %N% seconds.",
    manualClose: "You can now close this window.",
  },
  "zh-CN": {
    badge: "已连接",
    title: "连接已就绪",
    bodyBefore: "已完成 ",
    bodyAfter: " 的授权，返回 OOMOL Connect 继续。",
    closeButton: "关闭窗口",
    autoClose: "%N% 秒后自动关闭。",
    manualClose: "现在可以手动关闭此窗口。",
  },
  "zh-TW": {
    badge: "已連接",
    title: "連線已就緒",
    bodyBefore: "已完成 ",
    bodyAfter: " 的授權，返回 OOMOL Connect 繼續。",
    closeButton: "關閉視窗",
    autoClose: "%N% 秒後自動關閉。",
    manualClose: "現在可以手動關閉此視窗。",
  },
  ja: {
    badge: "接続済み",
    title: "接続の準備が完了しました",
    bodyBefore: "",
    bodyAfter: " の認証が完了しました。OOMOL Connect に戻って続行してください。",
    closeButton: "ウィンドウを閉じる",
    autoClose: "%N% 秒後に自動的に閉じます。",
    manualClose: "このウィンドウを閉じても問題ありません。",
  },
};

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
    <span class="badge" data-t="badge">Connected</span>
    <h1 data-t="title">Connection ready</h1>
    <p><span data-t="bodyBefore">OAuth finished for </span><code>${escapedService}</code><span data-t="bodyAfter">. Return to OOMOL Connect to continue.</span></p>
  </div>
  <div class="actions">
    <button class="button" type="button" data-t="closeButton">Close window</button>
    <p class="close-note" data-close-note>Automatically closing in 5 seconds.</p>
  </div>
</main>
<script>(()=>{
const STR=${scriptJson(oauthCompletionStrings)};
if("BroadcastChannel" in window){const channel=new BroadcastChannel(${scriptJson(oauthCompletionChannelName)});channel.postMessage(${payload});channel.close();}
const pick=()=>{const langs=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||"en"];for(const raw of langs){const l=String(raw).toLowerCase();if(l.startsWith("zh"))return (l.includes("tw")||l.includes("hk")||l.includes("hant"))?"zh-TW":"zh-CN";const primary=l.split("-")[0];if(STR[raw])return raw;if(STR[primary])return primary;}return "en";};
const t=STR[pick()]||STR.en;
document.documentElement.lang=pick();
for(const el of document.querySelectorAll("[data-t]")){const key=el.getAttribute("data-t");if(t[key]!=null)el.textContent=t[key];}
if(t.title)document.title=t.title;
const note=document.querySelector("[data-close-note]");
const button=document.querySelector("[data-t=closeButton]");
const showManual=()=>{if(note)note.textContent=t.manualClose;};
// window.close() only works for script-opened windows; on a tab the user
// navigated to it is a no-op. Attempt it, then fall back to a manual hint.
const tryClose=()=>{window.close();setTimeout(showManual,300);};
if(button)button.addEventListener("click",tryClose);
let remaining=5;
const tick=()=>{if(remaining<=0){tryClose();return;}if(note)note.textContent=t.autoClose.replace("%N%",String(remaining));remaining-=1;setTimeout(tick,1000);};
tick();
})();</script>
</body>
</html>`;
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
