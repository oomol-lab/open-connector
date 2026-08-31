import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "quaderno" as const;

const rawObjectSchema = s.looseObject("The raw Quaderno API object.");
const idSchema = s.string("The Quaderno object ID.", { minLength: 1 });
const integerIdSchema = s.integer("The Quaderno object ID.");
const optionalQuerySchema = s.string("A case-sensitive search query accepted by Quaderno.", {
  minLength: 1,
});
const processorIdSchema = s.string("The external payment processor ID.", { minLength: 1 });

const paginationSchema = s.object("Pagination links and rate limit metadata returned by Quaderno.", {
  next: s.nullable(s.string("The URL for the next page when Quaderno provides one.")),
  previous: s.nullable(s.string("The URL for the previous page when Quaderno provides one.")),
  first: s.nullable(s.string("The URL for the first page when Quaderno provides one.")),
  last: s.nullable(s.string("The URL for the last page when Quaderno provides one.")),
  rateLimitLimit: s.nullable(s.integer("The Quaderno request limit for the current window.")),
  rateLimitRemaining: s.nullable(s.integer("The number of Quaderno requests remaining in the current window.")),
  rateLimitReset: s.nullable(s.integer("The UTC epoch second when the Quaderno rate limit window resets.")),
});

const accountSchema = s.object("A normalized Quaderno account identity.", {
  id: s.nullable(s.string("The Quaderno identity ID.")),
  name: s.nullable(s.string("The account user's full name.")),
  email: s.nullable(s.string("The account user's email address.")),
  publishableKey: s.nullable(s.string("The account publishable key.")),
  accountUrl: s.string("The Quaderno account API base URL."),
  accountSubdomain: s.string("The Quaderno account subdomain."),
  raw: rawObjectSchema,
});

const contactSchema = s.object("A normalized Quaderno contact.", {
  id: s.nullable(s.integer("The contact ID.")),
  firstName: s.nullable(s.string("The contact first name.")),
  lastName: s.nullable(s.string("The contact last name.")),
  email: s.nullable(s.string("The contact email address.")),
  kind: s.nullable(s.string("The contact kind, such as company or person.")),
  country: s.nullable(s.string("The contact country code.")),
  processorId: s.nullable(s.string("The external payment processor ID for the contact.")),
  taxStatus: s.nullable(s.string("The contact tax status.")),
  raw: rawObjectSchema,
});

const contactPayloadSchema = s.looseObject("The Quaderno contact fields to create or update.", {
  first_name: s.string("The contact's first name. Required by Quaderno when creating a contact.", {
    minLength: 1,
  }),
  last_name: s.string("The contact's last name when the contact is a person.", { minLength: 1 }),
  email: s.email("The contact's email address."),
  kind: s.stringEnum("The contact kind.", ["company", "person"]),
  country: s.string("The two-letter ISO 3166-1 alpha-2 country code.", { minLength: 2 }),
  processor_id: processorIdSchema,
  tax_status: s.stringEnum("The contact tax status.", ["taxable", "exempt", "reverse"]),
});

const productSchema = s.object("A normalized Quaderno product.", {
  id: s.nullable(s.integer("The product ID.")),
  name: s.nullable(s.string("The product name.")),
  code: s.nullable(s.string("The product SKU or code.")),
  unitCost: s.nullable(s.string("The unit amount charged for the product.")),
  currency: s.nullable(s.string("The product currency code.")),
  productType: s.nullable(s.string("The product type, such as good or service.")),
  taxClass: s.nullable(s.string("The tax class that applies to the product.")),
  raw: rawObjectSchema,
});

const productPayloadSchema = s.looseObject("The Quaderno product fields to create or update.", {
  name: s.string("The product name displayed to customers.", { minLength: 1 }),
  code: s.string("The product SKU or code.", { minLength: 1 }),
  unit_cost: s.string("The unit amount charged for the product.", { minLength: 1 }),
  currency: s.string("The three-letter ISO 4217 currency code.", { minLength: 3 }),
  product_type: s.stringEnum("Whether the product is a good or a service.", ["good", "service"]),
  tax_class: s.stringEnum("The tax class that applies to the product.", [
    "consulting",
    "eservice",
    "ebook",
    "saas",
    "standard",
    "reduced",
  ]),
});

const taxRateSchema = s.object("A normalized Quaderno tax rate calculation.", {
  name: s.nullable(s.string("The tax name.")),
  rate: s.nullable(s.number("The tax rate applied.")),
  taxablePart: s.nullable(s.number("The percentage of the subtotal used for calculating the tax amount.")),
  country: s.nullable(s.string("The country used for the tax calculation.")),
  region: s.nullable(s.string("The region used for the tax calculation.")),
  taxCode: s.nullable(s.string("The tax code used for the calculation.")),
  taxBehavior: s.nullable(s.string("Whether prices were treated as inclusive or exclusive.")),
  taxAmount: s.nullable(s.number("The calculated tax amount.")),
  subtotal: s.nullable(s.number("The price before taxes.")),
  totalAmount: s.nullable(s.number("The total amount including taxes.")),
  status: s.nullable(s.string("The tax calculation status.")),
  raw: rawObjectSchema,
});

