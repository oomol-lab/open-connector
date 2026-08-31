import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export interface OomolConsoleEndpoints {
  api: string;
  connector: string;
  insight: string;
  relationControl: string;
}

export type OomolConsoleEndpointName = keyof OomolConsoleEndpoints;

const defaultRequestTimeoutMs = 15_000;

export const defaultEndpoints: OomolConsoleEndpoints = resolveOomolConsoleEndpoints("production");

export function resolveOomolConsoleEndpoints(deployEnv: string): OomolConsoleEndpoints {
  const domain = deployEnv === "development" ? "oomol.dev" : "oomol.com";
  return {
    api: `https://api.${domain}`,
    connector: `https://connector.${domain}`,
    insight: `https://insight.${domain}`,
    relationControl: `https://relation-control.${domain}`,
  };
}

export function normalizeOomolConsoleEndpoints(endpoints: OomolConsoleEndpoints): OomolConsoleEndpoints {
  return {
    api: normalizeEndpoint("api", endpoints.api),
    connector: normalizeEndpoint("connector", endpoints.connector),
    insight: normalizeEndpoint("insight", endpoints.insight),
    relationControl: normalizeEndpoint("relationControl", endpoints.relationControl),
  };
}

export async function requestOomolConsole(input: {
  endpoints: OomolConsoleEndpoints;
  endpoint: OomolConsoleEndpointName;
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, string | number | string[] | undefined>;
  body?: unknown;
  teamId?: string;
  headers?: HeadersInit;
  timeoutMs?: number;
}): Promise<unknown> {
  return (await requestOomolConsoleWithResponse(input)).data;
}

export async function requestOomolConsoleWithResponse(input: {
  endpoints: OomolConsoleEndpoints;
  endpoint: OomolConsoleEndpointName;
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, string | number | string[] | undefined>;
  body?: unknown;
  teamId?: string;
  headers?: HeadersInit;
  timeoutMs?: number;
}): Promise<{ data: unknown; response: Response }> {
  const url = new URL(input.path, `${input.endpoints[input.endpoint]}/`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(name, item);
      }
    } else if (value !== undefined) {
      url.searchParams.set(name, String(value));
    }
  }

  const timeout = createProviderTimeout(undefined, input.timeoutMs ?? defaultRequestTimeoutMs);
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
    "user-agent": providerUserAgent,
  });
  for (const [name, value] of new Headers(input.headers)) {
    headers.set(name, value);
  }
  if (input.endpoint === "connector" && input.teamId !== undefined) {
    headers.set("x-oo-team-id", input.teamId);
  }
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  try {
    let response: Response;
    try {
      response = await input.fetcher(url, {
        method: input.method ?? "GET",
        headers,
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: timeout.signal,
      });
    } catch (error) {
      if (timeout.didTimeout()) {
        throw createTimeoutError();
      }
      const detail =
        error instanceof Error && error.message.trim() ? sanitizeUpstreamText(error.message, input.apiKey) : "";
      throw new ProviderRequestError(
        502,
        detail ? `OOMOL Console request failed: ${detail}` : "OOMOL Console request failed",
      );
    }

    let payload: unknown;
    try {
      payload = await readPayload(response);
    } catch {
      if (timeout.didTimeout()) {
        throw createTimeoutError();
      }
      throw new ProviderRequestError(502, "OOMOL Console response could not be read");
    }
    if (!response.ok) {
      throw mapOomolConsoleError(response.status, payload, input.apiKey);
    }
    return { data: unwrapSuccessEnvelope(payload), response };
  } finally {
    timeout.cleanup();
  }
}

function normalizeEndpoint(name: string, value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`OOMOL Console ${name} endpoint must be a valid URL`);
  }
  if (!(["http:", "https:"] as string[]).includes(url.protocol) || url.username || url.password) {
    throw new Error(`OOMOL Console ${name} endpoint must use HTTP without embedded credentials`);
  }
  return url.toString().replace(/\/+$/u, "");
}

async function readPayload(response: Response) {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createTimeoutError() {
  return new ProviderRequestError(504, "OOMOL Console request timed out");
}

function mapOomolConsoleError(status: number, payload: unknown, apiKey: string) {
  const message =
    sanitizeUpstreamText(readPayloadMessage(payload), apiKey) || `OOMOL Console request failed with status ${status}`;
  if (status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (status === 403) {
    return new ProviderRequestError(403, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 412) {
    return new ProviderRequestError(409, message);
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function unwrapSuccessEnvelope(payload: unknown) {
  const record = asRecord(payload);
  return record?.success === true && Object.hasOwn(record, "data") ? record.data : payload;
}

function sanitizeUpstreamText(value: string, apiKey: string) {
  return apiKey ? value.replaceAll(apiKey, "[REDACTED]") : value;
}

function readPayloadMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload.trim();
  }
  const record = asRecord(payload);
  if (!record) {
    return "";
  }
  for (const key of ["errorMessage", "message", "detail", "error", "code"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
