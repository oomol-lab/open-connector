import type { CredentialValidationResult, ExecutionContext } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const docugenerateValidationPath = "/template";

const docugenerateApiBaseUrlByRegion = {
  us: "https://api.docugenerate.com/v1",
  eu: "https://api.eu.docugenerate.com/v1",
  uk: "https://api.uk.docugenerate.com/v1",
  au: "https://api.au.docugenerate.com/v1",
};

type DocugenerateRegion = keyof typeof docugenerateApiBaseUrlByRegion;
type DocugenerateRequestPhase = "validate" | "execute";
type DocugenerateActionHandler = (
  input: Record<string, unknown>,
  context: DocugenerateActionContext,
) => Promise<unknown>;

export interface DocugenerateActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface DocugenerateRequestInput {
  baseUrl: string;
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  apiKey: string;
  fetcher: ProviderFetch;
  phase: DocugenerateRequestPhase;
  signal?: AbortSignal;
}

export const docugenerateActionHandlers: ProviderActionHandlers<"docugenerate", DocugenerateActionHandler> = {
  async list_templates(input, context): Promise<unknown> {
    const payload = await requestDocugenerate({
      ...context,
      path: "/template",
      query: {
        folder: readOptionalStringArray(input.folder),
      },
      phase: "execute",
    });

    return {
      templates: readPayloadArray(payload, "template list").map(normalizeTemplate),
    };
  },

  async get_template(input, context): Promise<unknown> {
    const templateId = readRequiredString(input.templateId, "templateId");
    const payload = await requestDocugenerate({
      ...context,
      path: `/template/${encodeURIComponent(templateId)}`,
      phase: "execute",
    });

    return {
      template: normalizeTemplate(payload),
    };
  },

  async generate_document(input, context): Promise<unknown> {
    const payload = await requestDocugenerate({
      ...context,
      path: "/document",
      method: "POST",
      body: compactObject({
        template_id: readRequiredString(input.templateId, "templateId"),
        data: input.data,
        name: optionalString(input.name),
        output_name: optionalString(input.outputName),
        output_format: optionalString(input.outputFormat),
        output_quality: optionalNumber(input.outputQuality),
        single_file: optionalBoolean(input.singleFile),
        page_break: optionalBoolean(input.pageBreak),
      }),
      phase: "execute",
    });

    return {
      document: normalizeDocument(payload),
    };
  },

  async list_documents(input, context): Promise<unknown> {
    const payload = await requestDocugenerate({
      ...context,
      path: "/document",
      query: {
        template_id: readRequiredString(input.templateId, "templateId"),
      },
      phase: "execute",
    });

    return {
      documents: readPayloadArray(payload, "document list").map(normalizeDocument),
    };
  },

  async get_document(input, context): Promise<unknown> {
    const documentId = readRequiredString(input.documentId, "documentId");
    const payload = await requestDocugenerate({
      ...context,
      path: `/document/${encodeURIComponent(documentId)}`,
      phase: "execute",
    });

    return {
      document: normalizeDocument(payload),
    };
  },

  async update_document(input, context): Promise<unknown> {
    const documentId = readRequiredString(input.documentId, "documentId");
    const payload = await requestDocugenerate({
      ...context,
      path: `/document/${encodeURIComponent(documentId)}`,
      method: "PUT",
      body: {
        name: readRequiredString(input.name, "name"),
      },
      phase: "execute",
    });

    return {
      document: normalizeDocument(payload),
    };
  },

  async delete_document(input, context): Promise<unknown> {
    const documentId = readRequiredString(input.documentId, "documentId");
    await requestDocugenerate({
      ...context,
      path: `/document/${encodeURIComponent(documentId)}`,
      method: "DELETE",
      phase: "execute",
    });

    return {
      deleted: true,
      documentId,
    };
  },
};

export async function validateDocugenerateCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const region = normalizeDocugenerateRegion(values.region);
  const apiBaseUrl = docugenerateApiBaseUrlByRegion[region];
  await requestDocugenerate({
    baseUrl: apiBaseUrl,
    path: docugenerateValidationPath,
    apiKey,
    fetcher,
    phase: "validate",
    signal,
  });

  return {
    profile: {
      accountId: `docugenerate:${region}`,
      displayName: "DocuGenerate API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl,
      region,
      validationEndpoint: docugenerateValidationPath,
    },
  };
}

