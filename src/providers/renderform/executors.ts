import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "renderform";
const renderformDocsBaseUrl = "https://renderform.io";
const renderformApiBaseUrl = "https://get.renderform.io";
const renderformOpenApiBaseUrl = "https://api.renderform.io";
const usagePath = "/api/v1/usage";
const listTemplatesPath = "/api/v2/my-templates";
const getTemplatePath = "/api/v2/my-templates";
const renderPath = "/api/v2/render";
const listResultsPath = "/api/v2/results";
const screenshotPath = "/api/v1/screenshots";

type RenderformPhase = "validate" | "execute";
type RenderformActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const renderformActionHandlers: ProviderActionHandlers<"renderform", RenderformActionHandler> = {
  get_usage(_input, context) {
    return executeGetUsage(context);
  },
  list_templates(input, context) {
    return executeListTemplates(input, context);
  },
  get_template(input, context) {
    return executeGetTemplate(input, context);
  },
  render_image(input, context) {
    return executeRenderImage(input, context);
  },
  list_results(input, context) {
    return executeListResults(input, context);
  },
  take_screenshot(input, context) {
    return executeTakeScreenshot(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, renderformActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateRenderformCredential(input.apiKey, fetcher, signal);
  },
};

async function validateRenderformCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestRenderformJson({
    url: new URL(usagePath, renderformApiBaseUrl),
    init: {
      method: "GET",
      headers: buildHeaders(apiKey),
      signal,
    },
    fetcher,
    phase: "validate",
  });

  return {
    profile: {
      accountId: "renderform-api-key",
      displayName: "RenderForm API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: renderformApiBaseUrl,
      validationEndpoint: usagePath,
      docsUrl: `${renderformDocsBaseUrl}/docs/api/credits-usage`,
      usage: normalizeUsage(payload),
    }),
  };
}

async function executeGetUsage(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestRenderformJson({
    url: new URL(usagePath, renderformApiBaseUrl),
    init: {
      method: "GET",
      headers: buildHeaders(context.apiKey),
      signal: context.signal,
    },
    fetcher: context.fetcher,
    phase: "execute",
  });

  return {
    usage: normalizeUsage(payload),
  };
}

async function executeListTemplates(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const url = new URL(listTemplatesPath, renderformApiBaseUrl);
  setOptionalSearchParam(url, "name", optionalString(input.name));
  setOptionalSearchParam(url, "page", stringifyOptionalInteger(optionalInteger(input.page)));
  setOptionalSearchParam(url, "size", stringifyOptionalInteger(optionalInteger(input.size)));
  setOptionalSearchParam(url, "sourceTemplateId", optionalString(input.sourceTemplateId));

  const tags = Array.isArray(input.tags)
    ? input.tags.map((value) => optionalString(value)).filter((value): value is string => value !== undefined)
    : [];
  if (tags.length > 0) {
    url.searchParams.set("tags", tags.join(","));
  }

  return normalizeTemplatePage(
    await requestRenderformJson({
      url,
      init: {
        method: "GET",
        headers: buildHeaders(context.apiKey),
        signal: context.signal,
      },
      fetcher: context.fetcher,
      phase: "execute",
    }),
  );
}

async function executeGetTemplate(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const templateId = requiredString(input.templateId, "templateId", inputError);
  const payload = await requestRenderformJson({
    url: new URL(`${getTemplatePath}/${encodeURIComponent(templateId)}`, renderformApiBaseUrl),
    init: {
      method: "GET",
      headers: buildHeaders(context.apiKey),
      signal: context.signal,
    },
    fetcher: context.fetcher,
    phase: "execute",
  });

  return {
    template: normalizeTemplate(payload),
  };
}

async function executeRenderImage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestRenderformJson({
    url: new URL(renderPath, renderformApiBaseUrl),
    init: {
      method: "POST",
      headers: buildHeaders(context.apiKey),
      body: JSON.stringify(
        compactObject({
          template: requiredString(input.template, "template", inputError),
          data: optionalRecord(input.data),
          fileName: optionalString(input.fileName),
          webhookUrl: optionalString(input.webhookUrl),
          metadata: optionalRecord(input.metadata),
          version: optionalString(input.version),
          width: optionalInteger(input.width),
          height: optionalInteger(input.height),
          waitTime: optionalInteger(input.waitTime),
        }),
      ),
      signal: context.signal,
    },
    fetcher: context.fetcher,
    phase: "execute",
  });

  return normalizeRequestResult(payload);
}

