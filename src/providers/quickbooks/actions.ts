import type { ActionDefinition, JsonSchema } from "../../core/types.ts";
import type { QuickbooksResource, QuickbooksResourceOperation } from "./resources.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { quickbooksResources, resourceActionName } from "./resources.ts";
import {
  activeStatus,
  additionalFields,
  descending,
  entityId,
  entityOutput,
  isoDate,
  listOutput,
  pagingFields,
  postalAddress,
  reference,
  requiredScopes,
  service,
  sparse,
  syncToken,
} from "./schemas.ts";

const customerFields = {
  display_name: s.nonEmptyString("The customer's display name, unique across customers, vendors and employees."),
  given_name: s.string("First name."),
  family_name: s.string("Last name."),
  company_name: s.string("Company name."),
  email: s.email("Primary email address."),
  phone: s.string("Primary phone number."),
  notes: s.string("Free-form notes."),
  billing_address: postalAddress("Billing address."),
  shipping_address: postalAddress("Shipping address."),
};

const invoiceLine = s.object(
  {
    amount: s.number("The line total, usually quantity times unit price."),
    description: s.string("Line description."),
    item_ref: reference("The product or service sold on this line (ItemRef)."),
    quantity: s.number("Quantity sold."),
    unit_price: s.number("Price per unit."),
  },
  {
    required: ["amount", "item_ref"],
    description: "A sales line (DetailType SalesItemLineDetail).",
  },
);

const invoiceFields = {
  lines: s.array(invoiceLine, { minItems: 1, description: "The invoice lines." }),
  txn_date: s.describe(isoDate, "The invoice date. Defaults to today in QuickBooks."),
  due_date: s.describe(isoDate, "The payment due date."),
  doc_number: s.string("The invoice number shown to the customer. QuickBooks assigns one when omitted."),
  private_note: s.string("A note visible only inside QuickBooks."),
  customer_memo: s.string("A message printed on the invoice for the customer."),
  bill_email: s.email("The email address the invoice is sent to."),
  currency_ref: reference("The currency (CurrencyRef) when multicurrency is enabled."),
};

const paymentFields = {
  txn_date: s.describe(isoDate, "The payment date. Defaults to today in QuickBooks."),
  payment_method_ref: reference("The payment method (PaymentMethodRef)."),
  deposit_to_account_ref: reference("The account the payment is deposited to (DepositToAccountRef)."),
  payment_ref_num: s.string("A reference number such as a check number."),
  private_note: s.string("A note visible only inside QuickBooks."),
  applied_to: s.array(
    s.object(
      {
        invoice_id: entityId,
        amount: s.number("The amount applied to this invoice."),
      },
      { required: ["invoice_id", "amount"] },
    ),
    { description: "Invoices this payment settles. Leave empty to record an unapplied payment." },
  ),
};

const accountTypes = [
  "Bank",
  "Other Current Asset",
  "Fixed Asset",
  "Other Asset",
  "Accounts Receivable",
  "Equity",
  "Expense",
  "Other Expense",
  "Cost of Goods Sold",
  "Accounts Payable",
  "Credit Card",
  "Long Term Liability",
  "Other Current Liability",
  "Income",
  "Other Income",
];

const handWrittenActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_company_info",
    operationType: "read",
    requiredScopes,
    description: "Get the connected company's profile: name, legal name, address, fiscal year start and country.",
    inputSchema: s.object({}, { description: "No input is required." }),
    outputSchema: entityOutput("company_info", "The CompanyInfo record."),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    operationType: "read",
    requiredScopes,
    description: "List customers, optionally filtered by name or active status.",
    inputSchema: s.object(
      {
        display_name_contains: s.string("Return customers whose display name contains this text."),
        status: activeStatus,
        order_by: s.stringEnum(["DisplayName", "MetaData.CreateTime", "MetaData.LastUpdatedTime"], {
          default: "DisplayName",
        }),
        descending,
        ...pagingFields,
      },
      { description: "Customer list filters." },
    ),
    outputSchema: listOutput("The matching customers."),
    followUpActions: ["quickbooks.get_customer", "quickbooks.create_invoice"],
  }),
  defineProviderAction(service, {
    name: "get_customer",
    operationType: "read",
    requiredScopes,
    description: "Get one customer by ID, including its current SyncToken.",
    inputSchema: s.object({ id: entityId }, { required: ["id"] }),
    outputSchema: entityOutput("customer", "The Customer record."),
  }),
  defineProviderAction(service, {
    name: "create_customer",
    operationType: "write",
    requiredScopes,
    description: "Create a customer.",
    inputSchema: s.object(
      { ...customerFields, additional_fields: additionalFields },
      { required: ["display_name"], description: "Customer to create." },
    ),
    outputSchema: entityOutput("customer", "The created Customer record."),
    followUpActions: ["quickbooks.create_invoice"],
  }),
  defineProviderAction(service, {
    name: "update_customer",
    operationType: "write",
    requiredScopes,
    description:
      "Update a customer. Customers cannot be deleted in QuickBooks; set `additional_fields.Active` to false to deactivate one.",
    inputSchema: s.object(
      {
        id: entityId,
        sync_token: syncToken,
        sparse,
        ...customerFields,
        display_name: s.nonEmptyString("The customer's new display name."),
        additional_fields: additionalFields,
      },
      { required: ["id"], description: "Customer update." },
    ),
    outputSchema: entityOutput("customer", "The updated Customer record."),
  }),

  defineProviderAction(service, {
    name: "list_invoices",
    operationType: "read",
    requiredScopes,
    description: "List invoices, optionally filtered by customer, number, date range or open balance.",
    inputSchema: s.object(
      {
        customer_id: s.describe(entityId, "Only invoices for this customer ID."),
        doc_number: s.string("Only the invoice with this number."),
        txn_date_from: s.describe(isoDate, "Only invoices dated on or after this day."),
        txn_date_to: s.describe(isoDate, "Only invoices dated on or before this day."),
        unpaid_only: s.boolean({ default: false, description: "Only invoices with an open balance." }),
        order_by: s.stringEnum(["TxnDate", "DueDate", "MetaData.CreateTime", "MetaData.LastUpdatedTime"], {
          default: "TxnDate",
        }),
        descending,
        ...pagingFields,
      },
      { description: "Invoice list filters." },
    ),
    outputSchema: listOutput("The matching invoices."),
    followUpActions: ["quickbooks.get_invoice"],
  }),
  defineProviderAction(service, {
    name: "get_invoice",
    operationType: "read",
    requiredScopes,
    description: "Get one invoice by ID, including its lines, balance and current SyncToken.",
    inputSchema: s.object({ id: entityId }, { required: ["id"] }),
    outputSchema: entityOutput("invoice", "The Invoice record."),
  }),
  defineProviderAction(service, {
    name: "create_invoice",
    operationType: "write",
    requiredScopes,
    description: "Create an invoice for a customer from one or more sales lines.",
    inputSchema: s.object(
      {
        customer_ref: reference("The customer being invoiced (CustomerRef)."),
        ...invoiceFields,
        additional_fields: additionalFields,
      },
      { required: ["customer_ref", "lines"], description: "Invoice to create." },
    ),
    outputSchema: entityOutput("invoice", "The created Invoice record."),
    followUpActions: ["quickbooks.create_payment"],
  }),
  defineProviderAction(service, {
    name: "update_invoice",
    operationType: "write",
    requiredScopes,
    description:
      "Update an invoice. With the default sparse update only the supplied fields change; a supplied `lines` array replaces the invoice's lines.",
    inputSchema: s.object(
      {
        id: entityId,
        sync_token: syncToken,
        sparse,
        customer_ref: reference("The customer being invoiced (CustomerRef)."),
        ...invoiceFields,
        lines: s.array(invoiceLine, { minItems: 1, description: "The complete replacement set of invoice lines." }),
        additional_fields: additionalFields,
      },
      { required: ["id"], description: "Invoice update." },
    ),
    outputSchema: entityOutput("invoice", "The updated Invoice record."),
  }),
  defineProviderAction(service, {
    name: "void_invoice",
    operationType: "destructive",
    requiredScopes,
    description:
      "Void an invoice. QuickBooks keeps the record but zeroes its amounts, so the invoice no longer counts toward balances.",
    inputSchema: s.object({ id: entityId, sync_token: syncToken }, { required: ["id"] }),
    outputSchema: entityOutput("invoice", "The voided Invoice record."),
  }),
  defineProviderAction(service, {
    name: "delete_invoice",
    operationType: "destructive",
    requiredScopes,
    description: "Permanently delete an invoice. This cannot be undone; void the invoice instead to keep a record.",
    inputSchema: s.object({ id: entityId, sync_token: syncToken }, { required: ["id"] }),
    outputSchema: s.object(
      {
        deleted: s.boolean("Whether QuickBooks reported the invoice as deleted."),
        invoice: s.looseObject(
          { Id: s.string("The deleted invoice ID."), status: s.string("The status QuickBooks reported.") },
          { description: "The deletion result returned by QuickBooks." },
        ),
      },
      { required: ["deleted", "invoice"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_payments",
    operationType: "read",
    requiredScopes,
    description: "List customer payments, optionally filtered by customer or date range.",
    inputSchema: s.object(
      {
        customer_id: s.describe(entityId, "Only payments from this customer ID."),
        txn_date_from: s.describe(isoDate, "Only payments dated on or after this day."),
        txn_date_to: s.describe(isoDate, "Only payments dated on or before this day."),
        order_by: s.stringEnum(["TxnDate", "MetaData.CreateTime", "MetaData.LastUpdatedTime"], {
          default: "TxnDate",
        }),
        descending,
        ...pagingFields,
      },
      { description: "Payment list filters." },
    ),
    outputSchema: listOutput("The matching payments."),
    followUpActions: ["quickbooks.get_payment"],
  }),
  defineProviderAction(service, {
    name: "get_payment",
    operationType: "read",
    requiredScopes,
    description: "Get one payment by ID, including the invoices it was applied to.",
    inputSchema: s.object({ id: entityId }, { required: ["id"] }),
    outputSchema: entityOutput("payment", "The Payment record."),
  }),
  defineProviderAction(service, {
    name: "create_payment",
    operationType: "write",
    requiredScopes,
    description: "Record a customer payment, optionally applying it to specific invoices.",
    inputSchema: s.object(
      {
        customer_ref: reference("The paying customer (CustomerRef)."),
        total_amount: s.number("The total amount received."),
        ...paymentFields,
        additional_fields: additionalFields,
      },
      { required: ["customer_ref", "total_amount"], description: "Payment to record." },
    ),
    outputSchema: entityOutput("payment", "The created Payment record."),
  }),

  defineProviderAction(service, {
    name: "list_accounts",
    operationType: "read",
    requiredScopes,
    description: "List accounts from the chart of accounts, optionally filtered by type or name.",
    inputSchema: s.object(
      {
        account_type: s.stringEnum(accountTypes, { description: "Only accounts of this type." }),
        name_contains: s.string("Only accounts whose name contains this text."),
        status: activeStatus,
        order_by: s.stringEnum(["Name", "MetaData.CreateTime", "MetaData.LastUpdatedTime"], { default: "Name" }),
        descending,
        ...pagingFields,
      },
      { description: "Account list filters." },
    ),
    outputSchema: listOutput("The matching accounts."),
    followUpActions: ["quickbooks.get_account"],
  }),
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    requiredScopes,
    description: "Get one account by ID.",
    inputSchema: s.object({ id: entityId }, { required: ["id"] }),
    outputSchema: entityOutput("account", "The Account record."),
  }),
];

