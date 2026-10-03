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

const service = "api_route";
const apiBaseUrl = "https://global.api-route.com/v1";
// Reasoning model completions may exceed the shared default request timeout.
const inferenceTimeoutMs = 300_000;

type ActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type RequestContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

interface ApiRouteRequest {
  path: "/models" | "/chat/completions";
  body?: Record<string, unknown>;
  phase?: "validate" | "execute";
}

const handlers: ProviderActionHandlers<"api_route", ActionHandler> = {
  create_chat_completion(input, context) {
    if (input.stream === true) {
      throw providerInputError("stream=true is not supported by connector actions");
    }
    return requestApiRoute({ path: "/chat/completions", body: input }, context);
  },
  list_models(_input, context) {
    return requestApiRoute({ path: "/models" }, context);
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
    const payload = await requestApiRoute(
      { path: "/models", phase: "validate" },
      { apiKey: input.apiKey, fetcher, signal },
    );
    return {
      profile: { displayName: "API Route API Key" },
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

function requestApiRoute(input: ApiRouteRequest, context: RequestContext): Promise<Record<string, unknown>> {
  return runProviderRequest(
    {
      signal: context.signal,
      label: "API Route",
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
        invalidJsonMessage: "API Route returned invalid JSON",
        invalidJsonFallback: response.ok ? undefined : (text) => ({ message: text }),
      });
      if (!response.ok) {
        const error = optionalRecord(payload);
        const message =
          optionalString(optionalRecord(error?.error)?.message) ??
          optionalString(error?.message) ??
          `API Route request failed with HTTP ${response.status}`;
        const status =
          input.phase === "validate" && (response.status === 401 || response.status === 403) ? 400 : response.status;
        throw new ProviderRequestError(status, message, payload);
      }
      const result = requiredResponseRecord(payload, "API Route response");
      if (input.path === "/models" && !Array.isArray(result.data)) {
        throw providerResponseError("API Route returned a malformed model list");
      }
      return result;
    },
  );
}
