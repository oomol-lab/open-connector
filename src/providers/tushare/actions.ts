import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tushare";

const jsonValueSchema = s.unknown("A JSON-compatible value returned by Tushare.");
const responseMessageSchema = s.nullableString("Tushare response message, or null for successful responses.");
const requestIdSchema = s.string("Tushare request identifier returned by the API.");
const yyyymmddSchema = (description: string): JsonSchema =>
  s.string({ description, pattern: "^[0-9]{8}$", minLength: 8, maxLength: 8 });
const compactStringSchema = (description: string): JsonSchema => s.nonEmptyString(description);
const tsCodeSchema = compactStringSchema("Tushare security code, such as 000001.SZ.");
const nullableStringSchema = (description: string): JsonSchema => s.nullableString(description);
const nullableNumberSchema = (description: string): JsonSchema => s.nullableNumber(description);
const nullableIntegerSchema = (description: string): JsonSchema => s.nullableInteger(description);

const stockBasicRowSchema = s.object("One stock_basic row.", {
  tsCode: nullableStringSchema("Tushare security code."),
  symbol: nullableStringSchema("Exchange-local security symbol."),
  name: nullableStringSchema("Chinese security name."),
  area: nullableStringSchema("Company region."),
  industry: nullableStringSchema("Company industry."),
  market: nullableStringSchema("Market board name."),
  exchange: nullableStringSchema("Exchange code."),
  listStatus: nullableStringSchema("Listing status."),
  listDate: nullableStringSchema("Listing date in YYYYMMDD format."),
  delistDate: nullableStringSchema("Delisting date in YYYYMMDD format when present."),
  isHs: nullableStringSchema("Stock Connect flag when present."),
});
const tradeCalendarRowSchema = s.object("One trade_cal row.", {
  exchange: nullableStringSchema("Exchange code."),
  calDate: nullableStringSchema("Calendar date in YYYYMMDD format."),
  isOpen: nullableIntegerSchema("Whether the date is an open trading day, where 1 is open."),
  pretradeDate: nullableStringSchema("Previous trading date in YYYYMMDD format."),
});
const dailyQuoteRowSchema = s.object("One daily quote row.", {
  tsCode: nullableStringSchema("Tushare security code."),
  tradeDate: nullableStringSchema("Trade date in YYYYMMDD format."),
  open: nullableNumberSchema("Open price."),
  high: nullableNumberSchema("High price."),
  low: nullableNumberSchema("Low price."),
  close: nullableNumberSchema("Close price."),
  preClose: nullableNumberSchema("Previous close price."),
  change: nullableNumberSchema("Price change."),
  pctChg: nullableNumberSchema("Percentage change."),
  vol: nullableNumberSchema("Trading volume in lots."),
  amount: nullableNumberSchema("Trading amount."),
});
const dailyBasicRowSchema = s.object("One daily_basic row.", {
  tsCode: nullableStringSchema("Tushare security code."),
  tradeDate: nullableStringSchema("Trade date in YYYYMMDD format."),
  close: nullableNumberSchema("Close price."),
  turnoverRate: nullableNumberSchema("Turnover rate."),
  turnoverRateF: nullableNumberSchema("Free-float turnover rate."),
  volumeRatio: nullableNumberSchema("Volume ratio."),
  pe: nullableNumberSchema("Price-to-earnings ratio."),
  peTtm: nullableNumberSchema("Trailing price-to-earnings ratio."),
  pb: nullableNumberSchema("Price-to-book ratio."),
  ps: nullableNumberSchema("Price-to-sales ratio."),
  psTtm: nullableNumberSchema("Trailing price-to-sales ratio."),
  dvRatio: nullableNumberSchema("Dividend yield ratio."),
  dvTtm: nullableNumberSchema("Trailing dividend yield ratio."),
  totalShare: nullableNumberSchema("Total shares."),
  floatShare: nullableNumberSchema("Floating shares."),
  freeShare: nullableNumberSchema("Free-float shares."),
  totalMv: nullableNumberSchema("Total market value."),
  circMv: nullableNumberSchema("Circulating market value."),
});
const adjustmentFactorRowSchema = s.object("One adj_factor row.", {
  tsCode: nullableStringSchema("Tushare security code."),
  tradeDate: nullableStringSchema("Trade date in YYYYMMDD format."),
  adjFactor: nullableNumberSchema("Adjustment factor."),
});

