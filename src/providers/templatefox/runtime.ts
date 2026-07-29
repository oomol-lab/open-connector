import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const templatefoxApiBaseUrl = "https://api.templatefox.com";

type TemplatefoxRequestPhase = "validate" | "execute";

export const templatefoxActionHandlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  create_pdf(input, context) {
    return createPdf(input, context);
  },
  create_image(input, context) {
    return createImage(input, context);
  },
  merge_pdfs(input, context) {
    return mergePdfs(input, context);
  },
  extract_pdf_pages(input, context) {
    return extractPdfPages(input, context);
  },
  rotate_pdf(input, context) {
    return rotatePdf(input, context);
  },
  list_templates(input, context) {
    return listTemplates(input, context);
  },
  get_template_fields(input, context) {
    return getTemplateFields(input, context);
  },
  get_account(_input, context) {
    return getAccount(context);
  },
};

export async function validateTemplatefoxCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const account = normalizeAccount(
    await requestTemplatefoxJson({
      apiKey,
      path: "/v1/account",
      fetcher,
      signal,
      phase: "validate",
    }),
  );
  const accountLabel = account.email ?? "TemplateFox API Key";

  return {
    profile: {
      accountId: account.email ?? "templatefox:api-key",
      displayName: accountLabel,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: templatefoxApiBaseUrl,
      validationEndpoint: "/v1/account",
      email: account.email,
      credits: account.credits,
    }),
  };
}

