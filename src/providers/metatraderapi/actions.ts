import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "metatraderapi";

const emptyInputSchema = (description: string) => s.object(description, {});
const sessionIdSchema = s.nonWhitespaceString("The MetaTraderAPI session identifier returned by start_session.");
const sessionInputSchema = (description: string) =>
  s.object(description, {
    sessionId: sessionIdSchema,
  });
const providerObjectSchema = (description: string) => s.looseObject(description, {});

const sessionSummarySchema = s.looseObject("An active MetaTraderAPI session.", {
  session_id: s.string("The provider session identifier."),
  account_id: s.string("The connected MetaTrader account identifier."),
  server: s.string("The connected broker server."),
  platform: s.string("The connected MetaTrader platform."),
  is_active: s.boolean("Whether the session is active."),
  is_healthy: s.boolean("Whether the session is healthy."),
  started_at: s.string("When the session started."),
  last_activity: s.string("When the session was last active."),
});

const mtAccountSchema = s.looseObject("The MetaTrader account connected to a session.", {
  id: s.integer("The provider record identifier for the account."),
  account_id: s.string("The MetaTrader account identifier."),
  broker: s.string("The account broker name."),
  platform: s.stringEnum("The MetaTrader platform used by the account.", ["MT4", "MT5"]),
  server: s.string("The broker server used by the account."),
  is_active: s.boolean("Whether the account is active."),
  created_at: s.dateTime("When the provider account record was created."),
});

const mtSessionSchema = s.looseObject("A MetaTraderAPI session returned after connection.", {
  id: s.integer("The provider record identifier for the session."),
  session_id: s.string("The provider session identifier."),
  started_at: s.dateTime("When the session started."),
  last_activity: s.dateTime("When the session was last active."),
  ended_at: s.nullable(s.dateTime("When the session ended, when available.")),
  is_active: s.boolean("Whether the session is active."),
  subprocess_pid: s.nullableInteger("The MetaTrader subprocess identifier, when available."),
  subprocess_status: s.string("The current MetaTrader subprocess status."),
  mt5_connected: s.boolean("Whether the session is connected to the broker."),
  account_info: mtAccountSchema,
});

const accountInfoSchema = s.looseObject("The current MetaTrader account information.", {
  balance: s.string("The current account balance as a decimal string."),
  equity: s.string("The current account equity as a decimal string."),
  margin: s.string("The margin currently in use as a decimal string."),
  free_margin: s.string("The currently available margin as a decimal string."),
  margin_level: s.nullableString("The current margin level as a decimal string, when available."),
  leverage: s.integer("The account leverage."),
  currency: s.string("The account currency code."),
  server_time: s.dateTime("The current broker server time."),
  profit: s.string("The current account profit as a decimal string."),
  credit: s.string("The current account credit as a decimal string."),
});

const equityInfoSchema = s.looseObject("The current MetaTrader equity information.", {
  equity: s.string("The current account equity as a decimal string."),
  balance: s.string("The current account balance as a decimal string."),
  profit: s.string("The current account profit as a decimal string."),
  currency: s.string("The account currency code."),
});

const dealSchema = s.looseObject("An executed MetaTrader deal.", {
  ticket: s.integer("The deal ticket."),
  order: s.integer("The related order ticket."),
  time: s.string("The deal execution time."),
  type: s.string("The deal type."),
  entry: s.string("The deal entry direction."),
  magic: s.integer("The MetaTrader magic number associated with the deal."),
  position_id: s.integer("The related position identifier."),
  reason: s.string("The reason the deal was created."),
  volume: s.number("The executed volume."),
  price: s.number("The execution price."),
  commission: s.number("The deal commission."),
  swap: s.number("The deal swap amount."),
  profit: s.number("The deal profit or loss."),
  symbol: s.string("The traded symbol."),
  comment: s.string("The deal comment."),
});

const historyOrderSchema = s.looseObject("A historical MetaTrader order.", {
  ticket: s.integer("The order ticket."),
  time_setup: s.string("When the order was created."),
  time_done: s.string("When the order completed."),
  type: s.string("The order type."),
  state: s.string("The final order state."),
  magic: s.integer("The MetaTrader magic number associated with the order."),
  position_id: s.integer("The related position identifier."),
  reason: s.string("The reason the order was created."),
  volume_initial: s.number("The order's initial volume."),
  volume_current: s.number("The order's remaining volume."),
  price_open: s.number("The requested opening price."),
  price_current: s.number("The current or final price."),
  sl: s.nullableNumber("The stop-loss price, when set."),
  tp: s.nullableNumber("The take-profit price, when set."),
  symbol: s.string("The traded symbol."),
  comment: s.string("The order comment."),
});

