import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  nullableInteger,
  nullableString,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment, queryParams } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const documensoApiBaseUrl = "https://app.documenso.com/api/v2";

const documensoValidationPath = "/envelope";

type DocumensoRequestPhase = "validate" | "execute";
type DocumensoActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface DocumensoRequestContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const documensoActionHandlers: ProviderActionHandlers<"documenso", DocumensoActionHandler> = {
  list_envelopes(input, context) {
    return executeListEnvelopes(input, context);
  },
  get_envelope(input, context) {
    return executeGetEnvelope(input, context);
  },
  list_templates(input, context) {
    return executeListTemplates(input, context);
  },
  get_template(input, context) {
    return executeGetTemplate(input, context);
  },
};

export async function validateDocumensoCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestDocumensoJson(
    {
      path: documensoValidationPath,
      query: {
        page: "1",
        perPage: "1",
      },
    },
    { apiKey, fetcher, signal },
    "validate",
  );

  return {
    profile: {
      accountId: "documenso-api-token",
      displayName: "Documenso API Token",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: documensoApiBaseUrl,
      validationEndpoint: documensoValidationPath,
    },
  };
}

async function executeListEnvelopes(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestDocumensoJson(
    {
      path: "/envelope",
      query: buildEnvelopeListQuery(input),
    },
    context,
    "execute",
  );

  return normalizeEnvelopeListPayload(payload);
}

async function executeGetEnvelope(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const envelopeId = requiredString(input.envelopeId, "envelopeId", providerInputError);
  const payload = await requestDocumensoJson(
    {
      path: `/envelope/${encodePathSegment(envelopeId)}`,
    },
    context,
    "execute",
  );

  return {
    envelope: normalizeEnvelope(payload),
    raw: readDocumensoObject(payload, "Documenso envelope response must be an object"),
  };
}

async function executeListTemplates(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestDocumensoJson(
    {
      path: "/template",
      query: buildTemplateListQuery(input),
    },
    context,
    "execute",
  );

  return normalizeTemplateListPayload(payload);
}

async function executeGetTemplate(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const templateId = optionalInteger(input.templateId);
  if (templateId === undefined) {
    throw new ProviderRequestError(400, "templateId is required");
  }

  const payload = await requestDocumensoJson(
    {
      path: `/template/${templateId}`,
    },
    context,
    "execute",
  );

  return {
    template: normalizeTemplate(payload),
    raw: readDocumensoObject(payload, "Documenso template response must be an object"),
  };
}

function buildEnvelopeListQuery(input: Record<string, unknown>): Record<string, string> {
  return queryParams({
    query: optionalString(input.query),
    page: optionalInteger(input.page),
    perPage: optionalInteger(input.perPage),
    type: optionalString(input.type),
    templateId: optionalInteger(input.templateId),
    source: optionalString(input.source),
    status: optionalString(input.status),
    folderId: optionalString(input.folderId),
    orderByColumn: optionalString(input.orderByColumn),
    orderByDirection: optionalString(input.orderByDirection),
  });
}

function buildTemplateListQuery(input: Record<string, unknown>): Record<string, string> {
  return queryParams({
    query: optionalString(input.query),
    page: optionalInteger(input.page),
    perPage: optionalInteger(input.perPage),
    type: optionalString(input.type),
    folderId: optionalString(input.folderId),
  });
}

async function requestDocumensoJson(
  input: {
    path: string;
    query?: Record<string, string>;
    method?: string;
    body?: unknown;
  },
  context: DocumensoRequestContext,
  phase: DocumensoRequestPhase,
): Promise<unknown> {
  const url = new URL(input.path.replace(/^\/+/, ""), `${documensoApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: documensoHeaders(context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Documenso request failed: ${error.message}` : "Documenso request failed",
    );
  }

  const payload = await readDocumensoPayload(response);
  if (!response.ok) {
    throw createDocumensoError(response.status, payload, phase);
  }

  return payload;
}

function documensoHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: apiKey,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readDocumensoPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Documenso returned invalid JSON");
  }
}

