import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, looseArray, optionalBoolean, optionalRawString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const ragieApiBaseUrl = "https://api.ragie.ai";

interface RagieRequestInput {
  method?: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  partition?: string;
  range?: string;
}

type RagieActionContext = {
  apiKey: string;
  fetcher: typeof fetch;
};

type RagieActionHandler = (input: Record<string, unknown>, context: RagieActionContext) => Promise<unknown>;

export const ragieActionHandlers: ProviderActionHandlers<"ragie", RagieActionHandler> = {
  retrieve: (input, context) => ragieRetrieve(input, context),
  list_documents: (input, context) => ragieListDocuments(input, context),
  get_document: (input, context) => ragieGetDocument(input, context),
  create_document_raw: (input, context) => ragieCreateDocumentRaw(input, context),
  create_document_from_url: (input, context) => ragieCreateDocumentFromUrl(input, context),
  patch_document_metadata: (input, context) => ragiePatchDocumentMetadata(input, context),
  get_document_content: (input, context) => ragieGetDocumentContent(input, context),
  get_document_summary: (input, context) => ragieGetDocumentSummary(input, context),
  get_document_chunks: (input, context) => ragieGetDocumentChunks(input, context),
  delete_document: (input, context) => ragieDeleteDocument(input, context),
  list_partitions: (input, context) => ragieListPartitions(context, input),
  get_partition: (input, context) => ragieGetPartition(input, context),
  create_partition: (input, context) => ragieCreatePartition(input, context),
  update_partition: (input, context) => ragieUpdatePartition(input, context),
  set_partition_limits: (input, context) => ragieSetPartitionLimits(input, context),
  delete_partition: (input, context) => ragieDeletePartition(input, context),
  list_connection_source_types: (_input, context) => ragieListConnectionSourceTypes(context),
  list_connections: (input, context) => ragieListConnections(input, context),
  create_oauth_redirect_url: (input, context) => ragieCreateOauthRedirectUrl(input, context),
};

export async function validateRagieCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = input.apiKey;
  const payload = await ragieRequest<{ connectors?: unknown[] }>(
    apiKey,
    {
      path: "/connections/source-type",
    },
    fetcher,
    "validate",
  );

  return {
    profile: { accountId: "ragie", displayName: "Ragie API Key", grantedScopes: [] },
    metadata: {
      validationEndpoint: "/connections/source-type",
      connectorCount: Array.isArray(payload.connectors) ? payload.connectors.length : 0,
    },
  };
}

function ragieRetrieve(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest<{ scored_chunks?: unknown[] }>(
    context.apiKey,
    {
      method: "POST",
      path: "/retrievals",
      body: compactObject({
        query: readRequiredString(input.query, "query"),
        top_k: readOptionalNumber(input.topK),
        filter: readOptionalObject(input.filter),
        rerank: optionalBoolean(input.rerank),
        partition: optionalRawString(input.partition),
        recency_bias: optionalBoolean(input.recencyBias),
        max_chunks_per_document: readOptionalNumber(input.maxChunksPerDocument),
      }),
    },
    context.fetcher,
  ).then((payload) => ({
    scoredChunks: looseArray(payload.scored_chunks).map((item) => mapScoredChunk(asObject(item))),
  }));
}

function ragieListDocuments(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest<{ documents?: unknown[]; pagination?: unknown }>(
    context.apiKey,
    {
      path: "/documents",
      query: compactObject({
        cursor: optionalRawString(input.cursor),
        filter: optionalRawString(input.filter),
        page_size: readOptionalNumber(input.pageSize),
      }),
      partition: optionalRawString(input.partition),
    },
    context.fetcher,
  ).then((payload) => ({
    documents: looseArray(payload.documents).map((item) => mapDocument(asObject(item))),
    pagination: mapPagination(asObject(payload.pagination)),
  }));
}

