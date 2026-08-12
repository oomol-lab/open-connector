import type { ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { credentialValidators, xeroActionHandlers } from "./executors.ts";

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

function createFetcher(routes: Record<string, unknown | ((request: RecordedRequest) => unknown)>): {
  fetcher: ProviderFetch;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const fetcher: ProviderFetch = async (input, init) => {
    const url = String(input);
    const request: RecordedRequest = {
      url,
      method: init?.method ?? "GET",
      headers: Object.fromEntries(
        Object.entries(init?.headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]),
      ),
    };
    if (init?.body) {
      request.body = JSON.parse(String(init.body));
    }
    requests.push(request);
    const pathname = url.split("?")[0];
    const route = routes[pathname];
    if (route === undefined) {
      return new Response(JSON.stringify({ error: `no route for ${pathname}` }), { status: 404 });
    }
    const payload = typeof route === "function" ? route(request) : route;
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  return { fetcher, requests };
}

const accessToken = "test-access-token";
const connectionsFixture = [{ tenantId: "tenant-123", tenantName: "Demo Company", tenantType: "ORG" }];
const contactsFixture = [
  {
    ContactID: "contact-1",
    Name: "Jane Doe",
    FirstName: "Jane",
    LastName: "Doe",
    EmailAddress: "jane@example.com",
    Phones: [{ PhoneNumber: "021 555 1234" }],
    IsCustomer: true,
    IsSupplier: false,
    AccountNumber: "AC-1001",
    Status: "ACTIVE",
  },
];
const invoiceFixture = {
  InvoiceID: "invoice-1",
  InvoiceNumber: "INV-0001",
  Type: "ACCREC",
  Status: "DRAFT",
  Date: "2026-08-01",
  DueDate: "2026-08-31",
  Reference: "Consulting work",
  Total: 1150,
  AmountDue: 1150,
  CurrencyCode: "NZD",
  Contact: { Name: "Jane Doe" },
  LineItems: [
    {
      LineItemID: "line-1",
      Description: "Consulting",
      Quantity: 2,
      UnitAmount: 500,
      LineAmount: 1000,
      AccountCode: "200",
    },
  ],
};

describe("credentialValidators", () => {
  it("maps the first connection to the credential profile", async () => {
    const { fetcher } = createFetcher({ "https://api.xero.com/connections": connectionsFixture });
    await expect(
      credentialValidators.oauth2?.(
        { authType: "oauth2", accessToken, profile: null as never, metadata: {} } as never,
        {
          fetcher,
        } as never,
      ),
    ).resolves.toEqual({
      profile: { accountId: "tenant-123", displayName: "Demo Company" },
    });
  });

  it("falls back to a neutral profile when no organisation is connected", async () => {
    const { fetcher } = createFetcher({ "https://api.xero.com/connections": [] });
    await expect(
      credentialValidators.oauth2?.(
        { authType: "oauth2", accessToken, profile: null as never, metadata: {} } as never,
        {
          fetcher,
        } as never,
      ),
    ).resolves.toEqual({
      profile: { accountId: "xero", displayName: "Xero" },
    });
  });
});

describe("list_organisations", () => {
  it("maps the identity connections to tenant summaries", async () => {
    const { fetcher, requests } = createFetcher({ "https://api.xero.com/connections": connectionsFixture });
    await expect(xeroActionHandlers.list_organisations({}, { accessToken, fetcher })).resolves.toEqual({
      organisations: [{ tenant_id: "tenant-123", tenant_name: "Demo Company", tenant_type: "ORG" }],
    });
    expect(requests[0].headers.authorization).toBe(`Bearer ${accessToken}`);
  });
});

describe("tenant resolution", () => {
  const baseRoutes = {
    "https://api.xero.com/connections": connectionsFixture,
    "https://api.xero.com/api.xro/2.0/Contacts": { Contacts: contactsFixture },
  };

  it("falls back to the first connection and sends the Xero-Tenant-Id header", async () => {
    const { fetcher, requests } = createFetcher(baseRoutes);
    await xeroActionHandlers.search_contacts({ search: "Jane" }, { accessToken, fetcher });
    const contactsRequest = requests.find((request) => request.url.includes("/Contacts"));
    expect(contactsRequest?.headers["xero-tenant-id"]).toBe("tenant-123");
    expect(decodeURIComponent(contactsRequest?.url ?? "")).toContain('Name.Contains("Jane")');
  });

  it("escapes quotes in the contact name filter", async () => {
    const { fetcher, requests } = createFetcher(baseRoutes);
    await xeroActionHandlers.search_contacts(
      { tenant_id: "tenant-123", search: 'Acme "Holdings"' },
      { accessToken, fetcher },
    );
    const contactsRequest = requests.find((request) => request.url.includes("/Contacts"));
    expect(new URL(contactsRequest?.url ?? "https://invalid.example").searchParams.get("where")).toBe(
      'Name.Contains("Acme ""Holdings""")',
    );
  });

  it("uses an explicit tenant_id without calling the connections endpoint", async () => {
    const { fetcher, requests } = createFetcher(baseRoutes);
    await xeroActionHandlers.search_contacts({ tenant_id: "tenant-999", page: 2 }, { accessToken, fetcher });
    expect(requests.some((request) => request.url.includes("/connections"))).toBe(false);
    const contactsRequest = requests.find((request) => request.url.includes("/Contacts"));
    expect(contactsRequest?.headers["xero-tenant-id"]).toBe("tenant-999");
    expect(contactsRequest?.url).toContain("page=2");
  });

  it("rejects with a stable error when no organisation is connected", async () => {
    const { fetcher } = createFetcher({ "https://api.xero.com/connections": [] });
    await expect(xeroActionHandlers.get_organisation({}, { accessToken, fetcher })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("get_contact", () => {
  it("maps the PascalCase Xero payload to the snake_case output", async () => {
    const { fetcher } = createFetcher({
      "https://api.xero.com/connections": connectionsFixture,
      "https://api.xero.com/api.xro/2.0/Contacts/contact-1": { Contacts: contactsFixture },
    });
    await expect(
      xeroActionHandlers.get_contact({ tenant_id: "tenant-123", contact_id: "contact-1" }, { accessToken, fetcher }),
    ).resolves.toEqual({
      contact_id: "contact-1",
      name: "Jane Doe",
      first_name: "Jane",
      last_name: "Doe",
      email_address: "jane@example.com",
      phone: "021 555 1234",
      is_customer: true,
      is_supplier: false,
      account_number: "AC-1001",
      status: "ACTIVE",
    });
  });
});

describe("create_invoice", () => {
  it("posts the Xero payload shape and returns the created invoice", async () => {
    const { fetcher, requests } = createFetcher({
      "https://api.xero.com/connections": connectionsFixture,
      "https://api.xero.com/api.xro/2.0/Invoices": { Invoices: [invoiceFixture] },
    });
    const result = await xeroActionHandlers.create_invoice(
      {
        tenant_id: "tenant-123",
        contact_id: "contact-1",
        line_items: [{ description: "Consulting", quantity: 2, unit_amount: 500, account_code: "200" }],
      },
      { accessToken, fetcher },
    );
    const postRequest = requests.find((request) => request.method === "POST");
    expect(postRequest?.body).toEqual({
      Type: "ACCREC",
      Contact: { ContactID: "contact-1" },
      Status: "DRAFT",
      LineItems: [{ Description: "Consulting", Quantity: 2, UnitAmount: 500, AccountCode: "200" }],
    });
    expect(postRequest?.headers["xero-tenant-id"]).toBe("tenant-123");
    expect(result).toMatchObject({ invoice: { invoice_id: "invoice-1", total: 1150 } });
  });

  it("defaults the due date to 30 days after the invoice date", async () => {
    const { fetcher, requests } = createFetcher({
      "https://api.xero.com/connections": connectionsFixture,
      "https://api.xero.com/api.xro/2.0/Invoices": { Invoices: [invoiceFixture] },
    });
    await xeroActionHandlers.create_invoice(
      {
        tenant_id: "tenant-123",
        contact_id: "contact-1",
        date: "2026-08-01",
        line_items: [{ description: "Consulting", quantity: 1, unit_amount: 100, account_code: "200" }],
      },
      { accessToken, fetcher },
    );
    const postRequest = requests.find((request) => request.method === "POST");
    expect(postRequest?.body).toMatchObject({ DueDate: "2026-08-31" });
  });

  it("rejects when no line items are provided", async () => {
    const { fetcher } = createFetcher({
      "https://api.xero.com/connections": connectionsFixture,
    });
    await expect(
      xeroActionHandlers.create_invoice(
        { tenant_id: "tenant-123", contact_id: "contact-1", line_items: [] },
        { accessToken, fetcher },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("search_invoices", () => {
  it("forwards page and Statuses so Xero returns a paged invoice list", async () => {
    const { fetcher, requests } = createFetcher({
      "https://api.xero.com/connections": connectionsFixture,
      "https://api.xero.com/api.xro/2.0/Invoices": { Invoices: [invoiceFixture] },
    });
    const result = await xeroActionHandlers.search_invoices(
      { tenant_id: "tenant-123", status: "DRAFT", page: 2 },
      { accessToken, fetcher },
    );
    const invoicesRequest = requests.find((request) => request.url.includes("/Invoices"));
    expect(invoicesRequest?.url).toContain("page=2");
    expect(invoicesRequest?.url).toContain("Statuses=DRAFT");
    expect(result).toMatchObject({ page: 2, returned: 1, items: [{ invoice_id: "invoice-1" }] });
  });
});

describe("update_invoice_status", () => {
  it("posts only InvoiceID and Status", async () => {
    const { fetcher, requests } = createFetcher({
      "https://api.xero.com/connections": connectionsFixture,
      "https://api.xero.com/api.xro/2.0/Invoices/invoice-1": {
        Invoices: [{ ...invoiceFixture, Status: "AUTHORISED" }],
      },
    });
    const result = await xeroActionHandlers.update_invoice_status(
      { tenant_id: "tenant-123", invoice_id: "invoice-1", status: "AUTHORISED" },
      { accessToken, fetcher },
    );
    const postRequest = requests.find((request) => request.method === "POST");
    expect(postRequest?.body).toEqual({ InvoiceID: "invoice-1", Status: "AUTHORISED" });
    expect(requests.filter((request) => request.url.includes("/Invoices/invoice-1"))).toHaveLength(1);
    expect(result).toMatchObject({ invoice: { invoice_id: "invoice-1", status: "AUTHORISED" } });
  });
});

describe("get_invoice", () => {
  it("parses ASP.NET dates with or without a timezone offset", async () => {
    const { fetcher } = createFetcher({
      "https://api.xero.com/connections": connectionsFixture,
      "https://api.xero.com/api.xro/2.0/Invoices/invoice-1": {
        Invoices: [
          {
            ...invoiceFixture,
            Date: "/Date(1754006400000)/",
            DueDate: "/Date(1756598400000+0000)/",
            DateString: undefined,
            DueDateString: undefined,
          },
        ],
      },
    });
    await expect(
      xeroActionHandlers.get_invoice({ tenant_id: "tenant-123", invoice_id: "invoice-1" }, { accessToken, fetcher }),
    ).resolves.toMatchObject({
      date: "2025-08-01",
      due_date: "2025-08-31",
    });
  });
});

describe("get_balance_sheet", () => {
  it("sends the as-at date query parameter Xero expects", async () => {
    const { fetcher, requests } = createFetcher({
      "https://api.xero.com/connections": connectionsFixture,
      "https://api.xero.com/api.xro/2.0/Reports/BalanceSheet": {
        Reports: [{ ReportID: "bs-1", ReportName: "BalanceSheet", ReportTitles: ["Balance Sheet"], Rows: [] }],
      },
    });
    await xeroActionHandlers.get_balance_sheet(
      { tenant_id: "tenant-123", date: "2026-08-01" },
      { accessToken, fetcher },
    );
    const reportRequest = requests.find((request) => request.url.includes("/Reports/BalanceSheet"));
    expect(reportRequest?.url).toContain("date=2026-08-01");
    expect(reportRequest?.url).not.toContain("fromDate");
    expect(reportRequest?.url).not.toContain("toDate");
  });
});

describe("get_profit_and_loss", () => {
  it("parses report sections into labelled rows an agent can summarise", async () => {
    const reportFixture = {
      ReportID: "report-1",
      ReportName: "ProfitAndLoss",
      ReportTitles: ["Profit and Loss", "Demo Company", "01 August 2026 to 31 August 2026"],
      ReportDate: "2026-08-13T00:00:00",
      Rows: [
        {
          RowType: "Section",
          Title: "Revenue",
          Rows: [
            { RowType: "Row", Cells: [{ Value: "Sales" }, { Value: "10000.00" }] },
            { RowType: "SummaryRow", Cells: [{ Value: "Total Revenue" }, { Value: "10000.00" }] },
          ],
        },
        {
          RowType: "Section",
          Title: "Expenses",
          Rows: [
            { RowType: "Row", Cells: [{ Value: "Rent" }, { Value: "2000.00" }] },
            { RowType: "SummaryRow", Cells: [{ Value: "Total Expenses" }, { Value: "2000.00" }] },
          ],
        },
      ],
    };
    const { fetcher } = createFetcher({
      "https://api.xero.com/connections": connectionsFixture,
      "https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss": { Reports: [reportFixture] },
    });
    await expect(
      xeroActionHandlers.get_profit_and_loss({ tenant_id: "tenant-123" }, { accessToken, fetcher }),
    ).resolves.toEqual({
      report_id: "report-1",
      report_name: "ProfitAndLoss",
      titles: ["Profit and Loss", "Demo Company", "01 August 2026 to 31 August 2026"],
      generated_at: "2026-08-13T00:00:00",
      sections: [
        {
          title: "Revenue",
          rows: [
            { label: "Sales", value: "10000.00", is_total: false },
            { label: "Total Revenue", value: "10000.00", is_total: true },
          ],
        },
        {
          title: "Expenses",
          rows: [
            { label: "Rent", value: "2000.00", is_total: false },
            { label: "Total Expenses", value: "2000.00", is_total: true },
          ],
        },
      ],
    });
  });
});
