import type { CredentialValidationResult, ProviderProxyExecutor, ProxyExecutionResult } from "../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "./provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalScalarString, optionalString } from "../core/cast.ts";
import {
  createProviderTimeout,
  createProviderProxyUrl,
  isAbortLikeError,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "./provider-runtime.ts";

export const blazeMeterApiBaseUrl = "https://a.blazemeter.com/api/v4";
export const blazeMeterValidationPath = "/user";

const blazeMeterRequestBaseUrl = "https://a.blazemeter.com/api/v4/";
const blazeMeterDefaultTimeoutMs = 30_000;

export type BlazeMeterPhase = "validate" | "execute";
export type BlazeMeterMethod = "GET" | "PUT";
export type BlazeMeterQuery = Record<string, boolean | number | string | string[] | undefined>;
export type BlazeMeterActionHandler = ProviderRuntimeHandler<BlazeMeterContext>;

export interface BlazeMeterContext {
  apiKeyId: string;
  apiSecret: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export interface BlazeMeterRequestInput {
  path: string;
  phase: BlazeMeterPhase;
  query?: BlazeMeterQuery;
  method?: BlazeMeterMethod;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

type BlazeMeterPayloadReader = (response: Response) => Promise<unknown>;

export async function validateBlazeMeterCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  return validateBlazeMeterCredentialWith(input, fetcher, signal, requestBlazeMeterJson);
}

export async function validateBlazeMeterCredentialOrText(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  return validateBlazeMeterCredentialWith(input, fetcher, signal, requestBlazeMeterJsonOrText);
}

async function validateBlazeMeterCredentialWith(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal: AbortSignal | undefined,
  requestJson: (context: BlazeMeterContext, input: BlazeMeterRequestInput) => Promise<Record<string, unknown>>,
): Promise<CredentialValidationResult> {
  const apiKeyId = requireBlazeMeterCredentialApiKeyId(input.values.apiKeyId);
  const payload = await requestJson(
    {
      apiKeyId,
      apiSecret: input.apiKey,
      fetcher,
      signal,
    },
    {
      path: blazeMeterValidationPath,
      phase: "validate",
    },
  );
  const user = optionalRecord(payload.result);
  const userId = readBlazeMeterOptionalString(user?.id);
  const email = readBlazeMeterOptionalString(user?.email);
  const displayName = readBlazeMeterOptionalString(user?.displayName);
  const name = readBlazeMeterOptionalString(user?.name);

  return {
    profile: {
      accountId: userId,
      displayName: email ?? displayName ?? name ?? "BlazeMeter API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: blazeMeterApiBaseUrl,
      validationEndpoint: blazeMeterValidationPath,
      apiKeyId,
      userId,
      email,
      displayName,
    }),
  };
}

export async function requestBlazeMeterJson(
  context: BlazeMeterContext,
  input: BlazeMeterRequestInput,
): Promise<Record<string, unknown>> {
  return requestBlazeMeter(context, input, readStrictBlazeMeterPayload);
}

export async function requestBlazeMeterJsonOrText(
  context: BlazeMeterContext,
  input: BlazeMeterRequestInput,
): Promise<Record<string, unknown>> {
  return requestBlazeMeter(context, input, readBlazeMeterPayload);
}

export function buildBlazeMeterPaginationQuery(input: Record<string, unknown>): BlazeMeterQuery {
  return buildBlazeMeterQuery({
    skip: input.skip,
    limit: input.limit,
    sort: Array.isArray(input.sort) ? input.sort.map((value) => String(value).trim()) : undefined,
  });
}

export function buildBlazeMeterQuery(input: Record<string, unknown>): BlazeMeterQuery {
  const query: BlazeMeterQuery = {};
  for (const [key, value] of Object.entries(input)) {
    const queryValue = readOptionalBlazeMeterQueryValue(value);
    if (queryValue !== undefined) {
      query[key] = queryValue;
    }
  }
  return query;
}

export function requireStoredBlazeMeterApiKeyId(value: unknown): string {
  const apiKeyId = optionalString(value);
  if (!apiKeyId) {
    throw new ProviderRequestError(500, "BlazeMeter apiKeyId is missing");
  }
  return apiKeyId;
}

export function createBlazeMeterProxyExecutor(service: string): ProviderProxyExecutor {
  return async (input, context): Promise<ProxyExecutionResult> => {
    try {
      const credential = await requireApiKeyCredential(context, service);
      const apiKeyId = requireStoredBlazeMeterApiKeyId(
        optionalString(credential.values.apiKeyId) ?? optionalString(credential.metadata.apiKeyId),
      );
      const url = createProviderProxyUrl(blazeMeterApiBaseUrl, input.endpoint, input.query);
      const headers = normalizeProviderProxyHeaders(input.headers);
      headers.set("authorization", buildBasicAuthorizationHeader(apiKeyId, credential.apiKey));
      headers.set("user-agent", providerUserAgent);
      if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }

      const response = await fetch(url, {
        method: input.method,
        headers,
        body:
          input.body === undefined
            ? undefined
            : typeof input.body === "string"
              ? input.body
              : JSON.stringify(input.body),
        signal: context.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
      }
      return { ok: true, response: await readProviderProxyResponse(response) };
    } catch (error) {
      return toProviderProxyError(error, "provider request failed");
    }
  };
}

async function requestBlazeMeter(
  context: BlazeMeterContext,
  input: BlazeMeterRequestInput,
  readPayload: BlazeMeterPayloadReader,
): Promise<Record<string, unknown>> {
  const url = new URL(input.path.startsWith("/") ? input.path.slice(1) : input.path, blazeMeterRequestBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendBlazeMeterQueryValue(url, key, value);
  }

  const timeout = createProviderTimeout(context.signal, blazeMeterDefaultTimeoutMs);
  try {
    const response = await context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: blazeMeterHeaders(context, input.headers),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw createBlazeMeterError(response, payload, input.phase);
    }
    return normalizeBlazeMeterEnvelope(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "BlazeMeter request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `BlazeMeter request failed: ${error.message}` : "BlazeMeter request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function blazeMeterHeaders(
  context: Pick<BlazeMeterContext, "apiKeyId" | "apiSecret">,
  headers: Record<string, string> = {},
): Record<string, string> {
  return {
    accept: "application/json",
    authorization: buildBasicAuthorizationHeader(context.apiKeyId, context.apiSecret),
    "user-agent": providerUserAgent,
    ...headers,
  };
}

async function readStrictBlazeMeterPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "BlazeMeter returned malformed JSON", text);
    }
    return text;
  }
}