async function createPdf(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestTemplatefoxJson({
    apiKey: context.apiKey,
    path: "/v1/pdf/create",
    method: "POST",
    body: compactObject({
      template_id: optionalRawString(input.templateId),
      data: optionalRecord(input.data),
      export_type: "url",
      expiration: optionalInteger(input.expiration),
      filename: optionalString(input.filename),
      pdf_variant: optionalRawString(input.pdfVariant),
      version: optionalString(input.version),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return normalizeUrlResult(payload);
}

async function createImage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestTemplatefoxJson({
    apiKey: context.apiKey,
    path: "/v1/image/create",
    method: "POST",
    body: compactObject({
      template_id: optionalRawString(input.templateId),
      modifications: readOptionalModifications(input.modifications),
      data: optionalRecord(input.data),
      format: optionalRawString(input.format),
      width: optionalInteger(input.width),
      quality: optionalInteger(input.quality),
      export_type: "url",
      expiration: optionalInteger(input.expiration),
      filename: optionalString(input.filename),
      version: optionalString(input.version),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return normalizeImageResult(payload);
}

async function mergePdfs(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestTemplatefoxJson({
    apiKey: context.apiKey,
    path: "/v1/pdf-tools/merge",
    method: "POST",
    body: compactObject({
      pdfs: readPdfUrls(input.pdfUrls).map((pdfUrl) => ({ pdf_url: pdfUrl })),
      ...buildPdfToolOptions(input),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return normalizeUrlResult(payload);
}

async function extractPdfPages(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestTemplatefoxJson({
    apiKey: context.apiKey,
    path: "/v1/pdf-tools/extract-pages",
    method: "POST",
    body: compactObject({
      pdf_url: optionalRawString(input.pdfUrl),
      pages: optionalRawString(input.pages),
      ...buildPdfToolOptions(input),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return normalizeUrlResult(payload);
}

async function rotatePdf(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  assertRotationInput(input);
  const payload = await requestTemplatefoxJson({
    apiKey: context.apiKey,
    path: "/v1/pdf-tools/rotate",
    method: "POST",
    body: compactObject({
      pdf_url: optionalRawString(input.pdfUrl),
      rotation: optionalInteger(input.rotation),
      page_rotations: optionalRecord(input.pageRotations),
      ...buildPdfToolOptions(input),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return normalizeUrlResult(payload);
}

async function listTemplates(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestTemplatefoxJson({
    apiKey: context.apiKey,
    path: "/v1/templates",
    query: compactObject({
      kind: optionalRawString(input.kind),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = readResponseObject(payload, "templates response");
  return {
    templates: readArray(record.templates, "templates").map((template) =>
      normalizeTemplate(readResponseObject(template, "template")),
    ),
  };
}

async function getTemplateFields(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const templateId = readRequiredInputString(input.templateId, "templateId");
  const payload = await requestTemplatefoxJson({
    apiKey: context.apiKey,
    path: `/v1/templates/${encodeURIComponent(templateId)}/fields`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return {
    fields: readArray(payload, "fields").map((field) => normalizeTemplateField(readResponseObject(field, "field"))),
  };
}

async function getAccount(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestTemplatefoxJson({
    apiKey: context.apiKey,
    path: "/v1/account",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    account: normalizeAccount(payload),
  };
}

async function requestTemplatefoxJson(input: {
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  phase: TemplatefoxRequestPhase;
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
  signal?: AbortSignal;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(buildTemplatefoxUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildTemplatefoxHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    payload = await readTemplatefoxPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `templatefox request failed: ${error.message}` : "templatefox request failed",
    );
  }

  if (!response.ok) {
    throw createTemplatefoxError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }
  return payload;
}

function buildTemplatefoxUrl(path: string, query: Record<string, string | number | boolean | undefined> = {}): URL {
  const url = new URL(path, templatefoxApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildTemplatefoxHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readTemplatefoxPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createTemplatefoxError(
  response: Response,
  payload: unknown,
  phase: TemplatefoxRequestPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message =
    readTemplatefoxErrorMessage(payload) ?? response.statusText ?? `templatefox request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (
    phase === "execute" &&
    (response.status === 400 ||
      response.status === 402 ||
      response.status === 422 ||
      (notFoundAsInvalidInput && response.status === 404))
  ) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, {
    status: response.status,
    payload,
  });
}

function readTemplatefoxErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const detail = record.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    const first = optionalRecord(detail[0]);
    return optionalRawString(first?.msg) ?? optionalRawString(first?.message);
  }
  const error = optionalRecord(record.error);
  return (
    optionalRawString(record.message) ??
    optionalRawString(record.error) ??
    optionalRawString(record.title) ??
    optionalRawString(error?.message)
  );
}

function normalizeUrlResult(payload: unknown): Record<string, unknown> {
  const record = readResponseObject(payload, "url result");
  return {
    url: readRequiredResponseString(record.url, "url"),
    filename: readRequiredResponseString(record.filename, "filename"),
    creditsRemaining: readRequiredResponseInteger(record.credits_remaining, "credits_remaining"),
    expiresIn: readRequiredResponseInteger(record.expires_in, "expires_in"),
  };
}

function normalizeImageResult(payload: unknown): Record<string, unknown> {
  const normalized = normalizeUrlResult(payload);
  const record = readResponseObject(payload, "image result");
  return {
    ...normalized,
    warnings: readNullableStringArray(record.warnings, "warnings"),
  };
}

function normalizeAccount(payload: unknown): {
  credits: number;
  email: string | null;
} {
  const record = readResponseObject(payload, "account");
  return {
    credits: readRequiredResponseInteger(record.credits, "credits"),
    email: readNullableRawString(record.email),
  };
}

function normalizeTemplate(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...record,
    id: readRequiredResponseString(record.id, "template.id"),
    name: readRequiredResponseString(record.name, "template.name"),
    kind: readNullableRawString(record.kind),
    createdAt: readNullableRawString(record.created_at ?? record.createdAt),
    updatedAt: readNullableRawString(record.updated_at ?? record.updatedAt),
  };
}

function normalizeTemplateField(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...record,
    key: readRequiredResponseString(record.key, "field.key"),
    label: readRequiredResponseString(record.label, "field.label"),
    type: optionalRawString(record.type) ?? "string",
    required: optionalBoolean(record.required) ?? false,
    helpText: readNullableRawString(record.helpText),
    spec: readNullableFieldSpec(record.spec),
  };
}

function readNullableFieldSpec(value: unknown): Array<Record<string, unknown>> | null {
  if (value == null) {
    return null;
  }
  return readArray(value, "spec").map((item) => {
    const record = readResponseObject(item, "spec");
    return {
      ...record,
      name: readRequiredResponseString(record.name, "spec.name"),
      label: readRequiredResponseString(record.label, "spec.label"),
      type: readRequiredResponseString(record.type, "spec.type"),
    };
  });
}

function readOptionalModifications(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readArray(value, "modifications").map((item) => {
    const record = readInputObject(item, "modification");
    return compactObject({
      name: readRequiredInputString(record.name, "modification.name"),
      text: optionalRawString(record.text),
      image_url: optionalRawString(record.imageUrl),
      color: optionalRawString(record.color),
      background: optionalRawString(record.background),
      hidden: optionalBoolean(record.hidden),
    });
  });
}

function readPdfUrls(value: unknown): string[] {
  return readArray(value, "pdfUrls").map((item, index) => readRequiredInputString(item, `pdfUrls[${index}]`));
}

function buildPdfToolOptions(input: Record<string, unknown>): Record<string, unknown> {
  return {
    export_type: "url",
    expiration: optionalInteger(input.expiration),
    filename: optionalString(input.filename),
  };
}

function assertRotationInput(input: Record<string, unknown>): void {
  const rotation = input.rotation;
  const pageRotations = input.pageRotations;
  if (!isRotation(rotation)) {
    throw new ProviderRequestError(400, "rotation must be one of 0, 90, 180, or 270");
  }
  if (pageRotations !== undefined) {
    const rotations = readInputObject(pageRotations, "pageRotations");
    for (const [page, pageRotation] of Object.entries(rotations)) {
      if (!isPositiveIntegerString(page) || !isRotation(pageRotation)) {
        throw new ProviderRequestError(400, "pageRotations must map positive page numbers to 0, 90, 180, or 270");
      }
    }
  }
  if (rotation === undefined && pageRotations === undefined) {
    throw new ProviderRequestError(400, "Either rotation or pageRotations is required.");
  }
  if (rotation !== undefined && pageRotations !== undefined) {
    throw new ProviderRequestError(400, "Use either rotation or pageRotations, not both.");
  }
}

function isRotation(value: unknown): boolean {
  return value === undefined || value === 0 || value === 90 || value === 180 || value === 270;
}

function isPositiveIntegerString(value: string): boolean {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && String(parsed) === value;
}

function readArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `malformed templatefox response: ${fieldName}`);
  }
  return value;
}

function readResponseObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `malformed templatefox response: ${fieldName}`);
  }
  return record;
}

function readInputObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return record;
}

function readRequiredResponseString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(502, `malformed templatefox response: missing ${fieldName}`);
  }
  return value;
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readRequiredResponseInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `malformed templatefox response: missing ${fieldName}`);
  }
  return parsed;
}

function readNullableRawString(value: unknown): string | null {
  return optionalRawString(value) ?? null;
}

function readNullableStringArray(value: unknown, fieldName: string): string[] | null {
  if (value == null) {
    return null;
  }
  return readArray(value, fieldName).map((item, index) => readRequiredResponseString(item, `${fieldName}[${index}]`));
}
