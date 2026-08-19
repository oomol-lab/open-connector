import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringOrNull,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";

const service = "teltel";
const teltelApiBaseUrl = "https://api.teltel.io/v2";

type TeltelRequestPhase = "validate" | "execute";
type TeltelActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface TeltelApiEnvelope<T> {
  data?: T;
  errors?: unknown;
}

interface TeltelBalancePayload {
  credit?: unknown;
  credit_limit?: unknown;
  balance?: unknown;
}

interface TeltelSmsCreatePayload {
  id?: unknown;
}

interface TeltelSmsReportPayload {
  id?: unknown;
  from?: unknown;
  to?: unknown;
  state?: unknown;
  detailed_state?: unknown;
  created_at?: unknown;
  delivered?: unknown;
  multipart?: unknown;
  parts?: unknown;
  price?: unknown;
  sum?: unknown;
  message?: unknown;
  campaign_id?: unknown;
  error_msg?: unknown;
}

export const teltelActionHandlers: ProviderActionHandlers<"teltel", TeltelActionHandler> = {
  async get_account_balance(_input, context): Promise<unknown> {
    return getTeltelAccountBalance(context);
  },
  async send_sms(input, context): Promise<unknown> {
    const payload = await teltelRequest<TeltelSmsCreatePayload>({
      method: "POST",
      path: "/sms/text",
      apiKey: context.apiKey,
      body: {
        data: compactObject({
          from: requiredProviderString(input.from, "from"),
          to: requiredProviderString(input.to, "to"),
          message: requiredProviderString(input.message, "message"),
          callback: input.callback,
        }),
      },
      context,
      phase: "execute",
    });
    if (payload.id === undefined || payload.id === null) {
      throw new ProviderRequestError(502, "TelTel response missing message id");
    }
    return { messageId: String(payload.id) };
  },
  async list_sms_reports(input, context): Promise<unknown> {
    const reports = await teltelRequest<TeltelSmsReportPayload[]>({
      path: "/sms/reports",
      apiKey: context.apiKey,
      query: compactObject({
        limit: optionalNumber(input.limit),
        offset: optionalNumber(input.offset),
        fields: optionalString(input.fields),
        sort: optionalString(input.sort),
        filter: optionalString(input.filter),
      }),
      context,
      phase: "execute",
    });
    return { reports: reports.map((report) => normalizeTeltelSmsReport(report)) };
  },
  async get_sms_report(input, context): Promise<unknown> {
    const messageId = requiredProviderString(input.messageId, "messageId");
    const payload = await teltelRequest<TeltelSmsReportPayload>({
      path: `/sms/reports/${encodeURIComponent(messageId)}`,
      apiKey: context.apiKey,
      query: compactObject({
        fields: optionalString(input.fields),
      }),
      context,
      phase: "execute",
    });
    return normalizeTeltelSmsReport(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, teltelActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const balances = await teltelRequest<TeltelBalancePayload[]>({
      path: "/account/balance",
      apiKey: input.apiKey,
      context: { fetcher, signal },
      phase: "validate",
    });
    const normalized = normalizeTeltelBalance(balances[0]);
    return {
      profile: {
        displayName: "TelTel API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/account/balance",
        apiBaseUrl: teltelApiBaseUrl,
        balance: normalized.balance,
        credit: normalized.credit,
        creditLimit: normalized.creditLimit,
      },
    };
  },
};

async function getTeltelAccountBalance(context: ApiKeyProviderContext): Promise<Record<string, number>> {
  const balances = await teltelRequest<TeltelBalancePayload[]>({
    path: "/account/balance",
    apiKey: context.apiKey,
    context,
    phase: "execute",
  });
  return normalizeTeltelBalance(balances[0]);
}

async function teltelRequest<T>(input: {
  path: string;
  apiKey: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: TeltelRequestPhase;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}): Promise<T> {
  const url = new URL(`${teltelApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "X-API-KEY": input.apiKey,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
    payload = await readTeltelPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `TelTel request failed: ${error.message}` : "TelTel request failed",
    );
  }

  if (!response.ok) {
    throw createTeltelError(response, payload, input.phase);
  }
  const envelope = optionalRecord(payload) as TeltelApiEnvelope<T> | undefined;
  if (!envelope || envelope.data === undefined) {
    throw new ProviderRequestError(502, "TelTel response missing data payload");
  }
  return envelope.data;
}

async function readTeltelPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createTeltelError(response: Response, payload: unknown, phase: TeltelRequestPhase): ProviderRequestError {
  const message = extractTeltelErrorMessage(payload) ?? response.statusText ?? "TelTel request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

function extractTeltelErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const errors = record.errors;
  if (Array.isArray(errors)) {
    const firstError = optionalRecord(errors[0]);
    return optionalString(firstError?.title) ?? optionalString(firstError?.detail);
  }
  const errorObject = optionalRecord(errors);
  return errorObject
    ? (optionalString(errorObject.title) ?? optionalString(errorObject.detail))
    : optionalString(record.message);
}

function normalizeTeltelBalance(payload: TeltelBalancePayload | undefined): Record<string, number> {
  if (!payload) {
    throw new ProviderRequestError(502, "TelTel response missing balance data");
  }
  return {
    credit: requiredProviderNumber(payload.credit, "credit"),
    creditLimit: requiredProviderNumber(payload.credit_limit, "credit_limit"),
    balance: requiredProviderNumber(payload.balance, "balance"),
  };
}

function normalizeTeltelSmsReport(payload: TeltelSmsReportPayload): Record<string, unknown> {
  if (payload.id === undefined || payload.id === null) {
    throw new ProviderRequestError(502, "TelTel response missing report id");
  }
  return {
    messageId: String(payload.id),
    from: optionalStringOrNull(payload.from),
    to: optionalStringOrNull(payload.to),
    state: optionalStringOrNull(payload.state),
    detailedState: optionalStringOrNull(payload.detailed_state),
    createdAt: optionalStringOrNull(payload.created_at),
    deliveredAt: optionalStringOrNull(payload.delivered),
    multipart: typeof payload.multipart === "boolean" ? payload.multipart : null,
    parts: nullableInteger(payload.parts),
    price: nullableNumber(payload.price),
    totalPrice: nullableNumber(payload.sum),
    message: optionalStringOrNull(payload.message),
    campaignId: nullableInteger(payload.campaign_id),
    errorMessage: optionalStringOrNull(payload.error_msg),
  };
}

function requiredProviderString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requiredProviderNumber(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `TelTel response missing numeric field: ${fieldName}`);
  }
  return parsed;
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : (optionalNumber(value) ?? null);
}

function nullableInteger(value: unknown): number | null {
  const parsed = nullableNumber(value);
  return parsed === null ? null : Number.isInteger(parsed) ? parsed : null;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.teltel.io/v2",
  auth: { type: "api_key_header", name: "x-api-key" },
});
