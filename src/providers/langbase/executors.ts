import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "langbase";
const langbaseApiBaseUrl = "https://api.langbase.com";
const langbaseMemoryPath = "/v1/memory";
const langbaseRetrievePath = "/v1/memory/retrieve";

type LangbaseRequestPhase = "validate" | "execute";
type LangbaseActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const langbaseActionHandlers: ProviderActionHandlers<"langbase", LangbaseActionHandler> = {
  list_memories(_input, context) {
    return listLangbaseMemories(context);
  },
  create_memory(input, context) {
    return createLangbaseMemory(input, context);
  },
  delete_memory(input, context) {
    return deleteLangbaseMemory(input, context);
  },
  retrieve_memory(input, context) {
    return retrieveLangbaseMemory(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, langbaseActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateLangbaseCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};

async function validateLangbaseCredential(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<CredentialValidationResult> {
  const payload = await requestLangbaseJson({
    path: langbaseMemoryPath,
    context,
    phase: "validate",
  });
  const memories = ensureObjectArray(payload, "Langbase memory list");

  return {
    profile: {
      accountId: "api_key",
      displayName: "Langbase API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: langbaseApiBaseUrl,
      validationEndpoint: langbaseMemoryPath,
      memoryCount: memories.length,
    }),
  };
}

async function listLangbaseMemories(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestLangbaseJson({
    path: langbaseMemoryPath,
    context,
    phase: "execute",
  });

  return {
    memories: ensureObjectArray(payload, "Langbase memory list").map(normalizeMemorySummary),
  };
}

async function createLangbaseMemory(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestLangbaseJson({
    method: "POST",
    path: langbaseMemoryPath,
    context,
    phase: "execute",
    body: compactObject({
      name: optionalString(input.name),
      description: optionalString(input.description),
      embedding_model: optionalString(input.embedding_model),
      chunk_size: optionalNumber(input.chunk_size),
      chunk_overlap: optionalNumber(input.chunk_overlap),
      top_k: optionalNumber(input.top_k),
    }),
  });

  return {
    memory: normalizeMemorySummary(ensureObject(payload, "Langbase created memory")),
  };
}

async function deleteLangbaseMemory(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestLangbaseJson({
    method: "DELETE",
    path: `${langbaseMemoryPath}/${encodeURIComponent(String(input.memoryName))}`,
    context,
    phase: "execute",
  });

  return {
    success: ensureObject(payload, "Langbase delete response").success === true,
  };
}

async function retrieveLangbaseMemory(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await requestLangbaseJson({
    method: "POST",
    path: langbaseRetrievePath,
    context,
    phase: "execute",
    body: compactObject({
      query: optionalString(input.query),
      memory: input.memory,
      topK: optionalNumber(input.topK),
    }),
  });

  return {
    matches: ensureObjectArray(payload, "Langbase memory retrieve response").map((item) => ({
      text: optionalString(item.text) ?? "",
      similarity: optionalNumber(item.similarity) ?? 0,
      meta: normalizeStringRecord(item.meta),
    })),
  };
}

async function requestLangbaseJson(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: LangbaseRequestPhase;
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(new URL(input.path, langbaseApiBaseUrl), {
      method: input.method ?? "GET",
      headers: langbaseHeaders(input.context.apiKey, input.body != null),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
    payload = await readLangbasePayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Langbase request failed: ${error.message}` : "Langbase request failed",
    );
  }

  if (!response.ok) {
    throw createLangbaseError(response, payload, input.phase);
  }

  return payload;
}

function langbaseHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readLangbasePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createLangbaseError(response: Response, payload: unknown, phase: LangbaseRequestPhase): ProviderRequestError {
  const message = extractLangbaseErrorMessage(payload) ?? response.statusText ?? "Langbase request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractLangbaseErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalRecord(record.error);
  return (
    optionalString(record.message) ??
    optionalString(record.detail) ??
    optionalString(record.error) ??
    optionalString(error?.message) ??
    optionalString(error?.detail) ??
    optionalString(error?.error)
  );
}

function normalizeMemorySummary(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(payload.name) ?? "",
    description: optionalString(payload.description) ?? "",
    ownerLogin: optionalString(payload.owner_login) ?? optionalString(payload.ownerLogin) ?? "",
    url: optionalString(payload.url) ?? "",
    chunkSize: optionalNumber(payload.chunk_size) ?? optionalNumber(payload.chunkSize),
    chunkOverlap: optionalNumber(payload.chunk_overlap) ?? optionalNumber(payload.chunkOverlap),
    embeddingModel: optionalString(payload.embedding_model) ?? optionalString(payload.embeddingModel),
  });
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record)
      .map(([key, child]) => [key, optionalString(child)])
      .filter((entry): entry is [string, string] => entry[1] != null),
  );
}

function ensureObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is not an object`);
  }
  return record;
}

function ensureObjectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} is not an array`);
  }

  return value.map((item) => ensureObject(item, label));
}
