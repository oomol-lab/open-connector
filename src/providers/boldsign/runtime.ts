import {
  compactObject,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalBoolean,
  requiredString,
} from "../../core/cast.ts";
import {
  providerInputError,
  ProviderRequestError,
  createProviderTimeout,
  providerUserAgent,
} from "../provider-runtime.ts";

export type BoldSignRegion = "us" | "eu" | "ca" | "au";

export interface BoldSignActionContext {
  apiBaseUrl: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface BoldSignRequestInput extends BoldSignActionContext {
  path: string;
  method: "GET" | "POST";
  phase: "validate" | "execute";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

type BoldSignActionHandler = (input: Record<string, unknown>, context: BoldSignActionContext) => Promise<unknown>;

const boldSignCreditsPath = "/v1/plan/apiCreditsCount";

const boldSignApiBaseUrlByRegion: Record<BoldSignRegion, string> = {
  us: "https://api.boldsign.com",
  eu: "https://api-eu.boldsign.com",
  ca: "https://api-ca.boldsign.com",
  au: "https://api-au.boldsign.com",
};

export const boldSignActionHandlers: Record<string, BoldSignActionHandler> = {
  async get_api_credits(_input, context) {
    const payload = await requestBoldSignJson({
      ...context,
      path: boldSignCreditsPath,
      method: "GET",
      phase: "execute",
    });
    return normalizeApiCredits(payload);
  },
  async list_documents(input, context) {
    const payload = await requestBoldSignJson({
      ...context,
      path: "/v1/document/list",
      method: "GET",
      phase: "execute",
      query: {
        Page: optionalInteger(input.page) ?? 1,
        PageSize: optionalInteger(input.pageSize),
        SentBy: input.sentBy,
        Recipients: input.recipients,
        TransmitType: optionalString(input.transmitType),
        DateFilterType: optionalString(input.dateFilterType),
        StartDate: optionalString(input.startDate),
        EndDate: optionalString(input.endDate),
        Status: input.statuses,
        SearchKey: optionalString(input.searchKey),
        Labels: input.labels,
        NextCursor: optionalInteger(input.nextCursor),
        BrandIds: input.brandIds,
      },
    });
    return normalizeDocumentList(payload);
  },
  async get_document_details(input, context) {
    const documentId = readRequiredInputString(input.documentId, "documentId");
    const payload = await requestBoldSignJson({
      ...context,
      path: "/v1/document/properties",
      method: "GET",
      phase: "execute",
      query: { documentId },
    });
    return { document: normalizeDocumentDetails(payload) };
  },
  async list_templates(input, context) {
    const payload = await requestBoldSignJson({
      ...context,
      path: "/v1/template/list",
      method: "GET",
      phase: "execute",
      query: {
        Page: optionalInteger(input.page) ?? 1,
        PageSize: optionalInteger(input.pageSize),
        TemplateType: optionalString(input.templateType),
        SearchKey: optionalString(input.searchKey),
        OnBehalfOf: input.onBehalfOf,
        CreatedBy: input.createdBy,
        TemplateLabels: input.labels,
        StartDate: optionalString(input.startDate),
        EndDate: optionalString(input.endDate),
        BrandIds: input.brandIds,
        SharedWithTeamId: input.sharedWithTeamIds,
      },
    });
    return normalizeTemplateList(payload);
  },
  async get_template_details(input, context) {
    const templateId = readRequiredInputString(input.templateId, "templateId");
    const payload = await requestBoldSignJson({
      ...context,
      path: "/v1/template/properties",
      method: "GET",
      phase: "execute",
      query: { templateId },
    });
    return { template: normalizeTemplateDetails(payload) };
  },
  async send_document_from_template(input, context) {
    const templateId = readRequiredInputString(input.templateId, "templateId");
    const payload = await requestBoldSignJson({
      ...context,
      path: "/v1/template/send",
      method: "POST",
      phase: "execute",
      query: { templateId },
      body: buildSendFromTemplateBody(input),
    });
    const response = readResponseObject(payload, "BoldSign send-from-template response");
    return {
      documentId: readRequiredResponseString(response.documentId, "documentId", "BoldSign send-from-template response"),
    };
  },
};

export function normalizeBoldSignRegion(value: unknown): BoldSignRegion {
  const region = optionalString(value)?.trim().toLowerCase();
  if (region === "us" || region === "eu" || region === "ca" || region === "au") {
    return region;
  }
  throw boldSignError("invalid_input", "BoldSign region must be one of us, eu, ca, or au", 400);
}

export function buildBoldSignApiBaseUrl(region: BoldSignRegion): string {
  return boldSignApiBaseUrlByRegion[region];
}

export async function validateBoldSignCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<import("../../core/types.ts").CredentialValidationResult> {
  const region = normalizeBoldSignRegion(input.values.region);
  const apiBaseUrl = buildBoldSignApiBaseUrl(region);
  const payload = await requestBoldSignJson({
    apiBaseUrl,
    apiKey: requiredString(input.apiKey, "apiKey", providerInputError),
    fetcher,
    signal,
    path: boldSignCreditsPath,
    method: "GET",
    phase: "validate",
  });
  const credits = normalizeApiCredits(payload);

  return {
    profile: {
      accountId: `boldsign:${region}`,
      displayName: `BoldSign ${region.toUpperCase()} API Key`,
    },
    metadata: {
      apiBaseUrl,
      balanceCredits: credits.balanceCredits,
      region,
      validationEndpoint: boldSignCreditsPath,
    },
  };
}

function buildSendFromTemplateBody(input: Record<string, unknown>) {
  const roles = readOptionalInputObjectArray(input.roles, "roles")?.map((role) =>
    compactObject({
      roleIndex: optionalInteger(role.roleIndex),
      signerName: optionalString(role.signerName),
      signerEmail: optionalString(role.signerEmail),
      signerOrder: optionalInteger(role.signerOrder),
      privateMessage: optionalString(role.privateMessage),
      signerType: optionalString(role.signerType),
      locale: optionalString(role.locale),
    }),
  );
  const cc = readOptionalInputStringArray(input.cc, "cc")?.map((emailAddress) => ({
    emailAddress,
  }));

  return compactObject({
    title: optionalString(input.title),
    message: optionalString(input.message),
    roles,
    fileUrls: readOptionalInputStringArray(input.fileUrls, "fileUrls"),
    labels: readOptionalInputStringArray(input.labels, "labels"),
    cc,
    disableEmails: optionalBoolean(input.disableEmails),
    disableSMS: optionalBoolean(input.disableSms),
    enableSigningOrder: optionalBoolean(input.enableSigningOrder),
    enableReassign: optionalBoolean(input.enableReassign),
    enablePrintAndSign: optionalBoolean(input.enablePrintAndSign),
    expiryDateType: optionalString(input.expiryDateType),
    expiryValue: optionalInteger(input.expiryValue),
    onBehalfOf: optionalString(input.onBehalfOf),
    isSandbox: optionalBoolean(input.isSandbox),
    metaData: optionalRecord(input.metadata),
  });
}

async function requestBoldSignJson(input: BoldSignRequestInput) {
  const timeout = createProviderTimeout(input.signal);
  try {
    const url = new URL(input.path, `${input.apiBaseUrl}/`);
    appendQuery(url, input.query);
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": providerUserAgent,
      "X-API-KEY": input.apiKey,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }
    const response = await input.fetcher(url, {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readBoldSignPayload(response);
    if (!response.ok) {
      throw createBoldSignError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortError(error)) {
      throw boldSignError("provider_error", "BoldSign request timed out", 504);
    }
    throw boldSignError(
      "provider_error",
      error instanceof Error ? `BoldSign request failed: ${error.message}` : "BoldSign request failed",
      502,
    );
  } finally {
    timeout.cleanup();
  }
}

function appendQuery(url: URL, query: Record<string, unknown> | undefined) {
  if (!query) {
    return;
  }
  for (const [name, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) {
          url.searchParams.append(name, String(item));
        }
      }
    } else if (value != null) {
      url.searchParams.set(name, String(value));
    }
  }
}

async function readBoldSignPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createBoldSignError(response: Response, payload: unknown, phase: "validate" | "execute") {
  const message = readBoldSignErrorMessage(payload) ?? `BoldSign request failed with status ${response.status}`;
  if (response.status === 429) {
    return boldSignError("rate_limited", message, 429);
  }
  if (phase === "validate" && 400 <= response.status && response.status < 500) {
    return boldSignError("invalid_input", message, 400);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return boldSignError("credential_expired", message, response.status);
  }
  if (phase === "execute" && 400 <= response.status && response.status < 500) {
    return boldSignError("invalid_input", message, response.status);
  }
  return boldSignError("provider_error", message, response.status || 500);
}

function readBoldSignErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }
  const response = optionalRecord(payload);
  return optionalString(response?.error) ?? optionalString(response?.message);
}

