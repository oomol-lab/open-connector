import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { Validator } from "@cfworker/json-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { slackbotActions } from "../slackbot/actions.ts";
import { executors as slackbotExecutors } from "../slackbot/executors.ts";
import { slackActions } from "./actions.ts";
import { credentialValidators, executors as slackExecutors } from "./executors.ts";

type OAuthCredential = Extract<ResolvedCredential, { authType: "oauth2" }>;

describe("Slack authorization paths", () => {
  it.each([
    { actionId: "slack.list_channels", rawTokenType: "bot", execute: slackExecutors["slack.list_channels"]! },
    {
      actionId: "slackbot.list_channels",
      rawTokenType: "user",
      execute: slackbotExecutors["slackbot.list_channels"]!,
    },
    {
      actionId: "slack.list_channels",
      rawTokenType: "Bearer",
      accessToken: "xoxb-bot-token",
      execute: slackExecutors["slack.list_channels"]!,
    },
    {
      actionId: "slackbot.list_channels",
      rawTokenType: "Bearer",
      accessToken: "xoxp-user-token",
      execute: slackbotExecutors["slackbot.list_channels"]!,
    },
    {
      actionId: "slack.list_channels",
      rawTokenType: "Bearer",
      accessToken: "xoxe.xoxb-rotated-bot-token",
      execute: slackExecutors["slack.list_channels"]!,
    },
    {
      actionId: "slackbot.list_channels",
      rawTokenType: "Bearer",
      accessToken: "xoxe.xoxp-rotated-user-token",
      execute: slackbotExecutors["slackbot.list_channels"]!,
    },
  ])("rejects the other authorization path for $actionId", async ({ rawTokenType, accessToken, execute }) => {
    const context: ExecutionContext = {
      getCredential: async () => oauthCredential(rawTokenType, {}, accessToken),
    };

    await expect(execute({}, context)).resolves.toMatchObject({
      ok: false,
      error: {
        code: "authorization_failed",
      },
    });
  });

  it.each([
    {
      actionId: "slack.open_conversation",
      rawTokenType: "user",
      execute: slackExecutors["slack.open_conversation"]!,
    },
    {
      actionId: "slackbot.open_conversation",
      rawTokenType: "bot",
      execute: slackbotExecutors["slackbot.open_conversation"]!,
    },
    {
      actionId: "slack.open_conversation",
      rawTokenType: "Bearer",
      accessToken: "xoxp-user-token",
      execute: slackExecutors["slack.open_conversation"]!,
    },
    {
      actionId: "slack.open_conversation",
      rawTokenType: "Bearer",
      accessToken: "xoxe.xoxp-rotated-user-token",
      execute: slackExecutors["slack.open_conversation"]!,
    },
    {
      actionId: "slackbot.open_conversation",
      rawTokenType: "Bearer",
      accessToken: "xoxe.xoxb-rotated-bot-token",
      execute: slackbotExecutors["slackbot.open_conversation"]!,
    },
  ])("allows the matching authorization path for $actionId", async ({ rawTokenType, accessToken, execute }) => {
    const context: ExecutionContext = {
      getCredential: async () => oauthCredential(rawTokenType, {}, accessToken),
    };

    await expect(execute({ userIds: [] }, context)).resolves.toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "open_conversation only supports one userId",
      },
    });
  });

  it.each([
    {
      tokenType: "user",
      accessToken: "access-token",
      metadata: {
        rawTokenType: "user",
        scope: "channels:read",
        authed_user: { scope: "chat:write,search:read" },
      },
      scopes: ["chat:write", "search:read"],
    },
    {
      tokenType: "Bearer user",
      accessToken: "xoxp-user-token",
      metadata: {
        rawTokenType: "Bearer",
        scope: "channels:read,chat:write,search:read",
      },
      scopes: ["channels:read", "chat:write", "search:read"],
    },
    {
      tokenType: "Bearer",
      accessToken: "xoxe.xoxp-rotated-user-token",
      metadata: { scope: "channels:read,channels:history" },
      scopes: ["channels:read", "channels:history"],
    },
    {
      tokenType: "Bearer",
      accessToken: "xoxe.xoxb-rotated-bot-token",
      metadata: { scope: "channels:read", authed_user: { scope: "search:read" } },
      scopes: ["channels:read"],
    },
    {
      tokenType: "bot",
      accessToken: "access-token",
      metadata: {
        rawTokenType: "bot",
        scope: "channels:read,chat:write",
        authed_user: { scope: "search:read" },
      },
      scopes: ["channels:read", "chat:write"],
    },
  ])("reads scopes from a $tokenType token response", async ({ accessToken, tokenType, metadata, scopes }) => {
    const result = await credentialValidators.oauth2!(oauthCredential(tokenType, metadata, accessToken), {
      fetcher: async (url, init) => {
        expect(url.toString()).toBe("https://slack.com/api/auth.test");
        expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${accessToken}`);
        return Response.json({ ok: true, team: "Example workspace", team_id: "T123", user_id: "U123" });
      },
    });

    expect(result).toMatchObject({
      profile: {
        accountId: "U123",
        displayName: "Example workspace",
      },
      grantedScopes: scopes,
    });
  });
});

function oauthCredential(
  rawTokenType: string,
  metadata: Record<string, unknown> = {},
  accessToken = "access-token",
): OAuthCredential {
  return {
    authType: "oauth2",
    accessToken,
    tokenType: rawTokenType,
    profile: {
      accountId: "U123",
      displayName: "Example workspace",
      grantedScopes: [],
    },
    metadata: { ...metadata, rawTokenType },
  };
}

describe("Slack ACL enumeration and api_key authorization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    { actionId: "slack.list_channels", apiKey: "xoxb-bot-token", execute: slackExecutors["slack.list_channels"]! },
    { actionId: "slack.list_channels", apiKey: "xoxp-user-token", execute: slackExecutors["slack.list_channels"]! },
    {
      actionId: "slackbot.list_channels",
      apiKey: "xoxb-bot-token",
      execute: slackbotExecutors["slackbot.list_channels"]!,
    },
  ])("accepts an api_key credential of either token kind for $actionId ($apiKey)", async ({ apiKey, execute }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${apiKey}`);
        return Response.json({ ok: true, channels: [{ id: "C1", name: "general" }] });
      }),
    );
    const context: ExecutionContext = {
      getCredential: async () => apiKeyCredential(apiKey),
    };

    await expect(execute({}, context)).resolves.toMatchObject({
      ok: true,
      output: { channels: [{ channelId: "C1", name: "general" }] },
    });
  });

  it("passes channel, cursor and limit to conversations.members and remaps the envelope", async () => {
    const execute = slackExecutors["slack.conversations_members"]!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = new URL(input.toString());
        expect(`${target.origin}${target.pathname}`).toBe("https://slack.com/api/conversations.members");
        expect(target.searchParams.get("channel")).toBe("C024BE91L");
        expect(target.searchParams.get("cursor")).toBe("dXNlcjpVMDYxTkZUVDI=");
        expect(target.searchParams.get("limit")).toBe("200");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer xoxb-bot-token");
        return Response.json({
          ok: true,
          members: ["U023BECGF", "U061F7AUR", "W012A3CDE"],
          response_metadata: { next_cursor: "e3VzZXJfaWQ6IFcxMjM0NTY3fQ==" },
        });
      }),
    );
    const context: ExecutionContext = {
      getCredential: async () => apiKeyCredential("xoxb-bot-token"),
    };

    await expect(
      execute({ channelId: "C024BE91L", cursor: "dXNlcjpVMDYxTkZUVDI=", limit: 200 }, context),
    ).resolves.toMatchObject({
      ok: true,
      output: {
        memberIds: ["U023BECGF", "U061F7AUR", "W012A3CDE"],
        nextCursor: "e3VzZXJfaWQ6IFcxMjM0NTY3fQ==",
      },
    });
  });

  it("returns an empty nextCursor when Slack sends none, so callers can terminate", async () => {
    const execute = slackExecutors["slack.conversations_members"]!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, members: ["U023BECGF"] })),
    );
    const context: ExecutionContext = {
      getCredential: async () => apiKeyCredential("xoxb-bot-token"),
    };

    await expect(execute({ channelId: "C024BE91L" }, context)).resolves.toMatchObject({
      ok: true,
      output: { memberIds: ["U023BECGF"], nextCursor: "" },
    });
  });

  it("slackbot inherits conversations_members", () => {
    expect(slackbotExecutors["slackbot.conversations_members"]).toBeDefined();
  });

  it("declares api_key on the slack provider definition", async () => {
    const { provider } = await import("./definition.ts");
    expect(provider.authTypes).toContain("api_key");
  });

  it("validates an api_key credential against auth.test and keeps the team in metadata", async () => {
    const result = await credentialValidators.apiKey!(apiKeyCredential("xoxb-bot-token"), {
      fetcher: async (url, init) => {
        expect(url.toString()).toBe("https://slack.com/api/auth.test");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer xoxb-bot-token");
        return Response.json({
          ok: true,
          team: "Example workspace",
          team_id: "T024BE7LD",
          user_id: "U0G9QF9C6",
        });
      },
    });

    expect(result).toMatchObject({
      profile: {
        accountId: "U0G9QF9C6",
        displayName: "Example workspace",
      },
      metadata: {
        currentAccount: { team_id: "T024BE7LD" },
      },
    });
  });
});

