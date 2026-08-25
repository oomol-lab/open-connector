import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "paddle";

const stringList = (description: string, itemDescription: string) =>
  s.array(description, s.nonEmptyString(itemDescription));
const rawEntitySchema = s.looseObject("Raw Paddle entity returned by the API.");
const customDataSchema = s.nullable(
  s.record("Custom data attached to a Paddle entity.", s.unknown("A custom data value.")),
);
const productIdSchema = s.nonEmptyString("Paddle product ID, prefixed with `pro_`.");
const priceIdSchema = s.nonEmptyString("Paddle price ID, prefixed with `pri_`.");
const customerIdSchema = s.nonEmptyString("Paddle customer ID, prefixed with `ctm_`.");
const statusSchema = s.stringEnum("Paddle entity status.", ["active", "archived"]);
const typeSchema = s.stringEnum("Paddle entity type.", ["standard", "custom"]);
const taxCategorySchema = s.stringEnum("Paddle product tax category.", [
  "digital-goods",
  "ebooks",
  "implementation-services",
  "professional-services",
  "saas",
  "software-programming-services",
  "standard",
  "training-services",
  "website-hosting",
]);
const intervalSchema = s.stringEnum("Billing interval unit.", ["day", "week", "month", "year"]);
const taxModeSchema = s.stringEnum("How Paddle should calculate tax for this price.", [
  "account_setting",
  "external",
  "internal",
  "location",
]);

const billingCycleSchema = s.nullable(
  s.object("Recurring billing cycle for a Paddle price, or null for a one-time price.", {
    interval: intervalSchema,
    frequency: s.integer("Number of intervals in the billing cycle.", { minimum: 1 }),
  }),
);
const moneySchema = s.object("Money amount in Paddle's lowest currency denomination.", {
  amount: s.nonEmptyString("Amount in the lowest denomination for the currency, represented as a string."),
  currency_code: s.nonEmptyString("Three-letter ISO 4217 currency code."),
});
const quantitySchema = s.object(
  "Quantity limits for the related product at this price.",
  {
    minimum: s.integer("Minimum quantity that can be purchased.", { minimum: 1 }),
    maximum: s.integer("Maximum quantity that can be purchased.", { minimum: 1 }),
  },
  { optional: ["minimum", "maximum"] },
);
const trialPeriodSchema = s.nullable(
  s.object(
    "Trial period configuration for a Paddle price.",
    {
      interval: intervalSchema,
      frequency: s.integer("Number of intervals in the trial period.", { minimum: 1 }),
      requires_payment_method: s.boolean("Whether a payment method is required for the trial."),
      unit_price: s.nullable(moneySchema),
    },
    { optional: ["requires_payment_method", "unit_price"] },
  ),
);

const paginationInputSchema = {
  after: s.nonEmptyString("Paddle ID cursor returned in a previous list response."),
  perPage: s.integer("Maximum number of entities to request from Paddle.", {
    minimum: 1,
    maximum: 200,
  }),
  orderBy: s.nonEmptyString("Paddle order_by expression such as `id[DESC]`."),
  skipCount: s.boolean("Whether to send Skip-Count: true to speed up list responses."),
};

const productPayloadProperties = {
  name: s.nonEmptyString("Name of the product."),
  description: s.nonEmptyString("Short description for the product."),
  tax_category: taxCategorySchema,
  type: typeSchema,
  image_url: s.url("Image URL for this product."),
  custom_data: customDataSchema,
};

const pricePayloadProperties = {
  product_id: productIdSchema,
  description: s.nonEmptyString("Internal description for this price."),
  unit_price: moneySchema,
  type: typeSchema,
  name: s.nonEmptyString("Name of this price."),
  billing_cycle: billingCycleSchema,
  trial_period: trialPeriodSchema,
  tax_mode: taxModeSchema,
  quantity: quantitySchema,
  custom_data: customDataSchema,
};

