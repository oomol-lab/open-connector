import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalBooleanOrNull,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { compactJson } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const docmosisEnvironmentSummaryPath = "/environment/summary";
export const docmosisEnvironmentReadyPath = "/environment/ready";
export const docmosisListTemplatesPath = "/listTemplates";
export const docmosisGetTemplateDetailsPath = "/getTemplateDetails";
export const docmosisGetTemplateStructurePath = "/getTemplateStructure";
export const docmosisRenderPath = "/render";
export const docmosisApiBaseUrlPattern: RegExp = /(^|\.)dws4\.docmosis\.com$/i;

type DocmosisRequestPhase = "validate" | "execute";

export interface DocmosisActionContext extends ApiKeyProviderContext {
  apiBaseUrl: string;
}

interface DocmosisEnvironmentSummary {
  environmentName: string | null;
  ready: boolean | null;
  planName: string | null;
  isActivated: boolean | null;
  isDeleted: boolean | null;
  isDisabled: boolean | null;
  lastUpdatedByUser: string | null;
  lastUpdatedTime: number | null;
  pageQuota: {
    quota: number | null;
    used: number | null;
    pctUsed: number | null;
    pctUsedStr: string | null;
    isHardLimited: boolean | null;
  };
  raw: Record<string, unknown>;
}

type DocmosisActionHandler = (input: Record<string, unknown>, context: DocmosisActionContext) => Promise<unknown>;

export const docmosisActionHandlers: ProviderActionHandlers<"docmosis", DocmosisActionHandler> = {
  get_environment_summary(_input, context) {
    return getEnvironmentSummary(context);
  },
  check_environment_ready(_input, context) {
    return checkEnvironmentReady(context);
  },
  list_templates(input, context) {
    return listTemplates(input, context);
  },
  get_template_details(input, context) {
    return getTemplateDetails(input, context);
  },
  get_template_structure(input, context) {
    return getTemplateStructure(input, context);
  },
  render_document(input, context) {
    return renderDocument(input, context);
  },
};

export async function validateDocmosisCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiBaseUrl = resolveDocmosisApiBaseUrl(input.values.apiBaseUrl);
  const payload = await requestDocmosisJson({
    apiBaseUrl,
    path: docmosisEnvironmentSummaryPath,
    body: { accessKey: input.apiKey },
    fetcher,
    signal,
    phase: "validate",
  });
  const summary = normalizeEnvironmentSummary(payload);

  return {
    profile: {
      accountId: summary.environmentName ?? "docmosis-environment",
      displayName: summary.environmentName ?? "Docmosis Environment",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl,
      validationEndpoint: docmosisEnvironmentSummaryPath,
      environmentName: summary.environmentName,
      planName: summary.planName,
      ready: summary.ready,
      pageQuotaUsed: summary.pageQuota?.used ?? undefined,
      pageQuota: summary.pageQuota?.quota ?? undefined,
      pageQuotaPctUsed: summary.pageQuota?.pctUsed ?? undefined,
      pageQuotaPctUsedStr: summary.pageQuota?.pctUsedStr ?? undefined,
      pageQuotaHardLimited: summary.pageQuota?.isHardLimited ?? undefined,
      isActivated: summary.isActivated,
      isDeleted: summary.isDeleted,
      isDisabled: summary.isDisabled,
    }),
  };
}

