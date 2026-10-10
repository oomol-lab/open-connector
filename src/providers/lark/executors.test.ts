import { describe, expect, it, vi } from "vitest";
import { createFeishuJsonRequest } from "../feishu/shared/client.ts";
import { provider } from "./definition.ts";
import { credentialValidators } from "./executors.ts";

describe("Lark regional OAuth boundary", () => {
  it("keeps consent, token exchange, and user identity on Lark", async () => {
    expect(provider.auth[0]).toMatchObject({
      authorizationUrl: "https://accounts.larksuite.com/open-apis/authen/v1/authorize",
      tokenUrl: "https://open.larksuite.com/open-apis/authen/v2/oauth/token",
      tokenRequestFormat: "json",
    });
    // Official authen/v1/user_info envelope; open_id is scoped to the OAuth app.
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          msg: "success",
          data: { open_id: "ou_user", name: "Casey", tenant_key: "tenant" },
        }),
      ),
    );
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "lark-user-token",
        tokenType: "Bearer",
        profile: { accountId: "user", displayName: "Casey", grantedScopes: [] },
        metadata: {},
      },
      { fetcher },
    );
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://open.larksuite.com/open-apis/authen/v1/user_info");
    expect(result && result.profile).toMatchObject({ accountId: "ou_user", displayName: "Casey" });
  });

  it.each(["feishu", "lark"] as const)("uses the %s API host and propagates missing permissions", async (region) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: 99991672, msg: "Access denied. One of the following scopes is required." }),
        ),
      );
    const request = createFeishuJsonRequest({ provider: region, accessToken: "user-token", fetcher });
    await expect(request({ path: "/wiki/v2/spaces" })).rejects.toMatchObject({ status: 403 });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      `https://${region === "lark" ? "open.larksuite.com" : "open.feishu.cn"}/open-apis/wiki/v2/spaces`,
    );
  });
});