async function executeListResults(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const url = new URL(listResultsPath, renderformApiBaseUrl);
  setOptionalSearchParam(url, "page", stringifyOptionalInteger(optionalInteger(input.page)));
  setOptionalSearchParam(url, "size", stringifyOptionalInteger(optionalInteger(input.size)));
  setOptionalSearchParam(url, "batch", optionalString(input.batch));
  setOptionalSearchParam(url, "template", optionalString(input.template));

  return normalizeResultPage(
    await requestRenderformJson({
      url,
      init: {
        method: "GET",
        headers: buildHeaders(context.apiKey),
        signal: context.signal,
      },
      fetcher: context.fetcher,
      phase: "execute",
    }),
  );
}

async function executeTakeScreenshot(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestRenderformJson({
    url: new URL(screenshotPath, renderformOpenApiBaseUrl),
    init: {
      method: "POST",
      headers: buildHeaders(context.apiKey),
      body: JSON.stringify(
        compactObject({
          url: requiredString(input.url, "url", inputError),
          width: readRequiredInteger(input.width, "width"),
          height: readRequiredInteger(input.height, "height"),
          waitTime: optionalInteger(input.waitTime),
        }),
      ),
      signal: context.signal,
    },
    fetcher: context.fetcher,
    phase: "execute",
  });

  return normalizeRequestResult(payload);
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

async function requestRenderformJson(input: {
  url: URL;
  init: RequestInit;
  fetcher: typeof fetch;
  phase: RenderformPhase;
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.fetcher(input.url, input.init);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `RenderForm request failed: ${error.message}` : "RenderForm request failed",
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw createRenderformError(response, payload, input.phase);
  }

  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
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

function createRenderformError(response: Response, payload: unknown, phase: RenderformPhase): ProviderRequestError {
  const message = readPayloadMessage(payload) ?? (response.statusText || "RenderForm request failed");

  if (response.status === 429 || response.status === 402) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 401 : response.status, message, payload);
  }
  if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readPayloadMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const msg = optionalString(record.msg);
  if (msg) {
    return msg;
  }

  const error = optionalString(record.error);
  if (error) {
    return error;
  }

  const errors = Array.isArray(record.errors) ? record.errors : [];
  for (const item of errors) {
    if (typeof item === "string" && item.trim()) {
      return item;
    }
  }

  return undefined;
}

function normalizeUsage(payload: unknown): Record<string, unknown> {
  const record = expectRecord(payload, "usage");
  return {
    identifier: readNullableString(record.identifier),
    credits: normalizeUsageCredits(record.credits),
    uploads: normalizeUploads(record.uploads),
    plan: normalizePlan(record.plan),
    raw: record,
  };
}

function normalizeTemplatePage(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload)) {
    const templates = payload.map((item) => normalizeTemplate(item));
    return {
      templates,
      page: 0,
      size: templates.length,
      totalPages: null,
      totalElements: null,
      numberOfElements: templates.length,
      first: true,
      last: true,
      empty: templates.length === 0,
      pageable: null,
      sort: null,
    };
  }

  const record = expectRecord(payload, "template list");
  const items = Array.isArray(record.items) ? record.items.map((item) => normalizeTemplate(item)) : [];

  return {
    templates: items,
    page: readIntegerWithDefault(record.number, 0),
    size: readIntegerWithDefault(record.size, items.length),
    totalPages: readNullableInteger(record.totalPages),
    totalElements: readNullableInteger(record.totalElements),
    numberOfElements: readNullableInteger(record.numberOfElements) ?? items.length,
    first: readBooleanWithDefault(record.first, true),
    last: readBooleanWithDefault(record.last, true),
    empty: readBooleanWithDefault(record.empty, items.length === 0),
    pageable: readNullablePageable(record.pageable),
    sort: readNullableSortable(record.sort),
  };
}

function normalizeTemplate(payload: unknown): Record<string, unknown> {
  const record = expectRecord(payload, "template");
  return {
    identifier: readRequiredString(record.identifier, "identifier"),
    name: readRequiredString(record.name, "name"),
    preview: readNullableString(record.preview),
    width: readNullableInteger(record.width),
    height: readNullableInteger(record.height),
    outputFormat: readNullableString(record.outputFormat),
    outputExtension: readNullableString(record.outputExtension),
    createdAt: readNullableString(record.createdAt),
    tags: Array.isArray(record.tags) ? record.tags.filter((value): value is string => typeof value === "string") : [],
    raw: record,
  };
}

