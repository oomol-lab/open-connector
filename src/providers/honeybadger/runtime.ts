import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const defaultHoneybadgerApiBaseUrl = "https://api.honeybadger.io";
export const honeybadgerValidationPath = "/v1/notices";

const allowedHoneybadgerApiHosts = new Set(["api.honeybadger.io", "eu-api.honeybadger.io"]);

export interface HoneybadgerActionContext extends ApiKeyProviderContext {
  apiBaseUrl: string;
}

type HoneybadgerActionHandler = (input: Record<string, unknown>, context: HoneybadgerActionContext) => Promise<unknown>;
type HoneybadgerRequestMode = "validate" | "execute";

interface HoneybadgerResponse {
  status: number;
  payload: unknown;
  text: string;
  headers: Headers;
}

export const honeybadgerActionHandlers: ProviderActionHandlers<"honeybadger", HoneybadgerActionHandler> = {
  report_exception(input, context) {
    return reportException(input, context);
  },
  report_event(input, context) {
    return reportEvent(input, context);
  },
  report_deployment(input, context) {
    return reportDeployment(input, context);
  },
  report_check_in(input, context) {
    return reportCheckIn(input, context);
  },
  report_check_in_with_payload(input, context) {
    return reportCheckInWithPayload(input, context);
  },
};

export async function validateHoneybadgerCredential(
  input: { apiKey: string; values: Record<string, string> },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const apiBaseUrl = normalizeHoneybadgerApiBaseUrl(input.values.apiBaseUrl);
  const response = await requestHoneybadger({
    apiBaseUrl,
    path: honeybadgerValidationPath,
    method: "POST",
    apiKey: input.apiKey,
    body: {},
    fetcher: options.fetcher,
    signal: options.signal,
    mode: "validate",
    acceptedStatuses: [422],
  });

  if (!(response.status === 422 || (response.status >= 200 && response.status < 300))) {
    throw createHoneybadgerError({
      status: response.status,
      payload: response.payload,
      fallbackMessage: response.text || "Honeybadger credential validation failed",
      mode: "validate",
    });
  }

  return {
    profile: {
      accountId: "project_api_key",
      displayName: "Honeybadger Project API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl,
      validationEndpoint: honeybadgerValidationPath,
      credentialKind: "project_api_key",
      validationMode: "notice_probe",
    },
  };
}

export function resolveHoneybadgerApiBaseUrl(input: {
  values?: Record<string, string>;
  metadata?: Record<string, unknown>;
}): string {
  const value = optionalString(input.metadata?.apiBaseUrl) ?? optionalString(input.values?.apiBaseUrl);
  return normalizeHoneybadgerApiBaseUrl(value);
}

