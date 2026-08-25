import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "invoice_ninja" as const;

export type InvoiceNinjaActionName =
  | "list_clients"
  | "get_client"
  | "create_client"
  | "update_client"
  | "list_invoices"
  | "get_invoice"
  | "create_invoice"
  | "update_invoice"
  | "list_payments"
  | "get_payment"
  | "create_payment";

const resourceId = s.nonEmptyString("The Invoice Ninja hashed resource ID.");
const paginationInputFields = {
  page: s.positiveInteger("The 1-based result page to return."),
  perPage: s.positiveInteger("The number of records to return per page."),
  include: s.nonEmptyString("Comma-separated related resources to include in the response."),
  filter: s.nonEmptyString("A broad search term supported by the Invoice Ninja endpoint."),
  sort: s.nonEmptyString("The Invoice Ninja sort expression, such as id|desc."),
};
const paginationOutput = s.object("Pagination metadata returned by Invoice Ninja.", {
  total: s.nonNegativeInteger("The total number of matching records."),
  count: s.nonNegativeInteger("The number of records in the current page."),
  perPage: s.nonNegativeInteger("The requested or returned page size."),
  currentPage: s.positiveInteger("The current 1-based page number."),
  totalPages: s.nonNegativeInteger("The total number of result pages."),
});

const contactInput = s.object(
  "An Invoice Ninja client contact.",
  {
    firstName: s.string("The contact's first name."),
    lastName: s.string("The contact's last name."),
    email: s.email("The contact's email address."),
    phone: s.string("The contact's phone number."),
    sendEmail: s.boolean("Whether the contact should receive Invoice Ninja emails."),
  },
  { optional: ["firstName", "lastName", "email", "phone", "sendEmail"] },
);
const contactsInput = s.array("The complete client contact list.", contactInput, {
  minItems: 1,
});
const clientWriteFields = {
  name: s.string("The client company or organization name."),
  contacts: contactsInput,
  website: s.url("The client website URL."),
  phone: s.string("The client phone number."),
  privateNotes: s.string("Notes visible only to Invoice Ninja users."),
  publicNotes: s.string("Notes visible to the client."),
  address1: s.string("The first billing address line."),
  address2: s.string("The second billing address line."),
  city: s.string("The billing city."),
  state: s.string("The billing state, province, or locality."),
  postalCode: s.string("The billing postal code."),
  countryId: s.positiveInteger("The Invoice Ninja numeric country ID."),
  countryCode: s.string("The ISO 3166-2 or ISO 3166-3 country code.", {
    minLength: 2,
    maxLength: 3,
  }),
  vatNumber: s.string("The client's VAT number."),
  idNumber: s.string("The client's tax or business registration number."),
  number: s.string("A custom client number."),
};
const createClientInput = s.object("The input for creating an Invoice Ninja client.", clientWriteFields, {
  optional: [
    "name",
    "contacts",
    "website",
    "phone",
    "privateNotes",
    "publicNotes",
    "address1",
    "address2",
    "city",
    "state",
    "postalCode",
    "countryId",
    "countryCode",
    "vatNumber",
    "idNumber",
    "number",
  ],
});

const contactOutput = s.looseObject("An Invoice Ninja client contact.", {
  id: resourceId,
  first_name: s.nullableString("The contact's first name."),
  last_name: s.nullableString("The contact's last name."),
  email: s.nullableString("The contact's email address."),
  phone: s.nullableString("The contact's phone number."),
});
const clientOutput = s.looseObject("An Invoice Ninja client object.", {
  id: resourceId,
  name: s.nullableString("The client company or organization name."),
  number: s.nullableString("The client number."),
  balance: s.nullableNumber("The client's outstanding balance."),
  paid_to_date: s.nullableNumber("The total amount paid by the client."),
  contacts: s.array("Contacts attached to the client.", contactOutput),
});

