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
