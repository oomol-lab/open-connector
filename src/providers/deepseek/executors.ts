import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  runProviderRequest,
  isAbortLikeError,
  providerInputError,
} from "../provider-runtime.ts";
const service = "deepseek";
const deepseekApiBaseUrl = "https://api.deepseek.com";
const deepseekAnthropicApiBaseUrl = "https://api.deepseek.com/anthropic";
type DeepseekActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
const handlers: Record<string, DeepseekActionHandler> = {
  search(input, context) {
    return deepseekRequest(context, { path: "/v1/tools/search", method: "POST", body: input });
  },
  fetch(input, context) {
    const url = URL.parse(String(input.url));
    if (!url || !["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password)
      throw providerInputError("url must be an HTTP or HTTPS URL with a host and no username or password");
    return deepseekRequest(context, { path: "/v1/tools/fetch", method: "POST", body: input });
  },
  list_models(_input, context) {
    return deepseekRequest(context, { path: "/models" });
  },
  get_user_balance(_input, context) {
    return deepseekRequest(context, { path: "/user/balance" });
  },
  create_chat_completion(input, context) {
    assertStreamingDisabled(input);
    return deepseekRequest(context, {
      path: "/chat/completions",
      method: "POST",
      body: compactObject(input),
      timeoutMs: 0,
    });
  },
  create_anthropic_message(input, context) {
    assertStreamingDisabled(input);
    return deepseekRequest(context, {
      baseUrl: deepseekAnthropicApiBaseUrl,
      path: "/v1/messages",
      method: "POST",
      body: compactObject(input),
      anthropic: true,
      timeoutMs: 0,
    });
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = { apiKey: input.apiKey, fetcher, signal };
    const payload = (await deepseekRequest(context, { path: "/models" })) as {
      data?: Array<{
        id?: unknown;
      }>;
    };
    return {
      profile: {
        displayName: "DeepSeek API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/models",
        availableModels: (payload.data ?? [])
          .map((model) => model.id)
          .filter((model): model is string => typeof model === "string"),
      },
    };
  },
};
interface DeepseekRequestOptions {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  baseUrl?: string;
  anthropic?: boolean;
  timeoutMs?: number;
}
async function deepseekRequest(context: ApiKeyProviderContext, request: DeepseekRequestOptions): Promise<unknown> {
  return runProviderRequest(
    { label: "DeepSeek", signal: context.signal, timeoutMs: request.timeoutMs },
    async (signal) => {
      const response = await context.fetcher(`${request.baseUrl ?? deepseekApiBaseUrl}${request.path}`, {
        method: request.method ?? "GET",
        headers: request.anthropic ? deepseekAnthropicHeaders(context.apiKey) : deepseekHeaders(context.apiKey),
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal,
      });
      await assertDeepseekResponse(response);
      try {
        return await response.json();
      } catch (error) {
        if (isAbortLikeError(error)) throw error;
        throw new ProviderRequestError(502, "deepseek returned malformed JSON");
      }
    },
  );
}
function deepseekHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}
function deepseekAnthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}
function assertStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by connector actions");
  }
}
async function assertDeepseekResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const error = await readDeepseekError(response);
  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message, error);
  }
  if (response.status === 400 || response.status === 422) {
    throw new ProviderRequestError(400, error.message, error);
  }
  throw new ProviderRequestError(response.status || 500, error.message, error, "provider_error");
}
async function readDeepseekError(response: Response): Promise<{
  type: string;
  code?: string;
  message: string;
}> {
  const raw = await response.text().catch(() => "");
  try {
    const payload = optionalRecord(JSON.parse(raw));
    const nested = optionalRecord(payload?.error);
    return {
      type: optionalString(nested?.type) ?? optionalString(payload?.type) ?? "provider_error",
      code: optionalString(nested?.code),
      message:
        optionalString(nested?.message) ??
        optionalString(payload?.message) ??
        (raw || `deepseek request failed with ${response.status}`),
    };
  } catch {
    return {
      type: "provider_error",
      message: raw || `deepseek request failed with ${response.status}`,
    };
  }
}
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.deepseek.com",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});
