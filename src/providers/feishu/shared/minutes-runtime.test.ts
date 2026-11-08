import { describe, expect, it, vi } from "vitest";
import { createFeishuJsonRequest } from "./client.ts";
import { createFeishuMinutesActionHandlers } from "./minutes-runtime.ts";

const openBaseUrl = "https://open.feishu.cn/open-apis";

// Constructed provider-wire shapes, not live-account captures.
function handlers(fetcher: typeof fetch) {
  return createFeishuMinutesActionHandlers(
    createFeishuJsonRequest({ openBaseUrl, accessToken: "fixture-only", fetcher }),
  );
}

function requestOf(call: Parameters<typeof fetch>): Request {
  return call[0] instanceof Request ? call[0] : new Request(call[0], call[1]);
}

describe("Feishu video meeting records", () => {
  it("asks for meeting artifacts and participants when requested", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        code: 0,
        msg: "success",
        data: {
          meeting: {
            id: "6911188411934433028",
            note_id: "note_1",
            related_artifacts: { note_doc_token: "doxcn_note", verbatim_doc_token: "doxcn_verbatim" },
          },
        },
      }),
    );

    await expect(
      handlers(fetcher).get_vc_meeting({ meetingId: "6911188411934433028", queryMode: 1, includeParticipants: true }),
    ).resolves.toEqual({
      meeting: {
        id: "6911188411934433028",
        note_id: "note_1",
        related_artifacts: { note_doc_token: "doxcn_note", verbatim_doc_token: "doxcn_verbatim" },
      },
    });
    const url = new URL(requestOf(fetcher.mock.calls[0]!).url);
    expect(url.pathname).toBe("/open-apis/vc/v1/meetings/6911188411934433028");
    expect(url.searchParams.get("query_mode")).toBe("1");
    expect(url.searchParams.get("with_participants")).toBe("true");
  });

  it("keeps query_mode 0 when queryMode is omitted", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ code: 0, msg: "success", data: { meeting: { id: "6911188411934433028" } } }),
    );

    await handlers(fetcher).get_vc_meeting({ meetingId: "6911188411934433028" });

    const url = new URL(requestOf(fetcher.mock.calls[0]!).url);
    expect(url.searchParams.get("query_mode")).toBe("0");
    expect(url.searchParams.get("with_participants")).toBe("false");
  });

  it("searches meetings in a start-time window and answers a null page token on the last page", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        code: 0,
        msg: "success",
        data: { items: [{ id: "6911188411934433028", display_info: "Weekly sync" }], has_more: false, page_token: "" },
      }),
    );

    await expect(
      handlers(fetcher).search_vc_meetings({
        startTime: "2026-11-01T00:00:00Z",
        endTime: "2026-11-08T00:00:00Z",
        pageSize: 30,
        pageToken: "page_2",
      }),
    ).resolves.toEqual({
      items: [{ id: "6911188411934433028", display_info: "Weekly sync" }],
      hasMore: false,
      pageToken: null,
    });
    const request = requestOf(fetcher.mock.calls[0]!);
    const url = new URL(request.url);
    expect(url.pathname).toBe("/open-apis/vc/v1/meetings/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({ page_size: "30", page_token: "page_2" });
    expect(await request.json()).toEqual({
      meeting_filter: { start_time: { start_time: "2026-11-01T00:00:00Z", end_time: "2026-11-08T00:00:00Z" } },
    });
  });
});
