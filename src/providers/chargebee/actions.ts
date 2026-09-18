import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "chargebee";

const id = s.nonEmptyString("A Chargebee resource identifier.");
const listInput = s.object(
  {
    limit: s.integer("The maximum number of records Chargebee should return.", { minimum: 1, maximum: 100 }),
    offset: s.nonEmptyString("The next_offset value returned by a previous Chargebee list call."),
    id,
    customerId: id,
    subscriptionId: id,
    email: s.email("Filter customers whose email exactly matches this value."),
    status: s.nonEmptyString("Filter resources whose status exactly matches this value."),
    itemId: id,
    sortBy: s.nonEmptyString("The Chargebee field to sort by."),
    sortOrder: s.stringEnum(["asc", "desc"], { description: "The sort direction." }),
  },
  {
    optional: [
      "limit",
      "offset",
      "id",
      "customerId",
      "subscriptionId",
      "email",
      "status",
      "itemId",
      "sortBy",
      "sortOrder",
    ],
    description: "Query parameters for listing Chargebee records.",
  },
);
const raw = s.looseObject("The raw Chargebee object returned by the API.");
const listOutput = (key: string): ReturnType<typeof s.object> =>
  s.object({
    [key]: s.array(raw, { description: `${key} returned by Chargebee.` }),
    nextOffset: s.nullableString("The offset token for the next page when present."),
  });
const singleOutput = (key: string): ReturnType<typeof s.object> => s.object({ [key]: raw });

export const chargebeeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_customers",
    operationType: "read",
    description: "List Chargebee customers with optional exact-match filters and pagination.",
    requiredScopes: [],
    inputSchema: listInput,
    outputSchema: listOutput("customers"),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    operationType: "read",
    description: "Retrieve one Chargebee customer by ID.",
    requiredScopes: [],
    inputSchema: s.object({ customerId: id }, { required: ["customerId"], description: "Customer lookup input." }),
    outputSchema: singleOutput("customer"),
  }),
  defineProviderAction(service, {
    name: "create_customer",
    operationType: "write",
    description: "Create a basic Chargebee customer record from JSON-friendly fields.",
    requiredScopes: [],
    inputSchema: s.looseObject("Customer fields forwarded to Chargebee's create customer endpoint."),
    outputSchema: singleOutput("customer"),
  }),
  defineProviderAction(service, {
    name: "list_subscriptions",
    operationType: "read",
    description: "List Chargebee subscriptions with optional exact-match filters and pagination.",
    requiredScopes: [],
    inputSchema: listInput,
    outputSchema: listOutput("subscriptions"),
  }),
  defineProviderAction(service, {
    name: "get_subscription",
    operationType: "read",
    description: "Retrieve one Chargebee subscription by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      { subscriptionId: id },
      { required: ["subscriptionId"], description: "Subscription lookup input." },
    ),
    outputSchema: singleOutput("subscription"),
  }),
  defineProviderAction(service, {
    name: "list_invoices",
    operationType: "read",
    description: "List Chargebee invoices with optional exact-match filters and pagination.",
    requiredScopes: [],
    inputSchema: listInput,
    outputSchema: listOutput("invoices"),
  }),
  defineProviderAction(service, {
    name: "get_invoice",
    operationType: "read",
    description: "Retrieve one Chargebee invoice by ID.",
    requiredScopes: [],
    inputSchema: s.object({ invoiceId: id }, { required: ["invoiceId"], description: "Invoice lookup input." }),
    outputSchema: singleOutput("invoice"),
  }),
  defineProviderAction(service, {
    name: "list_item_prices",
    operationType: "read",
    description: "List Chargebee item prices with optional exact-match filters and pagination.",
    requiredScopes: [],
    inputSchema: listInput,
    outputSchema: listOutput("itemPrices"),
  }),
  defineProviderAction(service, {
    name: "get_item_price",
    operationType: "read",
    description: "Retrieve one Chargebee item price by ID.",
    requiredScopes: [],
    inputSchema: s.object({ itemPriceId: id }, { required: ["itemPriceId"], description: "Item price lookup input." }),
    outputSchema: singleOutput("itemPrice"),
  }),
];