const lineItemInput = s.object(
  "An Invoice Ninja invoice line item.",
  {
    quantity: s.number("The line item quantity."),
    cost: s.number("The line item unit cost."),
    productKey: s.string("The product key displayed on the invoice."),
    notes: s.string("The line item description."),
    discount: s.number("The fixed or percentage discount applied to the line item."),
    isAmountDiscount: s.boolean("Whether the line item discount is a fixed amount."),
    taxName1: s.string("The first tax name."),
    taxRate1: s.number("The first tax rate."),
    taxName2: s.string("The second tax name."),
    taxRate2: s.number("The second tax rate."),
  },
  {
    optional: [
      "quantity",
      "cost",
      "productKey",
      "notes",
      "discount",
      "isAmountDiscount",
      "taxName1",
      "taxRate1",
      "taxName2",
      "taxRate2",
    ],
  },
);
const invoiceWriteFields = {
  clientId: resourceId,
  lineItems: s.array("The invoice line items.", lineItemInput),
  date: s.date("The invoice date."),
  dueDate: s.date("The invoice due date."),
  number: s.string("A custom invoice number."),
  purchaseOrderNumber: s.string("The purchase order number."),
  terms: s.string("The invoice terms."),
  publicNotes: s.string("Notes visible to the client."),
  privateNotes: s.string("Notes visible only to Invoice Ninja users."),
  footer: s.string("The invoice footer text."),
  discount: s.number("The invoice-level fixed or percentage discount."),
  isAmountDiscount: s.boolean("Whether the invoice discount is a fixed amount."),
  partial: s.number("The requested deposit or partial payment amount."),
  sendEmail: s.boolean("Whether Invoice Ninja should save and email the invoice."),
  markSent: s.boolean("Whether Invoice Ninja should mark the invoice as sent."),
  paid: s.boolean("Whether Invoice Ninja should mark the invoice as paid."),
  amountPaid: s.number("The amount Invoice Ninja should record as paid."),
};
const invoiceOutput = s.looseObject("An Invoice Ninja invoice object.", {
  id: resourceId,
  client_id: resourceId,
  number: s.nullableString("The invoice number."),
  status_id: s.union([s.string("The invoice status ID."), s.integer("The invoice status ID.")], {
    description: "The Invoice Ninja invoice status ID.",
  }),
  amount: s.nullableNumber("The total invoice amount."),
  balance: s.nullableNumber("The outstanding invoice balance."),
  date: s.nullableString("The invoice date."),
  due_date: s.nullableString("The invoice due date."),
});

const paymentAllocationInput = s.object("An amount applied to an invoice.", {
  invoiceId: resourceId,
  amount: s.number("The amount applied to the invoice.", { exclusiveMinimum: 0 }),
});
const paymentOutput = s.looseObject("An Invoice Ninja payment object.", {
  id: resourceId,
  client_id: resourceId,
  number: s.nullableString("The payment number."),
  amount: s.nullableNumber("The payment amount."),
  applied: s.nullableNumber("The amount applied to invoices or credits."),
  date: s.nullableString("The payment date."),
  transaction_reference: s.nullableString("The payment transaction reference."),
});

