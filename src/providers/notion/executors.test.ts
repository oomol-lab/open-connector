import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { describe, expect, it, vi } from "vitest";
import { credentialValidators, executors } from "./executors.ts";

type OAuthCredential = Extract<ResolvedCredential, { authType: "oauth2" }>;
type ApiKeyCredential = Extract<ResolvedCredential, { authType: "api_key" }>;

const WORKSPACE = "3C1A0E8F2B4D4E6A8F019B2C3D4E5F60";
const ALICE = "550e8400-e29b-41d4-a716-446655440000";
const BOT = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/** A stored OAuth credential as `oauth-flow-service` writes it: the token
 *  exchange response minus its secrets, on `metadata`. */
function grant(metadata: Record<string, unknown>): OAuthCredential {
  return {
    authType: "oauth2",
    accessToken: "ntn_live",
    tokenType: "Bearer",
    profile: { accountId: BOT, displayName: "Skardi", grantedScopes: [] },
    metadata,
  };
}

/** The token-exchange metadata Notion issues for a user-owned grant. */
function userGrant(): Record<string, unknown> {
  return {
    workspace_id: WORKSPACE,
    workspace_name: "Skardi",
    bot_id: "bot-51",
    owner: { type: "user", user: { object: "user", id: ALICE, name: "Alice Example" } },
  };
}

/** A pasted internal-integration secret, with what the validator stored: the
 *  `/users/me` bot object, whose `bot` names the workspace and its owner. */
function internalIntegration(metadata: Record<string, unknown>): ApiKeyCredential {
  return {
    authType: "api_key",
    apiKey: "secret_pasted",
    values: { apiKey: "secret_pasted" },
    profile: { accountId: BOT, displayName: "Skardi", grantedScopes: [] },
    metadata,
  };
}