function normalizeResultPage(payload: unknown): Record<string, unknown> {
  const record = expectRecord(payload, "results");
  const content = Array.isArray(record.content) ? record.content.map((item) => normalizeResult(item)) : [];

  return {
    results: content,
    page: readIntegerWithDefault(record.number, 0),
    size: readIntegerWithDefault(record.size, content.length),
    totalPages: readNullableInteger(record.totalPages),
    totalElements: readNullableInteger(record.totalElements),
    numberOfElements: readNullableInteger(record.numberOfElements),
    first: readBooleanWithDefault(record.first, true),
    last: readBooleanWithDefault(record.last, true),
    empty: readBooleanWithDefault(record.empty, content.length === 0),
    pageable: readNullablePageable(record.pageable),
    sort: readNullableSortable(record.sort),
  };
}

function normalizeResult(payload: unknown): Record<string, unknown> {
  const record = expectRecord(payload, "result");
  return {
    identifier: readRequiredString(record.identifier, "identifier"),
    href: readRequiredString(record.href, "href"),
    width: readNullableInteger(record.width),
    height: readNullableInteger(record.height),
    fileName: readNullableString(record.fileName),
    createdAt: readNullableString(record.createdAt),
    deletedAt: readNullableString(record.deletedAt),
    templateName: readNullableString(record.templateName),
    templateIdentifier: readNullableString(record.templateIdentifier),
    raw: record,
  };
}

function normalizeRequestResult(payload: unknown): Record<string, unknown> {
  const record = expectRecord(payload, "render result");
  return {
    requestId: readRequiredString(record.requestId, "requestId"),
    href: readRequiredString(record.href, "href"),
    request: optionalRecord(record.request) ?? {},
  };
}

function normalizeUsageCredits(value: unknown): Record<string, unknown> {
  const record = expectRecord(value, "credits");
  return {
    used: readRequiredIntegerFromResponse(record.used, "credits.used"),
    total: readRequiredIntegerFromResponse(record.total, "credits.total"),
    nextRenewalAt: readNullableString(record.nextRenewalAt),
    renewalAmount: readNullableInteger(record.renewalAmount),
  };
}

function normalizeUploads(value: unknown): Record<string, unknown> {
  const record = expectRecord(value, "uploads");
  return {
    used: readRequiredIntegerFromResponse(record.used, "uploads.used"),
    total: readRequiredIntegerFromResponse(record.total, "uploads.total"),
  };
}

function normalizePlan(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }

  return {
    name: readNullableString(record.name),
    status: readNullableString(record.status),
    nextBillingAt: readNullableString(record.nextBillingAt),
  };
}

function readNullablePageable(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }

  return {
    sort: readRequiredSortable(record.sort),
    offset: readIntegerWithDefault(record.offset, 0),
    pageNumber: readIntegerWithDefault(record.pageNumber, 0),
    pageSize: readIntegerWithDefault(record.pageSize, 0),
    unpaged: readBooleanWithDefault(record.unpaged, false),
    paged: readBooleanWithDefault(record.paged, true),
  };
}

function readNullableSortable(value: unknown): Record<string, boolean> | null {
  const record = optionalRecord(value);
  return record ? readRequiredSortable(record) : null;
}

function readRequiredSortable(value: unknown): Record<string, boolean> {
  const record = expectRecord(value, "sort");
  return {
    empty: readBooleanWithDefault(record.empty, false),
    sorted: readBooleanWithDefault(record.sorted, false),
    unsorted: readBooleanWithDefault(record.unsorted, true),
  };
}

function setOptionalSearchParam(url: URL, key: string, value: string | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(key, value);
  }
}

function stringifyOptionalInteger(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `RenderForm ${label} response was not an object`, value);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  throw new ProviderRequestError(502, `RenderForm response did not include ${fieldName}`);
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const number = optionalInteger(value);
  if (number === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return number;
}

function readRequiredIntegerFromResponse(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new ProviderRequestError(502, `RenderForm response did not include numeric ${fieldName}`);
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" ? value : null;
}

function readNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return optionalInteger(value) ?? null;
}

function readIntegerWithDefault(value: unknown, defaultValue: number): number {
  const parsed = optionalInteger(value);
  return parsed === undefined ? defaultValue : parsed;
}

function readBooleanWithDefault(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://get.renderform.io",
  auth: { type: "api_key_header", name: "x-api-key" },
});
