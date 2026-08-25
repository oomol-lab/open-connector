import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "ship_station";
const shipStationBaseUrl = "https://api.shipstation.com";

type ShipStationRequestPhase = "validate" | "execute";

interface ShipStationActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface ShipStationRequestInput {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

type ShipStationActionHandler = (input: Record<string, unknown>, context: ShipStationActionContext) => Promise<unknown>;

export const shipStationActionHandlers: ProviderActionHandlers<"ship_station", ShipStationActionHandler> = {
  list_inventory_levels(input, context) {
    return listInventoryLevels(input, context);
  },
  list_inventory_warehouses(_input, context) {
    return listInventoryWarehouses(context);
  },
  list_purchase_orders(input, context) {
    return listPurchaseOrders(input, context);
  },
  get_purchase_order(input, context) {
    return getPurchaseOrder(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, shipStationActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await shipStationRequest(
      { apiKey: input.apiKey, fetcher, signal },
      {
        path: "/v2/inventory_warehouses",
      },
      "validate",
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "ShipStation API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v2/inventory_warehouses",
      },
    };
  },
};

async function listInventoryLevels(
  input: Record<string, unknown>,
  context: ShipStationActionContext,
): Promise<unknown> {
  const payload = await shipStationRequest(
    context,
    {
      path: "/v2/inventory",
      query: buildInventoryLevelQuery(input),
    },
    "execute",
  );
  const response = readObject(payload, "ship_station list_inventory_levels returned no object");

  return {
    inventory: readArrayProperty(response, "inventory"),
    raw: response,
  };
}

async function listInventoryWarehouses(context: ShipStationActionContext): Promise<unknown> {
  const payload = await shipStationRequest(
    context,
    {
      path: "/v2/inventory_warehouses",
    },
    "execute",
  );
  const response = readObject(payload, "ship_station list_inventory_warehouses returned no object");

  return {
    inventoryWarehouses:
      readOptionalArrayProperty(response, "inventory_warehouses") ??
      readOptionalArrayProperty(response, "inventoryWarehouses") ??
      readArrayProperty(response, "warehouses"),
    raw: response,
  };
}

async function listPurchaseOrders(input: Record<string, unknown>, context: ShipStationActionContext): Promise<unknown> {
  const payload = await shipStationRequest(
    context,
    {
      path: "/v2/purchase_orders",
      query: buildPurchaseOrderQuery(input),
    },
    "execute",
  );
  const response = readObject(payload, "ship_station list_purchase_orders returned no object");

  return {
    purchaseOrders: readArrayProperty(response, "purchase_orders"),
    total: readNullableInteger(response.total),
    links: readNullableObject(response.links),
    nextCursor: extractNextCursor(response.links),
    raw: response,
  };
}

async function getPurchaseOrder(input: Record<string, unknown>, context: ShipStationActionContext): Promise<unknown> {
  const payload = await shipStationRequest(
    context,
    {
      path: `/v2/purchase_orders/${encodeURIComponent(String(input.purchaseOrderId))}`,
    },
    "execute",
  );

  return {
    purchaseOrder: readObject(payload, "ship_station get_purchase_order returned no object"),
  };
}

async function shipStationRequest(
  context: ShipStationActionContext,
  request: ShipStationRequestInput,
  phase: ShipStationRequestPhase,
): Promise<unknown> {
  const url = new URL(request.path, shipStationBaseUrl);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: request.method ?? "GET",
      headers: shipStationHeaders(context.apiKey, request.body !== undefined),
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? error.message : "ship_station request failed",
    );
  }

  let payload: unknown;
  try {
    payload = await readShipStationPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? error.message : "invalid ship_station response payload",
    );
  }

  if (!response.ok) {
    throw createShipStationError(response, payload, phase);
  }

  return payload;
}

function shipStationHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "API-Key": apiKey,
    "User-Agent": providerUserAgent,
  };
  if (hasJsonBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function readShipStationPayload(response: Response): Promise<unknown> {
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

function createShipStationError(
  response: Response,
  payload: unknown,
  phase: ShipStationRequestPhase,
): ProviderRequestError {
  const message =
    extractShipStationErrorMessage(payload) ??
    response.statusText ??
    `ship_station request failed with status ${response.status}`;

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, { status: response.status });
  }

  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, { status: response.status });
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, { status: response.status });
  }

  return new ProviderRequestError(response.status || 502, message, { status: response.status });
}

function extractShipStationErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const object = optionalRecord(payload);
  const errors = Array.isArray(object?.errors) ? object.errors : undefined;
  const firstError = optionalRecord(errors?.[0]);
  return (
    optionalString(object?.message) ??
    optionalString(object?.error) ??
    optionalString(firstError?.message) ??
    optionalString(firstError?.error)
  );
}

function buildInventoryLevelQuery(input: Record<string, unknown>): Record<string, string> {
  return compactQuery({
    sku: input.sku,
    inventory_warehouse_id: input.inventoryWarehouseId,
    inventory_location_id: input.inventoryLocationId,
    group_by: input.groupBy,
    limit: input.limit,
  });
}

function buildPurchaseOrderQuery(input: Record<string, unknown>): Record<string, string> {
  return compactQuery({
    order_number: input.orderNumber,
    status: input.status,
    warehouse_id: input.warehouseId,
    reference_number: input.referenceNumber,
    create_date_start: input.createDateStart,
    cursor: input.cursor,
    page_size: input.pageSize,
  });
}

function compactQuery(input: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    query[key] = String(value);
  }
  return query;
}

function readArrayProperty(object: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = object[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `ship_station response missing ${key}`);
  }
  return value.map((item) => readObject(item, `ship_station ${key} item was not an object`));
}

function readOptionalArrayProperty(
  object: Record<string, unknown>,
  key: string,
): Array<Record<string, unknown>> | undefined {
  const value = object[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `ship_station response ${key} was not an array`);
  }
  return value.map((item) => readObject(item, `ship_station ${key} item was not an object`));
}

function readNullableInteger(value: unknown): number | null {
  return optionalInteger(value) ?? null;
}

function readNullableObject(value: unknown): Record<string, unknown> | null {
  return optionalRecord(value) ?? null;
}

function extractNextCursor(value: unknown): string | null {
  const links = optionalRecord(value);
  const next = optionalRecord(links?.next);
  const href = optionalString(next?.href);
  if (!href) {
    return null;
  }

  try {
    const url = new URL(href, shipStationBaseUrl);
    return url.searchParams.get("cursor");
  } catch {
    return null;
  }
}

function readObject(value: unknown, message = "ship_station response item was not an object"): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message);
  }
  return object;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.shipstation.com",
  auth: { type: "api_key_header", name: "api-key" },
});
