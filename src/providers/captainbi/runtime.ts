import type { CredentialValidationResult } from "../../core/types.ts";

import {
  compactObject,
  optionalInteger as asOptionalInteger,
  optionalRecord as asOptionalObject,
  optionalString as asOptionalString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  providerUserAgent as connectorUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const captainBiApiBaseUrl: string = "https://openapi.captainbi.com";
export const captainBiTokenUrl: string = `${captainBiApiBaseUrl}/oauth2/token`;
const defaultPage = 1;
const defaultRows = 100;

interface CaptainBiCredential {
  clientId: string;
  clientSecret: string;
}

interface CaptainBiActionInput {
  actionName: string;
  input: Record<string, unknown>;
  values: Record<string, unknown>;
}

interface CaptainBiPage {
  items: unknown[];
  message: string | null;
  total: number | null;
}

type CaptainBiRequestPhase = "validate" | "execute";

export async function validateCaptainBiCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  await exchangeCaptainBiAccessToken(readCaptainBiCredential(input), fetcher, "validate");
  return {
    profile: { displayName: "CaptainBI API" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: captainBiApiBaseUrl,
      tokenEndpoint: captainBiTokenUrl,
    },
  };
}

export async function executeCaptainBiAction(
  actionInput: CaptainBiActionInput,
  fetcher: typeof fetch,
): Promise<unknown> {
  const input = actionInput.input;
  validateCaptainBiInput(actionInput.actionName, input);
  const accessToken = await exchangeCaptainBiAccessToken(
    readCaptainBiCredential(actionInput.values),
    fetcher,
    "execute",
  );
  const page = asOptionalInteger(input.page) ?? defaultPage;
  const rows = asOptionalInteger(input.rows) ?? defaultRows;
  const common = { accessToken, fetcher, page, rows };

  switch (actionInput.actionName) {
    case "list_stores": {
      const response = await requestCaptainBiPage({
        ...common,
        path: "/v1/open_user/get_channel_list",
        operation: "list stores",
        query: {
          start_modified_time: input.startModifiedTime,
          end_modified_time: input.endModifiedTime,
        },
      });
      return normalizePage(response, page, rows, "stores", normalizeStore);
    }
    case "list_products": {
      const response = await requestCaptainBiPage({
        ...common,
        path: "/v1/open_goods/get_goods_list",
        operation: "list products",
        openChannelId: requiredString(input.openChannelId, "openChannelId"),
        query: modifiedTimeQuery(input),
      });
      return normalizePage(response, page, rows, "products", normalizeProduct);
    }
    case "list_product_details": {
      const response = await requestCaptainBiPage({
        ...common,
        path: "/v1/open_goods/get_goods_item_list",
        operation: "list product details",
        openChannelId: requiredString(input.openChannelId, "openChannelId"),
        query: modifiedTimeQuery(input),
      });
      return normalizePage(response, page, rows, "productDetails", normalizeProductDetail);
    }
    case "list_inventory": {
      const response = await requestCaptainBiPage({
        ...common,
        path: "/v1/open_fba/inventory_list",
        operation: "list inventory",
        openChannelId: requiredString(input.openChannelId, "openChannelId"),
        query: {
          ...modifiedTimeQuery(input),
          sku: input.sku,
          asin: input.asin,
        },
      });
      return normalizePage(response, page, rows, "inventory", normalizeInventory);
    }
    case "get_business_report": {
      const response = await requestCaptainBiPage({
        ...common,
        path: "/v1/open_goods/get_business_report",
        operation: "get business report",
        openChannelId: requiredString(input.openChannelId, "openChannelId"),
        query: {
          start_create_time: input.startCreateTime,
          end_create_time: input.endCreateTime,
        },
      });
      return normalizePage(response, page, rows, "metrics", normalizeBusinessMetric);
    }
    case "get_store_profit_report":
    case "get_product_profit_report": {
      const period = requiredEnum(input.period, "period", ["day", "month"]);
      const accountingBasis = requiredEnum(input.accountingBasis, "accountingBasis", ["order", "finance"]);
      const reportDate = requiredString(input.reportDate, "reportDate");
      const dimension = actionInput.actionName === "get_store_profit_report" ? "channel" : "goods";
      const endpoint = period === "month" ? "get_month_analysis" : "get_analysis";
      const response = await requestCaptainBiPage({
        ...common,
        path: `/v1/open_${dimension}_finance/${endpoint}_by_${accountingBasis}`,
        operation:
          actionInput.actionName === "get_store_profit_report"
            ? "get store profit report"
            : "get product profit report",
        openChannelId: requiredString(input.openChannelId, "openChannelId"),
        query: { report_date: reportDate },
      });
      return normalizePage(response, page, rows, "profits", normalizeProfit);
    }
    case "list_returns": {
      const response = await requestCaptainBiPage({
        ...common,
        path: "/v1/open_order/get_return_report",
        operation: "list returns",
        openChannelId: requiredString(input.openChannelId, "openChannelId"),
        query: {
          ...modifiedTimeQuery(input),
          report_date: input.reportDate,
        },
      });
      return normalizePage(response, page, rows, "returns", normalizeReturn);
    }
    case "list_refunds": {
      const response = await requestCaptainBiPage({
        ...common,
        path: "/v1/open_order/get_refund_list",
        operation: "list refunds",
        openChannelId: requiredString(input.openChannelId, "openChannelId"),
        query: {
          ...modifiedTimeQuery(input),
          report_date: input.reportDate,
        },
      });
      return normalizePage(response, page, rows, "refunds", normalizeRefund);
    }
    default: {
      throw new ProviderRequestError(502, `unsupported captainbi action: ${actionInput.actionName}`);
    }
  }
}

