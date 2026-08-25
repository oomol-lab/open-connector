import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalIntegerLike,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const partnerStackPartnerApiBaseUrl = "https://api.partnerstack.com/api/v2/";
const partnerStackPartnerValidationPath = "/api/v2/marketplace/programs";

type PartnerStackPartnerContext = ApiKeyProviderContext;
type PartnerStackPartnerActionHandler = (
  input: Record<string, unknown>,
  context: PartnerStackPartnerContext,
) => Promise<unknown>;

export const partnerStackPartnerActionHandlers: ProviderActionHandlers<
  "partner_stack_partner",
  PartnerStackPartnerActionHandler
> = {
  list_marketplace_programs(input, context) {
    return listMarketplacePrograms(input, context);
  },
  get_marketplace_program(input, context) {
    return getMarketplaceProgram(input, context);
  },
  list_partnerships(input, context) {
    return listPartnerships(input, context);
  },
  list_rewards(input, context) {
    return listRewards(input, context);
  },
  list_payouts(input, context) {
    return listPayouts(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "partner_stack_partner",
  partnerStackPartnerActionHandlers,
);

export async function validatePartnerStackPartnerCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestPartnerStackJson(
    buildPath(
      "marketplace/programs",
      compactObject({
        limit: 1,
      }),
    ),
    { apiKey, fetcher },
    "validate",
  );
  const response = normalizeEnvelope(payload, "PartnerStack marketplace programs page");
  const page = normalizeListData(response.data, "PartnerStack marketplace programs page");
  const firstProgram = page.items[0];
  const programName = firstProgram ? optionalString(firstProgram.name) : undefined;
  const programKey = firstProgram ? optionalString(firstProgram.key) : undefined;

  return {
    profile: {
      accountId: programKey ?? "partnerstack-partner-api-key",
      displayName: programName ?? programKey ?? "PartnerStack Partner Account",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: partnerStackPartnerApiBaseUrl,
      validationEndpoint: partnerStackPartnerValidationPath,
      programKey,
      programName,
    }),
  };
}

async function listMarketplacePrograms(input: Record<string, unknown>, context: PartnerStackPartnerContext) {
  const payload = await requestPartnerStackJson(
    buildPath(
      "marketplace/programs",
      compactObject({
        min_created: optionalIntegerLike(input.min_created, "min_created", providerInputError),
        max_created: optionalIntegerLike(input.max_created, "max_created", providerInputError),
        category: optionalString(input.category),
        ...paginationQuery(input),
      }),
    ),
    context,
    "execute",
  );
  const response = normalizeEnvelope(payload, "PartnerStack marketplace programs page");
  const page = normalizeListData(response.data, "PartnerStack marketplace programs page");
  return {
    programs: page.items.map(normalizeMarketplaceProgram),
    page: {
      has_more: page.has_more,
    },
    ...responseMetadata(response),
  };
}

async function getMarketplaceProgram(input: Record<string, unknown>, context: PartnerStackPartnerContext) {
  const companyKey = requiredString(input.company_key, "company_key", providerInputError);
  const payload = await requestPartnerStackJson(
    `marketplace/programs/${encodeURIComponent(companyKey)}`,
    context,
    "execute",
  );
  const response = normalizeEnvelope(payload, "PartnerStack marketplace program");
  return {
    program: normalizeMarketplaceProgram(response.data),
    ...responseMetadata(response),
  };
}

async function listPartnerships(input: Record<string, unknown>, context: PartnerStackPartnerContext) {
  const payload = await requestPartnerStackJson(
    buildPath(
      "partnerships",
      compactObject({
        order_by: optionalString(input.order_by),
        has_sub_id: optionalString(input.has_sub_id),
        include_offers: optionalBoolean(input.include_offers),
        include_archived: optionalBoolean(input.include_archived),
        ...paginationQuery(input),
      }),
    ),
    context,
    "execute",
  );
  const response = normalizeEnvelope(payload, "PartnerStack partnerships page");
  const page = normalizeListData(response.data, "PartnerStack partnerships page");
  return {
    partnerships: page.items.map(normalizePartnership),
    page: {
      has_more: page.has_more,
    },
    ...responseMetadata(response),
  };
}