const shareholderTradeRowSchema = s.object("One stk_holdertrade row.", {
  tsCode: nullableStringSchema("Tushare security code."),
  announcementDate: nullableStringSchema("Announcement date in YYYYMMDD format."),
  holderName: nullableStringSchema("Shareholder name."),
  holderType: nullableStringSchema("Shareholder type: G executive, P individual, or C company."),
  tradeType: nullableStringSchema("Share trade type: IN increase or DE decrease."),
  changeVolume: nullableNumberSchema("Number of shares changed."),
  changeRatio: nullableNumberSchema("Change as a percentage of circulating shares."),
  sharesAfterChange: nullableNumberSchema("Shares held after the change."),
  ratioAfterChange: nullableNumberSchema("Holding after the change as a percentage of circulating shares."),
  averagePrice: nullableNumberSchema("Average transaction price."),
  totalShares: nullableNumberSchema("Total shares held."),
  beginDate: nullableStringSchema("Shareholding change start date in YYYYMMDD format."),
  closeDate: nullableStringSchema("Shareholding change end date in YYYYMMDD format."),
});

const shareholderTradesInputSchema = s.object(
  "Filters for the Tushare stk_holdertrade API.",
  {
    tsCode: tsCodeSchema,
    announcementDate: yyyymmddSchema("Announcement date in YYYYMMDD format."),
    startDate: yyyymmddSchema("Announcement start date in YYYYMMDD format."),
    endDate: yyyymmddSchema("Announcement end date in YYYYMMDD format."),
    tradeType: s.stringEnum("Share trade type: IN for an increase or DE for a decrease.", ["IN", "DE"]),
    holderType: s.stringEnum("Shareholder type: C for a company, P for an individual, or G for an executive.", [
      "C",
      "P",
      "G",
    ]),
  },
  { optional: ["tsCode", "announcementDate", "startDate", "endDate", "tradeType", "holderType"] },
);
const datedMarketDataInputSchema = (actionName: string): JsonSchema =>
  s.actionInput(
    {
      tsCode: tsCodeSchema,
      tradeDate: yyyymmddSchema("Trade date in YYYYMMDD format."),
      startDate: yyyymmddSchema("Start date in YYYYMMDD format."),
      endDate: yyyymmddSchema("End date in YYYYMMDD format."),
    },
    [],
    `Filters for the Tushare ${actionName} API. Provide tsCode, tradeDate, or both startDate and endDate.`,
  );

