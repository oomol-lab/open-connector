import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ShipdayActionName } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "shipday";
const shipdayBaseUrl = "https://api.shipday.com";

type ShipdayRequestPhase = "validate" | "execute";
type ShipdayQueryValue = string | number | boolean | undefined;

interface ShipdayActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface ShipdayRequestInput {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, ShipdayQueryValue>;
  body?: unknown;
}

type ShipdayActionHandler = (input: Record<string, unknown>, context: ShipdayActionContext) => Promise<unknown>;

export const shipdayActionHandlers: Record<ShipdayActionName, ShipdayActionHandler> = {
  list_active_orders(_input, context) {
    return listActiveOrders(context);
  },
  get_order(input, context) {
    return getOrder(input, context);
  },
  create_order(input, context) {
    return createOrder(input, context);
  },
  edit_order(input, context) {
    return editOrder(input, context);
  },
  delete_order(input, context) {
    return deleteOrder(input, context);
  },
  list_carriers(_input, context) {
    return listCarriers(context);
  },
  get_order_progress(input, context) {
    return getOrderProgress(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, shipdayActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: shipdayBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Basic " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await shipdayRequest(
      { apiKey: input.apiKey, fetcher, signal },
      {
        path: "/carriers",
      },
      "validate",
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "Shipday API Key",
      },
      grantedScopes: [],
      metadata: compactDefined({
        validationEndpoint: "/carriers",
        firstCarrierName: readFirstCarrierName(payload),
      }),
    };
  },
};

async function listActiveOrders(context: ShipdayActionContext): Promise<unknown> {
  const payload = await shipdayRequest(context, { path: "/orders" }, "execute");
  return {
    orders: readArray(payload, "shipday list_active_orders did not return a list"),
  };
}

async function getOrder(input: Record<string, unknown>, context: ShipdayActionContext): Promise<unknown> {
  const payload = await shipdayRequest(
    context,
    {
      path: `/orders/${encodeURIComponent(String(input.orderNumber))}`,
    },
    "execute",
  );

  return {
    order: readObject(payload, "shipday get_order did not return an object"),
  };
}

async function createOrder(input: Record<string, unknown>, context: ShipdayActionContext): Promise<unknown> {
  const payload = await shipdayRequest(
    context,
    {
      method: "POST",
      path: "/orders",
      body: input,
    },
    "execute",
  );

  const response = readObject(payload, "shipday create_order did not return an object");
  return {
    success: response.success === true,
    response: optionalString(response.response) ?? "",
    orderId: readOrderId(response.orderId, "shipday response missing orderId"),
    raw: payload,
  };
}

async function editOrder(input: Record<string, unknown>, context: ShipdayActionContext): Promise<unknown> {
  const orderId = readOrderId(input.orderId, "orderId must be an integer");
  const payload = await shipdayRequest(
    context,
    {
      method: "PUT",
      path: `/order/edit/${orderId}`,
      body: input,
    },
    "execute",
  );

  return {
    success: true,
    orderId,
    raw: payload,
  };
}

async function deleteOrder(input: Record<string, unknown>, context: ShipdayActionContext): Promise<unknown> {
  const orderId = readOrderId(input.orderId, "orderId must be an integer");
  const payload = await shipdayRequest(
    context,
    {
      method: "DELETE",
      path: `/orders/${orderId}`,
    },
    "execute",
  );

  return {
    success: true,
    orderId,
    raw: payload,
  };
}

async function listCarriers(context: ShipdayActionContext): Promise<unknown> {
  const payload = await shipdayRequest(context, { path: "/carriers" }, "execute");
  return {
    carriers: readArray(payload, "shipday list_carriers did not return a list"),
  };
}

async function getOrderProgress(input: Record<string, unknown>, context: ShipdayActionContext): Promise<unknown> {
  const payload = await shipdayRequest(
    context,
    {
      path: `/order/progress/${encodeURIComponent(String(input.trackingId))}`,
      query: {
        isStaticDataRequired: typeof input.isStaticDataRequired === "boolean" ? input.isStaticDataRequired : undefined,
      },
    },
    "execute",
  );

  return {
    progress: readObject(payload, "shipday get_order_progress did not return an object"),
  };
}

async function shipdayRequest(
  context: ShipdayActionContext,
  request: ShipdayRequestInput,
  phase: ShipdayRequestPhase,
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(buildShipdayUrl(request.path, request.query), {
      method: request.method ?? "GET",
      headers: shipdayHeaders(context.apiKey, request.body !== undefined),
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? error.message : "shipday request failed",
    );
  }

  let payload: unknown;
  try {
    payload = await readShipdayPayload(response);
  } catch (error) {
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "invalid shipday response payload");
  }

  if (!response.ok) {
    throw createShipdayError(response, payload, phase);
  }

  return payload;
}

function buildShipdayUrl(path: string, query?: Record<string, ShipdayQueryValue>): URL {
  const url = new URL(path, shipdayBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function shipdayHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Basic ${apiKey}`,
    "User-Agent": providerUserAgent,
  };
  if (hasJsonBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function readShipdayPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createShipdayError(response: Response, payload: unknown, phase: ShipdayRequestPhase): ProviderRequestError {
  const message =
    extractShipdayErrorMessage(payload) ??
    response.statusText ??
    `shipday request failed with status ${response.status}`;

  if (phase === "validate" && (response.status === 400 || response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, { status: response.status });
  }

  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, { status: response.status });
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, { status: response.status });
  }

  return new ProviderRequestError(response.status || 502, message, { status: response.status });
}

function extractShipdayErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const object = optionalRecord(payload);
  return optionalString(object?.message) ?? optionalString(object?.error) ?? optionalString(object?.response);
}

function readArray(value: unknown, message: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value.map((item, index) => readObject(item, `${message}: item ${index} was not an object`));
}

function readObject(value: unknown, message: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message);
  }
  return object;
}

function readOrderId(value: unknown, message: string): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new ProviderRequestError(502, message);
}

function readFirstCarrierName(payload: unknown): string | undefined {
  if (!Array.isArray(payload)) {
    return undefined;
  }
  return optionalString(optionalRecord(payload[0])?.name);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function compactDefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
