import type { ResolvedCredential } from "../../core/types.ts";
import type { Schema } from "@cfworker/json-schema";

import { Validator } from "@cfworker/json-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { granolaActions } from "./actions.ts";
import { executors, credentialValidators } from "./executors.ts";
import { parseGranolaFolders, parseGranolaMeetings, parseGranolaTranscript } from "./mcp-response.ts";

const summary = "    indented code\n\nKeep **Markdown** & code `a < b`.";
const meetingXml = (id: string) =>
  `<meeting id="${id}" title="Roadmap &amp; delivery" date="Sep 8, 2026 2:30 PM"><known_participants>Ada &lt;ada@example.com&gt;</known_participants><summary><![CDATA[${summary}]]></summary><private_notes>private sentinel</private_notes></meeting>`;
const meetingsXml = (ids: string[]) =>
  `<meetings_data count="${ids.length}">${ids.map(meetingXml).join("")}</meetings_data>`;

const oauth: ResolvedCredential = {
  authType: "oauth2",
  accessToken: "mcp-token",
  tokenType: "Bearer",
  metadata: {},
  profile: { accountId: "account", displayName: "Account", grantedScopes: [] },
};
const apiKey: ResolvedCredential = {
  authType: "api_key",
  apiKey: "rest-key",
  values: {},
  metadata: {},
  profile: oauth.profile,
};

interface McpFixtureOptions {
  sse?: boolean;
  status?: number;
  result?: Record<string, unknown> | ((params: Record<string, unknown>) => Record<string, unknown>);
  onCall?: (params: Record<string, unknown>) => void;
}

function stubMcp(options: McpFixtureOptions = {}): typeof fetch {
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer mcp-token");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    if (String(url).endsWith("/oauth2/userinfo")) {
      return Response.json({ sub: "native-user-id", email: "user@example.com", name: "User" });
    }
    expect(String(url)).toBe("https://mcp.granola.ai/mcp");
    if (options.status) return new Response(null, { status: options.status });
    if (init?.method === "GET") return new Response(null, { status: 405 });
    const request = JSON.parse(String(init?.body));
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    let result: unknown;
    if (request.method === "initialize") {
      result = {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "Granola fixture", version: "1" },
      };
    } else if (request.method === "tools/list") {
      result = { tools: [{ name: "list_meetings", inputSchema: { type: "object" } }] };
      options.onCall?.(request.params);
    } else if (request.method === "tools/call") {
      options.onCall?.(request.params);
      result = (typeof options.result === "function" ? options.result(request.params) : options.result) ?? {
        content: [
          { type: "text", text: "<access_notice>Only recent personal notes are available.</access_notice>" },
          { type: "text", text: meetingsXml(["meeting-1"]) },
        ],
      };
    } else throw new Error(`Unexpected MCP request: ${request.method}`);
    const message = { jsonrpc: "2.0", id: request.id, result };
    return options.sse
      ? new Response(`event: message\ndata: ${JSON.stringify(message)}\n\n`, {
          headers: { "content-type": "text/event-stream" },
        })
      : Response.json(message);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function stubRest(response: (url: URL, signal: AbortSignal) => Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = new URL(String(url));
      expect(target.origin).toBe("https://public-api.granola.ai");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer rest-key");
      return response(target, init!.signal!);
    }),
  );
}

async function execute(name: string, input: Record<string, unknown>, credential = oauth, signal?: AbortSignal) {
  const result = await executors[`granola.${name}`]!(input, { getCredential: async () => credential, signal });
  const action = granolaActions.find((action) => action.name === name);
  if (result.ok && action) {
    const validator = new Validator(action.outputSchema as Schema);
    expect(validator.validate(JSON.parse(JSON.stringify(result.output)))).toMatchObject({ valid: true });
  }
  return result;
}

