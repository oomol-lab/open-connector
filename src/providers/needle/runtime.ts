import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const needleApiBaseUrl = "https://needle.app";
const needleSearchBaseUrl = "https://search.needle.app";
const needleValidationPath = "/api/v1/collections";
const needleDefaultRequestTimeoutMs = 30_000;

type NeedleActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type NeedleActionHandler = (input: Record<string, unknown>, context: NeedleActionContext) => Promise<unknown>;

interface NeedleRequestInput {
  baseUrl?: string;
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  mode?: "validate" | "execute";
}

export const needleActionHandlers: ProviderActionHandlers<"needle", NeedleActionHandler> = {
  list_collections: (_input, context) => listCollections(context),
  create_collection: (input, context) => createCollection(input, context),
  get_collection: (input, context) => getCollection(input, context),
  get_collection_stats: (input, context) => getCollectionStats(input, context),
  list_collection_files: (input, context) => listCollectionFiles(input, context),
  add_files_to_collection: (input, context) => addFilesToCollection(input, context),
  search_collection: (input, context) => searchCollection(input, context),
};

export async function validateNeedleCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await needleRequest(
    {
      apiKey: input.apiKey,
      fetcher,
      signal,
    },
    {
      path: needleValidationPath,
      method: "GET",
      mode: "validate",
    },
  );

  return {
    profile: {
      accountId: "api_key",
      displayName: "Needle API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: needleApiBaseUrl,
      searchBaseUrl: needleSearchBaseUrl,
      validationEndpoint: needleValidationPath,
      collectionCount: readRequiredArray(payload.result, "result").length,
    },
  };
}

async function listCollections(context: NeedleActionContext): Promise<unknown> {
  const payload = await needleRequest(context, {
    path: "/api/v1/collections",
    method: "GET",
  });

  return {
    collections: readRequiredArray(payload.result, "result").map((item) => mapCollection(optionalRecord(item))),
  };
}

async function createCollection(input: Record<string, unknown>, context: NeedleActionContext): Promise<unknown> {
  const payload = await needleRequest(context, {
    path: "/api/v1/collections",
    method: "POST",
    body: compactObject({
      name: readInputString(input.name, "name"),
      file_ids: readOptionalInputStringArray(input.file_ids, "file_ids"),
    }),
  });

  return {
    collection: mapCollection(optionalRecord(payload.result)),
  };
}

async function getCollection(input: Record<string, unknown>, context: NeedleActionContext): Promise<unknown> {
  const payload = await needleRequest(context, {
    path: `/api/v1/collections/${encodeURIComponent(readInputString(input.collection_id, "collection_id"))}`,
    method: "GET",
  });

  return {
    collection: mapCollection(optionalRecord(payload.result)),
  };
}

async function getCollectionStats(input: Record<string, unknown>, context: NeedleActionContext): Promise<unknown> {
  const payload = await needleRequest(context, {
    path: `/api/v1/collections/${encodeURIComponent(readInputString(input.collection_id, "collection_id"))}/stats`,
    method: "GET",
  });

  const result = optionalRecord(payload.result);
  return compactObject({
    data_stats: readRequiredArray(result?.data_stats, "stats.data_stats").map((item) =>
      mapCollectionDataStats(optionalRecord(item)),
    ),
    chunks_count: optionalNumber(result?.chunks_count),
    characters: optionalNumber(result?.characters),
    users: optionalNumber(result?.users),
  });
}

async function listCollectionFiles(input: Record<string, unknown>, context: NeedleActionContext): Promise<unknown> {
  const payload = await needleRequest(context, {
    path: `/api/v1/collections/${encodeURIComponent(readInputString(input.collection_id, "collection_id"))}/files`,
    method: "GET",
  });

  return {
    files: readRequiredArray(payload.result, "result").map((item) => mapCollectionFile(optionalRecord(item))),
  };
}

async function addFilesToCollection(input: Record<string, unknown>, context: NeedleActionContext): Promise<unknown> {
  if (!Array.isArray(input.files) || input.files.length === 0) {
    throw new ProviderRequestError(400, "files must contain at least one item");
  }

  const files = input.files.map((item) => {
    const file = optionalRecord(item);
    return {
      name: readInputString(file?.name, "files[].name"),
      url: normalizeNeedleFileUrl(readInputString(file?.url, "files[].url")),
    };
  });

  const payload = await needleRequest(context, {
    path: `/api/v1/collections/${encodeURIComponent(readInputString(input.collection_id, "collection_id"))}/files`,
    method: "POST",
    body: {
      files,
    },
  });

  return {
    files: readRequiredArray(payload.result, "result").map((item) => mapCollectionFile(optionalRecord(item))),
  };
}

