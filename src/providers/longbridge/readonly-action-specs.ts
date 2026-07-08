import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "longbridge";

export type LongbridgeReadonlyHttpMethod = "GET" | "POST";
export type LongbridgeReadonlyOutputMode = "object" | "list";
export type LongbridgeReadonlyParamKind = "boolean" | "integer" | "objectArray" | "string" | "stringArray";
export type LongbridgeReadonlyParamTransform =
  | "ahPremiumPeriod"
  | "booleanString"
  | "dateToUnixEnd"
  | "dateToUnixStart"
  | "indexSymbolToCounterId"
  | "rankKey"
  | "symbolToCounterId"
  | "symbolsToCounterIds"
  | "symbolsToCounterIdsJson";

export interface LongbridgeReadonlyParamSpec {
  readonly inputName: string;
  readonly apiName: string;
  readonly schema: JsonSchema;
  readonly kind: LongbridgeReadonlyParamKind;
  readonly required?: boolean;
  readonly transform?: LongbridgeReadonlyParamTransform;
}

export type LongbridgeReadonlyBodyPostProcessor = "screenerSearch";

export interface LongbridgeReadonlyPathParamSpec {
  readonly inputName: string;
  readonly token: string;
  readonly schema: JsonSchema;
  readonly kind: "integer" | "string";
}

export interface LongbridgeReadonlyMarketPathSpec {
  readonly inputName: string;
  readonly paths: Readonly<Record<"HK" | "US", string>>;
}

export interface LongbridgeReadonlySymbolMarketPathSpec {
  readonly inputName: string;
  readonly paths: Readonly<Record<"HK" | "US", string>>;
}

export type LongbridgeReadonlyDynamicQueryDefaultValue = "unixNowSeconds";

export interface LongbridgeReadonlyDynamicQueryDefaultSpec {
  readonly apiName: string;
  readonly value: LongbridgeReadonlyDynamicQueryDefaultValue;
}

export type LongbridgeReadonlyDerivedQueryDefaultValue = "rankMarket";

export interface LongbridgeReadonlyDerivedQueryDefaultSpec {
  readonly apiName: string;
  readonly inputName: string;
  readonly value: LongbridgeReadonlyDerivedQueryDefaultValue;
}

export interface LongbridgeReadonlyActionSpec {
  readonly name: string;
  readonly description: string;
  readonly method?: LongbridgeReadonlyHttpMethod;
  readonly path: string;
  readonly marketPath?: LongbridgeReadonlyMarketPathSpec;
  readonly symbolMarketPath?: LongbridgeReadonlySymbolMarketPathSpec;
  readonly pathParam?: LongbridgeReadonlyPathParamSpec;
  readonly queryDefaults?: Readonly<Record<string, string>>;
  readonly queryDynamicDefaults?: readonly LongbridgeReadonlyDynamicQueryDefaultSpec[];
  readonly queryDerivedDefaults?: readonly LongbridgeReadonlyDerivedQueryDefaultSpec[];
  readonly queryParams?: readonly LongbridgeReadonlyParamSpec[];
  readonly bodyDefaults?: Readonly<Record<string, unknown>>;
  readonly bodyParams?: readonly LongbridgeReadonlyParamSpec[];
  readonly bodyPostProcessor?: LongbridgeReadonlyBodyPostProcessor;
  readonly outputKey: string;
  readonly outputMode: LongbridgeReadonlyOutputMode;
  readonly dataKey?: string;
}

