import { randomUUID as randomUUIDv7 } from "node:crypto";
import { optionalNumber as asOptionalNumber, optionalString as asOptionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent as connectorUserAgent } from "../provider-runtime.ts";

export const walmartMarketplaceApiBaseUrl = "https://marketplace.walmartapis.com";
const tokenPath = "/v3/token";
const serviceName = "Walmart Marketplace";

interface WalmartMarketplaceCredential {
  clientId: string;
  clientSecret: string;
}

interface WalmartMarketplaceActionInput {
  actionName: string;
  input: Record<string, unknown>;
  values: Record<string, string>;
}

interface WalmartRequestInput {
  cursor?: string;
  credential: WalmartMarketplaceCredential;
  fetcher: typeof fetch;
  method?: string;
  path: string;
  phase?: "validate" | "execute";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

interface ValidationResult {
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export async function validateWalmartMarketplaceCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<ValidationResult> {
  const credential = readCredential(input);
  await exchangeAccessToken(credential, fetcher, "validate");
  return {
    accountLabel: `Walmart Marketplace ${abbreviateClientId(credential.clientId)}`,
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: walmartMarketplaceApiBaseUrl,
      clientIdSuffix: credential.clientId.slice(-6),
      market: "US",
      tokenEndpoint: tokenPath,
    },
  };
}

export async function executeWalmartMarketplaceAction(
  input: WalmartMarketplaceActionInput,
  fetcher: typeof fetch,
): Promise<unknown> {
  const credential = readCredential(input.values);
  const actionInput = input.input;
  switch (input.actionName) {
    case "list_items":
      return normalizeItemList(
        await requestWalmartJson({
          credential,
          fetcher,
          path: "/v3/items",
          query: buildItemListQuery(actionInput),
        }),
      );
    case "get_item":
      return {
        item: requireRecord(
          await requestWalmartJson({
            credential,
            fetcher,
            path: `/v3/items/${encodeURIComponent(requireString(actionInput.productId, "productId"))}`,
            query: { productIdType: asOptionalString(actionInput.productIdType) },
          }),
          "item",
        ),
      };
    case "list_orders":
      return normalizeOrderList(
        await requestWalmartJson({
          credential,
          fetcher,
          path: "/v3/orders",
          cursor: readOrderCursor(actionInput),
          query: buildOrderListQuery(actionInput),
        }),
      );
    case "get_order": {
      const payload = requireRecord(
        await requestWalmartJson({
          credential,
          fetcher,
          path: `/v3/orders/${encodeURIComponent(requireString(actionInput.purchaseOrderId, "purchaseOrderId"))}`,
        }),
        "order",
      );
      return { order: readRecord(payload.order) ?? payload };
    }
    case "get_inventory":
      return {
        inventory: requireRecord(
          await requestWalmartJson({
            credential,
            fetcher,
            path: "/v3/inventory",
            query: {
              sku: requireString(actionInput.sku, "sku"),
              shipNode: asOptionalString(actionInput.shipNode),
            },
          }),
          "inventory",
        ),
      };
    case "update_inventory":
      return {
        inventory: requireRecord(
          await requestWalmartJson({
            credential,
            fetcher,
            method: "PUT",
            path: "/v3/inventory",
            query: {
              sku: requireString(actionInput.sku, "sku"),
              shipNode: asOptionalString(actionInput.shipNode),
            },
            body: {
              sku: requireString(actionInput.sku, "sku"),
              quantity: {
                unit: "EACH",
                amount: requireNonNegativeInteger(actionInput.amount, "amount"),
              },
            },
          }),
          "inventory",
        ),
      };
  }
}

export function readCredential(input: Record<string, string>): WalmartMarketplaceCredential {
  return {
    clientId: requireCredential(input.clientId, "clientId"),
    clientSecret: requireCredential(input.clientSecret, "clientSecret"),
  };
}

export async function exchangeAccessToken(
  credential: WalmartMarketplaceCredential,
  fetcher: typeof fetch,
  phase: "validate" | "execute",
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(`${walmartMarketplaceApiBaseUrl}${tokenPath}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${credential.clientId}:${credential.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": connectorUserAgent,
        "WM_QOS.CORRELATION_ID": randomUUIDv7(),
        "WM_SVC.NAME": serviceName,
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `walmart marketplace token request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw mapWalmartError(response.status, payload, phase);
  }
  const accessToken = asOptionalString(readRecord(payload)?.access_token);
  if (!accessToken) {
    throw new ProviderRequestError(502, "walmart marketplace token response is missing access_token");
  }
  return accessToken;
}

async function requestWalmartJson(input: WalmartRequestInput) {
  const accessToken = await exchangeAccessToken(input.credential, input.fetcher, input.phase ?? "execute");
  const url = new URL(input.path, walmartMarketplaceApiBaseUrl);
  if (input.cursor) url.search = input.cursor;
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value != null) url.searchParams.set(name, String(value));
  }
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": connectorUserAgent,
  });
  applyMarketplaceHeaders(headers, accessToken);
  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body == null ? undefined : JSON.stringify(input.body),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `walmart marketplace request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const payload = await readResponsePayload(response);
  if (!response.ok) throw mapWalmartError(response.status, payload, input.phase ?? "execute");
  return payload;
}

export function applyMarketplaceHeaders(headers: Headers, accessToken: string): void {
  headers.set("WM_SEC.ACCESS_TOKEN", accessToken);
  headers.set("WM_QOS.CORRELATION_ID", randomUUIDv7());
  headers.set("WM_SVC.NAME", serviceName);
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "walmart marketplace returned non-JSON");
  }
}

function mapWalmartError(status: number, payload: unknown, phase: "validate" | "execute") {
  const record = readRecord(payload);
  const structuredError = readFirstStructuredError(record?.errors);
  const message =
    asOptionalString(record?.message) ??
    asOptionalString(record?.error_description) ??
    asOptionalString(readRecord(record?.error)?.description) ??
    structuredError ??
    `walmart marketplace request failed with HTTP ${status}`;
  if (status === 401) {
    return phase === "validate" ? new ProviderRequestError(400, message) : new ProviderRequestError(401, message);
  }
  if (status === 403) {
    return phase === "validate" ? new ProviderRequestError(400, message) : new ProviderRequestError(403, message);
  }
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 400 || status === 404 || status === 409) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function normalizeItemList(payload: unknown) {
  const record = requireRecord(payload, "item list");
  const rawItems = record.ItemResponse === undefined ? record.itemResponse : record.ItemResponse;
  const items = readRecordArray(rawItems);
  if (!items) {
    throw new ProviderRequestError(502, "walmart marketplace item list is missing ItemResponse");
  }
  return {
    items,
    totalItems: asOptionalNumber(record.totalItems) ?? null,
    nextCursor: asOptionalString(record.nextCursor) ?? null,
  };
}

function normalizeOrderList(payload: unknown) {
  const record = requireRecord(payload, "order list");
  const list = readRecord(record.list);
  const elements = readRecord(list?.elements);
  const orders = readRecordArray(elements?.order);
  const meta = readRecord(list?.meta);
  if (!orders || !meta) {
    throw new ProviderRequestError(502, "walmart marketplace order list is missing list.meta or list.elements.order");
  }
  return {
    orders,
    meta,
  };
}

function buildItemListQuery(input: Record<string, unknown>) {
  const nextCursor = asOptionalString(input.nextCursor);
  if (nextCursor && input.offset != null) {
    throw new ProviderRequestError(400, "nextCursor and offset are alternative Walmart item pagination modes");
  }
  return {
    nextCursor,
    offset: asOptionalNumber(input.offset),
    limit: asOptionalNumber(input.limit),
    sku: asOptionalString(input.sku),
    gtin: asOptionalString(input.gtin),
    lifecycleStatus: asOptionalString(input.lifecycleStatus),
    publishedStatus: asOptionalString(input.publishedStatus),
  };
}

function readOrderCursor(input: Record<string, unknown>) {
  const cursor = asOptionalString(input.nextCursor);
  if (!cursor) return undefined;
  const otherFields = Object.entries(input).filter(([name, value]) => name !== "nextCursor" && value != null);
  if (otherFields.length > 0) {
    throw new ProviderRequestError(400, "nextCursor cannot be combined with Walmart order filters or limit");
  }
  if (!cursor.startsWith("?")) {
    throw new ProviderRequestError(
      400,
      "Walmart order nextCursor must be the query string returned by the previous response",
    );
  }
  return cursor;
}

function buildOrderListQuery(input: Record<string, unknown>) {
  if (asOptionalString(input.nextCursor)) return undefined;
  return {
    createdStartDate: asOptionalString(input.createdStartDate),
    createdEndDate: asOptionalString(input.createdEndDate),
    lastModifiedStartDate: asOptionalString(input.lastModifiedStartDate),
    lastModifiedEndDate: asOptionalString(input.lastModifiedEndDate),
    status: asOptionalString(input.status),
    sku: asOptionalString(input.sku),
    customerOrderId: asOptionalString(input.customerOrderId),
    purchaseOrderId: asOptionalString(input.purchaseOrderId),
    limit: asOptionalNumber(input.limit),
  };
}

function readFirstStructuredError(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    const record = readRecord(item);
    const description =
      asOptionalString(record?.description) ?? asOptionalString(record?.info) ?? asOptionalString(record?.message);
    if (!description) continue;
    const code = asOptionalString(record?.code);
    const field = asOptionalString(record?.field);
    const context = [code, field].filter(Boolean).join(" ");
    return context ? `${context}: ${description}` : description;
  }
  return undefined;
}

function requireCredential(value: string | undefined, fieldName: string) {
  if (!value?.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function requireNonNegativeInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-negative integer`);
  }
  return value;
}

function requireRecord(value: unknown, label: string) {
  const record = readRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `walmart marketplace returned invalid ${label}`);
  }
  return record;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readRecordArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const records = value.map(readRecord);
  if (records.some((item) => item == null)) return undefined;
  return records.filter((item): item is Record<string, unknown> => item != null);
}

function abbreviateClientId(clientId: string) {
  return clientId.length <= 10 ? clientId : `${clientId.slice(0, 4)}…${clientId.slice(-4)}`;
}
