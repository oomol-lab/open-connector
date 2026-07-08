import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { defineLongbridgeReadonlyActions } from "./readonly-action-specs.ts";

const service = "longbridge";

export const longbridgeOAuthScopes: string[] = ["4", "6", "10", "11"];

const nonEmptyString = (description: string): JsonSchema => s.string({ minLength: 1, pattern: "\\S", description });
const rawObjectSchema = s.looseObject("The raw object returned by Longbridge.");
const marketSchema = s.stringEnum("The Longbridge market code.", ["HK", "US", "CN", "SG"]);
const tradeMarketSchema = s.stringEnum("The Longbridge trade market code.", [
  "UnknownMarket",
  "DE",
  "JP",
  "SH",
  "SZ",
  "UK",
  "AU",
  "HK",
  "SG",
  "US",
]);
const orderSideSchema = s.stringEnum("The Longbridge order side.", ["UnknownSide", "Buy", "Sell"]);
const orderStatusSchema = s.stringEnum("A Longbridge order status.", [
  "NotReported",
  "VarietiesNotReported",
  "FilledStatus",
  "WaitToNew",
  "ReplacedStatus",
  "PartialFilledStatus",
  "CanceledStatus",
  "ExpiredStatus",
  "UnknownOrderStatus",
  "RejectedStatus",
  "PartialWithdrawal",
  "ReplacedNotReported",
  "ProtectedNotReported",
  "NewStatus",
  "WaitToReplace",
  "PendingReplaceStatus",
  "PendingCancelStatus",
  "WaitToCancel",
]);
const orderTypeSchema = s.stringEnum("The Longbridge order type used for buy quantity estimates.", [
  "LO",
  "ELO",
  "MO",
  "LIT",
  "MIT",
  "TSLPAMT",
  "TSMAMT",
  "TSMPCT",
  "UnknownOrderType",
  "AO",
  "ALO",
  "ODD",
  "TSLPPCT",
  "SLO",
]);
const unixTimeSchema = s.integer("A Unix timestamp in seconds.");
const pageSchema = s.positiveInteger("The 1-based page number.");
const pageSizeSchema = s.positiveInteger("The number of records per page.");
const symbolsSchema = s.array("Longbridge symbols to filter by.", nonEmptyString("One Longbridge symbol."), {
  minItems: 1,
  maxItems: 100,
});

function listOutputSchema(description: string, key: string, itemDescription: string): JsonSchema {
  return s.object(description, {
    [key]: s.array(itemDescription, rawObjectSchema),
    raw: rawObjectSchema,
  });
}

function objectOutputSchema(description: string, key: string, objectDescription: string): JsonSchema {
  return s.object(description, {
    [key]: s.looseObject(objectDescription),
    raw: rawObjectSchema,
  });
}

const securitySchema = s.looseObject("A Longbridge tradable security record.", {
  symbol: s.string("The Longbridge security symbol."),
  name_cn: s.string("The Simplified Chinese security name returned by Longbridge."),
  name_hk: s.string("The Traditional Chinese security name returned by Longbridge."),
  name_en: s.string("The English security name returned by Longbridge."),
});

const cashInfoSchema = s.looseObject("A Longbridge per-currency cash detail record.", {
  currency: s.string("The currency for this cash detail record."),
  withdraw_cash: s.string("The withdrawable cash amount returned by Longbridge."),
  available_cash: s.string("The available cash amount returned by Longbridge."),
  frozen_cash: s.string("The frozen cash amount returned by Longbridge."),
  settling_cash: s.string("The settling cash amount returned by Longbridge."),
  redemption_cash: s.string("The redemption cash amount returned by Longbridge."),
});

const accountCashSchema = s.looseObject("A Longbridge account cash balance record.", {
  currency: s.string("The account currency for this balance record."),
  total_cash: s.string("The total cash amount returned by Longbridge."),
  net_assets: s.string("The net asset amount returned by Longbridge."),
  buy_power: s.string("The buying power returned by Longbridge."),
  cash_infos: s.array("Per-currency Longbridge cash detail records.", cashInfoSchema),
});

const stockPositionSchema = s.looseObject("A Longbridge stock position record.", {
  symbol: s.string("The Longbridge security symbol."),
  symbol_name: s.string("The security name returned by Longbridge."),
  currency: s.string("The position currency."),
  quantity: s.string("The position quantity returned by Longbridge."),
  available_quantity: s.string("The available quantity returned by Longbridge."),
  cost_price: s.string("The cost price returned by Longbridge."),
  market: s.string("The market code returned by Longbridge."),
  init_quantity: s.string("The initial quantity returned by Longbridge."),
});

