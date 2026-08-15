import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { alpacaDataScope } from "./scopes.ts";

const service = "alpaca";

function nonBlankString(description: string): JsonSchema {
  return s.string(description, { minLength: 1, pattern: "\\S" });
}

const rawObjectSchema = s.unknownObject("One raw object returned by Alpaca.");
const rawRecordSchema = s.record(s.unknown("Raw value."), {
  description: "A raw object map returned by Alpaca.",
});
const symbolListSchema = s.array("A non-empty list of symbols.", nonBlankString("A symbol."), {
  minItems: 1,
});
const dateOrDateTimeSchema = nonBlankString("A date or RFC-3339 timestamp accepted by Alpaca.");
const pageTokenSchema = nonBlankString("Pagination token returned by Alpaca.");
const limitSchema = s.integer("Maximum number of records to return.", {
  minimum: 1,
  maximum: 500,
});
const marketDataLimitSchema = s.integer("Maximum number of data points to return.", {
  minimum: 1,
  maximum: 10000,
});
const sortSchema = s.stringEnum("Sort data in ascending or descending order.", ["asc", "desc"]);
const accountActivityListSchema = s.array(
  "A non-empty list of Alpaca activity type codes.",
  nonBlankString("An Alpaca activity type code such as FILL, DIV, or FEE."),
  { minItems: 1 },
);
const cashflowTypeListSchema = s.array(
  "A non-empty list of Alpaca cashflow type codes.",
  nonBlankString("An Alpaca cashflow type code such as DIV or FEE."),
  { minItems: 1 },
);
const idListSchema = s.array("A non-empty list of IDs.", nonBlankString("An ID."), {
  minItems: 1,
});
const corporateActionTypeListSchema = s.array(
  "A non-empty list of corporate action types.",
  s.stringEnum("A corporate action type.", [
    "reverse_split",
    "forward_split",
    "unit_split",
    "cash_dividend",
    "stock_dividend",
    "spin_off",
    "cash_merger",
    "stock_merger",
    "stock_and_cash_merger",
    "redemption",
    "name_change",
    "worthless_removal",
    "rights_distribution",
    "partial_call",
    "reorganization",
  ]),
  { minItems: 1 },
);
const corporateActionRegionSchema = s.stringEnum("Corporate action region filter.", ["us", "non_us", "all"]);
const stockLatestFeedSchema = s.stringEnum("Stock market-data feed.", [
  "delayed_sip",
  "iex",
  "otc",
  "sip",
  "boats",
  "overnight",
]);
const cryptoLatestLocationSchema = s.stringEnum("Crypto latest market-data location.", [
  "us",
  "us-1",
  "us-2",
  "eu-1",
  "bs-1",
]);
const optionContractStatusSchema = s.stringEnum("Option contract status filter.", ["active", "inactive"]);
const optionContractTypeSchema = s.stringEnum("Option contract type filter.", ["call", "put"]);
const optionContractStyleSchema = s.stringEnum("Option contract exercise style filter.", ["american", "european"]);

const getOrderInputSchema = s.oneOf(
  [
    s.object(
      "Get one Alpaca order by order ID.",
      {
        orderId: nonBlankString("Alpaca order ID."),
      },
      { required: ["orderId"] },
    ),
    s.object(
      "Get one Alpaca order by client order ID.",
      {
        clientOrderId: nonBlankString("Client order ID assigned when the order was submitted."),
      },
      { required: ["clientOrderId"] },
    ),
  ],
  { description: "Exactly one of orderId or clientOrderId is required." },
);

const getWatchlistInputSchema = s.oneOf(
  [
    s.object(
      "Get one Alpaca watchlist by watchlist ID.",
      {
        watchlistId: nonBlankString("Alpaca watchlist ID."),
      },
      { required: ["watchlistId"] },
    ),
    s.object(
      "Get one Alpaca watchlist by user-defined name.",
      {
        name: nonBlankString("User-defined Alpaca watchlist name."),
      },
      { required: ["name"] },
    ),
  ],
  { description: "Exactly one of watchlistId or name is required." },
);

