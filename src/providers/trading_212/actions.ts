import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { trading212DefaultInstrumentLimit } from "./limits.ts";

const service = "trading_212";

const instrumentTypes = [
  "STOCK",
  "ETF",
  "CRYPTOCURRENCY",
  "CRYPTO",
  "FOREX",
  "FUTURES",
  "INDEX",
  "WARRANT",
  "CVR",
  "CORPACT",
];

const tickerInputSchema = s.nonEmptyString(
  "Only return items for this Trading 212 ticker, such as AAPL_US_EQ. search_instruments finds the ticker of a company or ISIN.",
);

const historyLimitInputSchema = s.positiveInteger(
  "The maximum number of items on the page, from 1 to 50. Trading 212 returns 20 when it is not set.",
  { maximum: 50 },
);

function nextPagePathInputSchema(action: string): JsonSchema {
  return s.nonEmptyString(
    `The nextPagePath that the previous ${action} call returned, to read the next page. It already carries the filters and the limit of the first call, so send it on its own.`,
  );
}

const nextPagePathOutputSchema = s.nullableString(
  "Pass this value back as nextPagePath to read the next page. Null when this is the last page.",
);

const instrumentSchema = s.looseObject("The instrument.", {
  ticker: s.string("The Trading 212 ticker, such as AAPL_US_EQ."),
  name: s.nullableString("The instrument name."),
  isin: s.nullableString("The ISIN."),
  currency: s.nullableString("The currency the instrument trades in, such as USD or GBX."),
});

const orderSchema = s.looseObject(
  "One order. Quantity-based orders carry quantity, value-based orders carry value; a sell has a negative quantity.",
  {
    id: s.integer("The order identifier."),
    ticker: s.nullableString("The Trading 212 ticker of the instrument."),
    instrument: s.nullable(instrumentSchema),
    type: s.nullableString("The order type: MARKET, LIMIT, STOP or STOP_LIMIT."),
    side: s.nullableString("BUY or SELL."),
    status: s.nullableString("The order status, such as NEW, PARTIALLY_FILLED, FILLED, CANCELLED or REJECTED."),
    strategy: s.nullableString(
      "QUANTITY when the order is for a number of shares, VALUE when it is for an amount of money.",
    ),
    quantity: s.nullableNumber("The number of shares ordered; negative for a sell."),
    value: s.nullableNumber("The amount of money ordered, for a value-based order."),
    filledQuantity: s.nullableNumber("The number of shares filled so far."),
    filledValue: s.nullableNumber("The amount of money filled so far."),
    limitPrice: s.nullableNumber("The limit price of a LIMIT or STOP_LIMIT order."),
    stopPrice: s.nullableNumber("The stop price of a STOP or STOP_LIMIT order."),
    timeInForce: s.nullableString("How long the order stays active: DAY or GOOD_TILL_CANCEL."),
    extendedHours: s.nullableBoolean("Whether the order may fill outside regular trading hours."),
    currency: s.nullableString("The currency of the order's prices and value."),
    initiatedFrom: s.nullableString("Where the order was placed, such as WEB, IOS, ANDROID, API or AUTOINVEST."),
    createdAt: s.nullableString("When the order was created, as an ISO-8601 timestamp."),
  },
);

const positionSchema = s.looseObject("One open position. Money values in walletImpact are in the account currency.", {
  instrument: s.nullable(instrumentSchema),
  quantity: s.nullableNumber("The number of shares held."),
  quantityAvailableForTrading: s.nullableNumber("The number of shares that can be sold now."),
  quantityInPies: s.nullableNumber("The number of shares held inside pies."),
  averagePricePaid: s.nullableNumber("The average price paid per share, in the instrument currency."),
  currentPrice: s.nullableNumber("The current price per share, in the instrument currency."),
  createdAt: s.nullableString("When the position was opened, as an ISO-8601 timestamp."),
  walletImpact: s.nullable(
    s.looseObject("What the position is worth in the account currency.", {
      currency: s.nullableString("The account currency these values are in."),
      currentValue: s.nullableNumber("The current market value of the position."),
      totalCost: s.nullableNumber("The total amount paid for the position."),
      unrealizedProfitLoss: s.nullableNumber("The unrealised profit or loss: currentValue minus totalCost."),
      fxImpact: s.nullableNumber(
        "The part of the result caused by currency rate changes; null when the instrument trades in the account currency.",
      ),
    }),
  ),
});

