import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, runProviderRequest } from "../provider-runtime.ts";

const klipfolioApiBaseUrl = "https://api.klipfolio.com/api/1.0";

type KlipfolioPhase = "validate" | "execute";
type KlipfolioAssetKey = "clients" | "dashboards" | "klips" | "datasources";
type KlipfolioActionHandler = (input: Record<string, unknown>, context: KlipfolioActionContext) => Promise<unknown>;

export interface KlipfolioActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const klipfolioActionHandlers: ProviderActionHandlers<"klipfolio", KlipfolioActionHandler> = {
  list_clients(input, context) {
    return listKlipfolioAssets({ input, context, path: "/clients", outputKey: "clients" });
  },
  get_client(input, context) {
    return getKlipfolioAsset({ input, context, path: "/clients", outputKey: "client" });
  },
  list_dashboards(input, context) {
    return listKlipfolioAssets({ input, context, path: "/dashboards", outputKey: "dashboards" });
  },
  get_dashboard(input, context) {
    return getKlipfolioAsset({ input, context, path: "/dashboards", outputKey: "dashboard" });
  },
  list_klips(input, context) {
    return listKlipfolioAssets({ input, context, path: "/klips", outputKey: "klips" });
  },
  get_klip(input, context) {
    return getKlipfolioAsset({ input, context, path: "/klips", outputKey: "klip" });
  },
  list_data_sources(input, context) {
    return listKlipfolioAssets({ input, context, path: "/datasources", outputKey: "data_sources" });
  },
  get_data_source(input, context) {
    return getKlipfolioAsset({ input, context, path: "/datasources", outputKey: "data_source" });
  },
};

export async function validateKlipfolioCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestKlipfolioJson({
    path: "/clients",
    method: "GET",
    apiKey: input.apiKey,
    params: { limit: "1" },
    fetcher,
    signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: "klipfolio",
      displayName: "Klipfolio API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: klipfolioApiBaseUrl,
      validationEndpoint: "/clients?limit=1",
    },
  };
}

async function listKlipfolioAssets(input: {
  input: Record<string, unknown>;
  context: KlipfolioActionContext;
  path: `/${KlipfolioAssetKey}`;
  outputKey: string;
}): Promise<unknown> {
  const payload = await requestKlipfolioJson({
    path: input.path,
    method: "GET",
    apiKey: input.context.apiKey,
    params: compactObject({
      offset: readOptionalNumberString(input.input.offset),
      limit: readOptionalNumberString(input.input.limit),
    }),
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    phase: "execute",
  });
  const payloadRecord = requireRecord(payload, "Klipfolio returned an invalid list response");

  return {
    [input.outputKey]: readKlipfolioAssetList(payloadRecord, input.path).map(normalizeAsset),
    raw: payloadRecord,
  };
}

async function getKlipfolioAsset(input: {
  input: Record<string, unknown>;
  context: KlipfolioActionContext;
  path: `/${KlipfolioAssetKey}`;
  outputKey: string;
}): Promise<unknown> {
  const id = readRequiredNonEmptyString(input.input.id, "id");
  const payload = await requestKlipfolioJson({
    path: `${input.path}/${encodeURIComponent(id)}`,
    method: "GET",
    apiKey: input.context.apiKey,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    phase: "execute",
  });
  const payloadRecord = requireRecord(payload, "Klipfolio returned an invalid asset response");

  return {
    [input.outputKey]: normalizeAsset(readKlipfolioAsset(payloadRecord, input.path)),
    raw: payloadRecord,
  };
}

async function requestKlipfolioJson(input: {
  path: string;
  method: "GET";
  apiKey: string;
  params?: Record<string, string | undefined>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: KlipfolioPhase;
}): Promise<unknown> {
  return runProviderRequest({ signal: input.signal, label: "Klipfolio" }, async (signal) => {
    const response = await input.fetcher(buildKlipfolioUrl(input.path, input.params ?? {}), {
      method: input.method,
      headers: {
        accept: "application/json",
        "kf-api-key": input.apiKey,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readKlipfolioPayload(response);

    if (!response.ok) {
      throw createKlipfolioError(response.status, payload, input.phase);
    }

    return payload ?? {};
  });
}

function buildKlipfolioUrl(path: string, params: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${klipfolioApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readKlipfolioPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Klipfolio returned invalid JSON");
  }
}

function createKlipfolioError(status: number, payload: unknown, phase: KlipfolioPhase): ProviderRequestError {
  const message = extractKlipfolioErrorMessage(payload) ?? `Klipfolio request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(
      phase === "validate" ? 400 : status,
      phase === "validate" ? "Klipfolio API key is invalid or unauthorized" : message,
    );
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(502, message);
}

function extractKlipfolioErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message =
    readOptionalNonEmptyString(record.message) ??
    readOptionalNonEmptyString(record.error) ??
    readOptionalNonEmptyString(record.error_description);
  if (message) {
    return message;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const firstError = errors.find((item) => optionalRecord(item) || typeof item === "string");
    if (typeof firstError === "string" && firstError.trim()) {
      return firstError.trim();
    }
    const firstRecord = optionalRecord(firstError);
    return firstRecord
      ? (readOptionalNonEmptyString(firstRecord.message) ?? readOptionalNonEmptyString(firstRecord.detail))
      : undefined;
  }

  return undefined;
}

function readKlipfolioAssetList(payload: Record<string, unknown>, path: `/${KlipfolioAssetKey}`): unknown[] {
  const assetKey = path.slice(1);
  const value = payload[assetKey] ?? payload.data ?? payload.results ?? payload.items;
  if (Array.isArray(value)) {
    return value;
  }

  throw new ProviderRequestError(502, "Klipfolio returned an invalid asset list");
}

function readKlipfolioAsset(payload: Record<string, unknown>, path: `/${KlipfolioAssetKey}`): Record<string, unknown> {
  const assetKey = path.slice(1);
  const singularKey = assetKey === "datasources" ? "datasource" : assetKey.slice(0, -1);
  const wrapped = payload[singularKey] ?? payload.data;
  return optionalRecord(wrapped) ?? payload;
}

function normalizeAsset(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Klipfolio returned an invalid asset object");
  return {
    ...record,
    id: readOptionalScalarString(record.id) ?? readOptionalScalarString(record._id) ?? "",
    name: readOptionalNonEmptyString(record.name) ?? readOptionalNonEmptyString(record.title) ?? "",
    description: readOptionalNonEmptyString(record.description) ?? "",
  };
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readRequiredNonEmptyString(value: unknown, fieldName: string): string {
  const text = readOptionalNonEmptyString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readOptionalNonEmptyString(value: unknown): string | undefined {
  const text = optionalString(value);
  return text ? text : undefined;
}

function readOptionalScalarString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return readOptionalNonEmptyString(value);
}

function readOptionalNumberString(value: unknown): string | undefined {
  const numberValue = optionalInteger(value);
  return numberValue == null ? undefined : String(numberValue);
}