export const tushareActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_data",
    operationType: "read",
    description: "Call a Tushare data API through the official HTTP interface and return normalized table rows.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        apiName: s.nonEmptyString("Tushare API name, such as stock_basic, trade_cal, or daily."),
        params: s.record("Tushare API parameters passed as the official params object.", jsonValueSchema),
        fields: s.anyOf("Fields to request from Tushare, as a comma string or string list.", [
          s.nonEmptyString("Comma-separated Tushare field list, such as ts_code,name,list_date."),
          s.stringArray("List of Tushare field names to request.", {
            minItems: 1,
            itemDescription: "One Tushare field name.",
          }),
        ]),
      },
      ["apiName"],
      "Input payload for calling one Tushare HTTP API by name.",
    ),
    outputSchema: s.actionOutput(
      {
        requestId: requestIdSchema,
        message: responseMessageSchema,
        fields: s.array(
          "Field names returned by Tushare in table order.",
          s.string("One Tushare response field name."),
        ),
        items: s.array(
          "Raw Tushare row arrays aligned with the fields list.",
          s.array("One raw Tushare response row.", jsonValueSchema),
        ),
        rows: s.array(
          "Rows projected into objects keyed by Tushare field names.",
          s.record("One projected Tushare row object.", jsonValueSchema),
        ),
      },
      "Normalized Tushare tabular response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_stocks",
    operationType: "read",
    description: "List A-share stock basic information through Tushare stock_basic with normalized rows.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        exchange: compactStringSchema("Exchange code, such as SSE, SZSE, or BSE."),
        listStatus: s.stringEnum("Listing status: L listed, D delisted, P paused.", ["L", "D", "P"]),
        isHs: s.stringEnum("Shanghai-Hong Kong or Shenzhen-Hong Kong Stock Connect flag.", ["N", "H", "S"]),
      },
      [],
      "Filters for the Tushare stock_basic API.",
    ),
    outputSchema: s.actionOutput(
      {
        requestId: requestIdSchema,
        message: responseMessageSchema,
        stocks: s.array("Stocks returned by Tushare.", stockBasicRowSchema),
      },
      "Stocks returned by Tushare stock_basic.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_trade_calendar",
    operationType: "read",
    description: "Get exchange trading calendar rows through Tushare trade_cal with normalized dates.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        exchange: compactStringSchema("Exchange code, such as SSE or SZSE."),
        startDate: yyyymmddSchema("Start date in YYYYMMDD format."),
        endDate: yyyymmddSchema("End date in YYYYMMDD format."),
        isOpen: s.integer("Whether to return open days only, where 1 is open and 0 is closed.", {
          minimum: 0,
          maximum: 1,
        }),
      },
      ["startDate", "endDate"],
      "Filters for the Tushare trade_cal API.",
    ),
    outputSchema: s.actionOutput(
      {
        requestId: requestIdSchema,
        message: responseMessageSchema,
        calendar: s.array("Trade calendar rows returned by Tushare.", tradeCalendarRowSchema),
      },
      "Trade calendar rows returned by Tushare.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_daily_quotes",
    operationType: "read",
    description: "Get A-share daily quote rows through Tushare daily with normalized rows.",
    requiredScopes: [],
    inputSchema: datedMarketDataInputSchema("get_daily_quotes"),
    outputSchema: s.actionOutput(
      {
        requestId: requestIdSchema,
        message: responseMessageSchema,
        quotes: s.array("Daily quote rows returned by Tushare.", dailyQuoteRowSchema),
      },
      "Daily quote rows returned by Tushare.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_daily_basic",
    operationType: "read",
    description: "Get A-share daily valuation and share indicators through Tushare daily_basic.",
    requiredScopes: [],
    inputSchema: datedMarketDataInputSchema("get_daily_basic"),
    outputSchema: s.actionOutput(
      {
        requestId: requestIdSchema,
        message: responseMessageSchema,
        dailyBasics: s.array("Daily basic indicator rows returned by Tushare.", dailyBasicRowSchema),
      },
      "Daily basic indicator rows returned by Tushare.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_adjustment_factors",
    operationType: "read",
    description: "Get A-share adjustment factor rows through Tushare adj_factor.",
    requiredScopes: [],
    inputSchema: datedMarketDataInputSchema("get_adjustment_factors"),
    outputSchema: s.actionOutput(
      {
        requestId: requestIdSchema,
        message: responseMessageSchema,
        adjustmentFactors: s.array("Adjustment factor rows returned by Tushare.", adjustmentFactorRowSchema),
      },
      "Adjustment factor rows returned by Tushare.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_shareholder_trades",
    operationType: "read",
    description: "Get A-share important shareholder increases and decreases through Tushare stk_holdertrade.",
    requiredScopes: [],
    inputSchema: shareholderTradesInputSchema,
    outputSchema: s.actionOutput(
      {
        requestId: requestIdSchema,
        message: responseMessageSchema,
        shareholderTrades: s.array(
          "A-share important shareholder increase and decrease records.",
          shareholderTradeRowSchema,
        ),
      },
      "Important shareholder trades returned by Tushare stk_holdertrade.",
    ),
  }),
];