const currencyCode = s.string("The three-letter ISO 4217 source currency code, such as EUR.");
const entityType = s.string("The QuickBooks entity type of the linked record, such as Invoice.");
const objectName = s.stringEnum(
  Object.values(quickbooksResources).map((resource) => resource.entity.name),
  { description: "The QuickBooks entity name, such as Invoice or Bill." },
);
const body = (description: string): JsonSchema => s.unknownObject(description);

const reportNames = [
  "ProfitAndLoss",
  "ProfitAndLossDetail",
  "BalanceSheet",
  "CashFlow",
  "TrialBalance",
  "GeneralLedger",
  "JournalReport",
  "TransactionList",
  "AgedReceivables",
  "AgedReceivableDetail",
  "AgedPayables",
  "AgedPayableDetail",
  "CustomerSales",
  "CustomerIncome",
  "CustomerBalance",
  "CustomerBalanceDetail",
  "VendorExpenses",
  "VendorBalance",
  "VendorBalanceDetail",
  "ItemSales",
  "ClassSales",
  "DepartmentSales",
  "InventoryValuationSummary",
  "TaxSummary",
  "AccountListDetail",
];

const recordOutput = s.object(
  {
    record: s.looseObject({}, { description: "The QuickBooks record." }),
    deleted: s.boolean("Whether the record was deleted or deactivated. Only set by delete_record."),
  },
  { required: ["record"] },
);