export const quadernoActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve the Quaderno account identity and API endpoint for the API key.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving the Quaderno account identity.", {}),
    outputSchema: s.object("A Quaderno account identity response.", {
      account: accountSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Quaderno contacts with optional search or processor ID filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Quaderno contacts.",
      {
        q: optionalQuerySchema,
        processor_id: processorIdSchema,
      },
      { optional: ["q", "processor_id"] },
    ),
    outputSchema: s.object("A list of Quaderno contacts.", {
      contacts: s.array("Contacts returned by Quaderno.", contactSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Retrieve one Quaderno contact by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Quaderno contact.", {
      id: idSchema,
    }),
    outputSchema: s.object("A Quaderno contact response.", {
      contact: contactSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a Quaderno contact.",
    requiredScopes: [],
    inputSchema: s.object("Input for creating a Quaderno contact.", {
      contact: contactPayloadSchema,
    }),
    outputSchema: s.object("A created Quaderno contact response.", {
      contact: contactSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a Quaderno contact. Fields not provided are left unchanged.",
    requiredScopes: [],
    inputSchema: s.object("Input for updating a Quaderno contact.", {
      id: integerIdSchema,
      contact: contactPayloadSchema,
    }),
    outputSchema: s.object("An updated Quaderno contact response.", {
      contact: contactSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete a Quaderno contact permanently.",
    requiredScopes: [],
    inputSchema: s.object("Input for deleting a Quaderno contact.", {
      id: idSchema,
    }),
    outputSchema: s.object("A Quaderno contact deletion response.", {
      deleted: s.boolean("Whether Quaderno accepted the delete request."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List Quaderno products with an optional search query.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Quaderno products.",
      {
        q: optionalQuerySchema,
      },
      { optional: ["q"] },
    ),
    outputSchema: s.object("A list of Quaderno products.", {
      products: s.array("Products returned by Quaderno.", productSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Retrieve one Quaderno product by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Quaderno product.", {
      id: idSchema,
    }),
    outputSchema: s.object("A Quaderno product response.", {
      product: productSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_product",
    description: "Create a Quaderno product.",
    requiredScopes: [],
    inputSchema: s.object("Input for creating a Quaderno product.", {
      product: productPayloadSchema,
    }),
    outputSchema: s.object("A created Quaderno product response.", {
      product: productSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_product",
    description: "Update a Quaderno product. Fields not provided are left unchanged.",
    requiredScopes: [],
    inputSchema: s.object("Input for updating a Quaderno product.", {
      id: integerIdSchema,
      product: productPayloadSchema,
    }),
    outputSchema: s.object("An updated Quaderno product response.", {
      product: productSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_product",
    description: "Delete a Quaderno product permanently.",
    requiredScopes: [],
    inputSchema: s.object("Input for deleting a Quaderno product.", {
      id: idSchema,
    }),
    outputSchema: s.object("A Quaderno product deletion response.", {
      deleted: s.boolean("Whether Quaderno accepted the delete request."),
    }),
  }),
  defineProviderAction(service, {
    name: "calculate_tax_rate",
    description: "Calculate the Quaderno tax rate for an address and transaction details.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for calculating a Quaderno tax rate.",
      {
        from_country: s.string("The seller's two-letter ISO country code.", { minLength: 2 }),
        from_postal_code: s.string("The seller's ZIP or postal code.", { minLength: 1 }),
        to_country: s.string("The customer's two-letter ISO country code.", { minLength: 2 }),
        to_postal_code: s.string("The customer's ZIP or postal code.", { minLength: 1 }),
        to_city: s.string("The customer's city.", { minLength: 1 }),
        to_street: s.string("The customer's street address.", { minLength: 1 }),
        tax_id: s.string("The customer's tax identification number.", { minLength: 1 }),
        tax_code: s.stringEnum("The transaction tax code.", [
          "consulting",
          "eservice",
          "ebook",
          "saas",
          "standard",
          "reduced",
          "exempt",
        ]),
        tax_behavior: s.stringEnum("Whether the price includes tax.", ["inclusive", "exclusive"]),
        product_type: s.stringEnum("Whether the product is a good or service.", ["good", "service"]),
        date: s.string("The transaction date. Defaults to today in Quaderno.", { minLength: 1 }),
        amount: s.string("The transaction amount.", { minLength: 1 }),
        currency: s.string("The three-letter ISO 4217 currency code.", { minLength: 3 }),
      },
      {
        optional: [
          "from_country",
          "from_postal_code",
          "to_postal_code",
          "to_city",
          "to_street",
          "tax_id",
          "tax_code",
          "tax_behavior",
          "product_type",
          "date",
          "amount",
          "currency",
        ],
      },
    ),
    outputSchema: s.object("A Quaderno tax rate calculation response.", {
      taxRate: taxRateSchema,
    }),
  }),
];
