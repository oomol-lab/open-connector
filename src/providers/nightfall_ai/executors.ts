import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString, optionalNumber } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  providerUserAgent,
  runProviderRequest,
  ProviderRequestError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { nightfallAiActions } from "./actions.ts";
const baseUrl = "https://api.nightfall.ai";
const handlers = mapProviderActionHandlers(
  "nightfall_ai",
  nightfallAiActions,
  () => async (values: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const apiKey = requiredInputString(context.apiKey.trim(), "API Key");
    return runProviderRequest({ label: "Nightfall AI", signal: context.signal }, async (signal) => {
      const response = await context.fetcher(`${baseUrl}/v3/scan`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": providerUserAgent,
        },
        body: JSON.stringify(values),
        signal,
      });
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok) {
        const error = optionalRecord(payload);
        const message = optionalRawString(error?.message);
        const description = optionalRawString(error?.description);
        const code = optionalNumber(error?.code);
        const detail =
          [message, description].filter(Boolean).join(": ") ||
          `Nightfall AI request failed with status ${response.status}`;
        throw new ProviderRequestError(
          response.status,
          `${code === undefined ? "" : `[${code}] `}${detail}`.replaceAll(apiKey, "[REDACTED]"),
          undefined,
          response.status === 429 ? "rate_limited" : "provider_error",
        );
      }
      return requiredResponseRecord(payload, "Nightfall AI scan response");
    });
  },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey?.trim(), "API Key");
    return {
      profile: { displayName: "Nightfall AI API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationMode: "local_non_empty_key" },
    };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("nightfall_ai", handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "nightfall_ai",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, `Provider request failed with HTTP ${response.status}`),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    }))
      if (!headers.has(name)) headers.set(name, value);
  },
});
