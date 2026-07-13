import type { CredentialValidationResult, TransitFileWriter } from "../../core/types.ts";
import type { DokployActionName } from "./actions.ts";
import type { DokployOperation } from "./operations.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, readBoundedResponseBytes } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readTransitFileInput,
} from "../provider-runtime.ts";
import { dokployOperations } from "./operations.ts";

type DokployRequestPhase = "validate" | "execute";
type DokployActionHandler = (input: Record<string, unknown>, context: DokployActionContext) => Promise<unknown>;

export interface DokployActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  transitFiles?: TransitFileWriter;
}

const defaultRequestTimeoutMs = 60_000;
const maxResponseBytes = 10 * 1024 * 1024;
const maxErrorMessageCharacters = 16 * 1024;
const validationEndpoint = "/project.search";

export const dokployActionHandlers: Record<DokployActionName, DokployActionHandler> = Object.fromEntries(
  dokployOperations.map((operation) => [
    operation.name,
    (input: Record<string, unknown>, context: DokployActionContext) =>
      executeDokployOperation(operation, input, context),
  ]),
) as Record<DokployActionName, DokployActionHandler>;

export function createDokployContext(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  transitFiles?: TransitFileWriter,
): DokployActionContext {
  return { apiKey, apiBaseUrl: normalizeDokployApiBaseUrl(values.baseUrl), fetcher, signal, transitFiles };
}

export async function validateDokployCredential(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createDokployContext(values, apiKey, fetcher, signal);
  await requestDokployJson(validationEndpoint, "GET", { limit: 1, offset: 0 }, undefined, context, "validate");
  const host = new URL(context.apiBaseUrl).host;
  return {
    profile: { accountId: `dokploy:${host}`, displayName: `Dokploy ${host}` },
    grantedScopes: [],
    metadata: { apiBaseUrl: context.apiBaseUrl, validationEndpoint },
  };
}

/**
 * Validates a public Dokploy HTTP URL, rejects embedded credentials, removes
 * query/hash components, and ensures its path ends in `/api`.
 */
export function normalizeDokployApiBaseUrl(value: unknown): string {
  const instanceUrl = requiredString(value, "baseUrl", credentialError);
  const url = assertPublicHttpUrl(instanceUrl, { fieldName: "baseUrl", createError: credentialError });
  if (url.username || url.password) throw credentialError("baseUrl must not include credentials");
  url.hash = "";
  url.search = "";
  const path = url.pathname.replace(/\/+$/u, "");
  url.pathname = path.endsWith("/api") ? path : `${path}/api`;
  return url.toString().replace(/\/$/u, "");
}

export async function executeDokployOperation(
  operation: DokployOperation,
  input: Record<string, unknown>,
  context: DokployActionContext,
): Promise<unknown> {
  if (operation.supportStatus === "unsupported") {
    throw new ProviderRequestError(400, operation.supportReason ?? `${operation.name} is not supported`);
  }
  const path = buildPath(operation.path, operation.pathFields, input);
  const query = pickFields(input, operation.queryFields);
  const body = pickFields(input, operation.bodyFields);
  const requestBody =
    operation.contentType === "multipart/form-data"
      ? await buildMultipartBody(body, operation.fileFields ?? [], context)
      : hasFields(body)
        ? body
        : undefined;
  return requestDokployJson(path, operation.method, query, requestBody, context, "execute");
}

async function requestDokployJson(
  path: string,
  method: DokployOperation["method"],
  query: Record<string, unknown>,
  body: Record<string, unknown> | FormData | undefined,
  context: DokployActionContext,
  phase: DokployRequestPhase,
): Promise<unknown> {
  const url = new URL(path.startsWith("/") ? `${context.apiBaseUrl}${path}` : `${context.apiBaseUrl}/${path}`);
  for (const [key, value] of Object.entries(query)) appendQueryValue(url, key, value);
  const timeout = createProviderTimeout(context.signal, defaultRequestTimeoutMs);
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": providerUserAgent,
      "x-api-key": context.apiKey,
    };
    if (body && !(body instanceof FormData)) headers["content-type"] = "application/json";
    const response = await context.fetcher(url, {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: timeout.signal,
    });
    const responseBody = await readResponseBody(response);
    if (!response.ok) {
      const message =
        boundedErrorMessage(readErrorMessage(responseBody.payload) ?? responseBody.text) ??
        `Dokploy request failed with HTTP ${response.status}`;
      const status = phase === "validate" && [400, 401, 403].includes(response.status) ? 400 : response.status;
      throw new ProviderRequestError(status, message, redactSensitive(responseBody.payload));
    }
    if (!responseBody.isJson && responseBody.text.trim() !== "") {
      throw new ProviderRequestError(502, "Dokploy returned invalid JSON");
    }
    return responseBody.payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error))
      throw new ProviderRequestError(504, "Dokploy request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Dokploy request failed: ${boundedErrorMessage(error.message) ?? "Unknown network error"}`
        : "Dokploy request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function buildMultipartBody(
  input: Record<string, unknown>,
  fileFields: readonly string[],
  context: DokployActionContext,
): Promise<FormData> {
  const formData = new FormData();
  const fileFieldSet = new Set(fileFields);
  for (const [key, value] of Object.entries(input)) {
    if (fileFieldSet.has(key)) {
      const file = await readTransitFileInput(value, context);
      formData.set(key, file.file, file.name);
    } else if (value !== undefined && value !== null) {
      formData.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
  }
  return formData;
}

function buildPath(template: string, fields: readonly string[], input: Record<string, unknown>): string {
  let path = template;
  for (const field of fields) {
    const value = input[field];
    if (value == null) throw new ProviderRequestError(400, `${field} is required`);
    path = path.replaceAll(`{${field}}`, encodeURIComponent(String(value)));
  }
  return path;
}

function pickFields(input: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter((field) => input[field] !== undefined).map((field) => [field, input[field]]));
}

function hasFields(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0;
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) appendQueryValue(url, key, item);
    return;
  }
  url.searchParams.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
}

async function readResponseBody(response: Response): Promise<{ payload: unknown; text: string; isJson: boolean }> {
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: maxResponseBytes,
    fieldName: "Dokploy response",
    createError: (message) => new ProviderRequestError(413, message),
  });
  const text = new TextDecoder().decode(bytes);
  if (text.trim() === "") return { payload: null, text, isJson: true };
  try {
    return { payload: JSON.parse(text) as unknown, text, isJson: true };
  } catch {
    return { payload: null, text, isJson: false };
  }
}

function readErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function boundedErrorMessage(value: string): string | undefined {
  const message = redactSensitiveQueryParameters(value.trim());
  if (message === "") return undefined;
  if (message.length <= maxErrorMessageCharacters) return message;
  return `${message.slice(0, maxErrorMessageCharacters - 1)}…`;
}

function redactSensitiveQueryParameters(value: string): string {
  return value.replace(/([?&](?:api[-_]?key|authorization|cookie|password|secret|token)=)[^&#\s]*/giu, "$1[redacted]");
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, isSensitiveKey(key) ? "[redacted]" : redactSensitive(child)]),
  );
}

function isSensitiveKey(name: string): boolean {
  const normalized = name.toLowerCase().replaceAll(/[-_]/gu, "");
  return (
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("apikey") ||
    normalized.includes("privatekey") ||
    normalized === "authorization" ||
    normalized === "cookie" ||
    normalized === "setcookie"
  );
}

function credentialError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