function apiKeyCredential(apiKey: string): Extract<ResolvedCredential, { authType: "api_key" }> {
  return {
    authType: "api_key",
    apiKey,
    values: { apiKey },
    profile: {
      accountId: "U0G9QF9C6",
      displayName: "Example workspace",
      grantedScopes: [],
    },
    metadata: {},
  };
}

describe("get_channel_messages pagination", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes the cursor through and surfaces nextCursor", async () => {
    const execute = slackExecutors["slack.get_channel_messages"]!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const target = new URL(input.toString());
        expect(target.searchParams.get("cursor")).toBe("bmV4dF90czox");
        return Response.json({
          ok: true,
          messages: [{ ts: "1711.0001", user: "U023BECGF", text: "hi" }],
          has_more: true,
          response_metadata: { next_cursor: "bmV4dF90czoy" },
        });
      }),
    );
    const context: ExecutionContext = {
      getCredential: async () => apiKeyCredential("xoxb-bot-token"),
    };

    await expect(execute({ channelId: "C024BE91L", cursor: "bmV4dF90czox" }, context)).resolves.toMatchObject({
      ok: true,
      output: {
        messages: [{ ts: "1711.0001", userId: "U023BECGF", text: "hi" }],
        hasMore: true,
        nextCursor: "bmV4dF90czoy",
      },
    });
  });

  it("answers an empty nextCursor on the last page", async () => {
    const execute = slackExecutors["slack.get_channel_messages"]!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, messages: [], has_more: false })),
    );
    const context: ExecutionContext = {
      getCredential: async () => apiKeyCredential("xoxb-bot-token"),
    };

    await expect(execute({ channelId: "C024BE91L" }, context)).resolves.toMatchObject({
      ok: true,
      output: { messages: [], hasMore: false, nextCursor: "" },
    });
  });
});

