import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalNumber, optionalString, requiredString } from "../../core/cast.ts";
import { arrayPayload, definedBody, firstString, objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineOAuthProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";

const service = "xero";
const apiBaseUrl = "https://api.xero.com/api.xro/2.0";
const identityBaseUrl = "https://api.xero.com";
const xeroUserinfoBaseUrl = "https://identity.xero.com";
const xeroUserinfoPath = "/connect/userinfo";
const xeroUserinfoUrl = `${xeroUserinfoBaseUrl}${xeroUserinfoPath}`;
const apiPackage = "OpenConnector";

type XeroHandler = ProviderRuntimeHandler<OAuthProviderContext>;

interface XeroRequestOptions {
  path: string;
  baseUrl?: string;
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
  tenantId?: string;
}

export const xeroActionHandlers: ProviderActionHandlers<"xero", XeroHandler> = {
  async list_organisations(_input, context): Promise<unknown> {
    const connections = arrayPayload(
      await requestJson({
        providerName: service,
        baseUrl: identityBaseUrl,
        path: "/connections",
        fetcher: context.fetcher,
        headers: bearerHeaders(context.accessToken),
      }),
      "Xero connections",
    );
    return {
      organisations: connections.map((connection) => {
        const record = optionalRecordValue(connection);
        return {
          tenant_id: record.tenantId,
          tenant_name: record.tenantName,
          tenant_type: record.tenantType,
        };
      }),
    };
  },
  async get_organisation(input, context): Promise<unknown> {
    const tenantId = await resolveTenantId(input, context);
    const payload = await xeroRequest(context, { path: "/Organisation", tenantId });
    const organisations = resourceList(payload, "Organisations");
    return mapOrganisation(requireFirst(organisations, "Organisation was not found."));
  },
  async search_contacts(input, context): Promise<unknown> {
    const tenantId = await resolveTenantId(input, context);
    const page = optionalInteger(input.page) ?? 1;
    const search = optionalString(input.search);
    const payload = await xeroRequest(context, {
      path: "/Contacts",
      tenantId,
      query: compactQuery({
        SearchTerm: search,
        page: String(page),
      }),
    });
    return pageResult(resourceList(payload, "Contacts"), page, mapContact);
  },
  async get_contact(input, context): Promise<unknown> {
    const tenantId = await resolveTenantId(input, context);
    const contactId = requiredString(input.contact_id, "contact_id");
    const payload = await xeroRequest(context, { path: `/Contacts/${contactId}`, tenantId });
    const contacts = resourceList(payload, "Contacts");
    return contacts.length > 0 ? mapContact(contacts[0]) : null;
  },
  async create_contact(input, context): Promise<unknown> {
    const tenantId = await resolveTenantId(input, context);
    const payload = await xeroRequest(context, {
      path: "/Contacts",
      method: "POST",
      tenantId,
      body: definedBody({
        Name: requiredString(input.name, "name"),
        EmailAddress: optionalString(input.email_address),
        FirstName: optionalString(input.first_name),
        LastName: optionalString(input.last_name),
      }),
    });
    const contacts = resourceList(payload, "Contacts");
    return { contact: mapContact(requireFirst(contacts, "Xero did not return the created contact.", 502)) };
  },
  async search_invoices(input, context): Promise<unknown> {
    const tenantId = await resolveTenantId(input, context);
    const page = optionalInteger(input.page) ?? 1;
    const status = optionalString(input.status);
    const payload = await xeroRequest(context, {
      path: "/Invoices",
      tenantId,
      query: compactQuery({
        Statuses: status,
        page: String(page),
      }),
    });
    return pageResult(resourceList(payload, "Invoices"), page, mapInvoiceSummary);
  },
  async get_invoice(input, context): Promise<unknown> {
    const tenantId = await resolveTenantId(input, context);
    const invoiceId = requiredString(input.invoice_id, "invoice_id");
    const payload = await xeroRequest(context, { path: `/Invoices/${invoiceId}`, tenantId });
    const invoices = resourceList(payload, "Invoices");
    return invoices.length > 0 ? mapInvoiceDetail(invoices[0]) : null;
  },
  async create_invoice(input, context): Promise<unknown> {
    const tenantId = await resolveTenantId(input, context);
    const lineItems = Array.isArray(input.line_items) ? input.line_items.map(mapLineItemInput) : [];
    if (lineItems.length === 0) {
      throw new ProviderRequestError(400, "At least one line item is required.");
    }
    const invoiceDate = optionalString(input.date);
    const payload = await xeroRequest(context, {
      path: "/Invoices",
      method: "POST",
      tenantId,
      body: definedBody({
        Type: optionalString(input.type) ?? "ACCREC",
        Contact: { ContactID: requiredString(input.contact_id, "contact_id") },
        Date: invoiceDate,
        DueDate: optionalString(input.due_date) ?? defaultDueDate(invoiceDate),
        Reference: optionalString(input.reference),
        LineItems: lineItems,
        Status: "DRAFT",
      }),
    });
    const invoices = resourceList(payload, "Invoices");
    return { invoice: mapInvoiceDetail(requireFirst(invoices, "Xero did not return the created invoice.", 502)) };
  },
  async update_invoice_status(input, context): Promise<unknown> {
    const tenantId = await resolveTenantId(input, context);
    const invoiceId = requiredString(input.invoice_id, "invoice_id");
    const status = requiredString(input.status, "status");
    const updated = await xeroRequest(context, {
      path: `/Invoices/${invoiceId}`,
      method: "POST",
      tenantId,
      body: { InvoiceID: invoiceId, Status: status },
    });
    const invoices = resourceList(updated, "Invoices");
    return { invoice: mapInvoiceSummary(requireFirst(invoices, `Invoice not found: ${invoiceId}`)) };
  },
  async list_accounts(input, context): Promise<unknown> {
    const tenantId = await resolveTenantId(input, context);
    const status = optionalString(input.status);
    const payload = await xeroRequest(context, {
      path: "/Accounts",
      tenantId,
      query: compactQuery({ where: status ? `Status=="${status}"` : undefined }),
    });
    return { accounts: resourceList(payload, "Accounts").map(mapAccount) };
  },
  async get_account(input, context): Promise<unknown> {
    const tenantId = await resolveTenantId(input, context);
    const accountId = requiredString(input.account_id, "account_id");
    const payload = await xeroRequest(context, { path: `/Accounts/${accountId}`, tenantId });
    const accounts = resourceList(payload, "Accounts");
    return accounts.length > 0 ? mapAccount(accounts[0]) : null;
  },
  async search_bank_transactions(input, context): Promise<unknown> {
    const tenantId = await resolveTenantId(input, context);
    const page = optionalInteger(input.page) ?? 1;
    const status = optionalString(input.status);
    const payload = await xeroRequest(context, {
      path: "/BankTransactions",
      tenantId,
      query: compactQuery({
        where: status ? `Status=="${status}"` : undefined,
        page: String(page),
      }),
    });
    return pageResult(resourceList(payload, "BankTransactions"), page, mapBankTransactionSummary);
  },
  async get_bank_transaction(input, context): Promise<unknown> {
    const tenantId = await resolveTenantId(input, context);
    const bankTransactionId = requiredString(input.bank_transaction_id, "bank_transaction_id");
    const payload = await xeroRequest(context, {
      path: `/BankTransactions/${bankTransactionId}`,
      tenantId,
    });
    const transactions = resourceList(payload, "BankTransactions");
    return transactions.length > 0 ? mapBankTransactionDetail(transactions[0]) : null;
  },
  async get_profit_and_loss(input, context): Promise<unknown> {
    return fetchReport(input, context, "ProfitAndLoss", {
      fromDate: optionalString(input.from_date),
      toDate: optionalString(input.to_date),
    });
  },
  async get_balance_sheet(input, context): Promise<unknown> {
    return fetchReport(input, context, "BalanceSheet", {
      date: optionalString(input.date),
    });
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, xeroActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const payload = objectPayload(
      await requestJson({
        providerName: service,
        baseUrl: xeroUserinfoBaseUrl,
        path: xeroUserinfoPath,
        fetcher,
        signal,
        headers: bearerHeaders(input.accessToken),
        phase: "validate",
      }),
      "Xero userinfo",
    );
    const accountId = optionalString(payload.sub) ?? optionalString(payload.xero_userid);
    if (!accountId) {
      throw new ProviderRequestError(502, "Xero userinfo response is missing sub");
    }
    return {
      profile: {
        accountId,
        displayName: firstString(payload, ["name", "preferred_username", "email"]) ?? accountId,
      },
      metadata: {
        validationEndpoint: xeroUserinfoUrl,
      },
    };
  },
};

async function xeroRequest(
  context: OAuthProviderContext,
  options: XeroRequestOptions,
): Promise<Record<string, unknown>> {
  try {
    return objectPayload(
      await requestJson({
        providerName: service,
        baseUrl: options.baseUrl ?? apiBaseUrl,
        path: options.path,
        fetcher: context.fetcher,
        method: options.method,
        query: options.query,
        body: options.body,
        headers: bearerHeaders(context.accessToken, options.tenantId),
      }),
      `${options.path} response`,
    );
  } catch (error) {
    throw refineXeroError(error);
  }
}

/**
 * Xero wraps actionable validation messages in `Elements[].ValidationErrors`,
 * while the top-level `Message` is a generic "A validation exception occurred".
 * Surface the specific messages so agents can act on them.
 */
function refineXeroError(error: unknown): unknown {
  if (!(error instanceof ProviderRequestError)) {
    return error;
  }
  const details = optionalRecordValue(error.details);
  const elements = Array.isArray(details.Elements) ? details.Elements : [];
  const messages = new Set<string>();
  for (const element of elements) {
    const record = optionalRecordValue(element);
    if (Array.isArray(record.ValidationErrors)) {
      for (const item of record.ValidationErrors) {
        const message = optionalString(optionalRecordValue(item).Message);
        if (message) {
          messages.add(message);
        }
      }
    }
  }
  if (messages.size === 0) {
    return error;
  }
  return new ProviderRequestError(error.status, `${error.message}: ${[...messages].join("; ")}`, error.details);
}

/** Xero requires a due date on approved invoices; default to a 30-day term. */
function defaultDueDate(date: string | undefined): string | undefined {
  if (!date) {
    return undefined;
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  parsed.setUTCDate(parsed.getUTCDate() + 30);
  return parsed.toISOString().slice(0, 10);
}

function bearerHeaders(accessToken: string, tenantId?: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    "xero-api-package": apiPackage,
    ...(tenantId ? { "xero-tenant-id": tenantId } : {}),
  };
}

async function resolveTenantId(input: Record<string, unknown>, context: OAuthProviderContext): Promise<string> {
  const explicit = optionalString(input.tenant_id);
  if (explicit) {
    return explicit;
  }
  const connections = arrayPayload(
    await requestJson({
      providerName: service,
      baseUrl: identityBaseUrl,
      path: "/connections",
      fetcher: context.fetcher,
      headers: bearerHeaders(context.accessToken),
    }),
    "Xero connections",
  );
  const first = optionalRecordValue(connections[0]);
  const tenantId = optionalString(first.tenantId);
  if (!tenantId) {
    throw new ProviderRequestError(
      400,
      "No Xero organisation is connected. Pass tenant_id or connect an organisation first.",
    );
  }
  return tenantId;
}

function resourceList(payload: Record<string, unknown>, key: string): unknown[] {
  const items = payload[key];
  return Array.isArray(items) ? items : [];
}

function requireFirst(items: unknown[], message: string, status = 404): unknown {
  if (items.length === 0) {
    throw new ProviderRequestError(status, message);
  }
  return items[0];
}

function pageResult<T>(items: unknown[], page: number, map: (raw: unknown) => T): Record<string, unknown> {
  return { items: items.map(map), page, returned: items.length };
}

function compactQuery(query: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined)) as Record<string, string>;
}

