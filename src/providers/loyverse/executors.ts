import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString, requiredString, stringArray } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "loyverse";
const loyverseApiBaseUrl = "https://api.loyverse.com/v1.0";

type LoyverseActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const loyverseActionHandlers: ProviderActionHandlers<"loyverse", LoyverseActionHandler> = {
  get_merchant(_input, context) {
    return requestLoyverseItem(context, "/merchant/", "merchant");
  },
  list_stores(input, context) {
    return requestLoyverseList(context, "/stores", "stores", buildCommonListQuery(input, "store_ids"));
  },
  get_store(input, context) {
    return requestLoyverseItem(context, `/stores/${encodeURIComponent(readRequiredString(input, "id"))}`, "store");
  },
  list_items(input, context) {
    return requestLoyverseList(context, "/items", "items", buildCommonListQuery(input, "items_ids"));
  },
  get_item(input, context) {
    return requestLoyverseItem(context, `/items/${encodeURIComponent(readRequiredString(input, "id"))}`, "item");
  },
  list_categories(input, context) {
    return requestLoyverseList(context, "/categories", "categories", buildCommonListQuery(input, "categories_ids"));
  },
  get_category(input, context) {
    return requestLoyverseItem(
      context,
      `/categories/${encodeURIComponent(readRequiredString(input, "id"))}`,
      "category",
    );
  },
  list_customers(input, context) {
    return requestLoyverseList(
      context,
      "/customers",
      "customers",
      compactObject({
        customer_ids: joinList(input.ids),
        email: optionalString(input.email),
        created_at_min: optionalString(input.createdAtMin),
        created_at_max: optionalString(input.createdAtMax),
        updated_at_min: optionalString(input.updatedAtMin),
        updated_at_max: optionalString(input.updatedAtMax),
        limit: input.limit,
        cursor: optionalString(input.cursor),
      }),
    );
  },
  get_customer(input, context) {
    return requestLoyverseItem(
      context,
      `/customers/${encodeURIComponent(readRequiredString(input, "id"))}`,
      "customer",
    );
  },
  list_receipts(input, context) {
    return requestLoyverseList(
      context,
      "/receipts",
      "receipts",
      compactObject({
        receipt_numbers: joinList(input.receiptNumbers),
        since_receipt_number: optionalString(input.sinceReceiptNumber),
        before_receipt_number: optionalString(input.beforeReceiptNumber),
        store_id: optionalString(input.storeId),
        order: optionalString(input.order),
        source: optionalString(input.source),
        created_at_min: optionalString(input.createdAtMin),
        created_at_max: optionalString(input.createdAtMax),
        updated_at_min: optionalString(input.updatedAtMin),
        updated_at_max: optionalString(input.updatedAtMax),
        limit: input.limit,
        cursor: optionalString(input.cursor),
      }),
    );
  },
  get_receipt(input, context) {
    return requestLoyverseItem(
      context,
      `/receipts/${encodeURIComponent(readRequiredString(input, "receiptNumber"))}`,
      "receipt",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, loyverseActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateLoyverseCredential(input.apiKey, fetcher, signal);
  },
};

async function validateLoyverseCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const merchant = await requestLoyverseRaw({
    apiKey,
    fetcher,
    path: "/merchant/",
    signal,
  });
  const merchantObject = requireObject(merchant, "Loyverse merchant profile");
  const merchantId = optionalString(merchantObject.id);
  const merchantName =
    optionalString(merchantObject.name) ??
    optionalString(merchantObject.business_name) ??
    optionalString(merchantObject.email);

  return {
    profile: {
      accountId: merchantId
        ? `loyverse:merchant:${merchantId}`
        : `loyverse:token:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`,
      displayName: merchantName ?? "Loyverse API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: loyverseApiBaseUrl,
      validationEndpoint: "/merchant/",
      ...(merchantId ? { merchantId } : {}),
    },
  };
}

function buildCommonListQuery(input: Record<string, unknown>, idsQueryName: string): Record<string, unknown> {
  return compactObject({
    [idsQueryName]: joinList(input.ids),
    created_at_min: optionalString(input.createdAtMin),
    created_at_max: optionalString(input.createdAtMax),
    updated_at_min: optionalString(input.updatedAtMin),
    updated_at_max: optionalString(input.updatedAtMax),
    limit: input.limit,
    cursor: optionalString(input.cursor),
    show_deleted: typeof input.showDeleted === "boolean" ? String(input.showDeleted) : undefined,
  });
}

function joinList(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  return stringArray(value, "ids", inputError).join(",");
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  return requiredString(input[key], key, inputError);
}

async function requestLoyverseList(
  context: ApiKeyProviderContext,
  path: string,
  propertyName: string,
  query?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const payload = await requestLoyverseRaw({
    ...context,
    path,
    query,
  });
  const objectPayload = requireObject(payload, `Loyverse ${propertyName} response`);
  const records = objectPayload[propertyName];
  if (!Array.isArray(records)) {
    throw new ProviderRequestError(502, `Loyverse response missing ${propertyName} array`);
  }

  return {
    [propertyName]: records.map((record) => requireObject(record, `Loyverse ${propertyName} record`)),
    cursor: optionalString(objectPayload.cursor) ?? null,
    raw: objectPayload,
  };
}

async function requestLoyverseItem(
  context: ApiKeyProviderContext,
  path: string,
  propertyName: string,
): Promise<Record<string, unknown>> {
  const payload = await requestLoyverseRaw({
    ...context,
    path,
  });
  return {
    [propertyName]: requireObject(payload, `Loyverse ${propertyName} response`),
  };
}

async function requestLoyverseRaw(input: {
  apiKey: string;
  fetcher: typeof fetch;
  path: string;
  query?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<unknown> {
  const url = new URL(`${loyverseApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await input.fetcher(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
    },
    signal: input.signal,
  });
  const rawBody = await response.text();
  const payload = parseLoyversePayload(rawBody, response.status);
  const errors = readLoyverseErrors(payload);

  if (errors.length > 0) {
    throw mapLoyverseError(response.status, errors);
  }
  if (!response.ok) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : response.status === 401 ? 400 : 502,
      rawBody || `Loyverse request failed with status ${response.status}`,
    );
  }

  return payload;
}

function parseLoyversePayload(rawBody: string, status: number): unknown {
  if (!rawBody) {
    return {};
  }
  try {
    return JSON.parse(rawBody) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      status === 429 ? 429 : 502,
      `Loyverse returned non-JSON response: ${error instanceof Error ? error.message : rawBody}`,
    );
  }
}

function readLoyverseErrors(payload: unknown): Array<Record<string, unknown>> {
  const record = optionalRecord(payload);
  if (!record || !Array.isArray(record.errors)) {
    return [];
  }
  return record.errors.map((error) => requireObject(error, "Loyverse error object"));
}

function mapLoyverseError(status: number, errors: Array<Record<string, unknown>>): ProviderRequestError {
  const firstError = errors[0] ?? {};
  const code = optionalString(firstError.code);
  const details = optionalString(firstError.details);
  const field = optionalString(firstError.field);
  const message = [code, field, details].filter(Boolean).join(": ") || "Loyverse request failed";

  if (status === 401 || code === "UNAUTHORIZED") {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
