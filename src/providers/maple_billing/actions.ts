import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "maple_billing";

const idSchema = s.nonEmptyString("A Measure resource identifier.");
const customerIdSchema = s.nonEmptyString("A Measure customer ID or external customer identifier.");
const idempotencyKeySchema = s.nonEmptyString(
  "The optional Measure Idempotency-Key header value for mutation requests.",
);
const metadataSchema = s.looseObject("Metadata key-value pairs forwarded to Measure.");
const rawObjectSchema = s.looseObject("The raw object returned by Measure.");

const paginationInputSchema = s.object(
  "Measure pagination parameters.",
  {
    limit: s.integer("The maximum number of records to return.", { minimum: 0, maximum: 200 }),
    fromKey: s.nonEmptyString("The pagination cursor returned by a previous Measure find request."),
  },
  { optional: ["limit", "fromKey"] },
);

const paginationSchema = s.object("Measure pagination metadata.", {
  fromKey: s.nullableString("The cursor for the next page when Measure returns one."),
  limit: s.nullableInteger("The page size returned by Measure."),
  raw: rawObjectSchema,
});

const findInputSchema = s.object(
  "Measure find request parameters.",
  {
    pagination: paginationInputSchema,
    query: s.looseObject("Official Measure query criteria for this find endpoint."),
    sortKey: s.nonEmptyString("The official Measure sort_key value for this find endpoint."),
    includeMeta: s.boolean("Whether Measure should include additional pagination metadata."),
  },
  { optional: ["pagination", "query", "sortKey", "includeMeta"] },
);

const subscriptionFindInputSchema = s.object(
  "Measure subscription find request parameters.",
  {
    pagination: paginationInputSchema,
    query: s.looseObject("Official Measure subscription query criteria."),
    sortKey: s.nonEmptyString("The official Measure subscription sort_key value."),
    includeMeta: s.boolean("Whether Measure should include additional pagination metadata."),
  },
  { optional: ["pagination", "query", "includeMeta"] },
);

const customerSchema = s.object("A normalized Measure customer.", {
  id: idSchema,
  identifier: s.nullableString("The external customer identifier when returned by Measure."),
  displayName: s.nullableString("The computed customer display name."),
  email: s.nullableString("The customer email address."),
  orgName: s.nullableString("The customer's organization name."),
  status: s.nullableString("The customer status returned by Measure."),
  raw: rawObjectSchema,
});

const productSchema = s.object("A normalized Measure product.", {
  id: idSchema,
  name: s.nullableString("The Measure product name."),
  externalName: s.nullableString("The external product name returned by Measure."),
  state: s.nullableString("The product state returned by Measure."),
  raw: rawObjectSchema,
});

const productPricingSchema = s.object("A normalized Measure product pricing record.", {
  id: idSchema,
  productId: s.nullableString("The Measure product ID attached to this pricing record."),
  name: s.nullableString("The product pricing name returned by Measure."),
  currency: s.nullableString("The product pricing currency code."),
  state: s.nullableString("The product pricing state returned by Measure."),
  raw: rawObjectSchema,
});

const subscriptionSchema = s.object("A normalized Measure subscription.", {
  id: idSchema,
  customerId: s.nullableString("The Measure customer ID attached to this subscription."),
  status: s.nullableString("The subscription status returned by Measure."),
  currency: s.nullableString("The subscription currency code."),
  raw: rawObjectSchema,
});

const checkoutSessionSchema = s.object("A normalized Measure checkout session.", {
  id: idSchema,
  url: s.nullableString("The hosted checkout session URL when returned by Measure."),
  customerId: s.nullableString("The Measure customer ID attached to this checkout session."),
  status: s.nullableString("The checkout session status returned by Measure."),
  raw: rawObjectSchema,
});

