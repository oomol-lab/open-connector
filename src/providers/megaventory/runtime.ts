import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
export const megaventoryApiBaseUrl = "https://api.megaventory.com/v2017a";
const timeoutMs = 30_000;
const recordAction = "InsertOrUpdateNonEmptyFields";
const lists: Record<string, { path: string; responseKey: string; outputKey: string }> = {
  list_products: { path: "/Product/ProductGet", responseKey: "mvProducts", outputKey: "products" },
  list_supplier_clients: {
    path: "/SupplierClient/SupplierClientGet",
    responseKey: "mvSupplierClients",
    outputKey: "supplierClients",
  },
  list_inventory_locations: {
    path: "/InventoryLocation/InventoryLocationGet",
    responseKey: "mvInventoryLocations",
    outputKey: "inventoryLocations",
  },
  list_document_types: {
    path: "/DocumentType/DocumentTypeGet",
    responseKey: "mvDocumentTypes",
    outputKey: "documentTypes",
  },
  list_sales_orders: { path: "/SalesOrder/SalesOrderGet", responseKey: "mvSalesOrders", outputKey: "salesOrders" },
  list_purchase_orders: {
    path: "/PurchaseOrder/PurchaseOrderGet",
    responseKey: "mvPurchaseOrders",
    outputKey: "purchaseOrders",
  },
};
function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
function listBody(input: Record<string, unknown>) {
  return compact({
    Filters: Array.isArray(input.filters)
      ? input.filters.map((item) => {
          const filter = object(item, "filter");
          return compact({
            FieldName: optionalString(filter.fieldName),
            SearchOperator: optionalString(filter.searchOperator),
            SearchValue: filter.searchValue,
            AndOr: optionalString(filter.andOr),
            Group: optionalString(filter.group),
          });
        })
      : undefined,
    ReturnTopNRecords: optionalInteger(input.returnTopNRecords),
  });
}
async function execute(name: string, input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const config = lists[name];
  if (config) {
    const record = await request(config.path, listBody(input), context, "execute");
    return {
      [config.outputKey]: array(record[config.responseKey], config.responseKey),
      responseStatus: status(record),
    };
  }
  if (name === "upsert_product") {
    const record = await request(
      "/Product/ProductUpdate",
      {
        mvRecordAction: recordAction,
        mvProduct: compact({
          ProductSKU: optionalString(input.productSku),
          ProductDescription: optionalString(input.productDescription),
          ProductType: optionalString(input.productType),
          ProductVersion: optionalString(input.productVersion),
          ProductEAN: optionalString(input.productEan),
          ProductUnitOfMeasurement: optionalString(input.unitOfMeasurement),
          ProductSellingPrice: input.sellingPrice,
          ProductPurchasePrice: input.purchasePrice,
          ProductComments: optionalString(input.comments),
          ProductImageURL: optionalString(input.imageUrl),
        }),
      },
      context,
      "execute",
    );
    return { product: object(record.mvProduct, "mvProduct"), responseStatus: status(record) };
  }
  return updateOrder(name === "upsert_sales_order" ? "sales" : "purchase", input, context);
}
async function updateOrder(kind: "sales" | "purchase", input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const prefix = kind === "sales" ? "SalesOrder" : "PurchaseOrder";
  const details = array(input.details, "details").map((item) => {
    const row = object(item, "order detail");
    return compact({
      [`${prefix}RowProductSKU`]: optionalString(row.productSku),
      [`${prefix}RowQuantity`]: row.quantity,
      [`${prefix}RowUnitPriceWithoutTaxOrDiscount`]: row.unitPrice,
      [`${prefix}RowTaxID`]: row.taxId,
      [`${prefix}RowDiscountID`]: row.discountId,
      [`${prefix}RowRemarks`]: optionalString(row.remarks),
    });
  });
  const sales = kind === "sales";
  const key = sales ? "mvSalesOrder" : "mvPurchaseOrder";
  const order = compact({
    [`${prefix}Id`]: optionalInteger(input.orderId),
    [`${prefix}TypeId`]: optionalInteger(input.orderTypeId),
    [sales ? "SalesOrderClientID" : "PurchaseOrderSupplierID"]: optionalInteger(
      sales ? input.clientId : input.supplierId,
    ),
    [`${prefix}InventoryLocationID`]: optionalInteger(input.inventoryLocationId),
    [`${prefix}Status`]: optionalString(input.status),
    [`${prefix}No`]: optionalString(input.orderNumber),
    [`${prefix}ReferenceNo`]: optionalString(input.referenceNumber),
    [`${prefix}Comments`]: optionalString(input.comments),
    [`${prefix}Details`]: details,
  });
  const record = await request(
    `/${prefix}/${prefix}Update`,
    { mvRecordAction: recordAction, [key]: order },
    context,
    "execute",
  );
  return compact({
    order: object(record[key], key),
    responseStatus: status(record),
    entityId: optionalInteger(record.entityID),
    relatedDocumentId: optionalInteger(record.relatedDocumentID),
  });
}
const handler =
  (name: string): ProviderRuntimeHandler<ApiKeyProviderContext> =>
  (input, context) =>
    execute(name, input, context);
