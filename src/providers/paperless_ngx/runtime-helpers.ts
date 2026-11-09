import type { CredentialValidationResult, TransitFileWriter } from "../../core/types.ts";

import { createHash } from "node:crypto";
import { compactObject, objectArray, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed, readBoundedResponseBytes } from "../../core/request.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const paperlessNgxService: string = "paperless_ngx";

export const paperlessApiVersion: string = "10";
export const paperlessAcceptHeader: string = `application/json; version=${paperlessApiVersion}`;

export const paperlessFileTransferTimeoutMs: number = 120_000;

export const paperlessBulkDownloadTimeoutMs: number = 300_000;

export const paperlessChatTimeoutMs: number = 120_000;

export const paperlessMaxUploadBytes: number = 100 * 1024 * 1024;

export const paperlessMaxDownloadBytes: number = 200 * 1024 * 1024;

export const paperlessMaxBulkDownloadBytes: number = 500 * 1024 * 1024;

export type PaperlessRequestPhase = "validate" | "execute";

export type PaperlessQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlyArray<string | number | boolean>;

export type PaperlessHttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface PaperlessRequestOptions {
  method?: PaperlessHttpMethod;

  path: string;
  query?: Record<string, PaperlessQueryValue>;

  body?: unknown;
  timeoutMs?: number;

  expectJson?: boolean;
}

export interface PaperlessMultipartRequestOptions {
  method?: "POST" | "PUT" | "PATCH";
  path: string;
  query?: Record<string, PaperlessQueryValue>;
  body: FormData;
  timeoutMs?: number;
  expectJson?: boolean;
}

export interface PaperlessTransitInput {
  response: Response;
  name: string;
  fallbackMimeType?: string;

  maximumBytes?: number;
}

export interface PaperlessTransitResult {
  name: string;
  mimeType: string;
  sizeBytes: number;
  fileId: string;
  downloadUrl: string;
}

export interface PaperlessConnection {
  baseUrl: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export interface PaperlessExecutionContext {
  baseUrl: string;
  apiKey: string;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;

  request<T = unknown>(options: PaperlessRequestOptions): Promise<T>;

  requestRaw<T>(options: PaperlessRequestOptions, consume: (response: Response) => Promise<T>): Promise<T>;

  requestMultipart<T = unknown>(options: PaperlessMultipartRequestOptions): Promise<T>;

  transitResponse(input: PaperlessTransitInput): Promise<PaperlessTransitResult>;
}

export type PaperlessHandler = (context: PaperlessExecutionContext, input: Record<string, unknown>) => Promise<unknown>;

export type PaperlessHandlerMap = Record<string, PaperlessHandler>;

export function paperlessResponseObjectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  return objectArray(value, label, providerResponseError);
}

export function paperlessResponseInteger(value: unknown, label: string): number {
  const result = optionalInteger(value);
  if (result == null) throw providerResponseError(`${label} must be an integer`);
  return result;
}

export function paperlessResponseBoolean(value: unknown, label: string): boolean {
  if (typeof value != "boolean") throw providerResponseError(`${label} must be a boolean`);
  return value;
}

export function createPaperlessExecutionContext(input: {
  baseUrl: unknown;
  apiKey: string;
  fetcher: typeof fetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}): PaperlessExecutionContext {
  const baseUrl = normalizePaperlessBaseUrl(input.baseUrl);
  const connection: PaperlessConnection = {
    baseUrl,
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
  };
  const context: PaperlessExecutionContext = {
    baseUrl,
    apiKey: input.apiKey,
    transitFiles: input.transitFiles,
    signal: input.signal,
    request<T = unknown>(options: PaperlessRequestOptions) {
      return paperlessRequest<T>(connection, options);
    },
    requestRaw<T>(options: PaperlessRequestOptions, consume: (response: Response) => Promise<T>) {
      return paperlessRequestRaw(connection, options, consume);
    },
    requestMultipart<T = unknown>(options: PaperlessMultipartRequestOptions) {
      return paperlessRequestMultipart<T>(connection, options);
    },
    transitResponse(transitInput: PaperlessTransitInput) {
      return transitPaperlessResponse(context, transitInput);
    },
  };
  return context;
}