const marginInfoSchema = s.looseObject("The current MetaTrader margin information.", {
  margin: s.string("The margin currently in use as a decimal string."),
  free_margin: s.string("The currently available margin as a decimal string."),
  margin_level: s.nullableString("The current margin level as a decimal string, when available."),
  currency: s.string("The account currency code."),
});

const pingInfoSchema = s.looseObject("The MetaTraderAPI session ping result.", {
  success: s.boolean("Whether the ping succeeded."),
  message: s.string("The provider ping message."),
  timestamp: s.number("The provider timestamp for the ping response."),
});

const sessionStatusSchema = s.looseObject("The current MetaTraderAPI session status.", {
  session_id: s.string("The provider session identifier."),
  is_active: s.boolean("Whether the session is active."),
  is_healthy: s.boolean("Whether the session is healthy."),
  mt5_connected: s.boolean("Whether the session is connected to the broker."),
  subprocess_status: s.string("The current MetaTrader subprocess status."),
  subprocess_pid: s.nullableInteger("The MetaTrader subprocess identifier, when available."),
  last_activity: s.dateTime("When the session was last active."),
  connection_error: s.nullableString("The latest connection error, when present."),
});

const symbolInfoSchema = s.looseObject("Detailed information about a trading symbol.", {
  symbol: s.string("The symbol name."),
  description: s.string("The symbol description."),
  bid: s.number("The current bid price."),
  ask: s.number("The current ask price."),
  spread: s.integer("The current spread in points."),
  digits: s.integer("The number of decimal places used by the symbol."),
  trade_contract_size: s.number("The symbol contract size."),
  min_volume: s.number("The minimum supported trade volume."),
  max_volume: s.number("The maximum supported trade volume."),
  volume_step: s.number("The supported increment between trade volumes."),
});

const listSessionsOutputSchema = s.object("The active MetaTraderAPI sessions.", {
  sessions: s.array("The active sessions available to the authenticated MetaTraderAPI account.", sessionSummarySchema),
});

const sessionOperationOutputSchema = s.object("The result of a MetaTraderAPI session operation.", {
  result: providerObjectSchema("The provider response for the session operation."),
});

const startSessionInputSchema = s.object("The credentials and platform used to start a session.", {
  accountId: s.nonEmptyString("The MetaTrader trading account login identifier.", {
    maxLength: 50,
  }),
  password: s.nonEmptyString("The password for the MetaTrader trading account.", {
    maxLength: 100,
  }),
  server: s.nonEmptyString("The broker server name or address used by the trading account.", {
    maxLength: 100,
  }),
  platform: s.withDefault(s.stringEnum("The MetaTrader platform used by the trading account.", ["MT4", "MT5"]), "MT5"),
});

const startSessionOutputSchema = s.object("The MetaTraderAPI session that was started.", {
  session: mtSessionSchema,
});

const accountInfoOutputSchema = s.object("The MetaTrader account information.", {
  accountInfo: accountInfoSchema,
});

const equityOutputSchema = s.object("The current MetaTrader account equity information.", {
  equity: equityInfoSchema,
});

const historyInputSchema = s.object(
  "The session and optional date range used to query MetaTrader account history.",
  {
    sessionId: sessionIdSchema,
    dateFrom: s.date("The first date to include, in YYYY-MM-DD format."),
    dateTo: s.date("The last date to include, in YYYY-MM-DD format."),
    daysBack: s.integer("The number of days before today to include when dateFrom is not provided."),
  },
  { optional: ["dateFrom", "dateTo", "daysBack"] },
);

const dealsOutputSchema = s.object("The executed deals in the requested account history range.", {
  deals: s.array("The executed deals returned by MetaTraderAPI.", dealSchema),
});

const historyOrdersOutputSchema = s.object("The historical orders in the requested account history range.", {
  orders: s.array("The historical orders returned by MetaTraderAPI.", historyOrderSchema),
});

const marginOutputSchema = s.object("The current MetaTrader account margin information.", {
  margin: marginInfoSchema,
});

