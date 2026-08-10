import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "boloforms";
const boloformsApiBaseUrl = "https://sapi.boloforms.com";
const boloformsValidationPath = "/signature/get-documents";

type BoloformsRequestPhase = "validate" | "execute";
type BoloformsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const boloformsActionHandlers: Record<string, BoloformsActionHandler> = {
  list_documents(input, context) {
    return listDocuments(input, context);
  },
  send_template_for_signing(input, context) {
    return sendTemplateForSigning(input, context);
  },
  list_template_respondents(input, context) {
    return listTemplateRespondents(input, context);
  },
  get_form_responses(input, context) {
    return getFormResponses(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, boloformsActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await boloformsRequest({
      method: "GET",
      path: boloformsValidationPath,
      query: {
        page: 1,
        limit: 1,
      },
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });

    return {
      profile: {
        accountId: service,
        displayName: "BoloForms API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: boloformsApiBaseUrl,
        validationEndpoint: boloformsValidationPath,
        validationMode: "read_probe",
      },
    };
  },
};

async function listDocuments(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspaceId = optionalString(input.workspaceId);
  const payload = await boloformsRequest({
    method: "GET",
    path: "/signature/get-documents",
    query: compactObject({
      query: optionalString(input.query),
      documentId: optionalString(input.documentId),
      filter: optionalString(input.filter),
      sortBy: optionalString(input.sortBy),
      sortOrder: optionalString(input.sortOrder),
      dateFrom: optionalString(input.dateFrom),
      dateTo: optionalString(input.dateTo),
      page: optionalInteger(input.page),
      limit: optionalInteger(input.limit),
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    headers: workspaceId ? { workspaceid: workspaceId } : undefined,
    phase: "execute",
  });

  const record = unwrapBoloformsData(payload);
  const documents = readRecordArray(record.documents).map((item) => ({
    documentId: readRequiredString(item.documentId, "documentId"),
    documentName: readRequiredString(item.documentName, "documentName"),
    signingType: readRequiredString(item.signingType, "signingType"),
    status: readRequiredString(item.status, "status"),
    createdAt: readRequiredString(item.createdAt, "createdAt"),
    updatedAt: readRequiredString(item.updatedAt, "updatedAt"),
  }));

  return compactObject({
    message: optionalString(record.message),
    documentsCount: optionalInteger(record.documentsCount),
    formCount: optionalInteger(record.formCount),
    page: optionalInteger(record.page),
    limit: optionalInteger(record.limit),
    documents,
  });
}

async function sendTemplateForSigning(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const signers = objectArray(input.signers, "signers", invalidInputError).map((item) =>
    compactObject({
      name: requiredString(item.name, "signers.name", invalidInputError),
      email: requiredString(item.email, "signers.email", invalidInputError),
      subject: optionalString(item.subject),
      message: optionalString(item.message),
      roleTitle: optionalString(item.roleTitle),
      roleColour: optionalString(item.roleColor),
    }),
  );
  const payload = await boloformsRequest({
    method: "POST",
    path: "/signature/pdf-template-lambda",
    body: compactObject({
      documentId: requiredString(input.documentId, "documentId", invalidInputError),
      signingType: requiredString(input.signingType, "signingType", invalidInputError),
      mailData:
        optionalString(input.mailSubject) || optionalString(input.mailMessage)
          ? compactObject({
              subject: optionalString(input.mailSubject),
              message: optionalString(input.mailMessage),
            })
          : undefined,
      receiversList: signers,
      variablesData: optionalRecord(input.customVariables),
      pdfData: optionalRecord(input.pdfData),
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  const record = unwrapBoloformsData(payload);
  const rawSigners = readRecordArray(record.signers ?? record.respondents);

  return compactObject({
    success: true,
    message: optionalString(record.message),
    documentId: optionalString(record.documentId),
    documentName: optionalString(record.documentName),
    signingType: optionalString(record.signingType),
    signers: rawSigners.length > 0 ? rawSigners.map(normalizeSignerSummary) : undefined,
    raw: hasExtraSendTemplateFields(record) ? record : undefined,
  });
}

async function listTemplateRespondents(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await boloformsRequest({
    method: "GET",
    path: "/signature/get-template-respondent",
    query: compactObject({
      templateId: requiredString(input.templateId, "templateId", invalidInputError),
      page: optionalInteger(input.page),
      limit: optionalInteger(input.limit),
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  const record = unwrapBoloformsData(payload);
  const respondents = readRecordArray(record.respondents ?? record.signers).map(normalizeSignerSummary);

  return compactObject({
    templateId: optionalString(record.templateId),
    page: optionalInteger(record.page),
    limit: optionalInteger(record.limit),
    total: optionalInteger(record.total ?? record.totalCount),
    respondents,
  });
}

async function getFormResponses(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await boloformsRequest({
    method: "GET",
    path: "/signature/get-form-responses",
    query: compactObject({
      formId: requiredString(input.formId, "formId", invalidInputError),
      page: optionalInteger(input.page),
      limit: optionalInteger(input.limit),
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  const record = unwrapBoloformsData(payload);
  const responses = readRecordArray(record.responses).map(normalizeFormResponse);

  return compactObject({
    formId: optionalString(record.formId),
    page: optionalInteger(record.page),
    limit: optionalInteger(record.limit),
    total: optionalInteger(record.total ?? record.totalCount),
    responses,
  });
}

async function boloformsRequest(input: {
  method: "GET" | "POST";
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  query?: Record<string, number | string | undefined>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  phase: BoloformsRequestPhase;
}): Promise<unknown> {
  const url = new URL(input.path, boloformsApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    const headers = new Headers({
      accept: "application/json",
      "user-agent": providerUserAgent,
      "x-api-key": input.apiKey,
    });
    if (input.body) {
      headers.set("content-type", "application/json");
    }
    for (const [key, value] of Object.entries(input.headers ?? {})) {
      headers.set(key, value);
    }

    response = await input.fetcher(url, {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
    payload = await readBoloformsPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `BoloForms request failed: ${error.message}` : "BoloForms request failed",
    );
  }

  if (!response.ok) {
    throw createBoloformsError(response, payload, input.phase);
  }

  return payload;
}

async function readBoloformsPayload(response: Response): Promise<unknown> {
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

function createBoloformsError(
  response: Response,
  payload: unknown,
  phase: BoloformsRequestPhase,
): ProviderRequestError {
  const message = extractBoloformsErrorMessage(payload) ?? response.statusText ?? "BoloForms request failed";

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractBoloformsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const topData = optionalRecord(record.data);

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(topData?.message) ??
    optionalString(topData?.error)
  );
}

function unwrapBoloformsData(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    return {};
  }

  const topData = optionalRecord(record.data);
  const nestedData = optionalRecord(topData?.data);

  return nestedData ?? topData ?? record;
}

function normalizeSignerSummary(input: Record<string, unknown>): Record<string, unknown> {
  const roleColor = optionalString(input.roleColor ?? input.roleColour);
  const normalized = compactObject({
    respondentDocumentId: optionalString(input.respondentDocumentId),
    signerId: optionalString(input.signerId),
    name: optionalString(input.name),
    email: optionalString(input.email),
    status: optionalString(input.status),
    roleTitle: optionalString(input.roleTitle),
    roleColor,
    hasDeclined: optionalBoolean(input.hasDeclined),
    signingOrderNo: optionalInteger(input.signingOrderNo),
  });

  return Object.keys(normalized).length === Object.keys(input).length
    ? normalized
    : {
        ...normalized,
        raw: input,
      };
}

function normalizeFormResponse(input: Record<string, unknown>): Record<string, unknown> {
  const normalized = compactObject({
    responseId: optionalString(input.responseId),
    name: optionalString(input.name),
    email: optionalString(input.email),
    submittedAt: optionalString(input.submittedAt),
    answers: optionalRecord(input.answers ?? input.data),
  });

  return Object.keys(normalized).length === Object.keys(input).length
    ? normalized
    : {
        ...normalized,
        raw: input,
      };
}

function hasExtraSendTemplateFields(record: Record<string, unknown>): boolean {
  const knownKeys = new Set(["message", "documentId", "documentName", "signingType", "signers"]);
  return Object.keys(record).some((key) => !knownKeys.has(key));
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => requiredRecord(item, "BoloForms array item", providerDataError));
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `BoloForms response missing string field: ${fieldName}`);
  }
  return parsed;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerDataError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://sapi.boloforms.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