function validateCaptainBiInput(actionName: string, input: Record<string, unknown>): void {
  if (actionName === "get_store_profit_report" || actionName === "get_product_profit_report") {
    const period = requiredString(input.period, "period");
    const reportDate = requiredString(input.reportDate, "reportDate");
    const expected = period === "month" ? 6 : 8;
    if (reportDate.length !== expected)
      throw new ProviderRequestError(400, `reportDate must use ${period === "month" ? "YYYYMM" : "YYYYMMDD"} format`);
    return;
  }
  const created = actionName === "get_business_report";
  validateTimestampRange(
    input,
    created ? "startCreateTime" : "startModifiedTime",
    created ? "endCreateTime" : "endModifiedTime",
  );
}

function validateTimestampRange(input: Record<string, unknown>, startField: string, endField: string): void {
  const start = input[startField];
  const end = input[endField];
  if ((start == null) !== (end == null))
    throw new ProviderRequestError(400, `${startField} and ${endField} must be provided together`);
  if (typeof start !== "number" || typeof end !== "number") return;
  const milliseconds = start > 10_000_000_000;
  if (milliseconds !== end > 10_000_000_000)
    throw new ProviderRequestError(400, `${startField} and ${endField} must use the same timestamp unit`);
  if (start > end) throw new ProviderRequestError(400, `${startField} must not be later than ${endField}`);
  if (end - start > (milliseconds ? 2_678_400_000 : 2_678_400))
    throw new ProviderRequestError(400, "CaptainBI timestamp ranges cannot exceed 31 days");
}

export async function exchangeCaptainBiAccessToken(
  credential: CaptainBiCredential,
  fetcher: typeof fetch,
  phase: CaptainBiRequestPhase,
): Promise<string> {
  const response = await fetchCaptainBiResponse({
    fetcher,
    url: captainBiTokenUrl,
    init: {
      method: "POST",
      headers: {
        accept: "application/json",
        "user-agent": connectorUserAgent,
      },
      body: createCaptainBiTokenForm(credential.clientId, credential.clientSecret),
    },
    operation: "exchange access token",
  });
  const payload = await readCaptainBiPayload(response, "access token exchange");
  if (!response.ok) {
    throw mapCaptainBiHttpError(response.status, payload, phase, "access token exchange");
  }
  const body = asOptionalObject(payload);
  if (body) {
    const code = readNumber(body, "code");
    if (code != null && code !== 200) {
      throw mapCaptainBiBusinessError(code, body, phase, "access token exchange");
    }
  }
  const accessToken = asOptionalString(body?.access_token)?.trim();
  if (!accessToken) {
    throw new ProviderRequestError(502, "CaptainBI access token is missing");
  }
  return accessToken;
}

export function createCaptainBiTokenForm(clientId: string, clientSecret: string): FormData {
  const form = new FormData();
  form.set("grant_type", "client_credentials");
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("scope", "all");
  return form;
}

