import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  mapProviderActionHandlers,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { captainBiActions } from "./actions.ts";
import { exchangeCaptainBiAccessToken, executeCaptainBiAction, validateCaptainBiCredential } from "./runtime.ts";

const service = "captainbi";
const baseUrl = "https://openapi.captainbi.com";
const allowed = new Set([
  "/v1/open_user/get_channel_list",
  "/v1/open_goods/get_goods_list",
  "/v1/open_goods/get_goods_item_list",
  "/v1/open_fba/inventory_list",
  "/v1/open_goods/get_business_report",
  "/v1/open_channel_finance/get_analysis_by_order",
  "/v1/open_channel_finance/get_analysis_by_finance",
  "/v1/open_channel_finance/get_month_analysis_by_order",
  "/v1/open_channel_finance/get_month_analysis_by_finance",
  "/v1/open_goods_finance/get_analysis_by_order",
  "/v1/open_goods_finance/get_analysis_by_finance",
  "/v1/open_goods_finance/get_month_analysis_by_order",
  "/v1/open_goods_finance/get_month_analysis_by_finance",
  "/v1/open_order/get_return_report",
  "/v1/open_order/get_refund_list",
]);
interface Context {
  values: Record<string, unknown>;
  fetcher: typeof fetch;
}
const handlers: ProviderActionHandlers<
  "captainbi",
  (input: Record<string, unknown>, context: Context) => Promise<unknown>
> = mapProviderActionHandlers(
  service,
  captainBiActions,
  (_action, name) => (input, context) =>
    executeCaptainBiAction({ actionName: name, input, values: context.values }, context.fetcher),
);
export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher) {
    const credential = await requireCustomCredential(context, service);
    return { values: credential.values, fetcher };
  },
});

const proxyFetch = createProviderFetch({ skipDnsValidation: true });
export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    if (input.method.toUpperCase() !== "GET") throw new ProviderRequestError(400, "captainbi proxy only supports GET");
    const url = createProviderProxyUrl(baseUrl, input.endpoint, input.query);
    if (!allowed.has(url.pathname))
      throw new ProviderRequestError(400, "captainbi proxy only supports curated read endpoints");
    const credential = await requireCustomCredential(context, service);
    const token = await exchangeCaptainBiAccessToken(
      {
        clientId: String(credential.values.clientId ?? ""),
        clientSecret: String(credential.values.clientSecret ?? ""),
      },
      proxyFetch,
      "execute",
    );
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Bearer ${token}`);
    const response = await proxyFetch(url, { method: "GET", headers, signal: context.signal });
    if (!response.ok)
      throw new ProviderRequestError(
        response.status,
        await readProviderProxyErrorMessage(response, "CaptainBI proxy request failed"),
      );
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "CaptainBI proxy request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher }) {
    return validateCaptainBiCredential(input.values, fetcher);
  },
};
