import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { DocsumoActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, encodePathSegment } from "../../core/request.ts";
import {
  defineProviderExecutors,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "docsumo";
const apiBaseUrl = "https://app.docsumo.com";

interface DocsumoContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type Phase = "validate" | "execute";
type Handler = (input: Record<string, unknown>, context: DocsumoContext) => Promise<unknown>;

const handlers: Record<DocsumoActionName, Handler> = {
  get_account_info(_input, context) {
    return getAccountInfo(context);
  },
  upload_document_from_url(input, context) {
    return uploadDocumentFromUrl(input, context);
  },
  list_documents(input, context) {
    return listDocuments(input, context);
  },
  get_document_detail(input, context) {
    return getDocumentDetail(input, context);
  },
  get_extracted_data(input, context) {
    return getExtractedData(input, context);
  },
  get_documents_summary(_input, context) {
    return getDocumentsSummary(context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<DocsumoContext>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DocsumoContext> {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, fetcher, signal: context.signal };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const data = readDataObject(
      await request({ path: "/api/v1/eevee/apikey/limit/", apiKey: input.apiKey, fetcher, signal, phase: "validate" }),
      "account info",
    );
    const documentTypes = normalizeDocumentTypes(data.document_types);
    return {
      profile: {
        accountId: optionalString(data.user_id) ?? "api_key",
        displayName: optionalString(data.email) ?? "Docsumo API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl,
        validationEndpoint: "/api/v1/eevee/apikey/limit/",
        email: optionalString(data.email),
        fullName: optionalString(data.full_name),
        userId: optionalString(data.user_id),
        monthlyDocCurrent: optionalInteger(data.monthly_doc_current),
        monthlyDocLimit: optionalInteger(data.monthly_doc_limit),
        documentTypeCount: documentTypes.length,
      }),
    };
  },
};

async function getAccountInfo(context: DocsumoContext): Promise<unknown> {
  const data = readDataObject(
    await request({ ...context, path: "/api/v1/eevee/apikey/limit/", phase: "execute" }),
    "account info",
  );
  return {
    email: optionalString(data.email) ?? null,
    fullName: optionalString(data.full_name) ?? null,
    userId: optionalString(data.user_id) ?? null,
    monthlyDocCurrent: optionalInteger(data.monthly_doc_current) ?? null,
    monthlyDocLimit: optionalInteger(data.monthly_doc_limit) ?? null,
    documentTypes: normalizeDocumentTypes(data.document_types),
  };
}

async function uploadDocumentFromUrl(input: Record<string, unknown>, context: DocsumoContext): Promise<unknown> {
  const docType = requiredString(input.docType, "docType", providerInputError);
  const fileUrl = readFileUrl(input.fileUrl);
  const formData = new FormData();
  formData.set("file", fileUrl);
  formData.set("file_type", "url");
  formData.set("type", docType);
  const userDocId = optionalString(input.userDocId);
  if (userDocId) formData.set("user_doc_id", userDocId);
  const docMetaData = optionalRecord(input.docMetaData);
  if (docMetaData) formData.set("doc_meta_data", JSON.stringify(docMetaData));
  const reviewToken = optionalBoolean(input.reviewToken);
  if (reviewToken !== undefined) formData.set("review_token", reviewToken ? "true" : "false");
  const password = optionalString(input.password);
  if (password) formData.set("password", password);
  const data = readDataObject(
    await request({
      ...context,
      path: "/api/v1/eevee/apikey/upload/custom/",
      method: "POST",
      body: formData,
      phase: "execute",
    }),
    "upload response",
  );
  return { document: normalizeUploadedDocument(data) };
}

async function listDocuments(input: Record<string, unknown>, context: DocsumoContext): Promise<unknown> {
  if (input.view === "folder" && !optionalString(input.folderId)) {
    throw new ProviderRequestError(400, "folderId is required when view is folder");
  }
  const query = new URLSearchParams();
  setQuery(query, "view", optionalString(input.view));
  setQuery(query, "folder_id", optionalString(input.folderId));
  setQuery(query, "limit", optionalInteger(input.limit));
  setQuery(query, "offset", optionalInteger(input.offset));
  setQuery(query, "doc_type", optionalString(input.docType));
  setQuery(query, "status", optionalString(input.status));
  setQuery(query, "q", optionalString(input.query));
  setQuery(query, "sort_by", optionalString(input.sortBy));
  const createdDateGte = optionalString(input.createdDateGte);
  if (createdDateGte) query.append("created_date", `gte:${createdDateGte}`);
  const createdDateLte = optionalString(input.createdDateLte);
  if (createdDateLte) query.append("created_date", `lte:${createdDateLte}`);
  const data = readDataObject(
    await request({ ...context, path: "/api/v1/eevee/apikey/documents/all/", query, phase: "execute" }),
    "document list",
  );
  return {
    documents: normalizeDocumentList(data.documents),
    pagination: {
      limit: optionalInteger(data.limit) ?? null,
      offset: optionalInteger(data.offset) ?? null,
      total: optionalInteger(data.total) ?? null,
    },
  };
}

async function getDocumentDetail(input: Record<string, unknown>, context: DocsumoContext): Promise<unknown> {
  const docId = requiredString(input.docId, "docId", providerInputError);
  const data = readDataObject(
    await request({
      ...context,
      path: `/api/v1/eevee/apikey/documents/detail/${encodePathSegment(docId)}/`,
      phase: "execute",
    }),
    "document detail",
  );
  const document = optionalRecord(data.document);
  if (!document) throw new ProviderRequestError(502, "malformed Docsumo document detail response");
  return {
    document: {
      data: optionalRecord(document.data) ?? {},
      docId: requiredString(data.doc_id, "doc_id", providerResponseError),
      pages: Array.isArray(data.pages) ? data.pages : [],
      previewImage: optionalRecord(data.preview_image) ?? null,
      type: optionalString(data.type) ?? null,
      typeTitle: optionalString(data.type_title) ?? null,
      uploadedBy: optionalRecord(data.uploaded_by) ?? null,
      userId: optionalString(data.user_id) ?? null,
    },
  };
}

async function getExtractedData(input: Record<string, unknown>, context: DocsumoContext): Promise<unknown> {
  const docId = requiredString(input.docId, "docId", providerInputError);
  return {
    extractedData: readDataObject(
      await request({
        ...context,
        path: `/api/v1/eevee/apikey/data/simplified/${encodePathSegment(docId)}/`,
        phase: "execute",
      }),
      "extracted data",
    ),
  };
}

async function getDocumentsSummary(context: DocsumoContext): Promise<unknown> {
  const data = readDataObject(
    await request({ ...context, path: "/api/v1/mew/apikey/documents/summary/", phase: "execute" }),
    "documents summary",
  );
  return {
    disabledDocTypes: Array.isArray(data.disabled_doc_types)
      ? data.disabled_doc_types.map((item) => optionalString(item)).filter((item): item is string => item != null)
      : [],
    documentType: normalizeSummaryDocumentType(data.document),
  };
}

async function request(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: Phase;
  signal?: AbortSignal;
  method?: "GET" | "POST";
  query?: URLSearchParams;
  body?: BodyInit;
}): Promise<unknown> {
  const url = new URL(input.path, apiBaseUrl);
  for (const [key, value] of input.query ?? []) url.searchParams.append(key, value);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: headers(input.apiKey, input.body),
      body: input.body,
      signal: input.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      isTimeoutError(error) ? 504 : 502,
      error instanceof Error ? `Docsumo request failed: ${error.message}` : "Docsumo request failed",
    );
  }
  if (!response.ok) throw createError(response.status, payload, input.phase);
  if (readProviderError(payload))
    throw createError(response.status >= 400 ? response.status : 502, payload, input.phase);
  return payload;
}

