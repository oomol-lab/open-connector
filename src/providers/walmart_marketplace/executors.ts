import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  requireCustomCredential,
} from "../provider-runtime.ts";
import {
  applyMarketplaceHeaders,
  exchangeAccessToken,
  executeWalmartMarketplaceAction,
  readCredential,
  validateWalmartMarketplaceCredential,
  walmartMarketplaceApiBaseUrl,
} from "./runtime.ts";

const service = "walmart_marketplace";
interface Context {
  values: Record<string, string>;
  fetcher: typeof fetch;
}
const actionNames = ["list_items", "get_item", "list_orders", "get_order", "get_inventory", "update_inventory"];
const handlers = Object.fromEntries(
  actionNames.map((actionName) => [
    actionName,
    (input: Record<string, unknown>, context: Context) =>
      executeWalmartMarketplaceAction({ actionName, input, values: context.values }, context.fetcher),
  ]),
);
export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher) {
    return { values: (await requireCustomCredential(context, service)).values, fetcher };
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: walmartMarketplaceApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, fetcher, headers }) {
    const credential = readCredential((await requireCustomCredential(context, service)).values);
    applyMarketplaceHeaders(headers, await exchangeAccessToken(credential, fetcher, "execute"));
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher }) {
    const result = await validateWalmartMarketplaceCredential(input.values, fetcher);
    return {
      profile: {
        accountId: `walmart_marketplace:${input.values.clientId}`,
        displayName: result.accountLabel,
      },
      metadata: result.providerMetadata,
    };
  },
};
