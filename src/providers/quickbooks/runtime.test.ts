import type { ResolvedCredential } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { QuickbooksContext } from "./runtime.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { credentialValidators, quickbooksActionHandlers } from "./executors.ts";
import { buildSelectStatement, quoteQuickbooksString } from "./runtime.ts";

interface RecordedRequest {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: string;
  formData?: FormData;
}

type Responder = (request: RecordedRequest) => Response;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

function createContext(respond: Responder, overrides: Partial<QuickbooksContext> = {}) {
  const requests: RecordedRequest[] = [];
  const fetcher: ProviderFetch = async (input, init) => {
    const request: RecordedRequest = {
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(
        Object.entries(init?.headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]),
      ),
      body: init?.body === undefined || init.body instanceof FormData ? undefined : String(init.body),
      formData: init?.body instanceof FormData ? init.body : undefined,
    };
    requests.push(request);
    return respond(request);
  };
  const context: QuickbooksContext = {
    accessToken: "access-token",
    tokenType: "Bearer",
    realmId: "9130",
    baseUrl: "https://quickbooks.api.intuit.com",
    fetcher,
    ...overrides,
  };
  return { context, requests };
}

const handlers = quickbooksActionHandlers;

describe("QuickBooks request construction", () => {
  it("sends the realm path, minorversion and JSON headers", async () => {
    const { context, requests } = createContext(() => jsonResponse({ Customer: { Id: "5", SyncToken: "0" } }));
    const result = await handlers.get_customer!({ id: "5" }, context);
    expect(result).toEqual({ customer: { Id: "5", SyncToken: "0" } });
    expect(requests[0]!.url.toString()).toBe(
      "https://quickbooks.api.intuit.com/v3/company/9130/customer/5?minorversion=75",
    );
    expect(requests[0]!.headers.authorization).toBe("Bearer access-token");
    expect(requests[0]!.headers.accept).toBe("application/json");
  });

  it("targets the sandbox host and encodes the realm and entity id as path segments", async () => {
    const { context, requests } = createContext(() => jsonResponse({ Customer: { Id: "a/b", SyncToken: "0" } }), {
      baseUrl: "https://sandbox-quickbooks.api.intuit.com",
      realmId: "12 34",
    });
    await handlers.get_customer!({ id: "a/b" }, context);
    expect(requests[0]!.url.origin).toBe("https://sandbox-quickbooks.api.intuit.com");
    expect(requests[0]!.url.pathname).toBe("/v3/company/12%2034/customer/a%2Fb");
  });
});

describe("QuickBooks queries", () => {
  it("escapes quotes and backslashes in string literals", () => {
    expect(quoteQuickbooksString("O'Brien")).toBe("'O\\'Brien'");
    expect(quoteQuickbooksString("trailing\\")).toBe("'trailing\\\\'");
  });

  it("keeps an injection attempt inside the string literal", async () => {
    const { context, requests } = createContext(() => jsonResponse({ QueryResponse: {} }));
    await handlers.list_customers!({ display_name_contains: "x' OR Active = false --" }, context);
    const statement = requests[0]!.url.searchParams.get("query")!;
    expect(statement).toBe(
      "select * from Customer where Active = true and DisplayName LIKE '%x\\' OR Active = false --%' order by DisplayName startposition 1 maxresults 100",
    );
  });

  it("builds filters, ordering and paging for invoices", async () => {
    const { context, requests } = createContext(() => jsonResponse({ QueryResponse: {} }));
    await handlers.list_invoices!(
      {
        customer_id: "58",
        txn_date_from: "2026-01-01",
        txn_date_to: "2026-01-31",
        unpaid_only: true,
        descending: true,
        start_position: 11,
        max_results: 5,
      },
      context,
    );
    expect(requests[0]!.url.searchParams.get("query")).toBe(
      "select * from Invoice where CustomerRef = '58' and TxnDate >= '2026-01-01' and TxnDate <= '2026-01-31' and Balance > '0' order by TxnDate desc startposition 11 maxresults 5",
    );
  });

  it("rejects an order_by that is not a column name", () => {
    expect(() =>
      buildSelectStatement({
        entity: "Customer",
        conditions: [],
        orderBy: "DisplayName; delete",
        startPosition: 1,
        maxResults: 1,
      }),
    ).toThrow("order_by");
  });

  it("rejects max_results above the QuickBooks limit", async () => {
    const { context } = createContext(() => jsonResponse({ QueryResponse: {} }));
    await expect(handlers.list_customers!({ max_results: 1001 }, context)).rejects.toMatchObject({ status: 400 });
  });

  it("reports the next page while pages come back full", async () => {
    const rows = [{ Id: "1" }, { Id: "2" }];
    const { context } = createContext(() => jsonResponse({ QueryResponse: { Customer: rows, startPosition: 1 } }));
    const full = await handlers.list_customers!({ max_results: 2 }, context);
    expect(full).toMatchObject({ items: rows, next_start_position: 3, has_more: true });
    const last = await handlers.list_customers!({ max_results: 5, start_position: 3 }, context);
    expect(last).toMatchObject({ next_start_position: null, has_more: false });
  });
});