export function resolveDocugenerateApiBaseUrl(region: string | undefined): string {
  return docugenerateApiBaseUrlByRegion[normalizeDocugenerateRegion(region)];
}

export async function resolveDocugenerateProxyBaseUrl(context: ExecutionContext, service: string): Promise<string> {
  const credential = await context.getCredential(service);
  if (!credential || credential.authType === "no_auth") {
    throw new ProviderRequestError(401, "Configure docugenerate credentials first.");
  }

  const value =
    "values" in credential
      ? (optionalString(credential.values.region) ?? optionalString(credential.metadata.region))
      : optionalString(credential.metadata.region);
  return resolveDocugenerateApiBaseUrl(value);
}

export function normalizeDocugenerateRegion(value: string | undefined): DocugenerateRegion {
  const region = value?.trim().toLowerCase() || "us";
  if (region === "us" || region === "eu" || region === "uk" || region === "au") {
    return region;
  }

  throw new ProviderRequestError(400, "region must be us, eu, uk, or au");
}

async function requestDocugenerate(input: DocugenerateRequestInput): Promise<unknown> {
  const url = new URL(`${input.baseUrl}${input.path}`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (Array.isArray(value)) {
      for (const child of value) {
        url.searchParams.append(name, child);
      }
    } else if (value !== undefined) {
      url.searchParams.set(name, value);
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: docugenerateHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    payload = await readDocugeneratePayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `docugenerate request failed: ${error.message}` : "docugenerate request failed",
    );
  }

  if (!response.ok) {
    throw createDocugenerateError(response, payload, input.phase);
  }

  return payload;
}

function docugenerateHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: apiKey,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readDocugeneratePayload(response: Response): Promise<unknown> {
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

function createDocugenerateError(
  response: Response,
  payload: unknown,
  phase: DocugenerateRequestPhase,
): ProviderRequestError {
  const message =
    extractDocugenerateErrorMessage(payload) ?? optionalString(response.statusText) ?? "docugenerate request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message);
  }
  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function extractDocugenerateErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const nestedError = optionalRecord(record.error);
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(nestedError?.message)
  );
}

function normalizeTemplate(payload: unknown): Record<string, unknown> {
  const record = readPayloadObject(payload, "template");
  return {
    id: optionalString(record.id),
    created: optionalNumber(record.created),
    updated: optionalNumber(record.updated),
    name: optionalString(record.name),
    pageCount: optionalNumber(record.page_count),
    delimiters: optionalRecord(record.delimiters),
    tags: optionalRecord(record.tags),
    filename: optionalString(record.filename),
    format: optionalString(record.format),
    region: optionalString(record.region),
    templateUrl: optionalString(record.template_uri),
    previewUrl: optionalString(record.preview_uri),
    imageUrl: optionalString(record.image_uri),
    enhancedSyntax: optionalBoolean(record.enhanced_syntax),
    versioningEnabled: optionalBoolean(record.versioning_enabled),
    folder: Array.isArray(record.folder) ? record.folder : undefined,
  };
}

function normalizeDocument(payload: unknown): Record<string, unknown> {
  const record = readPayloadObject(payload, "document");
  return {
    id: optionalString(record.id),
    templateId: optionalString(record.template_id),
    created: optionalNumber(record.created),
    name: optionalString(record.name),
    dataLength: optionalNumber(record.data_length),
    filename: optionalString(record.filename),
    format: optionalString(record.format),
    documentUrl: optionalString(record.document_uri),
  };
}

function readPayloadObject(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (record) {
    return record;
  }

  throw new ProviderRequestError(502, `docugenerate returned invalid ${label} JSON`);
}

function readPayloadArray(payload: unknown, label: string): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  throw new ProviderRequestError(502, `docugenerate returned invalid ${label} JSON`);
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value) && value.every((child) => typeof child === "string")) {
    return value;
  }

  throw new ProviderRequestError(400, "folder must be an array of strings");
}
