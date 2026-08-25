import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "lumos";
const lumosApiBaseUrl = "https://api.lumos.com";
const lumosDefaultPage = 1;
const lumosDefaultPageSize = 50;

type LumosRequestPhase = "validate" | "execute";
type LumosActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const lumosActionHandlers: ProviderActionHandlers<"lumos", LumosActionHandler> = {
  async list_appstore_apps(input, context) {
    const payload = await requestLumosJson({
      apiKey: context.apiKey,
      path: "/appstore/apps",
      query: buildLumosQuery(input, [
        "app_id",
        "name_search",
        "exact_match",
        "all_visibilities",
        "expand",
        "page",
        "size",
      ]),
      context,
      phase: "execute",
    });
    return normalizePagedOutput(payload, "apps");
  },
  async get_appstore_app(input, context) {
    const payload = await requestLumosJson({
      apiKey: context.apiKey,
      path: `/appstore/apps/${encodeURIComponent(String(input.app_id))}`,
      query: buildLumosQuery(input, ["expand"], { includePaginationDefaults: false }),
      context,
      phase: "execute",
    });
    return { app: readObject(payload, "Lumos app response") };
  },
  async list_access_requests(input, context) {
    const payload = await requestLumosJson({
      apiKey: context.apiKey,
      path: "/appstore/access_requests",
      query: buildLumosQuery(input, [
        "target_user_id",
        "requester_user_id",
        "user_id",
        "statuses",
        "sort",
        "expand",
        "page",
        "size",
      ]),
      context,
      phase: "execute",
    });
    return normalizePagedOutput(payload, "accessRequests");
  },
  async get_access_request(input, context) {
    const payload = await requestLumosJson({
      apiKey: context.apiKey,
      path: `/appstore/access_requests/${encodeURIComponent(String(input.id))}`,
      query: buildLumosQuery(input, ["expand"], { includePaginationDefaults: false }),
      context,
      phase: "execute",
    });
    return { accessRequest: readObject(payload, "Lumos access request response") };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, lumosActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateLumosCredential(input.apiKey, fetcher, signal);
  },
};

async function validateLumosCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestLumosJson({
    apiKey,
    path: "/appstore/apps",
    query: buildLumosQuery({ page: lumosDefaultPage, size: 1 }, ["page", "size"]),
    context: { fetcher, signal },
    phase: "validate",
  });
  const response = readObject(payload, "Lumos validation response");

  return {
    profile: {
      accountId: "api_key",
      displayName: "Lumos API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: lumosApiBaseUrl,
      validationEndpoint: "/appstore/apps?page=1&size=1",
      appCount: readPageTotal(response),
    }),
  };
}

async function requestLumosJson(input: {
  apiKey: string;
  path: string;
  query?: URLSearchParams;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: LumosRequestPhase;
}): Promise<unknown> {
  const url = new URL(input.path, lumosApiBaseUrl);
  for (const [key, value] of input.query ?? []) {
    url.searchParams.append(key, value);
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: lumosHeaders(input.apiKey),
      signal: input.context.signal,
    });
    payload = await readLumosPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Lumos request failed: ${error.message}` : "Lumos request failed",
    );
  }

  if (!response.ok) {
    throw createLumosError(response, payload, input.phase);
  }

  return payload;
}

function buildLumosQuery(
  input: Record<string, unknown>,
  keys: readonly string[],
  options: { includePaginationDefaults?: boolean } = {},
): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of keys) {
    const value = input[key];
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, String(item));
      }
      continue;
    }
    query.set(key, String(value));
  }

  if (options.includePaginationDefaults === false) {
    return query;
  }
  if (!query.has("page")) {
    query.set("page", String(lumosDefaultPage));
  }
  if (!query.has("size")) {
    query.set("size", String(lumosDefaultPageSize));
  }
  return query;
}

function normalizePagedOutput(payload: unknown, outputKey: "apps" | "accessRequests"): Record<string, unknown> {
  const response = readObject(payload, "Lumos page response");
  return {
    [outputKey]: readPageItems(payload),
    page: optionalInteger(response.page) ?? lumosDefaultPage,
    size: optionalInteger(response.size) ?? lumosDefaultPageSize,
    total: readPageTotal(response),
    raw: response,
  };
}

function readPageItems(payload: unknown): Array<Record<string, unknown>> {
  const response = readObject(payload, "Lumos page response");
  for (const key of ["items", "data", "results"]) {
    const value = response[key];
    if (Array.isArray(value)) {
      return value.map((item) => readObject(item, `Lumos ${key} item`));
    }
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => readObject(item, "Lumos page item"));
  }
  return [];
}

function readPageTotal(response: Record<string, unknown>): number | null {
  for (const key of ["total", "total_items", "count"]) {
    const value = optionalInteger(response[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return null;
}

function lumosHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function readLumosPayload(response: Response): Promise<unknown> {
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

function createLumosError(response: Response, payload: unknown, phase: LumosRequestPhase): ProviderRequestError {
  const message = readLumosErrorMessage(payload) ?? response.statusText ?? "Lumos request failed";
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function readLumosErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.detail) ?? optionalString(record.message) ?? optionalString(record.error);
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  try {
    return requiredRecord(value, label, (message) => new ProviderRequestError(502, message));
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
}
