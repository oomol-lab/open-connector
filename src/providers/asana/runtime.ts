import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { isAbortLikeError, ProviderRequestError, providerUserAgent, setSearchParams } from "../provider-runtime.ts";

export const asanaApiBaseUrl = "https://app.asana.com/api/1.0";

type AsanaRequestPhase = "validate" | "execute";
type AsanaRequestMethod = "GET" | "POST" | "PUT" | "DELETE";

/** The authenticated transport shared by Asana API helpers. */
export interface AsanaContext extends ApiKeyProviderContext {}

/** One Asana action handler backed by an authenticated Asana context. */
export type AsanaActionHandler = (input: Record<string, unknown>, context: AsanaContext) => Promise<unknown>;

/** Options for one request to the Asana REST API. */
export interface AsanaRequestOptions {
  context: AsanaContext;
  path: string;
  phase?: AsanaRequestPhase;
  method?: AsanaRequestMethod;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown> | BodyInit;
  wrapData?: boolean;
  notFoundAsInvalidInput?: boolean;
}

/** Options for an Asana resource creation or update request. */
export interface AsanaWriteResourceOptions {
  method: "POST" | "PUT";
  query?: Record<string, string | undefined>;
  notFoundAsInvalidInput?: boolean;
}

/** Build an invalid-input error for Asana action fields. */
export function asanaInvalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

/** Encode a required Asana gid for use in a request path. */
export function asanaPathGid(value: unknown, fieldName: string): string {
  return encodeURIComponent(requiredString(value, fieldName, asanaInvalidInputError));
}

/** Remove undefined values from an Asana query parameter map. */
export function compactAsanaQuery(input: Record<string, string | undefined>): Record<string, string> {
  return compactObject(input) as Record<string, string>;
}

/** Read optional action include fields as non-empty strings. */
export function readAsanaStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => !!item);
}

/** Merge provider defaults with caller-requested Asana opt_fields without duplicates. */
export function mergeAsanaFields(defaultFields: string[], includeFields: string[]): string[] {
  return [...new Set([...defaultFields, ...includeFields])];
}

/** Build the shared Asana opt_fields query for one action input. */
export function buildAsanaFieldsQuery(input: Record<string, unknown>, defaultFields: string[]): Record<string, string> {
  return {
    opt_fields: mergeAsanaFields(defaultFields, readAsanaStringArray(input.includeFields)).join(","),
  };
}

/** Build Asana offset cursor and opt_fields query parameters. */
export function buildAsanaCursorQuery(input: Record<string, unknown>, defaultFields: string[]): Record<string, string> {
  return compactAsanaQuery({
    offset: optionalString(input.cursor),
    ...buildAsanaFieldsQuery(input, defaultFields),
  });
}

/** Build Asana limit, offset cursor, and opt_fields query parameters. */
export function buildAsanaPaginationQuery(
  input: Record<string, unknown>,
  defaultFields: string[],
): Record<string, string> {
  return compactAsanaQuery({
    limit: typeof input.limit === "number" ? String(input.limit) : undefined,
    ...buildAsanaCursorQuery(input, defaultFields),
  });
}

/** Reject an update body that contains no mutable Asana fields. */
export function requireNonEmptyAsanaBody(body: Record<string, unknown>, message: string): void {
  if (Object.keys(body).length === 0) {
    throw asanaInvalidInputError(message);
  }
}

/** Send a request to Asana and return its JSON response envelope. */
export async function requestAsana(input: AsanaRequestOptions): Promise<Record<string, unknown>> {
  const url = new URL(`${asanaApiBaseUrl}${input.path}`);
  setSearchParams(url, input.query ?? {});

  const requestBody = createRequestBody(input.body, input.wrapData ?? true);
  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: createAsanaHeaders(input.context.apiKey, requestBody.isJson),
      body: requestBody.body,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortLikeError(error) ? 504 : 502,
      error instanceof Error ? `Asana request failed: ${error.message}` : "Asana request failed",
    );
  }

  const payload = await readAsanaPayload(response);
  if (!response.ok) {
    throw createAsanaError(response, payload, input.phase ?? "execute", input.notFoundAsInvalidInput ?? false);
  }

  return payload;
}