function ragieGetDocument(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest(
    context.apiKey,
    {
      path: `/documents/${readRequiredString(input.documentId, "documentId")}`,
      partition: optionalRawString(input.partition),
    },
    context.fetcher,
  ).then((payload) => mapDetailedDocument(asObject(payload)));
}

function ragieCreateDocumentRaw(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/documents/raw",
      body: compactObject({
        data: input.data,
        name: optionalRawString(input.name),
        metadata: readOptionalObject(input.metadata),
        partition: optionalRawString(input.partition),
        external_id: optionalRawString(input.externalId),
      }),
    },
    context.fetcher,
  ).then((payload) => mapDocument(asObject(payload)));
}

function ragieCreateDocumentFromUrl(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/documents/url",
      body: compactObject({
        url: readRequiredString(input.url, "url"),
        mode: input.mode,
        name: optionalRawString(input.name),
        metadata: readOptionalObject(input.metadata),
        partition: optionalRawString(input.partition),
        external_id: optionalRawString(input.externalId),
      }),
    },
    context.fetcher,
  ).then((payload) => mapDocument(asObject(payload)));
}

function ragiePatchDocumentMetadata(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest(
    context.apiKey,
    {
      method: "PATCH",
      path: `/documents/${readRequiredString(input.documentId, "documentId")}/metadata`,
      partition: optionalRawString(input.partition),
      body: compactObject({
        metadata: readRequiredObject(input.metadata, "metadata"),
        async: optionalBoolean(input.async),
      }),
    },
    context.fetcher,
  ).then((payload) => mapMetadataPatchResult(asObject(payload)));
}

function ragieGetDocumentContent(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest(
    context.apiKey,
    {
      path: `/documents/${readRequiredString(input.documentId, "documentId")}/content`,
      query: compactObject({
        media_type: optionalRawString(input.mediaType),
        download: optionalBoolean(input.download),
      }),
      partition: optionalRawString(input.partition),
      range: optionalRawString(input.range),
    },
    context.fetcher,
  ).then((payload) => mapDocumentContent(asObject(payload)));
}

function ragieGetDocumentSummary(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest(
    context.apiKey,
    {
      path: `/documents/${readRequiredString(input.documentId, "documentId")}/summary`,
      partition: optionalRawString(input.partition),
    },
    context.fetcher,
  ).then((payload) => mapDocumentSummary(asObject(payload)));
}

function ragieGetDocumentChunks(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest<{ chunks?: unknown[]; pagination?: unknown }>(
    context.apiKey,
    {
      path: `/documents/${readRequiredString(input.documentId, "documentId")}/chunks`,
      partition: optionalRawString(input.partition),
      query: compactObject({
        cursor: optionalRawString(input.cursor),
        page_size: readOptionalNumber(input.pageSize),
        start_index: readOptionalNumber(input.startIndex),
        end_index: readOptionalNumber(input.endIndex),
      }),
    },
    context.fetcher,
  ).then((payload) => ({
    chunks: looseArray(payload.chunks).map((item) => mapDocumentChunk(asObject(item))),
    pagination: mapPagination(asObject(payload.pagination)),
  }));
}

function ragieDeleteDocument(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest(
    context.apiKey,
    {
      method: "DELETE",
      path: `/documents/${readRequiredString(input.documentId, "documentId")}`,
      partition: optionalRawString(input.partition),
      query: compactObject({
        async: optionalBoolean(input.async),
      }),
    },
    context.fetcher,
  ).then((payload) => mapStatusResult(asObject(payload)));
}

function ragieListPartitions(context: RagieActionContext, input: Record<string, unknown>) {
  return ragieRequest<{ partitions?: unknown[]; pagination?: unknown }>(
    context.apiKey,
    {
      path: "/partitions",
      query: compactObject({
        cursor: optionalRawString(input.cursor),
        page_size: readOptionalNumber(input.pageSize),
      }),
    },
    context.fetcher,
  ).then((payload) => ({
    partitions: looseArray(payload.partitions).map((item) => mapPartition(asObject(item))),
    pagination: mapPagination(asObject(payload.pagination)),
  }));
}