const customerCreateInputSchema = s.object(
  "Customer fields for creating a Measure customer.",
  {
    identifier: s.nonEmptyString("A unique identifier that ties the customer back to your system."),
    email: s.email("The customer email address."),
    name: s.nonEmptyString("The customer name."),
    orgName: s.nonEmptyString("The organization this customer belongs to."),
    phone: s.nonEmptyString("The customer phone number."),
    title: s.nonEmptyString("The customer's title."),
    locale: s.nonEmptyString("The customer's locale."),
    address: s.looseObject("The official Measure customer address object."),
    billingEmails: s.array(
      "Additional email addresses to copy on customer invoices.",
      s.email("One billing email address."),
      {
        minItems: 1,
      },
    ),
    metadata: metadataSchema,
    tags: s.array("Tags to attach to the customer.", s.nonEmptyString("One customer tag."), { minItems: 1 }),
    ownerId: s.nonEmptyString("The company user ID assigned to manage this customer."),
    parentCustomerId: s.nonEmptyString("The parent customer ID for parent-child billing."),
    excludeFromMetrics: s.boolean("Whether Measure should exclude this customer from metrics."),
    childRollupBilling: s.boolean("Whether Measure should enable rollup billing for children."),
    idempotencyKey: idempotencyKeySchema,
  },
  {
    optional: [
      "email",
      "name",
      "orgName",
      "phone",
      "title",
      "locale",
      "address",
      "billingEmails",
      "metadata",
      "tags",
      "ownerId",
      "parentCustomerId",
      "excludeFromMetrics",
      "childRollupBilling",
      "idempotencyKey",
    ],
  },
);

const customerUpdateInputSchema = s.object(
  "Customer fields for updating a Measure customer.",
  {
    customerId: customerIdSchema,
    identifier: s.nonEmptyString("A unique identifier that ties the customer back to your system."),
    email: s.email("The customer email address."),
    name: s.nonEmptyString("The customer name."),
    orgName: s.nonEmptyString("The organization this customer belongs to."),
    phone: s.nonEmptyString("The customer phone number."),
    title: s.nonEmptyString("The customer's title."),
    locale: s.nonEmptyString("The customer's locale."),
    address: s.looseObject("The official Measure customer address object."),
    billingEmails: s.array(
      "Additional email addresses to copy on customer invoices.",
      s.email("One billing email address."),
      {
        minItems: 1,
      },
    ),
    metadata: metadataSchema,
    tags: s.array("Tags to attach to the customer.", s.nonEmptyString("One customer tag."), { minItems: 1 }),
    ownerId: s.nonEmptyString("The company user ID assigned to manage this customer."),
    parentCustomerId: s.nonEmptyString("The parent customer ID for parent-child billing."),
    excludeFromMetrics: s.boolean("Whether Measure should exclude this customer from metrics."),
    childRollupBilling: s.boolean("Whether Measure should enable rollup billing for children."),
    idempotencyKey: idempotencyKeySchema,
  },
  {
    optional: [
      "identifier",
      "email",
      "name",
      "orgName",
      "phone",
      "title",
      "locale",
      "address",
      "billingEmails",
      "metadata",
      "tags",
      "ownerId",
      "parentCustomerId",
      "excludeFromMetrics",
      "childRollupBilling",
      "idempotencyKey",
    ],
  },
);

const checkoutSessionCreateInputSchema = s.object(
  "Checkout session fields for creating a Measure hosted checkout link.",
  {
    customerId: customerIdSchema,
    configItems: s.array(
      "Subscription configuration items forwarded to Measure.",
      s.looseObject("One official Measure subscription config item."),
      {
        minItems: 1,
      },
    ),
    productPricingIds: s.array("Product pricing IDs that form the checkout session.", idSchema, { minItems: 1 }),
    bundlePricingId: s.nonEmptyString("The bundle pricing ID that forms the checkout session."),
    term: s.looseObject("The official Measure subscription term object."),
    trial: s.boolean("Whether the checkout session creates a trial subscription."),
    trialTerm: s.looseObject("The official Measure trial term object."),
    autoCharges: s.boolean("Whether the subscription is automatically charged after checkout."),
    autoRenews: s.boolean("Whether the subscription auto-renews at the end of the term."),
    metadata: metadataSchema,
    options: s.looseObject("Official Measure checkout session options."),
    discounts: s.array(
      "Discounts attached to the checkout session.",
      s.looseObject("One official Measure discount object."),
    ),
    onetimeItems: s.array(
      "One-time charges attached to the checkout session.",
      s.looseObject("One official Measure one-time item object."),
    ),
    previousSubscriptionId: s.nonEmptyString(
      "The existing subscription ID whose plan changes with this checkout session.",
    ),
    changeTiming: s.stringEnum("When Measure should apply a subscription plan change.", [
      "IMMEDIATE",
      "PERIOD_END",
      "RENEWAL",
    ]),
    changeProrationType: s.stringEnum("How Measure should prorate a subscription plan change.", [
      "NEXT",
      "IMMEDIATE",
      "NONE",
    ]),
    changeResetBillingAnchor: s.boolean(
      "Whether Measure should reset the billing anchor for a subscription plan change.",
    ),
    type: s.stringEnum("The Measure checkout session type.", ["CHECKOUT_SESSION"]),
    idempotencyKey: idempotencyKeySchema,
  },
  {
    required: ["customerId", "configItems"],
    optional: [
      "productPricingIds",
      "bundlePricingId",
      "term",
      "trial",
      "trialTerm",
      "autoCharges",
      "autoRenews",
      "metadata",
      "options",
      "discounts",
      "onetimeItems",
      "previousSubscriptionId",
      "changeTiming",
      "changeProrationType",
      "changeResetBillingAnchor",
      "type",
      "idempotencyKey",
    ],
  },
);

