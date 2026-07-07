import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";
import type { TapfiliateActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const tapfiliateApiBaseUrl: string = "https://api.tapfiliate.com/1.6";
const tapfiliateDefaultRequestTimeoutMs = 30_000;

type TapfiliatePhase = "validate" | "execute";
type TapfiliateActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface TapfiliateJsonResponse {
  payload: unknown;
  headers: Headers;
}

export const tapfiliateActionHandlers: Record<TapfiliateActionName, TapfiliateActionHandler> = {
  async list_affiliates(input, context) {
    const response = await requestTapfiliateJson({
      path: "/affiliates/",
      method: "GET",
      query: buildQuery(input, [
        "page",
        "click_id",
        "source_id",
        "email",
        "referral_code",
        "parent_id",
        "affiliate_group_id",
      ]),
      context,
      phase: "execute",
    });

    return {
      affiliates: requireArrayPayload(response.payload, "list_affiliates").map(normalizeAffiliate),
      pagination: normalizePagination(response.headers.get("link"), readPage(input.page)),
    };
  },

  async get_affiliate(input, context) {
    const affiliateId = requiredString(input.affiliate_id, "affiliate_id", requestInputError);
    const response = await requestTapfiliateJson({
      path: `/affiliates/${encodeURIComponent(affiliateId)}/`,
      method: "GET",
      query: {},
      context,
      phase: "execute",
    });

    return {
      affiliate: normalizeAffiliate(requireObjectPayload(response.payload, "get_affiliate")),
    };
  },

  async create_affiliate(input, context) {
    const response = await requestTapfiliateJson({
      path: "/affiliates/",
      method: "POST",
      query: {},
      body: pickDefined(input, ["firstname", "lastname", "email", "password", "company", "address", "custom_fields"], {
        trimObjectKeys: ["company", "address"],
      }),
      context,
      phase: "execute",
    });

    return {
      affiliate: normalizeAffiliate(requireObjectPayload(response.payload, "create_affiliate")),
    };
  },

  async list_conversions(input, context) {
    const response = await requestTapfiliateJson({
      path: "/conversions/",
      method: "GET",
      query: buildQuery(input, [
        "page",
        "program_id",
        "external_id",
        "affiliate_id",
        "pending",
        "date_from",
        "date_to",
        "use_profile_timezone",
      ]),
      context,
      phase: "execute",
    });

    return {
      conversions: requireArrayPayload(response.payload, "list_conversions").map(normalizeConversion),
      pagination: normalizePagination(response.headers.get("link"), readPage(input.page)),
    };
  },

  async create_conversion(input, context) {
    validateCreateConversionInput(input);
    const response = await requestTapfiliateJson({
      path: "/conversions/",
      method: "POST",
      query: buildQuery(input, ["override_max_cookie_time"]),
      body: pickDefined(
        input,
        [
          "referral_code",
          "tracking_id",
          "click_id",
          "coupon",
          "currency",
          "asset_id",
          "source_id",
          "external_id",
          "amount",
          "customer_id",
          "commission_type",
          "commissions",
          "meta_data",
          "program_group",
          "user_agent",
          "ip",
        ],
        { uppercaseKeys: ["currency"] },
      ),
      context,
      phase: "execute",
    });

    return {
      conversion: normalizeConversion(requireObjectPayload(response.payload, "create_conversion")),
    };
  },

  async list_commissions(input, context) {
    const response = await requestTapfiliateJson({
      path: "/commissions/",
      method: "GET",
      query: buildQuery(input, ["page", "affiliate_id", "status", "paid"], {
        numericBooleanKeys: ["paid"],
      }),
      context,
      phase: "execute",
    });

    return {
      commissions: requireArrayPayload(response.payload, "list_commissions").map(normalizeCommission),
      pagination: normalizePagination(response.headers.get("link"), readPage(input.page)),
    };
  },

  async list_programs(input, context) {
    const response = await requestTapfiliateJson({
      path: "/programs/",
      method: "GET",
      query: buildQuery(input, ["page", "asset_id"]),
      context,
      phase: "execute",
    });

    return {
      programs: requireArrayPayload(response.payload, "list_programs").map(normalizeProgram),
      pagination: normalizePagination(response.headers.get("link"), readPage(input.page)),
    };
  },

  async list_affiliate_groups(input, context) {
    const response = await requestTapfiliateJson({
      path: "/affiliate-groups/",
      method: "GET",
      query: buildQuery(input, ["page"]),
      context,
      phase: "execute",
    });

    return {
      affiliate_groups: requireArrayPayload(response.payload, "list_affiliate_groups").map(normalizeAffiliateGroup),
      pagination: normalizePagination(response.headers.get("link"), readPage(input.page)),
    };
  },

  async create_affiliate_group(input, context) {
    const response = await requestTapfiliateJson({
      path: "/affiliate-groups/",
      method: "POST",
      query: {},
      body: pickDefined(input, ["title"]),
      context,
      phase: "execute",
    });

    return {
      affiliate_group: normalizeAffiliateGroup(requireObjectPayload(response.payload, "create_affiliate_group")),
    };
  },

  async list_clicks(input, context) {
    const response = await requestTapfiliateJson({
      path: "/clicks/",
      method: "GET",
      query: buildQuery(input, ["page", "program_id", "affiliate_id", "date_from", "date_to"]),
      context,
      phase: "execute",
    });

    return {
      clicks: requireArrayPayload(response.payload, "list_clicks").map(normalizeClick),
      pagination: normalizePagination(response.headers.get("link"), readPage(input.page)),
    };
  },

  async create_click(input, context) {
    const response = await requestTapfiliateJson({
      path: "/clicks/",
      method: "POST",
      query: {},
      body: pickDefined(input, [
        "referral_code",
        "source_id",
        "meta_data",
        "referrer",
        "landing_page",
        "user_agent",
        "ip",
      ]),
      context,
      phase: "execute",
    });
    const payload = requireObjectPayload(response.payload, "create_click");

    return {
      click: {
        id: stringFromUnknown(payload.id),
        raw: payload,
      },
    };
  },
};

export async function validateTapfiliateCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const response = await requestTapfiliateJson({
    path: "/programs/",
    method: "GET",
    query: {},
    context: { apiKey, fetcher, signal },
    phase: "validate",
  });
  const programs = requireArrayPayload(response.payload, "validateCredential").map(normalizeProgram);
  const firstProgram = programs[0];

  return {
    profile: {
      accountId: "tapfiliate",
      displayName: "Tapfiliate API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: tapfiliateApiBaseUrl,
      validationEndpoint: "/programs/",
      programCount: programs.length,
      firstProgramId: firstProgram?.id,
      firstProgramTitle: firstProgram?.title ?? undefined,
    }),
  };
}