describe("conversation history time window", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    { actionId: "slack.get_channel_messages", input: { channelId: "C024BE91L" } },
    { actionId: "slack.get_thread", input: { channelId: "C024BE91L", threadTs: "1700000000.000100" } },
  ] as const)("passes oldest, latest and inclusive through to $actionId verbatim", async ({ actionId, input }) => {
    const execute = slackExecutors[actionId]!;
    const seen: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (target: RequestInfo | URL) => {
        seen.push(new URL(target.toString()));
        return Response.json({ ok: true, messages: [], has_more: false });
      }),
    );
    const context: ExecutionContext = {
      getCredential: async () => apiKeyCredential("xoxb-bot-token"),
    };

    await expect(
      execute({ ...input, oldest: "1700000000.123456", latest: "1700003600.000000", inclusive: true }, context),
    ).resolves.toMatchObject({ ok: true });

    // Verbatim: a bound Slack compares against its own `ts` must not be
    // rounded, re-scaled, or re-serialized on the way through.
    expect(seen[0]!.searchParams.get("oldest")).toBe("1700000000.123456");
    expect(seen[0]!.searchParams.get("latest")).toBe("1700003600.000000");
    expect(seen[0]!.searchParams.get("inclusive")).toBe("true");
  });

  it.each([
    { actionId: "slack.get_channel_messages", input: { channelId: "C024BE91L" } },
    { actionId: "slack.get_thread", input: { channelId: "C024BE91L", threadTs: "1700000000.000100" } },
  ] as const)("omits window parameters $actionId was not given", async ({ actionId, input }) => {
    const execute = slackExecutors[actionId]!;
    const seen: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (target: RequestInfo | URL) => {
        seen.push(new URL(target.toString()));
        return Response.json({ ok: true, messages: [], has_more: false });
      }),
    );
    const context: ExecutionContext = {
      getCredential: async () => apiKeyCredential("xoxb-bot-token"),
    };

    await expect(execute(input, context)).resolves.toMatchObject({ ok: true });

    for (const key of ["oldest", "latest", "inclusive"]) {
      expect(seen[0]!.searchParams.has(key)).toBe(false);
    }
  });

  it.each(["slack.get_channel_messages", "slack.get_thread"])(
    "accepts a limit up to conversations.history's 999 ceiling on %s",
    (actionId) => {
      const action = slackActions.find((candidate) => candidate.id === actionId)!;
      const base =
        actionId === "slack.get_thread"
          ? { channelId: "C024BE91L", threadTs: "1700000000.000100" }
          : { channelId: "C024BE91L" };
      expect(validateActionInput(action, { ...base, limit: 999 }).valid).toBe(true);
      expect(validateActionInput(action, { ...base, limit: 1000 }).valid).toBe(false);
    },
  );

  it("paginates a thread by cursor", async () => {
    const execute = slackExecutors["slack.get_thread"]!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (target: RequestInfo | URL) => {
        expect(new URL(target.toString()).searchParams.get("cursor")).toBe("bmV4dF90czox");
        return Response.json({
          ok: true,
          messages: [{ ts: "1700000000.000200", user: "U023BECGF", text: "reply" }],
          has_more: true,
          response_metadata: { next_cursor: "bmV4dF90czoy" },
        });
      }),
    );
    const context: ExecutionContext = {
      getCredential: async () => apiKeyCredential("xoxb-bot-token"),
    };

    await expect(
      execute({ channelId: "C024BE91L", threadTs: "1700000000.000100", cursor: "bmV4dF90czox" }, context),
    ).resolves.toMatchObject({
      ok: true,
      output: { hasMore: true, nextCursor: "bmV4dF90czoy" },
    });
  });
});

