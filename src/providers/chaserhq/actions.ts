import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "chaserhq";
const raw = s.looseObject("Raw Chaser object returned by the API.");
const pagination = s.object({
  pageNumber: s.nullableNumber("The zero-based page number returned by Chaser."),
  pageSize: s.nullableNumber("The page size returned by Chaser."),
  totalCount: s.nullableNumber("The total matching record count returned by Chaser."),
});
const stringFilter = s.object(
  {
    eq: s.string("Match records equal to this value."),
    ne: s.string("Match records not equal to this value."),
    in: s.stringArray("Match records in this list.", { minItems: 1 }),
    nin: s.stringArray("Exclude records in this list.", { minItems: 1 }),
  },
  { optional: ["eq", "ne", "in", "nin"], description: "A string filter." },
);
const numberFilter = s.object(
  {
    eq: s.number("Match records equal to this value."),
    ne: s.number("Match records not equal to this value."),
    gt: s.number("Match records greater than this value."),
    lt: s.number("Match records less than this value."),
    gte: s.number("Match records greater than or equal to this value."),
    lte: s.number("Match records less than or equal to this value."),
  },
  { optional: ["eq", "ne", "gt", "lt", "gte", "lte"], description: "A numeric filter." },
);
const listInput = s.object(
  {
    limit: s.integer("The number of items per page. Chaser allows at most 100.", { minimum: 1, maximum: 100 }),
    page: s.nonNegativeInteger("The zero-based page number to request."),
    filters: s.record("Chaser filters keyed by field name.", s.union([stringFilter, numberFilter])),
    additionalFields: s.stringArray("Optional customer fields to include in the response.", { minItems: 1 }),
  },
  {
    optional: ["limit", "page", "filters", "additionalFields"],
    description: "Query parameters for a Chaser list endpoint.",
  },
);
const idInput = (key: string, description: string): ReturnType<typeof s.object> =>
  s.object({ [key]: s.nonEmptyString(description) }, { required: [key], description });

export const chaserhqActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_status",
    operationType: "read",
    description: "Get ChaserHQ API status.",
    requiredScopes: [],
    inputSchema: s.object({}, { description: "Input for reading Chaser status." }),
    outputSchema: s.object({ ok: s.boolean("Whether the status request succeeded."), raw }),
  }),
  defineProviderAction(service, {
    name: "get_organisation",
    operationType: "read",
    description: "Get the Chaser organisation attached to the API credentials.",
    requiredScopes: [],
    inputSchema: s.object({}, { description: "Input for reading the organisation." }),
    outputSchema: s.object({ organisation: raw }),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    operationType: "read",
    description: "List Chaser customers with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: listInput,
    outputSchema: s.object({ customers: s.array(raw, { description: "Customers returned by Chaser." }), pagination }),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    operationType: "read",
    description: "Get one Chaser customer by ID or ext_ external ID.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        customerId: s.nonEmptyString("The Chaser customer id, or an external id prefixed with ext_."),
        additionalFields: s.stringArray("Optional customer fields to include in the response.", { minItems: 1 }),
      },
      { required: ["customerId"], description: "Input for reading one customer." },
    ),
    outputSchema: s.object({ customer: raw }),
  }),
  defineProviderAction(service, {
    name: "list_invoices",
    operationType: "read",
    description: "List Chaser invoices with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: listInput,
    outputSchema: s.object({ invoices: s.array(raw, { description: "Invoices returned by Chaser." }), pagination }),
  }),
  defineProviderAction(service, {
    name: "get_invoice",
    operationType: "read",
    description: "Get one Chaser invoice by ID.",
    requiredScopes: [],
    inputSchema: idInput("invoiceId", "The Chaser invoice identifier."),
    outputSchema: s.object({ invoice: raw }),
  }),
  defineProviderAction(service, {
    name: "list_invoice_history",
    operationType: "read",
    description: "List Chaser invoice history records with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: listInput,
    outputSchema: s.object({
      histories: s.array(raw, { description: "Invoice histories returned by Chaser." }),
      pagination,
    }),
  }),
  defineProviderAction(service, {
    name: "get_invoice_history",
    operationType: "read",
    description: "Get history for one Chaser invoice.",
    requiredScopes: [],
    inputSchema: idInput("invoiceId", "The Chaser invoice identifier."),
    outputSchema: s.object({ history: raw }),
  }),
];
