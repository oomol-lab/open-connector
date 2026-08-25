import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const slickdealsApiBaseUrl = "https://api-syn.slickdeals.net/sdapi/syndication/1";
const slickdealsRequestTimeoutMs = 30_000;

type SlickdealsPhase = "validate" | "execute";
type QueryValue = string | number | boolean | readonly number[] | undefined;
type SlickdealsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const slickdealsActionHandlers: ProviderActionHandlers<"slickdeals", SlickdealsActionHandler> = {
  async list_articles(input, { apiKey: token, fetcher, signal }) {
    const payload = await requestSlickdealsJson({
      path: "/articles",
      query: buildCommonListQuery(input, {
        sortBy: input.sortBy,
        storeId: input.storeId,
      }),
      token,
      fetcher,
      signal,
      phase: "execute",
    });
    return normalizePaginatedCollection(payload, "articles", input, 25);
  },
  async list_brands(_input, { apiKey: token, fetcher, signal }) {
    const payload = await requestSlickdealsJson({
      path: "/brands",
      query: {},
      token,
      fetcher,
      signal,
      phase: "execute",
    });
    return {
      brands: readObjectCollection(payload, ["brands", "categories"], "brands"),
    };
  },
  async list_categories(_input, { apiKey: token, fetcher, signal }) {
    const payload = await requestSlickdealsJson({
      path: "/categories",
      query: {},
      token,
      fetcher,
      signal,
      phase: "execute",
    });
    return {
      categories: readObjectCollection(payload, ["categories"], "categories"),
    };
  },
  async list_coupons(input, { apiKey: token, fetcher, signal }) {
    const payload = await requestSlickdealsJson({
      path: "/coupons",
      query: buildCommonListQuery(input, {
        categoryId: input.categoryId,
        storeId: input.storeId,
        type: input.type,
        monetizedOnly: input.monetizedOnly,
        sortBy: input.sortBy,
        country: input.country,
        sitewide: input.sitewide,
      }),
      token,
      fetcher,
      signal,
      phase: "execute",
    });
    return normalizePaginatedCollection(payload, "coupons", input, 25);
  },
  async list_deals(input, { apiKey: token, fetcher, signal }) {
    const payload = await requestSlickdealsJson({
      path: "/deals",
      query: buildCommonListQuery(input, {
        "includeStoreIds[]": input.includeStoreIds,
        "includeCategoryIds[]": input.includeCategoryIds,
        "includeBrandIds[]": input.includeBrandIds,
        type: input.type,
        createdAfter: input.createdAfter,
      }),
      token,
      fetcher,
      signal,
      phase: "execute",
    });
    return normalizePaginatedCollection(payload, "deals", input, 20);
  },
  async list_stores(input, { apiKey: token, fetcher, signal }) {
    if (input.storeName !== undefined && input.monetizedOnly !== undefined) {
      throw new ProviderRequestError(400, "storeName and monetizedOnly cannot be used together");
    }
    const payload = await requestSlickdealsJson({
      path: "/stores",
      query: {
        storeName: input.storeName as string | undefined,
        monetizedOnly: input.monetizedOnly as boolean | undefined,
        country: input.country as string | undefined,
        page: input.page as number | undefined,
        perPage: input.perPage as number | undefined,
      },
      token,
      fetcher,
      signal,
      phase: "execute",
    });
    return normalizePaginatedCollection(payload, "stores", input, 25);
  },
  async list_types(_input, { apiKey: token, fetcher, signal }) {
    const payload = await requestSlickdealsJson({
      path: "/types",
      query: {},
      token,
      fetcher,
      signal,
      phase: "execute",
    });
    return normalizeTypes(payload);
  },
};