describe("message normalization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the fields beyond ts/userId/text that Slack returned", async () => {
    const execute = slackExecutors["slack.get_channel_messages"]!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ok: true,
          has_more: false,
          messages: [
            {
              type: "message",
              subtype: "bot_message",
              ts: "1700000000.123456",
              bot_id: "B0G9QF9C6",
              app_id: "A0G9QF9C6",
              username: "deploybot",
              team: "T024BE7LD",
              client_msg_id: "3d1b0a3e-0000-4000-8000-000000000000",
              text: "shipped",
              edited: { user: "U023BECGF", ts: "1700000001.000000" },
              thread_ts: "1700000000.123456",
              parent_user_id: "U023BECGF",
              reply_count: 2,
              reply_users_count: 1,
              latest_reply: "1700000100.000000",
              is_locked: true,
              reactions: [{ name: "tada", count: 2, users: ["U1", "U2"] }],
              blocks: [{ type: "section" }],
            },
          ],
        }),
      ),
    );
    const context: ExecutionContext = {
      getCredential: async () => apiKeyCredential("xoxb-bot-token"),
    };

    const result = (await execute({ channelId: "C024BE91L" }, context)) as {
      ok: true;
      output: { messages: Array<Record<string, unknown>> };
    };

    expect(result.output.messages[0]).toEqual({
      ts: "1700000000.123456",
      type: "message",
      subtype: "bot_message",
      userId: "",
      botId: "B0G9QF9C6",
      appId: "A0G9QF9C6",
      username: "deploybot",
      teamId: "T024BE7LD",
      clientMsgId: "3d1b0a3e-0000-4000-8000-000000000000",
      text: "shipped",
      editedTs: "1700000001.000000",
      threadTs: "1700000000.123456",
      parentUserId: "U023BECGF",
      replyCount: 2,
      replyUsersCount: 1,
      latestReply: "1700000100.000000",
      isLocked: true,
      reactions: [{ name: "tada", count: 2, userIds: ["U1", "U2"] }],
    });
    // Declared but unsent fields are omitted rather than emitted empty, so a
    // reader can tell "Slack said nothing" from "Slack said nothing here".
    expect(result.output.messages[0]).not.toHaveProperty("blocks");
  });

  it("omits every optional field on a bare message", async () => {
    const execute = slackExecutors["slack.get_channel_messages"]!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ok: true,
          has_more: false,
          messages: [{ ts: "1700000000.123456", user: "U023BECGF", text: "hi" }],
        }),
      ),
    );
    const context: ExecutionContext = {
      getCredential: async () => apiKeyCredential("xoxb-bot-token"),
    };

    const result = (await execute({ channelId: "C024BE91L" }, context)) as {
      ok: true;
      output: { messages: Array<Record<string, unknown>> };
    };

    expect(result.output.messages[0]).toEqual({
      ts: "1700000000.123456",
      userId: "U023BECGF",
      text: "hi",
    });
  });

  it.each([
    { actionId: "slack.get_channel_messages", key: "get_channel_messages" },
    { actionId: "slack.get_thread", key: "get_thread" },
  ])("declares an output schema $key rows validate against", ({ actionId }) => {
    const action = slackActions.find((candidate) => candidate.id === actionId)!;
    const output = new Validator(action.outputSchema);
    expect(
      output.validate({
        messages: [
          {
            ts: "1700000000.123456",
            userId: "U023BECGF",
            text: "hi",
            threadTs: "1700000000.123456",
            replyCount: 2,
            reactions: [{ name: "tada", count: 2, userIds: ["U1"] }],
          },
        ],
        hasMore: false,
        nextCursor: "",
      }).valid,
    ).toBe(true);
  });
});

