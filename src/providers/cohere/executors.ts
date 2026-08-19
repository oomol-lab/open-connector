import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "cohere";
const cohereApiBaseUrl = "https://api.cohere.com";

type CohereActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const cohereActionHandlers: ProviderActionHandlers<"cohere", CohereActionHandler> = {
  chat(input, context) {
    assertStreamingDisabled(input);
    return coherePost(context, "/v2/chat", input);
  },
  embed_texts(input, context) {
    assertTextOnlyEmbedding(input);
    return coherePost(context, "/v2/embed", input);
  },
  rerank_documents(input, context) {
    return coherePost(context, "/v2/rerank", input);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cohereActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await cohereGet({ apiKey: input.apiKey, fetcher, signal }, "/v1/models?page_size=1", "validate");
    return {
      profile: {
        displayName: "Cohere API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: cohereApiBaseUrl,
        validationEndpoint: "/v1/models",
      },
    };
  },
};

async function coherePost(
  context: ApiKeyProviderContext,
  path: string,
  input: Record<string, unknown>,
  mode: "validate" | "execute" = "execute",
): Promise<unknown> {
  const response = await context.fetcher(`${cohereApiBaseUrl}${path}`, {
    method: "POST",
    headers: cohereHeaders(context.apiKey),
    body: JSON.stringify(compactObject(input)),
    signal: context.signal,
  });

  await assertCohereResponse(response, mode);
  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, "cohere returned an invalid JSON response");
  }
}

async function cohereGet(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  mode: "validate" | "execute" = "execute",
): Promise<unknown> {
  const response = await context.fetcher(`${cohereApiBaseUrl}${path}`, {
    method: "GET",
    headers: cohereHeaders(context.apiKey, false),
    signal: context.signal,
  });

  await assertCohereResponse(response, mode);
  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, "cohere returned an invalid JSON response");
  }
}

function cohereHeaders(apiKey: string, hasJsonBody = true): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function assertStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by connector actions");
  }
}

function assertTextOnlyEmbedding(input: Record<string, unknown>): void {
  if ("images" in input || "inputs" in input) {
    throw new ProviderRequestError(
      400,
      "cohere embed_texts only supports the texts field; image and mixed inputs are deferred",
    );
  }
}

async function assertCohereResponse(response: Response, mode: "validate" | "execute"): Promise<void> {
  if (response.ok) {
    return;
  }

  const error = await readCohereError(response);
  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message, error);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403 || response.status === 498)) {
    throw new ProviderRequestError(400, error.message, error);
  }
  if (response.status === 401 || response.status === 403 || response.status === 498) {
    throw new ProviderRequestError(response.status, error.message, error);
  }
  if (response.status === 400 || response.status === 422) {
    throw new ProviderRequestError(400, error.message, error);
  }

  throw new ProviderRequestError(response.status || 500, error.message, error);
}

async function readCohereError(response: Response): Promise<{ id?: string; message: string }> {
  const raw = await response.text().catch(() => "");
  try {
    const payload = optionalRecord(JSON.parse(raw));
    const nestedError = optionalRecord(payload?.error);
    return {
      id: optionalString(nestedError?.id) ?? optionalString(payload?.id),
      message:
        optionalString(nestedError?.message) ??
        optionalString(payload?.message) ??
        (raw || `cohere request failed with ${response.status}`),
    };
  } catch {
    return {
      message: raw || `cohere request failed with ${response.status}`,
    };
  }
}
