import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  nullableString,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const pdfmonkeyApiBaseUrl = "https://api.pdfmonkey.io";
const currentUserPath = "/api/v1/current_user";
const documentsPath = "/api/v1/documents";
const documentCardsPath = "/api/v1/document_cards";
const documentTemplatesPath = "/api/v1/document_templates";
const documentTemplateCardsPath = "/api/v1/document_template_cards";

type PdfmonkeyRequestPhase = "validate" | "execute";
type PdfmonkeyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

type PdfmonkeyCurrentUser = {
  id: string;
  availableDocuments: number | null;
  createdAt: string;
  currentPlan: string | null;
  currentPlanInterval: string | null;
  desiredName: string | null;
  email: string | null;
  lang: string | null;
  payingCustomer: boolean | null;
  trialEndsOn: string | null;
  updatedAt: string;
  blockResources: boolean | null;
  shareLinks: boolean | null;
};

type PdfmonkeyDocumentCard = {
  id: string;
  appId: string;
  createdAt: string;
  documentTemplateId: string;
  documentTemplateIdentifier: string | null;
  downloadUrl: string | null;
  failureCause: string | null;
  filename: string | null;
  meta: Record<string, unknown> | string | null;
  outputType: string;
  previewUrl: string | null;
  publicShareLink: string | null;
  status: string;
  updatedAt: string;
};

type PdfmonkeyDocument = PdfmonkeyDocumentCard & {
  checksum: string | null;
  generationLogs: Array<{
    type: string;
    message: string;
    timestamp: string;
  }>;
  payload: Record<string, unknown> | string | null;
};

type PdfmonkeyPagination = {
  currentPage: number;
  nextPage: number | null;
  prevPage: number | null;
  totalPages: number;
};

type PdfmonkeyDocumentTemplateCard = {
  id: string;
  appId: string;
  identifier: string;
  editionMode: string;
  outputType: string;
  templateFolderId: string | null;
  ttl: number;
  createdAt: string;
  updatedAt: string;
  previewUrl: string | null;
};

type PdfmonkeyDocumentTemplate = PdfmonkeyDocumentTemplateCard & {
  body: string;
  bodyDraft: string;
  scssStyle: string;
  scssStyleDraft: string;
  sampleData: string;
  sampleDataDraft: string;
  settings: Record<string, unknown>;
  settingsDraft: Record<string, unknown>;
  pdfEngineId: string | null;
  pdfEngineDraftId: string | null;
  checksum: string | null;
};