describe("Granola REST and MCP execution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([false, true])("lists recent meetings with normalized output over JSON/SSE (SSE: %s)", async (sse) => {
    const onCall = vi.fn();
    stubMcp({ sse, onCall });
    const result = await execute("list_meetings", {});
    expect(result).toMatchObject({
      ok: true,
      output: {
        meetings: [
          {
            id: "meeting-1",
            title: "Roadmap & delivery",
            date: "Sep 8, 2026 2:30 PM",
            attendees: "Ada <ada@example.com>",
            summary,
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/private sentinel|access_notice|Only recent personal notes/);
    expect(onCall).toHaveBeenCalledWith({ name: "list_meetings", arguments: { time_range: "last_30_days" } });
  });

  it("retrieves the requested meetings and restores input order", async () => {
    const onCall = vi.fn();
    stubMcp({ onCall, result: { content: [{ type: "text", text: meetingsXml(["b", "a"]) }] } });
    await expect(execute("get_meetings", { meeting_ids: ["a", "b"] })).resolves.toMatchObject({
      ok: true,
      output: {
        meetings: [
          { id: "a", summary },
          { id: "b", summary },
        ],
      },
    });
    expect(onCall).toHaveBeenCalledWith({ name: "get_meetings", arguments: { meeting_ids: ["a", "b"] } });
  });

  it.each([["a"], ["a", "other"]])("rejects missing or unexpected meeting details (%j)", async (...ids) => {
    stubMcp({ result: { content: [{ type: "text", text: meetingsXml(ids) }] } });
    await expect(execute("get_meetings", { meeting_ids: ["a", "b"] })).resolves.toMatchObject({
      ok: false,
      error: { code: "provider_error", message: "Granola did not return every requested meeting." },
    });
  });

  it("returns original transcript text for the requested meeting", async () => {
    const onCall = vi.fn();
    const transcript = "  [00:10] Ada: A & B < C.\n";
    stubMcp({ onCall, result: { content: [{ type: "text", text: JSON.stringify({ id: "a", transcript }) }] } });
    await expect(execute("get_meeting_transcript", { meeting_id: "a" })).resolves.toMatchObject({
      ok: true,
      output: { meeting_id: "a", transcript },
    });
    expect(onCall).toHaveBeenCalledWith({ name: "get_meeting_transcript", arguments: { meeting_id: "a" } });
  });

  it("does not mistake a failed tool result for meeting content", async () => {
    stubMcp({ result: { isError: true, content: [{ type: "text", text: "Requires a paid plan" }] } });
    await expect(execute("get_meeting_transcript", { meeting_id: "a" })).resolves.toMatchObject({
      ok: false,
      error: { code: "provider_error", details: { status: 502 } },
    });
  });

  it.each([
    [401, "authorization_failed"],
    [403, "authorization_failed"],
    [429, "rate_limited"],
  ])("preserves actionable HTTP failures (%s)", async (status, code) => {
    stubMcp({ status: Number(status) });
    await expect(execute("list_meetings", {})).resolves.toMatchObject({ ok: false, error: { code } });
    stubRest(() => Response.json({ message: "Request failed" }, { status: Number(status) }));
    await expect(execute("list_meetings", {}, apiKey)).resolves.toMatchObject({ ok: false, error: { code } });
  });

  it("validates an OAuth account without invoking paid meeting tools", async () => {
    const onCall = vi.fn();
    const fetcher = stubMcp({ onCall });
    await expect(credentialValidators.oauth2!(oauth, { fetcher })).resolves.toMatchObject({
      profile: { accountId: "native-user-id", displayName: "User" },
    });
    expect(onCall).toHaveBeenCalledWith({});
  });

  it("reports invalid credentials as connection form errors", async () => {
    const fetcher = stubMcp({ status: 401 });
    await expect(credentialValidators.oauth2!(oauth, { fetcher })).rejects.toMatchObject({ status: 400 });
  });

  it.each(["created_before", "created_after", "updated_after"])(
    "rejects unsupported MCP timestamp filters before egress (%s)",
    async (field) => {
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await expect(execute("list_notes", { [field]: "2026-09-01" }, oauth)).resolves.toMatchObject({
        ok: false,
        error: { code: "invalid_input" },
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("paginates MCP notes and forwards the folder filter without fabricating REST metadata", async () => {
    const onCall = vi.fn();
    stubMcp({ onCall, result: { content: [{ type: "text", text: meetingsXml(["a", "b", "c"]) }] } });
    await expect(execute("list_notes", { folder_id: "folder-a", page_size: 2 })).resolves.toEqual({
      ok: true,
      output: {
        notes: [
          { id: "a", title: "Roadmap & delivery" },
          { id: "b", title: "Roadmap & delivery" },
        ],
        hasMore: true,
        cursor: "granola-mcp:b",
        nextCursor: "granola-mcp:b",
      },
    });
    await expect(
      execute("list_notes", { folder_id: "folder-a", page_size: 2, cursor: "granola-mcp:b" }),
    ).resolves.toEqual({
      ok: true,
      output: {
        notes: [{ id: "c", title: "Roadmap & delivery" }],
        hasMore: false,
        cursor: null,
        nextCursor: null,
      },
    });
    expect(onCall).toHaveBeenCalledWith({
      name: "list_meetings",
      arguments: { time_range: "last_30_days", folder_id: "folder-a" },
    });
  });

  it.each(["rest-cursor", "granola-mcp:missing"])("rejects invalid or expired MCP cursors (%s)", async (cursor) => {
    stubMcp();
    await expect(execute("list_notes", { cursor })).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
  });

  it.each([false, true])(
    "reads an MCP note summary with an optional transcript (include: %s)",
    async (includeTranscript) => {
      const transcript = "[00:10] Ada: Preserve the exact transcript.";
      const onCall = vi.fn();
      stubMcp({
        onCall,
        result: (params) => ({
          content: [
            {
              type: "text",
              text:
                params.name === "get_meeting_transcript" ? JSON.stringify({ id: "a", transcript }) : meetingsXml(["a"]),
            },
          ],
        }),
      });
      const result = await execute("get_note", { note_id: "a", include: includeTranscript ? "transcript" : undefined });
      expect(result).toEqual({
        ok: true,
        output: {
          note: {
            id: "a",
            title: "Roadmap & delivery",
            summary_markdown: summary,
            transcript: includeTranscript ? [{ text: transcript }] : undefined,
          },
        },
      });
      expect(onCall).toHaveBeenCalledWith({ name: "get_meetings", arguments: { meeting_ids: ["a"] } });
      expect(onCall).toHaveBeenCalledTimes(includeTranscript ? 2 : 1);
    },
  );

  it("lists MCP folders through the existing paginated folder action", async () => {
    const onCall = vi.fn();
    stubMcp({
      onCall,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              count: 2,
              folders: [
                { id: "folder-a", title: "Planning", description: null, note_count: 3 },
                { id: "folder-b", title: "Research", description: "Customer interviews", note_count: 7 },
              ],
            }),
          },
        ],
      },
    });
    await expect(execute("list_folders", { page_size: 1 })).resolves.toEqual({
      ok: true,
      output: {
        folders: [{ id: "folder-a", name: "Planning" }],
        hasMore: true,
        cursor: "granola-mcp:folder-a",
        nextCursor: "granola-mcp:folder-a",
      },
    });
    await expect(execute("list_folders", { page_size: 1, cursor: "granola-mcp:folder-a" })).resolves.toEqual({
      ok: true,
      output: { folders: [{ id: "folder-b", name: "Research" }], hasMore: false, cursor: null, nextCursor: null },
    });
    expect(onCall).toHaveBeenCalledWith({ name: "list_meeting_folders", arguments: {} });
  });

  it("preserves MCP plan restrictions for folders", async () => {
    stubMcp({ result: { isError: true, content: [{ type: "text", text: "Requires a paid plan" }] } });
    await expect(execute("list_folders", {})).resolves.toMatchObject({ ok: false, error: { code: "provider_error" } });
  });

  it("keeps REST notes and pagination on the API key endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        expect(String(url)).toBe("https://public-api.granola.ai/v1/notes?cursor=page-1&page_size=2");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer rest-key");
        return Response.json({ notes: [{ id: "note-1" }], hasMore: true, cursor: "page-2" });
      }),
    );
    await expect(execute("list_notes", { cursor: "page-1", page_size: 2 }, apiKey)).resolves.toMatchObject({
      ok: true,
      output: { notes: [{ id: "note-1" }], hasMore: true, nextCursor: "page-2" },
    });
  });

  it("lists every recent REST page using the same meeting action and output schema", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-11T12:00:00Z"));
    stubRest((url) => {
      expect(url.pathname).toBe("/v1/notes");
      expect(url.searchParams.get("created_after")).toBe("2026-08-12T12:00:00.000Z");
      expect(url.searchParams.get("page_size")).toBe("30");
      return url.searchParams.has("cursor")
        ? Response.json({ notes: [{ id: "not_b", title: null, created_at: "2026-09-09T12:00:00Z" }], hasMore: false })
        : Response.json({ notes: [{ id: "not_a", title: "Planning" }], hasMore: true, cursor: "page-2" });
    });
    const result = await execute("list_meetings", {}, apiKey);
    expect(JSON.parse(JSON.stringify(result))).toEqual({
      ok: true,
      output: {
        meetings: [
          { id: "not_a", title: "Planning" },
          { id: "not_b", title: null },
        ],
      },
    });
  });

  it.each([undefined, "repeat"])("rejects unusable REST pagination cursors (%s)", async (cursor) => {
    stubRest(() => Response.json({ notes: [], hasMore: true, cursor }));
    await expect(execute("list_meetings", {}, apiKey)).resolves.toMatchObject({
      ok: false,
      error: { code: "provider_error" },
    });
  });

  it("does not return a partial meeting list when a later REST page fails", async () => {
    stubRest((url) =>
      url.searchParams.has("cursor")
        ? Response.json({ message: "Temporarily unavailable" }, { status: 503 })
        : Response.json({ notes: [{ id: "not_a", title: "Planning" }], hasMore: true, cursor: "page-2" }),
    );
    await expect(execute("list_meetings", {}, apiKey)).resolves.toMatchObject({
      ok: false,
      error: { code: "provider_error" },
    });
  });

  it("reads API-key meeting summaries with Markdown and plain-text fallback in input order", async () => {
    stubRest((url) => {
      expect(url.search).toBe("");
      const id = url.pathname.split("/").at(-1);
      return Response.json({
        id,
        title: "Planning",
        calendar_event: { scheduled_start_time: "2026-09-08T14:30:00Z" },
        attendees: [
          { name: "Ada", email: "ada@example.com" },
          { name: null, email: "guest@example.com" },
        ],
        summary_markdown: id === "not_a" ? summary : null,
        summary_text: "Plain text summary",
      });
    });
    await expect(execute("get_meetings", { meeting_ids: ["not_a", "not_b"] }, apiKey)).resolves.toMatchObject({
      ok: true,
      output: {
        meetings: [
          { id: "not_a", summary, date: "2026-09-08T14:30:00Z", attendees: "Ada <ada@example.com>, guest@example.com" },
          { id: "not_b", summary: "Plain text summary" },
        ],
      },
    });
  });

  it("renders API-key transcript segments with timestamps and speaker labels", async () => {
    stubRest((url) => {
      expect(url.pathname).toBe("/v1/notes/not_a");
      expect(url.searchParams.get("include")).toBe("transcript");
      return Response.json({
        id: "not_a",
        transcript: [
          {
            speaker: { source: "microphone", diarization_label: "Speaker A" },
            start_time: "2026-09-08T14:30:00Z",
            text: "  Preserve whitespace.",
          },
          { speaker: { source: "speaker" }, text: "A & B < C." },
        ],
      });
    });
    await expect(execute("get_meeting_transcript", { meeting_id: "not_a" }, apiKey)).resolves.toMatchObject({
      ok: true,
      output: {
        meeting_id: "not_a",
        transcript: "[2026-09-08T14:30:00Z] Speaker A:   Preserve whitespace.\nspeaker: A & B < C.",
      },
    });
  });

  it.each(["get_meetings", "get_meeting_transcript"])("rejects mismatched REST identities for %s", async (action) => {
    stubRest(() => Response.json({ id: "not_other", title: "Wrong meeting", transcript: [] }));
    const input = action === "get_meetings" ? { meeting_ids: ["not_a"] } : { meeting_id: "not_a" };
    await expect(execute(action, input, apiKey)).resolves.toMatchObject({
      ok: false,
      error: { code: "provider_error", message: "Granola returned a different meeting identity." },
    });
  });

  it.each([null, [], [{ text: "   ", speaker: { source: "microphone" }, start_time: "2026-09-08T14:30:00Z" }]])(
    "reports unavailable API-key transcripts instead of returning empty text (%#)",
    async (transcript) => {
      stubRest(() => Response.json({ id: "not_a", transcript }));
      await expect(execute("get_meeting_transcript", { meeting_id: "not_a" }, apiKey)).resolves.toMatchObject({
        ok: false,
        error: { code: "provider_error", message: "Granola transcript is not available yet." },
      });
    },
  );

  it("keeps REST response body reads cancellable after headers arrive", async () => {
    const controller = new AbortController();
    const reading = Promise.withResolvers<void>();
    stubRest(
      (_url, signal) =>
        new Response(
          new ReadableStream(
            {
              start(body) {
                signal.addEventListener("abort", () => body.error(signal.reason), { once: true });
              },
              pull() {
                reading.resolve();
              },
            },
            { highWaterMark: 0 },
          ),
        ),
    );
    const result = execute("get_note", { note_id: "not_a" }, apiKey, controller.signal);
    await reading.promise;
    controller.abort();
    await expect(result).resolves.toMatchObject({
      ok: false,
      error: { code: "provider_error", details: { status: 504 } },
    });
  });
});