export const invoiceNinjaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_clients",
    description: "List Invoice Ninja clients with optional search and pagination filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for listing Invoice Ninja clients.",
      {
        ...paginationInputFields,
        name: s.string("Filter clients by company or organization name."),
        email: s.email("Filter clients by contact email address."),
        number: s.string("Filter clients by client number."),
      },
      { optional: ["page", "perPage", "include", "filter", "sort", "name", "email", "number"] },
    ),
    outputSchema: s.object("The Invoice Ninja client list response.", {
      clients: s.array("Clients returned by Invoice Ninja.", clientOutput),
      pagination: paginationOutput,
    }),
  }),
  defineProviderAction(service, {
    name: "get_client",
    description: "Retrieve one Invoice Ninja client by hashed ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving an Invoice Ninja client.",
      { clientId: resourceId, include: paginationInputFields.include },
      { optional: ["include"] },
    ),
    outputSchema: s.object("The Invoice Ninja client response.", { client: clientOutput }),
  }),
  defineProviderAction(service, {
    name: "create_client",
    description: "Create an Invoice Ninja client.",
    requiredScopes: [],
    inputSchema: createClientInput,
    outputSchema: s.object("The created Invoice Ninja client response.", {
      client: clientOutput,
    }),
  }),
  defineProviderAction(service, {
    name: "update_client",
    description: "Update an Invoice Ninja client while replacing its complete contact list.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for updating an Invoice Ninja client.",
      { clientId: resourceId, ...clientWriteFields },
      {
        optional: [
          "name",
          "website",
          "phone",
          "privateNotes",
          "publicNotes",
          "address1",
          "address2",
          "city",
          "state",
          "postalCode",
          "countryId",
          "countryCode",
          "vatNumber",
          "idNumber",
          "number",
        ],
      },
    ),
    outputSchema: s.object("The updated Invoice Ninja client response.", {
      client: clientOutput,
    }),
  }),
  defineProviderAction(service, {
    name: "list_invoices",
    description: "List Invoice Ninja invoices with optional client, status, date, and search filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for listing Invoice Ninja invoices.",
      {
        ...paginationInputFields,
        clientId: resourceId,
        statusId: s.integer("The invoice status ID from 1 through 6.", {
          minimum: 1,
          maximum: 6,
        }),
        clientStatuses: s.array(
          "Client-facing invoice statuses to include.",
          s.stringEnum("A client-facing invoice status.", ["all", "paid", "unpaid", "overdue"]),
          { minItems: 1 },
        ),
        number: s.string("Filter invoices by invoice number."),
        date: s.date("Return invoices on or after this invoice date."),
        startDate: s.date("The first date in an inclusive invoice date range."),
        endDate: s.date("The last date in an inclusive invoice date range."),
      },
      {
        optional: [
          "page",
          "perPage",
          "include",
          "filter",
          "sort",
          "clientId",
          "statusId",
          "clientStatuses",
          "number",
          "date",
          "startDate",
          "endDate",
        ],
      },
    ),
    outputSchema: s.object("The Invoice Ninja invoice list response.", {
      invoices: s.array("Invoices returned by Invoice Ninja.", invoiceOutput),
      pagination: paginationOutput,
    }),
  }),
  defineProviderAction(service, {
    name: "get_invoice",
    description: "Retrieve one Invoice Ninja invoice by hashed ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving an Invoice Ninja invoice.",
      { invoiceId: resourceId, include: paginationInputFields.include },
      { optional: ["include"] },
    ),
    outputSchema: s.object("The Invoice Ninja invoice response.", { invoice: invoiceOutput }),
  }),
  defineProviderAction(service, {
    name: "create_invoice",
    description: "Create an Invoice Ninja invoice for a client.",
    requiredScopes: [],
    inputSchema: s.object("The input for creating an Invoice Ninja invoice.", invoiceWriteFields, {
      optional: [
        "lineItems",
        "date",
        "dueDate",
        "number",
        "purchaseOrderNumber",
        "terms",
        "publicNotes",
        "privateNotes",
        "footer",
        "discount",
        "isAmountDiscount",
        "partial",
        "sendEmail",
        "markSent",
        "paid",
        "amountPaid",
      ],
    }),
    outputSchema: s.object("The created Invoice Ninja invoice response.", {
      invoice: invoiceOutput,
    }),
  }),
  defineProviderAction(service, {
    name: "update_invoice",
    description: "Update documented fields or status actions on an Invoice Ninja invoice.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for updating an Invoice Ninja invoice.",
      { invoiceId: resourceId, ...invoiceWriteFields },
      {
        optional: [
          "clientId",
          "lineItems",
          "date",
          "dueDate",
          "number",
          "purchaseOrderNumber",
          "terms",
          "publicNotes",
          "privateNotes",
          "footer",
          "discount",
          "isAmountDiscount",
          "partial",
          "sendEmail",
          "markSent",
          "paid",
          "amountPaid",
        ],
      },
    ),
    outputSchema: s.object("The updated Invoice Ninja invoice response.", {
      invoice: invoiceOutput,
    }),
  }),
  defineProviderAction(service, {
    name: "list_payments",
    description: "List Invoice Ninja payments with optional client and search filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for listing Invoice Ninja payments.",
      {
        ...paginationInputFields,
        clientId: resourceId,
        number: s.string("Filter payments by payment number."),
      },
      {
        optional: ["page", "perPage", "include", "filter", "sort", "clientId", "number"],
      },
    ),
    outputSchema: s.object("The Invoice Ninja payment list response.", {
      payments: s.array("Payments returned by Invoice Ninja.", paymentOutput),
      pagination: paginationOutput,
    }),
  }),
  defineProviderAction(service, {
    name: "get_payment",
    description: "Retrieve one Invoice Ninja payment by hashed ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving an Invoice Ninja payment.",
      { paymentId: resourceId, include: paginationInputFields.include },
      { optional: ["include"] },
    ),
    outputSchema: s.object("The Invoice Ninja payment response.", { payment: paymentOutput }),
  }),
  defineProviderAction(service, {
    name: "create_payment",
    description: "Record a payment in Invoice Ninja and optionally apply it to invoices.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for creating an Invoice Ninja payment.",
      {
        clientId: resourceId,
        amount: s.number("The total payment amount.", { exclusiveMinimum: 0 }),
        paymentTypeId: s.integer("The Invoice Ninja payment type ID from 1 through 33.", {
          minimum: 1,
          maximum: 33,
        }),
        date: s.date("The payment date."),
        transactionReference: s.string("The payment gateway or bank transaction reference."),
        privateNotes: s.string("Notes visible only to Invoice Ninja users."),
        number: s.string("A custom payment number."),
        invoices: s.array("Invoice allocations for the payment.", paymentAllocationInput, {
          minItems: 1,
        }),
        emailReceipt: s.boolean("Whether Invoice Ninja should email the payment receipt."),
      },
      {
        optional: [
          "amount",
          "paymentTypeId",
          "date",
          "transactionReference",
          "privateNotes",
          "number",
          "invoices",
          "emailReceipt",
        ],
      },
    ),
    outputSchema: s.object("The created Invoice Ninja payment response.", {
      payment: paymentOutput,
    }),
  }),
];