describe("QuickBooks writes", () => {
  it("fetches the current SyncToken and sends a sparse update when none is given", async () => {
    const { context, requests } = createContext((request) =>
      request.method === "GET"
        ? jsonResponse({ Customer: { Id: "5", SyncToken: "3" } })
        : jsonResponse({ Customer: { Id: "5", SyncToken: "4" } }),
    );
    await handlers.update_customer!({ id: "5", email: "a@example.com" }, context);
    expect(requests.map((request) => request.method)).toEqual(["GET", "POST"]);
    expect(JSON.parse(requests[1]!.body!)).toEqual({
      PrimaryEmailAddr: { Address: "a@example.com" },
      Id: "5",
      SyncToken: "3",
      sparse: true,
    });
  });

  it("uses a caller SyncToken without a lookup and honors sparse false", async () => {
    const { context, requests } = createContext(() => jsonResponse({ Customer: { Id: "5", SyncToken: "8" } }));
    await handlers.update_customer!({ id: "5", sync_token: "7", sparse: false, display_name: "New" }, context);
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0]!.body!)).toMatchObject({ DisplayName: "New", SyncToken: "7", sparse: false });
  });

  it.each(["delete_customer", "delete_record"])(
    "%s rejects a concurrent rename instead of overwriting it during deactivation",
    async (actionName) => {
      let reads = 0;
      const { context, requests } = createContext((request) => {
        if (request.method === "GET") {
          reads++;
          return jsonResponse({
            Customer:
              reads === 1
                ? { Id: "5", DisplayName: "Before rename", SyncToken: "1" }
                : { Id: "5", DisplayName: "After concurrent rename", SyncToken: "2" },
          });
        }
        const body = JSON.parse(request.body!);
        return body.SyncToken === "1"
          ? jsonResponse({ Fault: { Error: [{ code: "5010", Message: "Stale Object Error" }] } }, { status: 400 })
          : jsonResponse({ Customer: { ...body, SyncToken: "3" } });
      });

      const input = actionName === "delete_record" ? { object_name: "Customer", id: "5" } : { id: "5" };
      await expect(handlers[actionName]!(input, context)).rejects.toMatchObject({ status: 400 });
      expect(requests.map((request) => request.method)).toEqual(["GET", "POST"]);
      expect(JSON.parse(requests[1]!.body!)).toMatchObject({
        Active: false,
        DisplayName: "Before rename",
        SyncToken: "1",
      });
    },
  );

  it("preserves the caller SyncToken when deactivation reads the current name", async () => {
    const { context, requests } = createContext((request) =>
      request.method === "GET"
        ? jsonResponse({ Customer: { Id: "5", DisplayName: "Current name", SyncToken: "2" } })
        : jsonResponse({ Fault: { Error: [{ code: "5010", Message: "Stale Object Error" }] } }, { status: 400 }),
    );

    await expect(handlers.delete_customer!({ id: "5", sync_token: "0" }, context)).rejects.toMatchObject({
      status: 400,
    });
    expect(requests.map((request) => request.method)).toEqual(["GET", "POST"]);
    expect(JSON.parse(requests[1]!.body!)).toMatchObject({ DisplayName: "Current name", SyncToken: "0" });
  });

  it("deactivates a record using the name and SyncToken from one read", async () => {
    const customer = { Id: "5", DisplayName: "Current name", SyncToken: "2" };
    const { context, requests } = createContext((request) =>
      jsonResponse({ Customer: request.method === "GET" ? customer : { ...customer, Active: false, SyncToken: "3" } }),
    );

    const result = await handlers.delete_customer!({ id: "5" }, context);
    expect(requests.map((request) => request.method)).toEqual(["GET", "POST"]);
    expect(JSON.parse(requests[1]!.body!)).toEqual({ ...customer, Active: false, sparse: true });
    expect(result).toMatchObject({ deleted: true, customer: { Active: false, SyncToken: "3" } });
  });

  it("rejects a deactivation snapshot without SyncToken before writing", async () => {
    const { context, requests } = createContext(() => jsonResponse({ Customer: { Id: "5", DisplayName: "Name" } }));

    await expect(handlers.delete_customer!({ id: "5" }, context)).rejects.toMatchObject({ status: 502 });
    expect(requests.map((request) => request.method)).toEqual(["GET"]);
  });

  it("maps invoice fields to the QuickBooks line shape and merges additional fields last", async () => {
    const { context, requests } = createContext(() => jsonResponse({ Invoice: { Id: "9", SyncToken: "0" } }));
    await handlers.create_invoice!(
      {
        customer_ref: { value: "58" },
        lines: [{ amount: 100, item_ref: { value: "1", name: "Services" }, quantity: 2, unit_price: 50 }],
        due_date: "2026-02-01",
        customer_memo: "Thanks",
        additional_fields: { DocNumber: "INV-9", PrivateNote: "x" },
      },
      context,
    );
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url.pathname).toBe("/v3/company/9130/invoice");
    expect(JSON.parse(requests[0]!.body!)).toEqual({
      CustomerRef: { value: "58" },
      Line: [
        {
          Amount: 100,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: { ItemRef: { value: "1", name: "Services" }, Qty: 2, UnitPrice: 50 },
        },
      ],
      DueDate: "2026-02-01",
      CustomerMemo: { value: "Thanks" },
      DocNumber: "INV-9",
      PrivateNote: "x",
    });
  });

  it("links a payment to the invoices it settles", async () => {
    const { context, requests } = createContext(() => jsonResponse({ Payment: { Id: "3", SyncToken: "0" } }));
    await handlers.create_payment!(
      { customer_ref: { value: "58" }, total_amount: 75, applied_to: [{ invoice_id: "9", amount: 75 }] },
      context,
    );
    expect(JSON.parse(requests[0]!.body!)).toMatchObject({
      TotalAmt: 75,
      Line: [{ Amount: 75, LinkedTxn: [{ TxnId: "9", TxnType: "Invoice" }] }],
    });
  });

  it("voids and deletes through the operation parameter", async () => {
    const { context, requests } = createContext((request) =>
      jsonResponse({
        Invoice: { Id: "9", status: request.url.searchParams.get("operation") === "delete" ? "Deleted" : "x" },
      }),
    );
    await handlers.void_invoice!({ id: "9", sync_token: "2" }, context);
    const deleted = await handlers.delete_invoice!({ id: "9", sync_token: "2" }, context);
    expect(requests.map((request) => request.url.searchParams.get("operation"))).toEqual(["void", "delete"]);
    expect(JSON.parse(requests[0]!.body!)).toEqual({ Id: "9", SyncToken: "2" });
    expect(deleted).toMatchObject({ deleted: true });
  });
});