const corporateActionFilterSchema = s.oneOf(
  [
    s.object(
      "List corporate actions by Alpaca corporate action IDs.",
      {
        ids: idListSchema,
        limit: s.integer("Maximum number of corporate actions to return.", {
          minimum: 1,
          maximum: 1000,
        }),
        pageToken: pageTokenSchema,
        sort: sortSchema,
      },
      { optional: ["limit", "pageToken", "sort"] },
    ),
    s.object(
      "List corporate actions by symbols, CUSIPs, types, region, or date range.",
      {
        symbols: symbolListSchema,
        cusips: s.array("A non-empty list of CUSIPs.", nonBlankString("A CUSIP."), {
          minItems: 1,
        }),
        types: corporateActionTypeListSchema,
        region: corporateActionRegionSchema,
        start: s.date("Inclusive interval start date."),
        end: s.date("Inclusive interval end date."),
        limit: s.integer("Maximum number of corporate actions to return.", {
          minimum: 1,
          maximum: 1000,
        }),
        pageToken: pageTokenSchema,
        sort: sortSchema,
      },
      {
        optional: ["symbols", "cusips", "types", "region", "start", "end", "limit", "pageToken", "sort"],
      },
    ),
  ],
  { description: "ids cannot be used with symbols, cusips, types, region, start, or end." },
);

const getAccountAction = defineProviderAction(service, {
  name: "get_account",
  description: "Get Alpaca Trading API account details for the connected paper or live account.",
  inputSchema: s.object("Input for getting Alpaca account details.", {}),
  outputSchema: s.object("Alpaca account details response.", {
    account: rawObjectSchema,
  }),
});

const listAssetsAction = defineProviderAction(service, {
  name: "list_assets",
  description: "List Alpaca assets with optional status, asset class, and attribute filters.",
  inputSchema: s.object(
    "Input for listing Alpaca assets.",
    {
      status: s.stringEnum("Asset status filter. Omit this field to include all statuses.", ["active", "inactive"]),
      assetClass: s.stringEnum("Asset class filter.", ["us_equity", "us_option", "crypto", "ipo"]),
      attributes: s.array(
        "Asset attributes to include. Assets with any listed attribute are returned.",
        s.stringEnum("An Alpaca asset attribute.", [
          "ptp_no_exception",
          "ptp_with_exception",
          "ipo",
          "has_options",
          "options_late_close",
          "fractional_eh_enabled",
          "overnight_tradable",
          "overnight_halted",
        ]),
        { minItems: 1 },
      ),
    },
    { optional: ["status", "assetClass", "attributes"] },
  ),
  outputSchema: s.object("Alpaca assets response.", {
    assets: s.array("Assets returned by Alpaca.", rawObjectSchema),
  }),
});

const getAssetAction = defineProviderAction(service, {
  name: "get_asset",
  description: "Get one Alpaca asset by symbol or asset ID.",
  inputSchema: s.object("Input for getting one Alpaca asset.", {
    symbolOrAssetId: nonBlankString("Asset symbol or asset ID."),
  }),
  outputSchema: s.object("Alpaca asset response.", {
    asset: rawObjectSchema,
  }),
});

const listPositionsAction = defineProviderAction(service, {
  name: "list_positions",
  description: "List open positions for the connected Alpaca trading account.",
  inputSchema: s.object("Input for listing Alpaca open positions.", {}),
  outputSchema: s.object("Alpaca open positions response.", {
    positions: s.array("Open positions returned by Alpaca.", rawObjectSchema),
  }),
});

const getPositionAction = defineProviderAction(service, {
  name: "get_position",
  description: "Get one open Alpaca position by symbol or asset ID.",
  inputSchema: s.object("Input for getting one Alpaca open position.", {
    symbolOrAssetId: nonBlankString("Position symbol or asset ID."),
  }),
  outputSchema: s.object("Alpaca open position response.", {
    position: rawObjectSchema,
  }),
});

const listOrdersAction = defineProviderAction(service, {
  name: "list_orders",
  description: "List Alpaca orders for the connected account with optional filters.",
  inputSchema: s.object(
    "Input for listing Alpaca orders.",
    {
      status: s.stringEnum("Order status filter.", ["open", "closed", "all"]),
      limit: limitSchema,
      after: dateOrDateTimeSchema,
      until: dateOrDateTimeSchema,
      direction: sortSchema,
      nested: s.boolean("Whether nested multi-leg orders should be included."),
      symbols: symbolListSchema,
    },
    { optional: ["status", "limit", "after", "until", "direction", "nested", "symbols"] },
  ),
  outputSchema: s.object("Alpaca orders response.", {
    orders: s.array("Orders returned by Alpaca.", rawObjectSchema),
  }),
});

