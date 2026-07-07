import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ShipBobActionName } from "./actions.ts";

import { optionalBoolean, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "ship_bob";
const shipBobApiBaseUrl = "https://api.shipbob.com";
const shipBobApiVersionPath = "/2026-01";
const shipBobRequestTimeoutMs = 30_000;

type ShipBobRequestPhase = "validate" | "execute";
type QueryValue = string | number | boolean | readonly (string | number | boolean)[] | undefined;

interface ShipBobActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface ShipBobRequestOptions {
  context: ShipBobActionContext;
  path: string;
  phase: ShipBobRequestPhase;
  query?: Record<string, QueryValue>;
  notFoundAsInvalidInput?: boolean;
}

type ShipBobActionHandler = (input: Record<string, unknown>, context: ShipBobActionContext) => Promise<unknown>;

export const shipBobActionHandlers: Record<ShipBobActionName, ShipBobActionHandler> = {
  async list_channels(_input, context): Promise<unknown> {
    const payload = await requestShipBobJson({
      context,
      path: "/channel",
      phase: "execute",
    });

    return {
      channels: normalizeChannels(payload),
    };
  },

  async list_inventory_levels(input, context): Promise<unknown> {
    const payload = await requestShipBobJson({
      context,
      path: "/inventory-level",
      query: compactDefined({
        SearchBy: optionalQueryString(input.searchBy),
        InventoryIds: joinValues(input.inventoryIds),
        IsActive: optionalBoolean(input.isActive),
        IsDigital: optionalBoolean(input.isDigital),
        PageSize: optionalQueryNumber(input.pageSize),
        SortBy: optionalQueryString(input.sortBy),
      }),
      phase: "execute",
    });

    return normalizePagedResponse(payload, normalizeInventoryQuantity);
  },

  async get_inventory_level(input, context): Promise<unknown> {
    const inventoryId = readPositiveInteger(input.inventoryId, "inventoryId");
    const payload = await requestShipBobJson({
      context,
      path: `/inventory-level/${encodeURIComponent(String(inventoryId))}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      item: normalizeInventoryQuantity(readObject(payload, "ShipBob inventory level response")),
    };
  },

  async list_products(input, context): Promise<unknown> {
    const payload = await requestShipBobJson({
      context,
      path: "/product",
      query: compactDefined({
        Search: optionalQueryString(input.search),
        Barcode: optionalQueryString(input.barcode),
        Barcodes: joinValues(input.barcodes),
        CategoryIds: joinValues(input.categoryIds),
        ChannelIds: joinValues(input.channelIds),
        HasDigitalVariants: booleanAsString(input.hasDigitalVariants),
        HasVariants: booleanAsString(input.hasVariants),
        InventoryId: optionalQueryNumber(input.inventoryId),
        IsInventorySyncEnabled: booleanAsString(input.isInventorySyncEnabled),
        LastUpdatedTimestamp: optionalQueryString(input.lastUpdatedTimestamp),
        Name: optionalQueryString(input.name),
        OnHand: booleanAsString(input.onHand),
        ProductId: optionalQueryNumber(input.productId),
        ProductType: optionalQueryString(input.productType),
        SellerSKU: optionalQueryString(input.sellerSku),
        SKU: optionalQueryString(input.sku),
        VariantId: optionalQueryNumber(input.variantId),
        VariantStatus: optionalQueryString(input.variantStatus),
        PageSize: optionalQueryNumber(input.pageSize),
        SortBy: optionalQueryString(input.sortBy),
        SortOrder: optionalQueryString(input.sortOrder),
      }),
      phase: "execute",
    });

    return normalizePagedResponse(payload, (item) => item);
  },

  async list_locations(input, context): Promise<unknown> {
    const payload = await requestShipBobJson({
      context,
      path: "/location",
      query: compactDefined({
        IncludeInactive: optionalBoolean(input.includeInactive),
        ReceivingEnabled: optionalBoolean(input.receivingEnabled),
        AccessGranted: optionalBoolean(input.accessGranted),
      }),
      phase: "execute",
    });

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "invalid ShipBob locations response");
    }

    return {
      locations: payload.map((item) => normalizeLocation(readObject(item, "ShipBob location response item"))),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, shipBobActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: `${shipBobApiBaseUrl}${shipBobApiVersionPath}`,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ShipBobActionContext = { apiKey: input.apiKey, fetcher, signal };
    const payload = await requestShipBobJson({
      context,
      path: "/channel",
      phase: "validate",
    });
    const channels = normalizeChannels(payload);
    const firstChannel = channels[0];

    return {
      profile: {
        accountId: firstChannel ? String(firstChannel.id) : "api_key",
        displayName: firstChannel?.name ?? "ShipBob Personal Access Token",
      },
      grantedScopes: firstChannel?.scopes ?? [],
      metadata: compactDefined({
        apiBaseUrl: shipBobApiBaseUrl,
        defaultChannelId: firstChannel?.id,
        channelName: firstChannel?.name ?? undefined,
        applicationName: firstChannel?.applicationName ?? undefined,
      }),
    };
  },
};

async function requestShipBobJson(options: ShipBobRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(options.context.signal, shipBobRequestTimeoutMs);
  const url = new URL(`${shipBobApiBaseUrl}${shipBobApiVersionPath}${options.path}`);
  appendQuery(url, options.query);

  try {
    const response = await options.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readShipBobPayload(response);

    if (!response.ok) {
      throw mapShipBobError(response, payload, options.phase, options.notFoundAsInvalidInput);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "ShipBob request timed out");
    }

    throw new ProviderRequestError(500, error instanceof Error ? error.message : "ShipBob request failed");
  } finally {
    timeout.cleanup();
  }
}

function appendQuery(url: URL, query?: Record<string, QueryValue>): void {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        url.searchParams.set(key, value.map((item) => String(item)).join(","));
      }
      continue;
    }

    url.searchParams.set(key, String(value));
  }
}

async function readShipBobPayload(response: Response): Promise<unknown> {
  const rawBody = await response.text();
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : 502,
      `ShipBob returned invalid JSON: ${error instanceof Error ? error.message : rawBody}`,
    );
  }
}

function mapShipBobError(
  response: Response,
  payload: unknown,
  phase: ShipBobRequestPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = readShipBobErrorMessage(payload) ?? `ShipBob request failed with ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, { status: response.status });
  }

  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, { status: response.status });
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message, { status: response.status });
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, { status: response.status });
}

function readShipBobErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["detail", "title", "message", "error"]) {
    const value = optionalString(record[key]);
    if (value?.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function normalizePagedResponse<T>(
  payload: unknown,
  normalizeItem: (item: Record<string, unknown>) => T,
): Record<string, unknown> {
  const record = readObject(payload, "ShipBob paged response");
  const items = Array.isArray(record.items) ? record.items : [];
  return {
    first: nullableString(record.first),
    last: nullableString(record.last),
    next: nullableString(record.next),
    prev: nullableString(record.prev),
    items: items.map((item) => normalizeItem(readObject(item, "ShipBob paged response item"))),
  };
}

function normalizeChannels(payload: unknown): Array<{
  id: number;
  name: string | null;
  applicationName: string | null;
  scopes: string[];
  raw: Record<string, unknown>;
}> {
  const record = readObject(payload, "ShipBob channels response");
  const items = Array.isArray(record.items) ? record.items : [];
  return items.map((item) => normalizeChannel(readObject(item, "ShipBob channel response item")));
}

function normalizeChannel(record: Record<string, unknown>) {
  return {
    id: readInteger(record.id, "channel id"),
    name: nullableString(record.name),
    applicationName: nullableString(record.application_name),
    scopes: Array.isArray(record.scopes)
      ? record.scopes.filter((scope): scope is string => typeof scope === "string")
      : [],
    raw: record,
  };
}

function normalizeInventoryQuantity(record: Record<string, unknown>) {
  return {
    inventoryId: readInteger(record.inventory_id, "inventory id"),
    name: nullableString(record.name),
    sku: nullableString(record.sku),
    totalAwaitingQuantity: nullableInteger(record.total_awaiting_quantity),
    totalBackorderedQuantity: nullableInteger(record.total_backordered_quantity),
    totalCommittedQuantity: nullableInteger(record.total_committed_quantity),
    totalExceptionQuantity: nullableInteger(record.total_exception_quantity),
    totalFulfillableQuantity: nullableInteger(record.total_fulfillable_quantity),
    totalInternalTransferQuantity: nullableInteger(record.total_internal_transfer_quantity),
    totalOnHandQuantity: nullableInteger(record.total_on_hand_quantity),
    totalSellableQuantity: nullableInteger(record.total_sellable_quantity),
    raw: record,
  };
}

function normalizeLocation(record: Record<string, unknown>) {
  return {
    id: readInteger(record.id, "location id"),
    name: nullableString(record.name),
    abbreviation: nullableString(record.abbreviation),
    isActive: nullableBoolean(record.is_active),
    accessGranted: nullableBoolean(record.access_granted),
    isReceivingEnabled: nullableBoolean(record.is_receiving_enabled),
    isShippingEnabled: nullableBoolean(record.is_shipping_enabled),
    raw: record,
  };
}

function readObject(value: unknown, message: string): Record<string, unknown> {
  return requiredRecord(value, message, (errorMessage) => new ProviderRequestError(502, `invalid ${errorMessage}`));
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `invalid ShipBob ${fieldName}`);
  }
  return parsed;
}

function nullableInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function joinValues(value: unknown): string | undefined {
  return Array.isArray(value) ? value.join(",") : undefined;
}

function optionalQueryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalQueryNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function booleanAsString(value: unknown): string | undefined {
  if (typeof value !== "boolean") {
    return undefined;
  }
  return value ? "true" : "false";
}

function compactDefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}
