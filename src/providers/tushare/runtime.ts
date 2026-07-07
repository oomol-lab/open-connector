import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { TushareActionName } from "./actions.ts";

import { optionalNumber, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

interface TushareTableData {
  fields: string[];
  items: unknown[][];
}

interface MappedTableActionOptions {
  apiName: string;
  input: Record<string, unknown>;
  context: ApiKeyProviderContext;
  fields: readonly string[];
  params: Record<string, string>;
  outputKey: string;
  fieldMap: Record<string, string>;
}

interface TushareRequestInput {
  apiName: string;
  params?: Record<string, unknown>;
  fields?: string;
}

type TushareActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const tushareApiBaseUrl: string = "https://api.tushare.pro";
const tushareRequestTimeoutMs = 30_000;

const stockBasicFields = [
  "ts_code",
  "symbol",
  "name",
  "area",
  "industry",
  "market",
  "exchange",
  "list_status",
  "list_date",
  "delist_date",
  "is_hs",
] as const;
const tradeCalendarFields = ["exchange", "cal_date", "is_open", "pretrade_date"] as const;
const dailyQuoteFields = [
  "ts_code",
  "trade_date",
  "open",
  "high",
  "low",
  "close",
  "pre_close",
  "change",
  "pct_chg",
  "vol",
  "amount",
] as const;
const dailyBasicFields = [
  "ts_code",
  "trade_date",
  "close",
  "turnover_rate",
  "turnover_rate_f",
  "volume_ratio",
  "pe",
  "pe_ttm",
  "pb",
  "ps",
  "ps_ttm",
  "dv_ratio",
  "dv_ttm",
  "total_share",
  "float_share",
  "free_share",
  "total_mv",
  "circ_mv",
] as const;
const adjustmentFactorFields = ["ts_code", "trade_date", "adj_factor"] as const;

const stockBasicFieldMap = {
  ts_code: "tsCode",
  symbol: "symbol",
  name: "name",
  area: "area",
  industry: "industry",
  market: "market",
  exchange: "exchange",
  list_status: "listStatus",
  list_date: "listDate",
  delist_date: "delistDate",
  is_hs: "isHs",
};
const tradeCalendarFieldMap = {
  exchange: "exchange",
  cal_date: "calDate",
  is_open: "isOpen",
  pretrade_date: "pretradeDate",
};
const dailyQuoteFieldMap = {
  ts_code: "tsCode",
  trade_date: "tradeDate",
  open: "open",
  high: "high",
  low: "low",
  close: "close",
  pre_close: "preClose",
  change: "change",
  pct_chg: "pctChg",
  vol: "vol",
  amount: "amount",
};
const dailyBasicFieldMap = {
  ts_code: "tsCode",
  trade_date: "tradeDate",
  close: "close",
  turnover_rate: "turnoverRate",
  turnover_rate_f: "turnoverRateF",
  volume_ratio: "volumeRatio",
  pe: "pe",
  pe_ttm: "peTtm",
  pb: "pb",
  ps: "ps",
  ps_ttm: "psTtm",
  dv_ratio: "dvRatio",
  dv_ttm: "dvTtm",
  total_share: "totalShare",
  float_share: "floatShare",
  free_share: "freeShare",
  total_mv: "totalMv",
  circ_mv: "circMv",
};
const adjustmentFactorFieldMap = {
  ts_code: "tsCode",
  trade_date: "tradeDate",
  adj_factor: "adjFactor",
};
const datedMarketDataParams = {
  ts_code: "tsCode",
  trade_date: "tradeDate",
  start_date: "startDate",
  end_date: "endDate",
};

export const tushareActionHandlers: Record<TushareActionName, TushareActionHandler> = {
  query_data(input, context) {
    return executeQueryData(input, context);
  },
  list_stocks(input, context) {
    return executeMappedTableAction({
      apiName: "stock_basic",
      input,
      context,
      fields: stockBasicFields,
      params: { exchange: "exchange", list_status: "listStatus", is_hs: "isHs" },
      outputKey: "stocks",
      fieldMap: stockBasicFieldMap,
    });
  },
  get_trade_calendar(input, context) {
    return executeMappedTableAction({
      apiName: "trade_cal",
      input,
      context,
      fields: tradeCalendarFields,
      params: { exchange: "exchange", start_date: "startDate", end_date: "endDate", is_open: "isOpen" },
      outputKey: "calendar",
      fieldMap: tradeCalendarFieldMap,
    });
  },
  get_daily_quotes(input, context) {
    assertDatedMarketDataInput(input, "get_daily_quotes");
    return executeMappedTableAction({
      apiName: "daily",
      input,
      context,
      fields: dailyQuoteFields,
      params: datedMarketDataParams,
      outputKey: "quotes",
      fieldMap: dailyQuoteFieldMap,
    });
  },
  get_daily_basic(input, context) {
    assertDatedMarketDataInput(input, "get_daily_basic");
    return executeMappedTableAction({
      apiName: "daily_basic",
      input,
      context,
      fields: dailyBasicFields,
      params: datedMarketDataParams,
      outputKey: "dailyBasics",
      fieldMap: dailyBasicFieldMap,
    });
  },
  get_adjustment_factors(input, context) {
    assertDatedMarketDataInput(input, "get_adjustment_factors");
    return executeMappedTableAction({
      apiName: "adj_factor",
      input,
      context,
      fields: adjustmentFactorFields,
      params: datedMarketDataParams,
      outputKey: "adjustmentFactors",
      fieldMap: adjustmentFactorFieldMap,
    });
  },
};

export async function validateTushareCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await tushareRequest(
    {
      apiName: "trade_cal",
      params: { exchange: "", start_date: "20180901", end_date: "20180902" },
      fields: "exchange,cal_date,is_open",
    },
    { apiKey, fetcher, signal },
  );
  normalizeTableData(payload.data);
  return {
    profile: {
      accountId: "tushare-token",
      displayName: "Tushare Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: tushareApiBaseUrl,
      validationApiName: "trade_cal",
      credentialHelpUrl: "https://tushare.pro/document/1?doc_id=39",
    },
  };
}