async function listRewards(input: Record<string, unknown>, context: PartnerStackPartnerContext) {
  const payload = await requestPartnerStackJson(
    buildPath(
      "rewards",
      compactObject({
        company_key: optionalString(input.company_key),
        payment_status: optionalString(input.payment_status),
        max_created: optionalIntegerLike(input.max_created, "max_created", providerInputError),
        min_created: optionalIntegerLike(input.min_created, "min_created", providerInputError),
        order_by: optionalString(input.order_by),
        group_key: optionalString(input.group_key),
        customer_key: optionalString(input.customer_key),
        invoice_key: optionalString(input.invoice_key),
        status: optionalString(input.status),
        exclude_drip_rewards: optionalString(input.exclude_drip_rewards),
        hide_archived_rewards: optionalBoolean(input.hide_archived_rewards),
        empty_line_id: optionalBoolean(input.empty_line_id),
        keywords: optionalString(input.keywords),
        description: optionalString(input.description),
        distinct_description: optionalBoolean(input.distinct_description),
        distinct_decline_reason: optionalBoolean(input.distinct_decline_reason),
        ...paginationQuery(input),
      }),
    ),
    context,
    "execute",
  );
  const response = normalizeEnvelope(payload, "PartnerStack rewards page");
  const page = normalizeListData(response.data, "PartnerStack rewards page");
  return {
    rewards: page.items.map(normalizeReward),
    page: {
      has_more: page.has_more,
    },
    ...responseMetadata(response),
  };
}

async function listPayouts(input: Record<string, unknown>, context: PartnerStackPartnerContext) {
  const payload = await requestPartnerStackJson(
    buildPath(
      "payouts",
      compactObject({
        min_created: optionalIntegerLike(input.min_created, "min_created", providerInputError),
        max_created: optionalIntegerLike(input.max_created, "max_created", providerInputError),
        order_by: optionalString(input.order_by),
        ...paginationQuery(input),
      }),
    ),
    context,
    "execute",
  );
  const response = normalizeEnvelope(payload, "PartnerStack payouts page");
  const page = normalizeListData(response.data, "PartnerStack payouts page");
  return {
    payouts: page.items.map(normalizePayout),
    page: {
      has_more: page.has_more,
    },
    ...responseMetadata(response),
  };
}