async function getEnvironmentSummary(context: DocmosisActionContext): Promise<unknown> {
  const payload = await requestDocmosisJson({
    apiBaseUrl: context.apiBaseUrl,
    path: docmosisEnvironmentSummaryPath,
    body: { accessKey: context.apiKey },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    succeeded: readSucceeded(payload) ?? true,
    shortMsg: readOptionalMessage(payload, "shortMsg"),
    longMsg: readOptionalMessage(payload, "longMsg"),
    summary: normalizeEnvironmentSummary(payload),
  };
}

async function checkEnvironmentReady(context: DocmosisActionContext): Promise<unknown> {
  const response = await requestDocmosisJsonWithStatus({
    apiBaseUrl: context.apiBaseUrl,
    path: docmosisEnvironmentReadyPath,
    body: { accessKey: context.apiKey },
    fetcher: context.fetcher,
    signal: context.signal,
    expectedStatuses: [200, 400],
  });

  if (response.status === 400 && looksLikeDocmosisAuthError(response.payload)) {
    throw createDocmosisError(400, response.payload, "execute");
  }

  return {
    ready: response.status === 200,
    succeeded: response.status === 200 && readSucceeded(response.payload) !== false,
    shortMsg: readOptionalMessage(response.payload, "shortMsg"),
    longMsg: readOptionalMessage(response.payload, "longMsg"),
  };
}

async function listTemplates(input: Record<string, unknown>, context: DocmosisActionContext): Promise<unknown> {
  const payload = await requestDocmosisJson({
    apiBaseUrl: context.apiBaseUrl,
    path: docmosisListTemplatesPath,
    body: compactObject({
      accessKey: context.apiKey,
      includeDetail: optionalBoolean(input.includeDetail),
      folder: readOptionalTrimmedString(input.folder),
      includeSubFolders: optionalBoolean(input.includeSubFolders),
      paging: optionalBoolean(input.paging),
      pageToken: readOptionalTrimmedString(input.pageToken),
      pageSize: readOptionalInteger(input.pageSize, "pageSize"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  const items = Array.isArray(payload.templateList) ? payload.templateList : [];
  return {
    templateListStale: optionalBooleanOrNull(payload.templateListStale),
    nextPageToken: readNullableString(payload.nextPageToken),
    pageSize: readNullableInteger(payload.pageSize),
    templates: items.map((item) => normalizeTemplateDetails(item)),
  };
}

async function getTemplateDetails(input: Record<string, unknown>, context: DocmosisActionContext): Promise<unknown> {
  const payload = await requestDocmosisJson({
    apiBaseUrl: context.apiBaseUrl,
    path: docmosisGetTemplateDetailsPath,
    body: {
      accessKey: context.apiKey,
      templateName: requireInputString(input.templateName, "templateName"),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    succeeded: readSucceeded(payload) ?? true,
    shortMsg: readOptionalMessage(payload, "shortMsg"),
    longMsg: readOptionalMessage(payload, "longMsg"),
    template: normalizeTemplateDetails(payload.templateDetails),
  };
}

async function getTemplateStructure(input: Record<string, unknown>, context: DocmosisActionContext): Promise<unknown> {
  const payload = await requestDocmosisJson({
    apiBaseUrl: context.apiBaseUrl,
    path: docmosisGetTemplateStructurePath,
    body: {
      accessKey: context.apiKey,
      templateName: requireInputString(input.templateName, "templateName"),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    templateHasErrors: optionalBooleanOrNull(payload.templateHasErrors),
    templateErrorMessage: readNullableString(payload.templateErrorMessage),
    templateStructure: Array.isArray(payload.templateStructure) ? payload.templateStructure : [],
  };
}

async function renderDocument(input: Record<string, unknown>, context: DocmosisActionContext): Promise<unknown> {
  const response = await docmosisFetch({
    apiBaseUrl: context.apiBaseUrl,
    path: docmosisRenderPath,
    body: buildRenderRequestBody(input, context.apiKey),
    fetcher: context.fetcher,
    signal: context.signal,
  });
  const responseHeaders = normalizeDocmosisHeaders(response.headers);
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status >= 400 ? response.status : 502,
        `Docmosis render returned unexpected content type ${contentType || "unknown"}`,
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      succeeded: true,
      shortMsg: null,
      longMsg: null,
      requestId: responseHeaders.requestId,
      resultFileBase64: bytes.toString("base64"),
      queue: {
        rejected: responseHeaders.queueRejected,
        availablePct: responseHeaders.queueAvailablePct,
        delaySeconds: responseHeaders.queueDelaySeconds,
      },
      headers: responseHeaders,
      webHookResults: [],
    };
  }

  const payload = await readDocmosisPayload(response);
  if (!response.ok) {
    throw createDocmosisError(response.status, payload, "execute");
  }

  const webHooks = optionalRecord(payload.webHooks);
  const webHookResults = Array.isArray(webHooks?.webHookResults) ? webHooks.webHookResults : [];
  const queueRecord = optionalRecord(payload.queue);

  return {
    succeeded: readSucceeded(payload) !== false,
    shortMsg: readOptionalMessage(payload, "shortMsg"),
    longMsg: readOptionalMessage(payload, "longMsg"),
    requestId: readNullableString(payload.requestId) ?? responseHeaders.requestId,
    resultFileBase64: readNullableString(payload.resultFile),
    queue: {
      rejected: optionalBooleanOrNull(queueRecord?.rejected),
      availablePct: readNullableInteger(queueRecord?.availablePct),
      delaySeconds: readNullableInteger(queueRecord?.delaySeconds),
    },
    headers: responseHeaders,
    webHookResults,
  };
}

function buildRenderRequestBody(input: Record<string, unknown>, apiKey: string): Record<string, unknown> {
  const storeTo = readOptionalTrimmedString(input.storeTo);
  const returnResultFileBase64 = optionalBoolean(input.returnResultFileBase64) ?? false;
  const finalStoreTo = returnResultFileBase64 ? ensureStoreToIncludesStream(storeTo) : storeTo;

  if (!returnResultFileBase64 && (!finalStoreTo || storeToIncludesStream(finalStoreTo))) {
    throw new ProviderRequestError(
      400,
      "render_document requires storeTo without stream or returnResultFileBase64=true for JSON-safe output",
    );
  }

  return compactJson({
    accessKey: apiKey,
    templateName: requireInputString(input.templateName, "templateName"),
    outputName: requireInputString(input.outputName, "outputName"),
    data: input.data,
    outputFormat: readOptionalTrimmedString(input.outputFormat),
    storeTo: finalStoreTo,
    tags: readOptionalTrimmedString(input.tags),
    requestId: readOptionalTrimmedString(input.requestId),
    sourceId: readOptionalTrimmedString(input.sourceId),
    mailSubject: readOptionalTrimmedString(input.mailSubject),
    mailBodyHtml: readOptionalTrimmedString(input.mailBodyHtml),
    mailBodyText: readOptionalTrimmedString(input.mailBodyText),
    devMode: optionalBoolean(input.devMode),
    streamResultInResponse: returnResultFileBase64 ? true : undefined,
  }) as Record<string, unknown>;
}

function normalizeEnvironmentSummary(payload: Record<string, unknown>): DocmosisEnvironmentSummary {
  const summaryRoot = optionalRecord(payload.accountEnvironmentSummary);
  const accountEnvDetails = optionalRecord(summaryRoot?.accountEnvDetails);
  const auditInfo = optionalRecord(accountEnvDetails?.auditInfo);
  const plan = optionalRecord(summaryRoot?.plan);
  const pageQuota = optionalRecord(summaryRoot?.pageQuota);

  return {
    environmentName: readNullableString(accountEnvDetails?.name),
    ready: optionalBooleanOrNull(summaryRoot?.ready),
    planName: readNullableString(plan?.name),
    isActivated: optionalBooleanOrNull(accountEnvDetails?.isActivated),
    isDeleted: optionalBooleanOrNull(accountEnvDetails?.isDeleted),
    isDisabled: optionalBooleanOrNull(accountEnvDetails?.isDisabled),
    lastUpdatedByUser: readNullableString(auditInfo?.lastUpdatedByUser),
    lastUpdatedTime: readNullableInteger(auditInfo?.lastUpdatedTime),
    pageQuota: {
      quota: readNullableInteger(pageQuota?.quota),
      used: readNullableInteger(pageQuota?.used),
      pctUsed: readNullableNumber(pageQuota?.pctUsed),
      pctUsedStr: readNullableString(pageQuota?.pctUsedStr),
      isHardLimited: optionalBooleanOrNull(pageQuota?.isHardLimited),
    },
    raw: summaryRoot ?? {},
  };
}

function normalizeTemplateDetails(value: unknown): Record<string, unknown> {
  const record = requiredObject(value, "Docmosis template details");
  return {
    name: requireTemplateName(record.name),
    lastModifiedMillisSinceEpoch: readNullableInteger(record.lastModifiedMillisSinceEpoch),
    lastModifiedISO8601: readNullableString(record.lastModifiedISO8601),
    sizeBytes: readNullableInteger(record.sizeBytes),
    md5: readNullableString(record.md5),
    templatePlainTextFieldPrefix: readNullableString(record.templatePlainTextFieldPrefix),
    templatePlainTextFieldSuffix: readNullableString(record.templatePlainTextFieldSuffix),
    templateHasErrors: optionalBooleanOrNull(record.templateHasErrors),
    templateDevMode: optionalBooleanOrNull(record.templateDevMode),
    templateDescription: readNullableString(record.templateDescription),
    raw: record,
  };
}

async function requestDocmosisJson(input: {
  apiBaseUrl: string;
  path: string;
  body: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: DocmosisRequestPhase;
}): Promise<Record<string, unknown>> {
  const response = await requestDocmosisJsonWithStatus({
    apiBaseUrl: input.apiBaseUrl,
    path: input.path,
    body: input.body,
    fetcher: input.fetcher,
    signal: input.signal,
    expectedStatuses: [200],
  });
  if (response.status !== 200) {
    throw createDocmosisError(response.status, response.payload, input.phase);
  }
  if (readSucceeded(response.payload) === false) {
    throw createDocmosisError(400, response.payload, input.phase);
  }
  return response.payload;
}

async function requestDocmosisJsonWithStatus(input: {
  apiBaseUrl: string;
  path: string;
  body: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  expectedStatuses: number[];
}): Promise<{ status: number; payload: Record<string, unknown> }> {
  const response = await docmosisFetch(input);
  const payload = await readDocmosisPayload(response);
  if (!input.expectedStatuses.includes(response.status)) {
    throw createDocmosisError(response.status, payload, "execute");
  }
  return {
    status: response.status,
    payload,
  };
}

function buildDocmosisUrl(apiBaseUrl: string, path: string): URL {
  const normalizedBaseUrl = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBaseUrl);
}

async function docmosisFetch(input: {
  apiBaseUrl: string;
  path: string;
  body: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<Response> {
  try {
    return await input.fetcher(buildDocmosisUrl(input.apiBaseUrl, input.path), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Docmosis request failed: ${error.message}` : "Docmosis request failed",
    );
  }
}

async function readDocmosisPayload(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ProviderRequestError(502, "Docmosis returned a non-JSON response");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
    throw new ProviderRequestError(502, `Docmosis returned invalid JSON${detail}`);
  }

  return requiredObject(payload, "Docmosis response");
}

function createDocmosisError(
  status: number,
  payload: Record<string, unknown>,
  phase: DocmosisRequestPhase,
): ProviderRequestError {
  const shortMsg = readOptionalMessage(payload, "shortMsg");
  const longMsg = readOptionalMessage(payload, "longMsg");
  const message = longMsg || shortMsg || `Docmosis request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 400 ? status : 502, message, payload);
}

function normalizeDocmosisHeaders(headers: Headers): Record<string, unknown> {
  return {
    requestId: headers.get("x-docmosis-requestid"),
    pagesRendered: parseNullableIntegerHeader(headers.get("x-docmosis-pagesrendered")),
    zipCreated: parseNullableBooleanHeader(headers.get("x-docmosis-zip-created")),
    documentErrorsDetected: parseNullableBooleanHeader(headers.get("x-docmosis-document-errors-detected")),
    queueRejected: parseNullableBooleanHeader(headers.get("x-docmosis-queue-rejected")),
    queueAvailablePct: parseNullableIntegerHeader(headers.get("x-docmosis-queue-available-pct")),
    queueDelaySeconds: parseNullableIntegerHeader(headers.get("x-docmosis-queue-delay-seconds")),
    retryAfter: parseNullableIntegerHeader(headers.get("retry-after")),
    server: headers.get("x-docmosis-server"),
  };
}

export function resolveDocmosisApiBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, "apiBaseUrl is required");
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ProviderRequestError(400, "apiBaseUrl must be a valid HTTPS URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "apiBaseUrl must be a valid HTTPS URL");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "apiBaseUrl must not include credentials");
  }
  if (!docmosisApiBaseUrlPattern.test(url.hostname)) {
    throw new ProviderRequestError(400, "apiBaseUrl must point to a *.dws4.docmosis.com host");
  }
  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/api";
  } else if (url.pathname !== "/api" && url.pathname !== "/api/") {
    throw new ProviderRequestError(400, "apiBaseUrl must be the Docmosis base URL ending at /api");
  } else {
    url.pathname = "/api";
  }

  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function requireInputString(value: unknown, fieldName: string): string {
  const parsed = readOptionalTrimmedString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function requireTemplateName(value: unknown): string {
  const parsed = readOptionalTrimmedString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, "Docmosis template details were missing name");
  }
  return parsed;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  const parsed = optionalString(value)?.trim();
  return parsed || undefined;
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return value;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNullableInteger(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  const parsed = optionalNumber(value);
  return typeof parsed === "number" && Number.isInteger(parsed) ? parsed : null;
}

function readNullableNumber(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  const parsed = optionalNumber(value);
  return typeof parsed === "number" ? parsed : null;
}

function readOptionalMessage(payload: Record<string, unknown>, key: string): string | null {
  return readNullableString(payload[key]);
}

function readSucceeded(payload: Record<string, unknown>): boolean | undefined {
  return typeof payload.succeeded === "boolean" ? payload.succeeded : undefined;
}

function looksLikeDocmosisAuthError(payload: Record<string, unknown>): boolean {
  const text = `${readOptionalMessage(payload, "shortMsg") ?? ""} ${readOptionalMessage(payload, "longMsg") ?? ""}`
    .trim()
    .toLowerCase();
  return (
    text.includes("access key") ||
    text.includes("apikey") ||
    text.includes("api key") ||
    text.includes("authoriz") ||
    text.includes("authentic")
  );
}

function storeToIncludesStream(storeTo: string): boolean {
  return storeTo
    .split(";")
    .map((part) => part.trim().toLowerCase())
    .some((part) => part === "stream");
}

function ensureStoreToIncludesStream(storeTo: string | undefined): string | undefined {
  if (!storeTo) {
    return undefined;
  }
  if (storeToIncludesStream(storeTo)) {
    return storeTo;
  }
  return `${storeTo};stream`;
}

function parseNullableIntegerHeader(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseNullableBooleanHeader(value: string | null): boolean | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return null;
}

function requiredObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is not an object`, value);
  }
  return record;
}