export const extraActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "ping",
    operationType: "read",
    requiredScopes,
    description: "Check that the connection works by reading the company profile.",
    inputSchema: s.object({}, { description: "No input is required." }),
    outputSchema: s.object(
      {
        ok: s.boolean("Always true when the call succeeds."),
        realm_id: s.string("The connected company ID."),
        company_name: s.nullableString("The company name."),
      },
      { required: ["ok", "realm_id", "company_name"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_changes",
    operationType: "read",
    requiredScopes,
    description:
      "List records of the given entities that changed since a point in time (change data capture). QuickBooks looks back at most 30 days and returns at most 1000 records per call.",
    inputSchema: s.object(
      {
        entities: s.array(s.string("An entity name such as Invoice."), {
          minItems: 1,
          description: "Entities to check.",
        }),
        changed_since: s.dateTime("Return records changed on or after this time."),
      },
      { required: ["entities", "changed_since"] },
    ),
    outputSchema: s.object(
      { changes: s.looseObject({}, { description: "The CDCResponse in QuickBooks' native shape." }) },
      { required: ["changes"] },
    ),
  }),
  defineProviderAction(service, {
    name: "batch",
    operationType: "destructive",
    requiredScopes,
    description:
      "Run up to 30 operations in one request. Each item is either a read-only query or a create, update or delete of one entity. Items do not roll back each other when one fails.",
    inputSchema: s.object(
      {
        items: s.array(
          s.object(
            {
              id: s.nonEmptyString("A caller-chosen ID, echoed back to match the result to the item."),
              query: s.string("A read-only `select` statement. Use instead of operation, entity and body."),
              operation: s.stringEnum(["create", "update", "delete"]),
              entity: s.string("The entity name for a write, such as Customer."),
              body: body("The entity in its native shape. A delete needs Id and SyncToken."),
            },
            { required: ["id"] },
          ),
          { minItems: 1, maxItems: 30, description: "The operations to run." },
        ),
      },
      { required: ["items"] },
    ),
    outputSchema: s.object(
      {
        items: s.array(s.unknownObject("One BatchItemResponse in native shape."), {
          description: "One result per item.",
        }),
      },
      { required: ["items"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_exchange_rate",
    operationType: "read",
    requiredScopes,
    description: "Get the exchange rate from a currency to the company's home currency.",
    inputSchema: s.object(
      { currency_code: currencyCode, as_of_date: s.describe(isoDate, "The rate date. Defaults to today.") },
      { required: ["currency_code"] },
    ),
    outputSchema: s.object(
      { exchange_rate: s.looseObject({}, { description: "The ExchangeRate record." }) },
      { required: ["exchange_rate"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_preferences",
    operationType: "read",
    requiredScopes,
    description: "Get the company preferences: accounting, sales, tax, currency and other settings.",
    inputSchema: s.object({}, { description: "No input is required." }),
    outputSchema: entityOutput("preferences", "The Preferences record."),
  }),
  defineProviderAction(service, {
    name: "get_report",
    operationType: "read",
    requiredScopes,
    description:
      "Run any QuickBooks report. Use `parameters` for report-specific options such as customer, vendor or account filters.",
    inputSchema: s.object(
      {
        report_name: s.stringEnum(reportNames, { description: "The report to run." }),
        start_date: s.describe(isoDate, "First day of the report period."),
        end_date: s.describe(isoDate, "Last day of the report period."),
        accounting_method: s.stringEnum(["Cash", "Accrual"]),
        summarize_column_by: s.string("How columns are broken out, such as Month or Customers."),
        parameters: s.unknownObject("Extra report query parameters by name, such as `customer` or `minorversion`."),
      },
      { required: ["report_name"] },
    ),
    outputSchema: s.object(
      { report: s.looseObject({}, { description: "The report in QuickBooks' native shape." }) },
      { required: ["report"] },
    ),
  }),
  defineProviderAction(service, {
    name: "upload_attachment",
    operationType: "write",
    requiredScopes,
    description: "Upload a file to QuickBooks, optionally attached to a transaction or other record.",
    inputSchema: s.object(
      {
        file_name: s.nonEmptyString("The file name including its extension."),
        content_type: s.nonEmptyString("The MIME type, such as application/pdf."),
        content_base64: s.nonEmptyString("The file content encoded as base64."),
        note: s.string("A note stored with the attachment."),
        entity_type: entityType,
        entity_id: s.nonEmptyString("The ID of the record to attach the file to. Needs entity_type."),
        include_on_send: s.boolean("Whether to include the file when the record is emailed."),
      },
      { required: ["file_name", "content_type", "content_base64"] },
    ),
    outputSchema: entityOutput("attachment", "The created Attachable record."),
  }),
  defineProviderAction(service, {
    name: "list_attachments",
    operationType: "read",
    requiredScopes,
    description: "List attachments, optionally only those linked to one record.",
    inputSchema: s.object(
      {
        entity_type: entityType,
        entity_id: s.nonEmptyString("The linked record ID. Needs entity_type."),
        ...pagingFields,
      },
      { description: "Attachment filters." },
    ),
    outputSchema: listOutput("The Attachable records."),
  }),
  defineProviderAction(service, {
    name: "get_attachment",
    operationType: "read",
    requiredScopes,
    description: "Get an attachment's metadata by ID.",
    inputSchema: s.object({ id: entityId }, { required: ["id"] }),
    outputSchema: entityOutput("attachment", "The Attachable record."),
  }),
  defineProviderAction(service, {
    name: "get_attachment_download_url",
    operationType: "read",
    requiredScopes,
    description: "Get a temporary URL to download an attachment's file.",
    inputSchema: s.object({ id: entityId }, { required: ["id"] }),
    outputSchema: s.object(
      { download_url: s.nullableString("A short-lived download URL.") },
      { required: ["download_url"] },
    ),
  }),
  defineProviderAction(service, {
    name: "update_attachment",
    operationType: "write",
    requiredScopes,
    description: "Update an attachment's metadata, such as its note or file name.",
    inputSchema: s.object(
      { id: entityId, sync_token: syncToken, sparse, body: body("The Attachable fields to change.") },
      { required: ["id", "body"] },
    ),
    outputSchema: entityOutput("attachment", "The updated Attachable record."),
  }),
  defineProviderAction(service, {
    name: "delete_attachment",
    operationType: "destructive",
    requiredScopes,
    description: "Permanently delete an attachment.",
    inputSchema: s.object({ id: entityId, sync_token: syncToken }, { required: ["id"] }),
    outputSchema: s.object(
      { deleted: s.boolean("Whether QuickBooks reported the attachment as deleted."), attachment: s.looseObject({}) },
      { required: ["deleted", "attachment"] },
    ),
  }),
  defineProviderAction(service, {
    name: "void_payment",
    operationType: "destructive",
    requiredScopes,
    description: "Void a payment. QuickBooks keeps the record but zeroes its amounts.",
    inputSchema: s.object({ id: entityId, sync_token: syncToken }, { required: ["id"] }),
    outputSchema: entityOutput("payment", "The voided Payment record."),
  }),
  defineProviderAction(service, {
    name: "list_records",
    operationType: "read",
    requiredScopes,
    description: "List records of any supported entity by name. Prefer the entity-specific list actions.",
    inputSchema: s.object(
      {
        object_name: objectName,
        name_contains: s.string("Match the entity's name column, where it has one."),
        status: s.stringEnum(["active", "inactive", "all"]),
        txn_date_from: isoDate,
        txn_date_to: isoDate,
        order_by: s.string("A column to sort by."),
        descending,
        ...pagingFields,
      },
      { required: ["object_name"] },
    ),
    outputSchema: listOutput("The matching records."),
  }),
  defineProviderAction(service, {
    name: "get_record",
    operationType: "read",
    requiredScopes,
    description: "Get one record of any supported entity by name and ID.",
    inputSchema: s.object({ object_name: objectName, id: entityId }, { required: ["object_name", "id"] }),
    outputSchema: recordOutput,
  }),
  defineProviderAction(service, {
    name: "create_record",
    operationType: "write",
    requiredScopes,
    description: "Create a record of any supported entity by name.",
    inputSchema: s.object(
      { object_name: objectName, body: body("The record in QuickBooks' native shape.") },
      { required: ["object_name", "body"] },
    ),
    outputSchema: recordOutput,
  }),
  defineProviderAction(service, {
    name: "update_record",
    operationType: "write",
    requiredScopes,
    description: "Update a record of any supported entity by name.",
    inputSchema: s.object(
      {
        object_name: objectName,
        id: entityId,
        sync_token: syncToken,
        sparse,
        body: body("The fields to change in native shape."),
      },
      { required: ["object_name", "id", "body"] },
    ),
    outputSchema: recordOutput,
  }),
  defineProviderAction(service, {
    name: "delete_record",
    operationType: "destructive",
    requiredScopes,
    description:
      "Delete a record of any supported entity by name. Entities QuickBooks cannot delete are deactivated instead.",
    inputSchema: s.object(
      { object_name: objectName, id: entityId, sync_token: syncToken },
      { required: ["object_name", "id"] },
    ),
    outputSchema: recordOutput,
  }),
];

function bodySchema(resource: QuickbooksResource, verb: string): JsonSchema {
  const hint = resource.createHint && verb === "create" ? ` Required by QuickBooks: ${resource.createHint}.` : "";
  return s.unknownObject(
    `The ${resource.entity.name} fields in QuickBooks' native PascalCase shape.${hint} Use the get action on an existing record to see the full shape.`,
  );
}

function listInput(resource: QuickbooksResource): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  if (resource.nameColumn) {
    properties.name_contains = s.string(`Return records whose ${resource.nameColumn} contains this text.`);
  }
  if (resource.hasActive) {
    properties.status = activeStatus;
  }
  if (resource.hasTxnDate) {
    properties.txn_date_from = s.describe(isoDate, "Only records dated on or after this day.");
    properties.txn_date_to = s.describe(isoDate, "Only records dated on or before this day.");
  }
  properties.order_by = s.string(
    `A ${resource.entity.name} column to sort by, such as \`MetaData.LastUpdatedTime\`.${resource.defaultOrder ? ` Defaults to ${resource.defaultOrder}.` : ""}`,
  );
  properties.descending = descending;
  return s.object({ ...properties, ...pagingFields }, { description: `${resource.entity.name} list filters.` });
}

function resourceAction(resource: QuickbooksResource, operation: QuickbooksResourceOperation): ActionDefinition {
  const name = resourceActionName(resource, operation);
  const { key, label, entity } = resource;
  switch (operation) {
    case "list":
      return defineProviderAction(service, {
        name,
        operationType: "read",
        requiredScopes,
        description: `List ${label}s, optionally filtered.`,
        inputSchema: listInput(resource),
        outputSchema: listOutput(`The matching ${entity.name} records.`),
      });
    case "get":
      return defineProviderAction(service, {
        name,
        operationType: "read",
        requiredScopes,
        description: `Get one ${label} by its ID.`,
        inputSchema: s.object({ id: entityId }, { required: ["id"] }),
        outputSchema: entityOutput(key, `The ${entity.name} record.`),
      });
    case "create":
      return defineProviderAction(service, {
        name,
        operationType: "write",
        requiredScopes,
        description: `Create a ${label}.`,
        inputSchema: s.object({ body: bodySchema(resource, "create") }, { required: ["body"] }),
        outputSchema: entityOutput(key, `The created ${entity.name} record.`),
      });
    case "update":
      return defineProviderAction(service, {
        name,
        operationType: "write",
        requiredScopes,
        description: `Update a ${label}. With the default sparse update only the supplied fields change.`,
        inputSchema: s.object(
          { id: entityId, sync_token: syncToken, sparse, body: bodySchema(resource, "update") },
          { required: ["id", "body"] },
        ),
        outputSchema: entityOutput(key, `The updated ${entity.name} record.`),
      });
    case "delete":
      return defineProviderAction(service, {
        name,
        operationType: "destructive",
        requiredScopes,
        description:
          resource.remove === "delete"
            ? `Permanently delete a ${label}. This cannot be undone.`
            : `Deactivate a ${label} by setting Active to false. QuickBooks does not delete this kind of record.`,
        inputSchema: s.object({ id: entityId, sync_token: syncToken }, { required: ["id"] }),
        outputSchema: s.object(
          {
            deleted: s.boolean(
              resource.remove === "delete"
                ? "Whether QuickBooks reported the record as deleted."
                : "Whether the record was deactivated.",
            ),
            [key]: s.looseObject({}, { description: `The ${entity.name} record or deletion result.` }),
          },
          { required: ["deleted", key] },
        ),
      });
  }
}

/** Generated CRUD actions for every table entry; the hand-written action with the same name wins in `actions.ts`. */
export const resourceActions: ActionDefinition[] = Object.values(quickbooksResources).flatMap((resource) =>
  resource.operations.map((operation) => resourceAction(resource, operation)),
);

const handWrittenNames = new Set([...handWrittenActions, ...extraActions].map((action) => action.name));

/** Hand-written actions first; generated CRUD actions fill in every action name not already defined. */
export const quickbooksActions: ActionDefinition[] = [
  ...handWrittenActions,
  ...extraActions,
  ...resourceActions.filter((action) => !handWrittenNames.has(action.name)),
];
