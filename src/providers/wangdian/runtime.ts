import type { CredentialValidationResult, ExecutionResult } from "../../core/types.ts";
import type {
  ProviderActionHandlers,
  ProviderActionName,
  ProviderActionSources,
  ProviderFetch,
  ProviderRuntimeHandler,
} from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  mapProviderActionSources,
  ProviderRequestError,
  providerUserAgent,
  toProviderExecutionError,
} from "../provider-runtime.ts";

export const wangdianApiBaseUrl = "https://api.wangdian.cn/openapi2";
const requestTimeoutMs = 30_000;
const maximumWindowMs = 30 * 24 * 60 * 60 * 1_000;
const maximumOrderWindowMs = 60 * 60 * 1_000;
const chinaTimeOffsetMs = 8 * 60 * 60 * 1_000;

type WangdianRequestPhase = "validate" | "execute";

interface WangdianActionConfig {
  endpoint: string;
  responseField: string;
  outputField: string;
  optionalResponseList?: boolean;
}

interface WangdianRequest {
  endpoint: string;
  context: WangdianContext;
  parameters: Record<string, unknown>;
  phase: WangdianRequestPhase;
}

export interface WangdianCredential {
  sid: string;
  appKey: string;
  appSecret: string;
}

export interface WangdianContext {
  credential: WangdianCredential;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

class WangdianRequestError extends ProviderRequestError {
  readonly code: string;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(status, message, details);
    this.code = code;
  }
}

const actionConfigByName: ProviderActionSources<"wangdian", WangdianActionConfig> = {
  list_shops: { endpoint: "shop.php", responseField: "shoplist", outputField: "shops" },
  list_warehouses: { endpoint: "warehouse_query.php", responseField: "warehouses", outputField: "warehouses" },
  list_goods: { endpoint: "goods_query.php", responseField: "goods_list", outputField: "goods" },
  list_inventory: { endpoint: "stock_query.php", responseField: "stocks", outputField: "inventory" },
  list_orders: {
    endpoint: "trade_query.php",
    responseField: "trades",
    outputField: "orders",
    optionalResponseList: true,
  },
  list_sales_stockouts: {
    endpoint: "stockout_order_query_trade.php",
    responseField: "stockout_list",
    outputField: "stockouts",
    optionalResponseList: true,
  },
  list_refunds: {
    endpoint: "refund_query.php",
    responseField: "refunds",
    outputField: "refunds",
    optionalResponseList: true,
  },
};

export const wangdianActionHandlers: ProviderActionHandlers<
  "wangdian",
  ProviderRuntimeHandler<WangdianContext>
> = mapProviderActionSources(
  "wangdian",
  actionConfigByName,
  (actionName): ProviderRuntimeHandler<WangdianContext> =>
    (input, context) =>
      executeWangdianAction(actionName, input, context),
);

export async function validateWangdianCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = readWangdianCredential(values);
  await requestWangdian({
    endpoint: "warehouse_query.php",
    context: { credential, fetcher, signal },
    parameters: { page_no: 0, page_size: 1 },
    phase: "validate",
  });
  return {
    profile: {
      accountId: `wangdian:${credential.sid}`,
      displayName: `Wangdian ERP · ${credential.sid}`,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: wangdianApiBaseUrl,
      product: "enterprise",
      validationEndpoint: "/warehouse_query.php",
    },
  };
}

export function readWangdianCredential(values: Record<string, string>): WangdianCredential {
  return {
    sid: requireCredentialValue(values.sid, "SID"),
    appKey: requireCredentialValue(values.appKey, "AppKey"),
    appSecret: requireCredentialValue(values.appSecret, "AppSecret"),
  };
}

export function createWangdianSignature(parameters: Record<string, string>, appSecret: string): string {
  const canonical = Object.entries(parameters)
    .filter(([name]) => name !== "sign")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, value]) => {
      const nameLength = String(Buffer.byteLength(name, "utf8")).padStart(2, "0");
      const valueLength = String(Buffer.byteLength(value, "utf8")).padStart(4, "0");
      return `${nameLength}-${name}:${valueLength}-${value}`;
    })
    .join(";");
  return createHash("md5")
    .update(canonical + appSecret)
    .digest("hex");
}