function readCaptainBiCredential(input: Record<string, unknown>): CaptainBiCredential {
  return {
    clientId: requiredString(input.clientId, "clientId"),
    clientSecret: requiredString(input.clientSecret, "clientSecret"),
  };
}

async function requestCaptainBiPage(input: {
  accessToken: string;
  fetcher: typeof fetch;
  path: string;
  operation: string;
  page: number;
  rows: number;
  openChannelId?: string;
  query?: Record<string, unknown>;
}): Promise<CaptainBiPage> {
  const url = new URL(input.path, captainBiApiBaseUrl);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("rows", String(input.rows));
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.accessToken}`,
    "user-agent": connectorUserAgent,
  });
  if (input.openChannelId) {
    headers.set("OpenChannelId", input.openChannelId);
  }
  const response = await fetchCaptainBiResponse({
    fetcher: input.fetcher,
    url,
    init: { method: "GET", headers },
    operation: input.operation,
  });
  const payload = await readCaptainBiPayload(response, input.operation);
  if (!response.ok) {
    throw mapCaptainBiHttpError(response.status, payload, "execute", input.operation);
  }
  const body = asOptionalObject(payload);
  if (!body) {
    throw new ProviderRequestError(502, `CaptainBI ${input.operation} returned an invalid response`);
  }
  const code = readNumber(body, "code");
  if (code !== 200) {
    throw mapCaptainBiBusinessError(code, body, "execute", input.operation);
  }
  if (!Array.isArray(body.data)) {
    throw new ProviderRequestError(502, `CaptainBI ${input.operation} response is missing data`);
  }
  const total = readInteger(body, "max_result");
  return {
    items: body.data,
    message: readString(body, "msg", "message") ?? null,
    total: total != null && total >= 0 ? total : null,
  };
}

async function fetchCaptainBiResponse(input: {
  fetcher: typeof fetch;
  url: string | URL;
  init: RequestInit;
  operation: string;
}) {
  const timeout = createProviderTimeout(undefined);
  try {
    return await input.fetcher(input.url, { ...input.init, signal: timeout.signal });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, `CaptainBI ${input.operation} request timed out`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(502, `CaptainBI ${input.operation} request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

async function readCaptainBiPayload(response: Response, operation: string) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, `CaptainBI ${operation} returned malformed JSON`);
    }
    return text;
  }
}