function contextFor(credential: ResolvedCredential): ExecutionContext {
  return { getCredential: async () => credential };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("notion.get_current_user", () => {
  it("reads the workspace and owning user off the stored grant, with no network call", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    try {
      const result = await executors["notion.get_current_user"]!({}, contextFor(grant(userGrant())));
      expect(result).toEqual({
        ok: true,
        output: {
          workspaceId: WORKSPACE,
          workspaceName: "Skardi",
          userId: ALICE,
          userName: "Alice Example",
          isBot: false,
        },
      });
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("answers a bot for a grant whose owner is the workspace, and null for what it does not know", async () => {
    const result = await executors["notion.get_current_user"]!(
      {},
      contextFor(grant({ workspace_id: WORKSPACE, owner: { type: "workspace", workspace: true } })),
    );
    expect(result).toEqual({
      ok: true,
      output: { workspaceId: WORKSPACE, workspaceName: null, userId: null, userName: null, isBot: true },
    });
  });

  it("answers an internal integration from the stored bot object: its workspace, and no user", async () => {
    const result = await executors["notion.get_current_user"]!(
      {},
      contextFor(
        internalIntegration({
          object: "user",
          id: BOT,
          type: "bot",
          bot: { owner: { type: "workspace", workspace: true }, workspace_name: "Skardi", workspace_id: WORKSPACE },
        }),
      ),
    );
    expect(result).toEqual({
      ok: true,
      output: { workspaceId: WORKSPACE, workspaceName: "Skardi", userId: null, userName: null, isBot: true },
    });
  });

  it("reads the bot object's owner when the grant itself does not name one", async () => {
    const result = await executors["notion.get_current_user"]!(
      {},
      contextFor(
        grant({
          workspace_id: WORKSPACE,
          bot: { owner: { type: "user", user: { object: "user", id: ALICE, name: "Alice Example" } } },
        }),
      ),
    );
    expect(result).toMatchObject({ ok: true, output: { userId: ALICE, userName: "Alice Example", isBot: false } });
  });

  it("refuses a credential stored without any workspace id rather than guessing one", async () => {
    const result = await executors["notion.get_current_user"]!(
      {},
      contextFor(internalIntegration({ object: "user", id: BOT, type: "bot", bot: { workspace_name: "Skardi" } })),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("workspace_id") },
    });
  });
});

describe("notion.retrieve_page_markdown", () => {
  const PAGE = "7B2E4C1A-9D3F-4E5B-8A6C-1F2D3E4B5A60";

  function notionApi(pageBody: unknown, markdownBody: unknown) {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
      if (url.endsWith(`/v1/pages/${PAGE}`)) return jsonResponse(pageBody);
      if (url.includes(`/v1/pages/${PAGE}/markdown`)) return jsonResponse(markdownBody);
      if (url.endsWith(`/v1/blocks/${PAGE}`)) return jsonResponse(pageBody);
      return jsonResponse({ object: "error", code: "object_not_found", message: url }, 404);
    });
    return { fetcher, calls };
  }

  async function run(pageBody: unknown, markdownBody: unknown, input: Record<string, unknown> = { pageId: PAGE }) {
    const { fetcher, calls } = notionApi(pageBody, markdownBody);
    vi.stubGlobal("fetch", fetcher);
    try {
      const result = await executors["notion.retrieve_page_markdown"]!(input, contextFor(grant(userGrant())));
      return { result, calls };
    } finally {
      vi.unstubAllGlobals();
    }
  }

  it("constructs the row: the input's page id, the render, and the page object's revision", async () => {
    const { result, calls } = await run(
      // Notion spells the id its own way in the body; the row keeps the input's.
      { object: "page", id: PAGE.toLowerCase(), last_edited_time: "2026-09-01T10:00:00.000Z" },
      { object: "page_markdown", id: PAGE.toLowerCase(), markdown: "# Hi", truncated: false, unknown_block_ids: [] },
    );
    // **Notion's own fields keep Notion's names and survive verbatim**, and
    // the two constructed ones are additive. This action shipped with the
    // provider, so `object`, `id` and `unknown_block_ids` are a contract
    // existing SDK/CLI callers already read — an earlier revision renamed and
    // dropped them, which `toEqual` here exists to stop coming back.
    expect(result).toEqual({
      ok: true,
      output: {
        object: "page_markdown",
        id: PAGE.toLowerCase(),
        markdown: "# Hi",
        truncated: false,
        unknown_block_ids: [],
        pageId: PAGE,
        lastEditedTime: "2026-09-01T10:00:00.000Z",
      },
    });
    // Page object first — the cheap reachability question — then the render,
    // both at the API version the markdown endpoint requires.
    expect(calls.map((c) => c.url)).toEqual([
      `https://api.notion.com/v1/pages/${PAGE}`,
      `https://api.notion.com/v1/pages/${PAGE}/markdown`,
    ]);
    for (const call of calls) {
      expect(call.headers["notion-version"]).toBe("2026-03-11");
    }
  });

  it("coerces what a render may omit: markdown to '', truncated to false, unknown ids to []", async () => {
    const { result } = await run(
      { object: "page", id: PAGE, last_edited_time: "2026-09-01T10:00:00.000Z" },
      { object: "page_markdown", id: PAGE },
    );
    expect(result).toMatchObject({ ok: true, output: { markdown: "", truncated: false, unknown_block_ids: [] } });
  });

  it("keeps a partial render's evidence and drops non-string ids", async () => {
    const { result } = await run(
      { object: "page", id: PAGE, last_edited_time: "2026-09-01T10:00:00.000Z" },
      { object: "page_markdown", id: PAGE, markdown: "…", truncated: true, unknown_block_ids: ["b1", 7, "b2"] },
    );
    expect(result).toMatchObject({ ok: true, output: { truncated: true, unknown_block_ids: ["b1", "b2"] } });
  });

  it("forwards includeTranscript as Notion's query parameter", async () => {
    const { calls } = await run(
      { object: "page", id: PAGE, last_edited_time: "2026-09-01T10:00:00.000Z" },
      { object: "page_markdown", id: PAGE, markdown: "" },
      { pageId: PAGE, includeTranscript: true },
    );
    expect(calls[1]!.url).toBe(`https://api.notion.com/v1/pages/${PAGE}/markdown?include_transcript=true`);
  });

  it("refuses a page object with no revision rather than inventing one or consulting /blocks", async () => {
    const { result, calls } = await run(
      { object: "page", id: PAGE },
      { object: "page_markdown", id: PAGE, markdown: "x" },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "provider_error" } });
    // A successful page answer settles the kind of id; only a 404 falls through.
    expect(calls.map((c) => c.url)).toEqual([`https://api.notion.com/v1/pages/${PAGE}`]);
  });

  it("answers an id this grant cannot reach before attempting the render", async () => {
    // Neither endpoint knows it: both preflights 404 and the render is never
    // attempted. Two requests, not one — a 404 from `/pages` is not evidence
    // the id is unreachable, only that it is not a PAGE.
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      jsonResponse({ object: "error", code: "object_not_found", message: String(input) }, 404),
    );
    vi.stubGlobal("fetch", fetcher);
    try {
      const result = await executors["notion.retrieve_page_markdown"]!(
        { pageId: PAGE },
        contextFor(grant(userGrant())),
      );
      expect(result).toMatchObject({ ok: false, error: { details: { status: 404 } } });
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls.map((c) => String(c[0]))).toEqual([
        `https://api.notion.com/v1/pages/${PAGE}`,
        `https://api.notion.com/v1/blocks/${PAGE}`,
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /// **The advertised block-subtree flow.**
  ///
  /// This action's input has always been documented as "the page or block ID"
  /// and its description as "a Notion page **or block subtree**". A preflight
  /// that only knew `GET /pages/{id}` returned Notion's 404 before the render
  /// was reached, silently retiring that flow.
  it("renders a BLOCK subtree, reading its revision from the block object", async () => {
    const BLOCK = "1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9";
    const seen: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      seen.push(url);
      if (url.endsWith(`/v1/pages/${BLOCK}`)) {
        return jsonResponse({ object: "error", code: "object_not_found", message: "not a page" }, 404);
      }
      if (url.endsWith(`/v1/blocks/${BLOCK}`)) {
        return jsonResponse({ object: "block", id: BLOCK, last_edited_time: "2026-09-02T08:00:00.000Z" });
      }
      return jsonResponse({ object: "page_markdown", id: BLOCK, markdown: "## Section", truncated: false });
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      const result = await executors["notion.retrieve_page_markdown"]!(
        { pageId: BLOCK },
        contextFor(grant(userGrant())),
      );
      expect(result).toMatchObject({
        ok: true,
        output: { pageId: BLOCK, markdown: "## Section", lastEditedTime: "2026-09-02T08:00:00.000Z" },
      });
      expect(seen).toEqual([
        `https://api.notion.com/v1/pages/${BLOCK}`,
        `https://api.notion.com/v1/blocks/${BLOCK}`,
        `https://api.notion.com/v1/pages/${BLOCK}/markdown`,
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /// A 403 is an answer about the CREDENTIAL, not about which kind of id this
  /// is, so it must not be retried against the block endpoint: that would
  /// double the cost and report the second failure in place of the first.
  it("does not fall through to blocks on a non-404 refusal", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ object: "error", code: "restricted_resource", message: "no access" }, 403),
    );
    vi.stubGlobal("fetch", fetcher);
    try {
      const result = await executors["notion.retrieve_page_markdown"]!(
        { pageId: PAGE },
        contextFor(grant(userGrant())),
      );
      expect(result).toMatchObject({ ok: false, error: { details: { status: 403 } } });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("notion oauth2 credential validation", () => {
  const me = { object: "user", id: BOT, type: "bot", name: "Skardi Bot", bot: { workspace_name: "Skardi" } };

  it("names the OWNING USER as the profile, not the bot /users/me describes", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse(me));
    const result = await credentialValidators.oauth2!(grant(userGrant()), { fetcher });
    expect(result).toMatchObject({ profile: { accountId: ALICE, displayName: "Alice Example" } });
    // The liveness call still ran: a stale token must be refused here, not at
    // the first action.
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]![0])).toBe("https://api.notion.com/v1/users/me");
  });

  it("falls back to the bot profile for a grant that names no user", async () => {
    const fetcher = vi.fn(async () => jsonResponse(me));
    const result = await credentialValidators.oauth2!(
      grant({ workspace_id: WORKSPACE, owner: { type: "workspace", workspace: true } }),
      { fetcher },
    );
    expect(result).toMatchObject({ profile: { accountId: BOT, displayName: "Skardi" } });
  });

  it("still refuses a dead token whatever the grant says", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ object: "error", code: "unauthorized", message: "API token is invalid." }, 401),
    );
    await expect(credentialValidators.oauth2!(grant(userGrant()), { fetcher })).rejects.toMatchObject({ status: 401 });
  });
});

