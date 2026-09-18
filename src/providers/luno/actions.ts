import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "luno";

const currencyPairSchema = s.nonEmptyString("The Luno market pair, such as XBTZAR or ETHXBT.");
const timestampSchema = s.integer("A Unix timestamp in milliseconds.");
const decimalStringSchema = s.string("A decimal value represented as a string to preserve precision.");
const orderStateSchema = s.stringEnum("The Luno order state.", ["PENDING", "COMPLETE"]);

const orderBookEntrySchema = s.object("One aggregated order-book price level.", {
  price: decimalStringSchema,
  volume: decimalStringSchema,
});

const tickerSchema = s.looseObject("One Luno market ticker.", {
  ask: s.string("The lowest current ask price as a decimal string."),
  bid: s.string("The highest current bid price as a decimal string."),
  last_trade: s.string("The latest trade price as a decimal string."),
  pair: s.string("The market currency pair."),
  rolling_24_hour_volume: s.string("The rolling 24-hour traded volume as a decimal string."),
  status: s.string("The current market status."),
  timestamp: timestampSchema,
});

const tradeSchema = s.looseObject("One recent public Luno market trade.", {
  price: s.string("The trade price as a decimal string."),
  sequence: s.integer("The market trade sequence number."),
  timestamp: timestampSchema,
  volume: s.string("The trade volume as a decimal string."),
  is_buy: s.boolean("Whether the market taker was buying."),
});

const balanceSchema = s.looseObject("One Luno account balance.", {
  account_id: s.string("The account identifier."),
  asset: s.string("The account asset code."),
  balance: s.string("The total balance as a decimal string."),
  name: s.string("The account label."),
  reserved: s.string("The reserved balance as a decimal string."),
  unconfirmed: s.string("The unconfirmed balance as a decimal string."),
});

const orderSchema = s.looseObject("One Luno order.", {
  order_id: s.string("The order identifier."),
  pair: s.string("The order market pair."),
  state: s.string("The current order state."),
  type: s.string("The order side or type."),
  creation_timestamp: timestampSchema,
  completed_timestamp: timestampSchema,
  expiration_timestamp: timestampSchema,
  base: s.string("The base amount as a decimal string."),
  counter: s.string("The counter amount as a decimal string."),
  fee_base: s.string("The base-currency fee as a decimal string."),
  fee_counter: s.string("The counter-currency fee as a decimal string."),
  limit_price: s.string("The limit price as a decimal string."),
  limit_volume: s.string("The limit volume as a decimal string."),
  time_in_force: s.string("The order time-in-force policy."),
});

const getTickerAction = defineProviderAction(service, {
  name: "get_ticker",
  operationType: "read",
  description: "Get the latest Luno ticker indicators for one currency pair.",
  requiredScopes: [],
  inputSchema: s.object("Input for retrieving one Luno ticker.", {
    pair: currencyPairSchema,
  }),
  outputSchema: tickerSchema,
});

const listTickersAction = defineProviderAction(service, {
  name: "list_tickers",
  operationType: "read",
  description: "List latest Luno ticker indicators for active currency pairs.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for listing Luno tickers.",
    {
      pairs: s.array("The market pairs to include. Omit to return all active pairs.", currencyPairSchema, {
        minItems: 1,
      }),
    },
    { optional: ["pairs"] },
  ),
  outputSchema: s.object("The Luno ticker list.", {
    tickers: s.array("The returned market tickers.", tickerSchema),
  }),
});

const listRecentTradesAction = defineProviderAction(service, {
  name: "list_recent_trades",
  operationType: "read",
  description: "List up to 100 recent public Luno trades for one currency pair.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for listing recent Luno market trades.",
    {
      pair: currencyPairSchema,
      since: s.integer(
        "Only return trades after this Unix timestamp in milliseconds, which cannot be more than 24 hours ago.",
      ),
    },
    { optional: ["since"] },
  ),
  outputSchema: s.object("The recent Luno market trades.", {
    trades: s.array("The returned market trades.", tradeSchema),
  }),
});

const getTopOrderBookAction = defineProviderAction(service, {
  name: "get_top_order_book",
  operationType: "read",
  description: "Get the best 100 aggregated Luno bid and ask levels for one currency pair.",
  requiredScopes: [],
  inputSchema: s.object("Input for retrieving the top Luno order book.", {
    pair: currencyPairSchema,
  }),
  outputSchema: s.object("The aggregated top Luno order book.", {
    asks: s.array("Ask levels sorted by ascending price.", orderBookEntrySchema),
    bids: s.array("Bid levels sorted by descending price.", orderBookEntrySchema),
    timestamp: timestampSchema,
  }),
});

const getBalancesAction = defineProviderAction(service, {
  name: "get_balances",
  operationType: "read",
  description: "List Luno account balances, optionally filtered by asset code.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for listing Luno account balances.",
    {
      assets: s.array("The asset codes to include, such as XBT or ETH.", s.nonEmptyString("One Luno asset code."), {
        minItems: 1,
      }),
    },
    { optional: ["assets"] },
  ),
  outputSchema: s.object("The Luno account balance list.", {
    balance: s.array("The returned account balances.", balanceSchema),
  }),
});

const listOrdersAction = defineProviderAction(service, {
  name: "list_orders",
  operationType: "read",
  description: "List recently placed Luno orders with optional state, pair, and time filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for listing Luno orders.",
    {
      state: orderStateSchema,
      pair: currencyPairSchema,
      created_before: timestampSchema,
      limit: s.integer("The maximum number of orders to return.", { minimum: 1, maximum: 1000 }),
    },
    { optional: ["state", "pair", "created_before", "limit"] },
  ),
  outputSchema: s.object("The Luno order list.", {
    orders: s.array("The returned Luno orders.", orderSchema),
  }),
});

const getOrderAction = defineProviderAction(service, {
  name: "get_order",
  operationType: "read",
  description: "Get one Luno order by its order identifier.",
  requiredScopes: [],
  inputSchema: s.object("Input for retrieving one Luno order.", {
    id: s.nonEmptyString("The Luno order identifier."),
  }),
  outputSchema: orderSchema,
});

export const lunoActions: ActionDefinition[] = [
  getTickerAction,
  listTickersAction,
  listRecentTradesAction,
  getTopOrderBookAction,
  getBalancesAction,
  listOrdersAction,
  getOrderAction,
];