const getOrderAction = defineProviderAction(service, {
  name: "get_order",
  description: "Get one Alpaca order by order ID or client order ID.",
  inputSchema: getOrderInputSchema,
  outputSchema: s.object("Alpaca order response.", {
    order: rawObjectSchema,
  }),
});

const getMarketClockAction = defineProviderAction(service, {
  name: "get_market_clock",
  description: "Get Alpaca Trading API US market clock information.",
  inputSchema: s.object("Input for getting Alpaca US market clock information.", {}),
  outputSchema: s.object("Alpaca US market clock response.", {
    clock: rawObjectSchema,
  }),
});

const listWatchlistsAction = defineProviderAction(service, {
  name: "list_watchlists",
  description: "List Alpaca watchlists registered under the connected trading account.",
  inputSchema: s.object("Input for listing Alpaca watchlists.", {}),
  outputSchema: s.object("Alpaca watchlists response.", {
    watchlists: s.array("Watchlists returned by Alpaca.", rawObjectSchema),
  }),
});

const getWatchlistAction = defineProviderAction(service, {
  name: "get_watchlist",
  description: "Get one Alpaca watchlist by watchlist ID or user-defined name.",
  inputSchema: getWatchlistInputSchema,
  outputSchema: s.object("Alpaca watchlist response.", {
    watchlist: rawObjectSchema,
  }),
});

const listAccountActivitiesAction = defineProviderAction(service, {
  name: "list_account_activities",
  description: "List Alpaca account activities with optional type, category, date, and pagination filters.",
  inputSchema: s.oneOf(
    [
      s.object(
        "List Alpaca account activities by activity type.",
        {
          activityTypes: accountActivityListSchema,
          date: dateOrDateTimeSchema,
          after: dateOrDateTimeSchema,
          until: dateOrDateTimeSchema,
          direction: sortSchema,
          pageSize: s.integer("Maximum number of account activities to return.", {
            minimum: 1,
            maximum: 100,
          }),
          pageToken: pageTokenSchema,
        },
        { optional: ["activityTypes", "date", "after", "until", "direction", "pageSize", "pageToken"] },
      ),
      s.object(
        "List Alpaca account activities by category.",
        {
          category: s.stringEnum("Activity category filter.", ["trade_activity", "non_trade_activity"]),
          date: dateOrDateTimeSchema,
          after: dateOrDateTimeSchema,
          until: dateOrDateTimeSchema,
          direction: sortSchema,
          pageSize: s.integer("Maximum number of account activities to return.", {
            minimum: 1,
            maximum: 100,
          }),
          pageToken: pageTokenSchema,
        },
        { optional: ["category", "date", "after", "until", "direction", "pageSize", "pageToken"] },
      ),
    ],
    { description: "activityTypes and category cannot be used together." },
  ),
  outputSchema: s.object("Alpaca account activities response.", {
    activities: s.array("Account activities returned by Alpaca.", rawObjectSchema),
  }),
});

const getAccountConfigAction = defineProviderAction(service, {
  name: "get_account_config",
  description: "Get Alpaca account configuration values.",
  inputSchema: s.object("Input for getting Alpaca account configuration.", {}),
  outputSchema: s.object("Alpaca account configuration response.", {
    configuration: rawObjectSchema,
  }),
});

const getAccountPortfolioHistoryAction = defineProviderAction(service, {
  name: "get_account_portfolio_history",
  description: "Get Alpaca account equity and profit/loss time series.",
  inputSchema: s.object(
    "Input for getting Alpaca account portfolio history.",
    {
      period: nonBlankString("Duration such as 1D, 1W, 1M, or 1A."),
      timeframe: nonBlankString("Time window size such as 1Min, 5Min, 15Min, 1H, or 1D."),
      intradayReporting: s.stringEnum("Intraday reporting mode.", ["market_hours", "extended_hours", "continuous"]),
      start: dateOrDateTimeSchema,
      end: dateOrDateTimeSchema,
      pnlReset: s.stringEnum("Profit and loss reset mode.", ["no_reset", "per_day"]),
      cashflowTypes: cashflowTypeListSchema,
    },
    {
      optional: ["period", "timeframe", "intradayReporting", "start", "end", "pnlReset", "cashflowTypes"],
    },
  ),
  outputSchema: s.object("Alpaca account portfolio history response.", {
    portfolioHistory: rawObjectSchema,
  }),
});

