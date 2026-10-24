import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  requiredInputString,
  ProviderRequestError,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { eastmoneyMiaoxiangActions } from "./actions.ts";

const baseUrl = "https://mkapi2.dfcfs.com/finskillshub";
const defaultHeaders = { accept: "application/json", "content-type": "application/json" };
const routes: Record<string, string> = {
  query_financial_data: "/api/claw/query",
  search_news: "/api/claw/news-search",
  screen_stocks: "/api/claw/stock-screen",
};
const handlers = mapProviderActionHandlers(
  "eastmoney_miaoxiang",
  eastmoneyMiaoxiangActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const route = routes[action.name];
    const body = { ...dataInput };
    for (const key of ["query", "keyword", "toolQuery"])
      if (typeof body[key] === "string") body[key] = requiredInputString(body[key], key);
    if (action.name === "screen_stocks") {
      body.pageNo ??= 1;
      body.pageSize ??= 20;
    }
    const apiKey = requiredInputString(context.apiKey, "API Key");
    return runProviderRequest({ signal: context.signal, label: "Eastmoney Miaoxiang" }, async (signal) => {
      const response = await context.fetcher(`${baseUrl}${route}`, {
        method: "POST",
        headers: { ...defaultHeaders, apikey: apiKey },
        body: JSON.stringify(body),
        signal,
      });
      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
      const envelope = optionalRecord(payload);
      if (!response.ok || !envelope || envelope.status !== 0 || envelope.success === false) {
        const detail = optionalRawString(envelope?.message) || "Invalid or unsuccessful response";
        const code = envelope?.status == null ? "unknown" : String(envelope.status);
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          `Eastmoney Miaoxiang request failed (HTTP ${response.status}, status ${code}): ${detail}`
            .split(apiKey)
            .join("[REDACTED]"),
          undefined,
          response.status === 429 ? "rate_limited" : "provider_error",
        );
      }
      if (action.name === "screen_stocks") {
        const data = optionalRecord(envelope.data);
        if (data?.code != null && String(data.code) !== "100") {
          const detail = optionalRawString(data.msg) || "Screening query could not be parsed";
          throw new ProviderRequestError(
            502,
            `Eastmoney Miaoxiang screening failed (${String(data.code)}): ${detail}`.split(apiKey).join("[REDACTED]"),
            undefined,
            "provider_error",
          );
        }
      }
      return envelope;
    });
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("eastmoney_miaoxiang", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey, "API Key");
    return {
      profile: { displayName: "Eastmoney Miaoxiang Skills API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationMode: "local_non_empty_key" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "eastmoney_miaoxiang",
  baseUrl,
  auth: { type: "api_key_header", name: "apikey" },
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
