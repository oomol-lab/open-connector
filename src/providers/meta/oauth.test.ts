import { expect, it } from "vitest";
import { oauth } from "./oauth.ts";

it.each([{ scopes: ["pages_show_list", "future_permission"] }, { scopes: undefined }])(
  "binds Business Login and preserves reported permissions: $scopes",
  async ({ scopes }) => {
    const clientConfig = {
      service: "meta",
      clientId: "app",
      clientSecret: "secret",
      extra: { configId: "business-config" },
      secretExtra: {},
    };
    const authorize = await oauth.buildAuthorizationUrl!({
      authorizationUrl: new URL("https://www.facebook.com/v27.0/dialog/oauth"),
      clientConfig,
      now: new Date(),
    });
    expect(new URL(authorize).searchParams.get("config_id")).toBe("business-config");
    const calls: URL[] = [];
    const expiresAt = Math.floor(Date.now() / 1000) + 86400;
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.pathname.endsWith("/debug_token"))
        return Response.json({
          data: {
            is_valid: true,
            app_id: "app",
            type: "USER",
            scopes,
            expires_at: expiresAt,
            data_access_expires_at: expiresAt - 3600,
          },
        });
      return Response.json({
        access_token: url.searchParams.has("fb_exchange_token") ? "long-token" : "short-token",
        token_type: "Bearer",
        expires_in: 86400,
      });
    };
    const result = await oauth.exchangeCode!({
      code: "code",
      clientConfig,
      redirectUri: "https://connector.example/callback",
      tokenUrl: "https://graph.facebook.com/v27.0/oauth/access_token",
      fetcher,
      createError: (message) => new Error(message),
    });
    expect(result).toMatchObject({
      accessToken: "long-token",
      providerSecret: { appSecret: "secret" },
      metadata: { scope: scopes?.join(" ") },
      expiresAt: new Date((expiresAt - 3600) * 1000).toISOString(),
    });
    expect(calls[2]?.searchParams.get("fb_exchange_token")).toBe("short-token");
    expect(calls[3]?.searchParams.get("input_token")).toBe("long-token");
  },
);