describe("Slack current credential identity", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("exposes a scope-free, empty-input identity contract only on Slack", () => {
    const action = slackActions.find((action) => action.id === "slack.get_current_user");
    expect(action).toBeDefined();
    expect(action!.requiredScopes).toEqual([]);
    expect(validateActionInput(action!, {}).valid).toBe(true);
    expect(validateActionInput(action!, { teamId: "TOTHER" }).valid).toBe(false);
    const output = new Validator(action!.outputSchema);
    expect(output.validate({ teamId: "T123", userId: "U123", isBot: false }).valid).toBe(true);
    for (const invalid of [
      { userId: "U123", isBot: false },
      { teamId: "T123", isBot: false },
      { teamId: "T123", userId: "U123" },
      { teamId: "", userId: "U123", isBot: false },
      { teamId: "T123", userId: "", isBot: false },
    ]) {
      expect(output.validate(invalid).valid).toBe(false);
    }
    expect(slackbotActions.some((action) => action.name === "get_current_user")).toBe(false);
    expect(slackbotExecutors["slackbot.get_current_user"]).toBeUndefined();
  });

  it.each([
    { credential: oauthCredential("user", {}, "opaque-user-token"), botId: undefined, isBot: false },
    { credential: oauthCredential("user", {}, "xoxp-user-token"), botId: "B123", isBot: true },
    { credential: apiKeyCredential("xoxb-misleading-prefix"), botId: undefined, isBot: false },
    { credential: apiKeyCredential("opaque-bot-token"), botId: "B123", isBot: true },
  ])("uses auth.test identity and bot_id for $credential.authType ($isBot)", async ({ credential, botId, isBot }) => {
    const execute = slackExecutors["slack.get_current_user"];
    expect(execute).toBeDefined();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toBe("https://slack.com/api/auth.test");
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeUndefined();
        const token = credential.authType === "oauth2" ? credential.accessToken : credential.apiKey;
        expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
        return Response.json({ ok: true, team_id: "T024BE7LD", user_id: "U024BE7LH", bot_id: botId });
      }),
    );
    await expect(
      execute!(
        {},
        {
          getCredential: async (service) => {
            expect(service).toBe("slack");
            return credential;
          },
        },
      ),
    ).resolves.toMatchObject({
      ok: true,
      output: { teamId: "T024BE7LD", userId: "U024BE7LH", isBot },
    });
  });

  it.each([
    {},
    { team_id: "T123", user_id: "U123" },
    { ok: "true", team_id: "T123", user_id: "U123" },
    { ok: true, user_id: "U123" },
    { ok: true, team_id: "T123" },
    { ok: true, team_id: "", user_id: "U123" },
    { ok: true, team_id: "T123", user_id: " " },
    { ok: true, team_id: 123, user_id: "U123" },
    { ok: true, team_id: "T123", user_id: null },
    { ok: true, team_id: " T123", user_id: "U123" },
    { ok: true, team_id: "T123", user_id: "U123", bot_id: "" },
    { ok: true, team_id: "T123", user_id: "U123", bot_id: false },
    { ok: true, team_id: "T123", user_id: "U123", bot_id: null },
  ])("rejects malformed auth.test identity %j", async (payload) => {
    const execute = slackExecutors["slack.get_current_user"];
    expect(execute).toBeDefined();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(payload)),
    );
    const result = await execute!({}, { getCredential: async () => oauthCredential("user") });
    expect(result).toMatchObject({ ok: false, error: { code: "provider_error", details: { status: 502 } } });
    expect(result).not.toHaveProperty("output");
  });

  it("propagates a rejected credential instead of returning an identity", async () => {
    const execute = slackExecutors["slack.get_current_user"];
    expect(execute).toBeDefined();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: false, error: "invalid_auth" })),
    );
    await expect(execute!({}, { getCredential: async () => oauthCredential("user") })).resolves.toMatchObject({
      ok: false,
      error: { code: "authorization_failed" },
    });
  });
});

