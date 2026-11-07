import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aisa";
const ticker = s.string("The public-market ticker symbol to query.");
const cik = s.string("The SEC Central Index Key used to identify the company.");
const period = s.stringEnum("The reporting period to return.", ["annual", "quarterly", "ttm"]);
const limit = s.integer("The maximum number of records to return.", { minimum: 1 });
const financialOutput = s.looseObject("The financial-market data returned by AIsa.");
const filingType = s.stringEnum("The SEC filing type to retrieve.", ["10-K", "10-Q", "8-K"]);
const filingItem = s.stringEnum("The numbered filing item or section to return.", [
  "Item-1",
  "Item-1A",
  "Item-1B",
  "Item-2",
  "Item-3",
  "Item-4",
  "Item-5",
  "Item-6",
  "Item-7",
  "Item-7A",
  "Item-8",
  "Item-9",
  "Item-9A",
  "Item-9B",
  "Item-10",
  "Item-11",
  "Item-12",
  "Item-13",
  "Item-14",
  "Item-15",
  "Item-16",
  "Item-1.01",
  "Item-1.02",
  "Item-1.03",
  "Item-1.04",
  "Item-2.01",
  "Item-2.02",
  "Item-2.03",
  "Item-2.04",
  "Item-2.05",
  "Item-2.06",
  "Item-3.01",
  "Item-3.02",
  "Item-3.03",
  "Item-4.01",
  "Item-4.02",
  "Item-5.01",
  "Item-5.02",
  "Item-5.03",
  "Item-5.04",
  "Item-5.05",
  "Item-5.06",
  "Item-5.07",
  "Item-5.08",
  "Item-6.01",
  "Item-6.02",
  "Item-6.03",
  "Item-6.04",
  "Item-6.05",
  "Item-7.01",
  "Item-8.01",
  "Item-9.01",
]);

export const financialPriceSnapshotAction: ActionDefinition = defineProviderAction(service, {
  name: "get_stock_price_snapshot",
  operationType: "read",
  description: "Get the latest available market-price snapshot for a ticker.",
  requiredScopes: [],
  inputSchema: s.requiredObject("A ticker for a current market-price snapshot.", { ticker }),
  outputSchema: financialOutput,
});

export const financialPricesAction: ActionDefinition = defineProviderAction(service, {
  name: "get_stock_prices",
  operationType: "read",
  description: "Get historical market prices for a ticker and date range.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    description: "A ticker, interval, and inclusive date range for historical prices.",
    properties: {
      cursor: {
        type: "string",
        description:
          "Opaque pagination cursor from a previous response's next_page_url. When provided, all other query parameters are ignored: the cursor carries the original request's filters. Treat it as opaque; do not construct or modify it.",
        minLength: 1,
      },
      endDate: {
        type: "string",
        format: "date",
        description: "The last market date in YYYY-MM-DD format.",
      },
      interval: {
        type: "string",
        enum: ["day", "week", "month", "year"],
        description: "The requested price-bar interval.",
      },
      intervalMultiplier: {
        type: "string",
        description: "The interval multiplier value.",
      },
      startDate: {
        type: "string",
        format: "date",
        description: "The first market date in YYYY-MM-DD format.",
      },
      ticker: {
        type: "string",
        description: "The public-market ticker symbol to query.",
      },
    },
    required: [],
    additionalProperties: false,
    anyOf: [
      {
        required: ["cursor"],
      },
      {
        required: ["ticker", "interval", "startDate", "endDate"],
      },
    ],
  },
  outputSchema: financialOutput,
});

export const financialCompanyFactsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_company_facts",
  operationType: "read",
  description: "Get standardized SEC company facts by ticker or CIK.",
  requiredScopes: [],
  inputSchema: s.requireAnyProperty(
    s.object(
      "A ticker or CIK for retrieving standardized company facts.",
      { ticker, cik },
      { optional: ["ticker", "cik"] },
    ),
    ["ticker", "cik"],
  ),
  outputSchema: financialOutput,
});

