import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { providerResponseError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const workiomApiBaseUrl = "https://api.workiom.com";
const workiomApiPathPrefix = "/api/services/app";

type WorkiomRequestPhase = "validate" | "execute";

interface WorkiomRequestInput {
  path: string;
  method?: "GET" | "POST";
  apiKey: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}

export const workiomActionHandlers: ProviderActionHandlers<"workiom", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_apps(_input, context): Promise<unknown> {
    const raw = await requestWorkiom({ path: "/Apps/GetAll", apiKey: context.apiKey }, context);
    return {
      apps: readArrayFromPayload(raw, ["items", "result.items", "result"]),
      raw,
    };
  },
  async list_lists(input, context): Promise<unknown> {
    const raw = await requestWorkiom(
      {
        path: "/Lists/GetAll",
        apiKey: context.apiKey,
        query: { appId: readRequiredString(input, "appId") },
      },
      context,
    );
    return {
      lists: readArrayFromPayload(raw, ["lists", "items", "result.lists", "result.items", "result"]),
      totalCount: readOptionalIntegerPath(raw, ["totalCount", "total_count", "result.totalCount"]),
      raw,
    };
  },
  async get_list_metadata(input, context): Promise<unknown> {
    const raw = await requestWorkiom(
      {
        path: "/Lists/Get",
        apiKey: context.apiKey,
        query: compactObject({
          id: readRequiredString(input, "listId"),
          expand: readOptionalArray(input.expand)?.join(","),
        }),
      },
      context,
    );
    return {
      list: readObjectFromPayload(raw, ["result"], raw),
      raw,
    };
  },
  async list_records(input, context): Promise<unknown> {
    const raw = await requestWorkiom(
      {
        path: "/Data/All",
        method: "POST",
        apiKey: context.apiKey,
        body: compactObject({
          listId: readRequiredString(input, "listId"),
          filters: readOptionalArray(input.filters),
          sorting: optionalString(input.sorting),
          skipCount: optionalInteger(input.skipCount),
          maxResultCount: optionalInteger(input.maxResultCount),
        }),
      },
      context,
    );
    return {
      records: readArrayFromPayload(raw, ["items", "result.items"]),
      totalCount: readOptionalIntegerPath(raw, ["totalCount", "result.totalCount"]),
      summary: readOptionalObjectPath(raw, ["summary", "result.summary"]),
      raw,
    };
  },
  async create_record(input, context): Promise<unknown> {
    const raw = await requestWorkiom(
      {
        path: "/Data/Create",
        method: "POST",
        apiKey: context.apiKey,
        query: { listId: readRequiredString(input, "listId") },
        body: requiredRecord(input.record, "record", providerResponseError),
      },
      context,
    );
    return {
      record: readObjectFromPayload(raw, ["result"], raw),
      raw,
    };
  },
};

export async function validateWorkiomCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const raw = await requestWorkiom({ path: "/Apps/GetAll", apiKey }, { apiKey, fetcher, signal }, "validate");
  const apps = readArrayFromPayload(raw, ["items", "result.items", "result"]);
  const firstApp = apps[0];
  return {
    profile: {
      accountId: "workiom_api_key",
      displayName: "Workiom API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: workiomApiBaseUrl,
      validationEndpoint: "/Apps/GetAll",
      appCount: apps.length,
      firstAppId: optionalString(firstApp?.id),
      firstAppName: optionalString(firstApp?.name),
    }),
  };
}

async function requestWorkiom(
  input: WorkiomRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: WorkiomRequestPhase = "execute",
): Promise<Record<string, unknown>> {
  const url = new URL(`${workiomApiPathPrefix}${input.path}`, workiomApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  const body = input.body ? JSON.stringify(input.body) : undefined;
  try {
    response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-Api-Key": input.apiKey,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body,
      signal: context.signal,
    });
    payload = await readWorkiomPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Workiom request failed: ${error.message}` : "Workiom request failed",
    );
  }

  const record = optionalRecord(payload);
  const isLogicalFailure = record?.success === false || record?.unAuthorizedRequest === true;
  if (!response.ok || isLogicalFailure) {
    throw createWorkiomError(response, payload, phase);
  }
  return readObjectFromPayload(payload, [], payload);
}

async function readWorkiomPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { value: text };
  }
}

function createWorkiomError(response: Response, payload: unknown, phase: WorkiomRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  const message =
    optionalString(error?.message) ??
    optionalString(error?.details) ??
    optionalString(record?.message) ??
    response.statusText ??
    `Workiom request failed with ${response.status}`;

  if (response.status === 429) return new ProviderRequestError(429, message);
  if (response.status === 401 || response.status === 403 || record?.unAuthorizedRequest === true) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (response.status >= 400 && response.status < 500) return new ProviderRequestError(400, message);
  return new ProviderRequestError(response.status || 500, message);
}

function readArrayFromPayload(payload: unknown, paths: string[]): Array<Record<string, unknown>> {
  for (const path of paths) {
    const value = readPath(payload, path);
    if (Array.isArray(value)) {
      return value.map((item) => requiredRecord(item, path, providerResponseError));
    }
  }
  return [];
}

function readObjectFromPayload(payload: unknown, paths: string[], fallback: unknown): Record<string, unknown> {
  for (const path of paths) {
    const value = readPath(payload, path);
    const record = optionalRecord(value);
    if (record) return record;
  }
  return requiredRecord(fallback, "payload", providerResponseError);
}

function readPath(payload: unknown, path: string): unknown {
  if (!path) return payload;
  let current = payload;
  for (const part of path.split(".")) {
    const record = optionalRecord(current);
    if (!record) return undefined;
    current = record[part];
  }
  return current;
}

function readOptionalObjectPath(payload: unknown, paths: string[]): Record<string, unknown> | null {
  for (const path of paths) {
    const value = optionalRecord(readPath(payload, path));
    if (value) return value;
  }
  return null;
}

function readOptionalIntegerPath(payload: unknown, paths: string[]): number | null {
  for (const path of paths) {
    const value = optionalInteger(readPath(payload, path));
    if (value !== undefined) return value;
  }
  return null;
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) throw new ProviderRequestError(400, `${key} is required`);
  return value;
}

function readOptionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}