function optionalRecordValue(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function mapLineItemInput(input: unknown): Record<string, unknown> {
  const record = optionalRecordValue(input);
  return definedBody({
    Description: optionalString(record.description),
    Quantity: optionalNumber(record.quantity),
    UnitAmount: optionalNumber(record.unit_amount),
    AccountCode: optionalString(record.account_code),
  });
}

function mapLineItem(raw: unknown): Record<string, unknown> {
  const record = optionalRecordValue(raw);
  return {
    line_item_id: record.LineItemID ?? null,
    description: record.Description ?? null,
    quantity: optionalNumber(record.Quantity) ?? 0,
    unit_amount: optionalNumber(record.UnitAmount) ?? 0,
    line_amount: optionalNumber(record.LineAmount) ?? 0,
    account_code: record.AccountCode ?? null,
  };
}

function mapContact(raw: unknown): Record<string, unknown> {
  const record = optionalRecordValue(raw);
  const phones = Array.isArray(record.Phones) ? record.Phones : [];
  return {
    contact_id: record.ContactID ?? null,
    name: record.Name ?? "",
    first_name: record.FirstName ?? null,
    last_name: record.LastName ?? null,
    email_address: record.EmailAddress ?? null,
    phone: phones.length > 0 ? (optionalRecordValue(phones[0]).PhoneNumber ?? null) : null,
    is_customer: record.IsCustomer ?? false,
    is_supplier: record.IsSupplier ?? false,
    account_number: record.AccountNumber ?? null,
    status: record.ContactStatus ?? record.Status ?? "",
  };
}

function mapInvoiceSummary(raw: unknown): Record<string, unknown> {
  const record = optionalRecordValue(raw);
  const lineItems = Array.isArray(record.LineItems) ? record.LineItems : [];
  return {
    invoice_id: record.InvoiceID ?? null,
    invoice_number: record.InvoiceNumber ?? "",
    type: record.Type ?? "",
    status: record.Status ?? "",
    date: xeroDate(record.DateString ?? record.Date),
    due_date: xeroDate(record.DueDateString ?? record.DueDate),
    total: optionalNumber(record.Total) ?? 0,
    amount_due: optionalNumber(record.AmountDue) ?? 0,
    currency_code: record.CurrencyCode ?? "",
    contact_name: optionalRecordValue(record.Contact).Name ?? null,
    line_item_count: lineItems.length,
  };
}

function mapInvoiceDetail(raw: unknown): Record<string, unknown> {
  const record = optionalRecordValue(raw);
  const lineItems = Array.isArray(record.LineItems) ? record.LineItems : [];
  return {
    ...mapInvoiceSummary(raw),
    reference: record.Reference ?? null,
    line_items: lineItems.map(mapLineItem),
  };
}

function mapBankTransactionSummary(raw: unknown): Record<string, unknown> {
  const record = optionalRecordValue(raw);
  const lineItems = Array.isArray(record.LineItems) ? record.LineItems : [];
  const transactionId =
    optionalString(record.BankTransactionID) ??
    optionalString(record.OverpaymentID) ??
    optionalString(record.PrepaymentID);
  if (!transactionId) {
    throw new ProviderRequestError(502, "Xero did not return a bank transaction identifier.");
  }
  return {
    transaction_id: transactionId,
    type: record.Type ?? "",
    status: record.Status ?? "",
    date: xeroDate(record.DateString ?? record.Date),
    total: optionalNumber(record.Total) ?? 0,
    currency_code: record.CurrencyCode ?? "",
    contact_name: optionalRecordValue(record.Contact).Name ?? null,
    line_item_count: lineItems.length,
  };
}

function mapBankTransactionDetail(raw: unknown): Record<string, unknown> {
  const record = optionalRecordValue(raw);
  const lineItems = Array.isArray(record.LineItems) ? record.LineItems : [];
  return {
    ...mapBankTransactionSummary(raw),
    reference: record.Reference ?? null,
    line_items: lineItems.map(mapLineItem),
  };
}

function mapAccount(raw: unknown): Record<string, unknown> {
  const record = optionalRecordValue(raw);
  return {
    account_id: record.AccountID ?? null,
    code: record.Code ?? "",
    name: record.Name ?? "",
    type: record.Type ?? "",
    status: record.Status ?? "",
    tax_type: record.TaxType ?? null,
    currency_code: record.CurrencyCode ?? "",
  };
}

function mapOrganisation(raw: unknown): Record<string, unknown> {
  const record = optionalRecordValue(raw);
  return {
    organisation_id: record.OrganisationID ?? null,
    name: record.Name ?? "",
    legal_name: record.LegalName ?? "",
    currency_code: record.BaseCurrency ?? "",
    country_code: record.CountryCode ?? "",
    timezone: record.Timezone ?? "",
    tax_system_type: record.TaxSystemType ?? record.Version ?? "",
  };
}

function mapReport(raw: unknown): Record<string, unknown> {
  const record = optionalRecordValue(raw);
  const rows = Array.isArray(record.Rows) ? record.Rows : [];
  return {
    report_id: record.ReportID ?? "",
    report_name: record.ReportName ?? "",
    titles: Array.isArray(record.ReportTitles) ? record.ReportTitles.filter((title) => typeof title === "string") : [],
    generated_at: record.ReportDate ?? null,
    sections: parseReportSections(rows),
  };
}

function parseReportSections(rows: unknown[]): Record<string, unknown>[] {
  const sections = rows.filter((row) => optionalRecordValue(row).RowType === "Section");
  const mapped = sections.map((section) => {
    const record = optionalRecordValue(section);
    const sectionRows = Array.isArray(record.Rows) ? record.Rows : [];
    return {
      title: optionalString(record.Title) ?? null,
      rows: sectionRows
        .map((row) => {
          const rowRecord = optionalRecordValue(row);
          const cells = Array.isArray(rowRecord.Cells) ? rowRecord.Cells : [];
          return {
            label: cells.length > 0 ? (optionalString(optionalRecordValue(cells[0]).Value) ?? "") : "",
            value: cells.length > 1 ? (optionalString(optionalRecordValue(cells[1]).Value) ?? null) : null,
            is_total: rowRecord.RowType === "SummaryRow",
          };
        })
        .filter((row) => row.label !== ""),
    };
  });
  if (mapped.length > 0) {
    return mapped;
  }
  return [
    {
      title: null,
      rows: rows.map((row) => {
        const rowRecord = optionalRecordValue(row);
        const cells = Array.isArray(rowRecord.Cells) ? rowRecord.Cells : [];
        return {
          label: cells.length > 0 ? (optionalString(optionalRecordValue(cells[0]).Value) ?? "") : "",
          value: cells.length > 1 ? (optionalString(optionalRecordValue(cells[1]).Value) ?? null) : null,
          is_total: rowRecord.RowType === "SummaryRow",
        };
      }),
    },
  ];
}

async function fetchReport(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
  report: string,
  query: Record<string, string | undefined>,
): Promise<unknown> {
  const tenantId = await resolveTenantId(input, context);
  const payload = await xeroRequest(context, {
    path: `/Reports/${report}`,
    tenantId,
    query: compactQuery(query),
  });
  const reports = resourceList(payload, "Reports");
  return mapReport(requireFirst(reports, `${report} report was not found.`));
}

function xeroDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) {
    return null;
  }
  const epoch = /^\/Date\((\d+)(?:[+-]\d{4})?\)\/$/.exec(value);
  if (epoch) {
    return new Date(Number(epoch[1])).toISOString().slice(0, 10);
  }
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}
