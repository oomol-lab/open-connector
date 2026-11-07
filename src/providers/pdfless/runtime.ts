import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  nullableInteger,
  optionalBoolean,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
  optionalStringOrNull,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { uploadProviderUrlToTransitFile } from "../provider-files.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const pdflessApiBaseUrl = "https://api.pdfless.com";
const pdflessWorkspacePath = "/v1/workspaces";
const pdflessPdfsPath = "/v1/pdfs";

type PdflessRequestPhase = "validate" | "execute";
type PdflessActionContext = ApiKeyProviderContext;
type PdflessActionHandler = (input: Record<string, unknown>, context: PdflessActionContext) => Promise<unknown>;

interface PdflessRequest {
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, number | undefined>;
  body?: Record<string, unknown>;
  apiKey: string;
  fetcher: ProviderFetch;
  phase: PdflessRequestPhase;
  signal?: AbortSignal;
}

interface PdflessWorkspace {
  name: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string | null;
  quota: number | null;
  remainingQuota: number | null;
}

interface PdflessTemplate {
  id: string;
  name: string | null;
  imagePreviewUrl: string | null;
  pdfPreviewUrl: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface PdflessGeneratedPdf {
  templateId: string | null;
  referenceId: string | null;
  downloadUrl: string;
  expiresAt: string | null;
  createdAt: string | null;
}

const pdflessActionHandlers: ProviderActionHandlers<"pdfless", PdflessActionHandler> = {
  get_workspace(_input, context) {
    return pdflessGetWorkspace(context);
  },
  list_document_templates(input, context) {
    return pdflessListDocumentTemplates(input, context);
  },
  create_pdf(input, context) {
    return pdflessCreatePdf(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("pdfless", pdflessActionHandlers);

export async function validatePdflessCredential(
  input: Record<string, string>,
  fetcher: ProviderFetch,
): Promise<CredentialValidationResult> {
  const payload = await pdflessRequest({
    path: pdflessWorkspacePath,
    apiKey: input.apiKey,
    fetcher,
    phase: "validate",
  });
  const workspace = normalizeWorkspacePayload(payload);

  return {
    profile: {
      accountId: workspace.name ?? "pdfless-api-key",
      displayName: workspace.name ?? "Pdfless API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: pdflessApiBaseUrl,
      validationEndpoint: pdflessWorkspacePath,
      workspaceName: workspace.name,
      active: workspace.active,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      quota: workspace.quota,
      remainingQuota: workspace.remainingQuota,
    }),
  };
}

async function pdflessGetWorkspace(context: PdflessActionContext): Promise<unknown> {
  const payload = await pdflessRequest({
    path: pdflessWorkspacePath,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
  return {
    workspace: normalizeWorkspacePayload(payload),
  };
}

async function pdflessListDocumentTemplates(
  input: Record<string, unknown>,
  context: PdflessActionContext,
): Promise<unknown> {
  const payload = await pdflessRequest({
    path: "/v1/document-templates",
    query: compactObject({
      Page: optionalInteger(input.page),
      PageSize: optionalInteger(input.pageSize),
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });

  return normalizeTemplateListPayload(payload);
}

async function pdflessCreatePdf(input: Record<string, unknown>, context: PdflessActionContext): Promise<unknown> {
  const templateId = requiredInputString(input.templateId, "templateId");
  const payload = await pdflessRequest({
    path: pdflessPdfsPath,
    method: "POST",
    body: compactObject({
      template_id: templateId,
      payload: optionalRecord(input.payload),
      reference_id: optionalString(input.referenceId),
      encryption_user_password: optionalRawString(input.encryptionUserPassword),
      encryption_owner_password: optionalRawString(input.encryptionOwnerPassword),
      encryption_allow_printing: optionalBoolean(input.encryptionAllowPrinting),
      encryption_allow_modifying: optionalBoolean(input.encryptionAllowModifying),
      encryption_allow_modify_annotations: optionalBoolean(input.encryptionAllowModifyAnnotations),
      encryption_allow_content_copying: optionalBoolean(input.encryptionAllowContentCopying),
      encryption_allow_screenreaders: optionalBoolean(input.encryptionAllowScreenreaders),
      encryption_allow_form_filling: optionalBoolean(input.encryptionAllowFormFilling),
      encryption_allow_document_assembly: optionalBoolean(input.encryptionAllowDocumentAssembly),
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
  const pdf = normalizePdfPayload(payload);
  return {
    ...pdf,
    transitFile: await uploadProviderUrlToTransitFile(
      { url: pdf.downloadUrl, name: `${templateId}.pdf`, source: "Pdfless" },
      context,
    ),
  };
}

async function pdflessRequest(request: PdflessRequest): Promise<unknown> {
  const url = new URL(request.path, pdflessApiBaseUrl);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return runProviderRequest({ signal: request.signal, label: "Pdfless" }, async (signal) => {
    const response = await request.fetcher(url, {
      method: request.method ?? "GET",
      headers: pdflessHeaders(request.apiKey, request.body !== undefined),
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Pdfless returned a non-JSON response",
      invalidJsonFallback: (text) => text,
    });
    if (!response.ok) {
      throw mapPdflessError(response, payload, request.phase);
    }

    return payload;
  });
}

function pdflessHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    apikey: apiKey,
    "user-agent": providerUserAgent,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function mapPdflessError(response: Response, payload: unknown, phase: PdflessRequestPhase): ProviderRequestError {
  const message = extractPdflessErrorMessage(payload) ?? (response.statusText || "Pdfless request failed");

  // quota_exceeded is a consumed monthly quota, not a bad credential, whatever status carries it.
  if (optionalString(optionalRecord(payload)?.error_code) === "quota_exceeded") {
    return new ProviderRequestError(402, message, payload, "insufficient_credit");
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if ((response.status === 401 || response.status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 403) {
    return new ProviderRequestError(403, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function extractPdflessErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.error_code);
}

function normalizeWorkspacePayload(payload: unknown): PdflessWorkspace {
  const record = unwrapPdflessRecord(payload);
  return {
    name: optionalStringOrNull(record.name),
    active: readRequiredBoolean(record.active, "active"),
    createdAt: readRequiredString(record.created ?? record.created_at, "created"),
    updatedAt: optionalStringOrNull(record.modified ?? record.modified_at ?? record.updated_at),
    quota: nullableInteger(record.quota) ?? null,
    remainingQuota: nullableInteger(record.remainingQuota ?? record.remaining_quota) ?? null,
  };
}

function normalizeTemplateListPayload(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload)) {
    return {
      templates: payload.map((item) => normalizeTemplate(item)),
    };
  }

  const record = unwrapPdflessRecord(payload);
  const nestedData = optionalRecord(record.data);
  const paginationRecord = optionalRecord(record.pagination ?? nestedData?.pagination);

  const rawTemplates = Array.isArray(record.data)
    ? record.data
    : Array.isArray(nestedData?.data)
      ? nestedData.data
      : [];

  return compactObject({
    templates: rawTemplates.map((item) => normalizeTemplate(item)),
    pagination: paginationRecord ? normalizePagination(paginationRecord) : undefined,
  });
}

function normalizeTemplate(payload: unknown): PdflessTemplate {
  const record = unwrapPdflessRecord(payload);
  return {
    id: readRequiredString(record.id, "id"),
    name: optionalStringOrNull(record.name),
    imagePreviewUrl: optionalStringOrNull(record.imagePreviewUrl ?? record.image_preview_url),
    pdfPreviewUrl: optionalStringOrNull(record.pdfPreviewUrl ?? record.pdf_preview_url),
    createdAt: readRequiredString(record.created ?? record.created_at, "created"),
    updatedAt: optionalStringOrNull(record.modified ?? record.modified_at ?? record.updated_at),
  };
}

function normalizePagination(payload: Record<string, unknown>): Record<string, number> {
  return {
    page: readRequiredInteger(payload.page, "page"),
    pageSize: readRequiredInteger(payload.pageSize ?? payload.page_size, "pageSize"),
    totalItems: readRequiredInteger(payload.totalItems ?? payload.total_items, "totalItems"),
    totalPages: readRequiredInteger(payload.totalPages ?? payload.total_pages, "totalPages"),
  };
}

function normalizePdfPayload(payload: unknown): PdflessGeneratedPdf {
  const record = unwrapPdflessRecord(payload);
  return {
    templateId: optionalStringOrNull(record.template_id),
    referenceId: optionalStringOrNull(record.reference_id),
    downloadUrl: readRequiredString(record.download_url, "download_url"),
    expiresAt: optionalStringOrNull(record.expires),
    createdAt: optionalStringOrNull(record.created_at),
  };
}

function unwrapPdflessRecord(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "Pdfless response");
  return optionalRecord(record.data) ?? record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `Pdfless response missing string field: ${fieldName}`);
  }
  return parsed;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `Pdfless response missing boolean field: ${fieldName}`);
  }
  return value;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `Pdfless response missing integer field: ${fieldName}`);
  }
  return parsed;
}
