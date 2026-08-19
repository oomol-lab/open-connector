import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "polar";

const metadataValueSchema = s.anyOf("A Polar metadata filter value.", [
  s.string("A string metadata value."),
  s.integer("An integer metadata value."),
  s.boolean("A boolean metadata value."),
  s.array("String metadata values.", s.string("A string metadata value."), { minItems: 1 }),
  s.array("Integer metadata values.", s.integer("An integer metadata value."), { minItems: 1 }),
  s.array("Boolean metadata values.", s.boolean("A boolean metadata value."), { minItems: 1 }),
]);

const metadataQuerySchema = s.record("Metadata filters sent with Polar's deepObject query style.", metadataValueSchema);

const paginationInputFields = {
  page: s.integer("Page number, starting from 1.", { minimum: 1 }),
  limit: s.integer("Number of items to return per page. Polar supports up to 100.", {
    minimum: 1,
    maximum: 100,
  }),
};

const paginationOutputSchema = s.object("Polar pagination metadata.", {
  total_count: s.integer("Total number of items matching the request.", { minimum: 0 }),
  max_page: s.integer("Maximum page number available for this request.", { minimum: 0 }),
});

const polarObjectSchema = (description: string) => s.looseObject(description);

const listOutputSchema = (itemDescription: string, listDescription: string) =>
  s.object(listDescription, {
    items: s.array(`Polar ${itemDescription} returned for the requested page.`, polarObjectSchema(itemDescription)),
    pagination: paginationOutputSchema,
  });

const singleOutputSchema = (description: string) =>
  s.object(description, {
    payload: polarObjectSchema("The raw Polar resource payload."),
  });

const uuidArraySchema = (description: string) => s.array(description, s.uuid("A Polar UUID value."), { minItems: 1 });

const stringArraySchema = (description: string) =>
  s.array(description, s.nonEmptyString("A string filter value."), { minItems: 1 });

const productVisibilitySchema = s.stringEnum("Polar product visibility.", ["draft", "private", "public"]);

const productSortPropertySchema = s.stringEnum("A Polar product sorting field.", [
  "created_at",
  "-created_at",
  "name",
  "-name",
  "price_amount_type",
  "-price_amount_type",
  "price_amount",
  "-price_amount",
]);

const customerSortPropertySchema = s.stringEnum("A Polar customer sorting field.", [
  "created_at",
  "-created_at",
  "email",
  "-email",
  "name",
  "-name",
]);

const organizationSortPropertySchema = s.stringEnum("A Polar organization sorting field.", [
  "created_at",
  "-created_at",
  "slug",
  "-slug",
  "name",
  "-name",
  "next_review_threshold",
  "-next_review_threshold",
  "days_in_status",
  "-days_in_status",
]);

const orderSortPropertySchema = s.stringEnum("A Polar order sorting field.", [
  "created_at",
  "-created_at",
  "status",
  "-status",
  "invoice_number",
  "-invoice_number",
  "amount",
  "-amount",
  "net_amount",
  "-net_amount",
  "customer",
  "-customer",
  "product",
  "-product",
  "discount",
  "-discount",
  "subscription",
  "-subscription",
]);

const subscriptionSortPropertySchema = s.stringEnum("A Polar subscription sorting field.", [
  "customer",
  "-customer",
  "status",
  "-status",
  "started_at",
  "-started_at",
  "current_period_end",
  "-current_period_end",
  "ended_at",
  "-ended_at",
  "ends_at",
  "-ends_at",
  "amount",
  "-amount",
  "product",
  "-product",
  "discount",
  "-discount",
]);

const productBillingTypeSchema = s.stringEnum("Polar product billing type.", ["one_time", "recurring"]);

const subscriptionStatusSchema = s.stringEnum("Polar subscription status.", [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
]);

const customerCancellationReasonSchema = s.stringEnum("Polar customer cancellation reason.", [
  "customer_service",
  "low_quality",
  "missing_features",
  "switched_service",
  "too_complex",
  "too_expensive",
  "unused",
  "other",
]);

const organizationIdFilterSchema = s.anyOf("Filter by organization ID.", [
  s.uuid("A Polar organization ID."),
  uuidArraySchema("Polar organization IDs."),
]);

const productIdFilterSchema = s.anyOf("Filter by product ID.", [
  s.uuid("A Polar product ID."),
  uuidArraySchema("Polar product IDs."),
]);

const customerIdFilterSchema = s.anyOf("Filter by customer ID.", [
  s.uuid("A Polar customer ID."),
  uuidArraySchema("Polar customer IDs."),
]);