export const pdfmonkeyActionHandlers: ProviderActionHandlers<"pdfmonkey", PdfmonkeyActionHandler> = {
  async get_current_user(_input, context) {
    const payload = await requestPdfmonkey({
      path: currentUserPath,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      currentUser: normalizeCurrentUser(payload),
    };
  },
  async create_document(input, context) {
    const payload = await requestPdfmonkey({
      path: documentsPath,
      method: "POST",
      body: {
        document: compactObject({
          document_template_id: readRequiredString(input.documentTemplateId, "documentTemplateId"),
          payload: normalizeJsonInputValue(input.payload),
          meta: normalizeJsonInputValue(input.meta),
          status: optionalString(input.status),
        }),
      },
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      document: normalizeDocument(readNamedObject(payload, "document")),
    };
  },
  async get_document_card(input, context) {
    const payload = await requestPdfmonkey({
      path: `${documentCardsPath}/${encodeURIComponent(readRequiredString(input.documentId, "documentId"))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      documentCard: normalizeDocumentCard(readNamedObject(payload, "document_card")),
    };
  },
  async list_document_cards(input, context) {
    const payload = await requestPdfmonkey({
      path: documentCardsPath,
      query: compactObject({
        "page[number]": optionalInteger(input.pageNumber),
        "q[document_template_id]": optionalString(input.documentTemplateId),
        "q[status]": optionalString(input.status),
        "q[workspace_id]": optionalString(input.workspaceId),
        "q[updated_since]": optionalString(input.updatedSince),
        "q[search]": optionalString(input.search),
      }),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      documentCards: readNamedArray(payload, "document_cards").map((item) => normalizeDocumentCard(item)),
      pagination: normalizePagination(payload),
    };
  },
  async get_document(input, context) {
    const payload = await requestPdfmonkey({
      path: `${documentsPath}/${encodeURIComponent(readRequiredString(input.documentId, "documentId"))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      document: normalizeDocument(readNamedObject(payload, "document")),
    };
  },
  async list_document_template_cards(input, context) {
    const payload = await requestPdfmonkey({
      path: documentTemplateCardsPath,
      query: compactObject({
        "q[workspace_id]": readRequiredString(input.workspaceId, "workspaceId"),
        "q[folders]": optionalString(input.folders),
        page: optionalInteger(input.page),
        sort: optionalString(input.sort),
      }),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      documentTemplateCards: readNamedArray(payload, "document_template_cards").map((item) =>
        normalizeDocumentTemplateCard(item),
      ),
      pagination: normalizePagination(payload),
    };
  },
  async get_document_template(input, context) {
    const payload = await requestPdfmonkey({
      path: `${documentTemplatesPath}/${encodeURIComponent(readRequiredString(input.templateId, "templateId"))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      documentTemplate: normalizeDocumentTemplate(readNamedObject(payload, "document_template")),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("pdfmonkey", pdfmonkeyActionHandlers);

export async function validatePdfmonkeyCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const payload = await requestPdfmonkey({
    path: currentUserPath,
    apiKey: input.apiKey,
    fetcher,
    phase: "validate",
  });
  const currentUser = normalizeCurrentUser(payload);

  return {
    profile: {
      accountId: currentUser.id,
      displayName: currentUser.desiredName ?? currentUser.email ?? "PDFMonkey API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: pdfmonkeyApiBaseUrl,
      validationEndpoint: currentUserPath,
      currentUserId: currentUser.id,
      desiredName: currentUser.desiredName,
      email: currentUser.email,
      availableDocuments: currentUser.availableDocuments,
      currentPlan: currentUser.currentPlan,
      currentPlanInterval: currentUser.currentPlanInterval,
      payingCustomer: currentUser.payingCustomer,
      trialEndsOn: currentUser.trialEndsOn,
      createdAt: currentUser.createdAt,
      updatedAt: currentUser.updatedAt,
      blockResources: currentUser.blockResources,
      shareLinks: currentUser.shareLinks,
      lang: currentUser.lang,
    }),
  };
}

async function requestPdfmonkey(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: PdfmonkeyRequestPhase;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}) {
  const url = new URL(input.path, pdfmonkeyApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${input.apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (input.body) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
    payload = await readPdfmonkeyPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `pdfmonkey request failed: ${error.message}` : "pdfmonkey request failed",
    );
  }

  if (!response.ok) {
    throw createPdfmonkeyError(response, payload, input.phase);
  }

  return payload;
}

function createPdfmonkeyError(response: Response, payload: unknown, phase: PdfmonkeyRequestPhase) {
  const message = extractPdfmonkeyErrorMessage(payload) ?? response.statusText ?? "pdfmonkey request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status === 404 ? 400 : response.status, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

async function readPdfmonkeyPayload(response: Response) {
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

function extractPdfmonkeyErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const topLevel =
    optionalString(record.message) ??
    optionalString(record.detail) ??
    optionalString(record.error) ??
    optionalString(record.title);
  if (topLevel) {
    return topLevel;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    for (const entry of errors) {
      const entryRecord = optionalRecord(entry);
      const detail =
        optionalString(entryRecord?.detail) ??
        optionalString(entryRecord?.title) ??
        optionalString(entryRecord?.message);
      if (detail) {
        return detail;
      }
    }
  }

  const errorsRecord = optionalRecord(errors);
  if (!errorsRecord) {
    return undefined;
  }

  for (const [field, value] of Object.entries(errorsRecord)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = optionalString(item);
        if (text) {
          return `${field}: ${text}`;
        }
      }
    }

    const text = optionalString(value);
    if (text) {
      return `${field}: ${text}`;
    }
  }

  return undefined;
}

function normalizeCurrentUser(payload: unknown): PdfmonkeyCurrentUser {
  const record = readNamedObject(payload, "current_user");

  return {
    id: readRequiredString(record.id, "id"),
    availableDocuments: nullableNumber(record.available_documents) ?? null,
    createdAt: readRequiredString(record.created_at, "created_at"),
    currentPlan: nullableString(record.current_plan) ?? null,
    currentPlanInterval: nullableString(record.current_plan_interval) ?? null,
    desiredName: nullableString(record.desired_name) ?? null,
    email: nullableString(record.email) ?? null,
    lang: nullableString(record.lang) ?? null,
    payingCustomer: normalizeNullableBoolean(record.paying_customer),
    trialEndsOn: nullableString(record.trial_ends_on) ?? null,
    updatedAt: readRequiredString(record.updated_at, "updated_at"),
    blockResources: normalizeNullableBoolean(record.block_resources),
    shareLinks: normalizeNullableBoolean(record.share_links),
  };
}

function normalizeDocumentCard(payload: unknown): PdfmonkeyDocumentCard {
  const record = readResponseObject(payload);

  return {
    id: readRequiredString(record.id, "id"),
    appId: readRequiredString(record.app_id, "app_id"),
    createdAt: readRequiredString(record.created_at, "created_at"),
    documentTemplateId: readRequiredString(record.document_template_id, "document_template_id"),
    documentTemplateIdentifier: nullableString(record.document_template_identifier) ?? null,
    downloadUrl: nullableString(record.download_url) ?? null,
    failureCause: nullableString(record.failure_cause) ?? null,
    filename: nullableString(record.filename) ?? null,
    meta: normalizeNullableJsonValue(record.meta),
    outputType: readRequiredString(record.output_type, "output_type"),
    previewUrl: nullableString(record.preview_url) ?? null,
    publicShareLink: nullableString(record.public_share_link) ?? null,
    status: readRequiredString(record.status, "status"),
    updatedAt: readRequiredString(record.updated_at, "updated_at"),
  };
}

function normalizeDocument(payload: unknown): PdfmonkeyDocument {
  const record = readResponseObject(payload);
  const generationLogsValue = record.generation_logs;
  if (!Array.isArray(generationLogsValue)) {
    throw new ProviderRequestError(502, "pdfmonkey response field generation_logs must be an array");
  }
  const generationLogs = generationLogsValue.map((entry) => normalizeGenerationLog(entry));
  const card = normalizeDocumentCard(record);

  return {
    ...card,
    checksum: nullableString(record.checksum) ?? null,
    generationLogs,
    payload: normalizeNullableJsonValue(record.payload),
  };
}

function normalizeGenerationLog(payload: unknown) {
  const record = readResponseObject(payload);
  return {
    type: readRequiredString(record.type, "type"),
    message: readRequiredString(record.message, "message"),
    timestamp: readRequiredString(record.timestamp, "timestamp"),
  };
}

function normalizePagination(payload: unknown): PdfmonkeyPagination {
  const topLevel = readResponseObject(payload);
  const meta = readResponseObject(topLevel.meta);

  return {
    currentPage: readRequiredInteger(meta.current_page, "current_page"),
    nextPage: optionalInteger(meta.next_page) ?? null,
    prevPage: optionalInteger(meta.prev_page) ?? null,
    totalPages: readRequiredInteger(meta.total_pages, "total_pages"),
  };
}

function normalizeDocumentTemplateCard(payload: unknown): PdfmonkeyDocumentTemplateCard {
  const record = readResponseObject(payload);

  return {
    id: readRequiredString(record.id, "id"),
    appId: readRequiredString(record.app_id, "app_id"),
    identifier: readRequiredString(record.identifier, "identifier"),
    editionMode: readRequiredString(record.edition_mode, "edition_mode"),
    outputType: readRequiredString(record.output_type, "output_type"),
    templateFolderId: nullableString(record.template_folder_id) ?? null,
    ttl: readRequiredNumber(record.ttl, "ttl"),
    createdAt: readRequiredString(record.created_at, "created_at"),
    updatedAt: readRequiredString(record.updated_at, "updated_at"),
    previewUrl: nullableString(record.preview_url) ?? null,
  };
}

function normalizeDocumentTemplate(payload: unknown): PdfmonkeyDocumentTemplate {
  const record = readResponseObject(payload);
  const card = normalizeDocumentTemplateCard(record);

  return {
    ...card,
    body: readRequiredStringAllowEmpty(record.body, "body"),
    bodyDraft: readRequiredStringAllowEmpty(record.body_draft, "body_draft"),
    scssStyle: readRequiredStringAllowEmpty(record.scss_style, "scss_style"),
    scssStyleDraft: readRequiredStringAllowEmpty(record.scss_style_draft, "scss_style_draft"),
    sampleData: readRequiredStringAllowEmpty(record.sample_data, "sample_data"),
    sampleDataDraft: readRequiredStringAllowEmpty(record.sample_data_draft, "sample_data_draft"),
    settings: readResponseObject(record.settings),
    settingsDraft: readResponseObject(record.settings_draft),
    pdfEngineId: nullableString(record.pdf_engine_id) ?? null,
    pdfEngineDraftId: nullableString(record.pdf_engine_draft_id) ?? null,
    checksum: nullableString(record.checksum) ?? null,
  };
}

function normalizeJsonInputValue(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  const text = optionalString(value);
  if (text !== undefined) {
    return text;
  }
  const record = optionalRecord(value);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(400, "JSON object or JSON string input is required");
}

function normalizeNullableJsonValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = optionalString(value);
  if (text !== undefined) {
    return text;
  }
  const record = optionalRecord(value);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(502, "invalid JSON value returned by pdfmonkey");
}

function normalizeNullableBoolean(value: unknown) {
  if (value === null) {
    return null;
  }
  return optionalBoolean(value) ?? null;
}

function readNamedObject(payload: unknown, key: string) {
  const record = readResponseObject(payload);
  return readResponseObject(record[key]);
}

function readNamedArray(payload: unknown, key: string) {
  const record = readResponseObject(payload);
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `pdfmonkey response field ${key} must be an array`);
  }
  return value;
}

function readResponseObject(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "pdfmonkey response object is missing");
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string) {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `pdfmonkey response field ${fieldName} is missing`);
  }
  return text;
}

function readRequiredStringAllowEmpty(value: unknown, fieldName: string) {
  const text = optionalRawString(value);
  if (text === undefined) {
    throw new ProviderRequestError(502, `pdfmonkey response field ${fieldName} is missing`);
  }
  return text;
}

function readRequiredNumber(value: unknown, fieldName: string) {
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `pdfmonkey response field ${fieldName} is missing`);
  }
  return value;
}

function readRequiredInteger(value: unknown, fieldName: string) {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `pdfmonkey response field ${fieldName} is missing`);
  }
  return parsed;
}

function nullableNumber(value: unknown): number | null {
  return value === null ? null : (optionalNumber(value) ?? null);
}
