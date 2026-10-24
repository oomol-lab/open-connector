import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { isIP } from "node:net";
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
import { greipActions } from "./actions.ts";
const baseUrl = "https://greipapi.com";
const endpoints: Record<string, string> = {
  lookup_ip: "/lookup/ip",
  lookup_asn: "/lookup/asn",
  lookup_country: "/lookup/country",
};
async function request(
  endpoint: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  validating = false,
  parentSignal?: AbortSignal,
) {
  const url = new URL(endpoint, baseUrl);
  for (const [key, value] of Object.entries(input)) {
    if (value != null) url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  url.searchParams.set("format", "JSON");
  return runProviderRequest({ signal: parentSignal, label: "Greip" }, async (signal) => {
    const response = await fetcher(url, {
      signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
    });
    let payload: unknown;
    try {
      payload = await JSON.parse(await readProviderTextBody(response, "greip response", undefined, signal));
    } catch (error) {
      if (error instanceof ProviderRequestError || isAbortLikeError(error)) throw error;
      if (response.ok) throw new ProviderRequestError(502, "Greip returned invalid JSON", undefined, "provider_error");
    }
    const body = optionalRecord(payload);
    if (!response.ok || body?.status === "error") {
      const description = optionalRawString(body?.description) ?? `Greip HTTP ${response.status}`;
      const message = `${optionalRawString(body?.type) ?? "Greip error"}: ${description}`.replaceAll(
        apiKey,
        "[REDACTED]",
      );
      if (body?.status === "error" && (body.code === 101 || body.type === "invalid_key")) {
        throw new ProviderRequestError(
          validating ? 400 : 409,
          message,
          undefined,
          validating ? "invalid_input" : "authorization_failed",
        );
      }
      const limited = response.status === 429 || (body?.status === "error" && (body.code === 103 || body.code === 106));
      throw new ProviderRequestError(
        limited ? 429 : response.ok ? 502 : response.status,
        message,
        withRetryAfterSeconds(response),
        limited ? "rate_limited" : "provider_error",
      );
    }
    const result = requiredResponseRecord(payload, "Greip response");
    requiredResponseRecord(result.data, "Greip response data");
    return result;
  });
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "greip",
  mapProviderActionHandlers(
    "greip",
    greipActions,
    (_action, actionName) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      const data = { ...input };
      if (data.CountryCode !== undefined)
        data.CountryCode = requiredInputString(data.CountryCode, "CountryCode").toUpperCase();
      if (actionName === "lookup_ip" && !isIP(String(data.ip))) {
        throw new ProviderRequestError(400, "ip must be an IPv4 or IPv6 address", undefined, "invalid_input");
      }
      return request(endpoints[actionName]!, data, context.apiKey, context.fetcher, undefined, context.signal);
    },
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    await request("/lookup/ip", { ip: "1.1.1.1" }, requiredInputString(input.apiKey, "API Key"), fetcher, true);
    return {
      profile: { displayName: "Greip API Key" },
      grantedScopes: [],
      metadata: { validationEndpoint: "/lookup/ip" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "greip",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [key, value] of Object.entries({
      accept: "application/json",
      "user-agent": providerUserAgent,
    }))
      if (!headers.has(key)) headers.set(key, value);
  },
});