describe("Slack discovery page validation", () => {
  afterEach(() => vi.unstubAllGlobals());

  const publicChannel = {
    id: "C111",
    is_channel: true,
    is_group: false,
    is_im: false,
    is_mpim: false,
    is_private: false,
  };
  const privateChannel = { ...publicChannel, id: "C222", is_private: true };
  const context: ExecutionContext = { getCredential: async () => oauthCredential("user") };
  const execute = slackExecutors["slack.list_conversations"]!;

  async function expectInvalidPage(body: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 200 })),
    );
    const result = await execute({ cursor: "page-two" }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "provider_error", details: { status: 502 } } });
    expect(result).not.toHaveProperty("output");
  }

  it.each(["", "<html>upstream unavailable</html>", '{"ok":true,"channels":['])(
    "rejects invalid JSON instead of completing a later page: %j",
    expectInvalidPage,
  );

  it.each(
    [
      null,
      [],
      1,
      "unexpected",
      {},
      { channels: [] },
      ...[null, 0, 1, "true", [], {}].map((ok) => ({ ok, channels: [] })),
    ].map((payload) => ({ payload })),
  )("requires an explicit successful Slack envelope: $payload", async ({ payload }) => {
    await expectInvalidPage(JSON.stringify(payload));
  });

  it.each([{}, ...[null, {}, "channels", 0, false].map((channels) => ({ channels }))])(
    "requires a channels array: %j",
    async (fields) => {
      await expectInvalidPage(JSON.stringify({ ok: true, ...fields }));
    },
  );

  it.each([null, [], "metadata", 0, false].map((metadata) => ({ metadata })))(
    "rejects malformed present response_metadata: $metadata",
    async ({ metadata }) => {
      await expectInvalidPage(JSON.stringify({ ok: true, channels: [publicChannel], response_metadata: metadata }));
    },
  );

  it.each([0, 42, false, [], {}, " ", " next-page", "next-page "].map((cursor) => ({ cursor })))(
    "rejects malformed present next_cursor: $cursor",
    async ({ cursor }) => {
      await expectInvalidPage(
        JSON.stringify({ ok: true, channels: [publicChannel], response_metadata: { next_cursor: cursor } }),
      );
    },
  );

  it.each([
    {},
    { response_metadata: {} },
    { response_metadata: { next_cursor: "" } },
    { response_metadata: { next_cursor: null } },
  ])("accepts documented terminal cursor omissions: %j", async (fields) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, channels: [], ...fields })),
    );
    await expect(execute({}, context)).resolves.toMatchObject({
      ok: true,
      output: { conversations: [], nextCursor: null },
    });
  });

  it("preserves the cursor on an empty intermediate page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ok: true,
          channels: [],
          response_metadata: { next_cursor: "next-page=" },
        }),
      ),
    );
    await expect(execute({}, context)).resolves.toMatchObject({
      ok: true,
      output: { conversations: [], nextCursor: "next-page=" },
    });
  });

  it.each(
    [
      null,
      [],
      "channel",
      7,
      ...[undefined, null, 123, "", " ", " C222"].map((id) => ({ ...privateChannel, id })),
      ...["is_channel", "is_group", "is_im", "is_mpim", "is_private"].map((field) => ({
        ...privateChannel,
        [field]: "true",
      })),
      { ...privateChannel, is_private: undefined },
      { id: "C222", is_im: false, is_mpim: false, is_private: true },
      { id: "C222", is_channel: true },
      { id: "G222", is_group: true },
      { id: "G222", is_group: true, is_private: true },
      { ...privateChannel, is_group: true },
      { id: "D333", is_im: true, is_mpim: true },
      { id: "D333", is_im: true, is_private: false },
      { ...privateChannel, is_im: true },
      { ...privateChannel, is_mpim: true },
      { ...privateChannel, is_channel: false, is_group: true, is_private: false },
    ].map((channel) => ({ channel })),
  )("rejects an invalid row without publishing the preceding valid row: $channel", async ({ channel }) => {
    await expectInvalidPage(JSON.stringify({ ok: true, channels: [publicChannel, channel] }));
  });

  it("preserves modern and legacy channels, minimal IMs, and group DMs without requiring display fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ok: true,
          channels: [
            publicChannel,
            privateChannel,
            { ...privateChannel, id: "G222", is_channel: false, is_group: true, is_archived: true },
            { id: "D333", is_im: true },
            { id: "G444", is_channel: false, is_group: true, is_im: false, is_mpim: true, is_private: true },
          ],
        }),
      ),
    );
    const result = await execute({}, context);
    expect(result).toMatchObject({
      ok: true,
      output: {
        nextCursor: null,
        conversations: [
          { channelId: "C111", type: "public_channel" },
          { channelId: "C222", type: "private_channel" },
          { channelId: "G222", type: "private_channel", isArchived: true },
          { channelId: "D333", type: "im" },
          { channelId: "G444", type: "mpim" },
        ],
      },
    });
  });

  // Positive discriminators identify the kind; omitted negative flags are not
  // evidence of a malformed row. The legacy MPIM example omits is_im entirely:
  // https://docs.slack.dev/reference/objects/mpim-object/
  // Modern channel privacy is explicit in the conversation boolean contract:
  // https://docs.slack.dev/reference/objects/conversation-object/#conversation-related-booleans
  // Legacy groups need is_mpim:false because MPIMs can also appear as groups:
  // https://docs.slack.dev/reference/objects/group-object/
  it.each([
    { row: { id: "D333", is_im: true }, kind: "im" },
    { row: { id: "G444", is_mpim: true }, kind: "mpim" },
    { row: { id: "G444", is_mpim: true, is_group: false }, kind: "mpim" },
    { row: { id: "G444", is_mpim: true, is_group: true }, kind: "mpim" },
    { row: { id: "C111", is_channel: true, is_private: false }, kind: "public_channel" },
    { row: { id: "C222", is_channel: true, is_private: true }, kind: "private_channel" },
    { row: { id: "G222", is_group: true, is_mpim: false }, kind: "private_channel" },
    { row: { id: "G222", is_group: true, is_mpim: false, is_private: true }, kind: "private_channel" },
    { row: { ...privateChannel, is_im: undefined }, kind: "private_channel" },
    { row: { ...privateChannel, is_mpim: undefined }, kind: "private_channel" },
  ])("accepts an unambiguous minimal $kind row: $row", async ({ row, kind }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, channels: [row] })),
    );
    await expect(execute({}, context)).resolves.toMatchObject({
      ok: true,
      output: { conversations: [{ channelId: row.id, type: kind }], nextCursor: null },
    });
  });

  it.each([
    { error: "invalid_auth", code: "authorization_failed" },
    { error: "ratelimited", code: "rate_limited" },
  ])("preserves Slack's explicit $error failure", async ({ error, code }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: false, error })),
    );
    await expect(execute({}, context)).resolves.toMatchObject({ ok: false, error: { code } });
  });
});

