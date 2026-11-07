import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { requiredString, optionalString } from "../../core/cast.ts";
import { defineOAuthProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError, providerResponseError, requiredInputString } from "../provider-runtime.ts";
export { oauth } from "./oauth.ts";
import { ebayApiBaseUrl, ebayIdentityUrl } from "./constants.ts";
import { requestEbay } from "./runtime.ts";
export const executors: ProviderExecutors = defineOAuthProviderExecutors(
  "ebay",
  Object.fromEntries(
    [
      "get_user",
      "list_orders",
      "get_order",
      "list_shipping_fulfillments",
      "get_shipping_fulfillment",
      "create_shipping_fulfillment",
    ].map((name) => [
      name,
      async (data, context) => {
        if (name === "get_user") return requestEbay(ebayIdentityUrl, context.accessToken, context.fetcher);
        let pathname = "/sell/fulfillment/v1/order";
        if (data.orderId != null) pathname += `/${encodePathSegment(requiredInputString(data.orderId, "orderId"))}`;
        if (name.includes("shipping_fulfillment")) pathname += "/shipping_fulfillment";
        if (data.fulfillmentId != null)
          pathname += `/${encodePathSegment(requiredInputString(data.fulfillmentId, "fulfillmentId"))}`;
        const url = new URL(pathname, ebayApiBaseUrl);
        if (name === "create_shipping_fulfillment") {
          const { orderId: _orderId, ...body } = data;
          return requestEbay(url, context.accessToken, context.fetcher, body);
        }
        for (const key of ["fieldGroups", "filter", "limit", "offset", "orderIds"]) {
          const value = data[key];
          if (value != null) url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
        }
        return requestEbay(url, context.accessToken, context.fetcher);
      },
    ]),
  ),
  { skipDnsValidation: true },
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
  service: "ebay",
  baseUrl: ebayApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const user = await requestEbay(ebayIdentityUrl, input.accessToken, fetcher);
    const id = requiredString(user.userId, "eBay userId", providerResponseError);
    return {
      profile: { accountId: id, displayName: optionalString(user.username) || id },
      grantedScopes: optionalString(input.metadata.scope)?.split(" ").filter(Boolean),
      metadata: {},
    };
  },
};
function encodePathSegment(value: string): string {
  if (value === "." || value === "..")
    throw new ProviderRequestError(400, "eBay resource IDs cannot be dot segments", undefined, "invalid_input");
  return encodeURIComponent(value);
}