const getMarketCalendarAction = defineProviderAction(service, {
  name: "get_market_calendar",
  description: "Get Alpaca Trading API US market calendar days.",
  inputSchema: s.object(
    "Input for getting Alpaca US market calendar days.",
    {
      start: dateOrDateTimeSchema,
      end: dateOrDateTimeSchema,
      dateType: s.stringEnum("Meaning of the start and end dates.", ["TRADING", "SETTLEMENT"]),
    },
    { optional: ["start", "end", "dateType"] },
  ),
  outputSchema: s.object("Alpaca US market calendar response.", {
    calendar: s.array("Market calendar days returned by Alpaca.", rawObjectSchema),
  }),
});

const listCorporateActionsAction = defineProviderAction(service, {
  name: "list_corporate_actions",
  description: "List Alpaca corporate actions for symbols, CUSIPs, types, or IDs.",
  requiredScopes: [alpacaDataScope],
  inputSchema: corporateActionFilterSchema,
  outputSchema: s.object(
    "Alpaca corporate actions response.",
    {
      corporateActions: rawObjectSchema,
      nextPageToken: pageTokenSchema,
    },
    { optional: ["nextPageToken"] },
  ),
});

const getStockBarsAction = defineProviderAction(service, {
  name: "get_stock_bars",
  description: "Get historical OHLC stock bars from Alpaca Market Data API.",
  requiredScopes: [alpacaDataScope],
  inputSchema: s.object(
    "Input for getting Alpaca historical stock bars.",
    {
      symbols: symbolListSchema,
      timeframe: nonBlankString("Bar aggregation timeframe such as 1Min, 1Hour, or 1Day."),
      start: dateOrDateTimeSchema,
      end: dateOrDateTimeSchema,
      limit: marketDataLimitSchema,
      adjustment: nonBlankString("Stock adjustment mode such as raw, split, dividend, or all."),
      feed: s.stringEnum("Stock data feed.", ["iex", "sip", "boats", "otc"]),
      sort: sortSchema,
      pageToken: pageTokenSchema,
      asof: s.date("As-of date used for stock symbol mapping."),
      currency: nonBlankString("Currency for returned prices."),
    },
    {
      optional: ["start", "end", "limit", "adjustment", "feed", "sort", "pageToken", "asof", "currency"],
    },
  ),
  outputSchema: s.object(
    "Alpaca historical stock bars response.",
    {
      bars: rawRecordSchema,
      nextPageToken: pageTokenSchema,
    },
    { optional: ["nextPageToken"] },
  ),
});

const getCryptoBarsAction = defineProviderAction(service, {
  name: "get_crypto_bars",
  description: "Get historical OHLC crypto bars from Alpaca Market Data API.",
  requiredScopes: [alpacaDataScope],
  inputSchema: s.object(
    "Input for getting Alpaca historical crypto bars.",
    {
      symbols: symbolListSchema,
      timeframe: nonBlankString("Bar aggregation timeframe such as 1Min, 1Hour, or 1Day."),
      location: s.stringEnum("Crypto market-data location.", ["us", "us-1", "eu-1"]),
      start: dateOrDateTimeSchema,
      end: dateOrDateTimeSchema,
      limit: marketDataLimitSchema,
      sort: sortSchema,
      pageToken: pageTokenSchema,
    },
    { optional: ["location", "start", "end", "limit", "sort", "pageToken"] },
  ),
  outputSchema: s.object(
    "Alpaca historical crypto bars response.",
    {
      bars: rawRecordSchema,
      nextPageToken: pageTokenSchema,
    },
    { optional: ["nextPageToken"] },
  ),
});

