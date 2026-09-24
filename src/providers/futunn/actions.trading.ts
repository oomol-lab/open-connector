import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const futunnTradingActions: readonly ActionDefinition[] = [
  defineProviderAction("futunn", {
    name: "list_open_orders",
    operationType: "read",
    description: "List recent orders, including pending orders and orders filled or cancelled in the last 24 hours.",
    requiredScopes: ["trade:read"],
    inputSchema: s.object(
      "Account order or fill query.",
      {
        accountId: s.string("Trading account ID as a decimal string.", { pattern: "^[0-9]+$" }),
        market: s.stringEnum("Trading market; HKCC denotes China Stock Connect.", [
          "NONE",
          "HK",
          "US",
          "SG",
          "HKCC",
          "CA",
          "FUTURES",
          "JP",
          "KR",
          "MY",
          "AU",
        ]),
        pageFlag: s.string("Opaque page flag; omit or use an empty string for the first page."),
        pageSize: s.integer("Page size; default 50, range 10-100.", { minimum: 10, maximum: 100 }),
      },
      { optional: ["pageFlag", "pageSize"] },
    ),
    outputSchema: s.requiredObject("One page of account records.", {
      orders: s.array(
        "Returned account records in provider order.",
        s.looseObject("Order with original quantities, prices and status fields.", {
          order_id: s.string("Order ID."),
          code: s.string("Security code including market prefix, for example HK.00700.", {
            minLength: 1,
          }),
          order_status: s.string("Order status."),
          qty: s.string("Quantity as a decimal string."),
          price: s.string("Price as a decimal string."),
          create_time: s.integer("Creation timestamp in microseconds."),
        }),
      ),
      pageFlag: s.nullable(s.string("Next-page flag; null when omitted.")),
      completed: s.nullable(s.boolean("True means this batch is complete; null means the provider omitted the flag.")),
    }),
  }),
  defineProviderAction("futunn", {
    name: "list_history_orders",
    operationType: "read",
    description: "List historical orders filtered by creation time in microseconds.",
    requiredScopes: ["trade:read"],
    inputSchema: s.object(
      "Account order or fill query.",
      {
        accountId: s.string("Trading account ID as a decimal string.", { pattern: "^[0-9]+$" }),
        market: s.stringEnum("Trading market; HKCC denotes China Stock Connect.", [
          "NONE",
          "HK",
          "US",
          "SG",
          "HKCC",
          "CA",
          "FUTURES",
          "JP",
          "KR",
          "MY",
          "AU",
        ]),
        pageFlag: s.string("Opaque page flag; omit or use an empty string for the first page."),
        pageSize: s.integer("Page size; default 50, range 10-100.", { minimum: 10, maximum: 100 }),
        code: s.string("Security code including market prefix, for example HK.00700.", {
          minLength: 1,
        }),
        start: s.string(
          "Unix timestamp in microseconds as a decimal string; 0 uses the provider 90-day default window.",
          { pattern: "^[0-9]+$" },
        ),
        end: s.string(
          "Unix timestamp in microseconds as a decimal string; 0 uses the provider 90-day default window.",
          { pattern: "^[0-9]+$" },
        ),
      },
      { optional: ["pageFlag", "pageSize", "code", "start", "end"] },
    ),
    outputSchema: s.requiredObject("One page of account records.", {
      orders: s.array(
        "Returned account records in provider order.",
        s.looseObject("Order with original quantities, prices and status fields.", {
          order_id: s.string("Order ID."),
          code: s.string("Security code including market prefix, for example HK.00700.", {
            minLength: 1,
          }),
          order_status: s.string("Order status."),
          qty: s.string("Quantity as a decimal string."),
          price: s.string("Price as a decimal string."),
          create_time: s.integer("Creation timestamp in microseconds."),
        }),
      ),
      pageFlag: s.nullable(s.string("Next-page flag; null when omitted.")),
      completed: s.nullable(s.boolean("True means this batch is complete; null means the provider omitted the flag.")),
    }),
  }),
  defineProviderAction("futunn", {
    name: "list_today_deals",
    operationType: "read",
    description: "List today's execution fills for a trading account.",
    requiredScopes: ["trade:read"],
    inputSchema: s.object(
      "Account order or fill query.",
      {
        accountId: s.string("Trading account ID as a decimal string.", { pattern: "^[0-9]+$" }),
        market: s.stringEnum("Trading market; HKCC denotes China Stock Connect.", [
          "NONE",
          "HK",
          "US",
          "SG",
          "HKCC",
          "CA",
          "FUTURES",
          "JP",
          "KR",
          "MY",
          "AU",
        ]),
        pageFlag: s.string("Opaque page flag; omit or use an empty string for the first page."),
        pageSize: s.integer("Page size; default 50, range 10-100.", { minimum: 10, maximum: 100 }),
      },
      { optional: ["pageFlag", "pageSize"] },
    ),
    outputSchema: s.requiredObject("One page of account records.", {
      deals: s.array(
        "Returned account records in provider order.",
        s.looseObject("Execution fill record.", {
          deal_id: s.string("Case-sensitive base58 fill ID; preserve exactly."),
          order_id: s.string("Order ID."),
          qty: s.string("Quantity as a decimal string."),
          price: s.string("Price as a decimal string."),
          create_time: s.integer("Creation timestamp in microseconds."),
        }),
      ),
      pageFlag: s.nullable(s.string("Next-page flag; null when omitted.")),
      completed: s.nullable(s.boolean("True means this batch is complete; null means the provider omitted the flag.")),
    }),
  }),
  defineProviderAction("futunn", {
    name: "list_history_deals",
    operationType: "read",
    description: "List historical execution fills filtered by update time in microseconds.",
    requiredScopes: ["trade:read"],
    inputSchema: s.object(
      "Account order or fill query.",
      {
        accountId: s.string("Trading account ID as a decimal string.", { pattern: "^[0-9]+$" }),
        market: s.stringEnum("Trading market; HKCC denotes China Stock Connect.", [
          "NONE",
          "HK",
          "US",
          "SG",
          "HKCC",
          "CA",
          "FUTURES",
          "JP",
          "KR",
          "MY",
          "AU",
        ]),
        pageFlag: s.string("Opaque page flag; omit or use an empty string for the first page."),
        pageSize: s.integer("Page size; default 50, range 10-50.", { minimum: 10, maximum: 50 }),
        code: s.string("Security code including market prefix, for example HK.00700.", {
          minLength: 1,
        }),
        start: s.string(
          "Unix timestamp in microseconds as a decimal string; 0 uses the provider 90-day default window.",
          { pattern: "^[0-9]+$" },
        ),
        end: s.string(
          "Unix timestamp in microseconds as a decimal string; 0 uses the provider 90-day default window.",
          { pattern: "^[0-9]+$" },
        ),
      },
      { optional: ["pageFlag", "pageSize", "code", "start", "end"] },
    ),
    outputSchema: s.requiredObject("One page of account records.", {
      deals: s.array(
        "Returned account records in provider order.",
        s.looseObject("Execution fill record.", {
          deal_id: s.string("Case-sensitive base58 fill ID; preserve exactly."),
          order_id: s.string("Order ID."),
          qty: s.string("Quantity as a decimal string."),
          price: s.string("Price as a decimal string."),
          create_time: s.integer("Creation timestamp in microseconds."),
        }),
      ),
      pageFlag: s.nullable(s.string("Next-page flag; null when omitted.")),
      completed: s.nullable(s.boolean("True means this batch is complete; null means the provider omitted the flag.")),
    }),
  }),
  defineProviderAction("futunn", {
    name: "get_order_details",
    operationType: "read",
    description: "Get details of fewer than 50 orders from the same exchange.",
    requiredScopes: ["trade:read"],
    inputSchema: s.requiredObject("Order detail query.", {
      accountId: s.string("Trading account ID as a decimal string.", { pattern: "^[0-9]+$" }),
      exchange: s.stringEnum("Exchange shared by all requested orders.", [
        "US",
        "SEHK",
        "SGX",
        "SSE",
        "SZSE",
        "JP",
        "CA",
        "CME",
        "CBOT",
        "NYMEX",
        "COMEX",
        "CBOE",
        "HKFE",
        "KR",
        "BMS",
        "BMD",
        "ASX",
      ]),
      orderIds: s.array("Order IDs from the same exchange.", s.string("Order ID.", { minLength: 1 }), {
        minItems: 1,
        maxItems: 49,
      }),
    }),
    outputSchema: s.requiredObject("Order detail results.", {
      orders: s.array(
        "Order details.",
        s.looseObject("Order with original quantities, prices and status fields.", {
          order_id: s.string("Order ID."),
          code: s.string("Security code including market prefix, for example HK.00700.", {
            minLength: 1,
          }),
          order_status: s.string("Order status."),
          qty: s.string("Quantity as a decimal string."),
          price: s.string("Price as a decimal string."),
          create_time: s.integer("Creation timestamp in microseconds."),
        }),
      ),
    }),
  }),
];
