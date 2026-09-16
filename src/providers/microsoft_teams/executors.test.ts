import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { provider } from "./definition.ts";
import { executors } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "teams-token",
  tokenType: "Bearer",
  profile: { accountId: "teams-user", displayName: "Teams User", grantedScopes: [] },
  metadata: {},
};

beforeEach(() => setDefaultGuardedFetchDnsLookup(null));

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.unstubAllGlobals();
});

describe("Microsoft Teams execution", () => {
  it("expands channel replies and preserves their continuation URL", async () => {
    let request: Request | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return Response.json({
        value: [
          {
            id: "message-1",
            replies: [{ id: "reply-1" }],
            "replies@odata.nextLink":
              "https://graph.microsoft.com/v1.0/teams/team-1/channels/channel-1/messages/message-1/replies?$skiptoken=x",
          },
        ],
      });
    });

    const result = await execute("list_channel_messages", {
      teamId: "team-1",
      channelId: "channel-1",
      includeReplies: true,
      top: 20,
    });

    expect(request && new URL(request.url).searchParams.get("$expand")).toBe("replies");
    expect(result).toMatchObject({
      ok: true,
      output: {
        messages: [{ id: "message-1", replies: [{ id: "reply-1" }], repliesNextLink: expect.any(String) }],
        nextLink: null,
      },
    });
  });

  it("sends structured chat messages to an existing chat", async () => {
    let request: Request | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return Response.json({ id: "sent-1", body: { contentType: "html", content: "Hello" } }, { status: 201 });
    });

    const result = await execute("send_chat_message", {
      chatId: "chat/1",
      body: { contentType: "html", content: "Hello" },
      mentions: [{ id: 0, mentionText: "Person", mentioned: { user: { id: "user-1" } } }],
    });

    expect(request?.url).toContain("/v1.0/chats/chat%2F1/messages");
    expect(await request?.json()).toMatchObject({ body: { contentType: "html", content: "Hello" } });
    expect(result).toMatchObject({ ok: true, output: { id: "sent-1" } });
  });
});

async function execute(actionName: string, input: Record<string, unknown>) {
  const context: ExecutionContext = {
    async getCredential(service) {
      expect(service).toBe("microsoft_teams");
      return credential;
    },
  };
  return executeAction(
    provider.actions.find((action) => action.name === actionName)!,
    executors[`microsoft_teams.${actionName}`],
    input,
    context,
  );
}
