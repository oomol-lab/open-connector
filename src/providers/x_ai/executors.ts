import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "x_ai";
const xAiApiBaseUrl = "https://api.x.ai/v1";

type XAiActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const xAiActionHandlers: ProviderActionHandlers<"x_ai", XAiActionHandler> = {
  list_models(_input, context) {
    return xAiRequest(context, { path: "/models", mode: "execute" });
  },
  get_model(input, context) {
    return xAiRequest(context, {
      path: `/models/${encodeURIComponent(String(input.model))}`,
      mode: "execute",
    });
  },
  create_chat_completion(input, context) {
    assertStreamingDisabled(input);
    return xAiRequest(context, {
      method: "POST",
      path: "/chat/completions",
      body: compactObject(input),
      mode: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, xAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await xAiRequest(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      {
        path: "/models",
        mode: "validate",
      },
    );
    const record = requireObject(payload, "xAI models response");
    const data = Array.isArray(record.data) ? record.data : [];
    return {
      profile: {
        accountId: "xai-api-key",
        displayName: "xAI API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v1/models",
        availableModels: data
          .map((model) => optionalString(optionalRecord(model)?.id))
          .filter((model): model is string => Boolean(model)),
      },
    };
  },
};

async function xAiRequest(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  request: {
    method?: "GET" | "POST";
    path: string;
    body?: Record<string, unknown>;
    mode: "validate" | "execute";
  },
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(`${xAiApiBaseUrl}${request.path}`, {
      method: request.method ?? "GET",
      headers: xAiHeaders(context.apiKey),
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `x_ai request failed: ${error.message}` : "x_ai request failed",
    );
  }

  if (!response.ok) {
    throw await buildXAiError(response, request.mode);
  }
  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, "x_ai returned malformed JSON");
  }
}

function xAiHeaders(apiKey: string): Headers {
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

async function buildXAiError(response: Response, mode: "validate" | "execute"): Promise<ProviderRequestError> {
  const error = await readXAiError(response);
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, error.message, error);
  }
  return new ProviderRequestError(response.status, error.message, error);
}

async function readXAiError(response: Response): Promise<{ type: string; code?: string; message: string }> {
  const raw = await response.text().catch(() => "");
  try {
    const payload = JSON.parse(raw) as {
      error?: unknown;
      message?: unknown;
    };
    const nestedError = optionalRecord(payload.error) ?? {};
    return {
      type: optionalString(nestedError.type) ?? "provider_error",
      code: optionalString(nestedError.code),
      message:
        optionalString(nestedError.message) ??
        optionalString(payload.message) ??
        `x_ai request failed with ${response.status}`,
    };
  } catch {
    return {
      type: "provider_error",
      message: raw || `x_ai request failed with ${response.status}`,
    };
  }
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}
