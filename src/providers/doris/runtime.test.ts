import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { withProviderNetworkPolicy } from "../../core/provider-network-policy.ts";
import { credentialValidators } from "./executors.ts";
import { createDorisContext, dorisActionHandlers } from "./runtime.ts";

const values = { baseUrl: "https://doris.example.com:8030", username: "reader", password: " secret " };
const payload = {
  code: 0,
  msg: "success",
  data: { type: "result_set", meta: [{ name: "ok", type: "INT" }], data: [[1]], time: 10 },
};

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.useRealTimers();
});

describe("Doris read-only queries", () => {
  it.each([
    "SELECT 1",
    " /* leading comment */ select '; DROP TABLE t' AS value; -- trailing comment",
    "SELECT 'it''s; fine', \"a;\"\"b\", `semi;``colon`",
    "SELECT REPLACE('abc', 'a', 'b')",
    "WITH c AS (SELECT 1) SELECT * FROM c",
    "WITH c AS (SELECT 1), d AS (SELECT * FROM c) SELECT * FROM d;",
    "SHOW DATABASES",
    "SHOW CREATE TABLE events",
    "SHOW LOAD FROM analytics",
    "SHOW EXPORT FROM analytics",
    "DESC events",
    "DESCRIBE events",
    "EXPLAIN SELECT * FROM events LIMIT 1",
    "EXPLAIN SHAPE PLAN SELECT * FROM events",
    "SELECT 1 /* ; DELETE FROM events */;",
    "SELECT `update` FROM events",
  ])("accepts one read-only statement: %s", async (query) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(payload));
    await dorisActionHandlers.execute_query({ query }, createDorisContext(values, fetcher));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body)).stmt).toBe(query.trim());
  });

  it.each([
    "INSERT INTO events VALUES (1)",
    "UPDATE events SET id = 2",
    "DELETE FROM events",
    "DROP TABLE events",
    "SET query_timeout = 1",
    "SELECT 1; SELECT 2",
    "SELECT 1;;",
    "; SELECT 1",
    "SELECT * FROM events INTO OUTFILE 's3://bucket/result'",
    "WITH c AS (SELECT 1) INSERT INTO events SELECT * FROM c",
    "WITH c AS (DELETE FROM events) SELECT * FROM c",
    "WITH c AS (SELECT 1)",
    "EXPLAIN INSERT INTO events SELECT 1",
    "SELECT /*+ SET_VAR(query_timeout=100) */ 1",
    "SELECT 1 /*!; DROP TABLE events */",
    "SELECT 'unterminated",
    "SELECT 1 /* unterminated",
    "SELECT 'back\\slash'",
    "SELECT (1; SELECT 2)",
    "SELECT (1",
    "SELECT 1)",
    "-- only a comment",
  ])("rejects before sending a request: %s", async (query) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      Promise.resolve().then(() => dorisActionHandlers.execute_query({ query }, createDorisContext(values, fetcher))),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Doris HTTP protocol", () => {
  it("preserves positional columns, nulls, timing and an exact truncation signal", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        ...payload,
        data: {
          ...payload.data,
          meta: [
            { name: "same", type: "INT" },
            { name: "same", type: "VARCHAR" },
          ],
          data: [
            [1, null],
            [2, "two"],
            [3, "three"],
          ],
        },
      }),
    );
    const result = await dorisActionHandlers.execute_query(
      { query: "SELECT * FROM events", database: "analytics", maxRows: 2 },
      createDorisContext(values, fetcher),
    );
    expect(result).toEqual({
      columns: [
        { name: "same", type: "INT" },
        { name: "same", type: "VARCHAR" },
      ],
      rows: [
        [1, null],
        [2, "two"],
      ],
      rowCount: 2,
      executionTimeMs: 10,
      truncated: true,
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://doris.example.com:8030/api/query/default_cluster/analytics");
    expect(init!.method).toBe("POST");
    expect(new Headers(init!.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("reader: secret ").toString("base64")}`,
    );
    expect(new Headers(init!.headers).get("x-doris-stream")).toBe("false");
    expect(JSON.parse(String(init!.body))).toEqual({ stmt: "SELECT * FROM events", is_sync: true, limit: 3 });
  });

  it("does not mark an exact row limit as truncated and accepts empty results", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(payload))
      .mockResolvedValueOnce(Response.json({ ...payload, data: { ...payload.data, data: [] } }));
    const context = createDorisContext(values, fetcher);
    await expect(dorisActionHandlers.execute_query({ query: "SELECT 1", maxRows: 1 }, context)).resolves.toMatchObject({
      rowCount: 1,
      truncated: false,
    });
    await expect(dorisActionHandlers.execute_query({ query: "SELECT 1 WHERE false" }, context)).resolves.toMatchObject({
      rows: [],
      rowCount: 0,
      truncated: false,
    });
  });

  it("uses a configured database and safely quotes table identifiers", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(payload));
    const context = createDorisContext(
      { ...values, baseUrl: `${values.baseUrl}/doris/`, defaultDatabase: "sales data" },
      fetcher,
    );
    await dorisActionHandlers.list_tables({}, context);
    await dorisActionHandlers.get_table_schema({ table: "events`; DROP TABLE t; --" }, context);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(
      Array(2).fill("https://doris.example.com:8030/doris/api/query/default_cluster/sales%20data"),
    );
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(String(init!.body)).stmt)).toEqual([
      "SHOW TABLES",
      "DESCRIBE `events``; DROP TABLE t; --`",
    ]);
  });

  it("lists databases without a configured default but requires one for table actions", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(payload));
    const context = createDorisContext(values, fetcher);
    await dorisActionHandlers.list_databases({}, context);
    expect(fetcher.mock.calls[0]![0]).toContain("/information_schema");
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body)).stmt).toBe("SHOW DATABASES");
    expect(() => dorisActionHandlers.list_tables({}, context)).toThrow("database");
    expect(() => dorisActionHandlers.get_table_schema({ table: "events" }, context)).toThrow("database");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([".", "..", "a/b", "a\\b", "a\u0000b"])("rejects unsafe database path %s", async (database) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      dorisActionHandlers.execute_query({ query: "SELECT 1", database }, createDorisContext(values, fetcher)),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([0, 10001, 1.5, "2"])("rejects invalid row limit %s", async (maxRows) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      dorisActionHandlers.execute_query({ query: "SELECT 1", maxRows }, createDorisContext(values, fetcher)),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { code: 1, msg: "Unknown table" },
    { ...payload, code: "0" },
    { ...payload, data: { type: "exec_status", status: {}, time: 1 } },
    { ...payload, data: { ...payload.data, data: [[1, 2]] } },
    { ...payload, data: { ...payload.data, meta: [{}] } },
    { ...payload, data: { ...payload.data, time: -1 } },
    { ...payload, data: { ...payload.data, data: null } },
  ])("rejects Doris errors and malformed result sets: %j", async (body) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(body));
    await expect(
      dorisActionHandlers.execute_query({ query: "SELECT 1" }, createDorisContext(values, fetcher)),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("preserves the Doris error code and message", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ code: 1, msg: "Unknown table" }));
    await expect(
      dorisActionHandlers.execute_query({ query: "SELECT 1" }, createDorisContext(values, fetcher)),
    ).rejects.toMatchObject({ message: "Unknown table", details: { dorisCode: 1 } });
  });

  it("rejects invalid JSON", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("<html>proxy error</html>"));
    await expect(
      dorisActionHandlers.execute_query({ query: "SELECT 1" }, createDorisContext(values, fetcher)),
    ).rejects.toMatchObject({ status: 502, message: "Doris returned invalid JSON" });
  });

  it("caps streamed response bytes without trusting Content-Length", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
            },
            cancel,
          }),
        ),
    );
    await expect(
      dorisActionHandlers.execute_query({ query: "SELECT 1" }, createDorisContext(values, fetcher)),
    ).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("propagates cancellation while reading the response", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          new ReadableStream({
            start() {
              controller.abort();
            },
          }),
        ),
    );
    await expect(
      dorisActionHandlers.execute_query({ query: "SELECT 1" }, createDorisContext(values, fetcher, controller.signal)),
    ).rejects.toMatchObject({ status: 504 });
  });

  it("times out a stalled response body", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream()));
    const result = expect(
      dorisActionHandlers.execute_query({ query: "SELECT 1" }, createDorisContext(values, fetcher)),
    ).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(30000);
    await result;
  });
});

