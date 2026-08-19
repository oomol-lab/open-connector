import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const optimorouteApiBaseUrl = "https://api.optimoroute.com/v1";
export const optimorouteValidationPath = "/get_orders";

const optimorouteDefaultRequestTimeoutMs = 30_000;

type OptimoroutePhase = "validate" | "execute";
type OptimorouteActionContext = ApiKeyProviderContext;
type OptimorouteActionHandler = (input: Record<string, unknown>, context: OptimorouteActionContext) => Promise<unknown>;

export const optimorouteActionHandlers: ProviderActionHandlers<"optimoroute", OptimorouteActionHandler> = {
  create_or_update_orders(input, context) {
    return createOrUpdateOrders(input, context);
  },
  get_orders(input, context) {
    return getOrders(input, context);
  },
  delete_orders(input, context) {
    return deleteOrders(input, context);
  },
};

export async function validateOptimorouteCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await optimorouteRequest(
    "/get_orders",
    {
      orders: [],
    },
    {
      apiKey: requiredString(apiKey, "apiKey", (message) => new ProviderRequestError(401, message)),
      fetcher,
      signal,
    },
    "validate",
  );

  return {
    profile: {
      displayName: "OptimoRoute API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: optimorouteApiBaseUrl,
      validationEndpoint: optimorouteValidationPath,
    },
  };
}

async function createOrUpdateOrders(
  input: Record<string, unknown>,
  context: OptimorouteActionContext,
): Promise<Record<string, unknown>> {
  const payload = await optimorouteRequest(
    "/create_or_update_orders",
    {
      orders: readRequiredObjectArray(input.orders, "orders", "invalid optimoroute orders input", 400),
    },
    context,
    "execute",
  );

  const record = readRequiredObject(payload, "create_or_update_orders");
  return {
    success: readRequiredBoolean(record.success, "success"),
    orders: readBulkResultArray(record.orders, "orders").map((item) => normalizeBulkWriteResult(item)),
  };
}

async function getOrders(
  input: Record<string, unknown>,
  context: OptimorouteActionContext,
): Promise<Record<string, unknown>> {
  const orders = readOrderReferences(input.orders, "orders");
  const payload = await optimorouteRequest(
    "/get_orders",
    {
      orders,
    },
    context,
    "execute",
  );

  const record = readRequiredObject(payload, "get_orders");
  return {
    success: readRequiredBoolean(record.success, "success"),
    orders: readBulkResultArray(record.orders, "orders").map((item) => normalizeBulkReadResult(item)),
  };
}

async function deleteOrders(
  input: Record<string, unknown>,
  context: OptimorouteActionContext,
): Promise<Record<string, unknown>> {
  const record = await optimorouteRequest(
    "/delete_orders",
    {
      orders: readOrderReferences(input.orders, "orders"),
      ...readOptionalBooleanPayload(input.deleteMultiple, "deleteMultiple"),
      ...readOptionalBooleanPayload(input.forceDelete, "forceDelete"),
    },
    context,
    "execute",
  ).then((payload) => readRequiredObject(payload, "delete_orders"));

  return {
    success: readRequiredBoolean(record.success, "success"),
    orders: readBulkResultArray(record.orders, "orders").map((item) => normalizeBulkDeleteResult(item)),
  };
}

async function optimorouteRequest(
  path: string,
  body: Record<string, unknown>,
  context: Pick<OptimorouteActionContext, "apiKey" | "fetcher" | "signal">,
  phase: OptimoroutePhase,
): Promise<unknown> {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${optimorouteApiBaseUrl}/`);
  url.searchParams.set("key", context.apiKey);
  const timeout = createProviderTimeout(context.signal, optimorouteDefaultRequestTimeoutMs);

  try {
    const response = await context.fetcher(url.toString(), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });
    const payload = await readOptimoroutePayload(response);
    if (!response.ok) {
      throw createOptimorouteError(response.status, payload, phase);
    }

    if (isTopLevelOptimoRouteError(payload)) {
      const errorCode = extractErrorCode(payload);
      const status = errorCode === "ERR_TOO_MANY_CONNECTIONS" ? 429 : errorCode === "AUTH_KEY_UNKNOWN" ? 403 : 400;
      throw createOptimorouteError(status, payload, phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "OptimoRoute request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OptimoRoute request failed: ${error.message}` : "OptimoRoute request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readOptimoroutePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "OptimoRoute returned invalid JSON");
  }
}