export function buildSignedWangdianBody(
  parameters: Record<string, unknown>,
  credential: WangdianCredential,
  timestamp: number = Math.floor(Date.now() / 1_000),
): string {
  const values = normalizeParameters(parameters);
  delete values.appkey;
  delete values.appsecret;
  delete values.sid;
  delete values.sign;
  delete values.timestamp;
  values.appkey = credential.appKey;
  values.sid = credential.sid;
  values.timestamp = String(timestamp);
  values.sign = createWangdianSignature(values, credential.appSecret);
  return new URLSearchParams(values).toString();
}

export function readWangdianProxyParameters(body: unknown): Record<string, unknown> {
  if (body === undefined || body === null) return {};
  if (typeof body === "string") return Object.fromEntries(new URLSearchParams(body));
  const value = optionalRecord(body);
  if (!value) {
    throw new ProviderRequestError(400, "Wangdian proxy body must be an object or form-encoded string");
  }
  return value;
}

export function toWangdianExecutionError(error: unknown): ExecutionResult {
  if (error instanceof WangdianRequestError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: { status: error.status, details: error.details },
      },
    };
  }
  return toProviderExecutionError(error, "Wangdian request failed");
}

async function executeWangdianAction(
  actionName: ProviderActionName<"wangdian">,
  input: Record<string, unknown>,
  context: WangdianContext,
): Promise<Record<string, unknown>> {
  const config = actionConfigByName[actionName];
  if (!config) throw new ProviderRequestError(400, `Unsupported Wangdian action: ${actionName}`);
  validateActionInput(actionName, input);
  const payload = await requestWangdian({
    endpoint: config.endpoint,
    context,
    parameters: buildActionParameters(actionName, input),
    phase: "execute",
  });
  const responseRecords = payload[config.responseField];
  const records = responseRecords === undefined && config.optionalResponseList ? [] : responseRecords;
  if (!Array.isArray(records)) {
    throw wangdianError("provider_error", `Wangdian returned an invalid ${config.responseField} response`, 502);
  }
  return {
    [config.outputField]: records,
    totalCount: parseOptionalInteger(payload.total_count) ?? null,
  };
}

function validateActionInput(actionName: string, input: Record<string, unknown>): void {
  validateOptionalDateTimes(input);
  switch (actionName) {
    case "list_goods":
      if (!hasValue(input, ["specNo", "goodsNo"]) && !isValidTimeWindow(input.startTime, input.endTime)) {
        invalidInput("Provide specNo or goodsNo, or provide a valid startTime and endTime no more than 30 days apart.");
      }
      return;
    case "list_inventory":
      if (hasValue(input, ["specNo", "barcode"])) return;
      if (input.startTime !== undefined || input.endTime !== undefined) {
        if (!isValidTimeWindow(input.startTime, input.endTime)) {
          invalidInput(
            "Provide specNo, barcode, or warehouseNo; when using a time range, provide startTime and endTime no more than 30 days apart.",
          );
        }
        return;
      }
      if (!hasValue(input, ["warehouseNo"])) {
        invalidInput(
          "Provide specNo, barcode, or warehouseNo; when using a time range, provide startTime and endTime no more than 30 days apart.",
        );
      }
      return;
    case "list_orders":
      if (
        !hasValue(input, ["tradeNo", "sourceTradeNo", "logisticsNo"]) &&
        !isValidTimeWindow(input.startTime, input.endTime, maximumOrderWindowMs)
      ) {
        invalidInput(
          "Provide tradeNo, sourceTradeNo, or logisticsNo, or provide a valid startTime and endTime no more than 60 minutes apart.",
        );
      }
      return;
    case "list_sales_stockouts":
      if (
        !hasValue(input, ["stockoutNo", "tradeNo", "sourceTradeNo"]) &&
        !isValidTimeWindow(input.startTime, input.endTime)
      ) {
        invalidInput(
          "Provide stockoutNo, tradeNo, or sourceTradeNo, or provide a valid startTime and endTime no more than 30 days apart.",
        );
      }
      return;
    case "list_refunds":
      if (
        !hasValue(input, ["refundNo", "sourceRefundNo", "tradeNo", "sourceTradeNo"]) &&
        !isValidTimeWindow(input.startTime, input.endTime)
      ) {
        invalidInput(
          "Provide refundNo, sourceRefundNo, tradeNo, or sourceTradeNo, or provide a valid startTime and endTime no more than 30 days apart.",
        );
      }
      return;
    default:
      return;
  }
}

function validateOptionalDateTimes(input: Record<string, unknown>): void {
  for (const field of ["startTime", "endTime"]) {
    if (input[field] === undefined) continue;
    const value = optionalString(input[field]);
    if (!value || !Number.isFinite(parseChinaDateTime(value))) {
      invalidInput(`${field} must use the YYYY-MM-DD HH:mm:ss format in China Standard Time.`);
    }
  }
}

