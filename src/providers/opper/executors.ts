import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { looseArray, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "opper";
const apiBaseUrl = "https://api.opper.ai/v3/compat";
const anthropicApiVersion = "2023-06-01";
// Reasoning model completions may exceed the shared default request timeout.
const inferenceTimeoutMs = 300_000;

type ActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type RequestContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

interface OpperRequest {
  path: "/models" | "/chat/completions" | "/v1/messages";
  body?: Record<string, unknown>;
}

const handlers: ProviderActionHandlers<"opper", ActionHandler> = {
  create_chat_completion(input, context) {
    if (input.stream === true) {
      throw providerInputError("stream=true is not supported by connector actions");
    }
    return requestOpper({ path: "/chat/completions", body: input }, context);
  },
  create_message(input, context) {
    if (input.stream === true) {
      throw providerInputError("stream=true is not supported by connector actions");
    }
    return requestOpper({ path: "/v1/messages", body: input }, context);
  },
  list_models(_input, context) {
    return requestOpper({ path: "/models" }, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestOpper({ path: "/models" }, { apiKey: input.apiKey, fetcher, signal });
    return {
      profile: { displayName: "Opper API Key" },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/models",
        availableModels: looseArray(payload.data)
          .map((model) => optionalString(optionalRecord(model)?.id))
          .filter((id): id is string => id !== undefined),
      },
    };
  },
};

function requestOpper(input: OpperRequest, context: RequestContext): Promise<Record<string, unknown>> {
  const headers = new Headers({
    authorization: `Bearer ${context.apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  });
  // The Anthropic Messages-compatible endpoint takes the same header as Anthropic's API.
  if (input.path === "/v1/messages") {
    headers.set("anthropic-version", anthropicApiVersion);
  }
  return runProviderRequest(
    {
      signal: context.signal,
      label: "Opper",
      timeoutMs: input.body === undefined ? undefined : inferenceTimeoutMs,
    },
    async (signal) => {
      const response = await context.fetcher(`${apiBaseUrl}${input.path}`, {
        method: input.body === undefined ? "GET" : "POST",
        headers,
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal,
      });
      const payload = await readProviderJsonBody(response, {
        emptyBody: null,
        invalidJsonMessage: "Opper returned invalid JSON",
        invalidJsonFallback: response.ok ? undefined : (text) => ({ message: text }),
      });
      if (!response.ok) {
        const error = optionalRecord(payload);
        const message =
          optionalString(optionalRecord(error?.error)?.message) ??
          optionalString(error?.message) ??
          `Opper request failed with HTTP ${response.status}`;
        const status = response.status;
        throw new ProviderRequestError(status, message, payload, status === 429 ? "rate_limited" : "provider_error");
      }
      const result = requiredResponseRecord(payload, "Opper response");
      if (input.path === "/models" && !Array.isArray(result.data)) {
        throw providerResponseError("Opper returned a malformed model list");
      }
      return result;
    },
  );
}
