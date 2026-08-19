import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const replicateApiBaseUrl = "https://api.replicate.com";

const replicateValidationPath = "/v1/account";

type ReplicateActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface ReplicateRequestOptions {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  mode?: "validate" | "execute";
}

export const replicateActionHandlers: ProviderActionHandlers<"replicate", ReplicateActionHandler> = {
  get_account(_input, context) {
    return getAccount(context);
  },
  list_models(input, context) {
    return listModels(input, context);
  },
  get_model(input, context) {
    return getModel(input, context);
  },
  list_model_versions(input, context) {
    return listModelVersions(input, context);
  },
  get_model_version(input, context) {
    return getModelVersion(input, context);
  },
  list_collections(_input, context) {
    return listCollections(context);
  },
  get_collection(input, context) {
    return getCollection(input, context);
  },
  create_prediction(input, context) {
    return createPrediction(input, context);
  },
  get_prediction(input, context) {
    return getPrediction(input, context);
  },
  list_predictions(input, context) {
    return listPredictions(input, context);
  },
  cancel_prediction(input, context) {
    return cancelPrediction(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("replicate", replicateActionHandlers);

export async function validateReplicateCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const account = readObjectPayload(
    await replicateRequest({
      path: replicateValidationPath,
      mode: "validate",
      context: { apiKey, fetcher, signal },
    }),
    "account",
  );
  const username = optionalString(account.username);
  const name = optionalString(account.name);
  const type = optionalString(account.type);

  return {
    profile: {
      accountId: username ?? "replicate-api-token",
      displayName: name || username || "Replicate API Token",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: replicateValidationPath,
      username,
      name,
      type,
    }),
  };
}

async function getAccount(context: ApiKeyProviderContext): Promise<unknown> {
  return {
    account: readObjectPayload(await replicateRequest({ path: replicateValidationPath, context }), "account"),
  };
}

async function listModels(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return readPage(
    await replicateRequest({
      path: "/v1/models",
      query: compactObject({
        sort_by: optionalString(input.sortBy),
        sort_direction: optionalString(input.sortDirection),
      }),
      context,
    }),
    "models",
  );
}

async function getModel(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return {
    model: readObjectPayload(
      await replicateRequest({
        path: `/v1/models/${encodePathSegment(input.owner)}/${encodePathSegment(input.model)}`,
        context,
      }),
      "model",
    ),
  };
}

async function listModelVersions(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return readPage(
    await replicateRequest({
      path: `/v1/models/${encodePathSegment(input.owner)}/${encodePathSegment(input.model)}/versions`,
      context,
    }),
    "versions",
  );
}

async function getModelVersion(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return {
    version: readObjectPayload(
      await replicateRequest({
        path: `/v1/models/${encodePathSegment(input.owner)}/${encodePathSegment(input.model)}/versions/${encodePathSegment(input.versionId)}`,
        context,
      }),
      "version",
    ),
  };
}

async function listCollections(context: ApiKeyProviderContext): Promise<unknown> {
  return readPage(await replicateRequest({ path: "/v1/collections", context }), "collections");
}

async function getCollection(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return {
    collection: readObjectPayload(
      await replicateRequest({
        path: `/v1/collections/${encodePathSegment(input.collectionSlug)}`,
        context,
      }),
      "collection",
    ),
  };
}

async function createPrediction(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const headers = compactObject({
    ...(typeof input.waitSeconds === "number" ? { Prefer: `wait=${input.waitSeconds}` } : {}),
    ...(typeof input.cancelAfter === "string" ? { "Cancel-After": input.cancelAfter.trim() } : {}),
  });
  const body = compactObject({
    version: requiredString(input.version, "version", inputError),
    input: optionalRecord(input.input) ?? {},
    webhook: optionalString(input.webhook),
    webhook_events_filter: Array.isArray(input.webhookEventsFilter) ? input.webhookEventsFilter : undefined,
  });

  return {
    prediction: readObjectPayload(
      await replicateRequest({
        method: "POST",
        path: "/v1/predictions",
        headers,
        body,
        context,
      }),
      "prediction",
    ),
  };
}

async function getPrediction(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return {
    prediction: readObjectPayload(
      await replicateRequest({
        path: `/v1/predictions/${encodePathSegment(input.predictionId)}`,
        context,
      }),
      "prediction",
    ),
  };
}

async function listPredictions(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return readPage(
    await replicateRequest({
      path: "/v1/predictions",
      query: compactObject({
        created_after: optionalString(input.createdAfter),
        created_before: optionalString(input.createdBefore),
        source: optionalString(input.source),
      }),
      context,
    }),
    "predictions",
  );
}

async function cancelPrediction(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return {
    prediction: readObjectPayload(
      await replicateRequest({
        method: "POST",
        path: `/v1/predictions/${encodePathSegment(input.predictionId)}/cancel`,
        body: {},
        context,
      }),
      "prediction",
    ),
  };
}

async function replicateRequest(
  options: ReplicateRequestOptions & {
    context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  },
): Promise<unknown> {
  const url = new URL(options.path, replicateApiBaseUrl);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${options.context.apiKey}`,
    "user-agent": providerUserAgent,
    ...options.headers,
  });
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
    signal: options.context.signal,
  };
  if (options.body) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await options.context.fetcher(url, init);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Replicate request failed: ${error.message}` : "Replicate request failed",
    );
  }

  const payload = await readReplicateResponse(response);
  if (!response.ok) {
    throw mapReplicateError(response.status, payload, options.mode ?? "execute");
  }
  return payload;
}

async function readReplicateResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text };
  }
}

function mapReplicateError(status: number, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const payloadObject = optionalRecord(payload) ?? {};
  const detail =
    optionalString(payloadObject.detail) ??
    optionalString(payloadObject.title) ??
    `Replicate request failed with status ${status}`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, detail, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, detail, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(mode === "validate" ? 401 : 400, detail, payload);
  }
  return new ProviderRequestError(502, detail, payload);
}

function readObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const payload = optionalRecord(value);
  if (!payload) {
    throw new ProviderRequestError(502, `Replicate ${label} response must be an object`, value);
  }
  return payload;
}

function readPage(value: unknown, itemField: string): Record<string, unknown> {
  const payload = readObjectPayload(value, itemField);
  if (!Array.isArray(payload.results)) {
    throw new ProviderRequestError(502, `Replicate ${itemField} response must include an array results field`, payload);
  }

  return {
    [itemField]: payload.results,
    next: typeof payload.next === "string" ? payload.next : null,
    previous: typeof payload.previous === "string" ? payload.previous : null,
  };
}

function encodePathSegment(value: unknown): string {
  return encodeURIComponent(requiredString(value, "path segment", inputError));
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
