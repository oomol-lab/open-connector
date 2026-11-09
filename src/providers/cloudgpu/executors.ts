import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
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

const service = "cloudgpu";
const apiBaseUrl = "https://cloudgpu.app/v1";
// Reasoning model completions may exceed the shared default request timeout.
const inferenceTimeoutMs = 300_000;

type ActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type RequestContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

interface CloudgpuRequest {
  path: "/models" | "/chat/completions" | "/gpu/account";
  body?: Record<string, unknown>;
}

const handlers: ProviderActionHandlers<"cloudgpu", ActionHandler> = {
  create_chat_completion(input, context) {
    if (input.stream === true) {
      throw providerInputError("stream=true is not supported by connector actions");
    }
    return requestCloudgpu({ path: "/chat/completions", body: input }, context);
  },
  list_models(_input, context) {
    return requestCloudgpu({ path: "/models" }, context);
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
});

export const credentialValidators: CredentialValidators = {
  // The model list is public, so validate against the account endpoint, which rejects an invalid key with 401 and runs no inference.
  async apiKey(input, { fetcher, signal }) {
    await requestCloudgpu({ path: "/gpu/account" }, { apiKey: input.apiKey, fetcher, signal });
    return {
      profile: { displayName: "CloudGPU API Key" },
      metadata: { validationEndpoint: "/gpu/account" },
    };
  },
};

function requestCloudgpu(input: CloudgpuRequest, context: RequestContext): Promise<Record<string, unknown>> {
  return runProviderRequest(
    {
      signal: context.signal,
      label: "CloudGPU",
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
        invalidJsonMessage: "CloudGPU returned invalid JSON",
        invalidJsonFallback: response.ok ? undefined : (text) => ({ message: text }),
      });
      if (!response.ok) {
        const error = optionalRecord(payload);
        const message =
          optionalString(optionalRecord(error?.error)?.message) ??
          optionalString(error?.error) ??
          optionalString(error?.message) ??
          `CloudGPU request failed with HTTP ${response.status}`;
        throw new ProviderRequestError(response.status, message, withRetryAfterSeconds(response, payload));
      }
      const result = requiredResponseRecord(payload, "CloudGPU response");
      if (input.path === "/models" && !Array.isArray(result.data)) {
        throw providerResponseError("CloudGPU returned a malformed model list");
      }
      return result;
    },
  );
}
