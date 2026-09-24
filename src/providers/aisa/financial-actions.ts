import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aisa";
const ticker = s.string("The public-market ticker symbol to query.");
const cik = s.string("The SEC Central Index Key used to identify the company.");
const period = s.stringEnum("The reporting period to return.", ["annual", "quarterly", "ttm"]);
const limit = s.integer("The maximum number of records to return.", { minimum: 1 });
const financialOutput = s.looseObject("The financial-market data returned by AIsa.");

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
  inputSchema: s.requiredObject("A ticker, interval, and inclusive date range for historical prices.", {
    ticker,
    interval: s.stringEnum("The requested price-bar interval.", ["day", "week", "month", "year"]),
    startDate: s.string("The first market date in YYYY-MM-DD format.", { format: "date" }),
    endDate: s.string("The last market date in YYYY-MM-DD format.", { format: "date" }),
  }),
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

function statementsInput(description: string) {
  return s.requireAnyProperty(
    s.object(
      description,
      { ticker, cik, period, limit },
      {
        optional: ["ticker", "cik", "limit"],
      },
    ),
    ["ticker", "cik"],
  );
}

export const incomeStatementsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_income_statements",
  operationType: "read",
  description: "Get standardized income statements for a company.",
  requiredScopes: [],
  inputSchema: statementsInput("A company identifier and reporting period for income statements."),
  outputSchema: financialOutput,
});

export const balanceSheetsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_balance_sheets",
  operationType: "read",
  description: "Get standardized balance sheets for a company.",
  requiredScopes: [],
  inputSchema: statementsInput("A company identifier and reporting period for balance sheets."),
  outputSchema: financialOutput,
});

export const cashFlowStatementsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_cash_flow_statements",
  operationType: "read",
  description: "Get standardized cash-flow statements for a company.",
  requiredScopes: [],
  inputSchema: statementsInput("A company identifier and reporting period for cash-flow statements."),
  outputSchema: financialOutput,
});

export const financialMetricsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_financial_metrics",
  operationType: "read",
  description: "Get historical valuation, profitability, growth, and leverage metrics.",
  requiredScopes: [],
  inputSchema: statementsInput("A company identifier and reporting period for financial metrics."),
  outputSchema: financialOutput,
});

export const financialMetricsSnapshotAction: ActionDefinition = defineProviderAction(service, {
  name: "get_financial_metrics_snapshot",
  operationType: "read",
  description: "Get the latest available financial metrics for a company.",
  requiredScopes: [],
  inputSchema: s.requireAnyProperty(
    s.object(
      "A ticker or CIK for the latest financial-metrics snapshot.",
      { ticker, cik },
      { optional: ["ticker", "cik"] },
    ),
    ["ticker", "cik"],
  ),
  outputSchema: financialOutput,
});

export const earningsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_stock_earnings",
  operationType: "read",
  description: "Get the most recent earnings snapshot for a ticker.",
  requiredScopes: [],
  inputSchema: s.requiredObject("A ticker for an earnings snapshot.", { ticker }),
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
  inputSchema: s.object(
    "A ticker and optional filters for reported insider transactions.",
    {
      ticker,
      limit,
      insiderName: s.string("Text to match against the reporting insider's name."),
      transactionType: s.string("The transaction type to return."),
      filingDate: s.string("The exact filing date in YYYY-MM-DD format.", { format: "date" }),
      filingDateFrom: s.string("Return filings on or after this date.", { format: "date" }),
      filingDateTo: s.string("Return filings on or before this date.", { format: "date" }),
    },
    {
      optional: ["limit", "insiderName", "transactionType", "filingDate", "filingDateFrom", "filingDateTo"],
    },
  ),
  outputSchema: financialOutput,
});

export const financialNewsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_company_news",
  operationType: "read",
  description: "Get recent financial news, optionally filtered by ticker.",
  requiredScopes: [],
  inputSchema: s.object(
    "An optional ticker and result limit for financial news.",
    { ticker, limit },
    { optional: ["ticker", "limit"] },
  ),
  outputSchema: financialOutput,
});

export const filingsAction: ActionDefinition = defineProviderAction(service, {
  name: "list_company_filings",
  operationType: "read",
  description: "List SEC filings by ticker, CIK, and filing type.",
  requiredScopes: [],
  inputSchema: s.object(
    "Company and filing filters for listing SEC filings.",
    {
      ticker,
      cik,
      filingType: s.string("The SEC filing type, such as 10-K or 10-Q."),
      limit,
    },
    { optional: ["ticker", "cik", "filingType", "limit"] },
  ),
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
      filingType: s.string("The SEC filing type, such as 10-K or 10-Q."),
      year: s.integer("The filing year."),
      quarter: s.integer("The filing quarter.", { minimum: 1, maximum: 4 }),
      item: s.string("The filing item or section to return."),
      accessionNumber: s.string("The SEC accession number of a specific filing."),
      includeExhibits: s.boolean("Whether to include filing exhibits in the response."),
    },
    { optional: ["quarter", "item", "accessionNumber", "includeExhibits"] },
  ),
  outputSchema: financialOutput,
});

export const financialActions: ActionDefinition[] = [
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
