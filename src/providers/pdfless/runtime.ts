import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  nullableInteger,
  optionalInteger,
  optionalRecord,
  optionalString,
  optionalStringOrNull,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const pdflessApiBaseUrl = "https://api.pdfless.com";
const pdflessWorkspacePath = "/v1/workspaces";

type PdflessRequestPhase = "validate" | "execute";
type PdflessActionContext = ApiKeyProviderContext;
type PdflessActionHandler = (input: Record<string, unknown>, context: PdflessActionContext) => Promise<unknown>;

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

export const pdflessActionHandlers: ProviderActionHandlers<"pdfless", PdflessActionHandler> = {
  get_workspace(_input, context) {
    return pdflessGetWorkspace(context);
  },
  list_document_templates(input, context) {
    return pdflessListDocumentTemplates(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("pdfless", pdflessActionHandlers);

export async function validatePdflessCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const payload = await pdflessGet(pdflessWorkspacePath, {}, input.apiKey, fetcher, "validate");
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
  const payload = await pdflessGet(pdflessWorkspacePath, {}, context.apiKey, context.fetcher, "execute");
  return {
    workspace: normalizeWorkspacePayload(payload),
  };
}

async function pdflessListDocumentTemplates(
  input: Record<string, unknown>,
  context: PdflessActionContext,
): Promise<unknown> {
  const payload = await pdflessGet(
    "/v1/document-templates",
    compactObject({
      Page: optionalInteger(input.page),
      PageSize: optionalInteger(input.pageSize),
    }),
    context.apiKey,
    context.fetcher,
    "execute",
  );

  return normalizeTemplateListPayload(payload);
}

async function pdflessGet(
  path: string,
  query: Record<string, number | undefined>,
  apiKey: string,
  fetcher: typeof fetch,
  phase: PdflessRequestPhase,
): Promise<unknown> {
  const url = new URL(path, pdflessApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: pdflessHeaders(apiKey),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Pdfless request failed: ${error.message}` : "Pdfless request failed",
    );
  }

  const payload = await readPdflessPayload(response);
  if (!response.ok) {
    throw mapPdflessError(response, payload, phase);
  }

  return payload;
}

function pdflessHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    apikey: apiKey,
    "user-agent": providerUserAgent,
  };
}

async function readPdflessPayload(response: Response): Promise<unknown> {
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

function mapPdflessError(response: Response, payload: unknown, phase: PdflessRequestPhase): ProviderRequestError {
  const message = extractPdflessErrorMessage(payload) ?? (response.statusText || "Pdfless request failed");

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

function unwrapPdflessRecord(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Pdfless response must be an object");
  }

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
