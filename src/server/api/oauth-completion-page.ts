const oauthCompletionChannelName = "oomol-connect-oauth";
const oauthCompletedType = "oauth.completed";

// Client-side translations. English is also the server-rendered default in the
// markup below, so the page stays meaningful without JavaScript. The copy stays
// host-neutral because this runtime can be embedded by more than one product.
export const oauthCompletionStrings = {
  "en": {
    badge: "Connected",
    title: "Connection complete",
    body: "Close this window to continue where you started.",
    closeButton: "Close window",
    autoClose: "Automatically closing in %N% seconds.",
    manualClose: "You can now close this window.",
    checkingTitle: "Completing connection",
    checking: "Checking your Console session…",
    signIn: "Open Console to sign in",
    login:
      "Sign in to Console, then check again. Use the same browser and Console address where you started authorization.",
    retry: "Check again",
    missing: "The authorization request is missing. Return to the initiating client.",
    retrying: "The connection could not be checked yet. Retrying…",
    waiting: "Waiting for authorization to be confirmed…",
    failed: "Authorization could not be completed. Return to the initiating client.",
    network: "Could not reach Connect. Check your connection and try again.",
    notFound: "This request was not found or has expired. Return to the initiating client.",
    forbidden: "Synchronization was rejected. Check that OOMOL_CONNECT_ORIGIN matches your Console address.",
    refusedBadge: "Not connected",
    cancelledTitle: "Authorization cancelled",
    refusedTitle: "Authorization not completed",
    refusedBody: "Nothing was connected. Close this window to return where you started.",
  },
  "zh-CN": {
    badge: "已连接",
    title: "连接完成",
    body: "连接已就绪，可以返回刚才的应用继续使用。",
    closeButton: "关闭窗口",
    autoClose: "%N% 秒后自动关闭。",
    manualClose: "现在可以手动关闭此窗口。",
    checkingTitle: "正在完成连接",
    checking: "正在检查控制台登录状态…",
    signIn: "打开控制台登录",
    login: "请登录控制台后重新检查，使用发起授权时的浏览器和控制台地址。",
    retry: "重新检查",
    missing: "缺少授权请求信息，请返回发起授权的应用。",
    retrying: "暂时无法确认连接，正在重试…",
    waiting: "正在等待授权结果确认…",
    failed: "授权未能完成，请返回发起授权的应用查看。",
    network: "无法连接到 Connect，请检查网络后重试。",
    notFound: "授权请求不存在或已过期，请返回发起授权的应用。",
    forbidden: "同步请求被拒绝，请检查 OOMOL_CONNECT_ORIGIN 是否与控制台地址一致。",
    refusedBadge: "未连接",
    cancelledTitle: "已取消授权",
    refusedTitle: "授权未完成",
    refusedBody: "未建立任何连接。关闭此窗口即可返回刚才的应用。",
  },
  "zh-TW": {
    badge: "已連線",
    title: "連線完成",
    body: "連線已就緒，可以返回剛才的應用繼續使用。",
    closeButton: "關閉視窗",
    autoClose: "%N% 秒後自動關閉。",
    manualClose: "現在可以手動關閉此視窗。",
    checkingTitle: "正在完成連線",
    checking: "正在檢查控制台登入狀態…",
    signIn: "開啟控制台登入",
    login: "請登入控制台後重新檢查，使用發起授權時的瀏覽器和控制台位址。",
    retry: "重新檢查",
    missing: "缺少授權請求資訊，請返回發起授權的應用。",
    retrying: "暫時無法確認連線，正在重試…",
    waiting: "正在等待授權結果確認…",
    failed: "授權未能完成，請返回發起授權的應用查看。",
    network: "無法連線至 Connect，請檢查網路後重試。",
    notFound: "授權請求不存在或已過期，請返回發起授權的應用。",
    forbidden: "同步請求遭拒，請檢查 OOMOL_CONNECT_ORIGIN 是否與控制台位址一致。",
    refusedBadge: "未連線",
    cancelledTitle: "已取消授權",
    refusedTitle: "授權未完成",
    refusedBody: "未建立任何連線。關閉此視窗即可返回剛才的應用。",
  },
  "ja": {
    badge: "接続済み",
    title: "接続が完了しました",
    body: "元のアプリに戻って続行できます。",
    closeButton: "ウィンドウを閉じる",
    autoClose: "%N% 秒後に自動的に閉じます。",
    manualClose: "このウィンドウを閉じても問題ありません。",
    checkingTitle: "接続を完了しています",
    checking: "コンソールのログイン状態を確認しています…",
    signIn: "コンソールにログイン",
    login: "認可を開始したブラウザーとコンソールのアドレスでログインし、再確認してください。",
    retry: "再確認",
    missing: "認可リクエストがありません。元のアプリに戻ってください。",
    retrying: "接続を確認できません。再試行しています…",
    waiting: "認可結果を確認しています…",
    failed: "認可を完了できませんでした。元のアプリで確認してください。",
    network: "Connect に接続できません。ネットワークを確認して再試行してください。",
    notFound: "リクエストが見つからないか期限切れです。元のアプリに戻ってください。",
    forbidden: "同期が拒否されました。OOMOL_CONNECT_ORIGIN とコンソールのアドレスを確認してください。",
    refusedBadge: "未接続",
    cancelledTitle: "認可をキャンセルしました",
    refusedTitle: "認可は完了しませんでした",
    refusedBody: "接続は作成されていません。このウィンドウを閉じて元のアプリに戻ってください。",
  },
  "fr": {
    badge: "Connecté",
    title: "Connexion terminée",
    body: "Vous pouvez revenir à l’application de départ.",
    closeButton: "Fermer la fenêtre",
    autoClose: "Fermeture automatique dans %N% secondes.",
    manualClose: "Vous pouvez fermer cette fenêtre.",
    checkingTitle: "Finalisation de la connexion",
    checking: "Vérification de la session Console…",
    signIn: "Se connecter à la Console",
    login: "Connectez-vous à la Console avec le navigateur et l’adresse utilisés au départ, puis réessayez.",
    retry: "Vérifier à nouveau",
    missing: "La demande d’autorisation est absente. Revenez à l’application de départ.",
    retrying: "Vérification impossible pour le moment. Nouvelle tentative…",
    waiting: "En attente de confirmation de l’autorisation…",
    failed: "L’autorisation a échoué. Consultez l’application de départ.",
    network: "Connect est inaccessible. Vérifiez votre connexion et réessayez.",
    notFound: "Cette demande est introuvable ou expirée. Revenez à l’application de départ.",
    forbidden: "Synchronisation refusée. Vérifiez que OOMOL_CONNECT_ORIGIN correspond à l’adresse de la Console.",
    refusedBadge: "Non connecté",
    cancelledTitle: "Autorisation annulée",
    refusedTitle: "Autorisation non terminée",
    refusedBody: "Aucune connexion n’a été créée. Fermez cette fenêtre pour revenir à l’application de départ.",
  },
  "ru": {
    badge: "Подключено",
    title: "Подключение завершено",
    body: "Можно вернуться в исходное приложение.",
    closeButton: "Закрыть окно",
    autoClose: "Автоматическое закрытие через %N% сек.",
    manualClose: "Теперь можно закрыть это окно.",
    checkingTitle: "Завершение подключения",
    checking: "Проверка сеанса консоли…",
    signIn: "Войти в консоль",
    login:
      "Войдите в консоль в том же браузере и по тому же адресу, где началась авторизация, затем повторите проверку.",
    retry: "Проверить снова",
    missing: "Запрос авторизации отсутствует. Вернитесь в исходное приложение.",
    retrying: "Пока не удалось проверить подключение. Повторяем…",
    waiting: "Ожидание подтверждения авторизации…",
    failed: "Не удалось завершить авторизацию. Проверьте исходное приложение.",
    network: "Нет связи с Connect. Проверьте сеть и повторите попытку.",
    notFound: "Запрос не найден или истёк. Вернитесь в исходное приложение.",
    forbidden: "Синхронизация отклонена. Проверьте соответствие OOMOL_CONNECT_ORIGIN адресу консоли.",
    refusedBadge: "Не подключено",
    cancelledTitle: "Авторизация отменена",
    refusedTitle: "Авторизация не завершена",
    refusedBody: "Подключение не создано. Закройте это окно, чтобы вернуться в исходное приложение.",
  },
};