const externalCustomerIdFilterSchema = s.anyOf("Filter by customer external ID.", [
  s.nonEmptyString("A Polar customer external ID."),
  stringArraySchema("Polar customer external IDs."),
]);

const sortingSchema = (description: string, itemSchema: ReturnType<typeof s.stringEnum>) =>
  s.array(description, itemSchema, { minItems: 1 });

const listOrganizationsInputSchema = s.object(
  "Input parameters for listing Polar organizations.",
  {
    slug: s.nonEmptyString("Filter organizations by slug."),
    page: paginationInputFields.page,
    limit: paginationInputFields.limit,
    sorting: sortingSchema("Polar organization sorting fields.", organizationSortPropertySchema),
  },
  { optional: ["slug", "page", "limit", "sorting"] },
);

const listProductsInputSchema = s.object(
  "Input parameters for listing Polar products.",
  {
    id: s.anyOf("Filter by product ID.", [s.uuid("A Polar product ID."), uuidArraySchema("Polar product IDs.")]),
    organization_id: organizationIdFilterSchema,
    query: s.nonEmptyString("Filter by product name."),
    is_archived: s.boolean("Filter by archived products."),
    is_recurring: s.boolean("Filter by recurring products."),
    benefit_id: s.anyOf("Filter products granting a benefit.", [
      s.uuid("A Polar benefit ID."),
      uuidArraySchema("Polar benefit IDs."),
    ]),
    visibility: sortingSchema("Product visibility values to include.", productVisibilitySchema),
    page: paginationInputFields.page,
    limit: paginationInputFields.limit,
    sorting: sortingSchema("Polar product sorting fields.", productSortPropertySchema),
    metadata: metadataQuerySchema,
  },
  {
    optional: [
      "id",
      "organization_id",
      "query",
      "is_archived",
      "is_recurring",
      "benefit_id",
      "visibility",
      "page",
      "limit",
      "sorting",
      "metadata",
    ],
  },
);

const listCustomersInputSchema = s.object(
  "Input parameters for listing Polar customers.",
  {
    organization_id: organizationIdFilterSchema,
    email: s.email("Filter by exact customer email."),
    query: s.nonEmptyString("Filter by customer name, email, or external ID."),
    active: s.boolean("Filter by active customers."),
    page: paginationInputFields.page,
    limit: paginationInputFields.limit,
    sorting: sortingSchema("Polar customer sorting fields.", customerSortPropertySchema),
    metadata: metadataQuerySchema,
  },
  {
    optional: ["organization_id", "email", "query", "active", "page", "limit", "sorting", "metadata"],
  },
);

const listOrdersInputSchema = s.object(
  "Input parameters for listing Polar orders.",
  {
    organization_id: organizationIdFilterSchema,
    product_id: productIdFilterSchema,
    product_billing_type: s.anyOf("Filter by product billing type.", [
      productBillingTypeSchema,
      sortingSchema("Product billing types to include.", productBillingTypeSchema),
    ]),
    discount_id: s.anyOf("Filter by discount ID.", [
      s.uuid("A Polar discount ID."),
      uuidArraySchema("Polar discount IDs."),
    ]),
    customer_id: customerIdFilterSchema,
    external_customer_id: externalCustomerIdFilterSchema,
    checkout_id: s.anyOf("Filter by checkout ID.", [
      s.uuid("A Polar checkout ID."),
      uuidArraySchema("Polar checkout IDs."),
    ]),
    subscription_id: s.anyOf("Filter by subscription ID.", [
      s.uuid("A Polar subscription ID."),
      uuidArraySchema("Polar subscription IDs."),
    ]),
    page: paginationInputFields.page,
    limit: paginationInputFields.limit,
    sorting: sortingSchema("Polar order sorting fields.", orderSortPropertySchema),
    metadata: metadataQuerySchema,
  },
  {
    optional: [
      "organization_id",
      "product_id",
      "product_billing_type",
      "discount_id",
      "customer_id",
      "external_customer_id",
      "checkout_id",
      "subscription_id",
      "page",
      "limit",
      "sorting",
      "metadata",
    ],
  },
);