const rawObjectSchema = s.looseObject("The raw object returned by Longbridge.");
const looseItemSchema = s.looseObject("A raw Longbridge item.");
const symbolSchema = s.nonEmptyString("The Longbridge security symbol, such as AAPL.US or 700.HK.");
const marketSchema = s.stringEnum("The Longbridge market code.", ["HK", "US", "CN", "SG"]);
const hkUsMarketSchema = s.stringEnum("The market-specific Longbridge endpoint to use.", ["HK", "US"]);
const dateSchema = s.string("A date string in YYYY-MM-DD format.", {
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});
const compactDateSchema = s.string("A date string in YYYYMMDD format.", {
  pattern: "^\\d{8}$",
});
const pageSchema = s.positiveInteger("The 1-based page number.");
const zeroBasedPageSchema = s.nonNegativeInteger("The zero-based page number.");
const sizeSchema = s.positiveInteger("The number of records to request.");
const countSchema = s.positiveInteger("The number of records to request.");
const rankKeySchema = s.nonEmptyString("The Longbridge ranking category key.");
const screenerFilterSchema = s.looseObject("A Longbridge screener filter condition.");
export const longbridgeScreenerDefaultReturns: readonly string[] = [
  "filter_prevclose",
  "filter_prevchg",
  "filter_marketcap",
  "filter_salesgrowthyoy",
  "filter_pettm",
  "filter_pbmrq",
  "filter_industry",
];
const financeCalendarCategorySchema = s.stringEnum("The Longbridge finance calendar category.", [
  "report",
  "financial",
  "dividend",
  "split",
  "merge",
  "ipo",
  "macrodata",
  "closed",
  "meeting",
]);
const reportPeriodSchema = s.stringEnum("The Longbridge report period.", ["af", "saf", "q1", "q2", "q3", "qf", "3q"]);

function param(
  inputName: string,
  apiName: string,
  schema: JsonSchema,
  kind: LongbridgeReadonlyParamKind,
  options: {
    readonly required?: boolean;
    readonly transform?: LongbridgeReadonlyParamTransform;
  } = {},
): LongbridgeReadonlyParamSpec {
  return {
    inputName,
    apiName,
    schema,
    kind,
    required: options.required,
    transform: options.transform,
  };
}

function symbolParam(options: { readonly required?: boolean } = { required: true }): LongbridgeReadonlyParamSpec {
  return param("symbol", "counter_id", symbolSchema, "string", {
    required: options.required,
    transform: "symbolToCounterId",
  });
}

function inputSchemaForSpec(spec: LongbridgeReadonlyActionSpec): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const optional: string[] = [];
  for (const field of allInputFields(spec)) {
    properties[field.inputName] = field.schema;
    if (!field.required) {
      optional.push(field.inputName);
    }
  }
  if (spec.pathParam) {
    properties[spec.pathParam.inputName] = spec.pathParam.schema;
  }
  if (spec.marketPath) {
    properties[spec.marketPath.inputName] = hkUsMarketSchema;
  }
  return s.object(`Input parameters for ${spec.name}.`, properties, { optional });
}

function outputSchemaForSpec(spec: LongbridgeReadonlyActionSpec): JsonSchema {
  return s.object(`The normalized Longbridge ${spec.name} response.`, {
    [spec.outputKey]:
      spec.outputMode === "list"
        ? s.array(`The ${spec.outputKey} records returned by Longbridge.`, looseItemSchema)
        : s.looseObject(`The ${spec.outputKey} object returned by Longbridge.`),
    raw: rawObjectSchema,
  });
}

function allInputFields(spec: LongbridgeReadonlyActionSpec): LongbridgeReadonlyParamSpec[] {
  const fields = [...(spec.queryParams ?? []), ...(spec.bodyParams ?? [])];
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (seen.has(field.inputName)) {
      return false;
    }
    seen.add(field.inputName);
    return true;
  });
}

export function defineLongbridgeReadonlyActions(requiredScopes: string[]): ActionDefinition[] {
  return longbridgeReadonlyActionSpecs.map((spec) =>
    defineProviderAction(service, {
      name: spec.name,
      description: spec.description,
      requiredScopes,
      providerPermissions: ["openapi"],
      inputSchema: inputSchemaForSpec(spec),
      outputSchema: outputSchemaForSpec(spec),
    }),
  );
}

const optionalPage = param("page", "page", pageSchema, "integer");
const optionalSize = param("size", "size", sizeSchema, "integer");
const optionalCount = param("count", "count", countSchema, "integer");
const optionalLimit = param("limit", "limit", countSchema, "integer");
const optionalPageSize = param("count", "page_size", countSchema, "integer");
const optionalStartDate = param("startDate", "start_date", compactDateSchema, "string");
const optionalEndDate = param("endDate", "end_date", compactDateSchema, "string");
const optionalUnixStartDate = param("startDate", "start", dateSchema, "string", { transform: "dateToUnixStart" });
const optionalUnixEndDate = param("endDate", "end", dateSchema, "string", { transform: "dateToUnixEnd" });
const requiredSymbol = symbolParam();
const optionalSymbol = symbolParam({ required: false });
const optionalSymbols = param(
  "symbols",
  "counter_ids[]",
  s.array("Longbridge symbols to filter by.", symbolSchema),
  "stringArray",
  { transform: "symbolsToCounterIds" },
);