export const oauthCompletionStyles = `
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

[hidden]{display:none!important}
.button:disabled{opacity:.5;cursor:wait}
a.button{text-decoration:none}
.actions{justify-content:flex-start}
`;

export const oauthCompletionLocaleScript = `const pick=()=>{try{const stored=localStorage.getItem("oomol-connect.lang");if(Object.hasOwn(STR,stored))return stored;}catch{}const langs=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||"en"];for(const raw of langs){const l=String(raw).toLowerCase();if(l.startsWith("zh"))return (!l.includes("hans")&&(l.includes("tw")||l.includes("hk")||l.includes("mo")||l.includes("hant")))?"zh-TW":"zh-CN";const primary=l.split("-")[0];if(STR[raw])return raw;if(STR[primary])return primary;}return "en";};`;

/** Seconds the OAuth completion page counts down before it tries to close its window. */
export const DEFAULT_OAUTH_CLOSE_DELAY_SECONDS = 5;

// Shared by every page this module renders: count down, then close the window,
// or say it can be closed when the browser refuses.
function oauthCloseWindowScript(closeDelaySeconds: number): string {
  return `const note=document.querySelector("[data-close-note]");
const button=document.querySelector("[data-t=closeButton]");
const showManual=()=>{if(note)note.textContent=t.manualClose;};
// window.close() only works for script-opened windows; on a tab the user
// navigated to it is a no-op. Attempt it, then fall back to a manual hint.
const tryClose=()=>{window.close();setTimeout(showManual,300);};
if(button)button.addEventListener("click",tryClose);
let remaining=${scriptJson(closeDelaySeconds)};
const tick=()=>{if(remaining<=0){tryClose();return;}if(note)note.textContent=t.autoClose.replace("%N%",String(remaining));remaining-=1;setTimeout(tick,1000);};
tick();`;
}