export async function validateSlickdealsCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestSlickdealsJson({
    path: "/types",
    query: {},
    token: apiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  const types = normalizeTypes(payload);

  return {
    profile: { accountId: "slickdeals-syndication", displayName: "Slickdeals Syndication" },
    metadata: {
      apiBaseUrl: slickdealsApiBaseUrl,
      validationEndpoint: "/types",
      couponTypeCount: types.couponTypes.length,
      dealTypeCount: types.dealTypes.length,
    },
  };
}

function buildCommonListQuery(
  input: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, QueryValue> {
  return {
    ...toQueryRecord(extra),
    sortOrder: input.sortOrder as string | undefined,
    expired: input.expired as boolean | undefined,
    page: input.page as number | undefined,
    perPage: input.perPage as number | undefined,
    utmCampaign: input.utmCampaign as string | undefined,
  };
}

function toQueryRecord(input: Record<string, unknown>): Record<string, QueryValue> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value as QueryValue]));
}

async function requestSlickdealsJson(input: {
  path: string;
  query: Record<string, QueryValue>;
  token: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: SlickdealsPhase;
}) {
  const timeoutSignal = AbortSignal.timeout(slickdealsRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
  try {
    const response = await input.fetcher(buildSlickdealsUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.token}`,
        "user-agent": providerUserAgent,
      },
      redirect: "error",
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw mapSlickdealsError(response.status, payload, input.phase);
    }
    if (typeof payload !== "object" || payload === null) {
      throw new ProviderRequestError(502, "Slickdeals returned invalid JSON");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted || isAbortError(error)) {
      throw new ProviderRequestError(504, "Slickdeals request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Slickdeals request failed: ${error.message}` : "Slickdeals request failed",
    );
  }
}

function buildSlickdealsUrl(path: string, query: Record<string, QueryValue>) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${slickdealsApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Slickdeals returned invalid JSON");
    }
    return text;
  }
}

function mapSlickdealsError(status: number, payload: unknown, phase: SlickdealsPhase) {
  const message = readErrorMessage(payload) ?? `Slickdeals API request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 400 || status === 422) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function readErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    const message = payload.trim();
    return message && !message.startsWith("<!DOCTYPE html") ? message.slice(0, 500) : undefined;
  }
  const record = optionalRecord(payload);
  return (
    optionalString(record?.detail) ??
    optionalString(record?.summary) ??
    optionalString(record?.message) ??
    optionalString(record?.error)
  );
}

function normalizePaginatedCollection(
  payload: unknown,
  field: string,
  input: Record<string, unknown>,
  defaultPerPage: number,
): Record<string, unknown> {
  const record = requireRecord(payload, "response");
  return {
    [field]: readObjectCollection(record, [field], field),
    pagination: {
      page: optionalInteger(record.page) ?? optionalInteger(input.page) ?? 1,
      perPage: optionalInteger(record.perPage) ?? optionalInteger(input.perPage) ?? defaultPerPage,
    },
  };
}

function normalizeTypes(payload: unknown) {
  const record = requireRecord(payload, "types response");
  return {
    couponTypes: readStringCollection(record.couponTypes, "couponTypes"),
    dealTypes: readStringCollection(record.dealTypes, "dealTypes"),
  };
}

function readObjectCollection(payload: unknown, fields: string[], label: string) {
  if (Array.isArray(payload)) {
    return requireObjectArray(payload, label);
  }
  const record = requireRecord(payload, `${label} response`);
  for (const field of fields) {
    if (Array.isArray(record[field])) {
      return requireObjectArray(record[field], label);
    }
  }
  throw new ProviderRequestError(502, `Slickdeals response is missing ${label} collection`);
}

function requireObjectArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => optionalRecord(item) === undefined)) {
    throw new ProviderRequestError(502, `Slickdeals response field ${field} is not an object array`);
  }
  return value as Record<string, unknown>[];
}

function readStringCollection(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ProviderRequestError(502, `Slickdeals response field ${field} is not a string array`);
  }
  return value as string[];
}

function requireRecord(value: unknown, label: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Slickdeals ${label} is not an object`);
  }
  return record;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
