import { describe, expect, it } from "vitest";
import { renderOAuthCompletionPage } from "./oauth-completion-page.ts";

describe("renderOAuthCompletionPage", () => {
  it("renders escaped completion content and the broadcast payload", () => {
    const html = renderOAuthCompletionPage('oauth_<example>"');

    expect(html).toContain("Connection ready");
    expect(html).toContain("<code>oauth_&lt;example&gt;&quot;</code>");
    expect(html).toContain('"type":"oauth.completed"');
    expect(html).toContain('"service":"oauth_\\u003cexample>\\""');
    expect(html).toContain("BroadcastChannel");
    expect(html).not.toContain('<code>oauth_<example>"</code>');
  });
});
