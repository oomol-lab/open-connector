import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { feishuActionHandlers, fetchFeishuUserInfo } from "./runtime.ts";

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

/** A fetcher that returns one canned Feishu envelope and records the request. */
function stubFetcher(payload: unknown, calls: RecordedRequest[], status = 200): typeof fetch {
  return (async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

function context(fetcher: typeof fetch) {
  return { accessToken: "u-token", fetcher };
}

describe("Feishu runtime", () => {
  it("normalizes the authorized user's profile and tolerates missing fields", async () => {
    const calls: RecordedRequest[] = [];
    // Shape confirmed live: user_info returns no user_id/email unless scoped.
    const fetcher = stubFetcher(
      { code: 0, data: { open_id: "ou_1", union_id: "on_1", name: "愉超", en_name: "Yuchao", tenant_key: "t1" } },
      calls,
    );

    const user = (await fetchFeishuUserInfo({ accessToken: "u-token", fetcher })) as Record<string, unknown>;
    expect(user.open_id).toBe("ou_1");
    expect(calls[0]?.url).toBe("https://open.feishu.cn/open-apis/authen/v1/user_info");

    const normalized = (await feishuActionHandlers.get_current_user({}, context(fetcher))) as Record<string, unknown>;
    expect(normalized.openId).toBe("ou_1");
    expect(normalized.name).toBe("愉超");
    expect(normalized.userId).toBeNull();
    expect(normalized.email).toBeNull();
  });

  it("reads docx plain-text content and forwards the lang query", async () => {
    const calls: RecordedRequest[] = [];
    const fetcher = stubFetcher({ code: 0, data: { content: "hello doc" } }, calls);

    const result = (await feishuActionHandlers.get_document_content(
      { documentId: "doc123", lang: 1 },
      context(fetcher),
    )) as Record<string, unknown>;

    expect(result).toEqual({ documentId: "doc123", content: "hello doc" });
    expect(calls[0]?.url).toBe("https://open.feishu.cn/open-apis/docx/v1/documents/doc123/raw_content?lang=1");
  });

  it("normalizes a paginated list response (items / pageToken / hasMore / total)", async () => {
    const calls: RecordedRequest[] = [];
    const fetcher = stubFetcher(
      {
        code: 0,
        data: {
          items: [{ table_id: "tbl1", name: "T1", revision: 1 }],
          page_token: "next",
          has_more: true,
          total: 5,
        },
      },
      calls,
    );

    const page = (await feishuActionHandlers.list_bitable_tables(
      { appToken: "app1", pageSize: 1 },
      context(fetcher),
    )) as Record<string, unknown>;

    expect(page.items).toHaveLength(1);
    expect(page.pageToken).toBe("next");
    expect(page.hasMore).toBe(true);
    expect(page.total).toBe(5);
    expect(calls[0]?.url).toBe("https://open.feishu.cn/open-apis/bitable/v1/apps/app1/tables?page_size=1");
  });

  it("searches Bitable records with a POST body carrying field selection and filter", async () => {
    const calls: RecordedRequest[] = [];
    const fetcher = stubFetcher(
      { code: 0, data: { items: [{ record_id: "rec1", fields: {} }], has_more: false } },
      calls,
    );

    await feishuActionHandlers.search_bitable_records(
      { appToken: "app1", tableId: "tbl1", fieldNames: ["Name"], filter: { conjunction: "and" }, pageSize: 2 },
      context(fetcher),
    );

    const call = calls[0];
    expect(call?.init?.method).toBe("POST");
    expect(call?.url).toBe(
      "https://open.feishu.cn/open-apis/bitable/v1/apps/app1/tables/tbl1/records/search?page_size=2",
    );
    expect(JSON.parse(String(call?.init?.body))).toEqual({ field_names: ["Name"], filter: { conjunction: "and" } });
  });

  it("maps a missing-scope error code (HTTP 200 body) to 403, not 502", async () => {
    const calls: RecordedRequest[] = [];
    // 99991679 is the exact scope error the live Bitable search returned.
    const fetcher = stubFetcher({ code: 99991679, msg: "missing scope" }, calls);

    await expect(
      feishuActionHandlers.search_bitable_records({ appToken: "app1", tableId: "tbl1" }, context(fetcher)),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("maps an expired-credential code to 401", async () => {
    const calls: RecordedRequest[] = [];
    const fetcher = stubFetcher({ code: 99991663, msg: "token expired" }, calls);

    await expect(fetchFeishuUserInfo({ accessToken: "u-token", fetcher })).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a missing required id before making a request", async () => {
    const calls: RecordedRequest[] = [];
    const fetcher = stubFetcher({ code: 0, data: {} }, calls);

    await expect(feishuActionHandlers.get_document({}, context(fetcher))).rejects.toBeInstanceOf(ProviderRequestError);
    expect(calls).toHaveLength(0);
  });
});
