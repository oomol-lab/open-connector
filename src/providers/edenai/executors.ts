import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { EdenAiActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "edenai";
const edenaiApiBaseUrl = "https://api.edenai.run/v3";

type EdenAiActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const edenaiActionHandlers: Record<EdenAiActionName, EdenAiActionHandler> = {
  list_models(_input, context) {
    return edenaiRequest(context, { path: "/models", mode: "execute" });
  },
  create_chat_completion(input, context) {
    assertStreamingDisabled(input);
    return edenaiRequest(context, {
      method: "POST",
      path: "/chat/completions",
      body: compactObject(input),
      mode: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, edenaiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await edenaiRequest(
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
    const record = requireObject(payload, "Eden AI models response");
    const data = Array.isArray(record.data) ? record.data : [];
    return {
      profile: {
        accountId: "edenai-api-key",
        displayName: "Eden AI API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v3/models",
        availableModels: data
          .map((model) => optionalString(optionalRecord(model)?.id))
          .filter((model): model is string => Boolean(model)),
      },
    };
  },
};

async function edenaiRequest(
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
    response = await context.fetcher(`${edenaiApiBaseUrl}${request.path}`, {
      method: request.method ?? "GET",
      headers: edenaiHeaders(context.apiKey),
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `edenai request failed: ${error.message}` : "edenai request failed",
    );
  }

  if (!response.ok) {
    throw await buildEdenAiError(response, request.mode);
  }
  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, "edenai returned malformed JSON");
  }
}

function edenaiHeaders(apiKey: string): Headers {
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

async function buildEdenAiError(response: Response, mode: "validate" | "execute"): Promise<ProviderRequestError> {
  const error = await readEdenAiError(response);
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, error.message, error);
  }
  return new ProviderRequestError(response.status, error.message, error);
}

async function readEdenAiError(response: Response): Promise<{ type: string; code?: string; message: string }> {
  const raw = await response.text().catch(() => "");
  try {
    const payload = JSON.parse(raw) as {
      error?: unknown;
      message?: unknown;
      detail?: unknown;
    };
    const nestedError = optionalRecord(payload.error) ?? {};
    return {
      type: optionalString(nestedError.type) ?? "provider_error",
      code: optionalString(nestedError.code),
      message:
        optionalString(nestedError.message) ??
        optionalString(payload.message) ??
        optionalString(payload.detail) ??
        `edenai request failed with ${response.status}`,
    };
  } catch {
    return {
      type: "provider_error",
      message: raw || `edenai request failed with ${response.status}`,
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