export const incomeStatementsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_income_statements",
  operationType: "read",
  description: "Get standardized income statements for a company.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    description: "A company identifier and reporting period for income statements.",
    properties: {
      cik: {
        type: "string",
        description: "The SEC Central Index Key used to identify the company.",
      },
      cursor: {
        type: "string",
        description:
          "Opaque pagination cursor from a previous response's next_page_url. When provided, all other query parameters are ignored: the cursor carries the original request's filters. Treat it as opaque; do not construct or modify it.",
        minLength: 1,
      },
      exchange: {
        enum: ["LSE"],
        type: "string",
        description:
          "The exchange the ticker is listed on. Omit for US listings. Use `LSE` for the London Stock Exchange; any ticker of the company, including a second share class, returns the company's statements.",
      },
      filingDate: {
        format: "date",
        type: "string",
        description:
          "Filter by exact SEC filing date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateGt: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date greater than date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateGte: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date greater than or equal to date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateLt: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date less than date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateLte: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date less than or equal to date in YYYY-MM-DD format. Useful for point-in-time queries: returns only data that was publicly filed by the given date. Rows without a known filing date are excluded.",
      },
      isin: {
        type: "string",
        description:
          "The ISIN (International Securities Identification Number) of a non-US listing. An alternative to `ticker` and `exchange`.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        description: "The maximum number of records to return.",
      },
      market: {
        enum: ["UK", "US"],
        type: "string",
        description: "The market value.",
      },
      period: {
        type: "string",
        enum: ["annual", "quarterly", "ttm"],
        description: "The reporting period to return.",
      },
      reportPeriod: {
        format: "date",
        type: "string",
        description: "Filter by exact report period date in YYYY-MM-DD format.",
      },
      reportPeriodGt: {
        format: "date",
        type: "string",
        description: "Filter by report period greater than date in YYYY-MM-DD format.",
      },
      reportPeriodGte: {
        format: "date",
        type: "string",
        description: "Filter by report period greater than or equal to date in YYYY-MM-DD format.",
      },
      reportPeriodLt: {
        format: "date",
        type: "string",
        description: "Filter by report period less than date in YYYY-MM-DD format.",
      },
      reportPeriodLte: {
        format: "date",
        type: "string",
        description: "Filter by report period less than or equal to date in YYYY-MM-DD format.",
      },
      ticker: {
        type: "string",
        description: "The public-market ticker symbol to query.",
      },
    },
    required: [],
    additionalProperties: false,
    anyOf: [
      {
        required: ["cursor"],
      },
      {
        required: ["period"],
        anyOf: [
          {
            required: ["ticker"],
          },
          {
            required: ["cik"],
          },
          {
            required: ["isin"],
          },
        ],
      },
    ],
  },
  outputSchema: financialOutput,
});

export const balanceSheetsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_balance_sheets",
  operationType: "read",
  description: "Get standardized balance sheets for a company.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    description: "A company identifier and reporting period for balance sheets.",
    properties: {
      cik: {
        type: "string",
        description: "The SEC Central Index Key used to identify the company.",
      },
      cursor: {
        type: "string",
        description:
          "Opaque pagination cursor from a previous response's next_page_url. When provided, all other query parameters are ignored: the cursor carries the original request's filters. Treat it as opaque; do not construct or modify it.",
        minLength: 1,
      },
      exchange: {
        enum: ["LSE"],
        type: "string",
        description:
          "The exchange the ticker is listed on. Omit for US listings. Use `LSE` for the London Stock Exchange; any ticker of the company, including a second share class, returns the company's statements.",
      },
      filingDate: {
        format: "date",
        type: "string",
        description:
          "Filter by exact SEC filing date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateGt: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date greater than date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateGte: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date greater than or equal to date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateLt: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date less than date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateLte: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date less than or equal to date in YYYY-MM-DD format. Useful for point-in-time queries: returns only data that was publicly filed by the given date. Rows without a known filing date are excluded.",
      },
      isin: {
        type: "string",
        description:
          "The ISIN (International Securities Identification Number) of a non-US listing. An alternative to `ticker` and `exchange`.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        description: "The maximum number of records to return.",
      },
      market: {
        enum: ["UK", "US"],
        type: "string",
        description: "The market value.",
      },
      period: {
        type: "string",
        enum: ["annual", "quarterly", "ttm"],
        description: "The reporting period to return.",
      },
      reportPeriod: {
        format: "date",
        type: "string",
        description: "Filter by exact report period date in YYYY-MM-DD format.",
      },
      reportPeriodGt: {
        format: "date",
        type: "string",
        description: "Filter by report period greater than date in YYYY-MM-DD format.",
      },
      reportPeriodGte: {
        format: "date",
        type: "string",
        description: "Filter by report period greater than or equal to date in YYYY-MM-DD format.",
      },
      reportPeriodLt: {
        format: "date",
        type: "string",
        description: "Filter by report period less than date in YYYY-MM-DD format.",
      },
      reportPeriodLte: {
        format: "date",
        type: "string",
        description: "Filter by report period less than or equal to date in YYYY-MM-DD format.",
      },
      ticker: {
        type: "string",
        description: "The public-market ticker symbol to query.",
      },
    },
    required: [],
    additionalProperties: false,
    anyOf: [
      {
        required: ["cursor"],
      },
      {
        required: ["period"],
        anyOf: [
          {
            required: ["ticker"],
          },
          {
            required: ["cik"],
          },
          {
            required: ["isin"],
          },
        ],
      },
    ],
  },
  outputSchema: financialOutput,
});

