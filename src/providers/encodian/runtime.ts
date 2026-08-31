import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

const encodianDefaultApiBaseUrl = "https://api.apps-encodian.com";
const encodianCreateGuidPath = "/api/v1/Utility/CreateGuid";

type EncodianPhase = "validate" | "execute";

export interface EncodianContext extends ApiKeyProviderContext {
  apiBaseUrl: string;
}

type EncodianActionHandler = ProviderRuntimeHandler<EncodianContext>;

export const encodianActionHandlers: ProviderActionHandlers<"encodian", EncodianActionHandler> = {
  compress_pdf(input, context) {
    return executeCompressPdf(input, context);
  },
  extract_pdf_pages(input, context) {
    return executeExtractPdfPages(input, context);
  },
  get_pdf_text_layer(input, context) {
    return executeGetPdfTextLayer(input, context);
  },
  secure_pdf_document(input, context) {
    return executeSecurePdfDocument(input, context);
  },
  unlock_pdf_document(input, context) {
    return executeUnlockPdfDocument(input, context);
  },
};

export async function validateEncodianCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiBaseUrl = resolveEncodianApiBaseUrl(input.values, {});
  const payload = await requestEncodianJson({
    context: {
      apiKey: input.apiKey,
      apiBaseUrl,
      fetcher,
      signal,
    },
    path: encodianCreateGuidPath,
    body: {
      case: "Lower",
    },
    phase: "validate",
  });
  const record = requireEncodianRecord(payload);
  const generatedGuid = requireEncodianString(record, "result");

  return {
    profile: {
      accountId: "encodian",
      displayName: "Encodian API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl,
      validationEndpoint: encodianCreateGuidPath,
      generatedGuid,
    }),
  };
}

async function executeCompressPdf(input: Record<string, unknown>, context: EncodianContext): Promise<unknown> {
  const payload = await requestEncodianJson({
    context,
    path: "/api/v1/Core/CompressPdf",
    body: compactObject({
      fileContent: requiredInputString(input.fileContent, "fileContent"),
      compressImages: optionalBoolean(input.compressImages),
      imageQuality: optionalInteger(input.imageQuality),
      maxResolution: optionalInteger(input.maxResolution),
      resizeImages: optionalBoolean(input.resizeImages),
      removePrivateInfo: optionalBoolean(input.removePrivateInfo),
      removeUnusedObjects: optionalBoolean(input.removeUnusedObjects),
      removeUnusedStreams: optionalBoolean(input.removeUnusedStreams),
      linkDuplicateStreams: optionalBoolean(input.linkDuplicateStreams),
      allowReusePageContent: optionalBoolean(input.allowReusePageContent),
      unembedFonts: optionalBoolean(input.unembedFonts),
      flattenAnnotations: optionalBoolean(input.flattenAnnotations),
      deleteAnnotations: optionalBoolean(input.deleteAnnotations),
      flattenFields: optionalBoolean(input.flattenFields),
    }),
    phase: "execute",
  });

  return normalizeEncodianFileResult(payload);
}

async function executeExtractPdfPages(input: Record<string, unknown>, context: EncodianContext): Promise<unknown> {
  assertExtractPageInput(input);
  const payload = await requestEncodianJson({
    context,
    path: "/api/v1/Core/ExtractPdfPages",
    body: compactObject({
      fileContent: requiredInputString(input.fileContent, "fileContent"),
      StartPage: optionalInteger(input.startPage),
      EndPage: optionalInteger(input.endPage),
      pageNumbers: optionalString(input.pageNumbers),
    }),
    phase: "execute",
  });

  return normalizeEncodianFileResult(payload);
}

