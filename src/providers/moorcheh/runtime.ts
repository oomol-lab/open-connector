import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalNumber, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const moorchehApiBaseUrl = "https://api.moorcheh.ai/v1";

const requestTimeoutMs = 30_000;
const namespaceNamePattern = /^[A-Za-z0-9_-]+$/u;

type RequestPhase = "validate" | "execute";

interface MoorchehRequestInput {
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
}

export const moorchehActionHandlers: ProviderActionHandlers<
  "moorcheh",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  create_text_namespace(input, context) {
    return requestMoorchehJson(
      {
        path: "/namespaces",
        method: "POST",
        body: { namespace_name: readNamespaceName(input.namespace_name), type: "text" },
      },
      context,
      "execute",
    );
  },
  list_namespaces(_input, context) {
    return requestMoorchehJson(
      {
        path: "/namespaces",
        method: "GET",
      },
      context,
      "execute",
    );
  },
  upload_text_documents(input, context) {
    const namespaceName = readNamespaceName(input.namespace_name);
    return requestMoorchehJson(
      {
        path: namespacePath(namespaceName, "/documents"),
        method: "POST",
        body: { documents: readDocuments(input.documents) },
      },
      context,
      "execute",
    );
  },
  get_documents(input, context) {
    const namespaceName = readNamespaceName(input.namespace_name);
    return requestMoorchehJson(
      {
        path: namespacePath(namespaceName, "/documents/get"),
        method: "POST",
        body: { ids: readStringArray(input.ids, "ids", 100) },
      },
      context,
      "execute",
    );
  },
  fetch_text_data(input, context) {
    const namespaceName = readNamespaceName(input.namespace_name);
    const url = new URL(namespacePath(namespaceName, "/documents/fetch-text-data"), moorchehApiBaseUrl);
    const limit = optionalInteger(input.limit);
    const nextToken = readOptionalTrimmedString(input.next_token, "next_token");
    if (limit !== undefined) {
      if (limit < 1 || limit > 100) {
        throw new ProviderRequestError(400, "limit must be between 1 and 100");
      }
      url.searchParams.set("limit", String(limit));
    }
    if (nextToken !== undefined) {
      url.searchParams.set("next_token", nextToken);
    }
    return requestMoorchehJson(
      {
        path: `${url.pathname}${url.search}`,
        method: "GET",
      },
      context,
      "execute",
    );
  },
  delete_documents(input, context) {
    const namespaceName = readNamespaceName(input.namespace_name);
    return requestMoorchehJson(
      {
        path: namespacePath(namespaceName, "/documents/delete"),
        method: "POST",
        body: { ids: readStringArray(input.ids, "ids", 1000) },
      },
      context,
      "execute",
    );
  },
  search_text(input, context) {
    return requestMoorchehJson(
      {
        path: "/search",
        method: "POST",
        body: buildSearchBody(input),
      },
      context,
      "execute",
    );
  },
};

export async function validateMoorchehCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestMoorchehJson(
    {
      path: "/namespaces",
      method: "GET",
    },
    { apiKey, fetcher, signal },
    "validate",
  );
  const namespaceCount = Array.isArray(payload.namespaces) ? payload.namespaces.length : undefined;

  return {
    profile: {
      accountId: "moorcheh:api-key",
      displayName: "Moorcheh API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: moorchehApiBaseUrl,
      namespaceCount,
    },
  };
}

async function requestMoorchehJson(
  input: MoorchehRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: RequestPhase,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(new URL(`${moorchehApiBaseUrl}${input.path}`), {
      method: input.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Moorcheh request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Moorcheh request failed: ${error.message}` : "Moorcheh request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createMoorchehError(response.status, payload, phase);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Moorcheh returned an invalid payload");
  }
  return record;
}

function namespacePath(value: string, suffix: string): string {
  return `/namespaces/${encodeURIComponent(value)}${suffix}`;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Moorcheh returned invalid JSON");
  }
}

function createMoorchehError(status: number, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ?? optionalString(record?.error) ?? `Moorcheh request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function buildSearchBody(input: Record<string, unknown>): Record<string, unknown> {
  const query = readRequiredTrimmedString(input.query, "query");
  const namespaces = readStringArray(input.namespaces, "namespaces").map((value) => readNamespaceName(value));
  const topK = optionalInteger(input.top_k);
  const kioskMode = typeof input.kiosk_mode == "boolean" ? input.kiosk_mode : undefined;
  const threshold = optionalNumber(input.threshold);

  if (topK !== undefined && topK < 1) {
    throw new ProviderRequestError(400, "top_k must be at least 1");
  }
  if (threshold !== undefined && (threshold < 0 || threshold > 1)) {
    throw new ProviderRequestError(400, "threshold must be between 0 and 1");
  }
  if (kioskMode === true && threshold === undefined) {
    throw new ProviderRequestError(400, "threshold is required in kiosk mode");
  }

  return jsonObject({
    query,
    namespaces,
    top_k: topK,
    kiosk_mode: kioskMode,
    threshold,
  });
}

function readDocuments(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "documents must be a non-empty array");
  }

  return value.map((item, index) => {
    const document = requiredRecord(item, `documents[${index}]`, (message) => new ProviderRequestError(400, message));
    return {
      ...document,
      id: readRequiredTrimmedString(document.id, `documents[${index}].id`),
      text: readRequiredTrimmedString(document.text, `documents[${index}].text`),
    };
  });
}

function readNamespaceName(value: unknown): string {
  const namespaceName = readRequiredTrimmedString(value, "namespace_name");
  if (!namespaceNamePattern.test(namespaceName)) {
    throw new ProviderRequestError(400, "namespace_name must contain only letters, numbers, hyphens, or underscores");
  }
  return namespaceName;
}

function readStringArray(value: unknown, fieldName: string, maxItems?: number): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty array`);
  }
  if (maxItems !== undefined && value.length > maxItems) {
    throw new ProviderRequestError(400, `${fieldName} must contain at most ${maxItems} items`);
  }
  return value.map((item, index) => readRequiredTrimmedString(item, `${fieldName}[${index}]`));
}

function readOptionalTrimmedString(value: unknown, fieldName: string): string | undefined {
  if (value == null) {
    return undefined;
  }
  return readRequiredTrimmedString(value, fieldName);
}

function readRequiredTrimmedString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  }
  const text = value.trim();
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  }
  return text;
}
