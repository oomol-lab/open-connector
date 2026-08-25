import { describe, expect, it } from "vitest";
import { renderOAuthCompletionPage } from "./oauth-completion-page.ts";

describe("renderOAuthCompletionPage", () => {
  it("renders escaped completion content and the broadcast payload", () => {
    const html = renderOAuthCompletionPage('oauth_<example>"');

    expect(html).toContain("Connection complete");
    expect(html).toContain("Close this window to continue where you started.");
    expect(html).toContain('"type":"oauth.completed"');
    expect(html).toContain('"service":"oauth_\\u003cexample>\\""');
    expect(html).toContain("BroadcastChannel");
    expect(html).not.toContain("OOMOL Connect");
    expect(html).not.toContain("OAuth finished");
  });

  it("embeds client-side translations and a manual-close fallback", () => {
    const html = renderOAuthCompletionPage("github");

    // Localizable nodes are marked so the client script can swap text.
    expect(html).toContain('data-t="badge"');
    expect(html).toContain('data-t="title"');
    expect(html).toContain("data-close-note");
    // Bundled locales (English default plus at least one non-English locale).
    expect(html).toContain("连接完成");
    expect(html).toContain("接続が完了しました");
    // Honest close handling: a manual-close hint replaces the countdown when
    // window.close() is blocked on a user-navigated tab.
    expect(html).toContain("现在可以手动关闭此窗口。");
    expect(html).toContain("navigator.languages");
  });
});