async function executeGetPdfTextLayer(input: Record<string, unknown>, context: EncodianContext): Promise<unknown> {
  const payload = await requestEncodianJson({
    context,
    path: "/api/v1/Core/GetPdfTextLayer",
    body: compactObject({
      FileName: requiredInputString(input.fileName, "fileName"),
      FileContent: requiredInputString(input.fileContent, "fileContent"),
      StartPage: optionalInteger(input.startPage),
      EndPage: optionalInteger(input.endPage),
      TextEncodingType: optionalString(input.textEncodingType),
      FinalOperation: true,
    }),
    phase: "execute",
  });

  return normalizeEncodianTextLayerResult(payload);
}

async function executeSecurePdfDocument(input: Record<string, unknown>, context: EncodianContext): Promise<unknown> {
  if (!optionalString(input.userPassword) && !optionalString(input.adminPassword)) {
    throw new ProviderRequestError(400, "userPassword or adminPassword is required");
  }

  const payload = await requestEncodianJson({
    context,
    path: "/api/v1/Core/SecurePdfDocument",
    body: compactObject({
      FileName: requiredInputString(input.fileName, "fileName"),
      fileContent: requiredInputString(input.fileContent, "fileContent"),
      userPassword: optionalString(input.userPassword),
      adminPassword: optionalString(input.adminPassword),
      pdfPrivileges: optionalString(input.pdfPrivileges),
      cryptoAlgorithm: optionalString(input.cryptoAlgorithm),
      pdfPrivilegesAllowAssembly: optionalBoolean(input.pdfPrivilegesAllowAssembly),
      pdfPrivilegesAllowCopy: optionalBoolean(input.pdfPrivilegesAllowCopy),
      pdfPrivilegesAllowFillIn: optionalBoolean(input.pdfPrivilegesAllowFillIn),
      pdfPrivilegesAllowPrint: optionalBoolean(input.pdfPrivilegesAllowPrint),
      pdfPrivilegesAllowScreenReaders: optionalBoolean(input.pdfPrivilegesAllowScreenReaders),
      pdfPrivilegesAllowModifyContents: optionalBoolean(input.pdfPrivilegesAllowModifyContents),
      pdfPrivilegesAllowModifyAnnotations: optionalBoolean(input.pdfPrivilegesAllowModifyAnnotations),
      FinalOperation: true,
    }),
    phase: "execute",
  });

  return normalizeEncodianFileResult(payload);
}

async function executeUnlockPdfDocument(input: Record<string, unknown>, context: EncodianContext): Promise<unknown> {
  const payload = await requestEncodianJson({
    context,
    path: "/api/v1/Core/UnlockPdfDocument",
    body: {
      FileName: requiredInputString(input.fileName, "fileName"),
      fileContent: requiredInputString(input.fileContent, "fileContent"),
      password: requiredInputString(input.password, "password"),
      FinalOperation: true,
    },
    phase: "execute",
  });

  return normalizeEncodianFileResult(payload);
}

async function requestEncodianJson(input: {
  context: Pick<EncodianContext, "apiKey" | "apiBaseUrl" | "fetcher" | "signal">;
  path: string;
  body: Record<string, unknown>;
  phase: EncodianPhase;
}): Promise<unknown> {
  const url = new URL(input.path, input.context.apiBaseUrl);
  const timeout = createProviderTimeout(input.context.signal);
  let response: Response;
  let payload: unknown;

  try {
    response = await input.context.fetcher(url, {
      method: "POST",
      headers: encodianHeaders(input.context.apiKey),
      body: JSON.stringify(input.body),
      signal: timeout.signal,
    });
    payload = await readEncodianPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "encodian request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `encodian request failed: ${error.message}` : "encodian request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createEncodianError(response, payload, input.phase);
  }

  return payload;
}

export function resolveEncodianApiBaseUrl(values: Record<string, string>, metadata: Record<string, unknown>): string {
  return normalizeEncodianApiBaseUrl(optionalString(metadata.apiBaseUrl) ?? optionalString(values.apiBaseUrl));
}

