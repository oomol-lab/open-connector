import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "holded";

const cursorSchema = s.nonEmptyString("Opaque pagination cursor returned by Holded in the previous response.");
const limitSchema = s.integer("Maximum number of records to return. Holded accepts up to 100.", {
  minimum: 1,
  maximum: 100,
});
const idSchema = s.nonEmptyString("Holded object identifier.");
const rawObjectSchema = s.looseObject("The raw object returned by Holded.");

const paginationSchema = s.object("Pagination metadata returned by Holded.", {
  nextCursor: s.nullableString("Cursor for the next page when Holded reports that another page is available."),
  hasMore: s.nullableBoolean("Whether Holded reports that another page is available."),
  raw: s.looseObject("The raw pagination metadata returned by Holded."),
});

const contactSchema = s.object("A normalized Holded contact.", {
  id: s.string("The Holded contact identifier."),
  name: s.nullableString("The contact name when returned by Holded."),
  email: s.nullableString("The contact email address when returned by Holded."),
  phone: s.nullableString("The contact phone number when returned by Holded."),
  mobile: s.nullableString("The contact mobile number when returned by Holded."),
  code: s.nullableString("The contact tax identification code when returned by Holded."),
  customId: s.nullableString("The external custom identifier when returned by Holded."),
  type: s.nullableString("The contact type when returned by Holded."),
  raw: rawObjectSchema,
});

const productSchema = s.object("A normalized Holded product.", {
  id: s.string("The Holded product identifier."),
  name: s.nullableString("The product name when returned by Holded."),
  sku: s.nullableString("The product SKU when returned by Holded."),
  description: s.nullableString("The product description when returned by Holded."),
  price: s.nullableNumber("The product price when returned by Holded."),
  raw: rawObjectSchema,
});

export const holdedActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Holded contacts with exact-match filters and cursor pagination.",
    inputSchema: s.actionInput(
      {
        phone: s.nonEmptyString("Filter contacts by exact phone number."),
        mobile: s.nonEmptyString("Filter contacts by exact mobile number."),
        email: s.email("Filter contacts by exact email address."),
        code: s.nonEmptyString("Filter contacts by exact tax identification code."),
        customId: s.nonEmptyString("Filter contacts by exact external custom identifier."),
        cursor: cursorSchema,
        limit: limitSchema,
      },
      [],
      "The input payload for listing Holded contacts.",
    ),
    outputSchema: s.actionOutput(
      {
        contacts: s.array("The contacts returned by Holded.", contactSchema),
        pagination: s.nullable(paginationSchema),
        raw: s.unknown("The raw top-level payload returned by Holded."),
      },
      "The response returned when listing Holded contacts.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get a Holded contact by identifier.",
    inputSchema: s.actionInput(
      { contactId: idSchema },
      ["contactId"],
      "The input payload for getting a Holded contact.",
    ),
    outputSchema: s.actionOutput(
      {
        contact: contactSchema,
        raw: s.unknown("The raw top-level payload returned by Holded."),
      },
      "The response returned when getting a Holded contact.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a basic Holded contact with JSON-friendly identity fields.",
    inputSchema: s.actionInput(
      {
        name: s.nonEmptyString("The contact name."),
        email: s.email("The contact email address."),
        phone: s.nonEmptyString("The contact phone number."),
        mobile: s.nonEmptyString("The contact mobile number."),
        code: s.nonEmptyString("The contact tax identification code."),
        customId: s.nonEmptyString("External custom identifier for the contact."),
        type: s.nonEmptyString("Holded contact type value."),
      },
      ["name"],
      "The input payload for creating a Holded contact.",
    ),
    outputSchema: s.actionOutput(
      {
        contact: contactSchema,
        raw: s.unknown("The raw top-level payload returned by Holded."),
      },
      "The response returned when creating a Holded contact.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List Holded products with cursor pagination.",
    inputSchema: s.actionInput(
      {
        cursor: cursorSchema,
        limit: limitSchema,
      },
      [],
      "The input payload for listing Holded products.",
    ),
    outputSchema: s.actionOutput(
      {
        products: s.array("The products returned by Holded.", productSchema),
        pagination: s.nullable(paginationSchema),
        raw: s.unknown("The raw top-level payload returned by Holded."),
      },
      "The response returned when listing Holded products.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Get a Holded product by identifier.",
    inputSchema: s.actionInput(
      { productId: idSchema },
      ["productId"],
      "The input payload for getting a Holded product.",
    ),
    outputSchema: s.actionOutput(
      {
        product: productSchema,
        raw: s.unknown("The raw top-level payload returned by Holded."),
      },
      "The response returned when getting a Holded product.",
    ),
  }),
];