export const cashFlowStatementsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_cash_flow_statements",
  operationType: "read",
  description: "Get standardized cash-flow statements for a company.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    description: "A company identifier and reporting period for cash-flow statements.",
    properties: {
      cik: {
        type: "string",
        description: "The SEC Central Index Key used to identify the company.",
      },
      cursor: {
        type: "string",
        description:
          "Opaque pagination cursor from a previous response's next_page_url. When provided, all other query parameters are ignored: the cursor carries the original request's filters. Treat it as opaque; do not construct or modify it.",
        minLength: 1,
      },
      exchange: {
        enum: ["LSE"],
        type: "string",
        description:
          "The exchange the ticker is listed on. Omit for US listings. Use `LSE` for the London Stock Exchange; any ticker of the company, including a second share class, returns the company's statements.",
      },
      filingDate: {
        format: "date",
        type: "string",
        description:
          "Filter by exact SEC filing date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateGt: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date greater than date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateGte: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date greater than or equal to date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateLt: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date less than date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateLte: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date less than or equal to date in YYYY-MM-DD format. Useful for point-in-time queries: returns only data that was publicly filed by the given date. Rows without a known filing date are excluded.",
      },
      isin: {
        type: "string",
        description:
          "The ISIN (International Securities Identification Number) of a non-US listing. An alternative to `ticker` and `exchange`.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        description: "The maximum number of records to return.",
      },
      period: {
        type: "string",
        enum: ["annual", "quarterly", "ttm"],
        description: "The reporting period to return.",
      },
      reportPeriod: {
        format: "date",
        type: "string",
        description: "Filter by exact report period date in YYYY-MM-DD format.",
      },
      reportPeriodGt: {
        format: "date",
        type: "string",
        description: "Filter by report period greater than date in YYYY-MM-DD format.",
      },
      reportPeriodGte: {
        format: "date",
        type: "string",
        description: "Filter by report period greater than or equal to date in YYYY-MM-DD format.",
      },
      reportPeriodLt: {
        format: "date",
        type: "string",
        description: "Filter by report period less than date in YYYY-MM-DD format.",
      },
      reportPeriodLte: {
        format: "date",
        type: "string",
        description: "Filter by report period less than or equal to date in YYYY-MM-DD format.",
      },
      ticker: {
        type: "string",
        description: "The public-market ticker symbol to query.",
      },
    },
    required: [],
    additionalProperties: false,
    anyOf: [
      {
        required: ["cursor"],
      },
      {
        required: ["period"],
        anyOf: [
          {
            required: ["ticker"],
          },
          {
            required: ["cik"],
          },
          {
            required: ["isin"],
          },
        ],
      },
    ],
  },
  outputSchema: financialOutput,
});

export const financialMetricsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_financial_metrics",
  operationType: "read",
  description: "Get historical valuation, profitability, growth, and leverage metrics.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    description: "A company identifier and reporting period for financial metrics.",
    properties: {
      cik: {
        type: "string",
        description: "The SEC Central Index Key used to identify the company.",
      },
      cursor: {
        type: "string",
        description:
          "Opaque pagination cursor from a previous response's next_page_url. When provided, all other query parameters are ignored: the cursor carries the original request's filters. Treat it as opaque; do not construct or modify it.",
        minLength: 1,
      },
      exchange: {
        enum: ["LSE"],
        type: "string",
        description:
          "The exchange the ticker is listed on. Omit for US listings. Use `LSE` for the London Stock Exchange; any ticker of the company, including a second share class, returns the company's metrics. Price-based values (market cap, enterprise value, valuation ratios, dividend yield) are not yet available for UK tickers.",
      },
      filingDate: {
        format: "date",
        type: "string",
        description:
          "Filter by exact SEC filing date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateGt: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date greater than date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateGte: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date greater than or equal to date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateLt: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date less than date in YYYY-MM-DD format. Rows without a known filing date are excluded.",
      },
      filingDateLte: {
        format: "date",
        type: "string",
        description:
          "Filter by SEC filing date less than or equal to date in YYYY-MM-DD format. Useful for point-in-time queries: returns only data that was publicly filed by the given date. Rows without a known filing date are excluded.",
      },
      isin: {
        type: "string",
        description:
          "The ISIN (International Securities Identification Number) of a non-US listing. An alternative to `ticker` and `exchange`.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        description: "The maximum number of records to return.",
      },
      period: {
        type: "string",
        enum: ["annual", "quarterly", "ttm"],
        description: "The reporting period to return.",
      },
      reportPeriod: {
        format: "date",
        type: "string",
        description: "Filter by exact report period date in YYYY-MM-DD format.",
      },
      reportPeriodGt: {
        format: "date",
        type: "string",
        description: "Filter by report period greater than date in YYYY-MM-DD format.",
      },
      reportPeriodGte: {
        format: "date",
        type: "string",
        description: "Filter by report period greater than or equal to date in YYYY-MM-DD format.",
      },
      reportPeriodLt: {
        format: "date",
        type: "string",
        description: "Filter by report period less than date in YYYY-MM-DD format.",
      },
      reportPeriodLte: {
        format: "date",
        type: "string",
        description: "Filter by report period less than or equal to date in YYYY-MM-DD format.",
      },
      ticker: {
        type: "string",
        description: "The public-market ticker symbol to query.",
      },
    },
    required: [],
    additionalProperties: false,
    anyOf: [
      {
        required: ["cursor"],
      },
      {
        required: ["period"],
        anyOf: [
          {
            required: ["ticker"],
          },
          {
            required: ["cik"],
          },
          {
            required: ["isin"],
          },
        ],
      },
    ],
  },
  outputSchema: financialOutput,
});

