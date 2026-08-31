import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "chargeblast";
const chargeblastApiBaseUrl = "https://api.chargeblast.com";
const maxNonJsonErrorMessageLength = 300;
const chargeblastMaxResponseBytes = 10 * 1024 * 1024;

type ChargeblastPhase = "validate" | "execute";
type ChargeblastActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const chargeblastActionHandlers: ProviderActionHandlers<"chargeblast", ChargeblastActionHandler> = {
  async list_alerts(input, context) {
    const payload = await requestChargeblastJson(
      buildPath("/api/v2/alerts", {
        filter: optionalString(input.filter),
        page: readOptionalInteger(input.page),
        per: readOptionalInteger(input.per),
      }),
      { method: "GET" },
      context,
      "execute",
    );
    const record = requireRecordPayload(payload, "Chargeblast alerts response");
    return {
      alerts: readObjectArray(record.alerts).map(normalizeAlert),
      page: readNumber(record.page, "page"),
      per: readNullableNumber(record.per),
      total: readNumber(record.total, "total"),
      raw: record,
    };
  },
  async get_alert(input, context) {
    const payload = await requestChargeblastJson(
      `/api/v2/alert/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      { method: "GET" },
      context,
      "execute",
    );
    const record = requireRecordPayload(payload, "Chargeblast alert response");
    return {
      alert: normalizeAlert(requireRecordPayload(record.alert, "Chargeblast alert")),
      raw: record,
    };
  },
  async update_alert(input, context) {
    const payload = await requestChargeblastJson(
      `/api/v2/alerts/update/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      {
        method: "POST",
        body: JSON.stringify(
          compactObject({
            result: readRequiredString(input.result, "result"),
            action_at_expiration: optionalBoolean(input.actionAtExpiration),
          }),
        ),
      },
      context,
      "execute",
    );
    return { payload };
  },
  async create_credit_request(input, context) {
    const payload = await requestChargeblastJson(
      "/api/v2/credit-request/create",
      {
        method: "POST",
        body: JSON.stringify(
          compactObject({
            alert_id: readRequiredString(input.alertId, "alertId"),
            comments: optionalString(input.comments),
          }),
        ),
      },
      context,
      "execute",
    );
    return { payload };
  },
  async list_merchants(input, context) {
    const payload = await requestChargeblastJson(
      buildPath("/api/v2/merchants", {
        page: readOptionalInteger(input.page),
        per: readOptionalInteger(input.per),
      }),
      { method: "GET" },
      context,
      "execute",
    );
    const record = requireRecordPayload(payload, "Chargeblast merchants response");
    return {
      merchants: readObjectArray(record.merchants).map(normalizeMerchant),
      page: readNumber(record.page, "page"),
      total: readNumber(record.total, "total"),
      raw: record,
    };
  },
  async list_orders(input, context) {
    const payload = await requestChargeblastJson(
      buildPath("/api/v2/orders", {
        page: readOptionalInteger(input.page),
        per: readOptionalInteger(input.per),
      }),
      { method: "GET" },
      context,
      "execute",
    );
    const record = requireRecordPayload(payload, "Chargeblast orders response");
    return {
      orders: readStringArray(record.orders),
      page: readNumber(record.page, "page"),
      per: readNullableNumber(record.per),
      total: readNumber(record.total, "total"),
      raw: record,
    };
  },
  async get_order(input, context) {
    const payload = await requestChargeblastJson(
      `/api/v2/orders/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      { method: "GET" },
      context,
      "execute",
    );
    const record = requireRecordPayload(payload, "Chargeblast order response");
    return {
      order: record,
      raw: record,
    };
  },
  async list_deflection_logs(input, context) {
    const payload = await requestChargeblastJson(
      buildPath("/api/v3/deflections/logs", {
        page: readOptionalInteger(input.page),
        per: readOptionalInteger(input.per),
      }),
      {
        method: "GET",
        body: JSON.stringify(
          compactObject({
            filter: readOptionalFilter(input.filter),
          }),
        ),
      },
      context,
      "execute",
    );
    const record = requireRecordPayload(payload, "Chargeblast deflection logs response");
    return {
      logs: readObjectArray(record.logs).map(normalizeDeflectionLog),
      page: readNumber(record.page, "page"),
      per: readNullableNumber(record.per),
      total: readNumber(record.total, "total"),
      raw: record,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, chargeblastActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: chargeblastApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestChargeblastJson(
      buildPath("/api/v2/merchants", { per: 1 }),
      { method: "GET" },
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
    );
    const record = requireRecordPayload(payload, "Chargeblast validation response");
    const merchants = readObjectArray(record.merchants);
    const firstMerchant = merchants[0];
    return {
      profile: {
        accountId: "chargeblast",
        displayName: readOptionalTrimmedString(firstMerchant?.name) ?? "Chargeblast API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: chargeblastApiBaseUrl,
        validationEndpoint: "/api/v2/merchants",
        merchantCount: optionalNumber(record.total),
        firstMerchantId: optionalString(firstMerchant?.id),
      }),
    };
  },
};

async function requestChargeblastJson(
  path: string,
  init: RequestInit,
  context: ApiKeyProviderContext,
  phase: ChargeblastPhase,
) {
  const timeoutHandle = createProviderTimeout(context.signal);

  try {
    const response = await context.fetcher(new URL(path, chargeblastApiBaseUrl), {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
        ...init.headers,
      },
      signal: timeoutHandle.signal,
    });
    const payload = await readChargeblastPayload(response);

    if (!response.ok) {
      throw createChargeblastError(response.status, payload, phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout()) {
      throw new ProviderRequestError(504, "Chargeblast request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Chargeblast request failed: ${error.message}` : "Chargeblast request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

async function readChargeblastPayload(response: Response) {
  const text = await readProviderTextBody(response, "Chargeblast response", chargeblastMaxResponseBytes);
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Chargeblast returned invalid JSON");
  }
}

function createChargeblastError(status: number, payload: unknown, phase: ChargeblastPhase) {
  const message = extractChargeblastErrorMessage(payload) ?? `Chargeblast request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(401, message);
  } else if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  } else if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  } else {
    return new ProviderRequestError(status >= 500 || status < 400 ? 502 : status, message);
  }
}

function extractChargeblastErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message)?.trim() ??
    optionalString(record?.error)?.trim() ??
    optionalString(record?.detail)?.trim();
  if (message) {
    return message;
  }

  const serialized = JSON.stringify(payload);
  if (serialized && serialized.length <= maxNonJsonErrorMessageLength) {
    return serialized;
  } else if (serialized) {
    return `${serialized.slice(0, maxNonJsonErrorMessageLength)}...`;
  } else {
    return undefined;
  }
}

function normalizeAlert(input: Record<string, unknown>) {
  return {
    id: readRequiredString(input.id, "alert.id"),
    alertType: readNullableString(input.alertType),
    subprovider: readNullableString(input.subprovider),
    amount: readNullableNumber(input.amount),
    currency: readNullableString(input.currency),
    createdAt: readNullableString(input.createdAt),
    transactionDate: readNullableString(input.transactionDate),
    merchantId: readNullableString(input.merchantId),
    reasonCode: readNullableString(input.reasonCode),
    customerEmail: readNullableString(input.customerEmail),
    descriptor: readNullableString(input.descriptor),
    card: readNullableString(input.card),
    cardBrand: readNullableString(input.cardBrand),
    arn: readNullableString(input.arn),
    resolvedDate: readNullableString(input.resolvedDate),
    resolvedByApi: readNullableBoolean(input.resolvedByApi),
    raw: input,
  };
}

function normalizeMerchant(input: Record<string, unknown>) {
  return {
    id: readRequiredString(input.id, "merchant.id"),
    name: readRequiredString(input.name, "merchant.name"),
    raw: input,
  };
}

function normalizeDeflectionLog(input: Record<string, unknown>) {
  return {
    request: requireRecordPayload(input.request, "Chargeblast deflection log request"),
    response: requireRecordPayload(input.response, "Chargeblast deflection log response"),
    raw: input,
  };
}

function buildPath(path: string, query: Record<string, string | number | undefined>) {
  const url = new URL(path, chargeblastApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

function readOptionalFilter(value: unknown) {
  const filter = optionalRecord(value);
  if (!filter) {
    return undefined;
  }

  return compactObject({
    startDate: optionalString(filter.startDate),
    endDate: optionalString(filter.endDate),
    gateway: optionalString(filter.gateway),
    status: optionalString(filter.status),
  });
}

function requireRecordPayload(value: unknown, label: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be a JSON object`);
  }
  return record;
}

function readObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readOptionalTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readNullableString(value: unknown) {
  if (value == null) {
    return null;
  }
  return typeof value === "string" ? value : String(value);
}

function readNullableNumber(value: unknown) {
  if (value == null) {
    return null;
  }
  return typeof value === "number" ? value : null;
}

function readNullableBoolean(value: unknown) {
  if (value == null) {
    return null;
  }
  return typeof value === "boolean" ? value : null;
}

function readNumber(value: unknown, fieldName: string) {
  if (typeof value === "number") {
    return value;
  }
  throw new ProviderRequestError(502, `Chargeblast ${fieldName} must be a number`);
}

function readOptionalInteger(value: unknown) {
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new ProviderRequestError(400, "integer input is required");
}