function invalidInput(message: string): never {
  throw wangdianError("invalid_input", message, 400);
}

function hasValue(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.some((field) => Boolean(optionalString(value[field])));
}

function isValidTimeWindow(startTime: unknown, endTime: unknown, maximumDurationMs = maximumWindowMs): boolean {
  if (typeof startTime !== "string" || typeof endTime !== "string") return false;
  const start = parseChinaDateTime(startTime.trim());
  const end = parseChinaDateTime(endTime.trim());
  return Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= maximumDurationMs;
}

function parseChinaDateTime(value: string): number {
  const timestamp = Date.parse(`${value.replace(" ", "T")}+08:00`);
  if (!Number.isFinite(timestamp)) return Number.NaN;
  const normalized = new Date(timestamp + chinaTimeOffsetMs).toISOString().slice(0, 19).replace("T", " ");
  return normalized === value ? timestamp : Number.NaN;
}

function requireCredentialValue(value: unknown, label: string): string {
  const normalized = optionalString(value);
  if (!normalized) throw new ProviderRequestError(400, `${label} is required`);
  return normalized;
}

function buildActionParameters(actionName: string, input: Record<string, unknown>): Record<string, unknown> {
  const page = { page_no: optionalInteger(input.pageNo), page_size: optionalInteger(input.pageSize) };
  switch (actionName) {
    case "list_shops":
      return compactObject({
        shop_no: optionalString(input.shopNo),
        platform_id: optionalInteger(input.platformId),
        platform_ids: commaSeparatedValues(input.platformIds),
        is_disabled: booleanFlag(optionalBoolean(input.disabled)),
        ...page,
      });
    case "list_warehouses":
      return compactObject({
        warehouse_no: optionalString(input.warehouseNo),
        type: optionalInteger(input.warehouseType),
        sub_type: optionalInteger(input.subType),
        is_disabled: booleanFlag(optionalBoolean(input.disabled)),
        ...page,
      });
    case "list_goods":
      return compactObject({
        spec_no: optionalString(input.specNo),
        goods_no: optionalString(input.goodsNo),
        brand_no: optionalString(input.brandNo),
        class_name: optionalString(input.className),
        barcode: optionalString(input.barcode),
        start_time: optionalString(input.startTime),
        end_time: optionalString(input.endTime),
        deleted: optionalBoolean(input.includeDeleted) ? 1 : undefined,
        ...page,
      });
    case "list_inventory":
      return compactObject({
        warehouse_no: optionalString(input.warehouseNo),
        spec_no: optionalString(input.specNo),
        barcode: optionalString(input.barcode),
        start_time: optionalString(input.startTime),
        end_time: optionalString(input.endTime),
        is_deleted: optionalBoolean(input.onlyExistingInventory) ? 1 : undefined,
        spec_is_deleted: optionalBoolean(input.includeDeletedGoods) ? 1 : undefined,
        ...page,
      });
    case "list_orders":
      return compactObject({
        trade_no: optionalString(input.tradeNo),
        src_tid: optionalString(input.sourceTradeNo),
        logistics_no: optionalString(input.logisticsNo),
        status: optionalInteger(input.status),
        start_time: optionalString(input.startTime),
        end_time: optionalString(input.endTime),
        shop_no: optionalString(input.shopNo),
        shop_nos: commaSeparatedValues(input.shopNos),
        warehouse_no: optionalString(input.warehouseNo),
        has_logistics_no: optionalInteger(input.logisticsState),
        is_fuzzy: booleanFlag(optionalBoolean(input.fuzzySourceTradeNo)),
        src: booleanFlag(optionalBoolean(input.includePaymentDetails)),
        goodstax: booleanFlag(optionalBoolean(input.calculateTaxBySku)),
        ...page,
      });
    case "list_sales_stockouts":
      return compactObject({
        stockout_no: optionalString(input.stockoutNo),
        src_order_no: optionalString(input.tradeNo),
        src_tid: optionalString(input.sourceTradeNo),
        status: optionalInteger(input.status),
        start_time: optionalString(input.startTime),
        end_time: optionalString(input.endTime),
        shop_no: optionalString(input.shopNo),
        shop_nos: commaSeparatedValues(input.shopNos),
        warehouse_no: optionalString(input.warehouseNo),
        is_by_modified: booleanFlag(optionalBoolean(input.queryByModified)),
        is_no_position: invertedBooleanFlag(optionalBoolean(input.includePositionDetails)),
        fetch_stock_only: booleanFlag(optionalBoolean(input.stockOnly)),
        ...page,
      });
    case "list_refunds":
      return compactObject({
        refund_no: optionalString(input.refundNo),
        src_refund_no: optionalString(input.sourceRefundNo),
        trade_no: optionalString(input.tradeNo),
        tid: optionalString(input.sourceTradeNo),
        process_status: optionalInteger(input.processStatus),
        time_type: optionalInteger(input.timeType),
        start_time: optionalString(input.startTime),
        end_time: optionalString(input.endTime),
        shop_no: optionalString(input.shopNo),
        shop_nos: commaSeparatedValues(input.shopNos),
        logistics_no: optionalString(input.returnLogisticsNo),
        ...page,
      });
    default:
      throw new ProviderRequestError(400, `Unsupported Wangdian action: ${actionName}`);
  }
}

