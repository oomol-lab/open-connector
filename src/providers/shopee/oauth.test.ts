import type { OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";

import { describe, expect, it, vi } from "vitest";
import { oauth } from "./oauth.ts";
import { createShopeeSignature } from "./runtime.ts";

const clientConfig: OAuthClientConfig = {
  service: "shopee",
  clientId: "12345",
  clientSecret: "partner-key",
  extra: {
    apiBaseUrl: "https://partner.shopeemobile.com",
    authorizationBaseUrl: "https://open.shopee.cn",
  },
  secretExtra: {},
};

describe("Shopee OAuth", () => {
  it("构造带有效期签名的卖家授权 URL", async () => {
    const authorizationUrl = new URL("https://open.shopee.cn/api/v2/shop/auth_partner");
    authorizationUrl.searchParams.set("partner_id", "12345");
    authorizationUrl.searchParams.set("auth_type", "seller");
    authorizationUrl.searchParams.set("redirect_uri", "http://localhost:3000/oauth/callback");
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("state", "state-1");

    const result = new URL(
      await oauth.buildAuthorizationUrl!({
        authorizationUrl,
        clientConfig,
        now: new Date("2023-11-14T22:13:20.000Z"),
      }),
    );

    expect(result.pathname).toBe("/api/v2/shop/auth_partner");
    expect(result.searchParams.get("timestamp")).toBe("1700000000");
    expect(result.searchParams.get("sign")).toBe(
      createShopeeSignature({
        partnerId: 12345,
        partnerKey: "partner-key",
        path: "/api/v2/shop/auth_partner",
        timestamp: 1_700_000_000,
      }),
    );
    expect(result.searchParams.get("state")).toBe("state-1");
  });

  it("交换授权码时保存实体 token inventory 与签名配置", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expire_in: 3600,
        shop_id_list: [42],
      }),
    );

    const result = await oauth.exchangeCode!({
      code: "authorization-code",
      callbackParameters: { shop_id: "42" },
      clientConfig,
      redirectUri: "http://localhost:3000/oauth/callback",
      tokenUrl: "https://partner.shopeemobile.com/api/v2/auth/token/get",
      fetcher,
      createError: (message) => new Error(message),
    });

    expect(result.providerSecret).toMatchObject({
      signingConfig: {
        clientId: "12345",
        clientSecret: "partner-key",
        apiBaseUrl: "https://partner.shopeemobile.com",
      },
      tokenInventory: {
        shops: {
          "42": {
            accessToken: "access-token",
            refreshToken: "refresh-token",
          },
        },
      },
    });
    const requestUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("partner_id")).toBe("12345");
    expect(requestUrl.searchParams.get("sign")).toBeTruthy();
  });

  it("刷新时按已保存的 shop token 轮换 providerSecret", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        access_token: "rotated-access",
        refresh_token: "rotated-refresh",
        expire_in: 7200,
        shop_id: 42,
      }),
    );
    const providerSecret = {
      signingConfig: {
        clientId: "12345",
        clientSecret: "partner-key",
        apiBaseUrl: "https://partner.shopeemobile.com",
      },
      tokenInventory: {
        shops: {
          "42": {
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: "2026-01-01T00:00:00.000Z",
          },
        },
        merchants: {},
      },
    };

    const result = await oauth.refreshAccessToken!({
      refreshToken: "refresh-token",
      clientConfig,
      metadata: { shopIds: [42] },
      providerSecret,
      fetcher,
      createError: (message) => new Error(message),
    });

    expect(result).toMatchObject({
      accessToken: "rotated-access",
      refreshToken: "rotated-refresh",
      providerSecret: {
        signingConfig: providerSecret.signingConfig,
        tokenInventory: {
          shops: {
            "42": {
              accessToken: "rotated-access",
              refreshToken: "rotated-refresh",
            },
          },
        },
      },
    });
  });

  it("一个实体刷新失败时仍返回其他实体已轮换的令牌", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "rotated-access",
          refresh_token: "rotated-refresh",
          expire_in: 7200,
          shop_id: 42,
        }),
      )
      .mockResolvedValueOnce(Response.json({ error: "error_auth", message: "expired" }, { status: 403 }));

    const result = await oauth.refreshAccessToken!({
      refreshToken: "fallback-refresh",
      clientConfig,
      metadata: {},
      providerSecret: {
        tokenInventory: {
          shops: {
            "42": { accessToken: "first", refreshToken: "first-refresh", expiresAt: "2026-01-01T00:00:00Z" },
            "43": { accessToken: "second", refreshToken: "second-refresh", expiresAt: "2026-01-01T00:00:00Z" },
          },
          merchants: {},
        },
      },
      fetcher,
      createError: (message) => new Error(message),
    });

    expect(result.providerSecret?.tokenInventory).toMatchObject({
      shops: { "42": { accessToken: "rotated-access", refreshToken: "rotated-refresh" } },
      merchants: {},
    });
    const tokenInventory = result.providerSecret?.tokenInventory as { shops: Record<string, unknown> };
    expect(tokenInventory.shops["43"]).toBeUndefined();
  });

  it("Shopee 签名包含 partner、path、timestamp、token 与实体 ID", () => {
    expect(
      createShopeeSignature({
        partnerId: 12345,
        partnerKey: "partner-key",
        path: "/api/v2/shop/get_shop_info",
        timestamp: 1_700_000_000,
        accessToken: "access-token",
        entityId: 42,
      }),
    ).toBe("5f617a6c352be5d53fba160f1a5e4854efa7b715f7ae3901813d7d646edd6b36");
  });
});
