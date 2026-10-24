import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  readProviderTextBody,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  isAbortLikeError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { unirateapiActions } from "./actions.ts";
const baseUrl = "https://api.unirateapi.com/api";
const endpoints: Record<string, string> = {
  list_currencies: "/currencies",
  get_rates: "/rates",
  convert: "/convert",
  get_historical_rates: "/historical/rates",
  get_timeseries: "/historical/timeseries",
  get_historical_limits: "/historical/limits",
};
async function request(
  endpoint: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  const url = new URL(`${baseUrl}${endpoint}`);
  for (const [key, value] of Object.entries(input)) {
    if (value != null) url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  try {
    return await runProviderRequest({ signal: parentSignal, label: "UniRateAPI" }, async (signal) => {
      const response = await fetcher(url, {
        signal,
        headers: { accept: "application/json", "user-agent": providerUserAgent },
      });
      let payload: unknown;
      try {
        payload = await JSON.parse(await readProviderTextBody(response, "unirateapi response", undefined, signal));
      } catch (error) {
        if (error instanceof ProviderRequestError || isAbortLikeError(error)) throw error;
        if (response.ok)
          throw new ProviderRequestError(502, "UniRateAPI returned malformed JSON", undefined, "provider_error");
      }
      if (!response.ok) {
        const body = optionalRecord(payload);
        const message =
          optionalRawString(body?.error) ?? optionalRawString(body?.message) ?? `UniRateAPI HTTP ${response.status}`;
        throw new ProviderRequestError(
          response.status,
          message,
          withRetryAfterSeconds(response),
          response.status === 429 ? "rate_limited" : "provider_error",
        );
      }
      return requiredResponseRecord(payload, "UniRateAPI response");
    });
  } catch (error) {
    if (error instanceof Error) {
      error.message = error.message
        .replaceAll(apiKey, "[REDACTED]")
        .replaceAll(encodeURIComponent(apiKey), "[REDACTED]")
        .replaceAll(new URLSearchParams({ key: apiKey }).toString().slice(4), "[REDACTED]");
    }
    throw error;
  }
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "unirateapi",
  mapProviderActionHandlers(
    "unirateapi",
    unirateapiActions,
    (_action, actionName) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      const data = { ...input };
      for (const key of ["from", "to", "base"])
        if (data[key] !== undefined) data[key] = requiredInputString(data[key], key).toUpperCase();
      if (Array.isArray(data.currencies))
        data.currencies = data.currencies.map((value) => requiredInputString(value, "currency").toUpperCase());
      if (actionName === "get_timeseries" && String(data.start_date) > String(data.end_date))
        throw new ProviderRequestError(400, "start_date must not be after end_date", undefined, "invalid_input");
      return request(endpoints[actionName]!, data, context.apiKey, context.fetcher, context.signal);
    },
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    await request("/currencies", {}, requiredInputString(input.apiKey, "API Key"), fetcher);
    return {
      profile: { displayName: "UniRateAPI API Key" },
      grantedScopes: [],
      metadata: { validationEndpoint: "/api/currencies" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "unirateapi",
  baseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [key, value] of Object.entries({
      accept: "application/json",
      "user-agent": providerUserAgent,
    }))
      if (!headers.has(key)) headers.set(key, value);
  },
});
