import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "stay_ai";

const timestampSchema = (description: string) => s.integer(description);
const pageSchema = s.integer("Page number to request. Stay AI pages start from 1.", { minimum: 1 });
const pageSizeSchema = s.integer("Number of records per page. Stay AI documents 5 to 100.", {
  minimum: 5,
  maximum: 100,
});
const sortDirectionSchema = s.stringEnum("Sort direction accepted by Stay AI.", ["asc", "desc"]);
const sortBySchema = s.stringEnum("Field used to sort Stay AI records.", ["createdAt", "updatedAt"]);

const accountSettingsInputSchema = s.object(
  "Filters for retrieving Stay AI account settings.",
  {
    accountId: s.nonEmptyString("The Stay AI account ID whose settings should be retrieved."),
  },
  { optional: ["accountId"] },
);

const subscriptionListInputSchema = s.object(
  "Filters, sorting, and pagination for querying Stay AI subscriptions.",
  {
    email: s.email("Customer email address to filter subscriptions."),
    status: s.stringEnum("Subscription status to filter by.", ["ACTIVE", "PAUSED", "CANCELLED"]),
    createdAtMin: timestampSchema("Minimum created timestamp in milliseconds."),
    createdAtMax: timestampSchema("Maximum created timestamp in milliseconds."),
    updatedAtMin: timestampSchema("Minimum updated timestamp in milliseconds."),
    updatedAtMax: timestampSchema("Maximum updated timestamp in milliseconds."),
    nextBillingDateMin: timestampSchema("Minimum next billing timestamp in milliseconds."),
    nextBillingDateMax: timestampSchema("Maximum next billing timestamp in milliseconds."),
    prepaidNextDeliveryDateMin: timestampSchema(
      "Minimum prepaid subscription next delivery timestamp in milliseconds.",
    ),
    prepaidNextDeliveryDateMax: timestampSchema(
      "Maximum prepaid subscription next delivery timestamp in milliseconds.",
    ),
    page: pageSchema,
    pageSize: pageSizeSchema,
    sortBy: sortBySchema,
    sortDirection: sortDirectionSchema,
  },
  {
    optional: [
      "email",
      "status",
      "createdAtMin",
      "createdAtMax",
      "updatedAtMin",
      "updatedAtMax",
      "nextBillingDateMin",
      "nextBillingDateMax",
      "prepaidNextDeliveryDateMin",
      "prepaidNextDeliveryDateMax",
      "page",
      "pageSize",
      "sortBy",
      "sortDirection",
    ],
  },
);

const subscriptionIdInputSchema = s.object(
  "Identifier for retrieving one Stay AI subscription.",
  {
    subscriptionId: s.nonEmptyString("Shopify or internal subscription ID."),
  },
  { required: ["subscriptionId"] },
);

const orderListInputSchema = s.object(
  "Filters, sorting, and pagination for querying Stay AI orders.",
  {
    createdAtMin: timestampSchema("Minimum created timestamp in milliseconds."),
    createdAtMax: timestampSchema("Maximum created timestamp in milliseconds."),
    updatedAtMin: timestampSchema("Minimum updated timestamp in milliseconds."),
    updatedAtMax: timestampSchema("Maximum updated timestamp in milliseconds."),
    page: pageSchema,
    pageSize: pageSizeSchema,
    sortBy: sortBySchema,
    sortDirection: sortDirectionSchema,
  },
  {
    optional: [
      "createdAtMin",
      "createdAtMax",
      "updatedAtMin",
      "updatedAtMax",
      "page",
      "pageSize",
      "sortBy",
      "sortDirection",
    ],
  },
);

const accountSettingsSchema = s.looseObject("Stay AI account settings.", {
  emailSenderName: s.string("Email sender name configured for the account."),
  emailSenderAddress: s.string("Email sender address configured for the account."),
  emailReplyName: s.string("Email reply-to name configured for the account."),
  emailReplyAddress: s.string("Email reply-to address configured for the account."),
  notificationDelay: s.integer("Notification delay setting returned by Stay AI."),
  enableMultipleDiscounts: s.boolean("Whether the account allows multiple discounts."),
});

const subscriptionSchema = s.looseObject("Stay AI subscription object.", {
  id: s.string("Stay AI internal subscription record ID."),
  subscriptionId: s.string("Shopify subscription contract global ID."),
  customerId: s.string("Shopify customer ID."),
  emailAddress: s.string("Customer email address."),
  createdAt: s.string("Timestamp when the subscription was created."),
  updatedAt: s.string("Timestamp when the subscription was last updated."),
  nextBillingDate: s.string("Timestamp for the next billing date."),
  status: s.string("Subscription status returned by Stay AI."),
  currency: s.string("Currency code for the subscription."),
  price: s.number("Subscription price returned by Stay AI."),
  lineItems: s.array("Subscription line items returned by Stay AI.", s.looseObject("Stay AI subscription line item.")),
});

const orderSchema = s.looseObject("Stay AI order object.", {
  orderId: s.string("Shopify order global ID."),
  orderName: s.string("Shopify order display name."),
  customerId: s.string("Shopify customer ID."),
  subscriptionId: s.string("Shopify subscription contract global ID."),
  createdAt: s.string("Timestamp when the order was created."),
  updatedAt: s.string("Timestamp when the order was last updated."),
  fulfillmentStatus: s.string("Order fulfillment status."),
  currency: s.string("Currency code for the order."),
  totalPrice: s.number("Total order price returned by Stay AI."),
  lineItems: s.array("Order line items returned by Stay AI.", s.looseObject("Stay AI order line item.")),
});

export const stayAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_settings",
    description: "Retrieve account-level Stay AI settings for the current API key.",
    inputSchema: accountSettingsInputSchema,
    outputSchema: s.object(
      "Stay AI account settings response.",
      {
        settings: accountSettingsSchema,
      },
      { required: ["settings"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_subscriptions",
    description: "Query Stay AI subscriptions with documented filters, sorting, and pagination.",
    inputSchema: subscriptionListInputSchema,
    outputSchema: s.object(
      "Stay AI subscription list response.",
      {
        total: s.number("Total number of matching subscriptions."),
        subscriptions: s.array("Subscriptions returned by Stay AI.", subscriptionSchema),
      },
      { required: ["total", "subscriptions"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscription",
    description: "Retrieve a Stay AI subscription by Shopify or internal subscription ID.",
    inputSchema: subscriptionIdInputSchema,
    outputSchema: s.object(
      "Stay AI subscription response.",
      {
        subscription: subscriptionSchema,
      },
      { required: ["subscription"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    description: "Query Stay AI orders with documented filters, sorting, and pagination.",
    inputSchema: orderListInputSchema,
    outputSchema: s.object(
      "Stay AI order list response.",
      {
        total: s.number("Total number of matching orders."),
        orders: s.array("Orders returned by Stay AI.", orderSchema),
      },
      { required: ["total", "orders"] },
    ),
  }),
];
