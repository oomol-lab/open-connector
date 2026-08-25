import type { CredentialValidationResult, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "elorus";
const elorusApiBaseUrl = "https://api.elorus.com";
const elorusValidationPath = "/v1.2/contacts/";

interface ElorusActionContext {
  apiKey: string;
  organizationId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type ElorusRequestPhase = "validate" | "execute";
type ElorusActionHandler = ProviderRuntimeHandler<ElorusActionContext>;

export const elorusActionHandlers: ProviderActionHandlers<"elorus", ElorusActionHandler> = {
  list_contacts(input, context) {
    return requestElorusList({
      context,
      path: "/v1.2/contacts/",
      query: pickQuery(input, [
        "ordering",
        "search",
        "search_fields",
        "letter",
        "ctype",
        "profession",
        "company",
        "active",
        "custom_id",
        "created_after",
        "created_before",
        "modified_after",
        "modified_before",
        "modified_period",
        "created_period",
        "page",
        "page_size",
      ]),
    });
  },
  async get_contact(input, context) {
    return {
      contact: await requestElorusObject({
        context,
        path: `/v1.2/contacts/${encodePathSegment(requireInputId(input, "id"))}/`,
      }),
    };
  },
  async create_contact(input, context) {
    return {
      contact: await requestElorusObject({
        context,
        path: "/v1.2/contacts/",
        method: "POST",
        body: requireBodyObject(input.data, "data"),
      }),
    };
  },
  async update_contact(input, context) {
    return {
      contact: await requestElorusObject({
        context,
        path: `/v1.2/contacts/${encodePathSegment(requireInputId(input, "id"))}/`,
        method: "PUT",
        body: requireBodyObject(input.data, "data"),
      }),
    };
  },
  list_products(input, context) {
    return requestElorusList({
      context,
      path: "/v1.2/products/",
      query: pickQuery(input, [
        "search",
        "search_fields",
        "sales",
        "purchases",
        "active",
        "custom_id",
        "ordering",
        "created_after",
        "created_before",
        "modified_after",
        "modified_before",
        "modified_period",
        "created_period",
        "page",
        "page_size",
      ]),
    });
  },
  async get_product(input, context) {
    return {
      product: await requestElorusObject({
        context,
        path: `/v1.2/products/${encodePathSegment(requireInputId(input, "id"))}/`,
      }),
    };
  },
  async create_product(input, context) {
    return {
      product: await requestElorusObject({
        context,
        path: "/v1.2/products/",
        method: "POST",
        body: requireBodyObject(input.data, "data"),
      }),
    };
  },
  async update_product(input, context) {
    return {
      product: await requestElorusObject({
        context,
        path: `/v1.2/products/${encodePathSegment(requireInputId(input, "id"))}/`,
        method: "PUT",
        body: requireBodyObject(input.data, "data"),
      }),
    };
  },
  list_invoices(input, context) {
    return requestElorusList({
      context,
      path: "/v1.2/invoices/",
      query: pickQuery(input, [
        "ordering",
        "search",
        "search_fields",
        "period_from",
        "period_to",
        "period",
        "status",
        "draft",
        "pending_approval",
        "fpaid",
        "is_void",
        "overdue",
        "client",
        "currency_code",
        "documenttype",
        "sequence",
        "custom_id",
        "created_after",
        "created_before",
        "modified_after",
        "modified_before",
        "modified_period",
        "created_period",
        "page",
        "page_size",
      ]),
    });
  },
  async get_invoice(input, context) {
    return {
      invoice: await requestElorusObject({
        context,
        path: `/v1.2/invoices/${encodePathSegment(requireInputId(input, "id"))}/`,
      }),
    };
  },
  async create_invoice(input, context) {
    return {
      invoice: await requestElorusObject({
        context,
        path: "/v1.2/invoices/",
        method: "POST",
        body: requireBodyObject(input.data, "data"),
      }),
    };
  },
  async update_invoice(input, context) {
    return {
      invoice: await requestElorusObject({
        context,
        path: `/v1.2/invoices/${encodePathSegment(requireInputId(input, "id"))}/`,
        method: "PUT",
        body: requireBodyObject(input.data, "data"),
      }),
    };
  },
};

export const elorusExecutors: ProviderExecutors = defineProviderExecutors<ElorusActionContext>({
  service,
  handlers: elorusActionHandlers,
  createContext,
});

export async function validateElorusCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", badInput);
  const organizationId = requireOrganizationId(input.values.organizationId);

  await requestElorusJson({
    context: {
      apiKey,
      organizationId,
      fetcher,
      signal,
    },
    phase: "validate",
    path: elorusValidationPath,
    query: {
      page_size: "1",
    },
  });

  return {
    profile: {
      accountId: buildElorusProviderAccountId(apiKey, organizationId),
      displayName: `Elorus organization ${organizationId}`,
    },
    grantedScopes: [],
    metadata: {
      organizationId,
      validationEndpoint: elorusValidationPath,
    },
  };
}

async function createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<ElorusActionContext> {
  const credential = await requireApiKeyCredential(context, service);
  return {
    apiKey: credential.apiKey,
    organizationId: requireOrganizationId(credential.values.organizationId),
    fetcher,
    signal: context.signal,
  };
}

function requestElorusList(input: {
  context: ElorusActionContext;
  path: string;
  query?: Record<string, string>;
}): Promise<unknown> {
  return requestElorusJson({
    context: input.context,
    phase: "execute",
    path: input.path,
    query: input.query,
  });
}

async function requestElorusObject(input: {
  context: ElorusActionContext;
  path: string;
  method?: "GET" | "POST" | "PUT";
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const payload = await requestElorusJson({
    context: input.context,
    phase: "execute",
    path: input.path,
    method: input.method,
    body: input.body,
  });
  return requireElorusObject(payload, input.path);
}

async function requestElorusJson(input: {
  context: ElorusActionContext;
  phase: ElorusRequestPhase;
  path: string;
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(input.path, elorusApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  try {
    const hasBody = input.body !== undefined;
    const response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildElorusHeaders(input.context.apiKey, input.context.organizationId, hasBody),
      body: hasBody ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
    const payload = await readElorusPayload(response);
    if (!response.ok) {
      throw createElorusError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Elorus request failed: ${error.message}` : "Elorus request failed",
      error,
    );
  }
}

function buildElorusHeaders(apiKey: string, organizationId: string, hasBody: boolean): Record<string, string> {
  return compactObject({
    accept: "application/json",
    "content-type": hasBody ? "application/json" : undefined,
    authorization: `Token ${apiKey}`,
    "x-elorus-organization": organizationId,
    "user-agent": providerUserAgent,
  }) as Record<string, string>;
}

async function readElorusPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return response.text();
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function createElorusError(response: Response, payload: unknown, phase: ElorusRequestPhase): ProviderRequestError {
  const message = readElorusErrorMessage(payload) ?? response.statusText ?? "Elorus request failed";
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function readElorusErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  const detail = optionalString(record?.detail);
  if (detail) {
    return detail;
  }
  const message = optionalString(record?.message);
  if (message) {
    return message;
  }
  const nonFieldErrors = record?.non_field_errors;
  if (Array.isArray(nonFieldErrors)) {
    const first = nonFieldErrors.find((value) => typeof value === "string");
    if (typeof first === "string" && first.trim()) {
      return first;
    }
  }
  if (record) {
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === "string" && value.trim()) {
        return `${key}: ${value}`;
      }
      if (Array.isArray(value)) {
        const first = value.find((item) => typeof item === "string");
        if (typeof first === "string" && first.trim()) {
          return `${key}: ${first}`;
        }
      }
    }
  }
  return undefined;
}

function requireElorusObject(payload: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `invalid Elorus payload for ${context}`, payload);
  }
  return record;
}

function pickQuery(input: Record<string, unknown>, keys: string[]): Record<string, string> {
  const query: Record<string, string> = {};
  for (const key of keys) {
    const value = input[key];
    if (value === undefined || value === null) {
      continue;
    }
    query[key] = normalizeQueryValue(value, key);
  }
  return query;
}

function normalizeQueryValue(value: unknown, key: string): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw new ProviderRequestError(400, `${key} must be a string, number, or boolean`);
}

function requireInputId(input: Record<string, unknown>, fieldName: string): string {
  return requiredString(input[fieldName], fieldName, badInput);
}

function requireBodyObject(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, badInput);
}

function requireOrganizationId(value: unknown): string {
  return requiredString(value, "organizationId", badInput);
}

function buildElorusProviderAccountId(apiKey: string, organizationId: string): string {
  const digest = createHash("sha256").update(`${apiKey}\n${organizationId}`).digest("hex").slice(0, 16);
  return `elorus:api_key:${digest}`;
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
