import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lemon_squeezy";

const pageNumberSchema = s.positiveInteger("Page number to return.");
const pageSizeSchema = s.integer("Number of items to return per page.", {
  minimum: 1,
  maximum: 100,
});
const storeIdSchema = s.positiveInteger("The Lemon Squeezy store ID.");
const productIdSchema = s.positiveInteger("The Lemon Squeezy product ID.");
const orderIdSchema = s.positiveInteger("The Lemon Squeezy order ID.");
const orderItemIdSchema = s.positiveInteger("The Lemon Squeezy order item ID.");
const variantIdSchema = s.positiveInteger("The Lemon Squeezy variant ID.");
const customerIdSchema = s.nonEmptyString("The Lemon Squeezy customer ID.");
const webhookIdSchema = s.nonEmptyString("The Lemon Squeezy webhook ID.");
const jsonApiResourceSchema = s.looseObject("A Lemon Squeezy JSON:API resource object.");
const metaSchema = s.looseObject("Top-level metadata returned by Lemon Squeezy.");
const linksSchema = s.record("Top-level document links returned by Lemon Squeezy.", s.string("Document link URL."));
const jsonApiSchema = s.looseObject("JSON:API metadata returned by Lemon Squeezy.");
const webhookEventSchema = s.stringEnum("A Lemon Squeezy webhook event type.", [
  "customer_updated",
  "order_created",
  "order_refunded",
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_payment_success",
  "subscription_payment_failed",
  "subscription_payment_recovered",
  "subscription_payment_refunded",
  "license_key_created",
  "license_key_updated",
  "affiliate_activated",
]);

function listOutputSchema(resourceKey: string, description: string): JsonSchema {
  return s.object(
    "Lemon Squeezy list response.",
    {
      [resourceKey]: s.array(description, jsonApiResourceSchema),
      meta: metaSchema,
      links: linksSchema,
      jsonapi: jsonApiSchema,
    },
    { optional: ["meta", "links", "jsonapi"] },
  );
}

function singleOutputSchema(resourceKey: string, description: string): JsonSchema {
  return s.object(
    "Lemon Squeezy single-resource response.",
    {
      [resourceKey]: {
        ...jsonApiResourceSchema,
        description,
      },
      meta: metaSchema,
      links: linksSchema,
      jsonapi: jsonApiSchema,
    },
    { optional: ["meta", "links", "jsonapi"] },
  );
}

function withPagination(properties: Record<string, JsonSchema>, optional: string[] = []): JsonSchema {
  return s.object(
    {
      ...properties,
      pageNumber: pageNumberSchema,
      pageSize: pageSizeSchema,
    },
    { optional: [...optional, "pageNumber", "pageSize"] },
  );
}

const retrieveStoreInputSchema = s.object("Input for retrieving a single store.", {
  storeId: storeIdSchema,
});

const listProductsInputSchema = withPagination({ storeId: storeIdSchema }, ["storeId"]);

const listVariantsInputSchema = withPagination(
  {
    productId: productIdSchema,
    status: s.stringEnum("Only return variants with this status.", ["pending", "draft", "published"]),
  },
  ["productId", "status"],
);

const listOrdersInputSchema = withPagination(
  {
    storeId: storeIdSchema,
    userEmail: s.email("Only return orders whose user_email matches this address."),
    orderNumber: s.positiveInteger("Only return the order with this order number."),
  },
  ["storeId", "userEmail", "orderNumber"],
);

const listSubscriptionsInputSchema = withPagination(
  {
    storeId: storeIdSchema,
    orderId: orderIdSchema,
    orderItemId: orderItemIdSchema,
    productId: productIdSchema,
    variantId: variantIdSchema,
    userEmail: s.email("Only return subscriptions whose user_email matches this address."),
    status: s.nonEmptyString("Only return subscriptions with this status."),
  },
  ["storeId", "orderId", "orderItemId", "productId", "variantId", "userEmail", "status"],
);