function booleanFlag(value: boolean | undefined): number | undefined {
  return value === undefined ? undefined : value ? 1 : 0;
}

function invertedBooleanFlag(value: boolean | undefined): number | undefined {
  return value === undefined ? undefined : value ? 0 : 1;
}

function commaSeparatedValues(value: unknown): string | undefined {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : item)).join(",")
    : undefined;
}

function normalizeParameters(parameters: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(parameters)) {
    if (value === undefined || value === null) continue;
    result[name] =
      typeof value === "object"
        ? JSON.stringify(value)
        : typeof value === "boolean"
          ? String(Number(value))
          : String(value);
  }
  return result;
}

async function requestWangdian(input: WangdianRequest): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.context.signal, requestTimeoutMs);
  try {
    const response = await input.context.fetcher(`${wangdianApiBaseUrl}/${input.endpoint}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": providerUserAgent,
      },
      body: buildSignedWangdianBody(input.parameters, input.context.credential),
      signal: timeout.signal,
    });
    const payload = await readWangdianPayload(response);
    if (!response.ok) throw createWangdianError(response.status, payload, input.phase);
    const root = optionalRecord(payload);
    const code = parseOptionalInteger(root?.code);
    if (!root || code === undefined) {
      throw wangdianError("provider_error", "Wangdian returned an invalid response", 502);
    }
    if (code !== 0) throw createWangdianError(200, root, input.phase);
    return root;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || (error instanceof Error && error.name === "AbortError")) {
      throw wangdianError("provider_error", "Wangdian request timed out", 504);
    }
    throw wangdianError(
      "provider_error",
      error instanceof Error ? `Wangdian request failed: ${error.message}` : "Wangdian request failed",
      502,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readWangdianPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw wangdianError("provider_error", "Wangdian returned invalid JSON", 502);
  }
}

function createWangdianError(status: number, payload: unknown, phase: WangdianRequestPhase): WangdianRequestError {
  const root = optionalRecord(payload);
  const code = parseOptionalInteger(root?.code);
  const message = optionalString(root?.message) ?? `Wangdian request failed with status ${status}`;
  const lowerMessage = message.toLowerCase();
  if (status === 429) return wangdianError("rate_limited", message, 429, payload);
  if (message.includes("权限不足") || message.includes("无仓库访问权限")) {
    return wangdianError("scope_missing", message, 403, payload);
  }
  if (
    status === 401 ||
    status === 403 ||
    code === 2030 ||
    code === 2060 ||
    code === 2100 ||
    message.includes("验证失败") ||
    message.includes("签名") ||
    lowerMessage.includes("app auth fail") ||
    lowerMessage.includes("sid is not") ||
    lowerMessage.includes("appkey") ||
    lowerMessage.includes("sign error") ||
    lowerMessage.includes("invalid sign") ||
    lowerMessage.includes("sign is")
  ) {
    return wangdianError(
      phase === "validate" ? "invalid_input" : "credential_expired",
      message,
      phase === "validate" ? 400 : 409,
      payload,
    );
  }
  if (status === 400 || status === 422 || code === 1 || code === 100 || code === 2104) {
    return wangdianError("invalid_input", message, 400, payload);
  }
  return wangdianError("provider_error", message, 502, payload);
}

function wangdianError(code: string, message: string, status: number, details?: unknown): WangdianRequestError {
  return new WangdianRequestError(code, message, status, details);
}

function parseOptionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}