function createOptimorouteError(status: number, payload: unknown, phase: OptimoroutePhase): ProviderRequestError {
  const message = extractOptimorouteErrorMessage(payload) ?? `OptimoRoute request failed with status ${status}`;
  const errorCode = extractErrorCode(payload);

  if (status === 429 || errorCode === "ERR_TOO_MANY_CONNECTIONS") {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403 || errorCode === "AUTH_KEY_UNKNOWN")) {
    return new ProviderRequestError(status || 403, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status || 400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractOptimorouteErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage =
    optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.description);
  if (directMessage) {
    return directMessage;
  }

  return optionalString(record.code);
}

function extractErrorCode(payload: unknown): string | undefined {
  return optionalString(optionalRecord(payload)?.code);
}

function isTopLevelOptimoRouteError(payload: unknown): boolean {
  const code = extractErrorCode(payload);
  return Boolean(code && (code.startsWith("AUTH_") || code.startsWith("ERR_") || code === "MALFORMED_REQUEST"));
}

function readRequiredObjectArray(
  value: unknown,
  fieldName: string,
  messagePrefix: string,
  status: number,
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(status, `${messagePrefix}: ${fieldName} must be an array`);
  }
  return value.map((item, index) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(status, `${messagePrefix}: ${fieldName}[${index}] must be an object`);
    }
    return record;
  });
}

function readOrderReferences(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  return readRequiredObjectArray(value, fieldName, "invalid optimoroute order reference input", 400).map(
    (record, index) => {
      if (!optionalString(record.orderNo) && !optionalString(record.id)) {
        throw new ProviderRequestError(400, `${fieldName}[${index}] must include orderNo or id`);
      }
      return record;
    },
  );
}

function readBulkResultArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  return readRequiredObjectArray(value, fieldName, "invalid optimoroute response", 502);
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `invalid optimoroute ${fieldName} response`);
  }
  return record;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `invalid optimoroute ${fieldName} response`);
  }
  return value;
}

function readOptionalString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, "invalid optimoroute string response");
  }
  return value;
}

function readOptionalObject(value: unknown, fieldName: string): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }
  return readRequiredObject(value, fieldName);
}

function readOptionalBooleanPayload(value: unknown, key: string): Record<string, boolean> {
  if (value == null) {
    return {};
  }
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(400, `${key} must be a boolean`);
  }
  return { [key]: value };
}

function normalizeBulkWriteResult(record: Record<string, unknown>): Record<string, unknown> {
  return {
    success: readRequiredBoolean(record.success, "success"),
    id: readOptionalString(record.id),
    orderNo: readOptionalString(record.orderNo),
    code: readOptionalString(record.code),
    message: readOptionalString(record.message),
    locationNo: readOptionalString(record.locationNo),
    raw: record,
  };
}

function normalizeBulkReadResult(record: Record<string, unknown>): Record<string, unknown> {
  const data = readOptionalObject(record.data, "data");
  const orderNoFromData = data ? (optionalString(data.orderNo) ?? null) : null;
  return {
    success: readRequiredBoolean(record.success, "success"),
    id: readOptionalString(record.id),
    orderNo: readOptionalString(record.orderNo) ?? orderNoFromData,
    code: readOptionalString(record.code),
    message: readOptionalString(record.message),
    data,
    raw: record,
  };
}

function normalizeBulkDeleteResult(record: Record<string, unknown>): Record<string, unknown> {
  return {
    success: readRequiredBoolean(record.success, "success"),
    id: readOptionalString(record.id),
    orderNo: readOptionalString(record.orderNo),
    code: readOptionalString(record.code),
    message: readOptionalString(record.message),
    raw: record,
  };
}
