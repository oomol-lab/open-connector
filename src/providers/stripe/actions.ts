import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { stripeConnectReadWriteScope } from "./scopes.ts";

const service = "stripe";

interface StripeActionSource {
  name: StripeActionName;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const rawStripeObject = s.looseObject({}, { description: "A raw Stripe object returned by the API." });
const rawStripeList = s.object(
  {
    object: s.string({ description: "The Stripe response object type." }),
    url: s.string({ description: "The Stripe API URL for this list." }),
    has_more: s.boolean({ description: "Whether more objects are available after this page." }),
    data: s.array(rawStripeObject, { description: "Stripe objects returned on this page." }),
  },
  { required: ["object", "url", "has_more", "data"], description: "A Stripe list response." },
);
const metadata = s.record(s.union([s.string(), s.number(), s.boolean()]), {
  description: "Stripe metadata key-value pairs. Values are forwarded as strings, numbers, booleans, or empty strings.",
});
const address = s.object(
  {
    city: s.string({ description: "City, district, suburb, town, or village." }),
    country: s.string({ description: "Two-letter country code, or a freeform country value where Stripe allows it." }),
    line1: s.string({ description: "Address line 1, such as the street, PO Box, or company name." }),
    line2: s.string({ description: "Address line 2, such as the apartment, suite, unit, or building." }),
    postal_code: s.string({ description: "ZIP or postal code." }),
    state: s.string({ description: "State, county, province, or region." }),
  },
  { description: "A Stripe address object." },
);
const createdFilter = s.object(
  {
    gt: s.integer({ description: "Return objects created after this Unix timestamp, exclusive." }),
    gte: s.integer({ description: "Return objects created after or at this Unix timestamp." }),
    lt: s.integer({ description: "Return objects created before this Unix timestamp, exclusive." }),
    lte: s.integer({ description: "Return objects created before or at this Unix timestamp." }),
  },
  { description: "A Stripe created timestamp interval filter." },
);
const recurring = s.object(
  {
    interval: s.stringEnum(["day", "week", "month", "year"], { description: "The billing frequency interval." }),
    interval_count: s.integer({ description: "The number of intervals between subscription billings." }),
    usage_type: s.stringEnum(["licensed", "metered"], { description: "How usage is billed for this price." }),
  },
  { required: ["interval"], description: "Recurring billing configuration for a Stripe price." },
);
const customUnitAmount = s.object(
  {
    enabled: s.literal(true, { description: "Whether customer-defined pricing is enabled for this price." }),
    minimum: s.integer({ description: "The minimum allowed amount in the smallest currency unit." }),
    maximum: s.integer({ description: "The maximum allowed amount in the smallest currency unit." }),
    preset: s.integer({ description: "The suggested amount in the smallest currency unit." }),
  },
  {
    required: ["enabled"],
    description: "Custom unit amount configuration that lets the payer choose the price amount.",
  },
);
const productData = s.object(
  {
    name: nonEmptyString("The product's display name."),
    active: s.boolean({ description: "Whether the product is available for purchase." }),
    metadata,
    statement_descriptor: s.string({
      maxLength: 22,
      description: "Statement descriptor for subscription payments.",
    }),
    tax_code: s.string({ description: "Stripe tax code ID for this product." }),
    unit_label: s.string({ maxLength: 12, description: "A label that represents units of this product." }),
  },
  { required: ["name"], description: "Inline product data for creating a product while creating a price." },
);

const paginationInput = {
  limit: s.integer({
    minimum: 1,
    maximum: 100,
    description: "The maximum number of objects to return. Stripe accepts values from 1 to 100.",
  }),
  starting_after: stripeId("A cursor object ID that fetches the next page after that object."),
  ending_before: stripeId("A cursor object ID that fetches the previous page before that object."),
};

const customerPayload = {
  name: s.string({ maxLength: 256, description: "The customer's full name or business name." }),
  email: s.email("The customer's email address."),
  description: s.string({ description: "An arbitrary customer description displayed in the Stripe Dashboard." }),
  phone: s.string({ maxLength: 20, description: "The customer's phone number." }),
  balance: s.integer({ description: "The customer balance in the smallest currency unit." }),
  address,
  metadata,
  tax_exempt: s.stringEnum(["none", "exempt", "reverse"], { description: "The customer's tax exemption status." }),
};

const productPayload = {
  name: nonEmptyString("The product's display name."),
  active: s.boolean({ description: "Whether the product is available for purchase." }),
  description: s.string({ description: "The product description." }),
  id: s.string({ description: "A caller-supplied product ID. Stripe normally generates this when omitted." }),
  images: s.array(s.url("One public product image URL."), {
    maxItems: 8,
    description: "Public image URLs for the product.",
  }),
  metadata,
  shippable: s.boolean({ description: "Whether this product is shipped as a physical good." }),
  statement_descriptor: s.string({ maxLength: 22, description: "Statement descriptor for subscription payments." }),
  tax_code: s.string({ description: "Stripe tax code ID for this product." }),
  unit_label: s.string({ maxLength: 12, description: "A label that represents units of this product." }),
  url: s.url("A publicly accessible product webpage URL."),
};

const pricePayload = {
  currency: s.string({
    minLength: 3,
    maxLength: 3,
    description: "Three-letter ISO currency code in lowercase.",
  }),
  product: stripeId("The Stripe product ID this price belongs to."),
  product_data: productData,
  unit_amount: s.integer({ description: "Unit amount in the smallest currency unit." }),
  unit_amount_decimal: s.string({ description: "Decimal unit amount in the smallest currency unit." }),
  custom_unit_amount: customUnitAmount,
  active: s.boolean({ description: "Whether the price can be used for new purchases." }),
  lookup_key: s.string({
    maxLength: 200,
    description: "A lookup key used to retrieve this price dynamically.",
  }),
  metadata,
  nickname: s.string({ description: "A brief internal description of the price." }),
  recurring,
  tax_behavior: s.stringEnum(["exclusive", "inclusive", "unspecified"], {
    description: "How Stripe should handle tax for this price.",
  }),
};

const customerOutput = output("A Stripe customer result.", { customer: s.nullable(rawStripeObject) });
const productOutput = output("A Stripe product result.", { product: s.nullable(rawStripeObject) });
const priceOutput = output("A Stripe price result.", { price: s.nullable(rawStripeObject) });
const deletedOutput = output("A Stripe delete result.", {
  deleted: s.boolean({ description: "Whether Stripe deleted the object." }),
  object: s.string({ description: "The deleted Stripe object type." }),
  id: s.string({ description: "The deleted Stripe object ID." }),
  raw: rawStripeObject,
});

const actions: StripeActionSource[] = [
  action(
    "identify_account",
    "Retrieve the Stripe account associated with the current secret API key.",
    input("No input is required to identify a Stripe account.", {}),
    output("Stripe account metadata.", {
      account: rawStripeObject,
      accountId: s.nullable(s.string({ description: "The Stripe account ID." })),
      email: s.nullable(s.string({ description: "The Stripe account email address." })),
      country: s.nullable(s.string({ description: "The Stripe account country." })),
      defaultCurrency: s.nullable(s.string({ description: "The Stripe account default currency." })),
    }),
  ),
  action(
    "create_customer",
    "Create a Stripe customer with common profile and metadata fields.",
    input("Input for creating a Stripe customer.", customerPayload),
    customerOutput,
  ),
  action(
    "update_customer",
    "Update a Stripe customer with common profile and metadata fields.",
    input(
      "Input for updating a Stripe customer.",
      {
        customerId: stripeId("The Stripe customer ID to update."),
        ...customerPayload,
      },
      ["customerId"],
    ),
    customerOutput,
  ),
  action(
    "get_customer",
    "Retrieve a Stripe customer by ID.",
    input(
      "Input for retrieving a Stripe customer.",
      {
        customerId: stripeId("The Stripe customer ID to retrieve."),
      },
      ["customerId"],
    ),
    customerOutput,
  ),
  action(
    "list_customers",
    "List Stripe customers with optional email, created timestamp, and cursor filters.",
    input("Input for listing Stripe customers.", {
      ...paginationInput,
      email: s.email("Filter customers by an exact, case-sensitive email address."),
      created: createdFilter,
    }),
    output("Stripe customers page.", { customers: rawStripeList }),
  ),
  action(
    "search_customers",
    "Search Stripe customers with Stripe's search query syntax.",
    input(
      "Input for searching Stripe customers.",
      {
        query: nonEmptyString("A Stripe customer search query, such as email:'jenny@example.com'."),
        limit: paginationInput.limit,
        page: s.string({ description: "A Stripe search pagination token returned by a previous search response." }),
      },
      ["query"],
    ),
    output("Stripe customer search results.", { customers: rawStripeList }),
  ),
  action(
    "delete_customer",
    "Delete a Stripe customer by ID.",
    input(
      "Input for deleting a Stripe customer.",
      {
        customerId: stripeId("The Stripe customer ID to delete."),
      },
      ["customerId"],
    ),
    deletedOutput,
  ),
  action(
    "create_product",
    "Create a Stripe product with common catalog fields.",
    input("Input for creating a Stripe product.", productPayload, ["name"]),
    productOutput,
  ),
  action(
    "update_product",
    "Update a Stripe product with common catalog fields.",
    input(
      "Input for updating a Stripe product.",
      {
        productId: stripeId("The Stripe product ID to update."),
        ...productPayload,
      },
      ["productId"],
    ),
    productOutput,
  ),
  action(
    "get_product",
    "Retrieve a Stripe product by ID.",
    input(
      "Input for retrieving a Stripe product.",
      {
        productId: stripeId("The Stripe product ID to retrieve."),
      },
      ["productId"],
    ),
    productOutput,
  ),
  action(
    "list_products",
    "List Stripe products with optional active and cursor filters.",
    input("Input for listing Stripe products.", {
      ...paginationInput,
      active: s.boolean({ description: "Filter products by active status." }),
      ids: s.array(stripeId("A Stripe product ID."), { description: "Filter products by Stripe product IDs." }),
      created: createdFilter,
    }),
    output("Stripe products page.", { products: rawStripeList }),
  ),
  action(
    "search_products",
    "Search Stripe products with Stripe's search query syntax.",
    input(
      "Input for searching Stripe products.",
      {
        query: nonEmptyString("A Stripe product search query, such as active:'true'."),
        limit: paginationInput.limit,
        page: s.string({ description: "A Stripe search pagination token returned by a previous search response." }),
      },
      ["query"],
    ),
    output("Stripe product search results.", { products: rawStripeList }),
  ),
  action(
    "delete_product",
    "Delete a Stripe product by ID.",
    input(
      "Input for deleting a Stripe product.",
      {
        productId: stripeId("The Stripe product ID to delete."),
      },
      ["productId"],
    ),
    deletedOutput,
  ),
  action(
    "create_price",
    "Create a Stripe one-time or recurring price for an existing or inline product.",
    input("Input for creating a Stripe price.", pricePayload, ["currency"]),
    priceOutput,
  ),
  action(
    "update_price",
    "Update mutable fields on a Stripe price.",
    input(
      "Input for updating a Stripe price.",
      {
        priceId: stripeId("The Stripe price ID to update."),
        active: pricePayload.active,
        lookup_key: pricePayload.lookup_key,
        metadata,
        nickname: pricePayload.nickname,
        tax_behavior: pricePayload.tax_behavior,
      },
      ["priceId"],
    ),
    priceOutput,
  ),
  action(
    "get_price",
    "Retrieve a Stripe price by ID.",
    input(
      "Input for retrieving a Stripe price.",
      {
        priceId: stripeId("The Stripe price ID to retrieve."),
      },
      ["priceId"],
    ),
    priceOutput,
  ),
  action(
    "list_prices",
    "List Stripe prices with optional product, active, type, and cursor filters.",
    input("Input for listing Stripe prices.", {
      ...paginationInput,
      active: s.boolean({ description: "Filter prices by active status." }),
      currency: s.string({
        minLength: 3,
        maxLength: 3,
        description: "Filter prices by three-letter ISO currency code in lowercase.",
      }),
      product: stripeId("Filter prices by Stripe product ID."),
      type: s.stringEnum(["one_time", "recurring"], { description: "Filter prices by one-time or recurring type." }),
      created: createdFilter,
    }),
    output("Stripe prices page.", { prices: rawStripeList }),
  ),
  action(
    "search_prices",
    "Search Stripe prices with Stripe's search query syntax.",
    input(
      "Input for searching Stripe prices.",
      {
        query: nonEmptyString("A Stripe price search query, such as active:'true'."),
        limit: paginationInput.limit,
        page: s.string({ description: "A Stripe search pagination token returned by a previous search response." }),
      },
      ["query"],
    ),
    output("Stripe price search results.", { prices: rawStripeList }),
  ),
];

export type StripeActionName =
  | "identify_account"
  | "create_customer"
  | "update_customer"
  | "get_customer"
  | "list_customers"
  | "search_customers"
  | "delete_customer"
  | "create_product"
  | "update_product"
  | "get_product"
  | "list_products"
  | "search_products"
  | "delete_product"
  | "create_price"
  | "update_price"
  | "get_price"
  | "list_prices"
  | "search_prices";

export const stripeActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    name: source.name,
    description: source.description,
    requiredScopes: [stripeConnectReadWriteScope],
    providerPermissions: [stripeConnectReadWriteScope],
    inputSchema: source.inputSchema,
    outputSchema: source.outputSchema,
  }),
);

function action(
  name: StripeActionName,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): StripeActionSource {
  return { name, description, inputSchema, outputSchema };
}

function input(description: string, properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, description);
}

function output(description: string, properties: Record<string, JsonSchema>): JsonSchema {
  return s.actionOutput(properties, description);
}

function nonEmptyString(description: string): JsonSchema {
  return s.nonEmptyString(description);
}

function stripeId(description: string): JsonSchema {
  return nonEmptyString(description);
}
