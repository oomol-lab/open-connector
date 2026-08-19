import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "elorus";

const idSchema = s.nonEmptyString("The Elorus object identifier.");
const rawObjectSchema = s.looseObject("A raw Elorus object payload.");
const rawArraySchema = s.array("A raw Elorus array payload.", s.unknown("One raw Elorus array item."));
const pageSchema = s.positiveInteger("The page number to request.");
const pageSizeSchema = s.positiveInteger("The maximum number of results to return per page.");
const textFilterSchema = (description: string): JsonSchema => s.nonEmptyString(description);
const booleanFilterSchema = (description: string): JsonSchema => s.boolean(description);

const commonListFilters = {
  ordering: textFilterSchema("Official Elorus ordering expression such as modified or -modified."),
  search: textFilterSchema("Free-text search term forwarded to the official Elorus search parameter."),
  search_fields: textFilterSchema("Comma-separated Elorus search_fields value."),
  custom_id: textFilterSchema("Custom identifier filter."),
  created_after: textFilterSchema("Lower bound for the created timestamp filter."),
  created_before: textFilterSchema("Upper bound for the created timestamp filter."),
  modified_after: textFilterSchema("Lower bound for the modified timestamp filter."),
  modified_before: textFilterSchema("Upper bound for the modified timestamp filter."),
  modified_period: textFilterSchema("Relative modified period filter accepted by Elorus."),
  created_period: textFilterSchema("Relative created period filter accepted by Elorus."),
  page: pageSchema,
  page_size: pageSizeSchema,
};

const contactSchema = s.object(
  "An Elorus contact object.",
  {
    id: s.string("The Elorus contact identifier."),
    custom_id: s.string("Custom identifier assigned to the contact."),
    active: s.boolean("Whether the contact is active."),
    first_name: s.string("The contact first name."),
    last_name: s.string("The contact last name."),
    company: s.string("The company represented by the contact."),
    display_name: s.string("The generated display name of the contact."),
  },
  {
    required: ["id"],
    optional: ["custom_id", "active", "first_name", "last_name", "company", "display_name"],
    additionalProperties: true,
  },
);

const productSchema = s.object(
  "An Elorus product or service object.",
  {
    id: s.string("The Elorus product or service identifier."),
    custom_id: s.string("Custom identifier assigned to the product."),
    title: s.string("The product or service title."),
    code: s.string("Optional product code."),
    description: s.string("Product or service description."),
    sales: s.boolean("Whether the record is available for sales."),
    purchases: s.boolean("Whether the record is available for purchases."),
    active: s.boolean("Whether the product or service is active."),
  },
  {
    required: ["id"],
    optional: ["custom_id", "title", "code", "description", "sales", "purchases", "active"],
    additionalProperties: true,
  },
);

const invoiceSchema = s.object(
  "An Elorus invoice object.",
  {
    id: s.string("The Elorus invoice identifier."),
    custom_id: s.string("Custom identifier assigned to the invoice."),
    representation: s.string("Human-readable invoice representation."),
    status: s.string("Invoice status returned by Elorus."),
    draft: s.boolean("Whether the invoice is still a draft."),
    date: s.string("Invoice issue date."),
    due_date: s.string("Calculated due date returned by Elorus."),
    client_display_name: s.string("Client display name shown on the invoice."),
    items: rawArraySchema,
    total: s.string("Total amount."),
    permalink: s.string("Public permalink for the invoice."),
  },
  {
    required: ["id"],
    optional: [
      "custom_id",
      "representation",
      "status",
      "draft",
      "date",
      "due_date",
      "client_display_name",
      "items",
      "total",
      "permalink",
    ],
    additionalProperties: true,
  },
);

const paginatedOutput = (description: string, resultDescription: string, itemSchema: JsonSchema): JsonSchema =>
  s.actionOutput(
    {
      count: s.integer("Total number of records available."),
      next: s.nullableString("URL for the next page, or null when there is no next page."),
      previous: s.nullableString("URL for the previous page, or null when there is no previous page."),
      results: s.array(resultDescription, itemSchema),
    },
    description,
  );

const objectInput = (description: string): JsonSchema =>
  s.actionInput(
    {
      id: idSchema,
    },
    ["id"],
    description,
  );

const createInput = (description: string): JsonSchema =>
  s.actionInput(
    {
      data: rawObjectSchema,
    },
    ["data"],
    description,
  );

const updateInput = (description: string): JsonSchema =>
  s.actionInput(
    {
      id: idSchema,
      data: rawObjectSchema,
    },
    ["id", "data"],
    description,
  );