export async function paperlessRequest<T = unknown>(
  connection: PaperlessConnection,
  options: PaperlessRequestOptions,
): Promise<T> {
  return paperlessRequestRaw(
    connection,
    options,
    async (response) => (await readPaperlessBody(response, options.expectJson !== false)) as T,
  );
}

export async function paperlessRequestRaw<T>(
  connection: PaperlessConnection,
  options: PaperlessRequestOptions,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  return performPaperlessRequest(
    {
      ...connection,
      phase: "execute",
      method: options.method ?? "GET",
      path: options.path,
      query: options.query,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      contentType: options.body === undefined ? undefined : "application/json",
      timeoutMs: options.timeoutMs,
    },
    consume,
  );
}

export async function paperlessRequestMultipart<T = unknown>(
  connection: PaperlessConnection,
  options: PaperlessMultipartRequestOptions,
): Promise<T> {
  return performPaperlessRequest(
    {
      ...connection,
      phase: "execute",
      method: options.method ?? "POST",
      path: options.path,
      query: options.query,
      body: options.body,
      timeoutMs: options.timeoutMs,
    },
    async (response) => (await readPaperlessBody(response, options.expectJson !== false)) as T,
  );
}

interface PerformPaperlessRequestInput extends PaperlessConnection {
  phase: PaperlessRequestPhase;
  method: PaperlessHttpMethod;
  path: string;
  query?: Record<string, PaperlessQueryValue>;
  body?: BodyInit;
  contentType?: string;
  timeoutMs?: number;
}

