import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, objectArray, optionalRecord, optionalString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { wejamAiExportResourceValues } from "./constants.ts";

export const wejamAiApiBaseUrl: string = "https://api.wejam.ai";
export const wejamAiDataExportPathPrefix: string = "/api/v1/data-exports";
export const wejamAiValidationPath: string = `${wejamAiDataExportPathPrefix}/users`;

const wejamAiExportResourceSet = new Set<string>(wejamAiExportResourceValues);

type WejamAiPhase = "validate" | "execute";
type WejamAiActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type WejamAiActionHandler = (input: Record<string, unknown>, context: WejamAiActionContext) => Promise<unknown>;

export const wejamAiActionHandlers: ProviderActionHandlers<"wejam_ai", WejamAiActionHandler> = {
  async export_data(input, context) {
    const resource = readExportResource(input.resource);
    const payload = await requestWejamAiJson({
      apiKey: context.apiKey,
      path: `${wejamAiDataExportPathPrefix}/${resource}`,
      query: buildDataExportQuery(input),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });

    return normalizeDataExportPayload(resource, payload);
  },
};

export async function validateWejamAiCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = optionalString(apiKey);
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }

  const payload = await requestWejamAiJson({
    apiKey: trimmedApiKey,
    path: wejamAiValidationPath,
    query: new URLSearchParams([
      ["page", "1"],
      ["limit", "1"],
    ]),
    phase: "validate",
    fetcher,
    signal,
  });
  const body = normalizeDataExportPayload("users", payload);
  const firstUser = body.data[0];
  const firstUserEmail = optionalString(firstUser?.email);

  return {
    profile: {
      accountId: firstUserEmail ?? "wejam_ai:api_key",
      displayName: firstUserEmail ? `Jam (${firstUserEmail})` : "Jam API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: wejamAiApiBaseUrl,
      validationEndpoint: wejamAiValidationPath,
      validationResource: "users",
      sampleUserEmail: firstUserEmail,
    }),
  };
}

async function requestWejamAiJson(input: {
  apiKey: string;
  path: string;
  phase: WejamAiPhase;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  query?: URLSearchParams;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(buildWejamAiUrl(input), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
      },
      signal: timeout.signal,
    });
    payload = await readWejamAiPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Jam request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Jam request failed: ${error.message}` : "Jam request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createWejamAiError(response.status, payload, input.phase);
  }

  return payload;
}

function buildWejamAiUrl(input: { path: string; query?: URLSearchParams }): URL {
  const relativePath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(relativePath, `${wejamAiApiBaseUrl}/`);
  if (input.query) {
    url.search = input.query.toString();
  }
  return url;
}

function buildDataExportQuery(input: Record<string, unknown>): URLSearchParams | undefined {
  const query = new URLSearchParams(
    queryParams({
      page: readOptionalInteger(input.page, "page"),
      limit: readOptionalInteger(input.limit, "limit"),
    }),
  );
  return query.size > 0 ? query : undefined;
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return value as number;
}

async function readWejamAiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "invalid Jam JSON response");
  }
}

function createWejamAiError(status: number, payload: unknown, phase: WejamAiPhase): ProviderRequestError {
  const message = extractWejamAiErrorMessage(payload) ?? `Jam request failed with status ${status}`;

  if (phase === "validate" && status === 401) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status || 500, message);
}

function extractWejamAiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = record.message;
  if (Array.isArray(message)) {
    const joined = message.filter((item) => typeof item === "string" && item.trim()).join("; ");
    return joined || undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.detail);
}

function normalizeDataExportPayload(
  resource: string,
  payload: unknown,
): Record<string, unknown> & {
  data: Array<Record<string, unknown>>;
} {
  const body = requireProviderObject(payload, "Jam data-export response");
  const meta = requireProviderObject(body.meta, "Jam data-export response meta");

  return {
    resource,
    data: objectArray(body.data, "Jam data-export response data", (message) => new ProviderRequestError(502, message)),
    meta: {
      total: readRequiredNumber(meta, "total"),
      page: readRequiredNumber(meta, "page"),
      limit: readRequiredNumber(meta, "limit"),
      hasNext: readRequiredBoolean(meta, "hasNext"),
    },
  };
}

function readExportResource(value: unknown): string {
  if (typeof value === "string" && wejamAiExportResourceSet.has(value)) {
    return value;
  }

  throw new ProviderRequestError(400, "resource must be a supported Jam data-export resource");
}

function requireProviderObject(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }

  return record;
}

function readRequiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `Jam meta.${key} must be a number`);
  }
  return value;
}

function readRequiredBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `Jam meta.${key} must be a boolean`);
  }
  return value;
}