async function reportException(input: Record<string, unknown>, context: HoneybadgerActionContext): Promise<unknown> {
  const response = await requestHoneybadgerJson({
    apiBaseUrl: context.apiBaseUrl,
    path: honeybadgerValidationPath,
    method: "POST",
    apiKey: context.apiKey,
    body: compactObject({
      error: requiredObject(input.error, "error"),
      server: optionalRecord(input.server),
      request: optionalRecord(input.request),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  const payload = requiredObject(response.payload, "Honeybadger notice response");
  const noticeId = optionalString(payload.id);
  if (!noticeId) {
    throw new ProviderRequestError(502, "Honeybadger notice response is missing id", payload);
  }

  return {
    notice: {
      id: noticeId,
    },
  };
}

async function reportEvent(input: Record<string, unknown>, context: HoneybadgerActionContext): Promise<unknown> {
  const eventItems = Array.isArray(input.events) ? input.events.map((item) => requiredObject(item, "event")) : [];
  const response = await requestHoneybadgerJson({
    apiBaseUrl: context.apiBaseUrl,
    path: "/v1/events",
    method: "POST",
    apiKey: context.apiKey,
    body: eventItems.map((item) => JSON.stringify(item)).join("\n"),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    contentType: null,
  });

  const payload = requiredObject(response.payload, "Honeybadger event response");
  return {
    batch: {
      id: requireHoneybadgerString(payload.id, "Honeybadger event batch id"),
      errors: optionalBoolean(payload.errors) ?? false,
      events: normalizeEventStatuses(payload.events),
    },
  };
}

async function reportDeployment(input: Record<string, unknown>, context: HoneybadgerActionContext): Promise<unknown> {
  const response = await requestHoneybadgerJson({
    apiBaseUrl: context.apiBaseUrl,
    path: "/v1/deploys",
    method: "POST",
    apiKey: context.apiKey,
    body: {
      deploy: compactObject(requiredObject(input.deploy, "deploy")),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return {
    deployment: {
      status: extractDeploymentStatus(response.payload, response.text),
    },
  };
}

async function reportCheckIn(input: Record<string, unknown>, context: HoneybadgerActionContext): Promise<unknown> {
  const id = optionalString(input.id);
  const slug = optionalString(input.slug);
  if ((id && slug) || (!id && !slug)) {
    throw new ProviderRequestError(400, "Provide either id or slug, but not both.");
  }

  const path = id
    ? `/v1/check_in/${encodeURIComponent(id)}`
    : `/v1/check_in/${encodeURIComponent(context.apiKey)}/${encodeURIComponent(
        requireHoneybadgerString(slug, "Honeybadger check-in slug"),
      )}`;

  await requestHoneybadger({
    apiBaseUrl: context.apiBaseUrl,
    path,
    method: "GET",
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    checkIn: {
      success: true,
    },
  };
}

async function reportCheckInWithPayload(
  input: Record<string, unknown>,
  context: HoneybadgerActionContext,
): Promise<unknown> {
  const checkInId = requireHoneybadgerString(input.checkInId, "Honeybadger check-in id");
  const payload = requiredObject(input.checkIn, "checkIn");

  await requestHoneybadger({
    apiBaseUrl: context.apiBaseUrl,
    path: `/v1/check_in/${encodeURIComponent(checkInId)}`,
    method: "POST",
    body: {
      check_in: compactObject({
        status: optionalString(payload.status),
        duration: typeof payload.duration === "number" ? payload.duration : undefined,
        stdout: optionalString(payload.stdout),
        stderr: optionalString(payload.stderr),
        exit_code: typeof payload.exitCode === "number" ? payload.exitCode : undefined,
      }),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    checkIn: {
      success: true,
    },
  };
}

async function requestHoneybadgerJson(input: {
  apiBaseUrl: string;
  path: string;
  method: string;
  apiKey?: string;
  body?: unknown;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: HoneybadgerRequestMode;
  notFoundAsInvalidInput?: boolean;
  contentType?: string | null;
  acceptedStatuses?: number[];
}): Promise<HoneybadgerResponse> {
  return requestHoneybadger(input);
}

async function requestHoneybadger(input: {
  apiBaseUrl: string;
  path: string;
  method: string;
  apiKey?: string;
  body?: unknown;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: HoneybadgerRequestMode;
  notFoundAsInvalidInput?: boolean;
  contentType?: string | null;
  acceptedStatuses?: number[];
}): Promise<HoneybadgerResponse> {
  const timeout = createProviderTimeout(input.signal);
  const headers = new Headers();
  headers.set("accept", "application/json");
  headers.set("user-agent", providerUserAgent);
  if (input.apiKey) {
    headers.set("x-api-key", input.apiKey);
  }

  let requestBody: string | undefined;
  if (typeof input.body === "string") {
    requestBody = input.body;
  } else if (input.body !== undefined) {
    requestBody = JSON.stringify(input.body);
    if (input.contentType !== null) {
      headers.set("content-type", input.contentType ?? "application/json");
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(new URL(input.path, input.apiBaseUrl).toString(), {
      method: input.method,
      headers,
      body: requestBody,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Honeybadger request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Honeybadger request failed: ${error.message}` : "Honeybadger request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const { payload, text } = await parseHoneybadgerResponse(response);
  const acceptedStatuses = new Set(input.acceptedStatuses ?? []);
  if (!response.ok && !acceptedStatuses.has(response.status)) {
    throw createHoneybadgerError({
      status: response.status,
      payload,
      fallbackMessage: text || response.statusText || "Honeybadger request failed",
      mode: input.mode,
      notFoundAsInvalidInput: input.notFoundAsInvalidInput,
    });
  }

  return {
    status: response.status,
    payload,
    text,
    headers: response.headers,
  };
}

async function parseHoneybadgerResponse(response: Response): Promise<{ payload: unknown; text: string }> {
  const text = await response.text();
  if (!text) {
    return {
      payload: undefined,
      text: "",
    };
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("json") || text.startsWith("{") || text.startsWith("[")) {
    try {
      return {
        payload: JSON.parse(text) as unknown,
        text,
      };
    } catch {
      return {
        payload: text,
        text,
      };
    }
  }
  return {
    payload: text,
    text,
  };
}

function createHoneybadgerError(input: {
  status: number;
  payload: unknown;
  fallbackMessage: string;
  mode: HoneybadgerRequestMode;
  notFoundAsInvalidInput?: boolean;
}): ProviderRequestError {
  const message = extractHoneybadgerErrorMessage(input.payload) ?? input.fallbackMessage;
  if (input.status === 401 || input.status === 403) {
    return new ProviderRequestError(input.mode === "validate" ? 400 : input.status, message, input.payload);
  }
  if (input.status === 404 && input.notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, input.payload);
  }
  if (input.status === 400 || input.status === 422) {
    return new ProviderRequestError(400, message, input.payload);
  }
  if (input.status === 429) {
    return new ProviderRequestError(429, message, input.payload);
  }
  return new ProviderRequestError(input.status >= 500 ? input.status : 502, message, input.payload);
}

function extractHoneybadgerErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const direct = optionalString(record.error) ?? optionalString(record.message);
  if (direct) {
    return direct;
  }
  const errors = record.errors;
  if (Array.isArray(errors)) {
    const firstMessage = errors.find((item) => typeof item === "string");
    if (typeof firstMessage === "string" && firstMessage.trim()) {
      return firstMessage.trim();
    }
  }
  return undefined;
}

function normalizeEventStatuses(value: unknown): Array<{ id: string; status: number }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = requiredObject(item, "Honeybadger event");
    return {
      id: requireHoneybadgerString(record.id, "Honeybadger event id"),
      status: requireHoneybadgerInteger(record.status, "Honeybadger event status"),
    };
  });
}

function extractDeploymentStatus(payload: unknown, text: string): string {
  const record = optionalRecord(payload);
  const status = record ? optionalString(record.status) : undefined;
  if (status) {
    return status;
  }
  if (text.trim()) {
    return text.trim();
  }
  return "OK";
}

function requiredObject(value: unknown, field: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(400, `${field} must be an object`);
  }
  return object;
}

function requireHoneybadgerString(value: unknown, field: string): string {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(502, `${field} is missing`);
  }
  return resolved;
}

function requireHoneybadgerInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${field} is missing`);
  }
  return value;
}

export function normalizeHoneybadgerApiBaseUrl(value: string | undefined): string {
  if (!value?.trim()) {
    return defaultHoneybadgerApiBaseUrl;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderRequestError(400, "apiBaseUrl must be a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "apiBaseUrl must use https");
  }
  if (url.username || url.password || url.port || !allowedHoneybadgerApiHosts.has(url.hostname.toLowerCase())) {
    throw new ProviderRequestError(400, "apiBaseUrl must be an approved Honeybadger API host");
  }

  let normalizedPath = url.pathname;
  while (normalizedPath.length > 1 && normalizedPath.endsWith("/")) {
    normalizedPath = normalizedPath.slice(0, -1);
  }
  url.pathname = normalizedPath || "/";
  url.search = "";
  url.hash = "";
  return `${url.origin}${url.pathname === "/" ? "" : url.pathname}`;
}
