import type { OAuthCodeExchangeInput } from "../../oauth/oauth-token.ts";

import { expect, it, vi } from "vitest";
import { oauth } from "./oauth.ts";

const clientConfig = {
  service: "instagram",
  clientId: "meta-app",
  clientSecret: "meta-secret",
  extra: { loginMode: "unified", configId: "business-config" },
  secretExtra: {},
};

function exchangeInput(fetcher: typeof fetch): OAuthCodeExchangeInput {
  return {
    code: "authorization-code",
    clientConfig,
    redirectUri: "https://connector.example/oauth/callback",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    fetcher,
    createError: (message) => new Error(message),
  };
}

it("builds Unified Login consent without Instagram Login parameters or scopes", async () => {
  const url = new URL(
    await oauth.buildAuthorizationUrl!({
      authorizationUrl: new URL(
        "https://www.instagram.com/oauth/authorize?client_id=meta-app&redirect_uri=https%3A%2F%2Fconnector.example%2Foauth%2Fcallback&response_type=code&state=bound-state&scope=instagram_business_basic&enable_fb_login=0&force_authentication=1",
      ),
      clientConfig,
      now: new Date(),
    }),
  );
  expect(url.origin + url.pathname).toBe("https://www.facebook.com/dialog/oauth");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    client_id: "meta-app",
    redirect_uri: "https://connector.example/oauth/callback",
    response_type: "code",
    state: "bound-state",
    config_id: "business-config",
    override_default_response_type: "true",
    prompt: "login",
  });
});

it.each([
  { loginMode: "unified", configId: "" },
  { loginMode: "typo", configId: "config" },
])("rejects invalid login configuration before consent: $loginMode", async (extra) => {
  await expect(async () =>
    oauth.buildAuthorizationUrl!({
      authorizationUrl: new URL("https://www.instagram.com/oauth/authorize"),
      clientConfig: { ...clientConfig, extra },
      now: new Date(),
    }),
  ).rejects.toThrow();
});

it.each([
  { expiresAt: 0, scopes: ["instagram_basic", "instagram_manage_insights", "future_permission"] },
  { expiresAt: 2000000000, scopes: ["instagram_basic"] },
  { expiresAt: 2000000000, scopes: undefined },
])(
  "exchanges a system-user token with its reported lifetime and grants: $expiresAt, $scopes",
  async ({ expiresAt, scopes }) => {
    const calls: URL[] = [];
    const token = await oauth.exchangeCode!(
      exchangeInput(async (input, init) => {
        const url = new URL(String(input));
        calls.push(url);
        expect(url.origin).toBe("https://graph.facebook.com");
        if (url.pathname.endsWith("/oauth/access_token")) {
          expect(url.searchParams.get("client_id")).toBe("meta-app");
          expect(url.searchParams.get("code")).toBe("authorization-code");
          expect(url.searchParams.has("fb_exchange_token")).toBe(false);
          return Response.json({ access_token: "system-token" });
        }
        if (url.pathname.endsWith("/debug_token")) {
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer meta-app|meta-secret");
          expect(url.searchParams.get("input_token")).toBe("system-token");
          return Response.json({
            data: { is_valid: true, app_id: "meta-app", type: "SYSTEM_USER", expires_at: expiresAt, scopes },
          });
        }
        expect(url.pathname).toBe("/v27.0/me");
        expect(url.searchParams.get("fields")).toBe("client_business_id");
        expect(url.searchParams.get("appsecret_proof")).toMatch(/^[a-f0-9]{64}$/);
        return Response.json({ id: "system-user", client_business_id: "business" });
      }),
    );
    expect(token).toMatchObject({
      accessToken: "system-token",
      refreshToken: "",
      expiresAt: expiresAt === 0 ? "9999-12-31T23:59:59.000Z" : new Date(expiresAt * 1000).toISOString(),
      providerSecret: { appSecret: "meta-secret" },
      metadata: { scope: scopes?.join(" "), clientBusinessId: "business" },
    });
    expect(calls).toHaveLength(3);
  },
);

it.each([
  { app_id: "another-app", is_valid: true },
  { app_id: "meta-app", is_valid: false },
])("rejects tokens that do not belong to a valid app authorization: $app_id, $is_valid", async (debug) => {
  const fetcher = vi.fn<typeof fetch>(async (input) =>
    new URL(String(input)).pathname.endsWith("/debug_token")
      ? Response.json({ data: debug })
      : Response.json({ access_token: "token" }),
  );
  await expect(oauth.exchangeCode!(exchangeInput(fetcher))).rejects.toThrow("invalid token or a token for another app");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("preserves Instagram Login exchange for configurations without a login mode", async () => {
  const calls: URL[] = [];
  const input = exchangeInput(async (value, init) => {
    const url = new URL(String(value));
    calls.push(url);
    if (url.hostname === "api.instagram.com") {
      expect(init?.body).toBeInstanceOf(FormData);
      return Response.json({ access_token: "short-token", permissions: ["instagram_business_basic"] });
    }
    expect(url.searchParams.get("grant_type")).toBe("ig_exchange_token");
    expect(url.searchParams.get("access_token")).toBe("short-token");
    return Response.json({ access_token: "long-token", expires_in: 5184000 });
  });
  input.clientConfig = { ...clientConfig, extra: {} };
  const url = new URL("https://www.instagram.com/oauth/authorize?state=state&scope=instagram_business_basic");
  expect(
    await oauth.buildAuthorizationUrl!({ authorizationUrl: url, clientConfig: input.clientConfig, now: new Date() }),
  ).toBe(url.toString());
  expect(await oauth.exchangeCode!(input)).toMatchObject({
    accessToken: "long-token",
    refreshToken: "long-token",
    metadata: { permissions: "instagram_business_basic" },
  });
  expect(calls).toHaveLength(2);
});

it("refreshes legacy Instagram credentials even after the default app switches to Unified Login", async () => {
  const result = await oauth.refreshAccessToken!({
    refreshToken: "old-instagram-token",
    clientConfig,
    metadata: {},
    fetcher: async (value) => {
      const url = new URL(String(value));
      expect(url.origin + url.pathname).toBe("https://graph.instagram.com/refresh_access_token");
      expect(url.searchParams.get("grant_type")).toBe("ig_refresh_token");
      expect(url.searchParams.get("access_token")).toBe("old-instagram-token");
      return Response.json({ access_token: "renewed-token", expires_in: 5184000 });
    },
    createError: (message) => new Error(message),
  });
  expect(result.refreshToken).toBe("renewed-token");
});