/** List resources and normalize Asana's offset pagination to the runtime cursor shape. */
export async function listAsanaResources(
  path: string,
  query: Record<string, string | undefined>,
  outputKey: string,
  context: AsanaContext,
): Promise<Record<string, unknown>> {
  const payload = await requestAsana({ path, context, query });
  return {
    [outputKey]: readDataArray(payload),
    nextCursor: readNextCursor(payload),
  };
}

/**
 * List resources from an Asana endpoint that returns no `next_page` envelope,
 * such as the search endpoints and team custom field settings.
 */
export async function listAsanaUnpaginatedResources(
  path: string,
  query: Record<string, string | undefined>,
  outputKey: string,
  context: AsanaContext,
): Promise<Record<string, unknown>> {
  const payload = await requestAsana({ path, context, query });
  return { [outputKey]: readDataArray(payload) };
}

/** Get one Asana resource and map a missing resource to invalid input. */
export async function getAsanaResource(
  path: string,
  query: Record<string, string | undefined>,
  outputKey: string,
  context: AsanaContext,
): Promise<Record<string, unknown>> {
  const payload = await requestAsana({ path, context, query, notFoundAsInvalidInput: true });
  return { [outputKey]: readDataObject(payload, outputKey) };
}

/** Create or update one Asana resource using the provider's JSON data envelope. */
export async function writeAsanaResource(
  path: string,
  body: Record<string, unknown> | BodyInit,
  outputKey: string,
  context: AsanaContext,
  options: AsanaWriteResourceOptions,
): Promise<Record<string, unknown>> {
  const payload = await requestAsana({
    path,
    context,
    method: options.method,
    query: options.query,
    body,
    notFoundAsInvalidInput: options.notFoundAsInvalidInput,
  });
  return { [outputKey]: readDataObject(payload, outputKey) };
}

/** Delete one Asana resource and normalize the successful empty response. */
export async function deleteAsanaResource(
  path: string,
  context: AsanaContext,
  notFoundAsInvalidInput = false,
): Promise<{ success: true }> {
  await requestAsana({ path, context, method: "DELETE", notFoundAsInvalidInput });
  return { success: true };
}

interface AsanaRequestBody {
  body?: BodyInit;
  isJson: boolean;
}

function createRequestBody(body: AsanaRequestOptions["body"], wrapData: boolean): AsanaRequestBody {
  if (body === undefined) {
    return { isJson: false };
  }
  if (isJsonObject(body)) {
    return {
      body: JSON.stringify(wrapData ? { data: body } : body),
      isJson: true,
    };
  }
  return { body, isJson: false };
}

function isJsonObject(body: AsanaRequestOptions["body"]): body is Record<string, unknown> {
  return (
    typeof body === "object" &&
    body !== null &&
    !(body instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(body) &&
    !(body instanceof Blob) &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof ReadableStream)
  );
}

function createAsanaHeaders(apiKey: string, isJson: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (isJson) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readAsanaPayload(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 204) {
    return {};
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    throw new ProviderRequestError(502, text || "Asana response is not JSON");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Asana response is not valid JSON");
  }
  return requiredRecord(body, "asana response", (message) => new ProviderRequestError(502, message));
}

function createAsanaError(
  response: Response,
  payload: Record<string, unknown>,
  phase: AsanaRequestPhase,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Asana request failed with status ${response.status}`;
  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function readErrorMessage(payload: Record<string, unknown>): string | undefined {
  const errors = payload.errors;
  if (!Array.isArray(errors)) {
    return undefined;
  }
  for (const error of errors) {
    const message = optionalString(optionalRecord(error)?.message);
    if (message) {
      return message;
    }
  }
  return undefined;
}

function readDataArray(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  return objectArray(payload.data, "asana response data", (message) => new ProviderRequestError(502, message));
}

function readDataObject(payload: Record<string, unknown>, label: string): Record<string, unknown> {
  return requiredRecord(payload.data, `asana ${label} response`, (message) => new ProviderRequestError(502, message));
}

function readNextCursor(payload: Record<string, unknown>): string | null {
  return optionalString(optionalRecord(payload.next_page)?.offset) ?? null;
}