describe("Doris credential validation", () => {
  it("uses the same private network policy for URL validation, DNS and fetch", async () => {
    const lookup = vi.fn(async () => [{ address: "10.0.0.5", family: 4 }]);
    setDefaultGuardedFetchDnsLookup(lookup);
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(payload));
    await expect(credentialValidators.customCredential!({ values }, { fetcher })).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining("must not resolve to private"),
    });
    expect(fetcher).not.toHaveBeenCalled();
    await withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      const result = await credentialValidators.customCredential!({ values }, { fetcher });
      expect(result).toEqual({
        profile: { accountId: `${values.baseUrl}:reader`, displayName: "reader@doris.example.com:8030" },
      });
    });
    expect(lookup).toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]![0])).toContain("/information_schema");
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body)).stmt).toBe("SELECT 1 AS ok");
  });

  it("rejects private literals unless enabled and always rejects metadata and loopback", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(payload));
    const privateValues = { ...values, baseUrl: "http://10.0.0.5:8030" };
    await expect(credentialValidators.customCredential!({ values: privateValues }, { fetcher })).rejects.toMatchObject({
      status: 400,
    });
    await withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      await credentialValidators.customCredential!({ values: privateValues }, { fetcher });
      for (const baseUrl of ["http://127.0.0.1:8030", "http://169.254.169.254", "http://metadata.google.internal"]) {
        await expect(
          credentialValidators.customCredential!({ values: { ...values, baseUrl } }, { fetcher }),
        ).rejects.toMatchObject({ status: 400 });
      }
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([401, 403])(
    "maps HTTP %i to a credential input error but preserves execution authorization failure",
    async (status) => {
      setDefaultGuardedFetchDnsLookup(null);
      const fetcher = vi.fn<typeof fetch>(async () => new Response("Access denied", { status }));
      await expect(credentialValidators.customCredential!({ values }, { fetcher })).rejects.toMatchObject({
        status: 400,
      });
      await expect(
        dorisActionHandlers.execute_query({ query: "SELECT 1" }, createDorisContext(values, fetcher)),
      ).rejects.toMatchObject({ status });
    },
  );
});
