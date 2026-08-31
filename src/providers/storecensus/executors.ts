import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "storecensus";
const storecensusApiBaseUrl = "https://www.storecensus.com/api/v1";
const storecensusValidationPath = "/app-categories";

type StorecensusPhase = "validate" | "execute";
type StorecensusActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const storecensusActionHandlers: ProviderActionHandlers<"storecensus", StorecensusActionHandler> = {
  async get_website(input, context) {
    const payload = await requestStorecensusJson({
      context,
      method: "GET",
      path: `/website/${encodeURIComponent(requiredString(input.domain, "domain", providerInputError))}`,
      query: buildQueryParams(input, [["sections", formatCommaSeparatedArray]]),
      phase: "execute",
    });

    return {
      website: requireProviderObject(payload, "StoreCensus website response"),
    };
  },
  async search_stores(input, context) {
    const payload = await requestStorecensusJson({
      context,
      method: "POST",
      path: "/stores",
      body: buildSearchStoresBody(input),
      phase: "execute",
    });
    const body = requireProviderObject(payload, "StoreCensus stores search response");

    return {
      stores: requireObjectArrayPayload(body.data, "StoreCensus stores search response data"),
      pagination: requireProviderObject(body.pagination, "StoreCensus stores search response pagination"),
      filters: optionalRecord(body.filters) ?? {},
      sort: optionalRecord(body.sort) ?? {},
      sections: Array.isArray(body.sections) ? body.sections : [],
    };
  },
  async list_apps(input, context) {
    const payload = await requestStorecensusJson({
      context,
      method: "GET",
      path: "/apps",
      query: buildQueryParams(input, ["page", "pageSize", "app_id", "minRating", "search", "categoryId"]),
      phase: "execute",
    });
    const body = requireProviderObject(payload, "StoreCensus apps list response");

    return {
      apps: requireObjectArrayPayload(body.data, "StoreCensus apps list response data"),
      pagination: requireProviderObject(body.pagination, "StoreCensus apps list response pagination"),
      filters: optionalRecord(body.filters) ?? {},
    };
  },
  async list_app_categories(_input, context) {
    const payload = await requestStorecensusJson({
      context,
      method: "GET",
      path: "/app-categories",
      phase: "execute",
    });
    return normalizeAppCategoriesPayload(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, storecensusActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestStorecensusJson({
      context: { apiKey: input.apiKey, fetcher, signal },
      method: "GET",
      path: storecensusValidationPath,
      phase: "validate",
    });
    const body = normalizeAppCategoriesPayload(payload);
    const firstCategoryName = optionalString(body.categories[0]?.name);

    return {
      profile: {
        accountId: "storecensus:api-key",
        displayName: firstCategoryName ? `StoreCensus (${firstCategoryName})` : "StoreCensus API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: storecensusApiBaseUrl,
        validationEndpoint: storecensusValidationPath,
        sampleCategory: firstCategoryName ?? null,
      },
    };
  },
};

async function requestStorecensusJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  method: "GET" | "POST";
  path: string;
  phase: StorecensusPhase;
  query?: URLSearchParams;
  body?: unknown;
}): Promise<unknown> {
  return runProviderRequest({ signal: input.context.signal, label: "StoreCensus" }, async (signal) => {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${input.context.apiKey}`,
      "user-agent": providerUserAgent,
    };
    let body: BodyInit | undefined;
    if (input.method === "POST") {
      headers["content-type"] = "application/json";
      body = JSON.stringify(input.body ?? {});
    }

    const response = await input.context.fetcher(buildStorecensusUrl(input.path, input.query), {
      method: input.method,
      headers,
      body,
      signal,
    });
    const payload = await readStorecensusPayload(response);

    if (!response.ok) {
      throw createStorecensusError(response.status, payload, input.phase);
    }

    return payload;
  });
}

function buildStorecensusUrl(path: string, query?: URLSearchParams): string {
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(relativePath, `${storecensusApiBaseUrl}/`);
  if (query) {
    url.search = query.toString();
  }
  return url.toString();
}

function buildSearchStoresBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of ["filters", "sort", "pageSize", "cursor", "sections"]) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== "") {
      body[key] = value;
    }
  }
  return body;
}

function buildQueryParams(
  input: Record<string, unknown>,
  allowed: readonly (string | readonly [string, (value: unknown) => string | undefined])[],
): URLSearchParams | undefined {
  const query = new URLSearchParams();

  for (const field of allowed) {
    const inputKey = typeof field === "string" ? field : field[0];
    const formatter = typeof field === "string" ? formatScalarQueryParam : field[1];
    const formatted = formatter(input[inputKey]);
    if (formatted) {
      query.set(inputKey, formatted);
    }
  }

  return query.size > 0 ? query : undefined;
}

function formatScalarQueryParam(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return String(value);
}

function formatCommaSeparatedArray(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  return value.map((item) => String(item)).join(",");
}

async function readStorecensusPayload(response: Response): Promise<unknown> {
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
    throw new ProviderRequestError(502, "invalid StoreCensus JSON response");
  }
}

function createStorecensusError(status: number, payload: unknown, phase: StorecensusPhase): ProviderRequestError {
  const message = extractStorecensusErrorMessage(payload) ?? `StoreCensus request failed with status ${status}`;
  if (phase === "validate" && status === 401) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractStorecensusErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.detail);
}

function normalizeAppCategoriesPayload(payload: unknown): {
  categories: Array<Record<string, unknown>>;
  total: number;
} {
  const body = requireProviderObject(payload, "StoreCensus app categories response");
  const categories = requireObjectArrayPayload(body.data, "StoreCensus app categories response data");
  return {
    categories,
    total: Number.isInteger(body.total) ? (body.total as number) : categories.length,
  };
}

function requireProviderObject(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }

  return record;
}

function requireObjectArrayPayload(payload: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }

  return payload.map((item) => requireProviderObject(item, `${label} item`));
}