function mapCaptainBiHttpError(status: number, payload: unknown, phase: CaptainBiRequestPhase, operation: string) {
  const message = readCaptainBiErrorMessage(payload) ?? `CaptainBI ${operation} failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && [400, 401, 403].includes(status)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 || (operation === "access token exchange" && [400, 403].includes(status))) {
    return new ProviderRequestError(401, message);
  }
  if (status === 403) {
    return new ProviderRequestError(403, message);
  }
  if ([400, 404, 409, 422].includes(status)) {
    return new ProviderRequestError(status === 404 ? 404 : 400, message);
  }
  return new ProviderRequestError(502, message);
}

function mapCaptainBiBusinessError(
  code: number | undefined,
  payload: Record<string, unknown>,
  phase: CaptainBiRequestPhase,
  operation: string,
) {
  const message =
    readString(payload, "msg", "message", "error") ??
    `CaptainBI ${operation} failed${code == null ? "" : ` with code ${code}`}`;
  switch (code) {
    case 100903:
      return new ProviderRequestError(400, message);
    case 100904:
    case 100910:
      return new ProviderRequestError(429, message);
    case 100902:
    case 100906:
    case 100907:
      return phase === "validate" ? new ProviderRequestError(400, message) : new ProviderRequestError(401, message);
    case 100901:
    case 100905:
    case 100908:
    case 100909:
    case 100911:
    case 100912:
    case 100913:
    case 100914:
      return new ProviderRequestError(403, message);
    default:
      return new ProviderRequestError(502, message);
  }
}

function readCaptainBiErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }
  const body = asOptionalObject(payload);
  return body ? readString(body, "msg", "message", "error_description", "error", "code") : undefined;
}

function normalizePage(
  response: CaptainBiPage,
  page: number,
  pageSize: number,
  key: string,
  normalizeItem: (value: unknown) => Record<string, unknown>,
) {
  return {
    [key]: response.items.map(normalizeItem),
    page,
    pageSize,
    total: response.total,
    hasMore: response.total == null ? null : page * pageSize < response.total,
    message: response.message,
  };
}

function normalizeStore(value: unknown) {
  const item = optionalRecord(value);
  return compactObject({
    id: readInteger(item, "id"),
    siteId: readInteger(item, "site_id"),
    name: readString(item, "title"),
    merchantId: readString(item, "Merchant_ID"),
    openChannelId: readString(item, "open_channel_id"),
    status: readInteger(item, "status"),
    operationMode: readInteger(item, "goods_operation_pattern"),
    createdAt: readInteger(item, "create_time"),
    modifiedAt: readInteger(item, "modified_time"),
  });
}

function normalizeProduct(value: unknown) {
  const item = optionalRecord(value);
  const deleted = readInteger(item, "is_delete");
  return compactObject({
    id: readInteger(item, "id"),
    siteId: readInteger(item, "site_id"),
    sku: readString(item, "sku"),
    asin: readString(item, "asin"),
    parentAsin: readString(item, "parent_asin"),
    transportMode: readInteger(item, "Transport_mode"),
    title: readString(item, "title"),
    description: readString(item, "description"),
    imageUrl: readString(item, "image"),
    price: readNumber(item, "price"),
    status: readInteger(item, "status"),
    listingStatus: readInteger(item, "up_status"),
    deleted: deleted == null ? undefined : deleted === 1,
    createdAt: readInteger(item, "create_time"),
    modifiedAt: readInteger(item, "modified_time"),
  });
}

function normalizeProductDetail(value: unknown) {
  const item = optionalRecord(value);
  return compactObject({
    productId: readInteger(item, "amazon_goods_id"),
    fnsku: readString(item, "fnsku"),
    purchaseCostCurrency: readString(item, "purchasing_cost_currency_code"),
    purchaseCost: readNumber(item, "purchasing_cost"),
    purchaseCostCny: readNumber(item, "purchasing_cny_cost"),
    fbaCostCurrency: readString(item, "fba_cost_currency_code"),
    fbaCost: readNumber(item, "fba_cost"),
    fbaCostCny: readNumber(item, "fba_cny_cost"),
    fbmCostCurrency: readString(item, "fbm_cost_currency_code"),
    fbmCost: readNumber(item, "fbm_cost"),
    fbmCostCny: readNumber(item, "fbm_cny_cost"),
    price: readNumber(item, "your_price"),
    salePrice: readNumber(item, "sales_price"),
    groupId: readInteger(item, "group_id"),
    operatorId: readInteger(item, "operation_user_admin_id"),
    tagIds: readString(item, "tags_id"),
    createdAt: readInteger(item, "create_time"),
    modifiedAt: readInteger(item, "modified_time"),
  });
}

function normalizeInventory(value: unknown) {
  const item = optionalRecord(value);
  return compactObject({
    id: readInteger(item, "id"),
    title: readString(item, "title"),
    asin: readString(item, "asin"),
    sku: readString(item, "SKU"),
    fulfillableQuantity: readInteger(item, "fulfillable_quantity"),
    inboundShippedQuantity: readInteger(item, "inbound_shipped_quantity"),
    inboundReceivingQuantity: readInteger(item, "inbound_receiving_quantity"),
    inboundWorkingQuantity: readInteger(item, "inbound_working_quantity"),
    reservedQuantity: readInteger(item, "reserved_quantity"),
    unsellableQuantity: readInteger(item, "unsellable_quantity"),
    sales1Day: readInteger(item, "_1_day_sale"),
    sales7Days: readInteger(item, "_7_day_sale"),
    sales30Days: readInteger(item, "_30_day_sale"),
    averageDailySales: readInteger(item, "day_sale"),
    availableDays: readString(item, "available_days"),
    replenishmentQuantity: readString(item, "replenishment_quantity"),
    suggestedReplenishmentTime: readString(item, "suggested_replenishment_time"),
  });
}

function normalizeBusinessMetric(value: unknown) {
  const item = optionalRecord(value);
  return compactObject({
    id: readInteger(item, "id"),
    parentAsin: readString(item, "parent_asin"),
    asin: readString(item, "asin"),
    sku: readString(item, "sku"),
    title: readString(item, "title"),
    visits: readString(item, "number_of_visits"),
    buyerVisitPercentage: readNumber(item, "percentage_of_buyer_visits"),
    browsePercentage: readNumber(item, "browse_percentage"),
    buyBoxWinRate: readString(item, "buy_button_winning_rate"),
    unitsOrdered: readNumber(item, "types_of_goods_ordered"),
    b2bUnitsOrdered: readNumber(item, "types_of_goods_ordered_by_b2b"),
    conversionRate: readNumber(item, "order_conversion_rate"),
    b2bConversionRate: readNumber(item, "order_conversion_rate_by_b2b"),
    sales: readNumber(item, "sales_of_ordered_goods"),
    b2bSales: readNumber(item, "sales_of_ordered_goods_by_b2b"),
  });
}

function normalizeProfit(value: unknown) {
  const item = optionalRecord(value);
  return compactObject({
    sku: readString(item, "sku"),
    channelId: readInteger(item, "channel_id"),
    siteId: readInteger(item, "site_id"),
    reportTime: readString(item, "time"),
    totalIncome: readNumber(item, "cost_profit_total_income"),
    totalExpenses: readNumber(item, "cost_profit_total_pay"),
    profit: readNumber(item, "cost_profit_profit"),
    profitRate: readNumber(item, "cost_profit_profit_rate"),
    sales: readNumber(item, "sale_sales_quota"),
    refundAmount: readNumber(item, "sales_refund"),
    unitsSold: readNumber(item, "sale_sales_volume"),
    unitsReturned: readNumber(item, "sale_return_goods_number"),
    advertisingCost: readNumber(item, "cpc_cost"),
    productCost: readNumber(item, "purchase_logistics_purchase_cost"),
    logisticsCost: readNumber(item, "purchase_logistics_logistics_cost"),
    platformExpenses: readNumber(item, "platform_expenses"),
  });
}

function normalizeReturn(value: unknown) {
  const item = optionalRecord(value);
  return compactObject({
    id: readInteger(item, "id"),
    orderId: readString(item, "order_id"),
    channelId: readInteger(item, "channel_id"),
    asin: readString(item, "asin"),
    sku: readString(item, "sku"),
    orderTime: readInteger(item, "order_time"),
    returnDate: readInteger(item, "return_data"),
    quantity: readInteger(item, "return_nums"),
    reason: readString(item, "return_reason"),
    status: readString(item, "status"),
    fulfillmentCenterId: readString(item, "fulfillment_center_id"),
    disposition: readString(item, "detailed_disposition"),
  });
}

function normalizeRefund(value: unknown) {
  const item = optionalRecord(value);
  return compactObject({
    id: readInteger(item, "id"),
    orderId: readString(item, "order_id"),
    channelId: readInteger(item, "channel_id"),
    asin: readString(item, "asin"),
    sku: readString(item, "sku"),
    orderTime: readInteger(item, "order_time"),
    refundTime: readInteger(item, "refund_time"),
    returnedDate: readInteger(item, "returned_date"),
    quantity: readInteger(item, "quantity"),
    refundAmount: readNumber(item, "refund"),
    returnCommission: readNumber(item, "return_and_return_commission"),
    distributionFee: readNumber(item, "distribution_fee"),
    fbaRefundTreatmentFee: readNumber(item, "fba_refund_treatment_fee"),
    fbaRefundFee: readNumber(item, "fba_refund_fee"),
    refundManagementFee: readNumber(item, "refund_management_fee"),
    reason: readString(item, "reason"),
    disposition: readString(item, "disposition"),
    status: readString(item, "status"),
  });
}

function modifiedTimeQuery(input: Record<string, unknown>) {
  return {
    start_modified_time: input.startModifiedTime,
    end_modified_time: input.endModifiedTime,
  };
}

function requiredEnum<T extends string>(value: unknown, fieldName: string, values: readonly T[]): T {
  if (typeof value === "string" && values.includes(value as T)) {
    return value as T;
  }
  throw new ProviderRequestError(400, `${fieldName} is invalid`);
}

function requiredString(value: unknown, fieldName: string) {
  const text = asOptionalString(value)?.trim();
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function optionalRecord(value: unknown) {
  return asOptionalObject(value) ?? {};
}

function readString(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }
  return undefined;
}

function readNumber(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function readInteger(input: Record<string, unknown>, ...keys: string[]) {
  const value = readNumber(input, ...keys);
  return value != null && Number.isInteger(value) ? value : undefined;
}