function normalizeApiCredits(payload: unknown) {
  const response = readResponseObject(payload, "BoldSign API credits response");
  const balanceCredits = optionalNumber(response.BalanceCredits);
  if (balanceCredits == null) {
    throw boldSignError("provider_error", "BoldSign API credits response did not include BalanceCredits", 502);
  }
  return { balanceCredits };
}

function normalizeDocumentList(payload: unknown) {
  const response = readResponseObject(payload, "BoldSign document list response");
  return {
    documents: readListResponseObjectArray(response.result, "BoldSign document list response").map(
      normalizeDocumentSummary,
    ),
    pagination: normalizePagination(response.pageDetails, "BoldSign document list response"),
  };
}

function normalizeDocumentSummary(value: Record<string, unknown>) {
  return {
    documentId: readRequiredResponseString(value.documentId, "documentId", "BoldSign document list item"),
    title: optionalString(value.messageTitle) ?? null,
    status: readRequiredResponseString(value.status, "status", "BoldSign document list item"),
    createdAt: readNullableInteger(value.createdDate),
    activityAt: readNullableInteger(value.activityDate),
    expiryAt: readNullableInteger(value.expiryDate),
    labels: readResponseStringArray(value.labels),
    cursor: readNullableInteger(value.cursor),
    raw: value,
  };
}

