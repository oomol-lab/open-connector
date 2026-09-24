import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { futunnResearchActions } from "./actions.research.ts";
import { futunnTradingActions } from "./actions.trading.ts";

const symbol = s.nonEmptyString("Security code with market prefix, for example US.AAPL or HK.00700.");
const accountId = s.nonEmptyString("Trading account ID returned by list_accounts, kept as a decimal string.", {
  pattern: "^[0-9]+$",
});
const date = s.string("Date in YYYY-MM-DD format in the market timezone.", { format: "date" });
const snapshot = s.looseObject("Market snapshot with additional category-specific fields.", {
  code: symbol,
  last_price: s.number("Latest traded price."),
  update_time: s.integer("Quote update timestamp in milliseconds."),
  volume: s.number("Trading volume in shares or contracts."),
});
const bar = s.looseObject("Historical candlestick with additional provider fields.", {
  time_key: s.integer("Candlestick timestamp in milliseconds."),
  open: s.number("Opening price."),
  close: s.number("Closing price."),
  high: s.number("Highest price."),
  low: s.number("Lowest price."),
  volume: s.number("Trading volume before applying volumePrecision."),
});
const tradingDay = s.looseObject("Trading day and session details.", {
  time: date,
  trade_date_type: s.string("Session type, such as WHOLE or MORNING."),
  trade_second: s.integer("Total trading seconds in the session."),
});
const position = s.looseObject("Position details with additional provider fields.", {
  code: symbol,
  stock_name: s.string("Security name."),
  qty: s.string("Position quantity as a decimal string."),
  cost_price: s.string("Position cost price as a decimal string."),
  cost_price_valid: s.boolean("Whether the cost price is valid."),
  pl_val: s.string("Profit or loss as a decimal string."),
  pl_val_valid: s.boolean("Whether the profit or loss value is valid."),
});
const quoteScope = ["quote:read"];
const tradeScope = ["trade:read"];

export const futunnActions: ActionDefinition[] = [
  ...futunnResearchActions,
  ...futunnTradingActions,
  defineProviderAction("futunn", {
    name: "get_market_snapshot",
    operationType: "read",
    description: "Get real-time market snapshots and valuation metrics for up to 400 securities.",
    requiredScopes: quoteScope,
    inputSchema: s.requiredObject("Securities to query.", {
      symbols: s.array("Security codes to query.", symbol, { minItems: 1, maxItems: 400 }),
    }),
    outputSchema: s.requiredObject("Market snapshot results.", {
      snapshots: s.array("Market snapshots with prices, volume, valuation and category-specific fields.", snapshot),
    }),
  }),
  defineProviderAction("futunn", {
    name: "get_history_kline",
    operationType: "read",
    description: "Get a page of historical candlesticks, retaining the next-page timestamp and volume precision.",
    requiredScopes: quoteScope,
    inputSchema: s.object(
      "Historical candlestick query.",
      {
        symbol,
        start: date,
        end: s.nonEmptyString(
          "End date in YYYY-MM-DD format, or the previous nextTime converted to a string for pagination.",
        ),
        ktype: s.withEnum(
          s.integer(
            "Candlestick interval: 1=1min, 2=day, 3=week, 4=month, 5=year, 6=5min, 7=15min, 8=30min, 9=60min. Default 2.",
          ),
          [1, 2, 3, 4, 5, 6, 7, 8, 9],
        ),
        autype: s.withEnum(s.integer("Price adjustment: 0=none, 1=forward (default), 2=backward."), [0, 1, 2]),
        num: s.integer("Number of bars requested; default and maximum 370.", {
          minimum: 1,
          maximum: 370,
        }),
        extendedTime: s.withEnum(
          s.integer("Extended session: 0=default, 1=US pre/after market, 2=US overnight."),
          [0, 1, 2],
        ),
      },
      { optional: ["start", "ktype", "autype", "num", "extendedTime"] },
    ),
    outputSchema: s.requiredObject("Historical candlesticks and pagination metadata.", {
      bars: s.array("Historical candlesticks in upstream order.", bar),
      nextTime: s.nullable(s.integer("Next page end timestamp in milliseconds, or null when absent.")),
      volumePrecision: s.nullable(
        s.integer("Divide bar volumes by 10 to this power; null when the provider omits precision."),
      ),
    }),
  }),
  defineProviderAction("futunn", {
    name: "list_trading_days",
    operationType: "read",
    description: "List trading days for a market within an inclusive date range.",
    requiredScopes: quoteScope,
    inputSchema: s.requiredObject("Market and date range.", {
      market: s.stringEnum("Market to query.", [
        "HK",
        "US",
        "SH",
        "SZ",
        "BJ",
        "SG",
        "JP",
        "KR",
        "CA",
        "AU",
        "JP_FUTURE",
        "SG_FUTURE",
      ]),
      start: date,
      end: date,
    }),
    outputSchema: s.requiredObject("Trading calendar results.", {
      tradingDays: s.array("Trading dates with session type and trading seconds.", tradingDay),
    }),
  }),
  defineProviderAction("futunn", {
    name: "list_accounts",
    operationType: "read",
    description: "List trading accounts authorized by the connected user.",
    requiredScopes: tradeScope,
    inputSchema: s.requiredObject("Authorized account query.", {}),
    outputSchema: s.requiredObject("Authorized trading accounts.", {
      accounts: s.array(
        "Authorized accounts; numeric account_id values are returned as lossless decimal strings.",
        s.looseObject("Authorized account details.", {
          account_id: s.string("Trading account ID as a lossless decimal string."),
          security_firm: s.string("Broker identifier."),
          acc_type: s.string("Account type, such as cash or margin."),
        }),
      ),
    }),
  }),
  defineProviderAction("futunn", {
    name: "get_account_funds",
    operationType: "read",
    description: "Get account assets, cash, buying power and margin balances in the requested currency.",
    requiredScopes: tradeScope,
    inputSchema: s.requiredObject("Account funds query.", {
      accountId,
      currency: s.nonEmptyString(
        "Display currency, for example USD or HKD; ignored by account types that do not support conversion.",
      ),
    }),
    outputSchema: s.requiredObject("Account fund balances.", {
      funds: s.looseObject("Account balances; monetary amounts retain upstream decimal strings.", {
        total_assets: s.string("Total net assets."),
        cash: s.string("Cash balance."),
        power: s.string("Maximum buying power."),
        currency: s.string("Display currency."),
      }),
    }),
  }),
  defineProviderAction("futunn", {
    name: "list_positions",
    operationType: "read",
    description: "List account positions, optionally filtered by security code and profit/loss ratio.",
    requiredScopes: tradeScope,
    inputSchema: s.object(
      "Account position query.",
      {
        accountId,
        code: symbol,
        plRatioMin: s.string("Minimum profit/loss percentage as a decimal string, for example 10."),
        plRatioMax: s.string("Maximum profit/loss percentage as a decimal string, for example 20."),
      },
      { optional: ["code", "plRatioMin", "plRatioMax"] },
    ),
    outputSchema: s.requiredObject("Account position results.", {
      positions: s.array("Positions with upstream quantities, prices and profit/loss decimal strings.", position),
    }),
  }),
];