async function performPaperlessRequest<T>(
  input: PerformPaperlessRequestInput,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const url = buildPaperlessUrl(input.baseUrl, input.path, input.query);
  const headers = new Headers({
    accept: paperlessAcceptHeader,
    authorization: `Token ${input.apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (input.contentType) {
    headers.set("content-type", input.contentType);
  }
  return runProviderRequest(
    { signal: input.signal, label: "Paperless-ngx", timeoutMs: input.timeoutMs },
    async (signal) => {
      const response = await input.fetcher(url, {
        method: input.method,
        headers,
        body: input.body,
        signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw mapPaperlessError(response.status, text, input.phase);
      }
      return consume(response);
    },
  );
}

function buildPaperlessUrl(baseUrl: string, path: string, query?: Record<string, PaperlessQueryValue>): URL {
  const url = new URL(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(buildQuery(query ?? {}))) {
    url.searchParams.set(key, value);
  }
  return url;
}

export function buildQuery(params: Record<string, PaperlessQueryValue>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      query[key] = value.map((item) => String(item)).join(",");
      continue;
    }
    query[key] = typeof value === "boolean" ? (value ? "true" : "false") : String(value);
  }
  return query;
}

async function readPaperlessBody(response: Response, expectJson: boolean): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!expectJson) return undefined;
    throw new ProviderRequestError(502, "Paperless-ngx returned a non-JSON response", undefined, "provider_error");
  }
}

const credentialInvalidDetails = new Set(["Invalid token.", "User inactive or deleted."]);

export function mapPaperlessError(
  status: number,
  bodyText: string,
  phase: PaperlessRequestPhase,
): ProviderRequestError {
  const message = resolvePaperlessErrorMessage(bodyText) ?? `Paperless-ngx request failed with status ${status}`;
  if (status === 406) {
    return new ProviderRequestError(
      406,
      `Paperless-ngx instance does not support API version ${paperlessApiVersion}; upgrade to paperless-ngx 3.0 or newer: ${message}`,
      undefined,
      "invalid_input",
    );
  }
  if (phase === "validate") {
    if (status === 401 || status === 403) {
      return new ProviderRequestError(
        400,
        `Paperless-ngx rejected the API token: ${message}`,
        undefined,
        "invalid_input",
      );
    }
    if (status >= 400 && status < 500) {
      return new ProviderRequestError(400, message, undefined, "invalid_input");
    }
  }
  if (status === 401) {
    return credentialInvalidDetails.has(message)
      ? new ProviderRequestError(401, `Paperless-ngx rejected the API token: ${message}`)
      : new ProviderRequestError(401, message, undefined, "provider_error");
  }
  if (status === 403) return new ProviderRequestError(403, message, undefined, "provider_error");
  if (status === 429) return new ProviderRequestError(429, message, undefined, "rate_limited");
  if (status >= 400 && status < 500) return new ProviderRequestError(status, message, undefined, "invalid_input");
  if (status >= 500) return new ProviderRequestError(502, message, undefined, "provider_error");
  return new ProviderRequestError(status, message, undefined, "provider_error");
}

export function resolvePaperlessErrorMessage(bodyText: string): string | undefined {
  const text = bodyText.trim();
  if (!text) return undefined;
  const parsed = parseJsonOrUndefined(text);
  const record = optionalRecord(parsed);
  if (record) {
    const detail = optionalString(record.detail)?.trim();
    if (detail) return detail;
    const parts: string[] = [];
    for (const [key, value] of Object.entries(record)) {
      const rendered = renderErrorValue(value);
      if (rendered) parts.push(`${key}: ${rendered}`);
    }
    if (parts.length > 0) return summarizePaperlessErrorText(parts.join("; "));
  } else if (Array.isArray(parsed)) {
    const rendered = renderErrorValue(parsed);
    if (rendered) return summarizePaperlessErrorText(rendered);
  } else if (typeof parsed === "string" && parsed.trim()) {
    return summarizePaperlessErrorText(parsed);
  }
  return summarizePaperlessErrorText(text);
}

function renderErrorValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const items = value.map(renderErrorValue).filter((item): item is string => item !== undefined);
    return items.length > 0 ? items.join(", ") : undefined;
  }
  const record = optionalRecord(value);
  if (record) {
    const parts: string[] = [];
    for (const [key, child] of Object.entries(record)) {
      const rendered = renderErrorValue(child);
      if (rendered) parts.push(`${key}: ${rendered}`);
    }
    return parts.length > 0 ? parts.join("; ") : undefined;
  }
  return undefined;
}

const maxPaperlessErrorMessageLength = 500;

function summarizePaperlessErrorText(text: string): string {
  const collapsed = collapseWhitespace(text.slice(0, maxPaperlessErrorMessageLength * 8));
  if (collapsed.length <= maxPaperlessErrorMessageLength) return collapsed;
  return `${collapsed.slice(0, maxPaperlessErrorMessageLength)}...`;
}

const whitespaceCharacters = new Set([" ", "\t", "\n", "\r", "\f", "\v", "\u00a0"]);

function collapseWhitespace(text: string): string {
  const words: string[] = [];
  let current = "";
  for (const char of text) {
    if (whitespaceCharacters.has(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) words.push(current);
  return words.join(" ");
}

function parseJsonOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function normalizePaperlessBaseUrl(value: unknown): string {
  const raw = optionalString(value)?.trim();
  if (!raw) throw new ProviderRequestError(400, "baseUrl is required", undefined, "invalid_input");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderRequestError(400, "baseUrl must be a valid HTTP or HTTPS URL", undefined, "invalid_input");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ProviderRequestError(400, "baseUrl must use HTTP or HTTPS", undefined, "invalid_input");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ProviderRequestError(
      400,
      "baseUrl must not contain credentials, query parameters, or a fragment",
      undefined,
      "invalid_input",
    );
  }
  assertPublicHttpUrl(url.toString(), {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
  });
  let basePath = trimTrailingSlashes(url.pathname);
  if (basePath.endsWith("/api")) {
    basePath = trimTrailingSlashes(basePath.slice(0, -"/api".length));
  }
  return `${url.origin}${basePath}`;
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

export function resolvePaperlessBaseUrl(input: {
  providerMetadata?: Record<string, unknown>;
  values?: Record<string, string>;
}): string {
  const stored = optionalString(input.providerMetadata?.baseUrl)?.trim();
  if (stored) return normalizePaperlessBaseUrl(stored);
  return normalizePaperlessBaseUrl(input.values?.baseUrl);
}

export async function validatePaperlessCredential(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const baseUrl = normalizePaperlessBaseUrl(values.baseUrl);
  const { profile, apiVersion, serverVersion } = await performPaperlessRequest(
    {
      baseUrl,
      apiKey,
      fetcher,
      signal,
      phase: "validate",
      method: "GET",
      path: "/api/profile/",
    },
    async (response) => ({
      profile: requiredResponseRecord(await readPaperlessBody(response, true), "Paperless-ngx profile response"),
      apiVersion: optionalString(response.headers.get("x-api-version"))?.trim(),
      serverVersion: optionalString(response.headers.get("x-version"))?.trim(),
    }),
  );
  const firstName = optionalString(profile.first_name)?.trim() ?? "";
  const lastName = optionalString(profile.last_name)?.trim() ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  const email = optionalString(profile.email)?.trim();
  const instanceUrl = new URL(baseUrl);
  const instanceLabel = `${instanceUrl.host}${instanceUrl.pathname === "/" ? "" : instanceUrl.pathname}`;
  const tokenHash = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
  return {
    profile: {
      accountId: `${paperlessNgxService}:${instanceLabel}:${tokenHash}`,
      displayName: fullName || email || `Paperless-ngx ${instanceLabel}`,
    },
    metadata: compactObject({
      baseUrl,
      apiVersion: apiVersion || undefined,
      serverVersion: serverVersion || undefined,
    }),
  };
}

export function requirePaperlessFileTransit(context: Pick<PaperlessExecutionContext, "transitFiles">): void {
  if (!context.transitFiles) {
    throw new ProviderRequestError(500, "Paperless-ngx transit file storage is not configured");
  }
}

export async function transitPaperlessResponse(
  connection: Pick<PaperlessExecutionContext, "transitFiles">,
  input: PaperlessTransitInput,
): Promise<PaperlessTransitResult> {
  const body = input.response.body;
  if (!connection.transitFiles) {
    await body?.cancel().catch(() => undefined);
    throw new ProviderRequestError(500, "Paperless-ngx transit file storage is not configured");
  }
  if (!body) {
    throw new ProviderRequestError(502, "Paperless-ngx returned an empty file response", undefined, "provider_error");
  }
  const maximumBytes = Math.min(input.maximumBytes ?? paperlessMaxDownloadBytes, connection.transitFiles.maxBytes);
  const declaredLength = Number(input.response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await body.cancel().catch(() => undefined);
    throw new ProviderRequestError(
      413,
      `Paperless-ngx download exceeds the ${maximumBytes} byte connector limit`,
      undefined,
      "invalid_input",
    );
  }
  const contentType = input.response.headers.get("content-type")?.trim();
  const bytes = await readBoundedResponseBytes(input.response, {
    maxBytes: maximumBytes,
    fieldName: "Paperless-ngx download",
    createError: (message) => new ProviderRequestError(413, message),
  });
  if (bytes.byteLength == 0) throw providerResponseError("Paperless-ngx returned an empty file response");
  const mimeType = contentType || input.fallbackMimeType || "application/octet-stream";
  const upload = await connection.transitFiles.create(
    new File([Uint8Array.from(bytes)], input.name, { type: mimeType }),
  );
  return { ...upload, mimeType, name: upload.name };
}

export async function streamPaperlessResponseToTransit(
  context: PaperlessExecutionContext,
  input: PaperlessTransitInput,
): Promise<{
  file: { fileId: string; downloadUrl: string; sizeBytes: number; name: string; mimeType: string };
  fileName: string;
  contentType: string;
  sizeBytes: number;
}> {
  const transit = await context.transitResponse(input);
  return {
    file: transit,
    fileName: transit.name,
    contentType: transit.mimeType,
    sizeBytes: transit.sizeBytes,
  };
}

export function limitPaperlessResponseStream(
  source: ReadableStream<Uint8Array>,
  maxBytes: number = paperlessMaxDownloadBytes,
): { stream: ReadableStream<Uint8Array>; length: () => number } {
  let total = 0;
  const stream = source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > maxBytes) {
          throw new ProviderRequestError(
            413,
            `Paperless-ngx download exceeds the ${maxBytes} byte connector limit`,
            undefined,
            "invalid_input",
          );
        }
        controller.enqueue(chunk);
      },
      flush() {
        if (total === 0) {
          throw new ProviderRequestError(
            502,
            "Paperless-ngx returned an empty file response",
            undefined,
            "provider_error",
          );
        }
      },
    }),
  );
  return { stream, length: () => total };
}

const paperlessFileExtensions: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "image/webp": ".webp",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/tiff": ".tiff",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/html": ".html",
  "application/json": ".json",
};

export function normalizePaperlessMimeType(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return "";
  const [mimeType] = raw.split(";");
  return (mimeType ?? "").trim().toLowerCase();
}

export function readPaperlessMimeType(response: Response): string {
  return normalizePaperlessMimeType(response.headers.get("content-type"));
}

export function guessPaperlessFileExtension(mimeType: string): string {
  return paperlessFileExtensions[mimeType] ?? "";
}

export function readPaperlessResponseFileName(response: Response): string | undefined {
  const header = response.headers.get("content-disposition");
  if (!header) return undefined;
  const parts = header.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (!part.toLowerCase().startsWith("filename*=")) continue;
    const value = part.slice("filename*=".length).trim();
    const separator = value.lastIndexOf("'");
    const decoded = decodeUrlComponent(separator >= 0 ? value.slice(separator + 1) : value);
    if (decoded) return decoded;
  }
  for (const part of parts) {
    if (!part.toLowerCase().startsWith("filename=")) continue;
    const value = part.slice("filename=".length).trim();
    const unquoted = value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
    if (unquoted) return unquoted;
  }
  return undefined;
}

export function decodeUrlComponent(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return decodeURIComponent(trimmed) || undefined;
  } catch {
    return trimmed;
  }
}

export function encodePaperlessId(value: unknown, fieldName: string): string {
  const id = optionalInteger(value);
  if (id === undefined || id <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`, undefined, "invalid_input");
  }
  return String(id);
}

