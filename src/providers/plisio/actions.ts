import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "plisio";

function nonEmptyString(description: string) {
  return s.string(description, { minLength: 1 });
}

const stringOrIntegerIdentifierSchema = s.anyOf(
  "A merchant-supplied identifier that Plisio accepts as either a string or an integer.",
  [nonEmptyString("A non-empty merchant identifier string."), s.integer("A merchant identifier integer.")],
);

const stringOrStringArraySchema = s.anyOf(
  "A Plisio field that may return one string or an array of strings depending on the endpoint.",
  [
    s.string("One upstream string value."),
    s.array("A list of upstream string values.", s.string("One upstream string value.")),
  ],
);

const invoiceParamsSchema = s.looseObject(
  "Additional invoice parameters returned by Plisio for white-label invoice responses.",
);

const invoiceSchema = s.object("The normalized invoice object returned by Plisio.", {
  txn_id: s.nullable(s.string("Plisio internal invoice transaction identifier.")),
  invoice_url: s.nullable(s.url("Hosted invoice URL returned by Plisio.")),
  invoice_total_sum: s.nullable(s.string("Total amount due on the invoice, including commission when applicable.")),
  amount: s.nullable(s.string("Invoice amount in the selected cryptocurrency.")),
  pending_amount: s.nullable(s.string("Remaining unpaid amount in the selected cryptocurrency when returned.")),
  currency: s.nullable(s.string("Selected cryptocurrency code for the invoice.")),
  source_currency: s.nullable(s.string("Original fiat or source currency used to price the invoice.")),
  source_amount: s.nullable(s.string("Original fiat or source amount used to price the invoice.")),
  invoice_sum: s.nullable(s.string("Invoice subtotal after Plisio commission rules are applied.")),
  invoice_commission: s.nullable(s.string("Plisio commission charged for the invoice.")),
  params: s.nullable(invoiceParamsSchema),
  qr_code: s.nullable(s.string("Invoice QR code image in base64 format when returned.")),
  verify_hash: s.nullable(s.string("Verification hash returned by Plisio when white-label invoice data is enabled.")),
});

const operationParamsSchema = s.looseObject(
  "Additional invoice or transfer parameters attached to one Plisio operation.",
);

const operationSchema = s.object("A normalized Plisio operation record.", {
  user_id: s.nullable(s.integer("Profile identifier that owns the operation.")),
  shop_id: s.nullable(s.string("Shop identifier associated with the operation.")),
  type: s.nullable(s.string("Operation type returned by Plisio.")),
  status: s.nullable(s.string("Operation status returned by Plisio.")),
  pending_sum: s.nullable(s.string("Unconfirmed incoming amount when returned.")),
  psys_cid: s.nullable(s.string("Plisio cryptocurrency identifier for the operation.")),
  currency: s.nullable(s.string("Cryptocurrency code for the operation.")),
  source_currency: s.nullable(s.string("Source fiat currency for invoice-style operations.")),
  source_rate: s.nullable(s.string("Exchange rate from the cryptocurrency to the source currency.")),
  fee: s.nullable(s.string("Network fee configured on the transfer when returned.")),
  wallet_hash: s.nullable(s.string("Destination hash or invoice hash returned by Plisio.")),
  sendmany: s.nullable(s.unknown("Mass payout recipient pairs when returned.")),
  expire_at_utc: s.nullable(s.integer("Expiration timestamp in UTC when returned.")),
  created_at_utc: s.nullable(s.integer("Creation timestamp in UTC.")),
  amount: s.nullable(s.string("Amount received or transferred by the operation.")),
  sum: s.nullable(s.number("Operation total including commission rules when returned.")),
  commission: s.nullable(s.string("Plisio commission amount when returned.")),
  actual_sum: s.nullable(s.string("Actual incoming amount received by the invoice.")),
  actual_commission: s.nullable(s.string("Actual Plisio commission charged on the completed invoice.")),
  actual_fee: s.nullable(s.string("Actual network fee charged to move invoice funds.")),
  actual_invoice_sum: s.nullable(s.string("Actual net amount credited to the invoice after fees and commission.")),
  tx_id: s.nullable(stringOrStringArraySchema),
  tx_url: s.nullable(stringOrStringArraySchema),
  confirmations: s.nullable(s.integer("Blockchain confirmations counted by Plisio.")),
  status_code: s.nullable(s.integer("Numeric Plisio status code.")),
  parent_id: s.nullable(s.string("Original invoice identifier for duplicate invoice flows.")),
  child_ids: s.nullable(
    s.array(
      "Duplicate child invoice identifiers returned for the original invoice.",
      s.string("One duplicate child invoice identifier."),
    ),
  ),
  params: s.nullable(operationParamsSchema),
  id: s.nullable(s.string("Plisio operation identifier.")),
});

const paginationSchema = s.object("Pagination metadata returned by the operations list endpoint.", {
  totalCount: s.nullable(s.integer("Total number of operations matching the query.")),
  pageCount: s.nullable(s.integer("Total number of available pages.")),
  currentPage: s.nullable(s.integer("Current page number returned by Plisio.")),
  perPage: s.nullable(s.integer("Number of operations returned per page.")),
});

