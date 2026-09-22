import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { expandedZyhubActions } from "./expanded-actions.ts";

const service = "zyhub";

const marketSchema = s.stringEnum("The market containing the requested instrument.", ["cn", "hk", "us", "gi"]);
const symbolSchema = s.nonEmptyString("The market-specific instrument symbol, such as sh688001 or AAPL.");
const newsKeywordsSchema = s.array(
  "One to ten keywords to search for.",
  s.nonEmptyString("A keyword containing at most 15 characters and no commas.", {
    maxLength: 15,
    pattern: "^[^,]+$",
  }),
  { minItems: 1, maxItems: 10 },
);
const responseSchema = s.object("The response returned by Sina Finance ZYHub.", {
  response: s.unknown("The upstream JSON value or text returned by the selected ZYHub API."),
});

const searchSymbolsAction = defineProviderAction(service, {
  name: "search_symbols",
  description: "Search Sina Finance instrument symbols across one or more markets.",
  operationType: "read",
  inputSchema: s.object("The input payload for searching instrument symbols.", {
    marketTypes: s.nonEmptyString(
      "Comma-separated Sina Finance market type codes, such as 11 for A shares or 31 for Hong Kong stocks.",
    ),
    query: s.nonEmptyString("The company name, ticker, or other text to search for."),
  }),
  outputSchema: responseSchema,
});

const getStockQuoteAction = defineProviderAction(service, {
  name: "get_stock_quote",
  description: "Get the latest Sina Finance quote for a stock or global index.",
  operationType: "read",
  inputSchema: s.object("The input payload for retrieving a current stock quote.", {
    market: marketSchema,
    symbol: symbolSchema,
  }),
  outputSchema: responseSchema,
});

const getDailyKlineAction = defineProviderAction(service, {
  name: "get_daily_kline",
  description: "Get daily Sina Finance candlesticks for a stock or global index.",
  operationType: "read",
  inputSchema: s.object(
    "The input payload for retrieving daily candlesticks.",
    {
      market: marketSchema,
      symbol: symbolSchema,
      adjustment: s.stringEnum("The price adjustment mode.", ["qfq", "hfq"]),
      comparison: s.stringEnum("Whether results are on or before, or on or after, the target date.", ["le", "ge"]),
      date: s.string("The target trading date in YYYY-MM-DD format.", { format: "date" }),
      limit: s.integer("The number of daily candlesticks to return.", { minimum: 1 }),
    },
    { optional: ["adjustment", "comparison", "date", "limit"] },
  ),
  outputSchema: responseSchema,
});

const getCompanyProfileAction = defineProviderAction(service, {
  name: "get_company_profile",
  description: "Get Sina Finance profile and reference data for an A-share company.",
  operationType: "read",
  inputSchema: s.object("The input payload for retrieving an A-share company profile.", {
    symbol: s.nonEmptyString("The prefixed A-share symbol, such as sh688111."),
  }),
  outputSchema: responseSchema,
});

const getForexQuoteAction = defineProviderAction(service, {
  name: "get_forex_quote",
  description: "Get the latest Sina Finance quote for a currency pair.",
  operationType: "read",
  inputSchema: s.object("The input payload for retrieving a currency-pair quote.", {
    symbol: s.nonEmptyString("The uppercase currency-pair code, such as USDCNY.", {
      pattern: "^[A-Z]+$",
    }),
  }),
  outputSchema: responseSchema,
});

const searchNewsAction = defineProviderAction(service, {
  name: "search_news",
  description: "Search Sina Finance news by one or more keywords.",
  operationType: "read",
  inputSchema: s.object(
    "The input payload for searching Sina Finance news.",
    {
      keywords: newsKeywordsSchema,
      page: s.integer("The one-based result page number.", { minimum: 1 }),
      pageSize: s.integer("The number of news items to return per page.", {
        minimum: 1,
        maximum: 20,
      }),
    },
    { optional: ["page", "pageSize"] },
  ),
  outputSchema: responseSchema,
});

export const zyhubActions: ActionDefinition[] = [
  searchSymbolsAction,
  getStockQuoteAction,
  getDailyKlineAction,
  getCompanyProfileAction,
  getForexQuoteAction,
  searchNewsAction,
  ...expandedZyhubActions,
];