async function executeQueryData(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await tushareRequest(
    {
      apiName: readRequiredTrimmedString(input.apiName, "apiName"),
      params: readOptionalObject(input.params, "params"),
      fields: normalizeFieldsInput(input.fields),
    },
    context,
  );
  const data = normalizeTableData(payload.data);
  return {
    requestId: optionalString(payload.request_id) ?? "",
    message: readOptionalStringOrNull(payload.msg),
    fields: data.fields,
    items: data.items,
    rows: projectRows(data),
  };
}

async function executeMappedTableAction(options: MappedTableActionOptions): Promise<Record<string, unknown>> {
  const payload = await tushareRequest(
    {
      apiName: options.apiName,
      params: buildTushareParams(options.input, options.params),
      fields: options.fields.join(","),
    },
    options.context,
  );
  const data = normalizeTableData(payload.data);
  return {
    requestId: optionalString(payload.request_id) ?? "",
    message: readOptionalStringOrNull(payload.msg),
    [options.outputKey]: projectMappedRows(data, options.fieldMap),
  };
}

async function tushareRequest(
  input: TushareRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal, tushareRequestTimeoutMs);
  try {
    const response = await context.fetcher(tushareApiBaseUrl, {
      method: "POST",
      signal: timeout.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({
        api_name: input.apiName,
        token: context.apiKey,
        params: input.params ?? {},
        ...(input.fields ? { fields: input.fields } : {}),
      }),
    });
    const payload = await readJsonPayload(response);
    const envelope = readProviderObject(payload, "payload");
    if (!response.ok) {
      throw createTushareHttpError(response.status, envelope);
    }
    const code = optionalNumber(envelope.code);
    if (code !== undefined && code !== 0) {
      throw createTushareApiError(code, envelope);
    }
    return envelope;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      timeout.didTimeout() || isAbortLikeError(error) ? 504 : 502,
      timeout.didTimeout()
        ? "Tushare request timed out"
        : error instanceof Error
          ? `Tushare request failed: ${error.message}`
          : "Tushare request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Tushare returned invalid JSON: ${error.message}` : "Tushare returned invalid JSON",
    );
  }
}

function createTushareHttpError(status: number, payload: Record<string, unknown>): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `Tushare request failed with ${status || 500}`;
  if (status === 401 || status === 403) return new ProviderRequestError(400, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(status || 502, message, payload);
}

function createTushareApiError(code: number, payload: Record<string, unknown>): ProviderRequestError {
  const message = `Tushare request failed: ${extractErrorMessage(payload) ?? `code ${code}`}`;
  if (code === 40101) return new ProviderRequestError(400, message, payload);
  if (code === 2002) return new ProviderRequestError(403, message, payload);
  if (code === 2003 || code === 2004) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(502, message, payload);
}

function normalizeTableData(value: unknown): TushareTableData {
  const data = readProviderObject(value, "data");
  return {
    fields: normalizeFields(data.fields),
    items: normalizeItems(data.items),
  };
}

function normalizeFields(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Tushare response data.fields must be an array");
  }
  return value.map((field, index) => readProviderString(field, `data.fields[${index}]`));
}

function normalizeItems(value: unknown): unknown[][] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Tushare response data.items must be an array");
  }
  return value.map((item) => {
    if (!Array.isArray(item)) {
      throw new ProviderRequestError(502, "Tushare response data.items must be an array of arrays");
    }
    return [...item];
  });
}

function projectRows(data: TushareTableData): Array<Record<string, unknown>> {
  return data.items.map((item) => {
    const row: Record<string, unknown> = {};
    for (const [index, field] of data.fields.entries()) {
      row[field] = item[index] ?? null;
    }
    return row;
  });
}

function projectMappedRows(data: TushareTableData, fieldMap: Record<string, string>): Array<Record<string, unknown>> {
  return projectRows(data).map((row) => {
    const mapped: Record<string, unknown> = {};
    for (const [sourceField, targetField] of Object.entries(fieldMap)) {
      mapped[targetField] = row[sourceField] ?? null;
    }
    return mapped;
  });
}

function buildTushareParams(input: Record<string, unknown>, params: Record<string, string>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [tushareName, inputName] of Object.entries(params)) {
    const value = input[inputName];
    if (value !== undefined) output[tushareName] = value;
  }
  return output;
}

function assertDatedMarketDataInput(input: Record<string, unknown>, actionName: string): void {
  if (
    optionalString(input.tsCode) ||
    optionalString(input.tradeDate) ||
    (optionalString(input.startDate) && optionalString(input.endDate))
  ) {
    return;
  }
  throw new ProviderRequestError(400, `${actionName} requires tsCode, tradeDate, or startDate and endDate`);
}

function normalizeFieldsInput(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) {
    const fields = value.map((item, index) => readRequiredTrimmedString(item, `fields[${index}]`));
    return fields.length > 0 ? fields.join(",") : undefined;
  }
  throw new ProviderRequestError(400, "fields must be a string or an array of strings");
}

function readOptionalObject(value: unknown, fieldName: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  return requiredRecord(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readProviderObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${fieldName} must be an object`);
  return record;
}

function readRequiredTrimmedString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readProviderString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `${fieldName} must be a string`);
  }
  return value;
}

function readOptionalStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

function extractErrorMessage(payload: Record<string, unknown>): string | undefined {
  return optionalString(payload.msg) ?? optionalString(payload.message) ?? optionalString(payload.error);
}