const listOptionContractsAction = defineProviderAction(service, {
  name: "list_option_contracts",
  description: "List Alpaca option contracts with optional underlying and contract filters.",
  inputSchema: s.object(
    "Input for listing Alpaca option contracts.",
    {
      underlyingSymbols: s.array("A non-empty list of underlying symbols.", nonBlankString("An underlying symbol."), {
        minItems: 1,
      }),
      showDeliverables: s.boolean("Whether deliverables should be included in the response."),
      status: optionContractStatusSchema,
      expirationDate: s.date("Exact expiration date filter."),
      expirationDateGte: s.date("Minimum expiration date filter."),
      expirationDateLte: s.date("Maximum expiration date filter."),
      rootSymbol: nonBlankString("Root symbol filter."),
      type: optionContractTypeSchema,
      style: optionContractStyleSchema,
      strikePriceGte: s.number("Minimum strike price filter."),
      strikePriceLte: s.number("Maximum strike price filter."),
      pageToken: pageTokenSchema,
      limit: marketDataLimitSchema,
      ppind: s.boolean("Whether to filter by penny price increment eligibility."),
    },
    {
      optional: [
        "underlyingSymbols",
        "showDeliverables",
        "status",
        "expirationDate",
        "expirationDateGte",
        "expirationDateLte",
        "rootSymbol",
        "type",
        "style",
        "strikePriceGte",
        "strikePriceLte",
        "pageToken",
        "limit",
        "ppind",
      ],
    },
  ),
  outputSchema: s.object(
    "Alpaca option contracts response.",
    {
      optionContracts: s.array("Option contracts returned by Alpaca.", rawObjectSchema),
      nextPageToken: pageTokenSchema,
    },
    { optional: ["nextPageToken"] },
  ),
});

const getOptionContractAction = defineProviderAction(service, {
  name: "get_option_contract",
  description: "Get one Alpaca option contract by contract symbol or ID.",
  inputSchema: s.object("Input for getting one Alpaca option contract.", {
    symbolOrId: nonBlankString("Option contract symbol or ID."),
  }),
  outputSchema: s.object("Alpaca option contract response.", {
    optionContract: rawObjectSchema,
  }),
});

const getStockSnapshotsAction = defineProviderAction(service, {
  name: "get_stock_snapshots",
  description: "Get latest stock snapshots from Alpaca Market Data API.",
  requiredScopes: [alpacaDataScope],
  inputSchema: s.object(
    "Input for getting Alpaca stock snapshots.",
    {
      symbols: symbolListSchema,
      feed: stockLatestFeedSchema,
      currency: nonBlankString("Currency for returned prices."),
    },
    { optional: ["feed", "currency"] },
  ),
  outputSchema: s.object("Alpaca stock snapshots response.", {
    snapshots: rawRecordSchema,
  }),
});

const getCryptoSnapshotsAction = defineProviderAction(service, {
  name: "get_crypto_snapshots",
  description: "Get latest crypto snapshots from Alpaca Market Data API.",
  requiredScopes: [alpacaDataScope],
  inputSchema: s.object(
    "Input for getting Alpaca crypto snapshots.",
    {
      symbols: symbolListSchema,
      location: cryptoLatestLocationSchema,
    },
    { optional: ["location"] },
  ),
  outputSchema: s.object("Alpaca crypto snapshots response.", {
    snapshots: rawRecordSchema,
  }),
});

const listNewsAction = defineProviderAction(service, {
  name: "list_news",
  description: "List latest Alpaca news articles across stocks and crypto.",
  requiredScopes: [alpacaDataScope],
  inputSchema: s.object(
    "Input for listing Alpaca news articles.",
    {
      symbols: symbolListSchema,
      limit: s.integer("Maximum number of news articles to return.", {
        minimum: 1,
        maximum: 50,
      }),
      includeContent: s.boolean("Whether article content should be included when available."),
      excludeContentless: s.boolean("Whether articles without content should be excluded."),
      start: dateOrDateTimeSchema,
      end: dateOrDateTimeSchema,
      sort: sortSchema,
      pageToken: pageTokenSchema,
    },
    {
      optional: ["symbols", "limit", "includeContent", "excludeContentless", "start", "end", "sort", "pageToken"],
    },
  ),
  outputSchema: s.object(
    "Alpaca news articles response.",
    {
      news: s.array("News articles returned by Alpaca.", rawObjectSchema),
      nextPageToken: pageTokenSchema,
    },
    { optional: ["nextPageToken"] },
  ),
});

export const alpacaActions: ActionDefinition[] = [
  getAccountAction,
  listAssetsAction,
  getAssetAction,
  listPositionsAction,
  getPositionAction,
  listOrdersAction,
  getOrderAction,
  getMarketClockAction,
  listWatchlistsAction,
  getWatchlistAction,
  listAccountActivitiesAction,
  getAccountConfigAction,
  getAccountPortfolioHistoryAction,
  getMarketCalendarAction,
  listCorporateActionsAction,
  getStockBarsAction,
  getCryptoBarsAction,
  listOptionContractsAction,
  getOptionContractAction,
  getStockSnapshotsAction,
  getCryptoSnapshotsAction,
  listNewsAction,
];
