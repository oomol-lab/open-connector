import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "anthropic";
const anthropicApiBaseUrl = "https://api.anthropic.com";
const anthropicApiVersion = "2023-06-01";

type AnthropicActionHandler = (
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) => Promise<unknown>;

export const anthropicActionHandlers: Record<string, AnthropicActionHandler> = {
  list_models(input, context) {
    return anthropicListModels(input, context);
  },
  get_model(input, context) {
    return anthropicGetModel(input, context);
  },
  create_message(input, context) {
    return anthropicCreateMessage(input, context);
  },
  count_message_tokens(input, context) {
    return anthropicCountMessageTokens(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, anthropicActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = (await anthropicRequest(
      input.apiKey,
      {
        path: "/v1/models",
        mode: "validate",
      },
      fetcher,
      signal,
    )) as {
      data?: Array<{ id?: unknown }>;
    };

    return {
      profile: {
        displayName: "Anthropic API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v1/models",
        availableModels: (payload.data ?? [])
          .map((model) => model.id)
          .filter((model): model is string => typeof model === "string"),
      },
    };
  },
};

async function anthropicListModels(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const searchParams = new URLSearchParams();
  for (const key of ["before_id", "after_id", "limit"]) {
    const value = input[key];
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return anthropicRequest(
    context.apiKey,
    {
      path: query ? `/v1/models?${query}` : "/v1/models",
    },
    context.fetcher,
    context.signal,
  );
}

async function anthropicGetModel(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return anthropicRequest(
    context.apiKey,
    {
      path: `/v1/models/${encodeURIComponent(requiredString(input.model_id, "model_id", providerInputError))}`,
    },
    context.fetcher,
    context.signal,
  );
}

async function anthropicCreateMessage(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  assertStreamingDisabled(input);
  return anthropicRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/v1/messages",
      body: compactObject(input),
    },
    context.fetcher,
    context.signal,
  );
}

async function anthropicCountMessageTokens(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return anthropicRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/v1/messages/count_tokens",
      body: compactObject(input),
    },
    context.fetcher,
    context.signal,
  );
}

async function anthropicRequest(
  apiKey: string,
  request: {
    method?: "GET" | "POST";
    path: string;
    body?: Record<string, unknown>;
    mode?: "validate" | "execute";
  },
  fetcher: typeof fetch,
  signal?: AbortSignal,
) {
  const response = await fetcher(`${anthropicApiBaseUrl}${request.path}`, {
    method: request.method ?? "GET",
    headers: anthropicHeaders(apiKey),
    body: request.body ? JSON.stringify(request.body) : undefined,
    signal,
  });

  await assertAnthropicResponse(response, request.mode ?? "execute");
  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, "anthropic returned malformed JSON");
  }
}

function anthropicHeaders(apiKey: string) {
  return {
    "anthropic-version": anthropicApiVersion,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

function assertStreamingDisabled(input: Record<string, unknown>) {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by connector actions");
  }
}

async function assertAnthropicResponse(response: Response, mode: "validate" | "execute") {
  if (response.ok) {
    return;
  }

  const error = await readAnthropicError(response);

  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, error.message);
  }
  if (mode === "execute" && response.status === 401) {
    throw new ProviderRequestError(401, error.message);
  }
  if (mode === "execute" && response.status === 403) {
    throw new ProviderRequestError(403, error.message);
  }
  if (response.status === 400 || response.status === 422) {
    throw new ProviderRequestError(400, error.message);
  }

  throw new ProviderRequestError(response.status || 500, error.message);
}

async function readAnthropicError(response: Response) {
  const raw = await response.text().catch(() => "");
  try {
    const payload = optionalRecord(JSON.parse(raw));
    const nestedError = optionalRecord(payload?.error);

    return {
      type: optionalString(nestedError?.type) ?? optionalString(payload?.type) ?? "provider_error",
      message: optionalString(nestedError?.message) ?? (raw || `anthropic request failed with ${response.status}`),
    };
  } catch {
    return {
      type: "provider_error",
      message: raw || `anthropic request failed with ${response.status}`,
    };
  }
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
