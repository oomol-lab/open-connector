import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "metronome";

const rawObjectSchema = s.looseObject("The raw Metronome object returned by the API.");

const paginationOutputSchema = {
  nextPage: s.nullableString("The cursor to pass as nextPage when more results are available."),
};

const customerSchema = s.object("A normalized Metronome customer.", {
  id: s.string("The Metronome customer ID."),
  externalId: s.nullableString("The deprecated external ID value returned by Metronome when available."),
  name: s.string("The customer display name."),
  ingestAliases: s.array(
    "The ingest aliases that can identify this customer in usage events.",
    s.string("A customer ingest alias."),
  ),
  createdAt: s.string("The RFC 3339 timestamp when the customer was created."),
  updatedAt: s.string("The RFC 3339 timestamp when the customer was last updated."),
  archivedAt: s.nullableString("The RFC 3339 timestamp when the customer was archived."),
  customerConfig: s.looseObject("The customer_config object returned by Metronome."),
  customFields: s.looseObject("The custom fields returned for this customer."),
  raw: rawObjectSchema,
});

const billableMetricSchema = s.object("A normalized Metronome billable metric.", {
  id: s.string("The Metronome billable metric ID."),
  name: s.string("The billable metric display name."),
  aggregationType: s.nullableString("The billable metric aggregation type."),
  aggregationKey: s.nullableString("The property key used for aggregation."),
  archivedAt: s.nullableString("The RFC 3339 timestamp when the billable metric was archived."),
  customFields: s.looseObject("The custom fields returned for this billable metric."),
  raw: rawObjectSchema,
});

const invoiceSchema = s.object("A normalized Metronome invoice.", {
  id: s.string("The Metronome invoice ID."),
  customerId: s.string("The Metronome customer ID associated with this invoice."),
  status: s.nullableString("The invoice status returned by Metronome."),
  type: s.nullableString("The invoice type returned by Metronome."),
  contractId: s.nullableString("The contract ID associated with this invoice when available."),
  startTimestamp: s.nullableString("The RFC 3339 billing period start timestamp."),
  endTimestamp: s.nullableString("The RFC 3339 billing period end timestamp."),
  issuedAt: s.nullableString("The RFC 3339 timestamp when the invoice was issued."),
  total: s.nullableNumber("The invoice total amount in the credit type unit."),
  subtotal: s.nullableNumber("The invoice subtotal amount in the credit type unit."),
  amountDue: s.nullableNumber("The invoice amount due in the credit type unit."),
  lineItems: s.array("The invoice line items returned by Metronome.", rawObjectSchema),
  raw: rawObjectSchema,
});

const customerIdInputSchema = s.object("Input identifying one Metronome customer.", {
  customerId: s.nonEmptyString("The Metronome customer ID."),
});

const pageInputFields = {
  limit: s.integer("The maximum number of results to return. Metronome allows 1 to 100.", {
    minimum: 1,
    maximum: 100,
  }),
  nextPage: s.nonEmptyString("The pagination cursor returned by a previous list call."),
};

const listCustomersAction = defineProviderAction(service, {
  name: "list_customers",
  description: "List Metronome customers with optional filters and cursor pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for listing Metronome customers.",
    {
      ...pageInputFields,
      ingestAlias: s.nonEmptyString("Filter customers by a Metronome ingest alias."),
      customerIds: s.array(
        "Filter customers by Metronome customer IDs. Metronome allows up to 100 IDs.",
        s.nonEmptyString("A Metronome customer ID."),
        { maxItems: 100 },
      ),
      onlyArchived: s.boolean("If true, only archived customers are returned."),
      salesforceAccountIds: s.array(
        "Filter customers by Salesforce account IDs. Metronome allows up to 100 IDs.",
        s.nonEmptyString("A Salesforce account ID."),
        { maxItems: 100 },
      ),
    },
    {
      optional: ["limit", "nextPage", "ingestAlias", "customerIds", "onlyArchived", "salesforceAccountIds"],
    },
  ),
  outputSchema: s.object("The Metronome customer list result.", {
    customers: s.array("The customers returned by Metronome.", customerSchema),
    ...paginationOutputSchema,
  }),
});

const getCustomerAction = defineProviderAction(service, {
  name: "get_customer",
  description: "Get detailed information for a specific Metronome customer.",
  requiredScopes: [],
  inputSchema: customerIdInputSchema,
  outputSchema: s.object("The Metronome customer lookup result.", {
    customer: customerSchema,
  }),
});

const listBillableMetricsAction = defineProviderAction(service, {
  name: "list_billable_metrics",
  description: "List Metronome billable metrics with optional archived metrics and pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for listing Metronome billable metrics.",
    {
      ...pageInputFields,
      includeArchived: s.boolean("If true, archived billable metrics are included."),
    },
    { optional: ["limit", "nextPage", "includeArchived"] },
  ),
  outputSchema: s.object("The Metronome billable metric list result.", {
    billableMetrics: s.array("The billable metrics returned by Metronome.", billableMetricSchema),
    ...paginationOutputSchema,
  }),
});

const listInvoicesAction = defineProviderAction(service, {
  name: "list_invoices",
  description: "List invoices for a Metronome customer with stable filters and pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for listing Metronome invoices.",
    {
      customerId: s.nonEmptyString("The Metronome customer ID."),
      ...pageInputFields,
      status: s.stringEnum("Filter invoices by status.", ["DRAFT", "FINALIZED", "VOID"]),
      type: s.stringEnum("Filter invoices by type.", ["USAGE", "USAGE_CONSOLIDATED", "SCHEDULED"]),
      sort: s.stringEnum("Sort invoices by issue date.", ["date_asc", "date_desc"]),
      skipZeroQtyLineItems: s.boolean("If true, Metronome omits zero-quantity line items."),
      creditTypeId: s.nonEmptyString("Only return invoices for the specified credit type."),
      contractId: s.nonEmptyString("Only return invoices for the specified contract ID."),
      startingOn: s.nonEmptyString("Only return billing periods starting at or after this RFC 3339 timestamp."),
      endingBefore: s.nonEmptyString("Only return billing periods ending before this RFC 3339 timestamp."),
    },
    {
      optional: [
        "limit",
        "nextPage",
        "status",
        "type",
        "sort",
        "skipZeroQtyLineItems",
        "creditTypeId",
        "contractId",
        "startingOn",
        "endingBefore",
      ],
    },
  ),
  outputSchema: s.object("The Metronome invoice list result.", {
    invoices: s.array("The invoices returned by Metronome.", invoiceSchema),
    ...paginationOutputSchema,
  }),
});

const getInvoiceAction = defineProviderAction(service, {
  name: "get_invoice",
  description: "Get a specific Metronome invoice by customer ID and invoice ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for reading one Metronome invoice.",
    {
      customerId: s.nonEmptyString("The Metronome customer ID."),
      invoiceId: s.nonEmptyString("The Metronome invoice ID."),
      skipZeroQtyLineItems: s.boolean("If true, Metronome omits zero-quantity line items."),
    },
    { optional: ["skipZeroQtyLineItems"] },
  ),
  outputSchema: s.object("The Metronome invoice lookup result.", {
    invoice: invoiceSchema,
  }),
});

export const metronomeActions: ActionDefinition[] = [
  listCustomersAction,
  getCustomerAction,
  listBillableMetricsAction,
  listInvoicesAction,
  getInvoiceAction,
];