async function requestTapfiliateJson(input: {
  path: string;
  method: "GET" | "POST";
  query: Record<string, string>;
  body?: Record<string, unknown>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: TapfiliatePhase;
}): Promise<TapfiliateJsonResponse> {
  const timeout = createProviderTimeout(input.context.signal, tapfiliateDefaultRequestTimeoutMs);

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": providerUserAgent,
      "X-Api-Key": requiredString(input.context.apiKey, "apiKey", requestInputError),
    };
    const body = input.body === undefined ? undefined : JSON.stringify(input.body);
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await input.context.fetcher(buildTapfiliateUrl(input.path, input.query), {
      method: input.method,
      headers,
      body,
      signal: timeout.signal,
    });
    const payload = await readTapfiliatePayload(response);

    if (!response.ok) {
      throw createTapfiliateError(response.status, payload, input.phase);
    }
    if (typeof payload === "string") {
      throw new ProviderRequestError(502, "Tapfiliate returned invalid JSON", payload);
    }

    return { payload, headers: response.headers };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Tapfiliate request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Tapfiliate request failed: ${error.message}` : "Tapfiliate request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildTapfiliateUrl(path: string, query: Record<string, string>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${tapfiliateApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function buildQuery(
  input: Record<string, unknown>,
  keys: string[],
  options: { numericBooleanKeys?: string[] } = {},
): Record<string, string> {
  const query: Record<string, string> = {};
  const numericBooleanKeys = new Set(options.numericBooleanKeys ?? []);
  for (const key of keys) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    if (typeof value === "boolean") {
      query[key] = numericBooleanKeys.has(key) ? (value ? "1" : "0") : String(value);
      continue;
    }
    query[key] = typeof value === "string" ? value.trim() : String(value);
  }
  return query;
}

function pickDefined(
  input: Record<string, unknown>,
  keys: string[],
  options: { uppercaseKeys?: string[]; trimObjectKeys?: string[] } = {},
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const uppercaseKeys = new Set(options.uppercaseKeys ?? []);
  const trimObjectKeys = new Set(options.trimObjectKeys ?? []);
  for (const key of keys) {
    if (input[key] === undefined) {
      continue;
    }
    if (typeof input[key] === "string") {
      const text = input[key].trim();
      output[key] = uppercaseKeys.has(key) ? text.toUpperCase() : text;
      continue;
    }
    output[key] = trimObjectKeys.has(key) ? trimObjectStrings(input[key]) : input[key];
  }
  return output;
}

function trimObjectStrings(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => trimObjectStrings(item));
  }
  const record = optionalRecord(value);
  if (!record) {
    return typeof value === "string" ? value.trim() : value;
  }
  return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, trimObjectStrings(child)]));
}

async function readTapfiliatePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function requireArrayPayload(payload: unknown, actionName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `Tapfiliate ${actionName} response is not an array`, payload);
  }
  return payload.map((item) => requireObjectPayload(item, actionName));
}

function requireObjectPayload(payload: unknown, actionName: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `Tapfiliate ${actionName} response is not an object`, payload);
  }
  return object;
}

function normalizeAffiliate(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: stringFromUnknown(item.id),
    firstname: stringOrNull(item.firstname),
    lastname: stringOrNull(item.lastname),
    email: stringOrNull(item.email),
    company: objectOrNull(item.company),
    address: objectOrNull(item.address),
    meta_data: objectOrNull(item.meta_data),
    parent_id: stringOrNull(item.parent_id),
    affiliate_group_id: stringOrNull(item.affiliate_group_id),
    created_at: stringOrNull(item.created_at),
    promoted_at: stringOrNull(item.promoted_at),
    promotion_method: stringOrNull(item.promotion_method),
    custom_fields: objectOrNull(item.custom_fields),
    raw: item,
  };
}

function normalizeConversion(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: numberOrNull(item.id),
    external_id: stringOrNull(item.external_id),
    amount: numberOrNull(item.amount),
    click: objectOrNull(item.click),
    commissions: Array.isArray(item.commissions)
      ? item.commissions.map((commission) => requireObjectPayload(commission, "conversion commission"))
      : [],
    program: objectOrNull(item.program),
    affiliate: objectOrNull(item.affiliate),
    customer: objectOrNull(item.customer),
    meta_data: objectOrNull(item.meta_data),
    affiliate_meta_data: item.affiliate_meta_data ?? null,
    created_at: stringOrNull(item.created_at),
    warnings: item.warnings ?? null,
    raw: item,
  };
}

function normalizeCommission(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: numberOrNull(item.id),
    amount: numberOrNull(item.amount),
    approved: booleanOrNull(item.approved),
    created_at: stringOrNull(item.created_at),
    commission_type: stringOrNull(item.commission_type),
    commission_name: stringOrNull(item.commission_name),
    kind: stringOrNull(item.kind),
    currency: stringOrNull(item.currency),
    conversion: objectOrNull(item.conversion),
    affiliate: objectOrNull(item.affiliate),
    payout: item.payout ?? null,
    comment: stringOrNull(item.comment),
    final: item.final ?? null,
    finalization_date: stringOrNull(item.finalization_date),
    raw: item,
  };
}

function normalizeProgram(
  item: Record<string, unknown>,
): Record<string, unknown> & { id: string; title: string | null } {
  return {
    id: stringFromUnknown(item.id),
    title: stringOrNull(item.title),
    currency: stringOrNull(item.currency),
    cookie_time: numberOrNull(item.cookie_time),
    default_landing_page_url: stringOrNull(item.default_landing_page_url),
    recurring: booleanOrNull(item.recurring),
    recurring_cap: numberOrNull(item.recurring_cap),
    recurring_period_days: numberOrNull(item.recurring_period_days),
    program_category: objectOrNull(item.program_category),
    currency_symbol: stringOrNull(item.currency_symbol),
    raw: item,
  };
}

function normalizeAffiliateGroup(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: stringFromUnknown(item.id),
    title: stringOrNull(item.title),
    affiliate_count: numberOrNull(item.affiliate_count),
    raw: item,
  };
}

function normalizeClick(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: stringFromUnknown(item.id),
    created_at: stringOrNull(item.created_at),
    meta_data: item.meta_data ?? null,
    details: objectOrNull(item.details),
    geolocation: objectOrNull(item.geolocation),
    raw: item,
  };
}

function normalizePagination(linkHeader: string | null, currentPage: number): Record<string, unknown> {
  const pagination = {
    current_page: currentPage,
    next_page: null as number | null,
    previous_page: null as number | null,
    first_page: null as number | null,
    last_page: null as number | null,
    link_header: linkHeader,
  };
  if (!linkHeader) {
    return pagination;
  }

  for (const part of linkHeader.split(",")) {
    const [urlPart, ...parameterParts] = part.split(";");
    if (!urlPart) {
      continue;
    }
    const hrefStart = urlPart.indexOf("<");
    const hrefEnd = urlPart.indexOf(">");
    if (hrefStart < 0 || hrefEnd <= hrefStart) {
      continue;
    }

    const href = urlPart.slice(hrefStart + 1, hrefEnd);
    const relPart = parameterParts.find((parameter) => parameter.trim().startsWith("rel="));
    if (!relPart) {
      continue;
    }

    const rel = relPart.split("=")[1]?.trim().replaceAll('"', "");
    const page = readPageFromUrl(href);
    if (!rel || page === null) {
      continue;
    }

    if (rel === "next") {
      pagination.next_page = page;
    } else if (rel === "prev") {
      pagination.previous_page = page;
    } else if (rel === "first") {
      pagination.first_page = page;
    } else if (rel === "last") {
      pagination.last_page = page;
    }
  }

  return pagination;
}

function validateCreateConversionInput(input: Record<string, unknown>): void {
  const hasDirectMatcher = ["referral_code", "customer_id", "click_id", "coupon", "tracking_id"].some(
    (key) => typeof input[key] === "string" && input[key].trim() !== "",
  );
  const hasAssetSourcePair =
    typeof input.asset_id === "string" &&
    input.asset_id.trim() !== "" &&
    typeof input.source_id === "string" &&
    input.source_id.trim() !== "";

  if (!hasDirectMatcher && !hasAssetSourcePair) {
    throw new ProviderRequestError(
      400,
      "create_conversion requires referral_code, customer_id, click_id, coupon, tracking_id, or both asset_id and source_id",
    );
  }
  if (input.asset_id !== undefined && optionalString(input.source_id) === undefined) {
    throw new ProviderRequestError(400, "source_id is required when asset_id is provided");
  }
  if (input.source_id !== undefined && optionalString(input.asset_id) === undefined && !hasDirectMatcher) {
    throw new ProviderRequestError(400, "asset_id is required when source_id is the only conversion matcher");
  }
}

function readPageFromUrl(href: string): number | null {
  try {
    const page = Number(new URL(href).searchParams.get("page"));
    return Number.isInteger(page) && page > 0 ? page : null;
  } catch {
    return null;
  }
}

function readPage(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 1;
}

function stringFromUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return optionalRecord(value) ?? null;
}

function createTapfiliateError(status: number, payload: unknown, phase: TapfiliatePhase): ProviderRequestError {
  const message = extractTapfiliateErrorMessage(payload) ?? `Tapfiliate request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractTapfiliateErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const text = payload.trim();
    return text || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
  if (message) {
    return message;
  }

  if (Array.isArray(record.errors) && typeof record.errors[0] === "string") {
    return record.errors[0];
  }
  return undefined;
}

function requestInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