const fillSchema = s.looseObject("How the order was filled.", {
  id: s.nullableInteger("The fill identifier."),
  type: s.nullableString("The kind of fill, such as TRADE, STOCK_SPLIT or SPIN_OFF."),
  filledAt: s.nullableString("When the order was filled, as an ISO-8601 timestamp."),
  price: s.nullableNumber("The fill price per share, in the instrument currency."),
  quantity: s.nullableNumber("The number of shares filled; negative for a sell."),
  tradingMethod: s.nullableString("TOTV for an exchange-traded fill, OTC for an over-the-counter fill."),
  walletImpact: s.nullable(
    s.looseObject("What the fill did to the account, in the account currency.", {
      currency: s.nullableString("The account currency these values are in."),
      netValue: s.nullableNumber("The net amount of the fill after fees and taxes."),
      realisedProfitLoss: s.nullableNumber("The profit or loss realised by a sell."),
      fxRate: s.nullableNumber("The currency rate used, when the instrument currency differs from the account's."),
      taxes: s.nullable(
        s.array(
          "Fees and taxes charged on the fill.",
          s.looseObject("One fee or tax.", {
            name: s.nullableString("The fee or tax, such as STAMP_DUTY_RESERVE_TAX or CURRENCY_CONVERSION_FEE."),
            quantity: s.nullableNumber("The amount charged."),
            currency: s.nullableString("The currency of the amount."),
            chargedAt: s.nullableString("When it was charged, as an ISO-8601 timestamp."),
          }),
        ),
      ),
    }),
  ),
});

const dividendSchema = s.looseObject("One paid dividend.", {
  ticker: s.nullableString("The Trading 212 ticker of the instrument that paid it."),
  instrument: s.nullable(instrumentSchema),
  type: s.nullableString("The kind of payment, such as ORDINARY, INTEREST or RETURN_OF_CAPITAL."),
  amount: s.nullableNumber("The amount received, in the account currency."),
  amountInEuro: s.nullableNumber("The amount received, in euros."),
  currency: s.nullableString("The currency of amount."),
  grossAmountPerShare: s.nullableNumber("The gross dividend per share, in tickerCurrency."),
  tickerCurrency: s.nullableString("The currency the instrument pays in."),
  quantity: s.nullableNumber("The number of shares the dividend was paid on."),
  paidOn: s.nullableString("When the dividend was paid, as an ISO-8601 timestamp."),
  reference: s.nullableString("The Trading 212 reference of the payment."),
});

const transactionSchema = s.looseObject("One movement of cash to or from the account.", {
  type: s.nullableString(
    "The kind of movement: DEPOSIT, WITHDRAW, FEE, TRANSFER, INTEREST_ON_FREE_CASH or LENDING_INTEREST.",
  ),
  amount: s.nullableNumber("The amount moved."),
  currency: s.nullableString("The currency of amount."),
  dateTime: s.nullableString("When it happened, as an ISO-8601 timestamp."),
  reference: s.nullableString("The Trading 212 reference of the movement."),
});

const tradableInstrumentSchema = s.looseObject("One instrument that can be traded on Trading 212.", {
  ticker: s.string("The Trading 212 ticker, such as AAPL_US_EQ. Other actions take it as ticker."),
  shortName: s.nullableString("The short name, usually the exchange symbol, such as AAPL."),
  name: s.nullableString("The instrument name."),
  isin: s.nullableString("The ISIN."),
  type: s.nullableString("The kind of instrument, such as STOCK or ETF."),
  currencyCode: s.nullableString("The currency it trades in, such as USD, or GBX for pence."),
  extendedHours: s.nullableBoolean("Whether it can be traded outside regular hours."),
  maxOpenQuantity: s.nullableNumber("The largest position Trading 212 allows in it."),
  workingScheduleId: s.nullableInteger("The working schedule that sets its trading hours; see list_exchanges."),
  addedOn: s.nullableString("When it was added to Trading 212, as an ISO-8601 timestamp."),
});