const listCustomersInputSchema = withPagination(
  {
    storeId: storeIdSchema,
    email: s.email("Only return customers for this email."),
  },
  ["storeId", "email"],
);

const retrieveCustomerInputSchema = s.object("Input for retrieving a single customer.", {
  customerId: customerIdSchema,
});

const createCustomerInputSchema = s.object(
  "Input for creating a customer.",
  {
    storeId: storeIdSchema,
    name: s.nonEmptyString("Full name of the customer."),
    email: s.email("Email address of the customer."),
    city: s.nonEmptyString("City of the customer."),
    region: s.nonEmptyString("Region or state of the customer."),
    country: s.string("ISO 3166-1 alpha-2 country code of the customer.", {
      minLength: 2,
      maxLength: 2,
    }),
  },
  { optional: ["city", "region", "country"] },
);

const updateCustomerInputSchema = s.object(
  "Input for updating a customer.",
  {
    customerId: customerIdSchema,
    name: s.nonEmptyString("Updated full name of the customer."),
    email: s.email("Updated email address of the customer."),
    city: s.nonEmptyString("Updated city of the customer."),
    region: s.nonEmptyString("Updated region or state of the customer."),
    country: s.string("Updated ISO 3166-1 alpha-2 country code of the customer.", {
      minLength: 2,
      maxLength: 2,
    }),
  },
  { optional: ["name", "email", "city", "region", "country"] },
);
updateCustomerInputSchema.anyOf = [
  { required: ["name"] },
  { required: ["email"] },
  { required: ["city"] },
  { required: ["region"] },
  { required: ["country"] },
];

const listWebhooksInputSchema = withPagination({ storeId: storeIdSchema }, ["storeId"]);

const retrieveWebhookInputSchema = s.object("Input for retrieving a single webhook.", {
  webhookId: webhookIdSchema,
});

const createWebhookInputSchema = s.object("Input for creating a webhook.", {
  storeId: storeIdSchema,
  url: s.url("Webhook endpoint URL."),
  events: s.array("Webhook events that should trigger deliveries.", webhookEventSchema, { minItems: 1 }),
  secret: s.nonEmptyString("Signing secret used to verify webhook deliveries."),
});

const updateWebhookInputSchema = s.object(
  "Input for updating a webhook.",
  {
    webhookId: webhookIdSchema,
    storeId: storeIdSchema,
    url: s.url("Updated webhook endpoint URL."),
    events: s.array("Updated webhook events.", webhookEventSchema, { minItems: 1 }),
    secret: s.nonEmptyString("Updated signing secret for webhook deliveries."),
  },
  { optional: ["storeId", "url", "events", "secret"] },
);
updateWebhookInputSchema.anyOf = [
  { required: ["storeId"] },
  { required: ["url"] },
  { required: ["events"] },
  { required: ["secret"] },
];

const deleteWebhookInputSchema = s.object("Input for deleting a webhook.", {
  webhookId: webhookIdSchema,
});

