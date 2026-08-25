import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";

import {
  defineProviderExecutors,
  createProviderFetch,
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  applyCoupangSignature,
  coupangApiBaseUrl,
  executeCoupangAction,
  readCoupangCredential,
  validateCoupangCredential,
} from "./runtime.ts";

const service = "coupang";
interface Context {
  values: Record<string, string>;
  fetcher: typeof fetch;
}
const actionNames = [
  "list_products",
  "get_product",
  "get_item_inventory",
  "update_item_quantity",
  "update_item_price",
  "list_orders",
  "get_order",
  "list_return_requests",
];
const handlers = Object.fromEntries(
  actionNames.map((actionName) => [
    actionName,
    (input: Record<string, unknown>, context: Context) =>
      executeCoupangAction({ actionName, input, values: context.values }, context.fetcher),
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
const proxyFetch = createProviderFetch({ skipDnsValidation: true });
export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const url = createProviderProxyUrl(coupangApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    const credential = readCoupangCredential((await requireCustomCredential(context, service)).values);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json;charset=UTF-8");
    headers.set("user-agent", providerUserAgent);
    headers.set("x-market", credential.market);
    applyCoupangSignature(input.method, url, headers, credential);
    const response = await proxyFetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok)
      throw new ProviderRequestError(
        response.status,
        await readProviderProxyErrorMessage(response, `provider request failed with HTTP ${response.status}`),
      );
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Coupang proxy request failed");
  }
};
export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher }) {
    const result = await validateCoupangCredential(input.values, fetcher);
    return {
      profile: {
        accountId: `coupang:${input.values.vendorId}`,
        displayName: result.accountLabel,
      },
      metadata: result.providerMetadata,
    };
  },
};