const exchangeSchema = s.looseObject("One exchange and its trading hours.", {
  id: s.integer("The exchange identifier."),
  name: s.nullableString("The exchange name."),
  workingSchedules: s.nullable(
    s.array(
      "The exchange's working schedules. Instruments point to one with workingScheduleId.",
      s.looseObject("One working schedule.", {
        id: s.integer("The working schedule identifier."),
        timeEvents: s.nullable(
          s.array(
            "The upcoming opening and closing events.",
            s.looseObject("One event.", {
              date: s.nullableString("When it happens, as an ISO-8601 timestamp."),
              type: s.nullableString(
                "The event, such as OPEN, CLOSE, PRE_MARKET_OPEN, AFTER_HOURS_OPEN or AFTER_HOURS_CLOSE.",
              ),
            }),
          ),
        ),
      }),
    ),
  ),
});

/**
 * Public Trading 212 action catalog. Every action is a read of the account
 * the API key belongs to, or of Trading 212's instrument metadata.
 */
export const trading212Actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_summary",
    operationType: "read",
    requiredScopes: ["account"],
    providerPermissions: ["account"],
    description:
      "Get the account's balances in its currency: total value, cash free to invest, cash in pies and reserved for orders, invested value, and realised and unrealised profit or loss. Trading 212 allows one call every 5 seconds.",
    inputSchema: s.object("No input parameters are required for this action.", {}),
    outputSchema: s.object("The account summary returned by Trading 212.", {
      account: s.looseObject("The account.", {
        id: s.integer("The account identifier."),
        currency: s.nullableString("The account currency, which every money value uses."),
        totalValue: s.nullableNumber("The total value of the account: cash plus investments."),
        cash: s.nullable(
          s.looseObject("The account's cash.", {
            availableToTrade: s.nullableNumber("Cash free to invest or withdraw."),
            inPies: s.nullableNumber("Cash held inside pies."),
            reservedForOrders: s.nullableNumber("Cash set aside for pending orders."),
          }),
        ),
        investments: s.nullable(
          s.looseObject("The account's investments.", {
            currentValue: s.nullableNumber("The current value of all positions."),
            totalCost: s.nullableNumber("The amount paid for the current positions."),
            unrealizedProfitLoss: s.nullableNumber("The profit or loss of the current positions."),
            realizedProfitLoss: s.nullableNumber("The profit or loss realised by past sells."),
          }),
        ),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_positions",
    operationType: "read",
    requiredScopes: ["portfolio"],
    providerPermissions: ["portfolio"],
    description:
      "List the account's open positions with quantity, average price paid, current price, value, cost and unrealised profit or loss. Trading 212 allows one call per second.",
    inputSchema: s.object("An optional ticker filter.", {
      ticker: tickerInputSchema,
    }),
    outputSchema: s.object("The open positions returned by Trading 212.", {
      positions: s.array("The open positions.", positionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_pending_orders",
    operationType: "read",
    requiredScopes: ["orders:read"],
    providerPermissions: ["orders:read"],
    description:
      "List the account's orders that are still working: not yet filled, cancelled or expired. Filled and cancelled orders are in list_historical_orders. Trading 212 allows one call every 5 seconds.",
    inputSchema: s.object("No input parameters are required for this action.", {}),
    outputSchema: s.object("The pending orders returned by Trading 212.", {
      orders: s.array("The pending orders.", orderSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_pending_order",
    operationType: "read",
    requiredScopes: ["orders:read"],
    providerPermissions: ["orders:read"],
    description:
      "Get one pending order by its id. An order that has filled, been cancelled or expired is no longer found here; read it from list_historical_orders. Trading 212 allows one call per second.",
    inputSchema: s.object(
      "The order to read.",
      {
        orderId: s.positiveInteger("The order identifier, from list_pending_orders."),
      },
      { required: ["orderId"] },
    ),
    outputSchema: s.object("The pending order returned by Trading 212.", {
      order: orderSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_historical_orders",
    operationType: "read",
    requiredScopes: ["history:orders"],
    providerPermissions: ["history:orders"],
    description:
      "List the account's past orders, newest first, each with its fill: price, quantity, net value, realised profit or loss, fees and taxes. Returns one page; pass nextPagePath back to read the next. Trading 212 allows 20 calls a minute.",
    inputSchema: s.object("Filters and paging for the order history.", {
      ticker: tickerInputSchema,
      limit: historyLimitInputSchema,
      nextPagePath: nextPagePathInputSchema("list_historical_orders"),
    }),
    outputSchema: s.object("One page of the order history returned by Trading 212.", {
      orders: s.array(
        "The past orders on this page.",
        s.looseObject("One past order and how it was filled.", {
          order: s.nullable(orderSchema),
          fill: s.nullable(fillSchema),
        }),
      ),
      nextPagePath: nextPagePathOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_dividends",
    operationType: "read",
    requiredScopes: ["history:dividends"],
    providerPermissions: ["history:dividends"],
    description:
      "List the dividends paid into the account, newest first, with amount, amount per share and the number of shares. Returns one page; pass nextPagePath back to read the next. Trading 212 allows 20 calls a minute.",
    inputSchema: s.object("Filters and paging for the dividend history.", {
      ticker: tickerInputSchema,
      limit: historyLimitInputSchema,
      nextPagePath: nextPagePathInputSchema("list_dividends"),
    }),
    outputSchema: s.object("One page of paid dividends returned by Trading 212.", {
      dividends: s.array("The dividends on this page.", dividendSchema),
      nextPagePath: nextPagePathOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_transactions",
    operationType: "read",
    requiredScopes: ["history:transactions"],
    providerPermissions: ["history:transactions"],
    description:
      "List the cash movements of the account, newest first: deposits, withdrawals, fees, transfers and interest. Trades and dividends are in list_historical_orders and list_dividends. Returns one page; pass nextPagePath back to read the next. Trading 212 allows 20 calls a minute.",
    inputSchema: s.object("Filters and paging for the transaction history.", {
      time: s.dateTime("Only return movements from this point in time, as an ISO-8601 timestamp."),
      limit: historyLimitInputSchema,
      nextPagePath: nextPagePathInputSchema("list_transactions"),
    }),
    outputSchema: s.object("One page of transactions returned by Trading 212.", {
      transactions: s.array("The transactions on this page.", transactionSchema),
      nextPagePath: nextPagePathOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_instruments",
    operationType: "read",
    requiredScopes: ["metadata"],
    providerPermissions: ["metadata"],
    description: `Find instruments that can be traded on Trading 212, to learn the ticker other actions take, the ISIN, the currency or the trading-hours schedule. Exact ticker, symbol or ISIN matches come first. Returns at most limit matches (${trading212DefaultInstrumentLimit} by default) and the number of all matches. Trading 212 allows one call every 50 seconds, so search once with the most precise text.`,
    inputSchema: s.object("What to look for. Without any filter the first instruments of the list are returned.", {
      query: s.nonEmptyString(
        "Text to find in the ticker, symbol, name or ISIN, ignoring case, such as AAPL, Apple or US0378331005.",
      ),
      type: s.stringEnum("Only return instruments of this kind.", instrumentTypes),
      currency: s.string("Only return instruments that trade in this currency, such as USD, EUR, or GBX for pence.", {
        pattern: "^[A-Za-z]{3}$",
      }),
      limit: s.withDefault(
        s.positiveInteger("The maximum number of instruments to return.", { maximum: 200 }),
        trading212DefaultInstrumentLimit,
      ),
    }),
    outputSchema: s.object("The matching instruments.", {
      instruments: s.array("The matching instruments, exact matches first.", tradableInstrumentSchema),
      totalMatches: s.nonNegativeInteger("How many instruments matched, including those beyond limit."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_exchanges",
    operationType: "read",
    requiredScopes: ["metadata"],
    providerPermissions: ["metadata"],
    description:
      "List the exchanges Trading 212 trades on with their working schedules: the upcoming open, close, pre-market and after-hours times. Instruments point to a schedule with workingScheduleId. Trading 212 allows one call every 30 seconds.",
    inputSchema: s.object("No input parameters are required for this action.", {}),
    outputSchema: s.object("The exchanges returned by Trading 212.", {
      exchanges: s.array("The exchanges.", exchangeSchema),
    }),
  }),
];
