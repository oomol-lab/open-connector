import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const perplexityApiBaseUrl = "https://api.perplexity.ai";

type PerplexityMode = "validate" | "execute";
type PerplexityActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const perplexityActionHandlers: ProviderActionHandlers<"perplexity", PerplexityActionHandler> = {
  list_models(_input, context) {
    return perplexityRequest("/v1/models", "GET", {}, context, "execute");
  },
  search(input, context) {
    return perplexityRequest("/search", "POST", input, context, "execute");
  },
  create_chat_completion(input, context) {
    assertStreamingDisabled(input);
    return perplexityRequest("/v1/sonar", "POST", input, context, "execute");
  },
  create_embeddings(input, context) {
    validateEmbeddingDimensions(input);
    return perplexityRequest("/v1/embeddings", "POST", input, context, "execute");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("perplexity", perplexityActionHandlers);

export async function validatePerplexityCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const payload = await perplexityRequest(
    "/v1/models",
    "GET",
    {},
    {
      apiKey: input.apiKey,
      fetcher,
    },
    "validate",
  );
  const record = optionalRecord(payload);
  const data = Array.isArray(record?.data) ? record.data : [];
  const availableModels = data
    .map((model) => optionalString(optionalRecord(model)?.id))
    .filter((model): model is string => model !== undefined);

  return {
    profile: {
      accountId: "perplexity-api-key",
      displayName: "Perplexity API Key",
      grantedScopes: [],
    },
    metadata: {
      validationEndpoint: "/v1/models",
      availableModels,
    },
  };
}

async function perplexityRequest(
  path: string,
  method: "GET" | "POST",
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher">,
  mode: PerplexityMode,
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(new URL(path, perplexityApiBaseUrl), {
      method,
      headers: perplexityHeaders(context.apiKey),
      body: method === "POST" ? JSON.stringify(compactObject(input)) : undefined,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Perplexity request failed: ${error.message}` : "Perplexity request failed",
    );
  }

  if (!response.ok) {
    throw await mapPerplexityError(response, mode);
  }

  return response.json() as Promise<unknown>;
}

function perplexityHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

function assertStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by connector actions");
  }
}

function validateEmbeddingDimensions(input: Record<string, unknown>): void {
  const dimensions = optionalInteger(input.dimensions);
  if (dimensions === undefined) {
    return;
  }

  const model = optionalString(input.model);
  const maxDimensions = model === "pplx-embed-v1-0.6b" ? 1024 : 2560;
  if (dimensions < 128 || dimensions > maxDimensions) {
    throw new ProviderRequestError(
      400,
      `${model ?? "Perplexity embedding model"} dimensions must be between 128 and ${maxDimensions}`,
    );
  }
}

async function mapPerplexityError(response: Response, mode: PerplexityMode): Promise<ProviderRequestError> {
  const error = await readPerplexityError(response);
  if (response.status === 429) {
    return new ProviderRequestError(429, error.message, error);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, error.message, error);
  }
  if (mode === "execute" && response.status === 401) {
    return new ProviderRequestError(401, error.message, error);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, error.message, error);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, error.message, error);
}

async function readPerplexityError(response: Response): Promise<{
  type: string;
  code?: string;
  message: string;
}> {
  try {
    const payload = optionalRecord(await response.json());
    const nestedError = optionalRecord(payload?.error);

    return {
      type: optionalString(nestedError?.type) ?? optionalString(payload?.type) ?? "provider_error",
      code: optionalString(nestedError?.code) ?? optionalString(payload?.code),
      message:
        optionalString(nestedError?.message) ??
        optionalString(nestedError?.detail) ??
        optionalString(payload?.message) ??
        optionalString(payload?.detail) ??
        `perplexity request failed with ${response.status}`,
    };
  } catch {
    const message = (await response.text().catch(() => "")) || `perplexity request failed with ${response.status}`;
    return {
      type: "provider_error",
      message,
    };
  }
}