export const megaventoryActionHandlers: ProviderActionHandlers<
  "megaventory",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  list_products: handler("list_products"),
  list_supplier_clients: handler("list_supplier_clients"),
  list_inventory_locations: handler("list_inventory_locations"),
  list_document_types: handler("list_document_types"),
  list_sales_orders: handler("list_sales_orders"),
  list_purchase_orders: handler("list_purchase_orders"),
  upsert_product: handler("upsert_product"),
  upsert_sales_order: handler("upsert_sales_order"),
  upsert_purchase_order: handler("upsert_purchase_order"),
};
export async function validateMegaventoryCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await request("/APIkey/APIkeyGet", {}, { apiKey, fetcher, signal }, "validate");
  return {
    profile: { displayName: "Megaventory API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: megaventoryApiBaseUrl },
  };
}
async function request(
  path: string,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
) {
  const timeout = createProviderTimeout(context.signal, timeoutMs);
  try {
    const response = await context.fetcher(`${megaventoryApiBaseUrl}${path}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "user-agent": providerUserAgent },
      body: JSON.stringify({ APIKEY: context.apiKey, ...body }),
      signal: timeout.signal,
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new ProviderRequestError(502, "Megaventory returned invalid JSON");
      }
    }
    if (!response.ok) throw error(response.status, payload, phase);
    const record = object(payload, "Megaventory response");
    if (status(record).ErrorCode !== "0") throw error(200, record, phase);
    return record;
  } catch (cause) {
    if (cause instanceof ProviderRequestError) throw cause;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "Megaventory request timed out");
    throw new ProviderRequestError(
      502,
      `Megaventory request failed: ${cause instanceof Error ? cause.message : "unknown error"}`,
    );
  } finally {
    timeout.cleanup();
  }
}
function status(record: Record<string, unknown>) {
  const value = object(record.ResponseStatus, "ResponseStatus");
  const ErrorCode = optionalString(value.ErrorCode);
  if (!ErrorCode) throw new ProviderRequestError(502, "Megaventory response omitted ResponseStatus.ErrorCode");
  return compact({ ErrorCode, Message: optionalString(value.Message) });
}
function error(code: number, payload: unknown, phase: "validate" | "execute") {
  const message =
    optionalString(optionalRecord(optionalRecord(payload)?.ResponseStatus)?.Message) ??
    `Megaventory request failed with status ${code}`;
  if (code === 429) return new ProviderRequestError(429, message);
  if (phase === "validate") return new ProviderRequestError(400, message);
  if (
    message.toLowerCase().includes("api key") ||
    message.toLowerCase().includes("apikey") ||
    code === 401 ||
    code === 403
  )
    return new ProviderRequestError(401, message);
  if (code < 500) return new ProviderRequestError(400, message);
  return new ProviderRequestError(code || 502, message);
}
function object(value: unknown, label: string): Record<string, unknown> {
  const result = optionalRecord(value);
  if (!result) throw new ProviderRequestError(502, `Megaventory response omitted ${label}`);
  return result;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `Megaventory response omitted ${label}`);
  return value;
}