export const longbridgeReadonlyActionSpecs: readonly LongbridgeReadonlyActionSpec[] = [
  {
    name: "market_status",
    description: "Get Longbridge market trading status for supported markets.",
    path: "/v1/quote/market-status",
    outputKey: "status",
    outputMode: "object",
  },
  {
    name: "broker_holding",
    description: "List top Longbridge broker holdings for a security.",
    path: "/v1/quote/broker-holding",
    queryParams: [
      requiredSymbol,
      param(
        "period",
        "type",
        s.stringEnum("The broker holding period.", ["rct_1", "rct_5", "rct_20", "rct_60"]),
        "string",
        {
          required: true,
        },
      ),
    ],
    outputKey: "holdings",
    outputMode: "object",
  },
  {
    name: "broker_holding_detail",
    description: "Get detailed Longbridge broker holdings for a security.",
    path: "/v1/quote/broker-holding/detail",
    queryParams: [requiredSymbol],
    outputKey: "detail",
    outputMode: "object",
  },
  {
    name: "broker_holding_daily",
    description: "List daily Longbridge broker holding history for a broker and security.",
    path: "/v1/quote/broker-holding/daily",
    queryParams: [
      requiredSymbol,
      param("brokerId", "parti_number", s.nonEmptyString("The broker participant number."), "string", {
        required: true,
      }),
    ],
    outputKey: "history",
    outputMode: "object",
  },
  {
    name: "ah_premium",
    description: "List Longbridge A/H premium K-line records for a dual-listed security.",
    path: "/v1/quote/ahpremium/klines",
    queryParams: [
      requiredSymbol,
      param("period", "line_type", s.nonEmptyString("The A/H premium K-line period."), "string", {
        required: true,
        transform: "ahPremiumPeriod",
      }),
      param("count", "line_num", countSchema, "integer", { required: true }),
    ],
    outputKey: "premiums",
    outputMode: "object",
  },
  {
    name: "ah_premium_intraday",
    description: "List Longbridge intraday A/H premium records for a dual-listed security.",
    path: "/v1/quote/ahpremium/timeshares",
    queryDefaults: { days: "1" },
    queryParams: [requiredSymbol],
    outputKey: "premiums",
    outputMode: "object",
  },
  {
    name: "trade_stats",
    description: "Get Longbridge trade statistics for a security.",
    path: "/v1/quote/trades-statistics",
    queryParams: [requiredSymbol],
    outputKey: "statistics",
    outputMode: "object",
  },
  {
    name: "anomaly",
    description: "List Longbridge quote change and anomaly records.",
    path: "/v1/quote/changes",
    queryDefaults: { category: "0", size: "50" },
    queryParams: [param("market", "market", marketSchema, "string", { required: true }), optionalSize, optionalSymbol],
    outputKey: "changes",
    outputMode: "list",
    dataKey: "changes",
  },
  {
    name: "market_stock_events",
    description: "List Longbridge market stock events.",
    method: "POST",
    path: "/v1/quote/market/stock-events",
    bodyDefaults: {
      next_params: {},
      date: "",
      limit: 20,
      sort: 2,
      markets: [],
    },
    bodyParams: [
      param("markets", "markets", s.array("Markets to filter market stock events by.", marketSchema), "stringArray"),
      param("limit", "limit", countSchema, "integer"),
      param("sort", "sort", s.integer("The Longbridge stock event sort code: 0 time, 1 change, 2 hot."), "integer"),
      param("date", "date", dateSchema, "string"),
    ],
    outputKey: "events",
    outputMode: "object",
  },
  {
    name: "constituent",
    description: "List Longbridge index constituents.",
    path: "/v1/quote/index-constituents",
    queryParams: [
      param("symbol", "counter_id", symbolSchema, "string", {
        required: true,
        transform: "indexSymbolToCounterId",
      }),
    ],
    outputKey: "constituents",
    outputMode: "object",
  },
  {
    name: "finance_calendar",
    description: "List Longbridge finance calendar events.",
    path: "/v1/quote/finance_calendar",
    queryDefaults: { next: "later", offset: "0" },
    queryParams: [
      param("startDate", "date", dateSchema, "string", { required: true }),
      param("endDate", "date_end", dateSchema, "string"),
      param(
        "categories",
        "types[]",
        s.array("Longbridge finance calendar categories.", financeCalendarCategorySchema, { minItems: 1 }),
        "stringArray",
        { required: true },
      ),
      optionalSymbols,
      param("market", "markets[]", marketSchema, "string"),
      param("count", "count", countSchema, "integer"),
      param(
        "star",
        "star[]",
        s.array("Macro calendar importance levels.", s.positiveInteger("One star level.")),
        "stringArray",
      ),
    ],
    outputKey: "calendar",
    outputMode: "object",
  },
  {
    name: "rank_categories",
    description: "List Longbridge market ranking categories.",
    path: "/v1/quote/market/rank/categories",
    outputKey: "categories",
    outputMode: "object",
  },
  {
    name: "rank_list",
    description: "List Longbridge ranked securities for a market ranking category.",
    path: "/v1/quote/market/rank/list",
    queryDefaults: { delay_bmp: "false", need_article: "false", size: "20" },
    queryDerivedDefaults: [{ apiName: "market", inputName: "key", value: "rankMarket" }],
    queryParams: [
      param("key", "key", rankKeySchema, "string", { required: true, transform: "rankKey" }),
      param("needArticle", "need_article", s.boolean("Whether to include article context."), "boolean", {
        transform: "booleanString",
      }),
      param("market", "market", marketSchema, "string"),
      optionalSize,
    ],
    outputKey: "securities",
    outputMode: "list",
    dataKey: "lists",
  },
  {
    name: "short_positions",
    description: "List Longbridge short interest records for a US or HK security.",
    path: "/v1/quote/short-positions/us",
    symbolMarketPath: {
      inputName: "symbol",
      paths: {
        HK: "/v1/quote/short-positions/hk",
        US: "/v1/quote/short-positions/us",
      },
    },
    queryDefaults: { page_size: "20" },
    queryDynamicDefaults: [{ apiName: "last_timestamp", value: "unixNowSeconds" }],
    queryParams: [
      requiredSymbol,
      param(
        "lastTimestamp",
        "last_timestamp",
        s.integer("The pagination timestamp returned by Longbridge."),
        "integer",
      ),
      optionalPageSize,
    ],
    outputKey: "positions",
    outputMode: "list",
    dataKey: "data",
  },
  {
    name: "short_trades",
    description: "List Longbridge short sale trade records for a US or HK security.",
    path: "/v1/quote/short-trades/us",
    symbolMarketPath: {
      inputName: "symbol",
      paths: {
        HK: "/v1/quote/short-trades/hk",
        US: "/v1/quote/short-trades/us",
      },
    },
    queryDefaults: { page_size: "20" },
    queryDynamicDefaults: [{ apiName: "last_timestamp", value: "unixNowSeconds" }],
    queryParams: [
      requiredSymbol,
      param(
        "lastTimestamp",
        "last_timestamp",
        s.integer("The pagination timestamp returned by Longbridge."),
        "integer",
      ),
      optionalPageSize,
    ],
    outputKey: "trades",
    outputMode: "list",
    dataKey: "data",
  },
  {
    name: "short_margin",
    description: "Get Longbridge short margin information for the connected account.",
    path: "/v1/asset/cash/short-margin",
    outputKey: "margin",
    outputMode: "object",
  },
  {
    name: "option_volume",
    description: "List Longbridge real-time option volume statistics for an underlying security.",
    path: "/v1/quote/option-volume-stats",
    queryParams: [
      param("symbol", "underlying_counter_id", symbolSchema, "string", {
        required: true,
        transform: "symbolToCounterId",
      }),
    ],
    outputKey: "volume",
    outputMode: "object",
  },
  {
    name: "option_volume_daily",
    description: "List Longbridge historical daily option volume statistics for an underlying security.",
    path: "/v1/quote/option-volume-stats/daily",
    queryDefaults: { direction: "1", line_num: "20" },
    queryDynamicDefaults: [{ apiName: "timestamp", value: "unixNowSeconds" }],
    queryParams: [
      requiredSymbol,
      param("timestamp", "timestamp", s.integer("The Unix timestamp pagination anchor."), "integer"),
      param("count", "line_num", countSchema, "integer"),
    ],
    outputKey: "volume",
    outputMode: "object",
  },
  {
    name: "financial_report",
    description: "Get Longbridge financial report data for a security.",
    path: "/v1/quote/financial-reports",
    queryDefaults: { kind: "ALL" },
    queryParams: [
      requiredSymbol,
      param("kind", "kind", s.stringEnum("The financial statement kind.", ["IS", "BS", "CF", "ALL"]), "string"),
      param("period", "report", reportPeriodSchema, "string"),
    ],
    outputKey: "report",
    outputMode: "object",
    dataKey: "report",
  },
  {
    name: "financial_report_latest",
    description: "Get the latest Longbridge financial report summary for a security.",
    path: "/v1/quote/financials/latest-report",
    queryParams: [requiredSymbol],
    outputKey: "report",
    outputMode: "object",
  },
  {
    name: "financial_report_snapshot",
    description: "Get Longbridge earnings snapshot data for a security.",
    path: "/v1/quote/financials/earnings-snapshot",
    queryParams: [
      requiredSymbol,
      param("report", "report", reportPeriodSchema, "string"),
      param("fiscalYear", "fiscal_year", s.integer("The fiscal year to query."), "integer"),
      param(
        "fiscalPeriod",
        "fiscal_period",
        s.stringEnum("The fiscal quarter to query.", ["1", "2", "3", "4"]),
        "string",
      ),
    ],
    outputKey: "snapshot",
    outputMode: "object",
  },
  {
    name: "financial_statement",
    description: "Get Longbridge company financial statement data for a security.",
    path: "/v1/quote/financials/statements",
    queryDefaults: { kind: "IS", report: "af" },
    queryParams: [
      requiredSymbol,
      param("kind", "kind", s.stringEnum("The financial statement kind.", ["IS", "BS", "CF", "ALL"]), "string"),
      param("period", "report", reportPeriodSchema, "string"),
    ],
    outputKey: "statement",
    outputMode: "object",
  },
  {
    name: "dividend",
    description: "List Longbridge dividend history for a security.",
    path: "/v1/quote/dividends",
    queryParams: [
      requiredSymbol,
      optionalPage,
      optionalSize,
      param("year", "year", s.integer("The dividend year."), "integer"),
    ],
    outputKey: "dividends",
    outputMode: "list",
    dataKey: "list",
  },
  {
    name: "dividend_detail",
    description: "Get detailed Longbridge dividend information for a security.",
    path: "/v1/quote/dividends/details",
    queryParams: [requiredSymbol],
    outputKey: "dividend",
    outputMode: "object",
  },
  {
    name: "forecast_eps",
    description: "Get Longbridge EPS forecast data for a security.",
    path: "/v1/quote/forecast-eps",
    queryParams: [requiredSymbol],
    outputKey: "forecast",
    outputMode: "object",
  },
  {
    name: "consensus",
    description: "Get Longbridge financial consensus estimates for a security.",
    path: "/v1/quote/financial-consensus-detail",
    queryParams: [requiredSymbol],
    outputKey: "consensus",
    outputMode: "object",
  },
  {
    name: "valuation",
    description: "Get Longbridge valuation metrics for a security.",
    path: "/v1/quote/valuation",
    queryDefaults: { indicator: "pe", range: "1" },
    queryParams: [
      requiredSymbol,
      param("indicator", "indicator", s.nonEmptyString("The valuation indicator, such as pe, pb, or ps."), "string"),
      param("range", "range", s.nonEmptyString("The valuation range code."), "string"),
    ],
    outputKey: "valuation",
    outputMode: "object",
  },
  {
    name: "valuation_history",
    description: "List Longbridge historical valuation detail data for a security.",
    path: "/v1/quote/valuation/detail",
    queryParams: [
      requiredSymbol,
      param("indicator", "indicator", s.nonEmptyString("The valuation indicator, such as pe, pb, or ps."), "string"),
    ],
    outputKey: "history",
    outputMode: "object",
  },
  {
    name: "valuation_rank",
    description: "Get Longbridge valuation rank data for a security.",
    path: "/v1/quote/valuation/rank",
    queryParams: [requiredSymbol, optionalStartDate, optionalEndDate],
    outputKey: "rank",
    outputMode: "object",
  },
  {
    name: "valuation_comparison",
    description: "Compare Longbridge valuation metrics between a security and optional peers.",
    path: "/v1/quote/compare/valuation",
    queryParams: [
      requiredSymbol,
      param("currency", "currency", s.nonEmptyString("The comparison currency."), "string", { required: true }),
      param(
        "comparisonSymbols",
        "comparison_counter_ids",
        s.array("The peer symbols to compare against.", symbolSchema, { minItems: 1 }),
        "stringArray",
        { transform: "symbolsToCounterIdsJson" },
      ),
    ],
    outputKey: "comparison",
    outputMode: "object",
  },
  {
    name: "industry_valuation",
    description: "Get Longbridge industry peer valuation comparison for a security.",
    path: "/v1/quote/industry-valuation-comparison",
    queryParams: [
      requiredSymbol,
      param("currency", "currency", s.nonEmptyString("The comparison currency."), "string"),
    ],
    outputKey: "valuation",
    outputMode: "object",
  },
  {
    name: "industry_valuation_dist",
    description: "Get Longbridge industry valuation distribution for a security.",
    path: "/v1/quote/industry-valuation-distribution",
    queryParams: [requiredSymbol],
    outputKey: "distribution",
    outputMode: "object",
  },
  {
    name: "industry_peers",
    description: "List Longbridge industry peer securities for a security.",
    path: "/v1/quote/industries/peers",
    queryDefaults: { type: "1", industry_id: "" },
    queryParams: [requiredSymbol, param("market", "market", marketSchema, "string", { required: true })],
    outputKey: "peers",
    outputMode: "object",
  },
  {
    name: "company",
    description: "Get Longbridge company overview and profile data for a security.",
    path: "/v1/quote/comp-overview",
    queryParams: [requiredSymbol],
    outputKey: "profile",
    outputMode: "object",
  },
  {
    name: "executive",
    description: "List Longbridge company executives and board members for a security.",
    path: "/v1/quote/company-professionals",
    queryParams: [
      param("symbol", "counter_ids", symbolSchema, "string", {
        required: true,
        transform: "symbolToCounterId",
      }),
    ],
    outputKey: "executives",
    outputMode: "object",
  },
  {
    name: "shareholder",
    description: "List Longbridge shareholder records for a security.",
    path: "/v1/quote/shareholders",
    queryDefaults: { position: "detail" },
    queryParams: [
      requiredSymbol,
      param("range", "range", s.nonEmptyString("The shareholder range filter."), "string"),
      param("sortField", "sort_field", s.nonEmptyString("The shareholder sort field."), "string"),
      param("sortOrder", "sort_order", s.stringEnum("The shareholder sort order.", ["asc", "desc"]), "string"),
    ],
    outputKey: "shareholders",
    outputMode: "object",
  },
  {
    name: "shareholder_top",
    description: "List Longbridge top shareholder records for a security.",
    path: "/v1/quote/shareholders/top",
    queryParams: [requiredSymbol],
    outputKey: "shareholders",
    outputMode: "object",
  },
  {
    name: "shareholder_detail",
    description: "Get Longbridge shareholder holding detail for a security and shareholder object.",
    path: "/v1/quote/shareholders/holding",
    queryParams: [
      requiredSymbol,
      param("objectId", "object_id", s.integer("The Longbridge shareholder object ID."), "integer", { required: true }),
    ],
    outputKey: "shareholder",
    outputMode: "object",
  },
  {
    name: "fund_holder",
    description: "List Longbridge funds and ETFs holding a security.",
    path: "/v1/quote/fund-holders",
    queryParams: [requiredSymbol, optionalLimit],
    outputKey: "holders",
    outputMode: "object",
  },
  {
    name: "corp_action",
    description: "List Longbridge corporate actions for a security.",
    path: "/v1/quote/company-act",
    queryDefaults: { req_type: "1", version: "3" },
    queryParams: [requiredSymbol],
    outputKey: "actions",
    outputMode: "object",
  },
  {
    name: "invest_relation",
    description: "List Longbridge investor relations records for a security.",
    path: "/v1/quote/invest-relations",
    queryDefaults: { count: "0" },
    queryParams: [requiredSymbol, optionalCount],
    outputKey: "relations",
    outputMode: "object",
  },
  {
    name: "operating",
    description: "Get Longbridge operating metrics for a security.",
    path: "/v1/quote/operatings",
    queryParams: [requiredSymbol, param("report", "report", reportPeriodSchema, "string")],
    outputKey: "metrics",
    outputMode: "object",
  },
  {
    name: "business_segments",
    description: "Get Longbridge business segment data for a security.",
    path: "/v1/quote/fundamentals/business-segments",
    queryParams: [requiredSymbol],
    outputKey: "segments",
    outputMode: "object",
  },
  {
    name: "business_segments_history",
    description: "List Longbridge business segment history for a security.",
    path: "/v1/quote/fundamentals/business-segments/history",
    queryParams: [
      requiredSymbol,
      param("report", "report", reportPeriodSchema, "string"),
      param("category", "cate", s.nonEmptyString("The business segment category filter."), "string"),
    ],
    outputKey: "segments",
    outputMode: "object",
  },
  {
    name: "buyback",
    description: "Get Longbridge buyback data for a security.",
    path: "/v1/quote/buy-backs",
    queryParams: [requiredSymbol],
    outputKey: "buyback",
    outputMode: "object",
  },
  {
    name: "institution_rating",
    description: "Get the latest Longbridge institution analyst rating summary for a security.",
    path: "/v1/quote/institution-rating-latest",
    queryParams: [requiredSymbol],
    outputKey: "rating",
    outputMode: "object",
  },
  {
    name: "institution_rating_detail",
    description: "Get Longbridge institution analyst rating detail for a security.",
    path: "/v1/quote/institution-ratings/detail",
    queryParams: [requiredSymbol],
    outputKey: "rating",
    outputMode: "object",
  },
  {
    name: "institution_rating_history",
    description: "List Longbridge institution analyst rating history for a security.",
    path: "/v1/quote/institution-ratings",
    queryParams: [requiredSymbol],
    outputKey: "ratings",
    outputMode: "object",
  },
  {
    name: "institution_rating_industry_rank",
    description: "Get Longbridge institution rating industry rank for a security.",
    path: "/v1/quote/institution-ratings/industry-rank",
    queryDefaults: { page: "1", size: "20" },
    queryParams: [requiredSymbol, optionalPage, optionalSize],
    outputKey: "rank",
    outputMode: "object",
  },
  {
    name: "institutional_views",
    description: "List Longbridge institutional views for a security.",
    path: "/v1/quote/ratings/institutional",
    queryParams: [requiredSymbol],
    outputKey: "views",
    outputMode: "object",
  },
  {
    name: "stock_ratings",
    description: "List Longbridge stock rating records for a security.",
    path: "/v1/quote/ratings",
    queryParams: [requiredSymbol],
    outputKey: "ratings",
    outputMode: "object",
  },
  {
    name: "stock_rating_history",
    description: "List Longbridge stock rating history records for a security.",
    path: "/v1/quote/ratings/history",
    queryParams: [requiredSymbol],
    outputKey: "history",
    outputMode: "object",
  },
  {
    name: "news",
    description: "List Longbridge news articles for a symbol.",
    path: "/v1/content/{symbol}/news",
    pathParam: {
      inputName: "symbol",
      token: "{symbol}",
      schema: symbolSchema,
      kind: "string",
    },
    outputKey: "news",
    outputMode: "list",
    dataKey: "items",
  },
  {
    name: "screener_indicators",
    description: "List Longbridge screener indicator definitions.",
    path: "/v1/quote/ai/screener/indicators",
    outputKey: "indicators",
    outputMode: "object",
  },
  {
    name: "screener_search",
    description: "Search Longbridge securities with screener filters.",
    method: "POST",
    path: "/v1/quote/ai/screener/search",
    bodyDefaults: {
      market: "US",
      filters: [],
      returns: longbridgeScreenerDefaultReturns,
      sort_by: 0,
      sort_order: 1,
      industries: [],
      page: 0,
      size: 20,
    },
    bodyParams: [
      param("market", "market", marketSchema, "string"),
      param(
        "filters",
        "filters",
        s.array("Longbridge screener filter conditions.", screenerFilterSchema),
        "objectArray",
      ),
      param(
        "conditions",
        "conditions",
        s.array("Alternative Longbridge screener filter conditions.", screenerFilterSchema),
        "objectArray",
      ),
      param(
        "returns",
        "returns",
        s.array("Longbridge screener return fields.", s.nonEmptyString("One return field.")),
        "stringArray",
      ),
      param(
        "extraReturns",
        "extra_returns",
        s.array("Additional Longbridge screener return fields.", s.nonEmptyString("One return field.")),
        "stringArray",
      ),
      param("page", "page", zeroBasedPageSchema, "integer"),
      param("size", "size", sizeSchema, "integer"),
      param("sortByKey", "sort_by_key", s.nonEmptyString("The screener return field key to sort by."), "string"),
      param(
        "sortBy",
        "sort_by",
        s.nonNegativeInteger("The zero-based return field index used for sorting."),
        "integer",
      ),
      param("sortOrder", "sort_order", s.integer("The Longbridge sort order code."), "integer"),
    ],
    bodyPostProcessor: "screenerSearch",
    outputKey: "results",
    outputMode: "list",
    dataKey: "items",
  },
  {
    name: "screener_recommend_strategies",
    description: "List Longbridge recommended screener strategies.",
    path: "/v1/quote/ai/screener/strategies/recommend",
    queryParams: [param("market", "market", marketSchema, "string", { required: true })],
    outputKey: "strategies",
    outputMode: "object",
  },
  {
    name: "screener_user_strategies",
    description: "List Longbridge saved screener strategies for the connected user.",
    path: "/v1/quote/ai/screener/strategies/mine",
    queryParams: [param("market", "market", marketSchema, "string", { required: true })],
    outputKey: "strategies",
    outputMode: "object",
  },
  {
    name: "screener_strategy",
    description: "Get one Longbridge screener strategy by ID.",
    path: "/v1/quote/ai/screener/strategy/{id}",
    pathParam: {
      inputName: "id",
      token: "{id}",
      schema: s.positiveInteger("The Longbridge screener strategy ID."),
      kind: "integer",
    },
    outputKey: "strategy",
    outputMode: "object",
  },
  {
    name: "exchange_rate",
    description: "Get Longbridge exchange rates for supported currencies.",
    path: "/v1/asset/exchange_rates",
    outputKey: "rates",
    outputMode: "object",
  },
  {
    name: "profit_analysis",
    description: "Get Longbridge portfolio profit and loss analysis summary.",
    path: "/v1/portfolio/profit-analysis-summary",
    queryParams: [optionalUnixStartDate, optionalUnixEndDate],
    outputKey: "analysis",
    outputMode: "object",
  },
  {
    name: "profit_analysis_detail",
    description: "Get Longbridge portfolio profit and loss detail for a security.",
    path: "/v1/portfolio/profit-analysis/detail",
    queryParams: [requiredSymbol, optionalUnixStartDate, optionalUnixEndDate],
    outputKey: "detail",
    outputMode: "object",
  },
  {
    name: "profit_analysis_by_market",
    description: "List Longbridge portfolio profit and loss analysis grouped by market.",
    path: "/v1/portfolio/profit-analysis/by-market",
    queryDefaults: { page: "1", size: "50" },
    queryParams: [
      param("market", "market", marketSchema, "string"),
      optionalUnixStartDate,
      optionalUnixEndDate,
      param("currency", "currency", s.nonEmptyString("The currency code."), "string"),
      optionalPage,
      optionalSize,
    ],
    outputKey: "analysis",
    outputMode: "object",
  },
  {
    name: "profit_analysis_flows",
    description: "List Longbridge portfolio profit and loss flow records for a security.",
    path: "/v1/portfolio/profit-analysis/flows",
    queryParams: [
      requiredSymbol,
      optionalPage,
      optionalSize,
      param("derivative", "derivative", s.boolean("Whether to include derivative records."), "boolean", {
        transform: "booleanString",
      }),
      optionalUnixStartDate,
      optionalUnixEndDate,
    ],
    outputKey: "flows",
    outputMode: "object",
  },
  {
    name: "profit_analysis_sublist",
    description: "List Longbridge portfolio profit and loss analysis sublist records.",
    path: "/v1/portfolio/profit-analysis-sublist",
    queryDefaults: { profit_or_loss: "all" },
    queryParams: [
      param(
        "profitOrLoss",
        "profit_or_loss",
        s.stringEnum("The profit/loss grouping filter.", ["all", "profit", "loss"]),
        "string",
      ),
      optionalUnixStartDate,
      optionalUnixEndDate,
    ],
    outputKey: "items",
    outputMode: "object",
  },
];