function ragieGetPartition(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest(
    context.apiKey,
    {
      path: `/partitions/${readRequiredString(input.partitionId, "partitionId")}`,
    },
    context.fetcher,
  ).then((payload) => mapPartition(asObject(payload)));
}

function ragieCreatePartition(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/partitions",
      body: buildPartitionBody(input, true),
    },
    context.fetcher,
  ).then((payload) => mapPartition(asObject(payload)));
}

function ragieUpdatePartition(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest(
    context.apiKey,
    {
      method: "PATCH",
      path: `/partitions/${readRequiredString(input.partitionId, "partitionId")}`,
      body: compactObject({
        description: optionalRawString(input.description),
        context_aware: optionalBoolean(input.contextAware),
        metadata_schema: readOptionalObject(input.metadataSchema),
      }),
    },
    context.fetcher,
  ).then((payload) => mapPartition(asObject(payload)));
}

function ragieSetPartitionLimits(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest(
    context.apiKey,
    {
      method: "PUT",
      path: `/partitions/${readRequiredString(input.partitionId, "partitionId")}/limits`,
      body: buildLimitBody(input),
    },
    context.fetcher,
  ).then((payload) => mapPartition(asObject(payload)));
}

function ragieDeletePartition(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest(
    context.apiKey,
    {
      method: "DELETE",
      path: `/partitions/${readRequiredString(input.partitionId, "partitionId")}`,
      query: compactObject({
        async_deletion: optionalBoolean(input.asyncDeletion),
      }),
    },
    context.fetcher,
  ).then((payload) => ({
    message: readRequiredString(asObject(payload).message, "message"),
  }));
}

function ragieListConnectionSourceTypes(context: RagieActionContext) {
  return ragieRequest<{ connectors?: unknown[] }>(
    context.apiKey,
    {
      path: "/connections/source-type",
    },
    context.fetcher,
  ).then((payload) => ({
    connectors: looseArray(payload.connectors).map((item) => mapConnectorSourceType(asObject(item))),
  }));
}

function ragieListConnections(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest<{ connections?: unknown[]; pagination?: unknown }>(
    context.apiKey,
    {
      path: "/connections",
      query: compactObject({
        cursor: optionalRawString(input.cursor),
        filter: optionalRawString(input.filter),
        page_size: readOptionalNumber(input.pageSize),
      }),
      partition: optionalRawString(input.partition),
    },
    context.fetcher,
  ).then((payload) => ({
    connections: looseArray(payload.connections).map((item) => mapConnection(asObject(item))),
    pagination: mapPagination(asObject(payload.pagination)),
  }));
}

function ragieCreateOauthRedirectUrl(input: Record<string, unknown>, context: RagieActionContext) {
  return ragieRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/connections/oauth",
      body: compactObject({
        redirect_uri: readRequiredString(input.redirectUri, "redirectUri"),
        source_type: optionalRawString(input.sourceType),
        theme: optionalRawString(input.theme),
        config: readOptionalObject(input.config),
        metadata: readOptionalObject(input.metadata),
        partition: optionalRawString(input.partition),
        page_limit: readOptionalNumber(input.pageLimit),
        mode: input.mode,
        authenticator_id: optionalRawString(input.authenticatorId),
      }),
    },
    context.fetcher,
  ).then((payload) => ({
    url: readRequiredString(asObject(payload).url, "url"),
  }));
}

async function ragieRequest<T>(
  apiKey: string,
  input: RagieRequestInput,
  fetcher: typeof fetch,
  mode: "validate" | "execute" = "execute",
) {
  const url = buildRagieUrl(input.path, input.query);
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
  };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (input.partition) {
    headers.partition = input.partition;
  }
  if (input.range) {
    headers.range = input.range;
  }

  const response = await fetcher(url, {
    method: input.method ?? "GET",
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });

  await assertRagieResponse(response, mode);
  return readRagieJson<T>(response);
}

function buildRagieUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(`${ragieApiBaseUrl}${path}`);
  if (!query) {
    return url.toString();
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function readRagieJson<T>(response: Response) {
  if (response.status === 204) {
    return {} as T;
  }

  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

async function assertRagieResponse(response: Response, mode: "validate" | "execute") {
  if (response.ok) {
    return;
  }

  const message = await readRagieError(response);
  if (response.status === 401) {
    throw new ProviderRequestError(mode === "validate" ? 400 : 401, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }
  throw new ProviderRequestError(500, message, response.status);
}

async function readRagieError(response: Response) {
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    const detail = optionalRawString(payload.detail);
    if (detail) {
      return detail;
    }
    const error = optionalRawString(payload.error);
    if (error) {
      return error;
    }
    const message = optionalRawString(payload.message);
    if (message) {
      return message;
    }
  } catch {}

  return `Ragie request failed with status ${response.status}`;
}

function buildPartitionBody(input: Record<string, unknown>, includeName: boolean) {
  return compactObject({
    name: includeName ? readRequiredString(input.name, "name") : undefined,
    description: optionalRawString(input.description),
    context_aware: optionalBoolean(input.contextAware),
    metadata_schema: readOptionalObject(input.metadataSchema),
    ...buildLimitBody(input),
  });
}

function buildLimitBody(input: Record<string, unknown>) {
  return compactObject({
    media_hosted_limit_max: readOptionalNumber(input.mediaHostedLimitMax),
    pages_hosted_limit_max: readOptionalNumber(input.pagesHostedLimitMax),
    media_streamed_limit_max: readOptionalNumber(input.mediaStreamedLimitMax),
    audio_processed_limit_max: readOptionalNumber(input.audioProcessedLimitMax),
    pages_processed_limit_max: readOptionalNumber(input.pagesProcessedLimitMax),
    video_processed_limit_max: readOptionalNumber(input.videoProcessedLimitMax),
    media_hosted_limit_monthly: readOptionalNumber(input.mediaHostedLimitMonthly),
    pages_hosted_limit_monthly: readOptionalNumber(input.pagesHostedLimitMonthly),
    media_streamed_limit_monthly: readOptionalNumber(input.mediaStreamedLimitMonthly),
    audio_processed_limit_monthly: readOptionalNumber(input.audioProcessedLimitMonthly),
    pages_processed_limit_monthly: readOptionalNumber(input.pagesProcessedLimitMonthly),
    video_processed_limit_monthly: readOptionalNumber(input.videoProcessedLimitMonthly),
  });
}

function mapScoredChunk(payload: Record<string, unknown>) {
  return {
    id: readRequiredString(payload.id, "id"),
    text: readRequiredString(payload.text, "text"),
    index: readOptionalNumber(payload.index),
    links: readOptionalObject(payload.links),
    score: readOptionalNumber(payload.score) ?? 0,
    metadata: readOptionalObject(payload.metadata),
    documentId: readRequiredString(payload.document_id, "document_id"),
    documentName: readRequiredString(payload.document_name, "document_name"),
    documentMetadata: readOptionalObject(payload.document_metadata) ?? {},
  };
}

function mapDocument(payload: Record<string, unknown>) {
  return compactObject({
    id: readRequiredString(payload.id, "id"),
    name: readRequiredString(payload.name, "name"),
    status: readRequiredString(payload.status, "status"),
    metadata: readOptionalObject(payload.metadata) ?? {},
    partition: readRequiredString(payload.partition, "partition"),
    createdAt: readRequiredString(payload.created_at, "created_at"),
    updatedAt: readRequiredString(payload.updated_at, "updated_at"),
    pageCount: readOptionalNumber(payload.page_count),
    chunkCount: readOptionalNumber(payload.chunk_count),
    externalId: optionalRawString(payload.external_id),
  });
}

function mapDetailedDocument(payload: Record<string, unknown>) {
  return compactObject({
    ...mapDocument(payload),
    errors: Array.isArray(payload.errors) ? payload.errors.map((item) => String(item)) : undefined,
  });
}

function mapDocumentContent(payload: Record<string, unknown>) {
  return {
    ...mapDocument(payload),
    content: readRequiredString(payload.content, "content"),
  };
}

function mapDocumentSummary(payload: Record<string, unknown>) {
  return {
    documentId: readRequiredString(payload.document_id, "document_id"),
    summary: readRequiredString(payload.summary, "summary"),
  };
}

function mapDocumentChunk(payload: Record<string, unknown>) {
  return compactObject({
    id: readRequiredString(payload.id, "id"),
    text: readRequiredString(payload.text, "text"),
    index: readOptionalNumber(payload.index),
    links: readOptionalObject(payload.links),
    metadata: readOptionalObject(payload.metadata),
  });
}

function mapPagination(payload: Record<string, unknown>) {
  return {
    nextCursor: optionalRawString(payload.next_cursor) ?? null,
    totalCount: readOptionalNumber(payload.total_count) ?? 0,
  };
}

function mapPartition(payload: Record<string, unknown>) {
  return compactObject({
    name: readRequiredString(payload.name, "name"),
    isDefault: optionalBoolean(payload.is_default) ?? false,
    description: optionalRawString(payload.description),
    contextAware: optionalBoolean(payload.context_aware) ?? false,
    metadataSchema: readOptionalObject(payload.metadata_schema),
    limits: camelizeFlatObject(readOptionalObject(payload.limits) ?? {}),
    stats: camelizeFlatObject(readOptionalObject(payload.stats) ?? {}),
    limitExceededAt: optionalRawString(payload.limit_exceeded_at),
  });
}

function mapConnectorSourceType(payload: Record<string, unknown>) {
  return {
    sourceType: readRequiredString(payload.source_type, "source_type"),
    displayName: readRequiredString(payload.display_name, "display_name"),
    iconUrl: readRequiredString(payload.icon_url, "icon_url"),
    docsUrl: readRequiredString(payload.docs_url, "docs_url"),
  };
}

function mapConnection(payload: Record<string, unknown>) {
  return compactObject({
    id: readRequiredString(payload.id, "id"),
    name: readRequiredString(payload.name, "name"),
    type: readRequiredString(payload.type, "type"),
    source: readOptionalObject(payload.source),
    enabled: optionalBoolean(payload.enabled) ?? false,
    metadata: readOptionalObject(payload.metadata) ?? {},
    createdAt: readRequiredString(payload.created_at, "created_at"),
    updatedAt: readRequiredString(payload.updated_at, "updated_at"),
    pageLimit: readOptionalNumber(payload.page_limit),
    disabledBySystem: optionalBoolean(payload.disabled_by_system) ?? false,
    disabledBySystemReason: readNullableString(payload.disabled_by_system_reason),
  });
}

function mapMetadataPatchResult(payload: Record<string, unknown>) {
  return compactObject({
    status: optionalRawString(payload.status),
    metadata: readOptionalObject(payload.metadata),
  });
}

function mapStatusResult(payload: Record<string, unknown>) {
  return {
    status: readRequiredString(payload.status, "status"),
  };
}

function camelizeFlatObject(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [snakeToCamel(key), value]));
}

function snakeToCamel(value: string) {
  if (!value.includes("_")) {
    return value;
  }

  const segments = value.split("_");
  return segments
    .map((segment, index) => {
      if (index === 0) {
        return segment;
      }
      return segment.slice(0, 1).toUpperCase() + segment.slice(1);
    })
    .join("");
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(500, "Ragie returned an invalid object payload");
  }
  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readNullableString(value: unknown) {
  if (value === null) {
    return null;
  }
  return optionalRawString(value);
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function readOptionalObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readRequiredObject(value: unknown, fieldName: string) {
  const object = readOptionalObject(value);
  if (!object) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return object;
}
