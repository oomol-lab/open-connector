import type { TransitFileWriter } from "../../core/types.ts";
import type { ProviderActionHandlerSubset, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, encodePathSegment, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderErrorTextBody,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const karakeepDefaultInstanceUrl = "https://cloud.karakeep.app";
const karakeepApiPath = "/api/v1";

type KarakeepQueryValue = string | number | boolean | null | undefined;
type KarakeepHttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface KarakeepRequestOptions {
  method?: KarakeepHttpMethod;
  path: string;
  query?: Record<string, KarakeepQueryValue>;
  body?: unknown;
  timeoutMs?: number;
  expectJson?: boolean;
}

interface KarakeepMultipartRequestOptions {
  method?: "POST" | "PUT" | "PATCH";
  path: string;
  query?: Record<string, KarakeepQueryValue>;
  body: FormData;
  timeoutMs?: number;
  expectJson?: boolean;
}

export interface KarakeepExecutionContext {
  apiBaseUrl: string;
  apiKey: string;
  fetcher: ProviderFetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
  request<T = unknown>(options: KarakeepRequestOptions): Promise<T>;
  requestRaw<T>(options: KarakeepRequestOptions, consume: (response: Response) => Promise<T>): Promise<T>;
  requestMultipart<T = unknown>(options: KarakeepMultipartRequestOptions): Promise<T>;
}

export type KarakeepHandler = ProviderRuntimeHandler<KarakeepExecutionContext>;
export type KarakeepHandlerMap = ProviderActionHandlerSubset<"karakeep", KarakeepHandler>;

export function createKarakeepContext(
  values: Record<string, string>,
  apiKeyInput: unknown,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
  transitFiles?: TransitFileWriter,
): KarakeepExecutionContext {
  const apiKey = requiredString(apiKeyInput, "apiKey", providerInputError);
  const apiBaseUrl = normalizeKarakeepApiBaseUrl(values.instanceUrl);
  const context: KarakeepExecutionContext = {
    apiBaseUrl,
    apiKey,
    fetcher,
    signal,
    transitFiles,
    request<T = unknown>(options: KarakeepRequestOptions): Promise<T> {
      return karakeepRequest<T>(context, options);
    },
    requestRaw<T>(options: KarakeepRequestOptions, consume: (response: Response) => Promise<T>): Promise<T> {
      return performKarakeepRequest(context, options, consume);
    },
    requestMultipart<T = unknown>(options: KarakeepMultipartRequestOptions): Promise<T> {
      return performKarakeepRequest<T>(context, options, (response) => readKarakeepBody(response, options.expectJson));
    },
  };
  return context;
}

export function normalizeKarakeepApiBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const rawValue = optionalString(value) ?? karakeepDefaultInstanceUrl;
  const url = assertPublicHttpUrl(rawValue, {
    fieldName: "instanceUrl",
    allowPrivateNetwork,
    createError: providerInputError,
  });
  if (url.username || url.password) {
    throw providerInputError("instanceUrl must not include username or password");
  }
  if (url.search || url.hash) {
    throw providerInputError("instanceUrl must not include a query string or fragment");
  }
  let path = trimTrailingSlash(url.pathname);
  if (!path.endsWith(karakeepApiPath)) {
    path = `${path}${karakeepApiPath}`;
  }
  url.pathname = `${path}/`;
  return url.toString();
}

export async function validateKarakeepCredential(
  values: Record<string, string>,
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const context = createKarakeepContext(values, apiKey, fetcher, signal);
  const user = requiredResponseRecord(
    await performKarakeepRequest(
      context,
      { path: "/users/me" },
      (response) => readKarakeepBody(response, true),
      "validate",
    ),
    "the current user",
  );
  const accountId = requiredString(user.id, "the current user id", providerResponseError);
  const displayName =
    optionalString(user.name) ?? optionalString(user.email) ?? `Karakeep ${new URL(context.apiBaseUrl).host}`;
  return {
    profile: { accountId, displayName },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: context.apiBaseUrl,
      validationEndpoint: "/users/me",
    },
  };
}

async function karakeepRequest<T>(context: KarakeepExecutionContext, options: KarakeepRequestOptions): Promise<T> {
  return performKarakeepRequest<T>(context, options, (response) => readKarakeepBody(response, options.expectJson));
}

async function performKarakeepRequest<T>(
  context: KarakeepExecutionContext,
  options: KarakeepRequestOptions | KarakeepMultipartRequestOptions,
  consume: (response: Response) => Promise<T>,
  phase: "validate" | "execute" = "execute",
): Promise<T> {
  return runProviderRequest(
    { signal: context.signal, timeoutMs: options.timeoutMs, label: "Karakeep" },
    async (signal) => {
      const headers = new Headers({
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      });
      let body: BodyInit | undefined;
      if (options.body instanceof FormData) {
        body = options.body;
      } else if (options.body !== undefined) {
        headers.set("content-type", "application/json");
        body = JSON.stringify(options.body);
      }
      const response = await context.fetcher(buildKarakeepUrl(context.apiBaseUrl, options.path, options.query), {
        method: options.method ?? "GET",
        headers,
        body,
        signal,
      });
      if (!response.ok) {
        const text = await readProviderErrorTextBody(response, "Karakeep error response");
        throw mapKarakeepHttpError(response.status, readKarakeepErrorMessage(text), phase);
      }
      return consume(response);
    },
  );
}

async function readKarakeepBody<T>(response: Response, expectJson = true): Promise<T> {
  if (!expectJson || response.status === 204) {
    return undefined as T;
  }
  return (await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Karakeep returned invalid JSON",
  })) as T;
}

function readKarakeepErrorMessage(text: string): string {
  const fallback = text.trim().slice(0, 500) || "Karakeep request failed";
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return fallback;
  }
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  const direct = optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(error?.message);
  if (direct) {
    const nested = readNestedErrorMessage(direct);
    const message = nested ?? direct;
    const code = optionalString(record?.code);
    return `${code ? `${code}: ` : ""}${message}`.slice(0, 500);
  }
  return fallback;
}

function readNestedErrorMessage(value: string): string | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return optionalString(optionalRecord(parsed[0])?.message);
    }
    return optionalString(optionalRecord(parsed)?.message);
  } catch {
    return undefined;
  }
}

function mapKarakeepHttpError(status: number, message: string, phase: "validate" | "execute"): ProviderRequestError {
  if (phase === "validate" && (status === 401 || status === 403)) {
    return providerInputError(message);
  }
  if (status === 401 || status === 403 || status === 429) {
    return new ProviderRequestError(status, message);
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return providerInputError(message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function buildKarakeepUrl(apiBaseUrl: string, path: string, query?: Record<string, KarakeepQueryValue>): URL {
  const url = new URL(trimLeadingSlash(path), apiBaseUrl);
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(name, String(value));
    }
  }
  return url;
}

export function encodeKarakeepId(value: unknown, fieldName: string): string {
  const id = requiredInputString(value, fieldName);
  if (id === "." || id === "..") {
    throw providerInputError(`${fieldName} must not be a path traversal segment`);
  }
  return encodePathSegment(id);
}

export function pickProvidedFields(input: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    if (Object.hasOwn(input, field)) {
      output[field] = input[field];
    }
  }
  return output;
}

export function requireKarakeepUpdateFields(body: Record<string, unknown>): Record<string, unknown> {
  if (Object.keys(body).length === 0) {
    throw providerInputError("Provide at least one field to update");
  }
  return body;
}

function trimLeadingSlash(value: string): string {
  let index = 0;
  while (value[index] === "/") index += 1;
  return value.slice(index);
}

function trimTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}
