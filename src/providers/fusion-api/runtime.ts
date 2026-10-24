import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { FusionApiOperation } from "./operations.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { compactJson, encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  mapProviderActionHandlers,
  ProviderRequestError,
  providerUserAgent,
  defaultProviderRequestTimeoutMs,
} from "../provider-runtime.ts";
import { fusionApiOperations } from "./operations.ts";

export const fusionApiDefaultBaseUrl = "https://fusion-api.oomol.com";
const fusionApiLongRunningRequestTimeoutMs = 300_000;
const fusionApiLongRunningPaths = new Set(["/v1/deepseek-ocr/action/recognize", "/v1/jina-reader/action/read"]);
const fusionApiValidationPath = "/openapi/qwen-image?hideTaskStateAPI=true";

type FusionApiActionContext = ApiKeyProviderContext;

const fusionApiActionSources = fusionApiOperations.map((operation) => ({
  name: operation.actionName,
  operation,
}));

export const fusionApiActionHandlers: ProviderActionHandlers<
  "fusion-api",
  ProviderRuntimeHandler<FusionApiActionContext>
> = mapProviderActionHandlers(
  "fusion-api",
  fusionApiActionSources,
  ({ operation }) =>
    (input, context) =>
      executeFusionApiOperation(operation, input, context),
);

export async function validateFusionApiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await fusionApiRequest(
    {
      apiKey,
      fetcher,
      signal,
    },
    {
      method: "GET",
      path: fusionApiValidationPath,
      successStatuses: [200],
    },
  );

  return {
    profile: {
      accountId: "oomol-api-key",
      displayName: "OOMOL API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: fusionApiDefaultBaseUrl,
      validationEndpoint: fusionApiValidationPath,
    },
  };
}

async function executeFusionApiOperation(
  operation: FusionApiOperation,
  input: Record<string, unknown>,
  context: FusionApiActionContext,
): Promise<unknown> {
  return normalizeFusionApiPayload(
    await fusionApiRequest(context, {
      method: operation.method,
      path: buildFusionApiPath(operation, input),
      query: operation.method === "GET" ? buildFusionApiQuery(operation, input) : undefined,
      body: operation.method === "POST" ? buildFusionApiRequestBody(operation, input) : undefined,
      successStatuses: operation.successStatuses,
    }),
  );
}

interface FusionApiRequestContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface FusionApiRequest {
  method: "GET" | "POST";
  path: string;
  successStatuses: number[];
  query?: URLSearchParams;
  body?: unknown;
}

async function fusionApiRequest(context: FusionApiRequestContext, request: FusionApiRequest): Promise<unknown> {
  const url = new URL(request.path, `${fusionApiDefaultBaseUrl}/`);
  if (request.query) {
    for (const [key, value] of request.query) {
      url.searchParams.append(key, value);
    }
  }

  const requestTimeoutMs = fusionApiLongRunningPaths.has(request.path)
    ? fusionApiLongRunningRequestTimeoutMs
    : defaultProviderRequestTimeoutMs;
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: request.method,
      headers: fusionApiHeaders(context.apiKey, request.body !== undefined),
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `fusion-api ${request.path} request timed out after ${Math.ceil(requestTimeoutMs / 1000)} seconds`,
      );
    }
    const message = error instanceof Error && error.message.trim() ? error.message : "request failed";
    throw new ProviderRequestError(502, `fusion-api ${request.path} request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }

  if (request.successStatuses.includes(response.status)) {
    return readFusionApiPayload(response);
  }

  const error = await readFusionApiError(response);
  if (
    response.status === 400 ||
    response.status === 422 ||
    (response.status === 500 && error.state === "params_error")
  ) {
    throw new ProviderRequestError(400, error.message, undefined, "invalid_input");
  }
  throw new ProviderRequestError(response.status, error.message, undefined, "provider_error");
}

function buildFusionApiPath(operation: FusionApiOperation, input: Record<string, unknown>): string {
  let path = operation.path;
  for (const pathParam of operation.pathParams) {
    const rawValue = input[pathParam];
    if (rawValue == null || rawValue === "") {
      throw new ProviderRequestError(400, `${pathParam} is required`);
    }
    path = path.replace(`{${pathParam}}`, encodePathSegment(rawValue));
  }
  return path;
}

function buildFusionApiQuery(operation: FusionApiOperation, input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (operation.pathParams.includes(key) || value == null) {
      continue;
    }
    appendQueryValue(query, key, value);
  }
  return query;
}

function appendQueryValue(query: URLSearchParams, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(query, key, item);
    }
    return;
  }
  if (typeof value === "object") {
    query.append(key, JSON.stringify(value));
    return;
  }
  query.append(key, String(value));
}

function buildFusionApiRequestBody(operation: FusionApiOperation, input: Record<string, unknown>): unknown {
  return compactJson(Object.fromEntries(Object.entries(input).filter(([key]) => !operation.pathParams.includes(key))));
}

function fusionApiHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readFusionApiPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function normalizeFusionApiPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  if (record.success === true && typeof record.sessionID === "string") {
    return { sessionId: record.sessionID };
  }
  if (record.success === true && record.state === "completed" && "data" in record) {
    return {
      state: "completed",
      data: record.data,
    };
  }
  if (record.success === true && record.state === "completed") {
    return { state: "completed" };
  }
  if (record.success === true && record.state === "processing") {
    return {
      state: "processing",
      progress: record.progress,
    };
  }
  if (
    (record.success === true && record.state === "failed") ||
    (record.success === false && record.state === "error")
  ) {
    return { state: "failed", error: normalizeFusionApiError(payload, "fusion-api task failed").message };
  }
  if (record.success === false && record.state === "not_found") {
    return {
      state: "not_found",
      error: record.error,
    };
  }
  if (record.success === true && "data" in record) {
    return record.data;
  }
  return payload;
}

async function readFusionApiError(response: Response) {
  const text = await response.text().catch(() => "");
  const fallback = text.trim() || `fusion-api request failed with ${response.status}`;
  try {
    return normalizeFusionApiError(JSON.parse(text), fallback);
  } catch {
    return { message: fallback, state: undefined };
  }
}
function normalizeFusionApiError(payload: unknown, fallback: string) {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return {
    message:
      optionalString(record?.error) ?? optionalString(error?.message) ?? optionalString(record?.message) ?? fallback,
    state: optionalString(record?.state),
  };
}