async function readBlazeMeterPayload(response: Response): Promise<unknown> {
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

function createBlazeMeterError(response: Response, payload: unknown, phase: BlazeMeterPhase): ProviderRequestError {
  const message = extractBlazeMeterErrorMessage(payload) ?? response.statusText ?? "BlazeMeter request failed";
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractBlazeMeterErrorMessage(payload: unknown): string | undefined {
  const envelope = optionalRecord(payload);
  const error = optionalRecord(envelope?.error);
  return (
    readBlazeMeterOptionalString(error?.message) ??
    readBlazeMeterOptionalString(envelope?.message) ??
    readBlazeMeterOptionalString(envelope?.error)
  );
}

function normalizeBlazeMeterEnvelope(payload: unknown): Record<string, unknown> {
  const envelope = optionalRecord(payload);
  if (!envelope) {
    return {
      apiVersion: null,
      requestId: null,
      error: null,
      result: payload,
      total: null,
      limit: null,
      skip: null,
      hidden: null,
      raw: {},
    };
  }

  return {
    apiVersion: readBlazeMeterNullableInteger(envelope.api_version),
    requestId: readBlazeMeterNullableString(envelope.request_id),
    error: normalizeBlazeMeterError(envelope.error),
    result: envelope.result,
    total: readBlazeMeterNullableInteger(envelope.total),
    limit: readBlazeMeterNullableInteger(envelope.limit),
    skip: readBlazeMeterNullableInteger(envelope.skip),
    hidden: readBlazeMeterNullableInteger(envelope.hidden),
    raw: envelope,
  };
}

function normalizeBlazeMeterError(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }

  const error = optionalRecord(value);
  if (!error) {
    return {
      code: null,
      message: readBlazeMeterNullableString(value),
    };
  }

  return {
    code: readBlazeMeterNullableInteger(error.code),
    message: readBlazeMeterNullableString(error.message),
  };
}

function readOptionalBlazeMeterQueryValue(value: unknown): boolean | number | string | string[] | undefined {
  if (value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return undefined;
}

function appendBlazeMeterQueryValue(
  url: URL,
  key: string,
  value: boolean | number | string | string[] | undefined,
): void {
  if (Array.isArray(value)) {
    for (const child of value) {
      url.searchParams.append(key, child);
    }
    return;
  }

  if (value !== undefined) {
    url.searchParams.set(key, String(value));
  }
}

function requireBlazeMeterCredentialApiKeyId(value: unknown): string {
  const apiKeyId = optionalString(value);
  if (!apiKeyId) {
    throw new ProviderRequestError(400, "apiKeyId is required");
  }
  return apiKeyId;
}

function readBlazeMeterOptionalString(value: unknown): string | undefined {
  return value == null ? undefined : optionalScalarString(value);
}

function readBlazeMeterNullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function readBlazeMeterNullableInteger(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) ? parsed : null;
}

function buildBasicAuthorizationHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}