const operationLinksSchema = s.object("Pagination links returned by the operations list endpoint.", {
  self: s.nullable(s.url("Current page URL returned by Plisio.")),
  next: s.nullable(s.url("Next page URL returned by Plisio when another page exists.")),
  prev: s.nullable(s.url("Previous page URL returned by Plisio when one exists.")),
});

const balanceSchema = s.object("A Plisio cryptocurrency balance snapshot.", {
  currency: s.string("Cryptocurrency identifier used to query the balance."),
  balance: s.string("Available cryptocurrency balance returned by Plisio."),
});

const createInvoiceInputSchema = s.object(
  "Input parameters for creating one Plisio invoice.",
  {
    currency: nonEmptyString(
      "Optional Plisio cryptocurrency identifier chosen from the supported cryptocurrencies appendix.",
    ),
    order_name: nonEmptyString("Merchant internal order name shown on the invoice."),
    order_number: stringOrIntegerIdentifierSchema,
    amount: s.number("Invoice amount in cryptocurrency when no fiat conversion is needed."),
    source_currency: nonEmptyString("Source fiat currency code used when Plisio should convert a fiat amount."),
    source_amount: s.number("Source fiat amount used when Plisio should convert an invoice."),
    allowed_psys_cids: nonEmptyString("Comma-separated list of cryptocurrency identifiers allowed for payment."),
    description: nonEmptyString("Merchant invoice description shown by Plisio."),
    callback_url: s.url("Merchant callback URL that receives invoice updates from Plisio."),
    success_callback_url: s.url("Merchant callback URL that receives successful invoice redirects or JSON callbacks."),
    fail_callback_url: s.url("Merchant callback URL that receives failed invoice redirects or JSON callbacks."),
    success_invoice_url: s.url("Button URL shown to the buyer after the invoice succeeds."),
    fail_invoice_url: s.url("Button URL shown to the buyer after the invoice fails."),
    email: s.email("Buyer email address that Plisio can reuse instead of prompting again."),
    language: s.stringEnum("Language locale supported by the Plisio invoice page for this endpoint.", ["en_US"]),
    expire_min: s.positiveInteger("Invoice expiration interval in minutes."),
    return_existing: s.boolean(
      "Whether Plisio should return an existing invoice instead of raising a duplicate error.",
    ),
  },
  {
    optional: [
      "currency",
      "amount",
      "source_currency",
      "source_amount",
      "allowed_psys_cids",
      "description",
      "callback_url",
      "success_callback_url",
      "fail_callback_url",
      "success_invoice_url",
      "fail_invoice_url",
      "email",
      "language",
      "expire_min",
      "return_existing",
    ],
  },
);

const listOperationsInputSchema = s.object(
  "Input parameters for listing Plisio operations and invoices.",
  {
    page: s.positiveInteger("Page number to request from Plisio."),
    limit: s.positiveInteger("Number of operations to return on one page."),
    shop_id: nonEmptyString("Optional Plisio shop identifier used to filter operations."),
    type: s.stringEnum("Operation type filter supported by Plisio.", [
      "cash_in",
      "cash_out",
      "mass_cash_out",
      "invoice",
      "pay_in",
    ]),
    status: s.stringEnum("Operation status filter supported by Plisio.", [
      "new",
      "pending",
      "pending internal",
      "expired",
      "completed",
      "mismatch",
      "error",
      "cancelled",
    ]),
    currency: nonEmptyString("Cryptocurrency identifier used to filter operations."),
    search: nonEmptyString("Full-text search over transaction id, invoice order number, or invoice customer email."),
  },
  {
    optional: ["page", "limit", "shop_id", "type", "status", "currency", "search"],
  },
);

const getOperationInputSchema = s.object("Input parameters for fetching one Plisio operation by id.", {
  id: nonEmptyString("Plisio operation identifier returned by list_operations or another flow."),
});

const getBalanceInputSchema = s.object("Input parameters for fetching one Plisio cryptocurrency balance.", {
  psys_cid: nonEmptyString("Plisio cryptocurrency identifier chosen from the supported cryptocurrencies appendix."),
});

export const plisioActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_invoice",
    operationType: "write",
    description:
      "Create a hosted Plisio invoice for one merchant order using either a crypto amount or a fiat amount that Plisio converts.",
    requiredScopes: [],
    inputSchema: createInvoiceInputSchema,
    outputSchema: s.object("The response returned when Plisio creates an invoice.", {
      invoice: invoiceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_operations",
    operationType: "read",
    description:
      "List Plisio operations and invoices with official pagination, type, status, currency, and search filters.",
    requiredScopes: [],
    inputSchema: listOperationsInputSchema,
    outputSchema: s.object("The response returned when listing Plisio operations.", {
      operations: s.array("Operations returned by Plisio for the requested page.", operationSchema),
      pagination: paginationSchema,
      links: operationLinksSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_operation",
    operationType: "read",
    description: "Fetch one Plisio operation or invoice by its official operation identifier.",
    requiredScopes: [],
    inputSchema: getOperationInputSchema,
    outputSchema: s.object("The response returned when fetching one Plisio operation.", {
      operation: operationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_balance",
    operationType: "read",
    description: "Fetch the current Plisio balance for one supported cryptocurrency identifier.",
    requiredScopes: [],
    inputSchema: getBalanceInputSchema,
    outputSchema: s.object("The response returned when fetching one Plisio balance.", {
      balance: balanceSchema,
    }),
  }),
];
