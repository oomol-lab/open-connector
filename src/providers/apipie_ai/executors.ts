import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { ApipieAiActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "apipie_ai";
const apipieAiApiBaseUrl = "https://apipie.ai/v1";

type ApipieAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const apipieAiActionHandlers: Record<ApipieAiActionName, ApipieAiActionHandler> = {
  list_models(_input, context) {
    return apipieAiRequest(context, { path: "/models" });
  },
  list_detailed_models(_input, context) {
    return apipieAiRequest(context, { path: "/models/details" });
  },
  create_chat_completion(input, context) {
    assertStreamingDisabled(input);
    return apipieAiRequest(context, {
      method: "POST",
      path: "/chat/completions",
      body: compactObject(input),
    });
  },
  create_embedding(input, context) {
    return apipieAiRequest(context, {
      method: "POST",
      path: "/embeddings",
      body: compactObject(input),
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, apipieAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = (await apipieAiRequest(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      {
        path: "/models",
        mode: "validate",
      },
    )) as {
      data?: Array<{ id?: unknown }>;
    };

    return {
      profile: {
        displayName: "APIpie AI API Key",
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

async function apipieAiRequest(
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
    response = await context.fetcher(`${apipieAiApiBaseUrl}${request.path}`, {
      method: request.method ?? "GET",
      headers: apipieAiHeaders(context.apiKey),
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `APIpie AI request failed: ${error.message}` : "APIpie AI request failed",
    );
  }

  await assertApipieAiResponse(response, request.mode ?? "execute");
  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, "apipie_ai returned malformed JSON");
  }
}

function apipieAiHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

function assertStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by connector actions");
  }
}

async function assertApipieAiResponse(response: Response, mode: "validate" | "execute"): Promise<void> {
  if (response.ok) {
    return;
  }

  const error = await readApipieAiError(response);
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

async function readApipieAiError(response: Response): Promise<{
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
        `apipie_ai request failed with ${response.status}`,
    };
  } catch {
    return {
      type: "provider_error",
      code: undefined,
      message: raw || `apipie_ai request failed with ${response.status}`,
    };
  }
}
