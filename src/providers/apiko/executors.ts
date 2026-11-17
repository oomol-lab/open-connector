import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredResponseRecord,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";

const service = "apiko";
const apiBaseUrl = "https://api.apiko.app/v1";
// Reasoning model completions may exceed the shared default request timeout.
const inferenceTimeoutMs = 300_000;

type ActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface ApikoRequest {
  path: "/models" | "/chat/completions";
  body?: Record<string, unknown>;
}

const handlers: ProviderActionHandlers<"apiko", ActionHandler> = {
  create_chat_completion(input, context) {
    if (input.stream === true) {
      throw providerInputError("stream=true is not supported by connector actions");
    }
    return requestApiko({ path: "/chat/completions", body: input }, context);
  },
  list_models(_input, context) {
    return requestApiko({ path: "/models" }, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  timeoutMs: inferenceTimeoutMs,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "apiko proxy request failed"),
      undefined,
      "provider_error",
    );
  },
});

export const credentialValidators: CredentialValidators = {
  // The model list requires a valid key and rejects an invalid one with 401 without running inference.
  async apiKey(input, { fetcher, signal }) {
    await requestApiko({ path: "/models" }, { apiKey: input.apiKey, fetcher, signal });
    return {
      profile: { displayName: "APIKO API Key" },
      metadata: { validationEndpoint: "/models" },
    };
  },
};

function requestApiko(input: ApikoRequest, context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  return runProviderRequest(
    {
      signal: context.signal,
      label: "APIKO",
      timeoutMs: input.body === undefined ? undefined : inferenceTimeoutMs,
    },
    async (signal) => {
      const response = await context.fetcher(`${apiBaseUrl}${input.path}`, {
        method: input.body === undefined ? "GET" : "POST",
        headers: {
          authorization: `Bearer ${context.apiKey}`,
          "content-type": "application/json",
          "user-agent": providerUserAgent,
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal,
      });
      const payload = await readProviderJsonBody(response, {
        emptyBody: null,
        invalidJsonMessage: "APIKO returned invalid JSON",
        invalidJsonFallback: response.ok ? undefined : (text) => ({ message: text }),
      });
      if (!response.ok) {
        const error = optionalRecord(payload);
        const message =
          optionalString(optionalRecord(error?.error)?.message) ??
          optionalString(error?.error) ??
          optionalString(error?.message) ??
          `APIKO request failed with HTTP ${response.status}`;
        throw new ProviderRequestError(
          response.status,
          message,
          withRetryAfterSeconds(response, payload),
          response.status === 429 ? "rate_limited" : "provider_error",
        );
      }
      const result = requiredResponseRecord(payload, "APIKO response");
      if (input.path === "/models" && !Array.isArray(result.data)) {
        throw providerResponseError("APIKO returned a malformed model list");
      }
      return result;
    },
  );
}