describe("notion comments", () => {
  const PAGE = "7b2e4c1a-9d3f-4e5b-8a6c-1f2d3e4b5a60";
  const DISCUSSION = "0c8f2d61-4b7e-4a3b-9d15-6e2f8a1b3d5e";

  function notionApi(answer: (url: string, init?: RequestInit) => Response) {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return answer(url, init);
    });
    return { fetcher, calls };
  }

  async function run(
    action: "notion.list_comments" | "notion.create_comment",
    input: Record<string, unknown>,
    answer: (url: string, init?: RequestInit) => Response,
  ) {
    const { fetcher, calls } = notionApi(answer);
    vi.stubGlobal("fetch", fetcher);
    try {
      const result = await executors[action]!(input, contextFor(grant(userGrant())));
      return { result, calls };
    } finally {
      vi.unstubAllGlobals();
    }
  }

  it("lists comments with GET /v1/comments?block_id and forwards Notion's list body verbatim", async () => {
    const body = {
      object: "list",
      results: [
        {
          object: "comment",
          id: "c-1",
          parent: { type: "page_id", page_id: PAGE },
          discussion_id: DISCUSSION,
          created_time: "2026-09-01T10:00:00.000Z",
          last_edited_time: "2026-09-01T10:00:00.000Z",
          created_by: { object: "user", id: ALICE },
          rich_text: [{ type: "text", text: { content: "Hi" }, plain_text: "Hi" }],
        },
      ],
      next_cursor: null,
      has_more: false,
      type: "comment",
      comment: {},
      request_id: "req-1",
    };
    const { result, calls } = await run("notion.list_comments", { blockId: PAGE }, () => jsonResponse(body));
    // Raw passthrough: every key Notion sent, `request_id` included, and nothing renamed.
    expect(result).toEqual({ ok: true, output: body });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`https://api.notion.com/v1/comments?block_id=${PAGE}`);
    expect(calls[0]!.init?.method).toBe("GET");
    expect(calls[0]!.init?.body).toBeUndefined();
    const headers = new Headers(calls[0]!.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer ntn_live");
    expect(headers.get("notion-version")).toBe("2026-03-11");
    expect(headers.has("content-type")).toBe(false);
  });

  it("pages with Notion's cursor: page_size and start_cursor ride the query string", async () => {
    const first = { object: "list", results: [{ object: "comment", id: "c-1" }], next_cursor: "cur-2", has_more: true };
    const second = { object: "list", results: [{ object: "comment", id: "c-2" }], next_cursor: null, has_more: false };
    const { fetcher, calls } = notionApi((url) => jsonResponse(url.includes("start_cursor=cur-2") ? second : first));
    vi.stubGlobal("fetch", fetcher);
    try {
      const page1 = await executors["notion.list_comments"]!(
        { blockId: PAGE, pageSize: 1 },
        contextFor(grant(userGrant())),
      );
      expect(page1).toEqual({ ok: true, output: first });
      const cursor = (page1 as { output: { next_cursor: string } }).output.next_cursor;
      const page2 = await executors["notion.list_comments"]!(
        { blockId: PAGE, pageSize: 1, startCursor: cursor },
        contextFor(grant(userGrant())),
      );
      expect(page2).toEqual({ ok: true, output: second });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(calls.map((c) => c.url)).toEqual([
      `https://api.notion.com/v1/comments?block_id=${PAGE}&page_size=1`,
      `https://api.notion.com/v1/comments?block_id=${PAGE}&page_size=1&start_cursor=cur-2`,
    ]);
  });

  it("creates a comment on a page with POST /v1/comments {parent, rich_text} and forwards the comment verbatim", async () => {
    const richText = [{ type: "text", text: { content: "Looks good" } }];
    const created = {
      object: "comment",
      id: "c-9",
      parent: { type: "page_id", page_id: PAGE },
      discussion_id: DISCUSSION,
      created_time: "2026-09-02T08:00:00.000Z",
      last_edited_time: "2026-09-02T08:00:00.000Z",
      created_by: { object: "user", id: BOT },
      rich_text: richText,
      request_id: "req-2",
    };
    const { result, calls } = await run(
      "notion.create_comment",
      { parent: { page_id: PAGE }, rich_text: richText },
      () => jsonResponse(created),
    );
    expect(result).toEqual({ ok: true, output: created });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.notion.com/v1/comments");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(new Headers(calls[0]!.init?.headers).get("content-type")).toBe("application/json");
    // The body is exactly what Notion documents: no undefined keys, no
    // discussion_id beside a parent.
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ parent: { page_id: PAGE }, rich_text: richText });
  });

  it("replies in a discussion with discussion_id and forwards attachments and display_name when given", async () => {
    const { calls } = await run(
      "notion.create_comment",
      {
        discussion_id: DISCUSSION,
        rich_text: [{ type: "text", text: { content: "Reply" } }],
        attachments: [{ file_upload_id: "fu-1", type: "file_upload" }],
        display_name: { type: "custom", custom: { name: "Review bot" } },
      },
      () => jsonResponse({ object: "comment", id: "c-10" }),
    );
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      discussion_id: DISCUSSION,
      rich_text: [{ type: "text", text: { content: "Reply" } }],
      attachments: [{ file_upload_id: "fu-1", type: "file_upload" }],
      display_name: { type: "custom", custom: { name: "Review bot" } },
    });
  });

  it("refuses a comment that names neither or both of parent and discussion_id before any request", async () => {
    for (const input of [{ rich_text: [] }, { parent: { page_id: PAGE }, discussion_id: DISCUSSION, rich_text: [] }]) {
      const { result, calls } = await run("notion.create_comment", input, () => jsonResponse({}));
      expect(result).toMatchObject({ ok: false, error: { message: expect.stringContaining("discussion_id") } });
      expect(calls).toHaveLength(0);
    }
  });

  it("passes Notion's refusal through with its status and message", async () => {
    const { result } = await run("notion.list_comments", { blockId: PAGE }, () =>
      jsonResponse(
        { object: "error", code: "restricted_resource", message: "Insufficient permissions for this endpoint." },
        403,
      ),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { details: { status: 403 }, message: "Insufficient permissions for this endpoint." },
    });
  });
});
