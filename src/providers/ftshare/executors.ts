import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString, optionalNumber } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  ProviderRequestError,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { ftshareActions } from "./actions.ts";

const baseUrl = "https://market.ft.tech/gateway";
const defaultHeaders = { accept: "application/json", "content-type": "application/json" };
const routes: Record<string, string> = {
  list_companies: "/api/v1/market/data/company-list",
  get_income_statements: "/api/v1/market/data/finance/income",
  get_balance_sheets: "/api/v1/market/data/finance/balance",
  get_cashflow_statements: "/api/v1/market/data/finance/cashflow",
  get_earnings_reports: "/api/v1/market/data/finance/stock-performance-express",
  get_earnings_forecasts: "/api/v1/market/data/finance/stock-performance-forecast",
};
interface FtshareRequest {
  route: string;
  input: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}
async function request({ route, input, apiKey, fetcher, parentSignal }: FtshareRequest) {
  try {
    return await runProviderRequest({ signal: parentSignal, label: "FTShare" }, async (signal) => {
      const url = new URL(`${baseUrl}${route}`);
      for (const [key, value] of Object.entries(input)) {
        if (value != null) url.searchParams.set(key, String(value));
      }
      const response = await fetcher(url.toString(), {
        method: "GET",
        headers: { ...defaultHeaders, FTSHARE_API_KEY: apiKey },
        signal,
      });
      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
      const body = optionalRecord(payload);
      if (!response.ok || (body?.code != null && body.code !== 200)) {
        const code = optionalRawString(body?.code) ?? optionalNumber(body?.code);
        const detail =
          [
            code,
            optionalRawString(body?.msg),
            optionalRawString(body?.message),
            optionalRawString(optionalRecord(body?.data)?.reason),
          ]
            .filter((value) => value != null && value !== "")
            .join(": ") || `HTTP ${response.status}`;
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          `FTShare request failed: ${detail}`,
          undefined,
          response.status === 429 ? "rate_limited" : "provider_error",
        );
      }
      return requiredResponseRecord(payload, "FTShare response");
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) error.message = error.message.split(apiKey).join("[REDACTED]");
    throw error;
  }
}
const handlers = mapProviderActionHandlers(
  "ftshare",
  ftshareActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const route = routes[action.name];
    const query = { ...dataInput };
    if (action.name === "list_companies" || query.stock_code == null) {
      query.page ??= 1;
      query.page_size ??= 50;
    }
    if (query.report_type === "h1") query.report_type = "q2";
    return request({
      route: route,
      input: query,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      parentSignal: context.signal,
    });
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("ftshare", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request({
      route: routes.list_companies!,
      input: { page: 1, page_size: 1 },
      apiKey: requiredInputString(input.apiKey, "API Key"),
      fetcher: fetcher,
      parentSignal: signal,
    });
    return { profile: { displayName: "FTShare API Key" }, grantedScopes: [], metadata: { apiBaseUrl: baseUrl } };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "ftshare",
  baseUrl,
  auth: { type: "api_key_header", name: "FTSHARE_API_KEY" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({ accept: "application/json", "content-type": "application/json" }))
      if (!headers.has(name)) headers.set(name, value);
  },
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "Provider request failed"),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
});