const stockPositionGroupSchema = s.looseObject("A Longbridge stock position group by account channel.", {
  account_channel: s.string("The Longbridge account channel for this group."),
  stock_info: s.array("The stock positions in this account channel.", stockPositionSchema),
});

export const longbridgeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_securities",
    description: "List Longbridge tradable securities for a market and category.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object("Input parameters for listing Longbridge tradable securities.", {
      market: s.stringEnum("The Longbridge market code.", ["US", "HK"]),
      category: nonEmptyString(
        "The Longbridge security category filter, such as Overnight for US overnight-tradable securities.",
      ),
    }),
    outputSchema: s.object("The normalized Longbridge securities response.", {
      securities: s.array("The tradable securities returned by Longbridge.", securitySchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_account_cash",
    description: "List Longbridge account cash balances visible to the connected OAuth user.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object(
      "Input parameters for querying Longbridge account cash balances.",
      {
        currency: nonEmptyString("The currency code to send to Longbridge, such as USD or HKD."),
      },
      { optional: ["currency"] },
    ),
    outputSchema: s.object("The normalized Longbridge account cash response.", {
      balances: s.array("The account cash balance records returned by Longbridge.", accountCashSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_stock_positions",
    description: "List Longbridge stock positions visible to the connected OAuth user.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object(
      "Input parameters for querying Longbridge stock positions.",
      {
        symbols: s.array(
          "The Longbridge security symbols to filter by.",
          nonEmptyString("One Longbridge security symbol, such as AAPL.US or 700.HK."),
          { minItems: 1, maxItems: 100 },
        ),
      },
      { optional: ["symbols"] },
    ),
    outputSchema: s.object("The normalized Longbridge stock positions response.", {
      positionGroups: s.array("The stock position groups returned by Longbridge.", stockPositionGroupSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_market_temperature",
    description: "Get the current Longbridge market sentiment temperature for a market.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object("Input parameters for querying the current Longbridge market temperature.", {
      market: marketSchema,
    }),
    outputSchema: objectOutputSchema(
      "The normalized Longbridge current market temperature response.",
      "temperature",
      "The current market temperature snapshot returned by Longbridge.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_market_temperature",
    description: "List historical Longbridge market sentiment temperature values for a market and date range.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object("Input parameters for querying Longbridge historical market temperature.", {
      market: marketSchema,
      startDate: nonEmptyString("The start date in YYYYMMDD format."),
      endDate: nonEmptyString("The end date in YYYYMMDD format."),
    }),
    outputSchema: listOutputSchema(
      "The normalized Longbridge historical market temperature response.",
      "temperatures",
      "The historical market temperature records returned by Longbridge.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_filings",
    description: "List Longbridge regulatory filings and disclosure documents for a symbol.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object("Input parameters for querying Longbridge filings.", {
      symbol: nonEmptyString("The Longbridge security symbol, such as AAPL.US or 700.HK."),
    }),
    outputSchema: listOutputSchema(
      "The normalized Longbridge filings response.",
      "list_filings",
      "The filing records returned by Longbridge.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_news",
    description: "List Longbridge news articles for a symbol.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object("Input parameters for querying Longbridge news.", {
      symbol: nonEmptyString("The Longbridge security symbol, such as AAPL.US or 700.HK."),
    }),
    outputSchema: listOutputSchema(
      "The normalized Longbridge news response.",
      "list_news",
      "The news records returned by Longbridge.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_watchlist_groups",
    description: "List Longbridge watchlist groups for the connected OAuth user.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object("Input parameters for listing Longbridge watchlist groups.", {}),
    outputSchema: listOutputSchema(
      "The normalized Longbridge watchlist groups response.",
      "groups",
      "The watchlist groups returned by Longbridge.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_cash_flow",
    description: "List Longbridge account cash flow records visible to the connected OAuth user.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object(
      "Input parameters for querying Longbridge account cash flow records.",
      {
        startTime: unixTimeSchema,
        endTime: unixTimeSchema,
        businessType: s.integer("The Longbridge business type filter."),
        symbols: symbolsSchema,
        page: pageSchema,
        size: pageSizeSchema,
      },
      { optional: ["startTime", "endTime", "businessType", "symbols", "page", "size"] },
    ),
    outputSchema: listOutputSchema(
      "The normalized Longbridge cash flow response.",
      "cashFlows",
      "The cash flow records returned by Longbridge.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_fund_positions",
    description: "List Longbridge fund positions visible to the connected OAuth user.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object(
      "Input parameters for querying Longbridge fund positions.",
      {
        symbols: symbolsSchema,
      },
      { optional: ["symbols"] },
    ),
    outputSchema: listOutputSchema(
      "The normalized Longbridge fund positions response.",
      "positionGroups",
      "The fund position groups returned by Longbridge.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_history_executions",
    description: "List historical Longbridge execution records visible to the connected OAuth user.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object(
      "Input parameters for querying historical Longbridge executions.",
      {
        startAt: unixTimeSchema,
        endAt: unixTimeSchema,
        orderId: nonEmptyString("The Longbridge order ID to filter by."),
        symbol: nonEmptyString("The Longbridge security symbol to filter by."),
        page: pageSchema,
      },
      { optional: ["startAt", "endAt", "orderId", "symbol", "page"] },
    ),
    outputSchema: listOutputSchema(
      "The normalized Longbridge historical executions response.",
      "executions",
      "The historical execution records returned by Longbridge.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_order_detail",
    description: "Get a Longbridge order detail record by order ID.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object("Input parameters for querying a Longbridge order detail.", {
      orderId: nonEmptyString("The Longbridge order ID to query."),
    }),
    outputSchema: objectOutputSchema(
      "The normalized Longbridge order detail response.",
      "order",
      "The order detail returned by Longbridge.",
    ),
  }),
  defineProviderAction(service, {
    name: "estimate_max_buy_quantity",
    description: "Estimate the maximum Longbridge buy quantity for a security without submitting an order.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object(
      "Input parameters for estimating Longbridge maximum buy quantity.",
      {
        symbol: nonEmptyString("The Longbridge security symbol to estimate."),
        orderType: orderTypeSchema,
        side: orderSideSchema,
        price: nonEmptyString("The limit or trigger price, when required by the order type."),
        currency: nonEmptyString("The settlement currency override, such as USD or HKD."),
        market: tradeMarketSchema,
        fractionalShares: s.boolean("Whether to allow fractional share quantities in the estimate."),
        orderId: nonEmptyString("The original order ID when estimating for an order modification scenario."),
      },
      { optional: ["price", "currency", "market", "fractionalShares", "orderId"] },
    ),
    outputSchema: objectOutputSchema(
      "The normalized Longbridge maximum buy quantity estimate response.",
      "estimate",
      "The maximum buy quantity estimate returned by Longbridge.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_history_orders",
    description: "List historical Longbridge orders visible to the connected OAuth user.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object(
      "Input parameters for querying historical Longbridge orders.",
      {
        startAt: unixTimeSchema,
        endAt: unixTimeSchema,
        symbol: nonEmptyString("The Longbridge security symbol to filter by."),
        market: tradeMarketSchema,
        side: orderSideSchema,
        statuses: s.array("Longbridge order statuses to filter by.", orderStatusSchema, { minItems: 1 }),
        page: pageSchema,
        size: pageSizeSchema,
      },
      { optional: ["startAt", "endAt", "symbol", "market", "side", "statuses", "page", "size"] },
    ),
    outputSchema: listOutputSchema(
      "The normalized Longbridge historical orders response.",
      "orders",
      "The historical order records returned by Longbridge.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_today_executions",
    description: "List today's Longbridge execution records visible to the connected OAuth user.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object(
      "Input parameters for querying today's Longbridge executions.",
      {
        orderId: nonEmptyString("The Longbridge order ID to filter by."),
        symbol: nonEmptyString("The Longbridge security symbol to filter by."),
      },
      { optional: ["orderId", "symbol"] },
    ),
    outputSchema: listOutputSchema(
      "The normalized Longbridge today's executions response.",
      "executions",
      "Today's execution records returned by Longbridge.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_today_orders",
    description: "List today's Longbridge orders visible to the connected OAuth user.",
    requiredScopes: longbridgeOAuthScopes,
    providerPermissions: ["openapi"],
    inputSchema: s.object(
      "Input parameters for querying today's Longbridge orders.",
      {
        symbol: nonEmptyString("The Longbridge security symbol to filter by."),
        market: tradeMarketSchema,
        side: orderSideSchema,
        statuses: s.array("Longbridge order statuses to filter by.", orderStatusSchema, { minItems: 1 }),
        orderId: nonEmptyString("The Longbridge order ID to filter by."),
        page: pageSchema,
        size: pageSizeSchema,
      },
      { optional: ["symbol", "market", "side", "statuses", "orderId", "page", "size"] },
    ),
    outputSchema: listOutputSchema(
      "The normalized Longbridge today's orders response.",
      "orders",
      "Today's order records returned by Longbridge.",
    ),
  }),
  ...defineLongbridgeReadonlyActions(longbridgeOAuthScopes),
];