export const financialMetricsSnapshotAction: ActionDefinition = defineProviderAction(service, {
  name: "get_financial_metrics_snapshot",
  operationType: "read",
  description: "Get the latest available financial metrics for a company.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    description: "A ticker or CIK for the latest financial-metrics snapshot.",
    properties: {
      cik: {
        type: "string",
        description: "The SEC Central Index Key used to identify the company.",
      },
      exchange: {
        enum: ["LSE"],
        type: "string",
        description:
          "The exchange the ticker is listed on. Omit for US listings. Use `LSE` for the London Stock Exchange; any ticker of the company, including a second share class, returns the company's metrics. Price-based values (market cap, enterprise value, valuation ratios, dividend yield) are not yet available for UK tickers.",
      },
      isin: {
        type: "string",
        description:
          "The ISIN (International Securities Identification Number) of a non-US listing. An alternative to `ticker` and `exchange`.",
      },
      market: {
        enum: ["UK", "US"],
        type: "string",
        description: "The market value.",
      },
      ticker: {
        type: "string",
        description: "The public-market ticker symbol to query.",
      },
    },
    required: [],
    additionalProperties: false,
    anyOf: [
      {
        required: ["ticker"],
      },
      {
        required: ["cik"],
      },
      {
        required: ["isin"],
      },
    ],
  },
  outputSchema: financialOutput,
});

export const earningsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_stock_earnings",
  operationType: "read",
  description: "Get the most recent earnings snapshot for a ticker.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    description: "A ticker for an earnings snapshot.",
    properties: {
      cursor: {
        type: "string",
        description:
          "Opaque pagination cursor from a previous response's next_page_url. When provided, all other query parameters are ignored: the cursor carries the original request's filters. Treat it as opaque; do not construct or modify it.",
        minLength: 1,
      },
      limit: {
        maximum: 40,
        minimum: 1,
        type: "integer",
        description:
          "Number of most-recent **report periods** worth of filings to return, sorted by `(report_period DESC, filing_date ASC)`. The number of entries returned may exceed `limit` when a recent period has both an 8-K and a 10-Q / 10-K. Values above 40 are clamped to 40. Non-positive or non-integer values return 400. This is the total across all pages, not a page size: each page holds up to 10 records, linked by `next_page_url`.",
      },
      ticker: {
        type: "string",
        description: "The public-market ticker symbol to query.",
      },
    },
    required: [],
    additionalProperties: false,
    anyOf: [
      {
        required: ["cursor"],
      },
      {
        required: ["ticker"],
      },
    ],
  },
  outputSchema: financialOutput,
});

export const analystEstimatesAction: ActionDefinition = defineProviderAction(service, {
  name: "get_analyst_estimates",
  operationType: "read",
  description: "Get analyst estimates for a ticker and reporting period.",
  requiredScopes: [],
  inputSchema: s.object(
    "A ticker, optional period, and result limit for analyst estimates.",
    { ticker, period, limit },
    { optional: ["period", "limit"] },
  ),
  outputSchema: financialOutput,
});

