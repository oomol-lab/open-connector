import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionName, ProviderActionSources, ProviderFetch } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import {
  compactObject,
  integer,
  looseArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  optionalStringArray,
  pickOptionalString,
  requiredBoolean,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  mapProviderActionSources,
  providerInputError,
  providerResponseError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  requireCustomCredential,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const xiaohongshuStoreApiUrl = "https://ark.xiaohongshu.com/ark/open_api/v3/common_controller";
const xiaohongshuStoreApiVersion = "2.0";

const createdTimeWindowMs = 24 * 60 * 60 * 1_000;
const updatedTimeWindowMs = 30 * 60 * 1_000;

interface XiaohongshuStoreCredential {
  appId: string;
  appSecret: string;
  accessToken: string;
  refreshToken?: string;
}

interface XiaohongshuStoreContext {
  credential: XiaohongshuStoreCredential;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface XiaohongshuStoreRequestInput {
  method: string;
  parameters: Record<string, unknown>;
  credential: XiaohongshuStoreCredential;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

const actionMethodByName: ProviderActionSources<"xiaohongshu_store", string> = {
  refresh_token: "oauth.refreshToken",
  list_orders: "order.getOrderList",
  get_order: "order.getOrderDetail",
  get_order_receiver_info: "order.getOrderReceiverInfo",
  modify_order_remark: "order.modifySellerMarkInfo",
  deliver_order: "order.orderDeliver",
  modify_order_express: "order.modifyOrderExpressInfo",
  get_order_tracking: "order.getOrderTracking",
  get_order_declare_info: "order.getOrderDeclareInfo",
  list_supported_ports: "order.getSupportedPortList",
  resend_payment_record: "order.resendBondedPaymentRecord",
  list_after_sales: "afterSale.listAfterSaleInfos",
  get_after_sale: "afterSale.getAfterSaleInfo",
  audit_after_sale: "afterSale.auditReturns",
  confirm_after_sale_receive: "afterSale.confirmReceive",
  ship_after_sale_exchange: "afterSale.receiveAndShip",
  list_after_sale_reject_reasons: "afterSale.rejectReasons",
  list_items: "product.getBasicItemList",
  search_items: "product.searchItemList",
  get_item: "product.getItemInfo",
  set_sku_availability: "product.updateSkuAvailable",
  get_sku_stock: "inventory.getSkuStock",
  sync_sku_stock: "inventory.syncSkuStock",
  adjust_sku_stock: "inventory.incSkuStock",
  list_categories: "common.getCategories",
  get_category_attributes: "common.getAttributeLists",
  list_express_companies: "common.getExpressCompanyList",
};

const handlers = mapProviderActionSources(
  "xiaohongshu_store",
  actionMethodByName,
  (actionName, method) => async (input: Record<string, unknown>, context: XiaohongshuStoreContext) => {
    const data = await requestXiaohongshuStore({
      method,
      parameters: buildActionParameters(actionName, input),
      credential: context.credential,
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return normalizeActionOutput(actionName, data);
  },
);

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "xiaohongshu_store",
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<XiaohongshuStoreContext> {
    const credential = await requireCustomCredential(context, "xiaohongshu_store");
    return { credential: readXiaohongshuStoreCredential(credential.values), fetcher, signal: context.signal };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const credential = readXiaohongshuStoreCredential(input.values);
    try {
      await requestXiaohongshuStore({
        method: actionMethodByName.list_express_companies,
        parameters: {},
        credential,
        fetcher,
        signal,
      });
    } catch (error) {
      // The connect form treats an upstream 401 as a wrong field value, not a reconnect prompt.
      if (error instanceof ProviderRequestError && (error.status === 401 || error.status === 403)) {
        throw providerInputError(error.message);
      }
      throw error;
    }
    return {
      profile: {
        accountId: `xiaohongshu_store:${credential.appId}`,
        displayName: `Xiaohongshu Store · ${credential.appId}`,
      },
      grantedScopes: [],
      metadata: { apiBaseUrl: xiaohongshuStoreApiUrl, validationMethod: actionMethodByName.list_express_companies },
    };
  },
};

function readXiaohongshuStoreCredential(values: Record<string, string>): XiaohongshuStoreCredential {
  return {
    appId: requiredInputString(values.appId, "App ID"),
    appSecret: requiredInputString(values.appSecret, "App Secret"),
    accessToken: requiredInputString(values.accessToken, "Access Token"),
    refreshToken: optionalString(values.refreshToken),
  };
}

export function createXiaohongshuStoreSign(input: {
  method: string;
  appId: string;
  timestamp: string;
  appSecret: string;
}): string {
  const base = `${input.method}?appId=${input.appId}&timestamp=${input.timestamp}&version=${xiaohongshuStoreApiVersion}`;
  return createHash("md5")
    .update(base + input.appSecret, "utf8")
    .digest("hex");
}

function buildSignedXiaohongshuStoreBody(
  method: string,
  parameters: Record<string, unknown>,
  credential: XiaohongshuStoreCredential,
): Record<string, unknown> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const isRefresh = method === actionMethodByName.refresh_token;
  if (isRefresh && !credential.refreshToken) {
    throw providerInputError("A refresh token must be configured on the connection to use refresh_token");
  }
  return {
    appId: credential.appId,
    timestamp,
    version: xiaohongshuStoreApiVersion,
    method,
    sign: createXiaohongshuStoreSign({ method, appId: credential.appId, timestamp, appSecret: credential.appSecret }),
    // Refresh exists precisely for an expired access token, so it is not sent there.
    accessToken: isRefresh ? undefined : credential.accessToken,
    refreshToken: isRefresh ? credential.refreshToken : undefined,
    ...parameters,
  };
}

async function requestXiaohongshuStore(input: XiaohongshuStoreRequestInput): Promise<unknown> {
  return runProviderRequest({ label: "Xiaohongshu", signal: input.signal }, async (signal) => {
    const response = await input.fetcher(xiaohongshuStoreApiUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(buildSignedXiaohongshuStoreBody(input.method, input.parameters, input.credential)),
      signal,
    });
    const payload = optionalRecord(
      await readProviderJsonBody(response, {
        emptyBody: undefined,
        invalidJsonMessage: "Xiaohongshu returned invalid JSON",
        // Keep the HTTP status mapping for non-OK responses with an unreadable body.
        invalidJsonFallback: () => (response.ok ? undefined : {}),
      }),
    );
    if (!payload && response.ok) {
      throw providerResponseError("Xiaohongshu returned an invalid response");
    }
    if (!response.ok || !payload || !isXiaohongshuStoreSuccess(payload)) {
      throw createXiaohongshuStoreError(response.status, payload ?? {});
    }
    return unwrapXiaohongshuStoreData(payload.data);
  });
}

function isXiaohongshuStoreSuccess(payload: Record<string, unknown>): boolean {
  if (payload.success === false) return false;
  if (payload.success === true) return true;
  return (optionalInteger(payload.error_code) ?? optionalInteger(payload.errorCode)) === 0;
}

// The newer after-sale APIs wrap their payload in a second { code, msg, success, data }
// envelope inside the standard one; both layers have to succeed.
function unwrapXiaohongshuStoreData(data: unknown): unknown {
  const inner = optionalRecord(data);
  const code = optionalInteger(inner?.code);
  if (!inner || typeof inner.success !== "boolean" || code === undefined) {
    return data;
  }
  if (!inner.success || code !== 0) {
    throw new ProviderRequestError(
      502,
      `[${code}] ${pickOptionalString(inner, "msg") ?? "Xiaohongshu request failed"}`,
    );
  }
  return inner.data;
}

function createXiaohongshuStoreError(status: number, payload: Record<string, unknown>) {
  const message =
    pickOptionalString(payload, "error_msg", "errorMsg", "msg", "message") ??
    `Xiaohongshu request failed with status ${status}`;
  const errorCode = optionalInteger(payload.error_code) ?? optionalInteger(payload.errorCode);
  const detail = errorCode === undefined ? message : `[${errorCode}] ${message}`;
  if (status === 429) {
    return new ProviderRequestError(429, detail);
  }
  if (status === 401 || status === 403 || errorCode === 401) {
    return new ProviderRequestError(401, detail);
  }
  return new ProviderRequestError(400 <= status && status < 600 ? status : 502, detail);
}

function buildActionParameters(
  actionName: ProviderActionName<"xiaohongshu_store">,
  input: Record<string, unknown>,
): Record<string, unknown> {
  switch (actionName) {
    case "refresh_token":
    case "list_supported_ports":
    case "list_express_companies":
      return {};
    case "list_orders": {
      const timeType = optionalInteger(input.timeType);
      if (timeType !== 1 && timeType !== 2) {
        throw providerInputError("timeType must be 1 (creation time) or 2 (update time)");
      }
      const startTime = requireTimestampMs(input.startTime, "startTime");
      const endTime = requireTimestampMs(input.endTime, "endTime");
      validateTimeWindow(timeType, startTime, endTime);
      return compactObject({
        timeType,
        startTime,
        endTime,
        orderType: optionalInteger(input.orderType),
        orderStatus: optionalInteger(input.orderStatus),
        pageNo: optionalInteger(input.pageNo) ?? 1,
        pageSize: optionalInteger(input.pageSize) ?? 50,
      });
    }
    case "get_order":
    case "get_order_tracking":
    case "get_order_declare_info":
      return { orderId: requiredInputString(input.orderId, "orderId") };
    case "get_order_receiver_info":
      return {
        receiverQueries: requireReceiverQueries(input.receiverQueries),
        isReturn: optionalBoolean(input.isReturn) ?? false,
      };
    case "modify_order_remark":
      return {
        orderId: requiredInputString(input.orderId, "orderId"),
        sellerMarkNote: requiredInputString(input.sellerMarkNote, "sellerMarkNote"),
        operator: requiredInputString(input.operator, "operator"),
        sellerMarkPriority: integer(input.sellerMarkPriority, "sellerMarkPriority", providerInputError),
      };
    case "deliver_order": {
      const unpack = optionalBoolean(input.unpack);
      const skuIdList = optionalStringArray(input.skuIdList);
      if (unpack === true && (skuIdList === undefined || skuIdList.length === 0)) {
        throw providerInputError("skuIdList is required when unpack is true");
      }
      return compactObject({
        orderId: requiredInputString(input.orderId, "orderId"),
        expressNo: requiredInputString(input.expressNo, "expressNo"),
        expressCompanyCode: requiredInputString(input.expressCompanyCode, "expressCompanyCode"),
        expressCompanyName: optionalString(input.expressCompanyName),
        deliveringTime: optionalInteger(input.deliveringTime),
        unpack,
        skuIdList,
        returnAddressId: optionalString(input.returnAddressId),
        skuIdentifyCodeInfo: optionalRecord(input.skuIdentifyCodeInfo),
      });
    }
    case "modify_order_express":
      return compactObject({
        orderId: requiredInputString(input.orderId, "orderId"),
        expressNo: requiredInputString(input.expressNo, "expressNo"),
        expressCompanyCode: requiredInputString(input.expressCompanyCode, "expressCompanyCode"),
        expressCompanyName: requiredInputString(input.expressCompanyName, "expressCompanyName"),
        deliveryOrderIndex: optionalInteger(input.deliveryOrderIndex),
        oldExpressNo: optionalString(input.oldExpressNo),
        expressUrlProofList: optionalStringArray(input.expressUrlProofList),
      });
    case "resend_payment_record":
      return {
        orderId: requiredInputString(input.orderId, "orderId"),
        customsType: requiredInputString(input.customsType, "customsType"),
      };
    case "list_after_sales": {
      const orderId = optionalString(input.orderId);
      const timeType = optionalInteger(input.timeType);
      const startTime = optionalInteger(input.startTime);
      const endTime = optionalInteger(input.endTime);
      if (!orderId) {
        if (timeType === undefined || startTime === undefined || endTime === undefined) {
          throw providerInputError(
            "list_after_sales requires an orderId, or timeType together with startTime and endTime",
          );
        }
        validateTimeWindow(timeType, startTime, endTime);
      }
      const pageNo = optionalInteger(input.pageNo) ?? 1;
      const pageSize = optionalInteger(input.pageSize) ?? 50;
      if (pageNo * pageSize > 50_000) {
        throw providerInputError("pageNo multiplied by pageSize cannot exceed 50000");
      }
      return compactObject({
        orderId,
        timeType,
        startTime,
        endTime,
        statuses: optionalIntegerArray(input.statuses),
        returnTypes: optionalIntegerArray(input.returnTypes),
        pageNo,
        pageSize,
      });
    }
    case "get_after_sale":
      return compactObject({
        returnsId: requiredInputString(input.returnsId, "returnsId"),
        needNegotiateRecord: optionalBoolean(input.needNegotiateRecord),
      });
    case "audit_after_sale": {
      const action = requireAction(input.action);
      const reason = optionalInteger(input.reason);
      const sellerAddressRecordId = optionalInteger(input.sellerAddressRecordId);
      if (action === 3 && reason === undefined) {
        throw providerInputError("reason is required when rejecting an after-sale request (action 3)");
      }
      if (action === 2 && sellerAddressRecordId === undefined) {
        throw providerInputError("sellerAddressRecordId is required when agreeing to a return shipment (action 2)");
      }
      return compactObject({
        returnsId: requiredInputString(input.returnsId, "returnsId"),
        action,
        reason,
        description: optionalString(input.description),
        message: optionalString(input.message),
        receiverInfo: sellerAddressRecordId === undefined ? undefined : { sellerAddressRecordId },
        droneSnCodes: optionalStringArray(input.droneSnCodes),
      });
    }
    case "confirm_after_sale_receive": {
      const action = requireAction(input.action);
      const reason = optionalInteger(input.reason);
      if (action === 2 && reason === undefined) {
        throw providerInputError("reason is required when rejecting receipt (action 2)");
      }
      return compactObject({
        returnsId: requiredInputString(input.returnsId, "returnsId"),
        action,
        reason,
        description: optionalString(input.description),
        droneSnCodes: optionalStringArray(input.droneSnCodes),
      });
    }
    case "ship_after_sale_exchange":
      return {
        returnsId: requiredInputString(input.returnsId, "returnsId"),
        expressCompanyCode: requiredInputString(input.expressCompanyCode, "expressCompanyCode"),
        expressNo: requiredInputString(input.expressNo, "expressNo"),
      };
    case "list_after_sale_reject_reasons":
      return {
        returnsId: requiredInputString(input.returnsId, "returnsId"),
        rejectReasonType: integer(input.rejectReasonType, "rejectReasonType", providerInputError),
      };
    case "list_items":
      return compactObject({
        id: optionalString(input.id),
        createTimeFrom: optionalInteger(input.createTimeFrom),
        createTimeTo: optionalInteger(input.createTimeTo),
        updateTimeFrom: optionalInteger(input.updateTimeFrom),
        updateTimeTo: optionalInteger(input.updateTimeTo),
        buyable: optionalBoolean(input.buyable),
        stockGte: optionalInteger(input.stockGte),
        stockLte: optionalInteger(input.stockLte),
        barcode: optionalString(input.barcode),
        skucode: optionalString(input.skucode),
        freeze: optionalBoolean(input.freeze),
        singlePackOnly: optionalBoolean(input.singlePackOnly),
        lastId: optionalString(input.lastId),
        isChannel: optionalBoolean(input.isChannel),
        pageNo: optionalInteger(input.pageNo) ?? 1,
        pageSize: optionalInteger(input.pageSize) ?? 50,
      });
    case "search_items":
      return {
        pageNo: optionalInteger(input.pageNo) ?? 1,
        pageSize: optionalInteger(input.pageSize) ?? 50,
        searchParam: compactObject({
          keyword: optionalString(input.keyword),
          keywords: optionalStringArray(input.keywords),
          buyable: optionalBoolean(input.buyable),
          createTimeFrom: optionalInteger(input.createTimeFrom),
          createTimeTo: optionalInteger(input.createTimeTo),
          lastId: optionalString(input.lastId),
        }),
      };
    case "get_item":
      return compactObject({
        itemId: requiredInputString(input.itemId, "itemId"),
        pageNo: optionalInteger(input.pageNo),
        pageSize: optionalInteger(input.pageSize),
      });
    case "set_sku_availability":
      return {
        skuId: requiredInputString(input.skuId, "skuId"),
        available: requiredBoolean(input.available, "available", providerInputError),
      };
    case "get_sku_stock":
      return { skuId: requiredInputString(input.skuId, "skuId") };
    case "sync_sku_stock": {
      const qty = integer(input.qty, "qty", providerInputError);
      if (qty < 0) {
        throw providerInputError("sync_sku_stock qty must be a non-negative total stock");
      }
      return { skuId: requiredInputString(input.skuId, "skuId"), qty };
    }
    case "adjust_sku_stock":
      return { skuId: requiredInputString(input.skuId, "skuId"), qty: integer(input.qty, "qty", providerInputError) };
    case "list_categories":
      return compactObject({ categoryId: optionalString(input.categoryId) });
    case "get_category_attributes":
      return { categoryId: requiredInputString(input.categoryId, "categoryId") };
  }
}

function normalizeActionOutput(
  actionName: ProviderActionName<"xiaohongshu_store">,
  data: unknown,
): Record<string, unknown> {
  const record = optionalRecord(data);
  switch (actionName) {
    case "refresh_token":
      if (!record) throw providerResponseError("Xiaohongshu returned an invalid token");
      return { token: record };
    case "list_orders":
      if (!record) throw providerResponseError("Xiaohongshu returned an invalid order list");
      return {
        orders: requireArray(record.orderList, "order list"),
        total: requireNonNegativeInteger(record.total, "order total"),
        pageNo: optionalInteger(record.pageNo) ?? 1,
        pageSize: optionalInteger(record.pageSize) ?? 50,
      };
    case "get_order":
      if (!record) throw providerResponseError("Xiaohongshu returned an invalid order");
      return { order: record };
    case "get_order_receiver_info":
      if (!record) throw providerResponseError("Xiaohongshu returned invalid receiver information");
      return { receivers: requireArray(record.receiverInfos, "receiver list") };
    case "get_order_tracking":
      if (!record) throw providerResponseError("Xiaohongshu returned invalid order tracking");
      return { packages: requireArray(record.orderTrackInfos, "order track list") };
    case "get_order_declare_info":
      if (!record) throw providerResponseError("Xiaohongshu returned invalid customs declaration information");
      return { declarations: requireArray(record.orderDeclareInfos, "customs declaration list") };
    case "list_supported_ports":
      if (!record) throw providerResponseError("Xiaohongshu returned an invalid customs port list");
      return {
        platformPorts: requireArray(record.platSupportCustoms, "platform customs port list"),
        sellerPorts: requireArray(record.sellerSupportCustoms, "seller customs port list"),
      };
    case "resend_payment_record": {
      // The documented payload is a BasicResult object; some gateways return a plain message string.
      const message = record ? pickOptionalString(record, "msg") : undefined;
      return { message: message ?? (typeof data === "string" ? data : "Xiaohongshu accepted the resend request") };
    }
    case "list_after_sales":
      if (!record) throw providerResponseError("Xiaohongshu returned an invalid after-sale list");
      return {
        afterSales: requireArray(record.afterSaleBasicInfos, "after-sale list"),
        total: requireNonNegativeInteger(record.totalCount, "after-sale total"),
        pageNo: optionalInteger(record.pageNo) ?? 1,
        pageSize: optionalInteger(record.pageSize) ?? 50,
      };
    case "get_after_sale": {
      const afterSale = optionalRecord(record?.afterSaleInfo);
      if (!afterSale) throw providerResponseError("Xiaohongshu returned an invalid after-sale record");
      return { afterSale };
    }
    case "list_after_sale_reject_reasons":
      // The official spec returns data.rejectReasons; some gateway responses hand back a bare array.
      return { reasons: requireArray(Array.isArray(data) ? data : record?.rejectReasons, "reject reason list") };
    case "list_items":
      if (!record) throw providerResponseError("Xiaohongshu returned an invalid item list");
      return {
        items: requireArray(record.hits, "item list"),
        total: requireNonNegativeInteger(record.total, "item total"),
        pageNo: optionalInteger(record.currentPage) ?? 1,
        pageSize: optionalInteger(record.pageSize) ?? 50,
      };
    case "search_items":
      if (!record) throw providerResponseError("Xiaohongshu returned an invalid item search result");
      return {
        items: requireArray(record.itemDetailV3s, "item search result"),
        total: requireNonNegativeInteger(record.total, "item total"),
        pageNo: optionalInteger(record.currentPage) ?? 1,
        pageSize: optionalInteger(record.pageSize) ?? 50,
      };
    case "get_item": {
      const item = optionalRecord(record?.itemInfo);
      if (!item) throw providerResponseError("Xiaohongshu returned an invalid item");
      return {
        item,
        skus: requireArray(record?.skuInfos, "item SKU list"),
        total: optionalInteger(record?.total) ?? 0,
      };
    }
    case "get_sku_stock":
    case "sync_sku_stock":
    case "adjust_sku_stock":
      if (!record) throw providerResponseError("Xiaohongshu returned an invalid SKU stock result");
      return { stock: record };
    case "list_categories":
      if (!record) throw providerResponseError("Xiaohongshu returned an invalid category list");
      return { categories: requireArray(record.categoryV3s, "category list") };
    case "get_category_attributes":
      if (!record) throw providerResponseError("Xiaohongshu returned an invalid category attribute list");
      return { attributes: requireArray(record.attributeV3s, "category attribute list") };
    case "list_express_companies":
      if (!record) throw providerResponseError("Xiaohongshu returned an invalid express company list");
      return { companies: requireArray(record.expressCompanyInfos, "express company list") };
    case "modify_order_remark":
    case "deliver_order":
    case "modify_order_express":
    case "audit_after_sale":
    case "confirm_after_sale_receive":
    case "ship_after_sale_exchange":
    case "set_sku_availability":
      return { success: true };
  }
}

function requireTimestampMs(value: unknown, fieldName: string): number {
  const timestamp = integer(value, fieldName, providerInputError);
  if (timestamp < 0) {
    throw providerInputError(`${fieldName} must be a Unix timestamp in milliseconds`);
  }
  return timestamp;
}

function validateTimeWindow(timeType: number, startTime: number, endTime: number): void {
  if (endTime <= startTime) {
    throw providerInputError("endTime must be later than startTime");
  }
  const windowMs = endTime - startTime;
  if (timeType === 1 && windowMs > createdTimeWindowMs) {
    throw providerInputError("The creation-time window cannot exceed 24 hours");
  }
  if (timeType === 2 && windowMs > updatedTimeWindowMs) {
    throw providerInputError("The update-time window cannot exceed 30 minutes");
  }
}

function requireReceiverQueries(value: unknown): Record<string, unknown>[] {
  const queries = looseArray(value)
    .map(optionalRecord)
    .filter((query): query is Record<string, unknown> => query !== undefined);
  if (queries.length === 0 || queries.length > 20) {
    throw providerInputError("receiverQueries must contain between 1 and 20 entries");
  }
  return queries.map((query) => ({
    orderId: requiredInputString(query.orderId, "receiverQueries orderId"),
    openAddressId: requiredInputString(query.openAddressId, "receiverQueries openAddressId"),
  }));
}

function requireAction(value: unknown): number {
  const action = optionalInteger(value);
  if (action === undefined || action < 1 || action > 3) {
    throw providerInputError("action must be 1, 2, or 3");
  }
  return action;
}

function optionalIntegerArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const integers = value.filter((item): item is number => typeof item === "number" && Number.isInteger(item));
  return integers.length > 0 ? integers : undefined;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw providerResponseError(`Xiaohongshu returned an invalid ${label}`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw providerResponseError(`Xiaohongshu returned an invalid ${label}`);
  }
  return value;
}