const customerPayloadProperties = {
  name: s.nonEmptyString("Full name for this customer."),
  email: s.string("Email address for this customer.", { format: "email", minLength: 1 }),
  locale: s.nonEmptyString("IETF BCP 47 locale tag for this customer."),
  custom_data: customDataSchema,
};

const listOutputSchema = (description: string, itemDescription: string) =>
  s.object(description, {
    data: s.array(itemDescription, rawEntitySchema),
    meta: s.looseObject("Paddle response metadata, including pagination for list endpoints."),
  });

const entityOutputSchema = (description: string, fieldName: string) =>
  s.object(description, {
    [fieldName]: s.nullable(rawEntitySchema),
    meta: s.looseObject("Paddle response metadata when returned by the API."),
  });

const productPayloadSchema = s.object("Product fields forwarded to Paddle.", productPayloadProperties, {
  optional: ["description", "tax_category", "type", "image_url", "custom_data"],
});

const pricePayloadSchema = s.object("Price fields forwarded to Paddle.", pricePayloadProperties, {
  optional: ["type", "name", "billing_cycle", "trial_period", "tax_mode", "quantity", "custom_data"],
});

const customerPayloadSchema = s.object("Customer fields forwarded to Paddle.", customerPayloadProperties, {
  optional: ["name", "locale", "custom_data"],
});

const updateProductInputSchema = s.object(
  "Input for updating a Paddle product.",
  {
    id: productIdSchema,
    ...productPayloadProperties,
    status: statusSchema,
  },
  {
    optional: ["name", "description", "tax_category", "type", "image_url", "custom_data", "status"],
  },
);

const updatePriceInputSchema = s.object(
  "Input for updating a Paddle price.",
  {
    id: priceIdSchema,
    ...pricePayloadProperties,
    status: statusSchema,
  },
  {
    optional: [
      "product_id",
      "description",
      "unit_price",
      "type",
      "name",
      "billing_cycle",
      "trial_period",
      "tax_mode",
      "quantity",
      "custom_data",
      "status",
    ],
  },
);

const updateCustomerInputSchema = s.object(
  "Input for updating a Paddle customer.",
  {
    id: customerIdSchema,
    ...customerPayloadProperties,
    status: statusSchema,
  },
  { optional: ["name", "email", "locale", "custom_data", "status"] },
);