function createDocumensoError(status: number, payload: unknown, phase: DocumensoRequestPhase): ProviderRequestError {
  const errorPayload = optionalRecord(payload);
  const message =
    optionalString(errorPayload?.message) ??
    optionalString(errorPayload?.error) ??
    `Documenso request failed with status ${status}`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function normalizeEnvelopeListPayload(payload: unknown): Record<string, unknown> {
  const object = readDocumensoObject(payload, "Documenso envelope list response must be an object");
  const data = Array.isArray(object.data) ? object.data : [];

  return {
    envelopes: data.map(normalizeEnvelope),
    pagination: normalizePagination(object),
    raw: object,
  };
}

function normalizeTemplateListPayload(payload: unknown): Record<string, unknown> {
  const object = readDocumensoObject(payload, "Documenso template list response must be an object");
  const data = Array.isArray(object.data) ? object.data : [];

  return {
    templates: data.map(normalizeTemplate),
    pagination: normalizePagination(object),
    raw: object,
  };
}

function normalizeEnvelope(payload: unknown): Record<string, unknown> {
  const object = readDocumensoObject(payload, "Documenso envelope response must be an object");

  return {
    id: readRequiredString(object, "id"),
    type: readRequiredString(object, "type"),
    status: readRequiredString(object, "status"),
    source: readRequiredString(object, "source"),
    title: readRequiredString(object, "title"),
    externalId: readNullableString(object, "externalId"),
    createdAt: readRequiredString(object, "createdAt"),
    updatedAt: readRequiredString(object, "updatedAt"),
    completedAt: readNullableString(object, "completedAt"),
    deletedAt: readNullableString(object, "deletedAt"),
    templateId: readNullableInteger(object, "templateId"),
    teamId: readRequiredInteger(object, "teamId"),
    userId: readRequiredInteger(object, "userId"),
    folderId: readNullableString(object, "folderId"),
    recipientCount: Array.isArray(object.recipients) ? object.recipients.length : 0,
  };
}

function normalizeTemplate(payload: unknown): Record<string, unknown> {
  const object = readDocumensoObject(payload, "Documenso template response must be an object");
  const directLink = optionalRecord(object.directLink);

  return {
    id: readRequiredInteger(object, "id"),
    envelopeId: readRequiredString(object, "envelopeId"),
    title: readRequiredString(object, "title"),
    type: readRequiredString(object, "type"),
    visibility: readRequiredString(object, "visibility"),
    externalId: readNullableString(object, "externalId"),
    createdAt: readRequiredString(object, "createdAt"),
    updatedAt: readRequiredString(object, "updatedAt"),
    folderId: readNullableString(object, "folderId"),
    teamId: readRequiredInteger(object, "teamId"),
    userId: readRequiredInteger(object, "userId"),
    recipientCount: Array.isArray(object.recipients) ? object.recipients.length : 0,
    fieldCount: Array.isArray(object.fields) ? object.fields.length : 0,
    directLinkEnabled: typeof directLink?.enabled === "boolean" ? directLink.enabled : null,
  };
}

function normalizePagination(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    count: readRequiredInteger(payload, "count"),
    currentPage: readRequiredInteger(payload, "currentPage"),
    perPage: readRequiredInteger(payload, "perPage"),
    totalPages: readRequiredInteger(payload, "totalPages"),
  };
}

function readDocumensoObject(value: unknown, message: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message, value);
  }
  return object;
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (value === undefined) {
    throw new ProviderRequestError(502, `Documenso response missing ${key}`);
  }
  return value;
}

function readNullableString(input: Record<string, unknown>, key: string): string | null {
  const value = nullableString(input[key]);
  if (value !== undefined) {
    return value;
  }
  throw new ProviderRequestError(502, `Documenso response missing ${key}`);
}

function readRequiredInteger(input: Record<string, unknown>, key: string): number {
  const value = optionalInteger(input[key]);
  if (value !== undefined) {
    return value;
  }
  throw new ProviderRequestError(502, `Documenso response missing ${key}`);
}

function readNullableInteger(input: Record<string, unknown>, key: string): number | null {
  const value = nullableInteger(input[key]);
  if (value !== undefined) {
    return value;
  }
  throw new ProviderRequestError(502, `Documenso response missing ${key}`);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
