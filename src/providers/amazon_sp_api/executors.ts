import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { looseArray, recordOrEmpty, optionalString } from "../../core/cast.ts";
import { requireOAuthCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requiredInputString } from "../provider-runtime.ts";
import { amazonApiOrigin, amazonRequest, amazonRequestDate, amazonUserAgent, executeAmazonAction } from "./runtime.ts";
export { oauth } from "./oauth.ts";
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "amazon_sp_api",
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireOAuthCredential(context, "amazon_sp_api");
    return { accessToken: credential.accessToken, providerMetadata: credential.metadata, fetcher };
  },
  handlers: Object.fromEntries(
    [
      "list_marketplace_participations",
      "search_catalog_items",
      "get_catalog_item",
      "search_listings_items",
      "get_listings_item",
      "put_listings_item",
      "patch_listings_item",
      "delete_listings_item",
      "get_inventory_summaries",
    ].map((actionName) => [
      actionName,
      (
        input: Record<string, unknown>,
        context: { accessToken: string; providerMetadata: Record<string, unknown>; fetcher: typeof fetch },
      ) =>
        executeAmazonAction(
          { actionName, accessToken: context.accessToken, providerMetadata: context.providerMetadata },
          input,
          context.fetcher,
        ),
    ]),
  ),
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "amazon_sp_api",
  baseUrl: async (context) => amazonApiOrigin((await requireOAuthCredential(context, "amazon_sp_api")).metadata.region),
  auth: { type: "none" },
  sensitiveHeaders: ["x-amz-access-token"],
  async customizeRequest({ context, headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    const credential = await requireOAuthCredential(context, "amazon_sp_api");
    headers.delete("authorization");
    headers.set("x-amz-access-token", credential.accessToken);
    headers.set("x-amz-date", amazonRequestDate());
    headers.set("user-agent", amazonUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const sellerId = requiredInputString(input.metadata.sellerId, "Amazon seller ID");
    const region = input.metadata.region;
    const response = await amazonRequest("/sellers/v1/marketplaceParticipations", {
      accessToken: input.accessToken,
      region,
      fetcher,
    });
    const storeName = looseArray(response.payload)
      .map((item) => optionalString(recordOrEmpty(item).storeName)?.trim())
      .find(Boolean);
    return {
      profile: { accountId: `${region}:${sellerId}`, displayName: storeName || `Amazon Seller ${sellerId}` },
      grantedScopes: optionalString(input.metadata.scope)?.split(" ").filter(Boolean),
      metadata: { sellerId, region },
    };
  },
};