export const paddleActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_products",
    description: "List Paddle products with optional filtering, pagination, and price inclusion.",
    requiredScopes: ["product.read"],
    inputSchema: s.object(
      "Input for listing Paddle products.",
      {
        ...paginationInputSchema,
        ids: stringList("Product IDs to return.", "A Paddle product ID."),
        include: s.array(
          "Related entities to include in each product.",
          s.stringEnum("A supported Paddle product include value.", ["prices"]),
        ),
        status: s.array("Product statuses to return.", statusSchema),
        taxCategory: s.array("Product tax categories to return.", taxCategorySchema),
        type: typeSchema,
      },
      {
        optional: ["after", "perPage", "orderBy", "skipCount", "ids", "include", "status", "taxCategory", "type"],
      },
    ),
    outputSchema: listOutputSchema("Products returned by Paddle.", "A Paddle product entity."),
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Get one Paddle product by ID.",
    requiredScopes: ["product.read"],
    inputSchema: s.object("Input for retrieving a Paddle product.", { id: productIdSchema }),
    outputSchema: entityOutputSchema("A Paddle product result.", "product"),
  }),
  defineProviderAction(service, {
    name: "create_product",
    description: "Create a Paddle product in the catalog.",
    requiredScopes: ["product.write"],
    inputSchema: productPayloadSchema,
    outputSchema: entityOutputSchema("A created Paddle product result.", "product"),
  }),
  defineProviderAction(service, {
    name: "update_product",
    description: "Update a Paddle product, including archiving or reactivating it through status.",
    requiredScopes: ["product.write"],
    inputSchema: updateProductInputSchema,
    outputSchema: entityOutputSchema("An updated Paddle product result.", "product"),
  }),
  defineProviderAction(service, {
    name: "list_prices",
    description: "List Paddle prices with optional product, status, recurring, and billing filters.",
    requiredScopes: ["price.read"],
    inputSchema: s.object(
      "Input for listing Paddle prices.",
      {
        ...paginationInputSchema,
        ids: stringList("Price IDs to return.", "A Paddle price ID."),
        include: s.array(
          "Related entities to include in each price.",
          s.stringEnum("A supported Paddle price include value.", ["product"]),
        ),
        productIds: stringList("Product IDs whose prices should be returned.", "A Paddle product ID."),
        status: s.array("Price statuses to return.", statusSchema),
        recurring: s.boolean("Whether to return recurring prices."),
        billingCycleInterval: intervalSchema,
        billingCycleFrequency: s.integer("Billing cycle frequency to filter by.", { minimum: 1 }),
        type: typeSchema,
      },
      {
        optional: [
          "after",
          "perPage",
          "orderBy",
          "skipCount",
          "ids",
          "include",
          "productIds",
          "status",
          "recurring",
          "billingCycleInterval",
          "billingCycleFrequency",
          "type",
        ],
      },
    ),
    outputSchema: listOutputSchema("Prices returned by Paddle.", "A Paddle price entity."),
  }),
  defineProviderAction(service, {
    name: "get_price",
    description: "Get one Paddle price by ID.",
    requiredScopes: ["price.read"],
    inputSchema: s.object("Input for retrieving a Paddle price.", { id: priceIdSchema }),
    outputSchema: entityOutputSchema("A Paddle price result.", "price"),
  }),
  defineProviderAction(service, {
    name: "create_price",
    description: "Create a Paddle price for a product.",
    requiredScopes: ["price.write"],
    inputSchema: pricePayloadSchema,
    outputSchema: entityOutputSchema("A created Paddle price result.", "price"),
  }),
  defineProviderAction(service, {
    name: "update_price",
    description: "Update a Paddle price, including archiving or reactivating it through status.",
    requiredScopes: ["price.write"],
    inputSchema: updatePriceInputSchema,
    outputSchema: entityOutputSchema("An updated Paddle price result.", "price"),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List Paddle customers with optional email, status, search, and pagination filters.",
    requiredScopes: ["customer.read"],
    inputSchema: s.object(
      "Input for listing Paddle customers.",
      {
        ...paginationInputSchema,
        ids: stringList("Customer IDs to return.", "A Paddle customer ID."),
        emails: stringList("Email addresses to match exactly.", "A customer email address."),
        status: s.array("Customer statuses to return.", statusSchema),
        search: s.string("Search query matched against customer ID, name, and email.", {
          maxLength: 100,
        }),
      },
      {
        optional: ["after", "perPage", "orderBy", "skipCount", "ids", "emails", "status", "search"],
      },
    ),
    outputSchema: listOutputSchema("Customers returned by Paddle.", "A Paddle customer entity."),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Get one Paddle customer by ID.",
    requiredScopes: ["customer.read"],
    inputSchema: s.object("Input for retrieving a Paddle customer.", { id: customerIdSchema }),
    outputSchema: entityOutputSchema("A Paddle customer result.", "customer"),
  }),
  defineProviderAction(service, {
    name: "create_customer",
    description: "Create a Paddle customer.",
    requiredScopes: ["customer.write"],
    inputSchema: customerPayloadSchema,
    outputSchema: entityOutputSchema("A created Paddle customer result.", "customer"),
  }),
  defineProviderAction(service, {
    name: "update_customer",
    description: "Update a Paddle customer, including archiving or reactivating it through status.",
    requiredScopes: ["customer.write"],
    inputSchema: updateCustomerInputSchema,
    outputSchema: entityOutputSchema("An updated Paddle customer result.", "customer"),
  }),
];