function normalizeEncodianApiBaseUrl(value?: string): string {
  const raw = value?.trim();
  if (!raw) {
    return encodianDefaultApiBaseUrl;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderRequestError(400, "apiBaseUrl must be a valid absolute URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "apiBaseUrl must use https");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "apiBaseUrl must not include credentials");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname !== "api.apps-encodian.com" && !hostname.endsWith(".apps-encodian.com")) {
    throw new ProviderRequestError(400, "apiBaseUrl must use an Encodian apps-encodian.com API host");
  }

  return url.origin;
}

function encodianHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json",
    "user-agent": providerUserAgent,
    "X-ApiKey": apiKey,
  };
}

async function readEncodianPayload(response: Response): Promise<unknown> {
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

function createEncodianError(response: Response, payload: unknown, phase: EncodianPhase): ProviderRequestError {
  const message = extractEncodianErrorMessage(payload) ?? response.statusText ?? "encodian request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 400 || response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && (response.status === 400 || response.status === 404 || response.status === 422)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function normalizeEncodianFileResult(payload: unknown): Record<string, unknown> {
  const record = requireEncodianRecord(payload);
  const errors = readEncodianErrors(record);
  const fileContent = readEncodianString(record, "FileContent", "fileContent");
  const operationStatus = readEncodianString(record, "OperationStatus", "operationStatus") ?? null;

  if (!fileContent) {
    if (isQueuedOperationStatus(operationStatus)) {
      throw new ProviderRequestError(502, "Encodian returned queued operation status without final output.");
    }
    throw new ProviderRequestError(502, errors[0] ?? "Encodian response did not include file output.");
  }

  return {
    filename: readEncodianString(record, "Filename", "filename") ?? null,
    fileContent,
    operationId: readEncodianString(record, "OperationId", "operationId") ?? null,
    operationStatus,
    errors,
  };
}

function normalizeEncodianTextLayerResult(payload: unknown): Record<string, unknown> {
  const record = requireEncodianRecord(payload);
  const errors = readEncodianErrors(record);
  const textLayer = readEncodianString(record, "TextLayer", "textLayer");
  const operationStatus = readEncodianString(record, "OperationStatus", "operationStatus") ?? null;

  if (!textLayer) {
    if (isQueuedOperationStatus(operationStatus)) {
      throw new ProviderRequestError(502, "Encodian returned queued operation status without final output.");
    }
    throw new ProviderRequestError(502, errors[0] ?? "Encodian response did not include text output.");
  }

  return {
    textLayer,
    filename: readEncodianString(record, "Filename", "filename") ?? null,
    operationId: readEncodianString(record, "OperationId", "operationId") ?? null,
    operationStatus,
    errors,
  };
}

function extractEncodianErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = readEncodianErrors(record);
  if (errors.length > 0) {
    return errors[0];
  }

  return readEncodianString(record, "HttpStatusMessage", "httpStatusMessage", "message", "Message");
}

function readEncodianErrors(record: Record<string, unknown>): string[] {
  return readStringArray(record.Errors).concat(readStringArray(record.errors));
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function requireEncodianRecord(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "encodian response was not a JSON object");
  }
  return record;
}

function requireEncodianString(record: Record<string, unknown>, key: string): string {
  const value = optionalString(record[key]);
  if (!value) {
    throw new ProviderRequestError(502, `encodian response missing ${key}`);
  }
  return value;
}

function readEncodianString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function assertExtractPageInput(input: Record<string, unknown>): void {
  const pageNumbers = optionalString(input.pageNumbers);
  const startPage = optionalInteger(input.startPage);
  const endPage = optionalInteger(input.endPage);
  if (!pageNumbers && startPage === undefined) {
    throw new ProviderRequestError(400, "pageNumbers or startPage is required");
  }
  if (pageNumbers && (startPage !== undefined || endPage !== undefined)) {
    throw new ProviderRequestError(400, "pageNumbers cannot be combined with startPage or endPage");
  }
  if (endPage !== undefined && startPage === undefined) {
    throw new ProviderRequestError(400, "startPage is required when endPage is provided");
  }
}

function isQueuedOperationStatus(value: string | null): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "queued" || normalized === "pending" || normalized === "inprogress";
}
