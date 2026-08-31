import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, recordOrEmpty, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";
import { influxdbCloudAllowedApiBaseUrls } from "./regions.ts";

type InfluxdbCloudRequestPhase = "validate" | "execute";
type InfluxdbCloudQueryValue = string | number | undefined;
type PartialWriteResponse = { status: number; payload: unknown };
type InfluxdbCloudActionHandler = (
  input: Record<string, unknown>,
  context: InfluxdbCloudActionContext,
) => Promise<unknown>;

export interface InfluxdbCloudActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const influxdbCloudActionHandlers: ProviderActionHandlers<"influxdb_cloud", InfluxdbCloudActionHandler> = {
  list_buckets(input, context) {
    return listBuckets(input, context);
  },
  get_bucket(input, context) {
    return getBucket(input, context);
  },
  query_influxql(input, context) {
    return queryInfluxql(input, context);
  },
  write_line_protocol(input, context) {
    return writeLineProtocol(input, context);
  },
};

export function resolveInfluxdbCloudApiBaseUrl(value: unknown): string {
  const rawValue = optionalString(value);
  if (!rawValue) {
    throw new ProviderRequestError(400, "InfluxDB Cloud API Base URL is required");
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new ProviderRequestError(400, "InfluxDB Cloud API Base URL must be a valid URL");
  }

  if (
    url.protocol === "https:" &&
    influxdbCloudAllowedApiBaseUrls.some((allowed) => allowed === url.origin) &&
    (url.pathname === "" || url.pathname === "/") &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password
  ) {
    return url.origin;
  }

  throw new ProviderRequestError(400, `unsupported InfluxDB Cloud API Base URL: ${rawValue}`);
}

async function listBuckets(input: Record<string, unknown>, context: InfluxdbCloudActionContext): Promise<unknown> {
  const payload = recordOrEmpty(
    await requestForAction(context, "/api/v2/buckets", {
      query: {
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        after: optionalString(input.after),
        name: optionalString(input.name),
        id: optionalString(input.id),
      },
    }),
  );
  return {
    buckets: requireObjectArray(payload.buckets, "buckets"),
    links: optionalRecord(payload.links) ?? {},
  };
}

async function getBucket(input: Record<string, unknown>, context: InfluxdbCloudActionContext): Promise<unknown> {
  const bucketId = requiredString(input.bucketId, "bucketId", (message) => new ProviderRequestError(400, message));
  const payload = await requestForAction(context, `/api/v2/buckets/${encodeURIComponent(bucketId)}`);
  return { bucket: requireObject(payload, "bucket") };
}

async function queryInfluxql(input: Record<string, unknown>, context: InfluxdbCloudActionContext): Promise<unknown> {
  const payload = recordOrEmpty(
    await requestForAction(context, "/query", {
      query: {
        db: requiredString(input.database, "database", (message) => new ProviderRequestError(400, message)),
        q: requiredString(input.query, "query", (message) => new ProviderRequestError(400, message)),
        rp: optionalString(input.retentionPolicy),
        epoch: optionalString(input.epoch),
      },
    }),
  );
  return {
    results: requireObjectArray(payload.results, "results"),
  };
}

async function writeLineProtocol(
  input: Record<string, unknown>,
  context: InfluxdbCloudActionContext,
): Promise<unknown> {
  const response = await requestForAction(context, "/write", {
    method: "POST",
    query: {
      db: requiredString(input.database, "database", (message) => new ProviderRequestError(400, message)),
      rp: optionalString(input.retentionPolicy),
      precision: optionalString(input.precision),
    },
    textBody: requireNonBlankText(input.lineProtocol, "lineProtocol"),
    allowPartialWrite: true,
  });
  if (response.status === 201) {
    return {
      written: true,
      partial: true,
      rejected: requireObject(response.payload, "partial write details"),
    };
  }
  if (response.status === 204) {
    return { written: true, partial: false, rejected: null };
  }
  throw new ProviderRequestError(502, `InfluxDB Cloud write returned unexpected status ${response.status}`);
}

function requestForAction(
  context: InfluxdbCloudActionContext,
  path: string,
  options: {
    method?: "GET" | "POST";
    query?: Record<string, InfluxdbCloudQueryValue>;
    textBody?: string;
    allowPartialWrite: true;
  },
): Promise<PartialWriteResponse>;
function requestForAction(
  context: InfluxdbCloudActionContext,
  path: string,
  options?: { method?: "GET" | "POST"; query?: Record<string, InfluxdbCloudQueryValue>; textBody?: string },
): Promise<unknown>;
function requestForAction(
  context: InfluxdbCloudActionContext,
  path: string,
  options: {
    method?: "GET" | "POST";
    query?: Record<string, InfluxdbCloudQueryValue>;
    textBody?: string;
    allowPartialWrite?: boolean;
  } = {},
): Promise<PartialWriteResponse | unknown> {
  return requestInfluxdbCloud({
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    path,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    ...options,
  });
}

async function requestInfluxdbCloud(input: {
  apiKey: string;
  apiBaseUrl: string;
  path: string;
  fetcher: typeof fetch;
  phase: InfluxdbCloudRequestPhase;
  signal?: AbortSignal;
  method?: "GET" | "POST";
  query?: Record<string, InfluxdbCloudQueryValue>;
  textBody?: string;
  allowPartialWrite?: boolean;
}): Promise<PartialWriteResponse | unknown> {
  const url = new URL(input.path, input.apiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  input.signal?.throwIfAborted();
  const timeout = createProviderTimeout(input.signal);
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: requestHeaders(input.apiKey, input.textBody !== undefined),
      body: input.textBody,
      signal: timeout.signal,
    });
    payload = await readResponsePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "InfluxDB Cloud request timed out", error);
    }
    if (isAbortSignalError(input.signal, error)) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `InfluxDB Cloud request failed: ${error.message}` : "InfluxDB Cloud request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok || (response.status === 201 && !input.allowPartialWrite)) {
    throw createRequestError(response.status, payload, input.phase);
  }
  if (input.allowPartialWrite) {
    return { status: response.status, payload };
  }
  return payload;
}

function requestHeaders(apiKey: string, hasTextBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Token ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (hasTextBody) {
    headers.set("content-type", "text/plain; charset=utf-8");
  }
  return headers;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: "InfluxDB Cloud returned a non-JSON response",
    trimEmptyBody: false,
  });
}

function createRequestError(status: number, payload: unknown, phase: InfluxdbCloudRequestPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `InfluxDB Cloud request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.detail);
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const objectValue = optionalRecord(value);
  if (!objectValue) {
    throw new ProviderRequestError(502, `InfluxDB Cloud response is missing a valid ${fieldName} object`);
  }
  return objectValue;
}

function requireObjectArray(value: unknown, fieldName: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `InfluxDB Cloud response is missing a valid ${fieldName} array`);
  }
  return value.map((item) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, `InfluxDB Cloud response is missing a valid ${fieldName} array`);
    }
    return record;
  });
}

function requireNonBlankText(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}