async function searchCollection(input: Record<string, unknown>, context: NeedleActionContext): Promise<unknown> {
  const collectionId = readInputString(input.collection_id, "collection_id");
  const payload = await needleRequest(context, {
    baseUrl: needleSearchBaseUrl,
    path: `/api/v1/collections/${encodeURIComponent(collectionId)}/search`,
    method: "POST",
    body: compactObject({
      text: readInputString(input.text, "text"),
      top_k: optionalNumber(input.top_k),
      offset: optionalNumber(input.offset),
    }),
  });

  return {
    results: readRequiredArray(payload.result, "result").map((item) => mapSearchResult(optionalRecord(item))),
  };
}

async function needleRequest(
  context: NeedleActionContext,
  input: NeedleRequestInput,
): Promise<Record<string, unknown>> {
  const response = await needleRawRequest(context, input);

  if (!response.ok) {
    throw await buildNeedleError(response, input.mode ?? "execute");
  }

  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    const payload = JSON.parse(text) as unknown;
    const object = optionalRecord(payload);
    if (!object) {
      throw new ProviderRequestError(502, "Needle returned a non-object JSON response");
    }
    return object;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Needle returned invalid JSON");
  }
}

async function needleRawRequest(context: NeedleActionContext, input: NeedleRequestInput): Promise<Response> {
  const timeout = createProviderTimeout(context.signal, needleDefaultRequestTimeoutMs);

  try {
    return await context.fetcher(new URL(input.path, input.baseUrl ?? needleApiBaseUrl), {
      method: input.method ?? "GET",
      headers: {
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Needle request timed out after ${Math.max(1, Math.ceil(needleDefaultRequestTimeoutMs / 1000))} seconds`,
      );
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Needle request failed: ${error.message}` : "Needle request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function buildNeedleError(response: Response, mode: "validate" | "execute"): Promise<ProviderRequestError> {
  const payload = await readNeedlePayload(response);
  const message = extractNeedleErrorMessage(payload) ?? `Needle request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (mode === "validate" && (response.status === 400 || response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }

  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

async function readNeedlePayload(response: Response): Promise<unknown> {
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

function extractNeedleErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return optionalString(error?.message) ?? optionalString(record?.message);
}

function mapCollection(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) {
    throw new ProviderRequestError(502, "Needle collection payload is missing");
  }

  return compactObject({
    ...value,
    id: readRequiredString(value.id, "collection.id"),
    name: readRequiredString(value.name, "collection.name"),
    embedding_model: optionalString(value.embedding_model),
    embedding_dimensions: optionalNumber(value.embedding_dimensions),
    search_queries: optionalNumber(value.search_queries),
    created_at: optionalString(value.created_at),
    updated_at: optionalString(value.updated_at),
  });
}

function mapCollectionFile(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) {
    throw new ProviderRequestError(502, "Needle file payload is missing");
  }

  return compactObject({
    ...value,
    id: readRequiredString(value.id, "file.id"),
    name: readRequiredString(value.name, "file.name"),
    type: readRequiredString(value.type, "file.type"),
    url: readRequiredString(value.url, "file.url"),
    user_id: readNullableString(value.user_id),
    connector_id: readNullableString(value.connector_id),
    size: readRequiredNumber(value.size, "file.size"),
    md5_hash: readNullableString(value.md5_hash),
    created_at: readRequiredString(value.created_at, "file.created_at"),
    updated_at: readRequiredString(value.updated_at, "file.updated_at"),
    status: readRequiredString(value.status, "file.status"),
  });
}

function mapCollectionDataStats(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) {
    throw new ProviderRequestError(502, "Needle collection stats bucket is missing");
  }

  return compactObject({
    ...value,
    status: optionalString(value.status),
    files: readRequiredNumber(value.files, "data_stats.files"),
    bytes: readRequiredNumber(value.bytes, "data_stats.bytes"),
  });
}

function mapSearchResult(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) {
    throw new ProviderRequestError(502, "Needle search result payload is missing");
  }

  return compactObject({
    ...value,
    id: optionalString(value.id),
    file_id: optionalString(value.file_id),
    content: readRequiredString(value.content, "result.content"),
    distance: optionalNumber(value.distance),
  });
}

function readRequiredArray(value: unknown, fieldName: string): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  throw new ProviderRequestError(502, `Needle response is missing ${fieldName}`);
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  throw new ProviderRequestError(502, `Needle response is missing ${fieldName}`);
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number") {
    return value;
  }

  throw new ProviderRequestError(502, `Needle response is missing ${fieldName}`);
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return optionalString(value);
}

function readOptionalInputStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new ProviderRequestError(400, `${fieldName} must be an array of strings`);
  }

  return value;
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function normalizeNeedleFileUrl(value: string): string {
  return assertPublicHttpUrl(value, {
    fieldName: "files[].url",
    createError: (message) => new ProviderRequestError(400, message),
  }).toString();
}
