import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "btcpay_server";

const storeIdSchema = s.nonEmptyString("The BTCPay Server store ID.");
const invoiceIdSchema = s.nonEmptyString("The BTCPay Server invoice ID.");
const unixTimestampSchema = s.number("Unix timestamp in seconds.");
const metadataSchema = s.looseObject(
  "Additional invoice metadata accepted by BTCPay Server, such as orderId, buyerEmail, itemDesc, or custom JSON fields.",
);

const invoiceStatusSchema = s.stringEnum("The BTCPay Server invoice status.", [
  "Expired",
  "Invalid",
  "New",
  "Processing",
  "Settled",
]);

const invoiceSchema = s.looseObject("BTCPay Server invoice data.", {
  id: invoiceIdSchema,
  storeId: storeIdSchema,
  amount: s.string("The invoice amount as a decimal string."),
  paidAmount: s.string("The paid amount as a decimal string."),
  currency: s.string("The invoice currency code."),
  type: s.string("The BTCPay Server invoice type."),
  checkoutLink: s.string("Checkout URL where the buyer can pay the invoice."),
  createdTime: unixTimestampSchema,
  expirationTime: unixTimestampSchema,
  monitoringExpiration: unixTimestampSchema,
  status: invoiceStatusSchema,
  additionalStatus: s.string("Additional BTCPay Server invoice status detail when present."),
  availableStatusesForManualMarking: s.array("Statuses this invoice can be manually marked as.", invoiceStatusSchema),
  archived: s.boolean("Whether the invoice is archived."),
  metadata: metadataSchema,
});

const storeSchema = s.looseObject("BTCPay Server store data.", {
  id: storeIdSchema,
  name: s.string("The store name."),
  website: s.string("The store website URL."),
  supportUrl: s.string("The store support URI."),
  logoUrl: s.string("The store logo URL or BTCPay file reference."),
  defaultCurrency: s.string("The default currency configured for the store."),
  archived: s.boolean("Whether the store is archived."),
});

export const btcpayServerActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_stores",
    operationType: "read",
    description: "List BTCPay Server stores available to the API key.",
    providerPermissions: ["btcpay.store.canviewstoresettings"],
    inputSchema: s.actionInput({}, [], "No input is required for listing stores."),
    outputSchema: s.actionOutput(
      {
        stores: s.array("Stores returned by BTCPay Server.", storeSchema),
      },
      "List of BTCPay Server stores.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_store",
    operationType: "read",
    description: "Get details for a single BTCPay Server store.",
    providerPermissions: ["btcpay.store.canviewstoresettings"],
    inputSchema: s.actionInput(
      {
        storeId: storeIdSchema,
      },
      ["storeId"],
      "Path parameters for reading a BTCPay Server store.",
    ),
    outputSchema: s.actionOutput(
      {
        store: storeSchema,
      },
      "BTCPay Server store details.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_invoices",
    operationType: "read",
    description: "List invoices for a BTCPay Server store with optional filters.",
    providerPermissions: ["btcpay.store.canviewinvoices"],
    inputSchema: s.actionInput(
      {
        storeId: storeIdSchema,
        orderIds: s.array(
          "Order IDs to fetch invoices for. BTCPay Server receives each value as an orderId query parameter.",
          s.string("Order ID value."),
        ),
        textSearch: s.nonEmptyString("Search term that helps locate specific invoices."),
        status: invoiceStatusSchema,
        startDate: unixTimestampSchema,
        endDate: unixTimestampSchema,
        includePaymentMethods: s.boolean("Whether payment methods should be included in the invoice response."),
        take: s.integer("Number of records returned in the response."),
        skip: s.integer("Number of records to skip."),
      },
      ["storeId"],
      "Query parameters for listing BTCPay Server invoices.",
    ),
    outputSchema: s.actionOutput(
      {
        invoices: s.array("Invoices returned by BTCPay Server.", invoiceSchema),
      },
      "List of BTCPay Server invoices.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_invoice",
    operationType: "read",
    description: "Get details for a single BTCPay Server invoice.",
    providerPermissions: ["btcpay.store.canviewinvoices"],
    inputSchema: s.actionInput(
      {
        storeId: storeIdSchema,
        invoiceId: invoiceIdSchema,
      },
      ["storeId", "invoiceId"],
      "Path parameters for reading a BTCPay Server invoice.",
    ),
    outputSchema: s.actionOutput(
      {
        invoice: invoiceSchema,
      },
      "BTCPay Server invoice details.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_invoice",
    operationType: "write",
    description: "Create a BTCPay Server invoice and return its checkout link and invoice data.",
    providerPermissions: ["btcpay.store.cancreateinvoice"],
    inputSchema: s.actionInput(
      {
        storeId: storeIdSchema,
        amount: s.nonEmptyString("Invoice amount as a decimal string. Omit this for a top-up invoice."),
        currency: s.nonEmptyString("Invoice currency code. If omitted, BTCPay Server uses the store default currency."),
        metadata: metadataSchema,
        additionalSearchTerms: s.array(
          "Additional search terms used to find the invoice through text search.",
          s.string("Additional invoice search term."),
        ),
      },
      ["storeId"],
      "Request body for creating a BTCPay Server invoice.",
    ),
    outputSchema: s.actionOutput(
      {
        invoice: invoiceSchema,
      },
      "BTCPay Server invoice creation result.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_invoice_metadata",
    operationType: "write",
    description: "Update metadata for an existing BTCPay Server invoice.",
    providerPermissions: ["btcpay.store.canmodifyinvoices"],
    inputSchema: s.actionInput(
      {
        storeId: storeIdSchema,
        invoiceId: invoiceIdSchema,
        metadata: metadataSchema,
      },
      ["storeId", "invoiceId", "metadata"],
      "Request body for updating BTCPay Server invoice metadata.",
    ),
    outputSchema: s.actionOutput(
      {
        invoice: invoiceSchema,
      },
      "Updated BTCPay Server invoice.",
    ),
  }),
  defineProviderAction(service, {
    name: "mark_invoice_status",
    operationType: "write",
    description: "Manually mark a BTCPay Server invoice as invalid or settled.",
    providerPermissions: ["btcpay.store.canmodifyinvoices"],
    inputSchema: s.actionInput(
      {
        storeId: storeIdSchema,
        invoiceId: invoiceIdSchema,
        status: s.stringEnum("Status to manually assign to the invoice.", ["Invalid", "Settled"]),
      },
      ["storeId", "invoiceId", "status"],
      "Request body for manually marking a BTCPay Server invoice status.",
    ),
    outputSchema: s.actionOutput(
      {
        invoice: invoiceSchema,
      },
      "BTCPay Server invoice after manual status update.",
    ),
  }),
];
