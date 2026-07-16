import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveWooCommerceCredentialContext, woocommerceActionHandlers } from "./runtime.ts";

afterEach(() => vi.unstubAllGlobals());

describe("woocommerce upload source redirect handling", () => {
  it("rejects a redirecting fileUrl without following it, on Workers too", async () => {
    const calls: string[] = [];
    // Mirrors the Cloudflare Workers runtime: `redirect: "error"` is not
    // implemented there and throws, so a provider that still requests it fails
    // on Workers while passing on Node. Redirects are never followed.
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.redirect === "error") {
        throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
      }
      calls.push(input instanceof Request ? input.url : String(input));
      return new Response(null, { status: 302, headers: { location: "https://elsewhere.example.com/logo.png" } });
    });

    const context = resolveWooCommerceCredentialContext(
      {
        storeUrl: "https://store.example.com",
        consumerKey: "ck",
        consumerSecret: "cs",
        wordpressUsername: "user",
        wordpressApplicationPassword: "pass",
      },
      globalThis.fetch,
    );

    await expect(
      woocommerceActionHandlers.upload_media!(
        { fileUrl: "https://files.example.com/logo.png", fileName: "logo.png" },
        context,
      ),
    ).rejects.toThrow(/failed to fetch upload source: 302/u);

    expect(calls).toEqual(["https://files.example.com/logo.png"]);
  });
});