export function renderOAuthCompletionPage(
  service: string,
  closeDelaySeconds: number = DEFAULT_OAUTH_CLOSE_DELAY_SECONDS,
): string {
  const payload = scriptJson({
    type: oauthCompletedType,
    service,
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connection complete</title>
<style>${oauthCompletionStyles}</style>
</head>
<body>
<main class="card" role="status" aria-live="polite">
  <div class="header">
    <span class="badge" data-t="badge">Connected</span>
    <h1 data-t="title">Connection complete</h1>
    <p data-t="body">Close this window to continue where you started.</p>
  </div>
  <div class="actions">
    <button class="button" type="button" data-t="closeButton">Close window</button>
    <p class="close-note" data-close-note>Automatically closing in ${closeDelaySeconds} seconds.</p>
  </div>
</main>
<script>(()=>{
const STR=${scriptJson(oauthCompletionStrings)};
if("BroadcastChannel" in window){const channel=new BroadcastChannel(${scriptJson(oauthCompletionChannelName)});channel.postMessage(${payload});channel.close();}
${oauthCompletionLocaleScript}
const t=STR[pick()]||STR.en;
document.documentElement.lang=pick();
for(const el of document.querySelectorAll("[data-t]")){const key=el.getAttribute("data-t");if(t[key]!=null)el.textContent=t[key];}
if(t.title)document.title=t.title;
${oauthCloseWindowScript(closeDelaySeconds)}
})();</script>
</body>
</html>`;
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

/** The `type` of the message a refusal page posts to the window that opened it. */
export const oauthRefusedType = "oauth.refused";

/**
 * Reads the origins a refusal page may post its result to: a comma-separated
 * list of exact HTTP(S) origins. `*` and anything that is not an origin are
 * rejected, so the result can never be broadcast to an arbitrary opener.
 */
export function parseOAuthResultOrigins(value: string | undefined): string[] {
  return normalizeOAuthResultOrigins((value ?? "").split(","));
}

/**
 * The same rules for origins given as a list, such as the `oauthResultOrigins`
 * runtime option: blank entries are skipped and duplicates dropped; anything
 * that is not an exact http(s) origin, `*` included, throws.
 */
export function normalizeOAuthResultOrigins(entries: readonly string[]): string[] {
  const origins: string[] = [];
  for (const raw of entries) {
    const entry = raw.trim().replace(/\/+$/, "");
    if (!entry) continue;
    let origin: string | undefined;
    try {
      const url = new URL(entry);
      if (url.protocol === "http:" || url.protocol === "https:") origin = url.origin;
    } catch {
      origin = undefined;
    }
    if (origin !== entry) {
      throw new Error(
        `OAuth result origin "${entry}" must be an exact http(s) origin such as https://console.example.com.`,
      );
    }
    if (!origins.includes(origin)) origins.push(origin);
  }
  return origins;
}