async function requestPartnerStackJson(
  path: string,
  context: PartnerStackPartnerContext,
  phase: "validate" | "execute",
) {
  try {
    const response = await partnerStackPartnerFetch(path, context);
    const payload = await readPartnerStackPayload(response);
    if (!response.ok) {
      throw createPartnerStackError(response, payload, phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw createPartnerStackTransportError(error);
  }
}

function partnerStackPartnerFetch(path: string, context: PartnerStackPartnerContext) {
  return context.fetcher(new URL(path, partnerStackPartnerApiBaseUrl), {
    headers: {
      accept: "application/json",
      "user-agent": providerUserAgent,
      authorization: `Bearer ${context.apiKey}`,
    },
  });
}

async function readPartnerStackPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function createPartnerStackError(response: Response, payload: unknown, phase: "validate" | "execute") {
  const status = response.status;
  const message = extractErrorMessage(payload) ?? `PartnerStack Partner request failed with status ${status}`;
  if (status === 401 || status === 403) {
    if (phase === "validate") {
      return new ProviderRequestError(400, message, payload);
    }
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function createPartnerStackTransportError(error: unknown) {
  if (isAbortLikeError(error)) {
    return new ProviderRequestError(504, "PartnerStack Partner request timed out");
  }

  const message =
    error instanceof Error && error.message.trim()
      ? `PartnerStack Partner request failed: ${error.message}`
      : "PartnerStack Partner request failed";
  return new ProviderRequestError(502, message);
}

function isAbortLikeError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "AbortError" || error.name === "TimeoutError";
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const detail = record.message ?? record.error ?? record.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail.map((item) => extractErrorMessage(item) ?? String(item)).join("; ");
  }
  return undefined;
}

function normalizeEnvelope(payload: unknown, label: string) {
  const record = normalizeObject(payload, label);
  return {
    data: record.data,
    message: optionalString(record.message),
    status:
      typeof record.status === "number"
        ? record.status
        : optionalIntegerLike(record.status, "status", providerOutputError),
  };
}

function normalizeListData(value: unknown, label: string) {
  const data = normalizeObject(value, label);
  if (typeof data.has_more !== "boolean") {
    throw new ProviderRequestError(502, `${label} response must include has_more`);
  }
  if (!Array.isArray(data.items)) {
    throw new ProviderRequestError(502, `${label} response must include an items array`);
  }
  return {
    has_more: data.has_more,
    items: data.items.map((item) => normalizeObject(item, label)),
  };
}

function normalizeMarketplaceProgram(value: unknown) {
  const record = normalizeObject(value, "PartnerStack marketplace program");
  return {
    ...record,
    id: optionalIntegerLike(record.id, "id", providerOutputError),
    key: optionalString(record.key) ?? "",
    name: optionalString(record.name) ?? "",
    website: nullableValue(record.website),
    category: normalizeNullableStringArray(record.category),
    country: nullableValue(record.country),
    description: nullableValue(record.description),
    created_at: optionalIntegerLike(record.created_at, "created_at", providerOutputError),
    has_sub_id: optionalBoolean(record.has_sub_id),
    logo: nullableValue(record.logo),
    raw: record,
  };
}

function normalizePartnership(value: unknown) {
  const record = normalizeObject(value, "PartnerStack partnership");
  return {
    ...record,
    key: optionalString(record.key) ?? "",
    created_at: optionalIntegerLike(record.created_at, "created_at", providerOutputError),
    updated_at: optionalIntegerLike(record.updated_at, "updated_at", providerOutputError),
    claimed: optionalBoolean(record.claimed),
    company: normalizeOptionalCompany(record.company),
    has_sub_id: normalizeNullableBoolean(record.has_sub_id),
    raw: record,
  };
}

function normalizeReward(value: unknown) {
  const record = normalizeObject(value, "PartnerStack reward");
  return {
    ...record,
    key: optionalString(record.key) ?? "",
    created_at: optionalIntegerLike(record.created_at, "created_at", providerOutputError),
    updated_at: optionalIntegerLike(record.updated_at, "updated_at", providerOutputError),
    amount: normalizeNullableInteger(record.amount),
    amount_usd: normalizeNullableInteger(record.amount_usd),
    currency: nullableValue(record.currency),
    status: nullableValue(record.status),
    payment_status: nullableValue(record.payment_status),
    description: nullableValue(record.description),
    raw: record,
  };
}

function normalizePayout(value: unknown) {
  const record = normalizeObject(value, "PartnerStack payout");
  return {
    ...record,
    key: optionalString(record.key) ?? "",
    created_at: optionalIntegerLike(record.created_at, "created_at", providerOutputError),
    updated_at: optionalIntegerLike(record.updated_at, "updated_at", providerOutputError),
    amount: normalizeNullableInteger(record.amount),
    amount_usd: normalizeNullableInteger(record.amount_usd),
    currency: nullableValue(record.currency),
    status: nullableValue(record.status),
    provider: normalizeOptionalProvider(record.provider),
    raw: record,
  };
}

function normalizeOptionalCompany(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return {
    ...record,
    id: optionalIntegerLike(record.id, "id", providerOutputError),
    key: optionalString(record.key),
    name: optionalString(record.name),
  };
}

function normalizeOptionalProvider(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return {
    ...record,
    key: optionalString(record.key),
    external_key: optionalString(record.external_key),
    meta: normalizeLooseObject(record.meta),
  };
}

function normalizeObject(value: unknown, label: string) {
  try {
    return requiredRecord(value, label, providerOutputError);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, `${label} response must be an object`);
  }
}

function normalizeLooseObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeNullableStringArray(value: unknown) {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function nullableValue(value: unknown) {
  if (typeof value === "string" || value === null) {
    return value;
  }
  return undefined;
}

function normalizeNullableInteger(value: unknown) {
  if (value === null) {
    return null;
  }
  return optionalIntegerLike(value, "integer", providerOutputError);
}

function normalizeNullableBoolean(value: unknown) {
  if (value === null) {
    return null;
  }
  return optionalBoolean(value);
}

function paginationQuery(input: Record<string, unknown>) {
  return compactObject({
    limit: optionalIntegerLike(input.limit, "limit", providerInputError),
    starting_after: optionalString(input.starting_after),
    ending_before: optionalString(input.ending_before),
  });
}

function responseMetadata(response: { message?: string; status?: number }) {
  return compactObject({
    message: response.message,
    status: response.status,
  });
}

function buildPath(pathname: string, query: Record<string, unknown>) {
  const url = new URL(pathname, partnerStackPartnerApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

function providerInputError(message: string) {
  return new ProviderRequestError(400, message);
}

function providerOutputError(message: string) {
  return new ProviderRequestError(502, message);
}
