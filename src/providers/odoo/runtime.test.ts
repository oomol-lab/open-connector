import type { OdooActionContext } from "./runtime.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import { credentialValidators } from "./executors.ts";
import { createOdooContext, odooActionHandlers } from "./runtime.ts";

const values = {
  baseUrl: "https://odoo.example.com/erp/",
  database: "company",
  username: "user@example.com",
  password: " 密码 with spaces ",
};

function rpcResult(result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id: 1, result });
}

function actionContext(fetcher: typeof fetch): OdooActionContext {
  return { ...values, endpoint: "https://odoo.example.com/erp/jsonrpc", uid: 7, fetcher };
}

afterEach(() => {
  setPrivateNetworkAccessAllowed(false);
  vi.restoreAllMocks();
});

describe("Odoo JSON-RPC", () => {
  it("authenticates and preserves nested domains, context, and raw credentials", async () => {
    const records = [{ id: 3, name: "Company", parent_id: false, country_id: [1, "China"] }];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(rpcResult(7)).mockResolvedValueOnce(rpcResult(records));
    const context = await createOdooContext(values, fetcher);
    const domain = ["|", ["name", "ilike", "Company"], ["is_company", "=", true]];
    await expect(
      odooActionHandlers.search_read(
        {
          model: "res.partner",
          domain,
          fields: ["name", "parent_id", "country_id"],
          limit: 5,
          offset: 10,
          order: "id asc",
          context: { lang: "zh_CN", allowed_company_ids: [1] },
        },
        context,
      ),
    ).resolves.toEqual({ records });

    const [url, authRequest] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://odoo.example.com/erp/jsonrpc");
    expect(authRequest).toMatchObject({ method: "POST", redirect: "manual", signal: expect.any(AbortSignal) });
    expect(JSON.parse(String(authRequest?.body))).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "call",
      params: {
        service: "common",
        method: "authenticate",
        args: [values.database, values.username, values.password, {}],
      },
    });
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body)).params).toEqual({
      service: "object",
      method: "execute_kw",
      args: [
        values.database,
        7,
        values.password,
        "res.partner",
        "search_read",
        [domain],
        {
          fields: ["name", "parent_id", "country_id"],
          limit: 5,
          offset: 10,
          order: "id asc",
          context: { lang: "zh_CN", allowed_company_ids: [1] },
        },
      ],
    });
  });

  it("bounds searches when pagination is omitted", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => rpcResult([]));
    await odooActionHandlers.search({ model: "res.partner", domain: [] }, actionContext(fetcher));
    await odooActionHandlers.search_read({ model: "res.partner", domain: [] }, actionContext(fetcher));
    for (const [, request] of fetcher.mock.calls) {
      expect(JSON.parse(String(request?.body)).params.args.slice(5)).toEqual([[[]], { limit: 100 }]);
    }
  });

  it("keeps record IDs and relational commands in their positional argument slots", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => rpcResult(true));
    const context = actionContext(fetcher);
    const updates = { name: "Updated", category_id: [[6, 0, [2, 4]]] };
    await odooActionHandlers.write({ model: "res.partner", ids: [3, 5], values: updates }, context);
    await odooActionHandlers.unlink({ model: "res.partner", ids: [3, 5] }, context);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).params.args.slice(4)).toEqual([
      "write",
      [[3, 5], updates],
      {},
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body)).params.args.slice(4)).toEqual(["unlink", [[3, 5]], {}]);
  });

  it("maps field selection to the fields_get allfields keyword", async () => {
    const metadata = { name: { type: "char", string: "Name", required: true } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(rpcResult(metadata));
    await expect(
      odooActionHandlers.fields_get(
        { model: "res.partner", fields: ["name"], attributes: ["type", "string", "required"] },
        actionContext(fetcher),
      ),
    ).resolves.toEqual({ fields: metadata });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).params.args.slice(4)).toEqual([
      "fields_get",
      [],
      { allfields: ["name"], attributes: ["type", "string", "required"] },
    ]);
  });

  it.each([false, null, 0, [], { custom: "result" }])("preserves custom method result %j", async (result) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(rpcResult(result));
    await expect(
      odooActionHandlers.execute_kw(
        { model: "sale.order", method: "action_confirm", args: [[3]], kwargs: { context: { lang: "en_US" } } },
        actionContext(fetcher),
      ),
    ).resolves.toEqual({ result });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).params.args.slice(3)).toEqual([
      "sale.order",
      "action_confirm",
      [[3]],
      { context: { lang: "en_US" } },
    ]);
  });

  it.each([
    ["odoo.exceptions.AccessDenied", 401],
    ["odoo.exceptions.AccessError", 403],
    ["odoo.exceptions.ValidationError", 400],
    ["odoo.exceptions.UserError", 400],
    ["odoo.exceptions.MissingError", 400],
    ["builtins.ValueError", 502],
  ])("maps HTTP 200 RPC error %s without exposing debug data", async (name, status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: 200,
          message: "Odoo Server Error",
          data: { name, message: "Operation failed", debug: "private traceback" },
        },
      }),
    );
    await expect(
      odooActionHandlers.search_count({ model: "res.partner", domain: [] }, actionContext(fetcher)),
    ).rejects.toMatchObject({ status, message: "Operation failed", details: undefined });
  });

  it.each([{ jsonrpc: "2.0", id: 1 }, { jsonrpc: "2.0", id: 2, result: true }, { result: true }])(
    "rejects malformed RPC responses %j",
    async (payload) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(payload));
      await expect(
        odooActionHandlers.unlink({ model: "res.partner", ids: [3] }, actionContext(fetcher)),
      ).rejects.toMatchObject({ status: 502 });
    },
  );

  it("reports failed authentication as authorization failure during execution and input error during connection", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => rpcResult(false));
    await expect(createOdooContext(values, fetcher)).rejects.toMatchObject({ status: 401 });
    await expect(credentialValidators.customCredential!({ values }, { fetcher })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("returns a database-scoped user identity from credential validation", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(rpcResult(7));
    await expect(credentialValidators.customCredential!({ values }, { fetcher })).resolves.toEqual({
      profile: {
        accountId: "https://odoo.example.com/erp/jsonrpc:company:7",
        displayName: "user@example.com (company)",
      },
    });
  });

  it("maps HTTP failures and timeouts through the shared runtime", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Too many requests", { status: 429 }))
      .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    await expect(createOdooContext(values, fetcher)).rejects.toMatchObject({ status: 429 });
    await expect(createOdooContext(values, fetcher)).rejects.toMatchObject({ status: 504 });
  });

  it("never forwards the credential-bearing body to redirects", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 307, headers: { location: "https://other.example.com/jsonrpc" } }),
      );
    await expect(createOdooContext(values, createProviderFetch({ fetch: fetcher }))).rejects.toThrow();
    expect(fetcher.mock.calls[0]![1]?.redirect).toBe("manual");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requires the deployment opt-in before sending credentials over HTTP", async () => {
    const input = { values: { ...values, baseUrl: "http://odoo.example.com" } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(rpcResult(7));
    await expect(credentialValidators.customCredential!(input, { fetcher })).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("HTTPS"),
    });
    expect(fetcher).not.toHaveBeenCalled();
    setPrivateNetworkAccessAllowed(true);
    await expect(credentialValidators.customCredential!(input, { fetcher })).resolves.toHaveProperty(
      "profile.accountId",
      "http://odoo.example.com/jsonrpc:company:7",
    );
  });

  it("requires the deployment opt-in for private instances in credential validation", async () => {
    const input = { values: { ...values, baseUrl: "http://10.0.0.5:8069" } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(rpcResult(7));
    await expect(credentialValidators.customCredential!(input, { fetcher })).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
    setPrivateNetworkAccessAllowed(true);
    await expect(credentialValidators.customCredential!(input, { fetcher })).resolves.toHaveProperty(
      "profile.accountId",
      "http://10.0.0.5:8069/jsonrpc:company:7",
    );
  });

  it.each([
    "http://127.0.0.1:8069",
    "http://169.254.169.254",
    "http://[::1]",
    "http://metadata.google.internal",
    "https://user:password@odoo.example.com",
    "https://odoo.example.com?database=company",
    "https://odoo.example.com#fragment",
  ])("rejects unsafe or ambiguous instance URL %s before authentication", async (baseUrl) => {
    setPrivateNetworkAccessAllowed(true);
    const fetcher = vi.fn<typeof fetch>();
    await expect(createOdooContext({ ...values, baseUrl }, fetcher)).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
