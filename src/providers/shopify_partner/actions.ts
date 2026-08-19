import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "shopify_partner";

const graphQlIdSchema = s.string("A Shopify Partner GraphQL global ID.", { minLength: 1 });
const cursorSchema = s.string("A Shopify Partner GraphQL pagination cursor.", { minLength: 1 });
const dateTimeSchema = s.dateTime("A Shopify Partner ISO 8601 timestamp.");
const rawObjectSchema = s.looseObject("The raw Shopify Partner GraphQL object.");
const optionalStringSchema = (description: string) => s.nullable(s.string(description));
const firstWithDefaultSchema = s.integer("The number of records to return.", {
  minimum: 1,
  maximum: 100,
  default: 50,
});

const eventOrderSchema = s.stringEnum("The order for Shopify Partner event results.", [
  "OCCURRED_AT_ASC",
  "OCCURRED_AT_DESC",
]);

const eventTypeSchema = s.stringEnum("A Shopify Partner historical event type.", [
  "CHARGE_ONE_TIME",
  "CHARGE_RECURRING",
  "CHARGE_USAGE",
  "CREDIT_APPLIED",
  "CREDIT_FAILED",
  "CREDIT_PENDING",
  "EARNING_ADJUSTMENT",
  "EARNING_CHARGE_ONE_TIME",
  "EARNING_CHARGE_RECURRING",
  "EARNING_CHARGE_USAGE",
  "EARNING_CREDIT",
  "EARNING_REFUND",
  "RELATIONSHIP_DEACTIVATED",
  "RELATIONSHIP_INSTALLED",
  "RELATIONSHIP_REACTIVATED",
  "RELATIONSHIP_UNINSTALLED",
  "SUBSCRIPTION_CANCELED",
  "SUBSCRIPTION_CANCELLATION_SCHEDULED",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_FROZEN",
  "SUBSCRIPTION_UNFROZEN",
  "SUBSCRIPTION_UPDATED",
]);

const subjectTypeSchema = s.stringEnum("The Shopify Partner event subject type.", ["APP", "THEME"]);

const appEventTypeSchema = s.stringEnum("A Shopify Partner app event type.", [
  "CREDIT_APPLIED",
  "CREDIT_FAILED",
  "CREDIT_PENDING",
  "ONE_TIME_CHARGE_ACCEPTED",
  "ONE_TIME_CHARGE_ACTIVATED",
  "ONE_TIME_CHARGE_DECLINED",
  "ONE_TIME_CHARGE_EXPIRED",
  "RELATIONSHIP_DEACTIVATED",
  "RELATIONSHIP_INSTALLED",
  "RELATIONSHIP_REACTIVATED",
  "RELATIONSHIP_UNINSTALLED",
  "SUBSCRIPTION_APPROACHING_CAPPED_AMOUNT",
  "SUBSCRIPTION_CAPPED_AMOUNT_UPDATED",
  "SUBSCRIPTION_CHARGE_ACCEPTED",
  "SUBSCRIPTION_CHARGE_ACTIVATED",
  "SUBSCRIPTION_CHARGE_CANCELED",
  "SUBSCRIPTION_CHARGE_DECLINED",
  "SUBSCRIPTION_CHARGE_EXPIRED",
  "SUBSCRIPTION_CHARGE_FROZEN",
  "SUBSCRIPTION_CHARGE_UNFROZEN",
  "USAGE_CHARGE_APPLIED",
]);

const transactionTypeSchema = s.stringEnum("A Shopify Partner transaction type.", [
  "APP_ONE_TIME_SALE",
  "APP_SALE_ADJUSTMENT",
  "APP_SALE_CREDIT",
  "APP_SUBSCRIPTION_SALE",
  "APP_USAGE_SALE",
  "LEGACY",
  "REFERRAL",
  "REFERRAL_ADJUSTMENT",
  "SERVICE_SALE",
  "SERVICE_SALE_ADJUSTMENT",
  "TAX",
  "THEME_SALE",
  "THEME_SALE_ADJUSTMENT",
]);

const connectionPageInfoSchema = s.object("Shopify Partner pagination information.", {
  hasNextPage: s.boolean("Whether more pages exist after the current page."),
  hasPreviousPage: s.boolean("Whether pages exist before the current page."),
});

const historicalEventsPageInfoSchema = s.object("Shopify Partner historical event pagination information.", {
  hasNextPage: s.boolean("Whether more historical event pages exist after the current page."),
  hasPreviousPage: s.boolean("Whether historical event pages exist before the current page."),
  startCursor: s.nullable(cursorSchema),
  endCursor: s.nullable(cursorSchema),
});

const shopReferenceSchema = s.object("A Shopify Partner shop reference.", {
  id: graphQlIdSchema,
  name: s.string("The Shopify shop name."),
  myshopifyDomain: s.string("The shop myshopify.com domain."),
});

const appSchema = s.object("A Shopify Partner app.", {
  id: graphQlIdSchema,
  name: s.string("The Shopify app name."),
  apiKey: s.string("The Shopify app API key identifier."),
  raw: rawObjectSchema,
});