describe("Slack discovery rate limit details", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("preserves Retry-After through the action error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ok: false, error: "ratelimited" }, { status: 429, headers: { "Retry-After": "73" } }),
      ),
    );
    const execute = slackExecutors["slack.list_conversations"]!;
    const result = await execute(
      { types: ["public_channel"], cursor: "page-two" },
      { getCredential: async () => oauthCredential("user") },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "rate_limited", details: { status: 429, details: { retryAfterSeconds: 73 } } },
    });
  });

  it.each(["", "not JSON", "null"])("preserves Retry-After when the HTTP 429 body is unreadable: %j", async (body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 429, headers: { "Retry-After": "73" } })),
    );
    await expect(
      slackExecutors["slack.list_conversations"]!(
        {},
        {
          getCredential: async () => oauthCredential("user"),
        },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "rate_limited", details: { status: 429, details: { retryAfterSeconds: 73 } } },
    });
  });
});

describe("Slack credential validators require an auth.test identity", () => {
  const anonymousPayloads = [{ ok: true }, { ok: true, team: "Example workspace" }, { ok: true, team_id: "T123" }];

  it("apiKey rejects a successful auth.test that names no user", async () => {
    for (const payload of anonymousPayloads) {
      await expect(
        credentialValidators.apiKey!(apiKeyCredential("xoxb-bot-token"), {
          fetcher: async () => Response.json(payload),
        }),
      ).rejects.toMatchObject({ status: 502 });
    }
  });

  it("oauth2 rejects a successful auth.test that names no user", async () => {
    for (const payload of anonymousPayloads) {
      await expect(
        credentialValidators.oauth2!(oauthCredential("user"), { fetcher: async () => Response.json(payload) }),
      ).rejects.toMatchObject({ status: 502 });
    }
  });

  it("falls back to the workspace ID as displayName when auth.test omits the team name", async () => {
    await expect(
      credentialValidators.apiKey!(apiKeyCredential("xoxb-bot-token"), {
        fetcher: async () => Response.json({ ok: true, team_id: "T123", user_id: "U123" }),
      }),
    ).resolves.toMatchObject({ profile: { accountId: "U123", displayName: "T123" } });
  });
});

