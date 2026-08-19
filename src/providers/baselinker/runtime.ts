import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { BaseLinkerActionName } from "./actions.ts";

import { compactObject, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const baseLinkerApiBaseUrl: string = "https://api.baselinker.com";
export const baseLinkerConnectorUrl: string = `${baseLinkerApiBaseUrl}/connector.php`;

type BaseLinkerPhase = "validate" | "execute";
type BaseLinkerApiMethod =
  | "getOrderStatusList"
  | "getOrders"
  | "getJournalList"
  | "getInventories"
  | "getInventoryWarehouses"
  | "getInventoryProductsList";

export interface BaseLinkerActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type BaseLinkerActionHandler = (input: Record<string, unknown>, context: BaseLinkerActionContext) => Promise<unknown>;

const methodByActionName = {
  list_order_statuses: "getOrderStatusList",
  list_orders: "getOrders",
  list_order_events: "getJournalList",
  list_inventories: "getInventories",
  list_inventory_warehouses: "getInventoryWarehouses",
  list_inventory_products: "getInventoryProductsList",
} satisfies Record<BaseLinkerActionName, BaseLinkerApiMethod>;

export const baseLinkerActionHandlers: ProviderActionHandlers<"baselinker", BaseLinkerActionHandler> = {
  list_order_statuses(input, context) {
    return executeBaseLinkerMethod("list_order_statuses", input, context);
  },
  list_orders(input, context) {
    return executeBaseLinkerMethod("list_orders", input, context);
  },
  list_order_events(input, context) {
    return executeBaseLinkerMethod("list_order_events", input, context);
  },
  list_inventories(input, context) {
    return executeBaseLinkerMethod("list_inventories", input, context);
  },
  list_inventory_warehouses(input, context) {
    return executeBaseLinkerMethod("list_inventory_warehouses", input, context);
  },
  list_inventory_products(input, context) {
    return executeBaseLinkerMethod("list_inventory_products", input, context);
  },
};

export async function validateBaseLinkerCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestBaseLinker({
    apiKey,
    method: "getOrderStatusList",
    parameters: {},
    fetcher,
    signal,
    phase: "validate",
  });
  const statuses = Array.isArray(payload.statuses) ? payload.statuses : [];

  return {
    profile: {
      accountId: "baselinker",
      displayName: "BaseLinker API Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: baseLinkerApiBaseUrl,
      validationMethod: "getOrderStatusList",
      statusCount: statuses.length,
    },
  };
}

async function executeBaseLinkerMethod(
  actionName: BaseLinkerActionName,
  input: Record<string, unknown>,
  context: BaseLinkerActionContext,
) {
  const payload = await requestBaseLinker({
    apiKey: context.apiKey,
    method: methodByActionName[actionName],
    parameters: compactObject(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return stripBaseLinkerStatus(payload);
}

async function requestBaseLinker(input: {
  apiKey: string;
  method: BaseLinkerApiMethod;
  parameters: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: BaseLinkerPhase;
}): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await input.fetcher(baseLinkerConnectorUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": providerUserAgent,
        "X-BLToken": input.apiKey,
      },
      body: encodeBaseLinkerRequest(input.method, input.parameters),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `BaseLinker request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let rawBody: string;
  try {
    rawBody = await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `BaseLinker response read failed with HTTP ${response.status}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const payload = parseBaseLinkerPayload(response.status, rawBody);
  const providerError = readBaseLinkerError(payload);
  if (providerError) {
    throw mapBaseLinkerError(providerError, input.phase);
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : response.status || 500,
      `BaseLinker request failed with HTTP ${response.status}`,
    );
  }

  if (payload.status !== "SUCCESS") {
    throw new ProviderRequestError(502, `BaseLinker returned an unexpected status for ${input.method}`);
  }

  return payload;
}

function encodeBaseLinkerRequest(method: BaseLinkerApiMethod, parameters: Record<string, unknown>) {
  const body = new URLSearchParams();
  body.set("method", method);
  body.set("parameters", JSON.stringify(parameters));
  return body;
}

function parseBaseLinkerPayload(status: number, rawBody: string): Record<string, unknown> {
  if (!rawBody) {
    return {};
  }

  try {
    const payload = JSON.parse(rawBody) as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  } catch (error) {
    throw new ProviderRequestError(
      status === 429 ? 429 : 502,
      `BaseLinker returned invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`,
    );
  }
}

function readBaseLinkerError(payload: Record<string, unknown>) {
  if (payload.status !== "ERROR") {
    return undefined;
  }

  return {
    code: optionalString(payload.error_code),
    message: optionalString(payload.error_message) ?? "BaseLinker API request failed",
  };
}

function mapBaseLinkerError(error: { code?: string; message: string }, phase: BaseLinkerPhase) {
  const code = (error.code ?? "").toLowerCase();
  const message = error.message.toLowerCase();

  if (code.includes("token") || code.includes("auth") || message.includes("token")) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, error.message);
  }

  if (code.includes("limit") || message.includes("limit")) {
    return new ProviderRequestError(429, error.message);
  }

  if (code.includes("param") || code.includes("input") || message.includes("parameter")) {
    return new ProviderRequestError(400, error.message);
  }

  return new ProviderRequestError(502, error.message);
}

function stripBaseLinkerStatus(payload: Record<string, unknown>) {
  const result = { ...payload };
  delete result.status;
  return result;
}