const partnerEventSchema = s.object(
  "A normalized Shopify Partner historical event.",
  {
    id: graphQlIdSchema,
    eventType: eventTypeSchema,
    occurredAt: dateTimeSchema,
    shop: s.nullable(shopReferenceSchema),
    subjectType: optionalStringSchema("The GraphQL typename for the event subject when returned."),
    subjectId: optionalStringSchema("The subject ID when returned by Shopify."),
    subjectName: optionalStringSchema("The subject name when returned by Shopify."),
    cursor: s.nullable(cursorSchema),
    raw: rawObjectSchema,
  },
  { optional: ["subjectType", "subjectId", "subjectName"] },
);

const appEventSchema = s.object(
  "A normalized Shopify Partner app event.",
  {
    type: appEventTypeSchema,
    occurredAt: dateTimeSchema,
    app: appSchema,
    shop: shopReferenceSchema,
    cursor: s.nullable(cursorSchema),
    raw: rawObjectSchema,
  },
  { optional: ["cursor"] },
);

const transactionSchema = s.object(
  "A normalized Shopify Partner transaction.",
  {
    id: graphQlIdSchema,
    createdAt: dateTimeSchema,
    type: optionalStringSchema("The GraphQL typename for the transaction subtype."),
    cursor: s.nullable(cursorSchema),
    raw: rawObjectSchema,
  },
  { optional: ["type"] },
);

const eventFilterSchema = s.object(
  "Filter criteria for Shopify Partner historical events.",
  {
    eventTypes: s.array("Historical event types to include.", eventTypeSchema),
    occurredAtMin: dateTimeSchema,
    occurredAtMax: dateTimeSchema,
    shopId: graphQlIdSchema,
    subjectId: graphQlIdSchema,
    subjectType: subjectTypeSchema,
  },
  { optional: ["eventTypes", "occurredAtMin", "occurredAtMax", "shopId", "subjectId", "subjectType"] },
);

const listPartnerEventsInputSchema = s.object(
  "Arguments for listing Shopify Partner historical events.",
  {
    first: firstWithDefaultSchema,
    after: cursorSchema,
    filter: eventFilterSchema,
    orderBy: eventOrderSchema,
  },
  { optional: ["first", "after", "filter", "orderBy"] },
);

const listTransactionsInputSchema = s.object(
  "Arguments for listing Shopify Partner transactions.",
  {
    first: firstWithDefaultSchema,
    after: cursorSchema,
    appId: graphQlIdSchema,
    createdAtMin: dateTimeSchema,
    createdAtMax: dateTimeSchema,
    myshopifyDomain: s.string("A myshopify.com domain used to filter transactions.", { minLength: 1 }),
    shopId: graphQlIdSchema,
    types: s.array("Transaction types to include.", transactionTypeSchema),
  },
  { optional: ["first", "after", "appId", "createdAtMin", "createdAtMax", "myshopifyDomain", "shopId", "types"] },
);

const listAppEventsInputSchema = s.object(
  "Arguments for listing events for a Shopify Partner app.",
  {
    appId: graphQlIdSchema,
    first: firstWithDefaultSchema,
    after: cursorSchema,
    chargeId: graphQlIdSchema,
    occurredAtMin: dateTimeSchema,
    occurredAtMax: dateTimeSchema,
    shopId: graphQlIdSchema,
    types: s.array("App event types to include.", appEventTypeSchema),
  },
  { optional: ["first", "after", "chargeId", "occurredAtMin", "occurredAtMax", "shopId", "types"] },
);

export const shopifyPartnerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_app",
    description: "Retrieve one Shopify Partner app by GraphQL global ID.",
    inputSchema: s.object("The Shopify Partner app lookup input.", { id: graphQlIdSchema }, { required: ["id"] }),
    outputSchema: s.object("The Shopify Partner app response.", {
      app: s.nullable(appSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_app_events",
    description: "List app events for a Shopify Partner app.",
    inputSchema: listAppEventsInputSchema,
    outputSchema: s.object("The Shopify Partner app events response.", {
      app: s.nullable(appSchema),
      events: s.array("The returned Shopify Partner app events.", appEventSchema),
      pageInfo: connectionPageInfoSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_partner_events",
    description: "List historical Shopify Partner events for the authenticated organization.",
    inputSchema: listPartnerEventsInputSchema,
    outputSchema: s.object("The Shopify Partner historical events response.", {
      events: s.array("The returned Shopify Partner events.", partnerEventSchema),
      pageInfo: historicalEventsPageInfoSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_transactions",
    description: "List transactions that impact Shopify Partner earnings.",
    inputSchema: listTransactionsInputSchema,
    outputSchema: s.object("The Shopify Partner transactions response.", {
      transactions: s.array("The returned Shopify Partner transactions.", transactionSchema),
      pageInfo: connectionPageInfoSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "execute_graphql",
    description:
      "Execute a JSON-friendly Shopify Partner GraphQL query or mutation against the connected organization.",
    inputSchema: s.object(
      "The Shopify Partner GraphQL request payload.",
      {
        query: s.string("The GraphQL document to execute.", { minLength: 1 }),
        variables: s.record("GraphQL variables keyed by variable name.", s.unknown("A variable.")),
      },
      { optional: ["variables"] },
    ),
    outputSchema: s.object(
      "The raw Shopify Partner GraphQL response data and extensions.",
      {
        data: rawObjectSchema,
        extensions: rawObjectSchema,
      },
      { optional: ["extensions"] },
    ),
  }),
];