export const lemonSqueezyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "retrieve_authenticated_user",
    description: "Retrieve the currently authenticated Lemon Squeezy user.",
    requiredScopes: [],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: singleOutputSchema("user", "The authenticated Lemon Squeezy user."),
  }),
  defineProviderAction(service, {
    name: "list_stores",
    description: "List stores that belong to the authenticated Lemon Squeezy account.",
    requiredScopes: [],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: listOutputSchema("stores", "Stores returned by Lemon Squeezy."),
  }),
  defineProviderAction(service, {
    name: "retrieve_store",
    description: "Retrieve a single Lemon Squeezy store by ID.",
    requiredScopes: [],
    inputSchema: retrieveStoreInputSchema,
    outputSchema: singleOutputSchema("store", "The requested Lemon Squeezy store."),
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List Lemon Squeezy products with optional store filtering and pagination.",
    requiredScopes: [],
    inputSchema: listProductsInputSchema,
    outputSchema: listOutputSchema("products", "Products returned by Lemon Squeezy."),
  }),
  defineProviderAction(service, {
    name: "list_variants",
    description: "List Lemon Squeezy variants with optional product filtering and pagination.",
    requiredScopes: [],
    inputSchema: listVariantsInputSchema,
    outputSchema: listOutputSchema("variants", "Variants returned by Lemon Squeezy."),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    description: "List Lemon Squeezy orders with optional store, email, or order-number filtering.",
    requiredScopes: [],
    inputSchema: listOrdersInputSchema,
    outputSchema: listOutputSchema("orders", "Orders returned by Lemon Squeezy."),
  }),
  defineProviderAction(service, {
    name: "list_subscriptions",
    description: "List Lemon Squeezy subscriptions with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: listSubscriptionsInputSchema,
    outputSchema: listOutputSchema("subscriptions", "Subscriptions returned by Lemon Squeezy."),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List Lemon Squeezy customers with optional store or email filtering.",
    requiredScopes: [],
    inputSchema: listCustomersInputSchema,
    outputSchema: listOutputSchema("customers", "Customers returned by Lemon Squeezy."),
  }),
  defineProviderAction(service, {
    name: "retrieve_customer",
    description: "Retrieve a single Lemon Squeezy customer by ID.",
    requiredScopes: [],
    inputSchema: retrieveCustomerInputSchema,
    outputSchema: singleOutputSchema("customer", "The requested Lemon Squeezy customer."),
  }),
  defineProviderAction(service, {
    name: "create_customer",
    description: "Create a Lemon Squeezy customer for the specified store.",
    requiredScopes: [],
    inputSchema: createCustomerInputSchema,
    outputSchema: singleOutputSchema("customer", "The created Lemon Squeezy customer."),
  }),
  defineProviderAction(service, {
    name: "update_customer",
    description: "Update a Lemon Squeezy customer by ID.",
    requiredScopes: [],
    inputSchema: updateCustomerInputSchema,
    outputSchema: singleOutputSchema("customer", "The updated Lemon Squeezy customer."),
  }),
  defineProviderAction(service, {
    name: "list_webhooks",
    description: "List Lemon Squeezy webhooks with optional store filtering and pagination.",
    requiredScopes: [],
    inputSchema: listWebhooksInputSchema,
    outputSchema: listOutputSchema("webhooks", "Webhooks returned by Lemon Squeezy."),
  }),
  defineProviderAction(service, {
    name: "retrieve_webhook",
    description: "Retrieve a single Lemon Squeezy webhook by ID.",
    requiredScopes: [],
    inputSchema: retrieveWebhookInputSchema,
    outputSchema: singleOutputSchema("webhook", "The requested Lemon Squeezy webhook."),
  }),
  defineProviderAction(service, {
    name: "create_webhook",
    description: "Create a Lemon Squeezy webhook for the specified store.",
    requiredScopes: [],
    inputSchema: createWebhookInputSchema,
    outputSchema: singleOutputSchema("webhook", "The created Lemon Squeezy webhook."),
  }),
  defineProviderAction(service, {
    name: "update_webhook",
    description: "Update a Lemon Squeezy webhook by ID.",
    requiredScopes: [],
    inputSchema: updateWebhookInputSchema,
    outputSchema: singleOutputSchema("webhook", "The updated Lemon Squeezy webhook."),
  }),
  defineProviderAction(service, {
    name: "delete_webhook",
    description:
      "Delete a Lemon Squeezy webhook by ID. The returned acknowledgement is generated locally because Lemon Squeezy responds with 204 No Content.",
    requiredScopes: [],
    inputSchema: deleteWebhookInputSchema,
    outputSchema: s.object("Connector-generated webhook deletion acknowledgement.", {
      success: s.boolean("Whether the delete request completed successfully."),
      message: s.string("Deletion acknowledgement because Lemon Squeezy returns 204 No Content."),
    }),
  }),
];
