import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { PartnerstackActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalIntegerLike,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

export const partnerstackApiBaseUrl = "https://api.partnerstack.com/api";
const partnerstackCredentialHelpUrl = "https://docs.partnerstack.com/reference/auth";

type PartnerstackRequestPhase = "validate" | "execute";
type QueryValue = string | number | boolean | string[] | undefined;

interface PartnerstackContext {
  publicKey: string;
  secretKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface PartnerstackListPayload {
  data: {
    items: unknown[];
    has_more?: unknown;
  };
}

type PartnerstackActionHandler = (input: Record<string, unknown>, context: PartnerstackContext) => Promise<unknown>;

export const partnerstackActionHandlers: Record<PartnerstackActionName, PartnerstackActionHandler> = {
  list_customers(input, context) {
    return listCustomers(input, context);
  },
  get_customer(input, context) {
    return getCustomer(input, context);
  },
  create_customer(input, context) {
    return createCustomer(input, context);
  },
  list_partnerships(input, context) {
    return listPartnerships(input, context);
  },
  get_partnership(input, context) {
    return getPartnership(input, context);
  },
  list_leads(input, context) {
    return listLeads(input, context);
  },
  list_deals(input, context) {
    return listDeals(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<PartnerstackContext>({
  service: "partnerstack",
  handlers: partnerstackActionHandlers,
  async createContext(context, fetcher): Promise<PartnerstackContext> {
    const credential = await requireApiKeyCredential(context, "partnerstack");
    return {
      publicKey: requiredString(
        credential.values.publicKey,
        "publicKey",
        (message) => new ProviderRequestError(401, message),
      ),
      secretKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export async function validatePartnerstackCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const publicKey = requiredString(input.publicKey, "publicKey", (message) => new ProviderRequestError(401, message));
  const secretKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestPartnerstackJson<unknown>({
    publicKey,
    secretKey,
    path: "/v2/partnerships",
    query: { limit: 1 },
    fetcher,
    phase: "validate",
  });
  const listPayload = normalizeListPayload(payload, "partnership");
  const firstPartnership = listPayload.data.items.map((item) => optionalRecord(item)).find((item) => item != null);

  return {
    profile: {
      accountId: `partnerstack:${publicKey}`,
      displayName:
        optionalString(firstPartnership?.email) ??
        optionalString(firstPartnership?.partner_key) ??
        "PartnerStack Vendor API",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: partnerstackApiBaseUrl,
      validationEndpoint: "/api/v2/partnerships?limit=1",
      credentialHelpUrl: partnerstackCredentialHelpUrl,
      samplePartnershipKey: optionalString(firstPartnership?.key),
    }),
  };
}

async function listCustomers(input: Record<string, unknown>, context: PartnerstackContext) {
  const payload = await requestWithCredential<unknown>(context, {
    path: "/v2/customers",
    query: {
      ...buildCommonListQuery(input),
      partner_key: optionalString(input.partnerKey),
      partnership_key: optionalString(input.partnershipKey),
      customer_key: readOptionalStringArray(input.customerKeys),
    },
  });
  const listPayload = normalizeListPayload(payload, "customer");
  return {
    customers: listPayload.data.items.map(normalizeCustomer),
    hasMore: optionalBoolean(listPayload.data.has_more) ?? false,
  };
}

async function getCustomer(input: Record<string, unknown>, context: PartnerstackContext) {
  const customerKey = requiredString(input.customerKey, "customerKey", providerInputError);
  const payload = await requestWithCredential<unknown>(context, {
    path: `/v2/customers/${encodeURIComponent(customerKey)}`,
    notFoundAsInvalidInput: true,
  });
  return { customer: normalizeCustomer(extractData(payload, "customer")) };
}

async function createCustomer(input: Record<string, unknown>, context: PartnerstackContext) {
  const payload = await requestWithCredential<unknown>(context, {
    path: "/v2/customers",
    method: "POST",
    body: compactObject({
      customer_key: requiredString(input.customerKey, "customerKey", providerInputError),
      partner_key: requiredString(input.partnerKey, "partnerKey", providerInputError),
      email: requiredString(input.email, "email", providerInputError),
      name: optionalString(input.name),
      member_key: optionalString(input.memberKey),
      provider_key: optionalString(input.providerKey),
      meta: optionalRecord(input.meta),
    }),
  });
  return { customer: normalizeCustomer(extractData(payload, "customer")) };
}

async function listPartnerships(input: Record<string, unknown>, context: PartnerstackContext) {
  const payload = await requestWithCredential<unknown>(context, {
    path: "/v2/partnerships",
    query: {
      ...buildCommonListQuery(input),
      order_by: optionalString(input.orderBy),
      email: optionalString(input.email),
      approved_status: optionalString(input.approvedStatus),
      include_archived: optionalBoolean(input.includeArchived),
      partnership_key: optionalString(input.partnershipKey),
    },
  });
  const listPayload = normalizeListPayload(payload, "partnership");
  return {
    partnerships: listPayload.data.items.map(normalizePartnership),
    hasMore: optionalBoolean(listPayload.data.has_more) ?? false,
  };
}

async function getPartnership(input: Record<string, unknown>, context: PartnerstackContext) {
  const uniqueIdentifier = requiredString(input.uniqueIdentifier, "uniqueIdentifier", providerInputError);
  const payload = await requestWithCredential<unknown>(context, {
    path: `/v2/partnerships/${encodeURIComponent(uniqueIdentifier)}`,
    notFoundAsInvalidInput: true,
  });
  return { partnership: normalizePartnership(extractData(payload, "partnership")) };
}

async function listLeads(input: Record<string, unknown>, context: PartnerstackContext) {
  const payload = await requestWithCredential<unknown>(context, {
    path: "/v2/leads",
    query: {
      ...buildCommonListQuery(input),
      partner_key: optionalString(input.partnerKey),
      lead_key: optionalString(input.leadKey),
    },
  });
  const listPayload = normalizeListPayload(payload, "lead");
  return {
    leads: listPayload.data.items.map(normalizeLead),
    hasMore: optionalBoolean(listPayload.data.has_more) ?? false,
  };
}

async function listDeals(input: Record<string, unknown>, context: PartnerstackContext) {
  const payload = await requestWithCredential<unknown>(context, {
    path: "/v2/deals",
    query: {
      ...buildCommonListQuery(input),
      partner_key: optionalString(input.partnerKey),
      customer_key: readOptionalStringArray(input.customerKeys),
      deal_key: optionalString(input.dealKey),
    },
  });
  const listPayload = normalizeListPayload(payload, "deal");
  return {
    deals: listPayload.data.items.map(normalizeDeal),
    hasMore: optionalBoolean(listPayload.data.has_more) ?? false,
  };
}

async function requestWithCredential<T>(
  context: PartnerstackContext,
  request: {
    path: string;
    method?: string;
    query?: Record<string, QueryValue>;
    body?: Record<string, unknown>;
    notFoundAsInvalidInput?: boolean;
  },
) {
  return requestPartnerstackJson<T>({
    publicKey: context.publicKey,
    secretKey: context.secretKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    ...request,
  });
}

async function requestPartnerstackJson<T>(input: {
  publicKey: string;
  secretKey: string;
  path: string;
  method?: string;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: PartnerstackRequestPhase;
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  const url = new URL(`${partnerstackApiBaseUrl}${input.path}`);
  appendQuery(url, input.query);
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: buildBasicAuthHeader(input.publicKey, input.secretKey),
    "user-agent": providerUserAgent,
  };
  if (input.body) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw createPartnerstackTransportError(error);
  }

  const payload = await readPartnerstackPayload(response);
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(
      input.phase === "validate" ? 400 : response.status,
      input.phase === "validate"
        ? "PartnerStack rejected the public key or secret key"
        : "PartnerStack authentication failed",
      payload,
    );
  }

  if (response.status === 404 && input.notFoundAsInvalidInput) {
    throw new ProviderRequestError(404, "PartnerStack resource was not found", payload);
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      response.status >= 500 ? 502 : response.status,
      extractPartnerstackErrorMessage(payload) ?? `PartnerStack request failed with HTTP ${response.status}`,
      payload,
    );
  }

  return payload as T;
}

export function buildBasicAuthHeader(publicKey: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`;
}

function appendQuery(url: URL, query: Record<string, QueryValue> | undefined) {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      url.searchParams.set(key, value.join(","));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

function buildCommonListQuery(input: Record<string, unknown>) {
  return compactObject({
    limit: optionalIntegerLike(input.limit, "limit", providerInputError),
    starting_after: optionalString(input.startingAfter),
    ending_before: optionalString(input.endingBefore),
    min_created: optionalIntegerLike(input.minCreated, "minCreated", providerInputError),
    max_created: optionalIntegerLike(input.maxCreated, "maxCreated", providerInputError),
    min_updated: optionalIntegerLike(input.minUpdated, "minUpdated", providerInputError),
    max_updated: optionalIntegerLike(input.maxUpdated, "maxUpdated", providerInputError),
    group: optionalString(input.group),
  });
}

function readOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => item.length > 0);
  return values.length > 0 ? values : undefined;
}

function normalizeListPayload(value: unknown, label: string): PartnerstackListPayload {
  const payload = optionalRecord(value);
  const data = optionalRecord(payload?.data);
  const items = data?.items;
  if (!data || !Array.isArray(items)) {
    throw new ProviderRequestError(502, `PartnerStack ${label} list response is missing data.items`);
  }
  return { data: { items, has_more: data.has_more } };
}

function extractData(value: unknown, label: string) {
  const data = optionalRecord(optionalRecord(value)?.data);
  if (!data) {
    throw new ProviderRequestError(502, `PartnerStack ${label} response is missing data`);
  }
  return data;
}

async function readPartnerstackPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "PartnerStack returned malformed JSON");
    }
    return text;
  }
}

function extractPartnerstackErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.detail);
}

function createPartnerstackTransportError(error: unknown) {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new ProviderRequestError(504, "PartnerStack request timed out");
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `PartnerStack request failed: ${error.message}` : "PartnerStack request failed",
  );
}

function normalizeCustomer(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "PartnerStack customer item is invalid");
  }
  return {
    key: readRequiredRecordKey(record, "customer"),
    customerKey: optionalString(record.customer_key) ?? null,
    email: optionalString(record.email) ?? null,
    name: optionalString(record.name) ?? null,
    partnerKey: optionalString(record.partner_key) ?? null,
    partnershipKey: optionalString(record.partnership_key) ?? null,
    createdAt: optionalIntegerLike(record.created_at, "created_at", providerOutputError) ?? null,
    updatedAt: optionalIntegerLike(record.updated_at, "updated_at", providerOutputError) ?? null,
    raw: record,
  };
}

function normalizePartnership(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "PartnerStack partnership item is invalid");
  }
  return {
    key: readRequiredRecordKey(record, "partnership"),
    partnerKey: optionalString(record.partner_key) ?? null,
    email: optionalString(record.email) ?? null,
    name: optionalString(record.name) ?? optionalString(record.company_name) ?? null,
    approvedStatus: optionalString(record.approved_status) ?? null,
    claimed: optionalBoolean(record.claimed) ?? null,
    createdAt: optionalIntegerLike(record.created_at, "created_at", providerOutputError) ?? null,
    updatedAt: optionalIntegerLike(record.updated_at, "updated_at", providerOutputError) ?? null,
    raw: record,
  };
}

function normalizeLead(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "PartnerStack lead item is invalid");
  }
  return {
    key: readRequiredRecordKey(record, "lead"),
    leadKey: optionalString(record.lead_key) ?? null,
    email: optionalString(record.email) ?? null,
    name: optionalString(record.name) ?? optionalString(record.company_name) ?? null,
    partnerKey: optionalString(record.partner_key) ?? null,
    customerKey: optionalString(record.customer_key) ?? null,
    createdAt: optionalIntegerLike(record.created_at, "created_at", providerOutputError) ?? null,
    updatedAt: optionalIntegerLike(record.updated_at, "updated_at", providerOutputError) ?? null,
    raw: record,
  };
}

function normalizeDeal(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "PartnerStack deal item is invalid");
  }
  return {
    key: readRequiredRecordKey(record, "deal"),
    dealKey: optionalString(record.deal_key) ?? null,
    name: optionalString(record.name) ?? null,
    stage: optionalString(record.stage) ?? optionalString(record.stage_name) ?? null,
    partnerKey: optionalString(record.partner_key) ?? null,
    customerKey: optionalString(record.customer_key) ?? null,
    amount: optionalNumber(record.amount) ?? null,
    createdAt: optionalIntegerLike(record.created_at, "created_at", providerOutputError) ?? null,
    updatedAt: optionalIntegerLike(record.updated_at, "updated_at", providerOutputError) ?? null,
    raw: record,
  };
}

function readRequiredRecordKey(record: Record<string, unknown>, label: string) {
  const key = requiredString(record.key, "key", providerOutputError);
  if (!key) {
    throw new ProviderRequestError(502, `PartnerStack ${label} response is missing key`);
  }
  return key;
}

function providerInputError(message: string) {
  return new ProviderRequestError(400, message);
}

function providerOutputError(message: string) {
  return new ProviderRequestError(502, message);
}
