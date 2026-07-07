import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { TogetherAiActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "together_ai";
const togetherAiApiBaseUrl = "https://api.together.ai/v1";

type TogetherAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const togetherAiActionHandlers: Record<TogetherAiActionName, TogetherAiActionHandler> = {
  list_models(_input, context) {
    return togetherAiRequest(context, { path: "/models" });
  },
  create_chat_completion(input, context) {
    assertStreamingDisabled(input);
    return togetherAiRequest(context, {
      method: "POST",
      path: "/chat/completions",
      body: compactObject(input),
    });
  },
  create_embedding(input, context) {
    return togetherAiRequest(context, {
      method: "POST",
      path: "/embeddings",
      body: compactObject(input),
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, togetherAiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: togetherAiApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = (await togetherAiRequest(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      {
        path: "/models",
        mode: "validate",
      },
    )) as Array<{ id?: unknown }>;

    return {
      profile: {
        displayName: "Together AI API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v1/models",
        availableModels: payload.map((model) => model.id).filter((model): model is string => typeof model === "string"),
      },
    };
  },
};

async function togetherAiRequest(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  request: {
    method?: "GET" | "POST";
    path: string;
    body?: Record<string, unknown>;
    mode?: "validate" | "execute";
  },
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(`${togetherAiApiBaseUrl}${request.path}`, {
      method: request.method ?? "GET",
      headers: togetherAiHeaders(context.apiKey),
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Together AI request failed: ${error.message}` : "Together AI request failed",
    );
  }

  await assertTogetherAiResponse(response, request.mode ?? "execute");
  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, "together_ai returned malformed JSON");
  }
}

function togetherAiHeaders(apiKey: string): Headers {
  return new Headers({
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  });
}

function assertStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by connector actions");
  }
}

async function assertTogetherAiResponse(response: Response, mode: "validate" | "execute"): Promise<void> {
  if (response.ok) {
    return;
  }

  const error = await readTogetherAiError(response);
  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message, error);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, error.message, error);
  }
  if (mode === "execute" && response.status === 401) {
    throw new ProviderRequestError(401, error.message, error);
  }
  if (mode === "execute" && response.status === 403) {
    throw new ProviderRequestError(500, error.message, error);
  }
  if (response.status === 400 || response.status === 422) {
    throw new ProviderRequestError(400, error.message, error);
  }

  throw new ProviderRequestError(response.status, error.message, error);
}

async function readTogetherAiError(response: Response): Promise<{
  type: string;
  code?: string;
  message: string;
}> {
  const raw = await response.text().catch(() => "");
  try {
    const payload = optionalRecord(JSON.parse(raw));
    const nestedError = optionalRecord(payload?.error);
    return {
      type: optionalString(nestedError?.type) ?? "provider_error",
      code: optionalString(nestedError?.code),
      message:
        optionalString(nestedError?.message) ??
        optionalString(payload?.message) ??
        `together_ai request failed with ${response.status}`,
    };
  } catch {
    return {
      type: "provider_error",
      code: undefined,
      message: raw || `together_ai request failed with ${response.status}`,
    };
  }
}