describe("Granola MCP response parsing", () => {
  it("accepts an empty MCP folder list", () => {
    expect(parseGranolaFolders('{"count":0,"folders":[]}')).toEqual([]);
  });

  it.each([
    "not JSON",
    '{"count":2,"folders":[{"id":"a","title":"Planning"}]}',
    '{"count":2,"folders":[{"id":"a","title":"Planning"},{"id":"a","title":"Duplicate"}]}',
    '{"count":1,"folders":[{"title":"Missing identity"}]}',
    '{"count":1,"folders":[{"id":"a"}]}',
  ])("rejects malformed or incomplete folder data (%#)", (text) => {
    expect(() => parseGranolaFolders(text)).toThrow();
  });

  it("accepts an empty meeting list and preserves identifiers and optional fields", () => {
    expect(parseGranolaMeetings('<meetings_data count="0"/>')).toEqual([]);
    expect(parseGranolaMeetings("<meetings_data/>")).toEqual([]);
    expect(parseGranolaMeetings('<meetings_data><meeting id="0001" title="" date=""/></meetings_data>')).toEqual([
      { id: "0001", title: "", date: "", attendees: "", summary: undefined },
    ]);
  });

  it.each([
    "not XML",
    "<access_notice>Only recent personal notes are available.</access_notice>",
    `<access_notice>Unclosed notice${meetingsXml(["a"])}`,
    '<!DOCTYPE x [<!ENTITY x "expanded">]><meetings_data/>',
    `<meetings_data count="2">${meetingXml("a")}</meetings_data>`,
    `<meetings_data has_more="true">${meetingXml("a")}</meetings_data>`,
    `<meetings_data next_cursor="next">${meetingXml("a")}</meetings_data>`,
    meetingsXml(["a", "a"]),
    '<meetings_data><meeting title="Missing identity" date=""/></meetings_data>',
  ])("rejects malformed or incomplete meeting data (%#)", (text) => {
    expect(() => parseGranolaMeetings(text)).toThrow();
  });

  it("preserves transcript text across JSON, XML, and plain-text responses", () => {
    const transcript = "  [00:10] Ada: A & B < C.\n";
    expect(parseGranolaTranscript(JSON.stringify({ id: "a", transcript }), "a")).toBe(transcript);
    expect(parseGranolaTranscript(`<transcript meeting_id="a"><![CDATA[${transcript}]]></transcript>`, "a")).toBe(
      transcript,
    );
    expect(parseGranolaTranscript(transcript, "a")).toBe(transcript);
  });

  it.each([
    '{"id":"other","transcript":"Wrong meeting"}',
    '<transcript meeting_id="other">Wrong meeting</transcript>',
    '{"id":"a","transcript":',
    '<transcript meeting_id="a">Unclosed transcript',
    '<!DOCTYPE x [<!ENTITY x "expanded">]><transcript meeting_id="a">&x;</transcript>',
    "<access_notice>Upgrade to read transcripts.</access_notice>",
    "No transcript available",
    "   ",
  ])("rejects mismatched, malformed, or unavailable transcripts (%#)", (text) => {
    expect(() => parseGranolaTranscript(text, "a")).toThrow();
  });
});
