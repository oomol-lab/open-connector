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
  it("reads the meeting and its related artifacts in two requests when includeArtifacts is set", async () => {
    const fetcher = vi.fn<typeof fetch>(async (...call) => {
      const isNote = new URL(requestOf(call).url).pathname.includes("/notes/");
      return Response.json({
        code: 0,
        msg: "success",
        data: isNote
          ? {
              note: {
                artifacts: [
                  { artifact_type: 1, doc_token: "doxcn_note" },
                  { artifact_type: 2, doc_token: "doxcn_verbatim" },
                ],
              },
            }
          : { meeting: { id: "6911188411934433028", start_time: "1608883322", note_id: "note_1" } },
      });
    });

    await expect(
      handlers(fetcher).get_vc_meeting({
        meetingId: "6911188411934433028",
        includeParticipants: true,
        includeArtifacts: true,
      }),
    ).resolves.toEqual({
      meeting: { id: "6911188411934433028", start_time: "1608883322", note_id: "note_1" },
      relatedArtifacts: { note_doc_token: "doxcn_note", verbatim_doc_token: "doxcn_verbatim" },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [meetingUrl, artifactsUrl] = fetcher.mock.calls.map((call) => new URL(requestOf(call).url));
    expect(meetingUrl!.pathname).toBe("/open-apis/vc/v1/meetings/6911188411934433028");
    expect(meetingUrl!.searchParams.get("query_mode")).toBe("0");
    expect(meetingUrl!.searchParams.get("with_participants")).toBe("true");
    expect(artifactsUrl!.pathname).toBe("/open-apis/vc/v1/notes/note_1");
    expect(artifactsUrl!.search).toBe("");
  });

  it("skips note lookup when the meeting has no note", async () => {
    const fetcher = vi.fn<typeof fetch>(async (...call) => {
      const isNote = new URL(requestOf(call).url).pathname.includes("/notes/");
      return Response.json({
        code: 0,
        msg: "success",
        data: isNote ? {} : { meeting: { id: "6911188411934433028" } },
      });
    });

    await expect(
      handlers(fetcher).get_vc_meeting({ meetingId: "6911188411934433028", includeArtifacts: true }),
    ).resolves.toEqual({ meeting: { id: "6911188411934433028" }, relatedArtifacts: {} });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns empty tokens when the note has no document artifacts", async () => {
    const fetcher = vi.fn<typeof fetch>(async (...call) =>
      Response.json({
        code: 0,
        data: new URL(requestOf(call).url).pathname.includes("/notes/")
          ? { note: { artifacts: [] } }
          : { meeting: { id: "meeting_1", note_id: "note_1" } },
      }),
    );
    await expect(handlers(fetcher).get_vc_meeting({ meetingId: "meeting_1", includeArtifacts: true })).resolves.toEqual(
      {
        meeting: { id: "meeting_1", note_id: "note_1" },
        relatedArtifacts: { note_doc_token: "", verbatim_doc_token: "" },
      },
    );
  });

  it.each([
    { code: 121005, msg: "no permission" },
    { code: 0, data: {} },
  ])("propagates failed or malformed note responses: %j", async (response) => {
    const fetcher = vi.fn<typeof fetch>(async (...call) =>
      Response.json(
        new URL(requestOf(call).url).pathname.includes("/notes/")
          ? response
          : { code: 0, data: { meeting: { id: "meeting_1", note_id: "note_1" } } },
      ),
    );
    await expect(
      handlers(fetcher).get_vc_meeting({ meetingId: "meeting_1", includeArtifacts: true }),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("makes one meeting request and returns no artifacts when includeArtifacts is omitted", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ code: 0, msg: "success", data: { meeting: { id: "6911188411934433028" } } }),
    );

    await expect(handlers(fetcher).get_vc_meeting({ meetingId: "6911188411934433028" })).resolves.toEqual({
      meeting: { id: "6911188411934433028" },
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
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
