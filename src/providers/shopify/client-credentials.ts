import { sha256Hex } from "../../core/aws-sigv4.ts";
import { optionalNumber, requiredString, requiredRawString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  providerResponseError,
} from "../provider-runtime.ts";
import { requestShopifyJson } from "./client.ts";
import { normalizeShopDomain } from "./shop-domain.ts";
interface ShopifyClientCredentialsToken {
  accessToken: string;
  providerScopes: string[];
  shopDomain: string;
  expiresAt: number;
}

export function createShopifyClientCredentialsTokenSource() {
  const tokens = new Map<string, Promise<ShopifyClientCredentialsToken>>();

  return async function getToken(
    values: Record<string, string>,
    fetcher: typeof fetch,
  ): Promise<ShopifyClientCredentialsToken> {
    const shopDomain = normalizeShopDomain(values.shopDomain);
    const clientId = requiredInputString(values.clientId, "clientId");
    const clientSecret = requiredInputString(values.clientSecret, "clientSecret");
    const key = sha256Hex(JSON.stringify([shopDomain, clientId, clientSecret]));
    const existing = tokens.get(key);
    if (existing) {
      const token = await existing;
      if (token.expiresAt > Date.now()) return token;
      if (tokens.get(key) !== existing) return getToken(values, fetcher);
    }

    const requestedAt = Date.now();
    const pending = requestShopifyJson(
      shopDomain,
      "",
      `https://${shopDomain}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      },
      fetcher,
    ).then(({ payload }) => {
      const token = requiredResponseRecord(payload, "Shopify client credentials token response");
      const expiresIn = optionalNumber(token.expires_in);
      if (expiresIn === undefined || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new ProviderRequestError(
          502,
          "Shopify client credentials token is missing a valid expires_in",
          undefined,
          "provider_error",
        );
      }
      return {
        accessToken: requiredString(token.access_token, "access_token", providerResponseError),
        providerScopes: [
          ...new Set(
            requiredRawString(token.scope, "scope", providerResponseError)
              .split(",")
              .map((scope) => scope.trim())
              .filter(Boolean),
          ),
        ],
        shopDomain,
        expiresAt: requestedAt + Math.max(0, expiresIn * 1000 - 60_000),
      };
    });
    tokens.set(key, pending);
    if (tokens.size > 256) {
      const oldest = tokens.keys().next().value;
      if (oldest !== undefined) tokens.delete(oldest);
    }
    return pending.catch((error: unknown) => {
      if (tokens.get(key) === pending) tokens.delete(key);
      throw error;
    });
  };
}