export const elorusActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Elorus contacts with optional search, filters, and pagination.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        ...commonListFilters,
        letter: textFilterSchema("Initial letter filter applied by Elorus."),
        ctype: textFilterSchema("Official Elorus contact type filter."),
        profession: textFilterSchema("Profession filter."),
        company: booleanFilterSchema("Whether to filter to company contacts."),
        active: booleanFilterSchema("Whether to filter to active contacts."),
      },
      [],
      "The query parameters for listing Elorus contacts.",
    ),
    outputSchema: paginatedOutput(
      "Paginated Elorus contact list response.",
      "Contacts returned by the current page.",
      contactSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get one Elorus contact by ID.",
    requiredScopes: [],
    inputSchema: objectInput("The Elorus contact identifier to retrieve."),
    outputSchema: s.actionOutput({ contact: contactSchema }, "The Elorus contact lookup response."),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create one Elorus contact in the selected organization.",
    requiredScopes: [],
    inputSchema: createInput("The Elorus contact payload to create."),
    outputSchema: s.actionOutput({ contact: contactSchema }, "The Elorus create-contact response."),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update one Elorus contact by ID.",
    requiredScopes: [],
    inputSchema: updateInput("The Elorus contact ID and full payload to update."),
    outputSchema: s.actionOutput({ contact: contactSchema }, "The Elorus update-contact response."),
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List Elorus products or services with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        ...commonListFilters,
        sales: booleanFilterSchema("Whether to filter to sale-enabled products or services."),
        purchases: booleanFilterSchema("Whether to filter to purchase-enabled products or services."),
        active: booleanFilterSchema("Whether to filter to active products or services."),
      },
      [],
      "The query parameters for listing Elorus products or services.",
    ),
    outputSchema: paginatedOutput(
      "Paginated Elorus product list response.",
      "Products or services returned by the current page.",
      productSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Get one Elorus product or service by ID.",
    requiredScopes: [],
    inputSchema: objectInput("The Elorus product or service identifier to retrieve."),
    outputSchema: s.actionOutput({ product: productSchema }, "The Elorus get-product response."),
  }),
  defineProviderAction(service, {
    name: "create_product",
    description: "Create one Elorus product or service in the selected organization.",
    requiredScopes: [],
    inputSchema: createInput("The Elorus product or service payload to create."),
    outputSchema: s.actionOutput({ product: productSchema }, "The Elorus create-product response."),
  }),
  defineProviderAction(service, {
    name: "update_product",
    description: "Update one Elorus product or service by ID.",
    requiredScopes: [],
    inputSchema: updateInput("The Elorus product or service ID and full payload to update."),
    outputSchema: s.actionOutput({ product: productSchema }, "The Elorus update-product response."),
  }),
  defineProviderAction(service, {
    name: "list_invoices",
    description: "List Elorus invoices with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        ...commonListFilters,
        period_from: textFilterSchema("Lower bound of the invoice issue-date period filter."),
        period_to: textFilterSchema("Upper bound of the invoice issue-date period filter."),
        period: textFilterSchema("Relative period filter accepted by Elorus."),
        status: textFilterSchema("Invoice status filter."),
        draft: booleanFilterSchema("Whether to filter to draft invoices."),
        pending_approval: booleanFilterSchema("Whether to filter to pending-approval invoices."),
        fpaid: booleanFilterSchema("Whether to filter to fully paid invoices."),
        is_void: booleanFilterSchema("Whether to filter to void invoices."),
        overdue: booleanFilterSchema("Whether to filter to overdue invoices."),
        client: textFilterSchema("Client contact identifier filter."),
        currency_code: textFilterSchema("Currency code filter."),
        documenttype: textFilterSchema("Document type identifier filter."),
        sequence: textFilterSchema("Sequence filter."),
      },
      [],
      "The query parameters for listing Elorus invoices.",
    ),
    outputSchema: paginatedOutput(
      "Paginated Elorus invoice list response.",
      "Invoices returned by the current page.",
      invoiceSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_invoice",
    description: "Get one Elorus invoice by ID.",
    requiredScopes: [],
    inputSchema: objectInput("The Elorus invoice identifier to retrieve."),
    outputSchema: s.actionOutput({ invoice: invoiceSchema }, "The Elorus get-invoice response."),
  }),
  defineProviderAction(service, {
    name: "create_invoice",
    description: "Create one Elorus invoice in the selected organization.",
    requiredScopes: [],
    inputSchema: createInput("The Elorus invoice payload to create."),
    outputSchema: s.actionOutput({ invoice: invoiceSchema }, "The Elorus create-invoice response."),
  }),
  defineProviderAction(service, {
    name: "update_invoice",
    description: "Update one Elorus invoice by ID using the official full-update endpoint.",
    requiredScopes: [],
    inputSchema: updateInput("The Elorus invoice ID and full payload to update."),
    outputSchema: s.actionOutput({ invoice: invoiceSchema }, "The Elorus update-invoice response."),
  }),
];
