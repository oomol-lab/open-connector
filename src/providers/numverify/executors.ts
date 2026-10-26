import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { numverifyActions } from "./actions.ts";
const baseUrl = "https://apilayer.net/api";
const headers = { accept: "application/json", "user-agent": providerUserAgent };
async function requestNumverify(
  endpoint: string,
  query: Record<string, string | undefined>,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "Numverify" }, async (signal) => {
    const url = new URL(`${baseUrl}${endpoint}`);
    url.searchParams.set("access_key", apiKey);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    const response = await fetcher(url, { headers, signal });
    let raw: unknown;
    try {
      raw = await response.json();
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Numverify returned invalid JSON (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    const body = requiredResponseRecord(raw, "Numverify");
    const error = optionalRecord(body.error);
    if (!response.ok || body.success === false || error) {
      const type = optionalString(error?.type);
      const info = optionalString(error?.info) ?? `Numverify request failed (HTTP ${response.status})`;
      const message = type ? `${type}: ${info}` : info;
      if (type === "invalid_access_key" || type === "missing_access_key") {
        throw new ProviderRequestError(401, message, undefined, "authorization_failed");
      }
      if (type === "usage_limit_reached" || type === "rate_limit_reached" || response.status === 429) {
        throw new ProviderRequestError(429, message, undefined, "rate_limited");
      }
      if (
        type &&
        ["no_phone_number_provided", "non_numeric_phone_number_provided", "invalid_country_code"].includes(type)
      ) {
        throw providerInputError(message);
      }
      throw new ProviderRequestError(response.ok ? 502 : response.status, message, undefined, "provider_error");
    }
    return body;
  });
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const apiKey = context.apiKey;
  const fetcher = context.fetcher;
  if (actionName === "list_countries") {
    return { countries: await requestNumverify("/countries", {}, apiKey, fetcher, context.signal) };
  }
  return requestNumverify(
    "/validate",
    {
      number: requiredInputString(values.number, "number"),
      country_code: optionalString(values.country_code)?.toUpperCase(),
    },
    apiKey,
    fetcher,
    context.signal,
  );
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "numverify",
  Object.fromEntries(
    numverifyActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestNumverify("/countries", {}, input.apiKey, fetcher, signal);
    return {
      profile: { displayName: "Numverify API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/countries" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "numverify",
  baseUrl: baseUrl,
  auth: { type: "api_key_query", name: "access_key" },
  async customizeRequest({ headers: proxyHeaders }) {
    for (const [name, value] of Object.entries(headers)) if (!proxyHeaders.has(name)) proxyHeaders.set(name, value);
  },
});
