import { describe, expect, it, vi } from "vitest";
import { feishuActions, feishuOAuthScopesFor } from "../actions.ts";
import { createFeishuJsonRequest } from "./client.ts";
import { feishuMeetingArtifactScopes } from "./minutes-actions.ts";
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
  // Feishu's response body is `{ meeting, related_artifacts }`: the artifacts
  // are a sibling of the meeting, and each query_mode answers one of the two
  // (the official SDK names them GetOnlyMeeting and GetOnlyRelatedArtifacts).
  it("reads the meeting and its related artifacts in two requests when includeArtifacts is set", async () => {
    const fetcher = vi.fn<typeof fetch>(async (...call) => {
      const mode = new URL(requestOf(call).url).searchParams.get("query_mode");
      return Response.json({
        code: 0,
        msg: "success",
        data:
          mode === "1"
            ? { related_artifacts: { note_doc_token: "doxcn_note", verbatim_doc_token: "doxcn_verbatim" } }
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
    expect(artifactsUrl!.pathname).toBe("/open-apis/vc/v1/meetings/6911188411934433028");
    expect(artifactsUrl!.searchParams.get("query_mode")).toBe("1");
    expect(artifactsUrl!.searchParams.get("with_participants")).toBe("false");
  });

  it("returns empty related artifacts when Feishu sends none", async () => {
    const fetcher = vi.fn<typeof fetch>(async (...call) => {
      const mode = new URL(requestOf(call).url).searchParams.get("query_mode");
      return Response.json({
        code: 0,
        msg: "success",
        data: mode === "1" ? {} : { meeting: { id: "6911188411934433028" } },
      });
    });

    await expect(
      handlers(fetcher).get_vc_meeting({ meetingId: "6911188411934433028", includeArtifacts: true }),
    ).resolves.toEqual({ meeting: { id: "6911188411934433028" }, relatedArtifacts: {} });
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

describe("Feishu video meeting artifact permissions", () => {
  it("keeps the artifact field permissions out of the default consent", () => {
    const action = feishuActions.find((candidate) => candidate.name === "get_vc_meeting")!;

    expect(action.requiredScopes).toEqual(["vc:meeting.meetingevent:read"]);
    expect(action.providerPermissions).toEqual(["vc:meeting.meetingevent:read"]);
    expect(feishuMeetingArtifactScopes).toEqual(["vc:meeting.artifact.note:read", "vc:meeting.artifact.verbatim:read"]);
    for (const scope of feishuMeetingArtifactScopes) {
      expect(feishuOAuthScopesFor(feishuActions)).not.toContain(scope);
    }
  });
});
