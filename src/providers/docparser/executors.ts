import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { DocparserActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "docparser";
const docparserApiBaseUrl = "https://api.docparser.com";
const docparserResultReservedKeys = new Set([
  "id",
  "file_name",
  "remote_id",
  "media_link",
  "page_count",
  "document_id",
  "uploaded_at",
  "processed_at",
  "media_link_data",
  "media_link_original",
]);

type DocparserQueryValue = string | number | boolean | undefined;
type DocparserRequestPhase = "validate" | "execute";
type DocparserRequestInput = {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, DocparserQueryValue>;
  body?: URLSearchParams | FormData;
};
type DocparserActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const docparserActionHandlers: Record<DocparserActionName, DocparserActionHandler> = {
  ping(_input, context) {
    return docparserPing(context, "execute");
  },
  list_parsers(_input, context) {
    return docparserListParsers(context);
  },
  get_parser_models(input, context) {
    return docparserGetParserModels(input, context);
  },
  upload_document_by_content(input, context) {
    return docparserUploadDocumentByContent(input, context);
  },
  fetch_document_from_url(input, context) {
    return docparserFetchDocumentFromUrl(input, context);
  },
  get_document_status(input, context) {
    return docparserGetDocumentStatus(input, context);
  },
  get_document_result(input, context) {
    return docparserGetDocumentResult(input, context);
  },
  get_multiple_document_results(input, context) {
    return docparserGetMultipleDocumentResults(input, context);
  },
  reparse_documents(input, context) {
    return docparserReparseDocuments(input, context);
  },
  reintegrate_documents(input, context) {
    return docparserReintegrateDocuments(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, docparserActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: docparserApiBaseUrl,
  auth: { type: "api_key_header", name: "api_key" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await docparserPing({ apiKey: input.apiKey, fetcher, signal }, "validate");
    return {
      profile: {
        accountId: "docparser:api-key",
        displayName: "Docparser API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v1/ping",
        ping: payload.msg,
      },
    };
  },
};

async function docparserPing(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: DocparserRequestPhase,
): Promise<{ msg: string }> {
  const payload = await docparserRequest({ path: "/v1/ping" }, context, phase);
  const record = optionalRecord(payload);
  const msg = optionalString(record?.msg);
  if (!msg) {
    throw new ProviderRequestError(502, "malformed docparser ping response", payload);
  }

  return { msg };
}

async function docparserListParsers(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await docparserRequest({ path: "/v1/parsers" }, context, "execute");
  return {
    parsers: normalizeParserList(payload),
  };
}

async function docparserGetParserModels(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const parserId = pickRequiredString(input, "parserId");
  const payload = await docparserRequest(
    {
      path: `/v1/parser/models/${encodeURIComponent(parserId)}`,
    },
    context,
    "execute",
  );

  return {
    models: normalizeParserList(payload),
  };
}

async function docparserUploadDocumentByContent(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const parserId = pickRequiredString(input, "parserId");
  const body = new URLSearchParams();
  body.set("file_content", normalizeBase64Input(pickRequiredString(input, "contentBase64"), "contentBase64"));

  const fileName = optionalString(input.fileName);
  if (fileName) {
    body.set("file_name", fileName);
  }

  const remoteId = optionalString(input.remoteId);
  if (remoteId) {
    body.set("remote_id", remoteId);
  }

  const payload = await docparserRequest(
    {
      method: "POST",
      path: `/v1/document/upload/${encodeURIComponent(parserId)}`,
      body,
    },
    context,
    "execute",
  );

  return normalizeDocumentImportResponse(payload);
}

async function docparserFetchDocumentFromUrl(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const parserId = pickRequiredString(input, "parserId");
  const publicUrl = assertPublicHttpUrl(pickRequiredString(input, "url"), {
    fieldName: "url",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (publicUrl.protocol !== "https:") {
    throw new ProviderRequestError(400, "url must use https");
  }
  if (publicUrl.username || publicUrl.password) {
    throw new ProviderRequestError(400, "url must not include credentials");
  }

  const formData = new FormData();
  formData.set("url", publicUrl.toString());

  const remoteId = optionalString(input.remoteId);
  if (remoteId) {
    formData.set("remote_id", remoteId);
  }

  const payload = await docparserRequest(
    {
      method: "POST",
      path: `/v2/document/fetch/${encodeURIComponent(parserId)}`,
      body: formData,
    },
    context,
    "execute",
  );

  const record = optionalRecord(payload);
  const documentId = optionalString(record?.document_id) ?? optionalString(record?.id);
  const upstreamParserId = optionalString(record?.parser_id) ?? parserId;
  const message = optionalString(record?.message) ?? optionalString(record?.msg);
  if (!documentId || !message) {
    throw new ProviderRequestError(502, "malformed docparser fetch response", payload);
  }

  return {
    documentId,
    parserId: upstreamParserId,
    remoteId: nullableString(record?.remote_id),
    message,
  };
}

async function docparserGetDocumentStatus(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const parserId = pickRequiredString(input, "parserId");
  const documentId = pickRequiredString(input, "documentId");
  const payload = await docparserRequest(
    {
      path: `/v2/document/status/${encodeURIComponent(parserId)}/${encodeURIComponent(documentId)}`,
    },
    context,
    "execute",
  );

  return {
    status: normalizeDocumentStatus(payload),
  };
}

async function docparserGetDocumentResult(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const parserId = pickRequiredString(input, "parserId");
  const documentId = pickRequiredString(input, "documentId");
  const payload = await docparserRequest(
    {
      path: `/v1/results/${encodeURIComponent(parserId)}/${encodeURIComponent(documentId)}`,
      query: compactObject({
        format: pickOptionalFormat(input),
        include_children: optionalBoolean(input.includeChildren),
      }),
    },
    context,
    "execute",
  );

  return {
    results: normalizeResultRows(payload),
  };
}

async function docparserGetMultipleDocumentResults(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const parserId = pickRequiredString(input, "parserId");
  const list = pickOptionalListMode(input);
  const date = optionalString(input.date);
  if ((list === "uploaded_after" || list === "processed_after") && !date) {
    throw new ProviderRequestError(400, "date is required for uploaded_after or processed_after list modes");
  }

  const payload = await docparserRequest(
    {
      path: `/v1/results/${encodeURIComponent(parserId)}`,
      query: compactObject({
        format: pickOptionalFormat(input),
        list,
        limit: optionalInteger(input.limit),
        date,
        remote_id: optionalString(input.remoteId),
        include_processing_queue: optionalBoolean(input.includeProcessingQueue),
        sort_by: pickOptionalSortBy(input),
        sort_order: pickOptionalSortOrder(input),
      }),
    },
    context,
    "execute",
  );

  return {
    results: normalizeResultRows(payload),
  };
}

async function docparserReparseDocuments(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const parserId = pickRequiredString(input, "parserId");
  const payload = await docparserRequest(
    {
      method: "POST",
      path: `/v1/document/reparse/${encodeURIComponent(parserId)}`,
      body: buildDocumentIdsBody(input),
    },
    context,
    "execute",
  );
  const record = optionalRecord(payload);
  return {
    totalReparsed: optionalInteger(record?.total_reparsed) ?? 0,
    msg: nullableString(record?.msg),
  };
}

async function docparserReintegrateDocuments(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const parserId = pickRequiredString(input, "parserId");
  const payload = await docparserRequest(
    {
      method: "POST",
      path: `/v1/document/reintegrate/${encodeURIComponent(parserId)}`,
      body: buildDocumentIdsBody(input),
    },
    context,
    "execute",
  );
  const record = optionalRecord(payload);
  return {
    totalReintegrate: optionalInteger(record?.total_reintegrate) ?? 0,
    msg: nullableString(record?.msg),
  };
}

async function docparserRequest(
  input: DocparserRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: DocparserRequestPhase,
): Promise<unknown> {
  const url = new URL(input.path, docparserApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildDocparserHeaders(context.apiKey, input.body),
      body: input.body,
      signal: context.signal,
    });
    payload = await readDocparserPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Docparser request failed: ${error.message}` : "Docparser request failed",
    );
  }

  if (!response.ok) {
    throw createDocparserError(response, payload, phase);
  }

  return payload;
}

function buildDocparserHeaders(apiKey: string, body?: URLSearchParams | FormData): Headers {
  const headers = new Headers({
    accept: "application/json",
    api_key: apiKey,
    "user-agent": providerUserAgent,
  });

  if (body instanceof URLSearchParams) {
    headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
  }

  return headers;
}

async function readDocparserPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createDocparserError(
  response: Response,
  payload: unknown,
  phase: DocparserRequestPhase,
): ProviderRequestError {
  const message = extractDocparserErrorMessage(payload) ?? response.statusText ?? "Docparser request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 403) {
    return new ProviderRequestError(403, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractDocparserErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.msg);
}

function normalizeParserList(payload: unknown): Array<Record<string, string>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "malformed docparser parser list response", payload);
  }

  return payload
    .map((item) => {
      const record = optionalRecord(item);
      const id = optionalString(record?.id);
      const label = optionalString(record?.label) ?? optionalString(record?.name);
      return id && label ? { id, label } : null;
    })
    .filter((item): item is { id: string; label: string } => item !== null);
}

function normalizeDocumentImportResponse(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  const documentId = optionalString(record?.id);
  if (!documentId) {
    throw new ProviderRequestError(502, "malformed docparser upload response", payload);
  }

  return {
    documentId,
    fileSize: optionalInteger(record?.file_size) ?? null,
    quotaUsed: optionalInteger(record?.quota_used) ?? null,
    quotaLeft: optionalInteger(record?.quota_left) ?? null,
    quotaRefill: nullableString(record?.quota_refill),
  };
}

function normalizeDocumentStatus(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  const token = optionalString(record?.token);
  if (!token) {
    throw new ProviderRequestError(502, "malformed docparser document status response", payload);
  }

  return {
    token,
    remoteId: nullableString(record?.remote_id),
    fileSource: nullableString(record?.file_source),
    filename: nullableString(record?.filename),
    mimeType: nullableString(record?.mime_type),
    pages: optionalInteger(record?.pages) ?? 0,
    supported: asBooleanLike(record?.supported),
    importingInProgress: asBooleanLike(record?.importing_in_progress),
    processingInProgress: asBooleanLike(record?.processing_in_progress),
    webhookDispatchingInProgress: asBooleanLike(record?.webhook_dispatching_in_progress),
    uploadedAt: optionalInteger(record?.uploaded_at) ?? 0,
    importedAt: optionalInteger(record?.imported_at) ?? 0,
    ocrStartedAt: optionalInteger(record?.ocr_started_at) ?? 0,
    preprocessedAt: optionalInteger(record?.preprocessed_at) ?? 0,
    preprocessingInProgressAt: optionalInteger(record?.preprocessing_in_progress_at) ?? 0,
    processedAt: optionalInteger(record?.processed_at) ?? 0,
    firstProcessedAt: optionalInteger(record?.first_processed_at) ?? 0,
    dispatchedWebhook: asBooleanLike(record?.dispatched_webhook),
    dispatchedWebhookAt: optionalInteger(record?.dispatched_webhook_at) ?? 0,
    dispatchedWebhookProblem: asBooleanLike(record?.dispatched_webhook_problem),
    webhooksCreated: optionalInteger(record?.webhooks_created) ?? 0,
    webhooksSent: optionalInteger(record?.webhooks_sent) ?? 0,
    failedJobs: normalizeStringArray(record?.failed_jobs),
    raw: record ?? {},
  };
}

function normalizeResultRows(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "malformed docparser result response", payload);
  }

  return payload.map((item) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, "malformed docparser result row", payload);
    }

    const id = optionalString(record.id);
    const documentId = optionalString(record.document_id);
    if (!id || !documentId) {
      throw new ProviderRequestError(502, "malformed docparser result row", payload);
    }

    return {
      id,
      documentId,
      remoteId: nullableString(record.remote_id),
      fileName: nullableString(record.file_name),
      mediaLink: nullableString(record.media_link),
      mediaLinkOriginal: nullableString(record.media_link_original),
      mediaLinkData: nullableString(record.media_link_data),
      pageCount: optionalInteger(record.page_count) ?? null,
      uploadedAt: nullableString(record.uploaded_at),
      processedAt: nullableString(record.processed_at),
      parsedData: extractParsedData(record),
      raw: record,
    };
  });
}

function extractParsedData(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !docparserResultReservedKeys.has(key)));
}

function buildDocumentIdsBody(input: Record<string, unknown>): URLSearchParams {
  const documentIds = normalizeDocumentIdsInput(input.documentIds);
  if (documentIds.length === 0) {
    throw new ProviderRequestError(400, "documentIds must contain at least one value");
  }

  const body = new URLSearchParams();
  for (const documentId of documentIds) {
    body.append("document_ids[]", documentId);
  }
  return body;
}

function normalizeDocumentIdsInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => item !== "");
  }
  if (typeof value === "string" && value.trim() !== "") {
    return [value.trim()];
  }
  return [];
}

function normalizeBase64Input(value: string, fieldName: string): string {
  const normalized = value.replace(/[ \n\r\t]/g, "");

  try {
    const bytes = Buffer.from(normalized, "base64");
    if (bytes.length === 0) {
      throw new Error("empty");
    }

    if (trimBase64Padding(bytes.toString("base64")) !== trimBase64Padding(normalized)) {
      throw new Error("invalid");
    }

    return normalized;
  } catch {
    throw new ProviderRequestError(400, `${fieldName} must be valid base64`);
  }
}

function trimBase64Padding(value: string): string {
  let result = value;
  while (result.endsWith("=")) {
    result = result.slice(0, -1);
  }
  return result;
}

function pickRequiredString(input: Record<string, unknown>, key: string): string {
  return requiredString(input[key], key, (message) => new ProviderRequestError(400, message));
}

function pickOptionalFormat(input: Record<string, unknown>): "object" | "flat" | undefined {
  const value = optionalString(input.format);
  if (!value) {
    return undefined;
  }
  if (value === "object" || value === "flat") {
    return value;
  }
  throw new ProviderRequestError(400, `unsupported format: ${value}`);
}

function pickOptionalListMode(input: Record<string, unknown>): string | undefined {
  const value = optionalString(input.list);
  if (!value) {
    return undefined;
  }
  if (value === "last_uploaded" || value === "uploaded_after" || value === "processed_after") {
    return value;
  }
  throw new ProviderRequestError(400, `unsupported list mode: ${value}`);
}

function pickOptionalSortBy(input: Record<string, unknown>): string | undefined {
  const value = optionalString(input.sortBy);
  if (!value) {
    return undefined;
  }

  const allowed = new Set([
    "parsed_at",
    "processed_at",
    "uploaded_at",
    "first_processed_at",
    "imported_at",
    "integrated_at",
    "dispatched_webhook_at",
    "preprocessed_at",
  ]);
  if (!allowed.has(value)) {
    throw new ProviderRequestError(400, `unsupported sortBy value: ${value}`);
  }
  return value;
}

function pickOptionalSortOrder(input: Record<string, unknown>): string | undefined {
  const value = optionalString(input.sortOrder);
  if (!value) {
    return undefined;
  }
  if (value === "ASC" || value === "DESC") {
    return value;
  }
  throw new ProviderRequestError(400, `unsupported sortOrder value: ${value}`);
}

function asBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "") {
      return false;
    }
  }
  return false;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => (typeof item === "string" ? item : "")).filter((item) => item !== "");
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