function headers(apiKey: string, body?: BodyInit): Headers {
  const headers = new Headers();
  headers.set("apikey", apiKey);
  headers.set("accept", "application/json");
  headers.set("user-agent", providerUserAgent);
  if (body !== undefined && typeof body === "string") headers.set("content-type", "application/json");
  return headers;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createError(status: number, payload: unknown, phase: Phase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `Docsumo request failed with HTTP ${status || 500}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (status === 401 || status === 403))
    return new ProviderRequestError(400, message, payload);
  if (status === 401 || status === 403) return new ProviderRequestError(401, message, payload);
  if (status === 400) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status || 500, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.error_code))
    : undefined;
}

function readProviderError(payload: unknown): boolean {
  const status = optionalString(optionalRecord(payload)?.status)?.toLowerCase();
  return !!status && status !== "success";
}

function readDataObject(payload: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  const data = optionalRecord(record?.data);
  if (!record || !data) throw new ProviderRequestError(502, `malformed Docsumo ${context} response`, payload);
  return data;
}

function normalizeDocumentTypes(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value
        .map((item) => optionalRecord(item))
        .filter((item): item is Record<string, unknown> => item != null)
        .map((item) => ({
          title: requiredString(item.title, "title", providerResponseError),
          value: requiredString(item.value, "value", providerResponseError),
        }))
    : [];
}

function normalizeUploadedDocument(record: Record<string, unknown>): Record<string, unknown> {
  return {
    createdAt: optionalString(record.created_at) ?? null,
    docId: requiredString(record.doc_id, "doc_id", providerResponseError),
    docMetaData: optionalString(record.doc_meta_data) ?? null,
    email: optionalString(record.email) ?? null,
    reviewUrl: optionalString(record.review_url) ?? null,
    status: requiredString(record.status, "status", providerResponseError),
    title: optionalString(record.title) ?? null,
    type: optionalString(record.type) ?? null,
    userDocId: optionalString(record.user_doc_id) ?? null,
    userId: optionalString(record.user_id) ?? null,
  };
}

function normalizeDocumentList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value
        .map((item) => optionalRecord(item))
        .filter((item): item is Record<string, unknown> => item != null)
        .map((item) => ({
          approvedWithWarnings:
            item.approved_with_warnings === null ? null : (optionalBoolean(item.approved_with_warnings) ?? null),
          createdAtIso: optionalString(item.created_at_iso) ?? null,
          displayType: optionalString(item.display_type) ?? null,
          docId: requiredString(item.doc_id, "doc_id", providerResponseError),
          docMetaData: optionalString(item.doc_meta_data) ?? null,
          folderId: optionalString(item.folder_id) ?? null,
          folderName: optionalString(item.folder_name) ?? null,
          hasFeedback: item.has_feedback === null ? null : (optionalBoolean(item.has_feedback) ?? null),
          modifiedAtIso: optionalString(item.modified_at_iso) ?? null,
          previewImage: normalizePreviewImage(item.preview_image),
          reviewUrl: optionalString(item.review_url) ?? null,
          s3Filename: optionalString(item.s3_filename) ?? null,
          status: optionalString(item.status) ?? null,
          templateDocId: optionalString(item.template_doc_id) ?? null,
          time: normalizeTime(item.time_dict),
          title: optionalString(item.title) ?? null,
          type: optionalString(item.type) ?? null,
          typeTitle: optionalString(item.type_title) ?? null,
          uploadedBy: normalizeUploadedBy(item.uploaded_by),
          userDocId: optionalString(item.user_doc_id) ?? null,
        }))
    : [];
}

function normalizePreviewImage(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) return null;
  const url = optionalString(record.url);
  const width = optionalInteger(record.width);
  const height = optionalInteger(record.height);
  return url && width !== undefined && height !== undefined ? { url, width, height } : null;
}

function normalizeUploadedBy(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  return record
    ? {
        avatarUrl: optionalString(record.avatar_url) ?? null,
        email: optionalString(record.email) ?? null,
        fullName: optionalString(record.full_name) ?? null,
        userId: optionalString(record.user_id) ?? null,
      }
    : null;
}

function normalizeTime(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  return record
    ? {
        processingTime: optionalNumber(record.processing_time) ?? null,
        totalTime: optionalNumber(record.total_time) ?? null,
      }
    : null;
}

function normalizeSummaryDocumentType(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) return null;
  return {
    canUpload: record.can_upload === null ? null : (optionalBoolean(record.can_upload) ?? null),
    category: optionalString(record.category) ?? null,
    defaultType: record.default_type === null ? null : (optionalBoolean(record.default_type) ?? null),
    counts: normalizeSummaryCounts(record.doc_counts),
    docType: optionalString(record.doc_type) ?? null,
    excelType: record.excel_type === null ? null : (optionalBoolean(record.excel_type) ?? null),
    flags: optionalRecord(record.flags) ?? null,
    id: optionalInteger(record.id) ?? null,
    isEditable: record.is_editable === null ? null : (optionalBoolean(record.is_editable) ?? null),
    models: Array.isArray(record.models)
      ? record.models.map((item) => optionalString(item)).filter((item): item is string => item != null)
      : [],
    title: optionalString(record.title) ?? null,
    uploadEmail: optionalString(record.upload_email) ?? null,
    userId: optionalString(record.user_id) ?? null,
  };
}

function normalizeSummaryCounts(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  return record
    ? {
        all: optionalInteger(record.all) ?? null,
        processed: optionalInteger(record.processed) ?? null,
        reviewing: optionalInteger(record.reviewing) ?? null,
      }
    : null;
}

function readFileUrl(value: unknown): string {
  const raw = requiredString(value, "fileUrl", providerInputError);
  const url = assertPublicHttpUrl(raw, {
    fieldName: "fileUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.username || url.password) throw new ProviderRequestError(400, "fileUrl must not include credentials");
  return url.toString();
}

function setQuery(query: URLSearchParams, key: string, value: string | number | undefined): void {
  if (value !== undefined && value !== "") query.set(key, String(value));
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError" || error.message.toLowerCase().includes("timeout"))
  );
}