function normalizeDocumentDetails(payload: unknown) {
  const response = readResponseObject(payload, "BoldSign document details response");
  return {
    documentId: readRequiredResponseString(response.documentId, "documentId", "BoldSign document details response"),
    title: optionalString(response.messageTitle) ?? null,
    description: optionalString(response.documentDescription) ?? null,
    status: readRequiredResponseString(response.status, "status", "BoldSign document details response"),
    createdAt: readNullableInteger(response.createdDate),
    expiryAt: readNullableInteger(response.expiryDate),
    labels: readResponseStringArray(response.labels),
    signers: readResponseObjectArray(response.signerDetails, "signerDetails", "BoldSign document details response"),
    raw: response,
  };
}

function normalizeTemplateList(payload: unknown) {
  const response = readResponseObject(payload, "BoldSign template list response");
  return {
    templates: readListResponseObjectArray(response.result, "BoldSign template list response").map(
      normalizeTemplateSummary,
    ),
    pagination: normalizePagination(response.pageDetails, "BoldSign template list response"),
  };
}

function normalizeTemplateSummary(value: Record<string, unknown>) {
  return {
    templateId: readRequiredResponseString(value.documentId, "documentId", "BoldSign template list item"),
    name: optionalString(value.templateName) ?? null,
    description: optionalString(value.templateDescription) ?? null,
    createdAt: readNullableInteger(value.createdDate),
    activityAt: readNullableInteger(value.activityDate),
    labels: readResponseStringArray(value.templateLabels),
    accessType: optionalString(value.accessType) ?? null,
    raw: value,
  };
}

function normalizeTemplateDetails(payload: unknown) {
  const response = readResponseObject(payload, "BoldSign template details response");
  return {
    templateId: readRequiredResponseString(response.templateId, "templateId", "BoldSign template details response"),
    title: optionalString(response.title) ?? null,
    description: optionalString(response.description) ?? null,
    documentTitle: optionalString(response.documentTitle) ?? null,
    documentMessage: optionalString(response.documentMessage) ?? null,
    createdAt: readNullableInteger(response.createdDate),
    labels: readResponseStringArray(response.templateLabels),
    roles: readResponseObjectArray(response.roles, "roles", "BoldSign template details response"),
    files: readResponseObjectArray(response.files, "files", "BoldSign template details response"),
    raw: response,
  };
}

function normalizePagination(value: unknown, context: string) {
  const pageDetails = readResponseObject(value, `${context} pageDetails`);
  return {
    page: readNullableResponseInteger(pageDetails.page, "page", context),
    pageSize: readNullableResponseInteger(pageDetails.pageSize, "pageSize", context),
    totalRecords: readNullableResponseInteger(pageDetails.totalRecordsCount, "totalRecordsCount", context),
    totalPages: readNullableResponseInteger(pageDetails.totalPages, "totalPages", context),
  };
}

function readResponseObject(value: unknown, context: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw boldSignError("provider_error", `${context} was not an object`, 502);
  }
  return object;
}

function readRequiredResponseString(value: unknown, fieldName: string, context: string) {
  const text = optionalString(value)?.trim();
  if (!text) {
    throw boldSignError("provider_error", `${context} did not include ${fieldName}`, 502);
  }
  return text;
}

function readRequiredInputString(value: unknown, fieldName: string) {
  const text = optionalString(value)?.trim();
  if (!text) {
    throw boldSignError("invalid_input", `${fieldName} is required`, 400);
  }
  return text;
}

function readNullableInteger(value: unknown) {
  if (value == null) {
    return null;
  }
  return optionalInteger(value) ?? null;
}

function readNullableResponseInteger(value: unknown, fieldName: string, context: string) {
  if (value == null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw boldSignError("provider_error", `${context} ${fieldName} was not an integer`, 502);
  }
  return value;
}

function readListResponseObjectArray(value: unknown, context: string) {
  if (value === undefined) {
    throw boldSignError("provider_error", `${context} did not include result`, 502);
  }
  return readResponseObjectArray(value, "result", context);
}

function readResponseObjectArray(value: unknown, fieldName: string, context: string) {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw boldSignError("provider_error", `${context} ${fieldName} was not an array`, 502);
  }
  return value.map((item, index) => {
    return readResponseObject(item, `${context} ${fieldName}[${index}]`);
  });
}

function readResponseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function readOptionalInputObjectArray(value: unknown, fieldName: string) {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw boldSignError("invalid_input", `${fieldName} must be an array`, 400);
  }
  return value.map((item) => {
    const object = optionalRecord(item);
    if (!object) {
      throw boldSignError("invalid_input", `${fieldName} must contain objects`, 400);
    }
    return object;
  });
}

function readOptionalInputStringArray(value: unknown, fieldName: string) {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw boldSignError("invalid_input", `${fieldName} must contain strings`, 400);
  }
  return value.map(String);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function boldSignError(code: string, message: string, status: number): ProviderRequestError {
  return new ProviderRequestError(status, message, { code });
}