describe("Slack message and member page validation", () => {
  afterEach(() => vi.unstubAllGlobals());

  const context: ExecutionContext = { getCredential: async () => apiKeyCredential("xoxb-bot-token") };
  const membersPage = {
    actionId: "slack.conversations_members",
    execute: slackExecutors["slack.conversations_members"]!,
    input: { channelId: "C024BE91L" },
    list: "members",
  };
  const messagePages = [
    {
      actionId: "slack.get_channel_messages",
      execute: slackExecutors["slack.get_channel_messages"]!,
      input: { channelId: "C024BE91L" },
      list: "messages",
    },
    {
      actionId: "slack.get_thread",
      execute: slackExecutors["slack.get_thread"]!,
      input: { channelId: "C024BE91L", threadTs: "1700000000.000100" },
      list: "messages",
    },
  ];
  const pages = [...messagePages, membersPage];

  async function expectInvalidPage(page: (typeof pages)[number], payload: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(payload)),
    );
    const result = await page.execute(page.input, context);
    expect(result).toMatchObject({ ok: false, error: { code: "provider_error", details: { status: 502 } } });
    expect(result).not.toHaveProperty("output");
  }

  it.each(pages)("$actionId rejects a page whose list is missing or not an array", async (page) => {
    for (const value of [undefined, null, {}, "row", 0]) {
      await expectInvalidPage(page, { ok: true, [page.list]: value });
    }
  });

  it.each(pages)("$actionId rejects a present next_cursor that is not a plain string", async (page) => {
    for (const cursor of [0, false, [], {}, " ", " next", "next "]) {
      await expectInvalidPage(page, { ok: true, [page.list]: [], response_metadata: { next_cursor: cursor } });
    }
    await expectInvalidPage(page, { ok: true, [page.list]: [], response_metadata: "metadata" });
  });

  it.each(messagePages)("$actionId rejects a message row that is not an object or has no ts", async (page) => {
    for (const row of [null, "message", 1, {}, { ts: "" }, { ts: 1700000000 }]) {
      await expectInvalidPage(page, { ok: true, messages: [{ ts: "1700000000.000001" }, row] });
    }
    await expectInvalidPage(page, { ok: true, messages: [], has_more: "true" });
  });

  it.each([null, "", " ", " U1", 7, {}])("conversations_members rejects a malformed member ID %j", async (member) => {
    await expectInvalidPage(membersPage, { ok: true, members: ["U023BECGF", member] });
  });

  it.each(pages)("$actionId treats an absent, null or empty next_cursor as the last page", async (page) => {
    for (const fields of [
      {},
      { response_metadata: {} },
      { response_metadata: { next_cursor: "" } },
      { response_metadata: { next_cursor: null } },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ ok: true, [page.list]: [], ...fields })),
      );
      await expect(page.execute(page.input, context)).resolves.toMatchObject({
        ok: true,
        output: { nextCursor: "" },
      });
    }
  });
});

describe("Slack conversation and user extra fields", () => {
  afterEach(() => vi.unstubAllGlobals());

  const context: ExecutionContext = { getCredential: async () => oauthCredential("user") };
  const bareChannel = { id: "C111", is_channel: true, is_private: false };
  const bareUser = { id: "U111", name: "alice", profile: { real_name: "Alice" } };

  it("keeps the extra conversation fields Slack sends and omits them otherwise", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ok: true,
          channels: [
            {
              ...bareChannel,
              created: 1700000000,
              updated: 1758844800000,
              creator: "U222",
              is_shared: true,
              is_ext_shared: false,
              is_org_shared: false,
              context_team_id: "T111",
              last_read: "1758844800.000100",
              unread_count: 3,
            },
            { ...bareChannel, id: "C222" },
          ],
        }),
      ),
    );
    const result = await slackExecutors["slack.list_conversations"]!({}, context);
    expect(result).toMatchObject({
      ok: true,
      output: {
        conversations: [
          {
            channelId: "C111",
            created: 1700000000,
            updated: 1758844800000,
            creatorId: "U222",
            isShared: true,
            isExtShared: false,
            isOrgShared: false,
            contextTeamId: "T111",
            lastRead: "1758844800.000100",
            unreadCount: 3,
          },
          { channelId: "C222" },
        ],
      },
    });
    const bare = (result as { output: { conversations: Record<string, unknown>[] } }).output.conversations[1]!;
    for (const key of ["created", "updated", "creatorId", "isShared", "contextTeamId", "lastRead", "unreadCount"]) {
      expect(bare).not.toHaveProperty(key);
    }
  });

  it("keeps the extra user fields Slack sends and omits them otherwise", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ok: true,
          members: [
            {
              ...bareUser,
              profile: { ...bareUser.profile, email: "alice@example.com" },
              tz: "Asia/Shanghai",
              tz_offset: 28800,
              updated: 1758844800,
              team_id: "T111",
              is_restricted: false,
              is_ultra_restricted: false,
              is_app_user: false,
            },
            { ...bareUser, id: "U222" },
          ],
        }),
      ),
    );
    const result = await slackExecutors["slack.list_users"]!({}, context);
    expect(result).toMatchObject({
      ok: true,
      output: {
        users: [
          {
            userId: "U111",
            email: "alice@example.com",
            tz: "Asia/Shanghai",
            tzOffset: 28800,
            updated: 1758844800,
            teamId: "T111",
            isRestricted: false,
            isUltraRestricted: false,
            isAppUser: false,
          },
          { userId: "U222", realName: "Alice" },
        ],
      },
    });
    const bare = (result as { output: { users: Record<string, unknown>[] } }).output.users[1]!;
    for (const key of [
      "email",
      "tz",
      "tzOffset",
      "updated",
      "teamId",
      "isRestricted",
      "isUltraRestricted",
      "isAppUser",
    ]) {
      expect(bare).not.toHaveProperty(key);
    }
  });
});
