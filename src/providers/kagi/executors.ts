import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString, looseArray } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  readProviderTextBody,
  ProviderRequestError,
  providerInputError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  isAbortLikeError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { kagiActions } from "./actions.ts";
const baseUrl = "https://kagi.com/api/v0";
async function summarize(body: string, apiKey: string, fetcher: typeof fetch, parentSignal?: AbortSignal) {
  return runProviderRequest({ signal: parentSignal, label: "Kagi" }, async (signal) => {
    const response = await fetcher(`${baseUrl}/summarize`, {
      method: "POST",
      signal,
      headers: {
        authorization: `Bot ${apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body,
    });
    let payload: unknown;
    try {
      payload = await JSON.parse(await readProviderTextBody(response, "kagi response", undefined, signal));
    } catch (error) {
      if (error instanceof ProviderRequestError || isAbortLikeError(error)) throw error;
      if (response.ok) throw new ProviderRequestError(502, "Kagi returned invalid JSON", undefined, "provider_error");
    }
    const result = optionalRecord(payload);
    const errors = looseArray(result?.error);
    if (!response.ok || errors.length > 0) {
      const details = errors
        .map((value) => {
          const error = optionalRecord(value);
          const message = optionalRawString(error?.msg);
          if (!message) return undefined;
          return error?.code == null ? message : `${error.code}: ${message}`;
        })
        .filter(Boolean)
        .join("; ");
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        (details || `Kagi request failed with HTTP ${response.status}`).replaceAll(apiKey, "[REDACTED]"),
        withRetryAfterSeconds(response),
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    const envelope = requiredResponseRecord(payload, "Kagi response");
    const data = requiredResponseRecord(envelope.data, "Kagi summary data");
    if (optionalRawString(data.output) == null) {
      throw new ProviderRequestError(502, "Kagi response is missing summary text", undefined, "provider_error");
    }
    return envelope;
  });
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "kagi",
  mapProviderActionHandlers(
    "kagi",
    kagiActions,
    () => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      const data = { ...input };
      if (data.target_language !== undefined) {
        const language = requiredInputString(data.target_language, "target_language").toUpperCase();
        if (
          ![
            "BG",
            "CS",
            "DA",
            "DE",
            "EL",
            "EN",
            "ES",
            "ET",
            "FI",
            "FR",
            "HU",
            "ID",
            "IT",
            "JA",
            "KO",
            "LT",
            "LV",
            "NB",
            "NL",
            "PL",
            "PT",
            "RO",
            "RU",
            "SK",
            "SL",
            "SV",
            "TR",
            "UK",
            "ZH",
            "ZH-HANT",
          ].includes(language)
        )
          throw providerInputError("Unsupported target_language");
        data.target_language = language;
      }
      const body = JSON.stringify(data);
      if (Buffer.byteLength(body, "utf8") > 1000000) {
        throw new ProviderRequestError(
          400,
          "Kagi request exceeds the 1 MB limit; use a document URL instead",
          undefined,
          "invalid_input",
        );
      }
      return summarize(body, context.apiKey, context.fetcher, context.signal);
    },
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey, "API Key");
    return {
      profile: { displayName: "Kagi API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationMode: "local_non_empty_key" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "kagi",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bot " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [key, value] of Object.entries({
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    }))
      if (!headers.has(key)) headers.set(key, value);
  },
});