const ordersOutputSchema = s.object("The pending orders for the MetaTraderAPI session.", {
  orders: s.array(
    "The pending orders returned by MetaTraderAPI.",
    providerObjectSchema("A provider-defined pending order object."),
  ),
});

const pingOutputSchema = s.object("The result of pinging the MetaTraderAPI session.", {
  ping: pingInfoSchema,
});

const positionsOutputSchema = s.object("The open positions for the MetaTraderAPI session.", {
  positions: s.array(
    "The open positions returned by MetaTraderAPI.",
    providerObjectSchema("A provider-defined open position object."),
  ),
});

const sessionStatusOutputSchema = s.object("The health and connection status of a session.", {
  status: sessionStatusSchema,
});

const symbolsOutputSchema = s.object("The trading symbols available in the session.", {
  symbols: s.stringArray("The symbol names returned by MetaTraderAPI.", {
    itemDescription: "A trading symbol name such as EURUSD.",
  }),
});

const getSymbolInputSchema = s.object("The session and trading symbol to inspect.", {
  sessionId: sessionIdSchema,
  symbol: s.nonWhitespaceString("The trading symbol name to inspect, such as EURUSD."),
});

const symbolOutputSchema = s.object("Detailed information about a trading symbol.", {
  symbol: symbolInfoSchema,
});

// 安全边界：仅暴露会话管理与只读账户/行情能力，不提供开仓、平仓、改单或自动交易控制。
export const metatraderapiActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_sessions",
    operationType: "read",
    description: "List all active MetaTraderAPI sessions for the authenticated account.",
    inputSchema: emptyInputSchema("The input payload for listing active sessions."),
    outputSchema: listSessionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_session",
    operationType: "write",
    description: "Start a MetaTraderAPI session connected to an MT4 or MT5 trading account.",
    inputSchema: startSessionInputSchema,
    outputSchema: startSessionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "stop_session",
    operationType: "destructive",
    description: "Stop one active MetaTraderAPI session.",
    inputSchema: sessionInputSchema("The session to stop."),
    outputSchema: sessionOperationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "close_all_sessions",
    operationType: "destructive",
    description: "Stop all active MetaTraderAPI sessions for the authenticated account.",
    inputSchema: emptyInputSchema("The input payload for stopping all active sessions."),
    outputSchema: sessionOperationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_account_info",
    operationType: "read",
    description: "Get balance, equity, margin, leverage, currency, and other account information.",
    inputSchema: sessionInputSchema("The session whose account information should be returned."),
    outputSchema: accountInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_equity",
    operationType: "read",
    description: "Get the current equity, balance, profit, and currency for a session.",
    inputSchema: sessionInputSchema("The session whose equity information should be returned."),
    outputSchema: equityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_deals",
    operationType: "read",
    description: "List executed deals from the MetaTrader account history.",
    inputSchema: historyInputSchema,
    outputSchema: dealsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_history_orders",
    operationType: "read",
    description: "List historical MetaTrader orders, including canceled and expired orders.",
    inputSchema: historyInputSchema,
    outputSchema: historyOrdersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_margin",
    operationType: "read",
    description: "Get the current margin and free-margin information for a session.",
    inputSchema: sessionInputSchema("The session whose margin information should be returned."),
    outputSchema: marginOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description: "List pending orders for a MetaTraderAPI session.",
    inputSchema: sessionInputSchema("The session whose pending orders should be returned."),
    outputSchema: ordersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "ping_session",
    operationType: "read",
    description: "Ping a MetaTraderAPI session to check whether it is responsive.",
    inputSchema: sessionInputSchema("The session to ping."),
    outputSchema: pingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_positions",
    operationType: "read",
    description: "List current open positions for a MetaTraderAPI session.",
    inputSchema: sessionInputSchema("The session whose open positions should be returned."),
    outputSchema: positionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_session_status",
    operationType: "read",
    description: "Get the activity, health, and MetaTrader connection status of a session.",
    inputSchema: sessionInputSchema("The session whose status should be returned."),
    outputSchema: sessionStatusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_symbols",
    operationType: "read",
    description: "List trading symbols available to a MetaTraderAPI session.",
    inputSchema: sessionInputSchema("The session whose available symbols should be returned."),
    outputSchema: symbolsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_symbol",
    operationType: "read",
    description: "Get current prices, spread, contract size, and volume limits for a symbol.",
    inputSchema: getSymbolInputSchema,
    outputSchema: symbolOutputSchema,
  }),
];