describe("QuickBooks attachment uploads", () => {
  it.each(["!!!!", "aGVsbG8=!", "a"])("rejects invalid base64 %j before sending a request", async (content) => {
    const { context, requests } = createContext(() =>
      jsonResponse({ AttachableResponse: [{ Attachable: { Id: "1", SyncToken: "0" } }] }),
    );

    await expect(
      handlers.upload_attachment!(
        { file_name: "test.txt", content_type: "text/plain", content_base64: content },
        context,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(requests).toHaveLength(0);
  });

  it.each(["aGVsbG8=", "aGVsbG8"])("uploads valid base64 %j without changing the bytes", async (content) => {
    const attachment = { Id: "1", SyncToken: "0" };
    const { context, requests } = createContext(() =>
      jsonResponse({ AttachableResponse: [{ Attachable: attachment }] }),
    );

    const result = await handlers.upload_attachment!(
      { file_name: "test.txt", content_type: "text/plain", content_base64: content },
      context,
    );
    const file = requests[0]!.formData!.get("file_content_01") as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("test.txt");
    expect(await file.text()).toBe("hello");
    expect(result).toEqual({ attachment });
  });
});

describe("QuickBooks errors", () => {
  const faultBody = (code: string, message: string, detail: string) => ({
    Fault: { Error: [{ Message: message, Detail: detail, code }], type: "ValidationFault" },
  });

  it("maps a Fault to a message with the code and intuit_tid", async () => {
    const { context } = createContext(() =>
      jsonResponse(faultBody("2020", "Required param missing", "Customer.DisplayName"), {
        status: 400,
        headers: { intuit_tid: "tid-1" },
      }),
    );
    const error = await handlers.create_customer!({ display_name: "X" }, context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect((error as ProviderRequestError).status).toBe(400);
    expect((error as ProviderRequestError).message).toBe(
      "Required param missing: Customer.DisplayName (code 2020) [intuit_tid tid-1]",
    );
    expect((error as ProviderRequestError).details).toMatchObject({ intuitTid: "tid-1" });
  });

  it("tells the caller to re-fetch on a stale SyncToken", async () => {
    const { context } = createContext(() =>
      jsonResponse(faultBody("5010", "Stale Object Error", "Stale object"), { status: 400 }),
    );
    await expect(handlers.update_customer!({ id: "5", sync_token: "1" }, context)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("Re-fetch the entity"),
    });
  });

  it("treats a Fault inside a 200 response as an error", async () => {
    const { context } = createContext(() => jsonResponse(faultBody("4000", "Query error", "bad")));
    await expect(handlers.list_customers!({}, context)).rejects.toMatchObject({ status: 400 });
  });

  it("passes 401 through for execution and reports 429 and 5xx", async () => {
    const status = (code: number) =>
      createContext(() => jsonResponse(faultBody("100", "m", "d"), { status: code }), {}).context;
    await expect(handlers.get_account!({ id: "1" }, status(401))).rejects.toMatchObject({ status: 401 });
    await expect(handlers.get_account!({ id: "1" }, status(429))).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("about 60 seconds"),
    });
    await expect(handlers.get_account!({ id: "1" }, status(503))).rejects.toMatchObject({ status: 502 });
  });

  it("survives a non-JSON error page", async () => {
    const { context } = createContext(() => new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(handlers.get_account!({ id: "1" }, context)).rejects.toMatchObject({
      status: 502,
      message: "QuickBooks request failed (HTTP 502)",
    });
  });
});

describe("QuickBooks credential validation", () => {
  const companyInfo = jsonResponse({ CompanyInfo: { CompanyName: "Acme Books", Id: "9130" } });
  const oauthCredential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
    authType: "oauth2",
    accessToken: "oauth-token",
    tokenType: "Bearer",
    providerSecret: { realmId: "9130", environment: "sandbox" },
    profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
    metadata: {},
  };

  it("identifies an OAuth connection by company and uses the sandbox host", async () => {
    const { context, requests } = createContext(() => companyInfo.clone());
    const result = await credentialValidators.oauth2!(oauthCredential, { fetcher: context.fetcher });
    expect(result).toEqual({ profile: { accountId: "9130", displayName: "Acme Books" } });
    expect(requests[0]!.url.origin).toBe("https://sandbox-quickbooks.api.intuit.com");
    expect(requests[0]!.url.pathname).toBe("/v3/company/9130/companyinfo/9130");
    expect(requests[0]!.headers.authorization).toBe("Bearer oauth-token");
  });

  it("turns an upstream 401 into a field error during validation", async () => {
    const { context } = createContext(() => jsonResponse({}, { status: 401 }));
    await expect(credentialValidators.oauth2!(oauthCredential, { fetcher: context.fetcher })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects a connection without a company and an unknown environment", async () => {
    const { context } = createContext(() => companyInfo.clone());
    await expect(
      credentialValidators.oauth2!({ ...oauthCredential, providerSecret: {} }, { fetcher: context.fetcher }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      credentialValidators.oauth2!(
        { ...oauthCredential, providerSecret: { realmId: "1", environment: "staging" } },
        { fetcher: context.fetcher },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
