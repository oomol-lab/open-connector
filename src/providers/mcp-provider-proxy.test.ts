import type { ExecutionContext } from "../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy as appgrowingProxy } from "./appgrowing_mcp/executors.ts";
import { proxy as openseoProxy } from "./openseo_mcp/executors.ts";
import { proxy as tencentProxy } from "./tencent_meeting_mcp/executors.ts";

afterEach(() => vi.unstubAllGlobals());

for (const [service, proxy, endpoint] of [
  ["appgrowing_mcp", appgrowingProxy, "/mcp"],
  ["openseo_mcp", openseoProxy, "/mcp"],
  ["tencent_meeting_mcp", tencentProxy, "/mcp/wemeet-open/v1"],
] as const) {
  describe(service + " proxy boundary", () => {
    const context: ExecutionContext = {
      getCredential: async () => ({
        authType: "api_key",
        apiKey: "test-token",
        values: {},
        metadata: {},
        profile: { accountId: "test", displayName: "Test", grantedScopes: [] },
      }),
    };
    it.each([401, 403])("does not infer credential recovery from HTTP %i", async (status) => {
      vi.stubGlobal("fetch", async () => Response.json({ message: "Key or plan refused" }, { status }));
      expect(await proxy({ endpoint, method: "POST", body: {} }, context)).toMatchObject({
        ok: false,
        error: { code: "provider_error" },
      });
    });
    it("rejects query parameters before sending a credential", async () => {
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      expect(await proxy({ endpoint: endpoint + "?other=1", method: "POST" }, context)).toMatchObject({ ok: false });
      expect(fetcher).not.toHaveBeenCalled();
    });
    it("disables redirects on the authenticated request", async () => {
      const fetcher = vi.fn(async () => Response.json({ ok: true }));
      vi.stubGlobal("fetch", fetcher);
      expect(await proxy({ endpoint, method: "POST", body: {} }, context)).toMatchObject({ ok: true });
      expect(fetcher).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ redirect: "manual" }));
    });
  });
}