/** A provider error code that is safe to echo: short and code-shaped, else `provider_error`. */
export function oauthProviderErrorCode(providerError: string): string {
  return /^[A-Za-z0-9_.-]{1,64}$/.test(providerError) ? providerError : "provider_error";
}

export interface OAuthRefusedPageInput {
  /** The provider's error code, already passed through `oauthProviderErrorCode`. */
  code: string;
  /** The state of the refused authorization; set only when this callback ended a pending one. */
  state?: string;
  /** Origins allowed to receive the result; empty means the page posts nothing. */
  resultOrigins: readonly string[];
  closeDelaySeconds?: number;
}

/**
 * The page a provider's refusal lands on when the authorization has no return
 * address. When this window was opened by a page on an allowed origin, it
 * posts `{ type: "oauth.refused", status, code, state }` to that origin only;
 * either way the shared countdown closes it after `closeDelaySeconds`. Success is never
 * reported this way: the opener learns it from its own server.
 */
export function renderOAuthRefusedPage(input: OAuthRefusedPageInput): string {
  const closeDelaySeconds = input.closeDelaySeconds ?? DEFAULT_OAUTH_CLOSE_DELAY_SECONDS;
  const cancelled = input.code === "access_denied";
  const titleKey = cancelled ? "cancelledTitle" : "refusedTitle";
  const strings = oauthCompletionStrings.en;
  const result = {
    type: oauthRefusedType,
    status: cancelled ? "cancelled" : "error",
    code: input.code,
    state: input.state,
  };
  const codeLine = cancelled ? "" : `\n    <p><code>${input.code}</code></p>`;
  const postScript =
    input.resultOrigins.length > 0 && input.state
      ? `if(window.opener){const result=${scriptJson(result)};for(const origin of ${scriptJson(input.resultOrigins)}){try{window.opener.postMessage(result,origin);}catch{}}}\n`
      : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${strings[titleKey]}</title>
<style>${oauthCompletionStyles}</style>
</head>
<body>
<main class="card" role="status" aria-live="polite">
  <div class="header">
    <span class="badge" data-t="refusedBadge">${strings.refusedBadge}</span>
    <h1 data-t="${titleKey}">${strings[titleKey]}</h1>
    <p data-t="refusedBody">${strings.refusedBody}</p>${codeLine}
  </div>
  <div class="actions">
    <button class="button" type="button" data-t="closeButton">${strings.closeButton}</button>
    <p class="close-note" data-close-note>${strings.autoClose.replace("%N%", String(closeDelaySeconds))}</p>
  </div>
</main>
<script>(()=>{
${postScript}const STR=${scriptJson(oauthCompletionStrings)};
${oauthCompletionLocaleScript}
const t=STR[pick()]||STR.en;
document.documentElement.lang=pick();
for(const el of document.querySelectorAll("[data-t]")){const key=el.getAttribute("data-t");if(t[key]!=null)el.textContent=t[key];}
if(t[${scriptJson(titleKey)}])document.title=t[${scriptJson(titleKey)}];
${oauthCloseWindowScript(closeDelaySeconds)}
})();</script>
</body>
</html>`;
}