export const mapleBillingActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_customer",
    description: "Create a Measure customer from JSON-friendly fields.",
    inputSchema: customerCreateInputSchema,
    outputSchema: s.object("The normalized Measure customer creation response.", {
      customer: customerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_customer",
    description: "Update common fields on a Measure customer.",
    inputSchema: customerUpdateInputSchema,
    outputSchema: s.object("The normalized Measure customer update response.", {
      customer: customerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "find_customers",
    description: "Search Measure customers with pagination and official query criteria.",
    inputSchema: findInputSchema,
    outputSchema: s.object("The normalized Measure customer search response.", {
      customers: s.array("Customers returned by Measure.", customerSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Retrieve a Measure customer by ID or external identifier.",
    inputSchema: s.object("Path parameters for retrieving a Measure customer.", {
      customerId: customerIdSchema,
    }),
    outputSchema: s.object("The normalized Measure customer response.", {
      customer: customerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "find_products",
    description: "Search Measure products with pagination and official query criteria.",
    inputSchema: findInputSchema,
    outputSchema: s.object("The normalized Measure product search response.", {
      products: s.array("Products returned by Measure.", productSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Retrieve a Measure product by ID or external identifier.",
    inputSchema: s.object("Path parameters for retrieving a Measure product.", {
      productId: idSchema,
    }),
    outputSchema: s.object("The normalized Measure product response.", {
      product: productSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "find_product_pricing",
    description: "Search Measure product pricing records with official query criteria.",
    inputSchema: findInputSchema,
    outputSchema: s.object("The normalized Measure product pricing search response.", {
      productPricing: s.array("Product pricing records returned by Measure.", productPricingSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_product_pricing",
    description: "Retrieve a Measure product pricing record by ID or external identifier.",
    inputSchema: s.object("Path parameters for retrieving a Measure product pricing record.", {
      productPricingId: idSchema,
    }),
    outputSchema: s.object("The normalized Measure product pricing response.", {
      productPricing: productPricingSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "find_subscriptions",
    description: "Search Measure subscriptions with pagination and official query criteria.",
    inputSchema: subscriptionFindInputSchema,
    outputSchema: s.object("The normalized Measure subscription search response.", {
      subscriptions: s.array("Subscriptions returned by Measure.", subscriptionSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_subscription",
    description: "Retrieve a Measure subscription by ID or external identifier.",
    inputSchema: s.object("Path parameters for retrieving a Measure subscription.", {
      subscriptionId: idSchema,
    }),
    outputSchema: s.object("The normalized Measure subscription response.", {
      subscription: subscriptionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_checkout_session",
    description: "Create a Measure hosted checkout session link.",
    inputSchema: checkoutSessionCreateInputSchema,
    outputSchema: s.object("The normalized Measure checkout session creation response.", {
      checkoutSession: checkoutSessionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_checkout_session",
    description: "Retrieve a Measure checkout session by ID.",
    inputSchema: s.object("Path parameters for retrieving a Measure checkout session.", {
      checkoutSessionId: idSchema,
    }),
    outputSchema: s.object("The normalized Measure checkout session response.", {
      checkoutSession: checkoutSessionSchema,
    }),
  }),
];