export function requirePaperlessInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value)?.trim();
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`, undefined, "invalid_input");
  }
  return text;
}

export function normalizePaperlessPage(value: unknown, label: string): Record<string, unknown> {
  const page = requiredResponseRecord(value, label);
  const results = Array.isArray(page.results) ? page.results : [];
  return {
    ...page,
    count: optionalInteger(page.count) ?? results.length,
    next: optionalString(page.next) ?? null,
    previous: optionalString(page.previous) ?? null,
    results,
  };
}

export function pickProvidedFields(input: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (input[field] !== undefined) {
      picked[field] = input[field];
    }
  }
  return picked;
}

export function requirePaperlessUpdateFields(body: Record<string, unknown>): Record<string, unknown> {
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, "At least one field to update is required", undefined, "invalid_input");
  }
  return body;
}

export function pickDocumentSelection(input: Record<string, unknown>): Record<string, unknown> {
  const selection = pickProvidedFields(input, ["documents", "all", "filters"]);
  const all = selection.all === true;
  const documents = Array.isArray(selection.documents) ? selection.documents : undefined;
  if (!all && (!documents || documents.length === 0)) {
    throw new ProviderRequestError(400, "documents is required unless all is true", undefined, "invalid_input");
  }
  return selection;
}

export function deletedResult(ids: Record<string, number>): Record<string, unknown> {
  return { success: true, ...ids };
}

export function buildPaperlessListQuery(input: Record<string, unknown>): Record<string, PaperlessQueryValue> {
  const { additional_filters, ...filters } = input;
  const additional = optionalRecord(additional_filters) ?? {};
  return { ...filters, ...additional } as Record<string, PaperlessQueryValue>;
}
