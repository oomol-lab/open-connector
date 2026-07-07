import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { JsonbinActionName } from "./actions.ts";

import { optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "jsonbin";
const jsonbinApiBaseUrl = "https://api.jsonbin.io/v3";
const jsonbinApiOrigin = "https://api.jsonbin.io";
const jsonbinApiPrefix = "/v3";
const jsonbinValidationPath = "/b";

type JsonbinRequestPhase = "validate" | "execute";

interface JsonbinActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type JsonbinActionHandler = (input: Record<string, unknown>, context: JsonbinActionContext) => Promise<unknown>;

export const jsonbinActionHandlers: Record<JsonbinActionName, JsonbinActionHandler> = {
  create_bin(input, context) {
    return createBin(input, context);
  },
  read_bin(input, context) {
    return readBin(input, context);
  },
  update_bin(input, context) {
    return updateBin(input, context);
  },
  delete_bin(input, context) {
    return deleteBin(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, jsonbinActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: jsonbinApiBaseUrl,
  auth: {
    type: "api_key_header",
    name: "X-Master-Key",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const response = await jsonbinFetch(buildJsonbinUrl(jsonbinValidationPath), {
      method: "GET",
      headers: jsonbinHeaders(input.apiKey),
      fetcher,
      signal,
    });
    const payload = await readJsonbinPayload(response);
    if (!response.ok) {
      throw createJsonbinError(response, payload, "validate");
    }

    return {
      profile: {
        accountId: "api_key",
        displayName: "JSONBin.io Master Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: jsonbinApiBaseUrl,
        validationEndpoint: jsonbinValidationPath,
        validationMode: "list_bins_probe",
      },
    };
  },
};

async function createBin(input: Record<string, unknown>, context: JsonbinActionContext): Promise<unknown> {
  const record = requiredRecord(input.record, "record", jsonbinInputError);
  const response = await jsonbinFetch(buildJsonbinUrl("/b"), {
    method: "POST",
    headers: jsonbinJsonHeaders(context.apiKey, {
      "X-Bin-Name": optionalString(input.name),
      "X-Collection-Id": optionalString(input.collectionId),
      "X-Bin-Private": typeof input.private === "boolean" ? String(input.private) : undefined,
    }),
    body: JSON.stringify(record),
    fetcher: context.fetcher,
    signal: context.signal,
  });
  const payload = await readJsonbinPayload(response);
  if (!response.ok) {
    throw createJsonbinError(response, payload, "execute");
  }

  return normalizeBinPayload(payload);
}

async function readBin(input: Record<string, unknown>, context: JsonbinActionContext): Promise<unknown> {
  const url = buildJsonbinUrl(`/b/${readBinIdPathSegment(input.binId)}`);
  const version = optionalString(input.version);
  if (version) {
    url.searchParams.set("version", version);
  }

  const response = await jsonbinFetch(url, {
    method: "GET",
    headers: jsonbinHeaders(context.apiKey),
    fetcher: context.fetcher,
    signal: context.signal,
  });
  const payload = await readJsonbinPayload(response);
  if (!response.ok) {
    throw createJsonbinError(response, payload, "execute");
  }

  return normalizeBinPayload(payload);
}

async function updateBin(input: Record<string, unknown>, context: JsonbinActionContext): Promise<unknown> {
  const record = requiredRecord(input.record, "record", jsonbinInputError);
  const response = await jsonbinFetch(buildJsonbinUrl(`/b/${readBinIdPathSegment(input.binId)}`), {
    method: "PUT",
    headers: jsonbinJsonHeaders(context.apiKey, {
      "X-Bin-Versioning": typeof input.versioning === "boolean" ? String(input.versioning) : undefined,
    }),
    body: JSON.stringify(record),
    fetcher: context.fetcher,
    signal: context.signal,
  });
  const payload = await readJsonbinPayload(response);
  if (!response.ok) {
    throw createJsonbinError(response, payload, "execute");
  }

  return normalizeBinPayload(payload);
}

async function deleteBin(input: Record<string, unknown>, context: JsonbinActionContext): Promise<unknown> {
  const response = await jsonbinFetch(buildJsonbinUrl(`/b/${readBinIdPathSegment(input.binId)}`), {
    method: "DELETE",
    headers: jsonbinHeaders(context.apiKey),
    fetcher: context.fetcher,
    signal: context.signal,
  });
  const payload = await readJsonbinPayload(response);
  if (!response.ok) {
    throw createJsonbinError(response, payload, "execute");
  }

  return normalizeDeletePayload(payload);
}

function jsonbinHeaders(apiKey: string, extraHeaders: Record<string, string | undefined> = {}): Record<string, string> {
  return pruneHeaders({
    "X-Master-Key": apiKey,
    accept: "application/json",
    "user-agent": providerUserAgent,
    ...extraHeaders,
  });
}

function buildJsonbinUrl(path: string): URL {
  return new URL(`${jsonbinApiPrefix}${path}`, jsonbinApiOrigin);
}

function jsonbinJsonHeaders(
  apiKey: string,
  extraHeaders: Record<string, string | undefined> = {},
): Record<string, string> {
  return jsonbinHeaders(apiKey, {
    "content-type": "application/json",
    ...extraHeaders,
  });
}

function pruneHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  const pruned: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      pruned[key] = value;
    }
  }
  return pruned;
}

async function jsonbinFetch(
  url: URL,
  input: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    headers: HeadersInit;
    fetcher: typeof fetch;
    body?: BodyInit;
    signal?: AbortSignal;
  },
): Promise<Response> {
  try {
    return await input.fetcher(url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `JSONBin request failed: ${error.message}` : "JSONBin request failed",
    );
  }
}

async function readJsonbinPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createJsonbinError(response: Response, payload: unknown, phase: JsonbinRequestPhase): ProviderRequestError {
  const message = extractJsonbinMessage(payload, `JSONBin request failed with status ${response.status}`);
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractJsonbinMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return fallback;
  }

  const nested = optionalRecord(record.error);
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.statusMessage) ??
    optionalString(nested?.message) ??
    fallback
  );
}

function normalizeBinPayload(payload: unknown): Record<string, unknown> {
  const raw = readPayloadObject(payload);
  return {
    record: optionalRecord(raw.record) ?? {},
    metadata: optionalRecord(raw.metadata) ?? {},
    raw,
  };
}

function normalizeDeletePayload(payload: unknown): Record<string, unknown> {
  const raw = readPayloadObject(payload);
  return {
    metadata: optionalRecord(raw.metadata) ?? raw,
    raw,
  };
}

function readPayloadObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "JSONBin returned a non-object response", payload);
  }
  return record;
}

function readBinIdPathSegment(value: unknown): string {
  return encodeURIComponent(requiredString(value, "binId", jsonbinInputError));
}

function jsonbinInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