export const insiderTradesAction: ActionDefinition = defineProviderAction(service, {
  name: "get_insider_trades",
  operationType: "read",
  description: "List reported insider transactions for a ticker.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    description: "A ticker and optional filters for reported insider transactions.",
    properties: {
      cursor: {
        type: "string",
        description:
          "Opaque pagination cursor from a previous response's next_page_url. When provided, all other query parameters are ignored: the cursor carries the original request's filters. Treat it as opaque; do not construct or modify it.",
        minLength: 1,
      },
      filingDate: {
        type: "string",
        format: "date",
        description: "The exact filing date in YYYY-MM-DD format.",
      },
      filingDateGt: {
        format: "date",
        type: "string",
        description: "Filter by filing date greater than this date (YYYY-MM-DD).",
      },
      filingDateFrom: {
        type: "string",
        format: "date",
        description: "Return filings on or after this date.",
      },
      filingDateLt: {
        format: "date",
        type: "string",
        description: "Filter by filing date less than this date (YYYY-MM-DD).",
      },
      filingDateTo: {
        type: "string",
        format: "date",
        description: "Return filings on or before this date.",
      },
      formType: {
        enum: ["4", "4/A", "5", "5/A"],
        type: "string",
        description: "Filter by SEC form type: 4 for trades, 5 for annual statements (or their amendments 4/A, 5/A).",
      },
      limit: {
        type: "integer",
        minimum: 1,
        description: "The maximum number of records to return.",
      },
      insiderName: {
        type: "string",
        description: "Text to match against the reporting insider's name.",
      },
      ticker: {
        type: "string",
        description: "The public-market ticker symbol to query.",
      },
      transactionType: {
        type: "string",
        description: "The transaction type to return.",
      },
    },
    required: [],
    additionalProperties: false,
    anyOf: [
      {
        required: ["cursor"],
      },
      {
        required: ["ticker"],
      },
    ],
  },
  outputSchema: financialOutput,
});

export const financialNewsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_company_news",
  operationType: "read",
  description: "Get recent financial news, optionally filtered by ticker.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    description: "An optional ticker and result limit for financial news.",
    properties: {
      cursor: {
        type: "string",
        description:
          "Opaque pagination cursor from a previous response's next_page_url. When provided, all other query parameters are ignored: the cursor carries the original request's filters. Treat it as opaque; do not construct or modify it.",
        minLength: 1,
      },
      limit: {
        type: "integer",
        minimum: 1,
        description: "The maximum number of records to return.",
      },
      ticker: {
        type: "string",
        description: "The public-market ticker symbol to query.",
      },
    },
    required: [],
    additionalProperties: false,
  },
  outputSchema: financialOutput,
});

export const filingsAction: ActionDefinition = defineProviderAction(service, {
  name: "list_company_filings",
  operationType: "read",
  description: "List SEC filings by ticker, CIK, and filing type.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    description: "Company and filing filters for listing SEC filings.",
    properties: {
      cik: {
        type: "string",
        description: "The SEC Central Index Key used to identify the company.",
      },
      cursor: {
        type: "string",
        description:
          "Opaque pagination cursor from a previous response's next_page_url. When provided, all other query parameters are ignored: the cursor carries the original request's filters. Treat it as opaque; do not construct or modify it.",
        minLength: 1,
      },
      filingType: {
        type: "string",
        description: "The SEC filing type, such as 10-K or 10-Q.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        description: "The maximum number of records to return.",
      },
      ticker: {
        type: "string",
        description: "The public-market ticker symbol to query.",
      },
    },
    required: [],
    additionalProperties: false,
  },
  outputSchema: financialOutput,
});

export const filingItemsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_filing_items",
  operationType: "read",
  description: "Get selected sections and exhibits from a company filing.",
  requiredScopes: [],
  inputSchema: s.object(
    "A filing identity and optional section filters.",
    {
      ticker,
      filingType,
      year: s.integer("The filing year."),
      quarter: s.integer("The filing quarter.", { minimum: 1, maximum: 4 }),
      item: filingItem,
      accessionNumber: s.string("The SEC accession number of a specific filing."),
      includeExhibits: s.boolean("Whether to include filing exhibits in the response."),
    },
    { optional: ["quarter", "item", "accessionNumber", "includeExhibits"] },
  ),
  outputSchema: financialOutput,
});

export const financialActions: readonly ActionDefinition[] = [
  financialPriceSnapshotAction,
  financialPricesAction,
  financialCompanyFactsAction,
  incomeStatementsAction,
  balanceSheetsAction,
  cashFlowStatementsAction,
  financialMetricsAction,
  financialMetricsSnapshotAction,
  earningsAction,
  analystEstimatesAction,
  insiderTradesAction,
  financialNewsAction,
  filingsAction,
  filingItemsAction,
];