const listSubscriptionsInputSchema = s.object(
  "Input parameters for listing Polar subscriptions.",
  {
    organization_id: organizationIdFilterSchema,
    product_id: productIdFilterSchema,
    customer_id: customerIdFilterSchema,
    external_customer_id: externalCustomerIdFilterSchema,
    discount_id: s.anyOf("Filter by discount ID.", [
      s.uuid("A Polar discount ID."),
      uuidArraySchema("Polar discount IDs."),
    ]),
    active: s.boolean("Filter by active or inactive subscription. This Polar filter is deprecated upstream."),
    status: s.anyOf("Filter by subscription status.", [
      subscriptionStatusSchema,
      sortingSchema("Subscription statuses to include.", subscriptionStatusSchema),
    ]),
    cancel_at_period_end: s.boolean("Filter by subscriptions set to cancel at period end."),
    customer_cancellation_reason: s.anyOf("Filter by customer cancellation reason.", [
      customerCancellationReasonSchema,
      sortingSchema("Customer cancellation reasons to include.", customerCancellationReasonSchema),
    ]),
    canceled_at_after: s.dateTime("Filter by cancellation timestamp after or equal to this value."),
    canceled_at_before: s.dateTime("Filter by cancellation timestamp before or equal to this value."),
    page: paginationInputFields.page,
    limit: paginationInputFields.limit,
    sorting: sortingSchema("Polar subscription sorting fields.", subscriptionSortPropertySchema),
    metadata: metadataQuerySchema,
  },
  {
    optional: [
      "organization_id",
      "product_id",
      "customer_id",
      "external_customer_id",
      "discount_id",
      "active",
      "status",
      "cancel_at_period_end",
      "customer_cancellation_reason",
      "canceled_at_after",
      "canceled_at_before",
      "page",
      "limit",
      "sorting",
      "metadata",
    ],
  },
);

const idInputSchema = (description: string) =>
  s.object(description, {
    id: s.uuid("The Polar resource ID."),
  });

const externalIdInputSchema = (description: string) =>
  s.object(description, {
    external_id: s.nonEmptyString("The Polar customer external ID."),
  });

export const polarActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizations",
    description: "List Polar organizations accessible to the Organization Access Token.",
    requiredScopes: [],
    inputSchema: listOrganizationsInputSchema,
    outputSchema: listOutputSchema("organizations", "A page of Polar organizations."),
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Get a Polar organization by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("Input parameters for retrieving a Polar organization."),
    outputSchema: singleOutputSchema("A Polar organization response."),
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List Polar products with optional organization, name, visibility, and metadata filters.",
    requiredScopes: [],
    inputSchema: listProductsInputSchema,
    outputSchema: listOutputSchema("products", "A page of Polar products."),
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Get a Polar product by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("Input parameters for retrieving a Polar product."),
    outputSchema: singleOutputSchema("A Polar product response."),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List Polar customers with optional organization, email, search, activity, and metadata filters.",
    requiredScopes: [],
    inputSchema: listCustomersInputSchema,
    outputSchema: listOutputSchema("customers", "A page of Polar customers."),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Get a Polar customer by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("Input parameters for retrieving a Polar customer."),
    outputSchema: singleOutputSchema("A Polar customer response."),
  }),
  defineProviderAction(service, {
    name: "get_customer_by_external_id",
    description: "Get a Polar customer by external ID.",
    requiredScopes: [],
    inputSchema: externalIdInputSchema("Input parameters for retrieving a Polar customer by external ID."),
    outputSchema: singleOutputSchema("A Polar customer response."),
  }),
  defineProviderAction(service, {
    name: "get_customer_state",
    description: "Get a Polar customer state by customer ID, including subscriptions and benefits.",
    requiredScopes: [],
    inputSchema: idInputSchema("Input parameters for retrieving a Polar customer state."),
    outputSchema: singleOutputSchema("A Polar customer state response."),
  }),
  defineProviderAction(service, {
    name: "get_customer_state_by_external_id",
    description: "Get a Polar customer state by external customer ID, including subscriptions and benefits.",
    requiredScopes: [],
    inputSchema: externalIdInputSchema("Input parameters for retrieving a Polar customer state by external ID."),
    outputSchema: singleOutputSchema("A Polar customer state response."),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    description:
      "List Polar orders with optional organization, product, customer, checkout, subscription, and metadata filters.",
    requiredScopes: [],
    inputSchema: listOrdersInputSchema,
    outputSchema: listOutputSchema("orders", "A page of Polar orders."),
  }),
  defineProviderAction(service, {
    name: "get_order",
    description: "Get a Polar order by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("Input parameters for retrieving a Polar order."),
    outputSchema: singleOutputSchema("A Polar order response."),
  }),
  defineProviderAction(service, {
    name: "list_subscriptions",
    description:
      "List Polar subscriptions with optional organization, product, customer, status, cancellation, and metadata filters.",
    requiredScopes: [],
    inputSchema: listSubscriptionsInputSchema,
    outputSchema: listOutputSchema("subscriptions", "A page of Polar subscriptions."),
  }),
  defineProviderAction(service, {
    name: "get_subscription",
    description: "Get a Polar subscription by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("Input parameters for retrieving a Polar subscription."),
    outputSchema: singleOutputSchema("A Polar subscription response."),
  }),
];
