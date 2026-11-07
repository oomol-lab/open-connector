import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { TikTokShopClient } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { requireOAuthCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError, requiredInputString } from "../provider-runtime.ts";
import { apiBaseUrl, requestApi, signRequest } from "./runtime.ts";
export { oauth } from "./oauth.ts";
function signingConfig(secret: Record<string, unknown> | undefined): TikTokShopClient {
  return {
    clientId: requiredInputString(secret?.clientId, "TikTok Shop app key"),
    clientSecret: requiredInputString(secret?.clientSecret, "TikTok Shop app secret"),
  };
}
interface TikTokShopContext {
  accessToken: string;
  clientConfig: TikTokShopClient;
  fetcher: typeof fetch;
}

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "tiktok_shop",
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireOAuthCredential(context, "tiktok_shop");
    return { accessToken: credential.accessToken, clientConfig: signingConfig(credential.providerSecret), fetcher };
  },
  handlers: Object.fromEntries(
    ["list_authorized_shops", "search_products", "get_product", "search_orders", "get_orders"].map((name) => [
      name,
      async (values: Record<string, unknown>, context: TikTokShopContext) => {
        const { shop_cipher, page_size, page_token, product_id, sort_order, sort_field, ...filters } = values;
        const fetcher = context.fetcher;
        if (name === "list_authorized_shops") {
          return requestApi(
            context.accessToken,
            context.clientConfig,
            "/authorization/202309/shops",
            {},
            undefined,
            fetcher,
          );
        }
        if (name === "search_products") {
          if (
            Array.isArray(filters.listing_platforms) &&
            filters.listing_platforms.length &&
            (!filters.status || filters.status === "ALL")
          ) {
            throw new ProviderRequestError(
              400,
              "listing_platforms requires an explicit product status other than ALL",
              undefined,
              "invalid_input",
            );
          }
          return requestApi(
            context.accessToken,
            context.clientConfig,
            "/product/202502/products/search",
            { shop_cipher, page_size: page_size ?? 20, page_token },
            filters,
            fetcher,
          );
        }
        if (name === "get_product") {
          const product = await requestApi(
            context.accessToken,
            context.clientConfig,
            `/product/202309/products/${encodeURIComponent(String(product_id))}`,
            { shop_cipher, ...filters },
            undefined,
            fetcher,
          );
          return { product };
        }
        if (name === "search_orders") {
          return requestApi(
            context.accessToken,
            context.clientConfig,
            "/order/202309/orders/search",
            { shop_cipher, page_size: page_size ?? 20, page_token, sort_order, sort_field },
            filters,
            fetcher,
          );
        }
        return requestApi(
          context.accessToken,
          context.clientConfig,
          "/order/202507/orders",
          { shop_cipher, ids: values.ids },
          undefined,
          fetcher,
        );
      },
    ]),
  ),
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "tiktok_shop",
  baseUrl: apiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  redirect: "manual",
  sensitiveHeaders: ["x-tts-access-token"],
  async customizeRequest({ context, url, headers, body, setBody }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    const credential = await requireOAuthCredential(context, "tiktok_shop");
    const config = signingConfig(credential.providerSecret);
    headers.delete("authorization");
    headers.set("x-tts-access-token", credential.accessToken);
    url.searchParams.delete("access_token");
    url.searchParams.delete("app_secret");
    url.searchParams.set("app_key", config.clientId);
    url.searchParams.set("timestamp", String(Math.floor(Date.now() / 1000)));
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    const multipart = headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() === "multipart/form-data";
    let text = "";
    if (!multipart && body != null) {
      text = typeof body === "string" ? body : JSON.stringify(body);
      setBody(text);
    }
    url.searchParams.set("sign", signRequest(url, text, config.clientSecret));
  },
});
export const credentialValidators: CredentialValidators = {
  async oauth2(input) {
    const id = requiredInputString(input.metadata.openId, "TikTok Shop open_id");
    return {
      profile: { accountId: id, displayName: optionalString(input.metadata.sellerName) || "TikTok Shop Seller" },
      grantedScopes: optionalString(input.metadata.scope)?.split(" ").filter(Boolean),
      metadata: { openId: id, sellerBaseRegion: input.metadata.sellerBaseRegion, userType: input.metadata.userType },
    };
  },
};
