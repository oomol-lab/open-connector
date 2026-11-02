import { describe, expect, it } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { microsoftTeamsBotActions } from "./actions.ts";
import { microsoftTeamsBotActionHandlers } from "./runtime.ts";

interface ConnectorRequest {
  method: string;
  url: string;
  body: unknown;
}

const card = {
  type: "AdaptiveCard",
  version: "1.5",
  body: [{ type: "TextBlock", text: "Approve the deploy?" }],
  actions: [{ type: "Action.Execute", title: "Approve", verb: "approve", data: { requestId: "7" } }],
};

// The token request and the Bot Connector request are answered locally; each test uses its own credential so the
// module's token cache never serves another test's token.
function teamsContext(appId: string, serviceUrl?: string) {
  const requests: ConnectorRequest[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith("https://login.microsoftonline.com/"))
      return Response.json({ access_token: "connector-token", expires_in: 3600 });
    requests.push({
      method: init?.method ?? "GET",
      url: target,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (target.endsWith("/conversations"))
      return Response.json({
        conversations: [
          { id: "19:team@thread.tacv2", name: null },
          { id: "19:releases@thread.tacv2", name: "Releases" },
        ],
      });
    return Response.json({ id: "1700000000999" });
  };
  return { requests, context: { appId, clientSecret: "secret", tenantId: "tenant-1", serviceUrl, fetcher } };
}

describe("Microsoft Teams Bot message cards", () => {
  it.each(["send_message", "reply_to_message", "update_message"])(
    "%s requires both card fields at the action validation boundary",
    (name) => {
      const action = microsoftTeamsBotActions.find((action) => action.name === name)!;
      const input =
        name === "send_message"
          ? { conversationId: "19:channel@thread.tacv2" }
          : { conversationId: "19:channel@thread.tacv2", activityId: "1700000000999" };
      const contentType = "application/vnd.microsoft.card.adaptive";
      for (const attachment of [{}, { content: card }, { contentType }]) {
        expect(
          validateActionInput(action, { ...input, attachments: [attachment] }).valid,
          JSON.stringify(attachment),
        ).toBe(false);
      }
      expect(validateActionInput(action, { ...input, attachments: [{ contentType, content: card }] }).valid).toBe(true);
    },
  );

  it.each([
    { name: "reply", handler: microsoftTeamsBotActionHandlers.reply_to_message, field: "replyToId" },
    { name: "update", handler: microsoftTeamsBotActionHandlers.update_message, field: "id" },
  ])("counts the activity ID in the $name message size before any request", async ({ name, handler, field }) => {
    const { requests, context } = teamsContext(`app-boundary-${name}`, "https://smba.trafficmanager.net/amer");
    const fetcher = context.fetcher;
    let fetchCalls = 0;
    context.fetcher = async (url, init) => {
      fetchCalls += 1;
      return fetcher(url, init);
    };
    const activityId = "1700000000999";
    const overhead = JSON.stringify({ type: "message", text: "", textFormat: "markdown", [field]: activityId }).length;
    const text = "x".repeat((100 * 1024) / 2 - overhead);
    const input = { conversationId: "19:channel@thread.tacv2", activityId, text };

    await expect(handler({ ...input, text: `${text}x` }, context)).rejects.toMatchObject({ status: 400 });
    expect(fetchCalls).toBe(0);
    await expect(handler(input, context)).resolves.toEqual({ id: "1700000000999" });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.body).toEqual({ type: "message", text, textFormat: "markdown", [field]: activityId });
    expect(JSON.stringify(requests[0]!.body).length * 2).toBe(100 * 1024);
  });

  it("sends and then replaces a message holding one Adaptive Card", async () => {
    const { requests, context } = teamsContext("app-cards", "https://smba.trafficmanager.net/amer");
    const attachment = { contentType: "application/vnd.microsoft.card.adaptive", content: card };

    await expect(
      microsoftTeamsBotActionHandlers.send_message(
        { conversationId: "19:channel@thread.tacv2", attachments: [attachment] },
        context,
      ),
    ).resolves.toEqual({ id: "1700000000999" });
    await microsoftTeamsBotActionHandlers.update_message(
      { conversationId: "19:channel@thread.tacv2", activityId: "1700000000999", text: "Approved by Ada" },
      context,
    );

    expect(requests).toEqual([
      {
        method: "POST",
        url: "https://smba.trafficmanager.net/amer/v3/conversations/19%3Achannel%40thread.tacv2/activities",
        body: { type: "message", attachments: [attachment] },
      },
      {
        method: "PUT",
        url: "https://smba.trafficmanager.net/amer/v3/conversations/19%3Achannel%40thread.tacv2/activities/1700000000999",
        // The replacement carries no attachments, so Teams removes the card with its buttons.
        body: { type: "message", text: "Approved by Ada", textFormat: "markdown", id: "1700000000999" },
      },
    ]);
  });

  it("refuses a message without content or above Teams' size limit before any request", async () => {
    const { requests, context } = teamsContext("app-limits", "https://smba.trafficmanager.net/amer");
    const oversized = {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: { ...card, body: [{ type: "TextBlock", text: "x".repeat(60_000) }] },
    };

    await expect(
      microsoftTeamsBotActionHandlers.send_message({ conversationId: "19:channel@thread.tacv2" }, context),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      microsoftTeamsBotActionHandlers.reply_to_message(
        { conversationId: "19:channel@thread.tacv2", activityId: "1", attachments: [oversized] },
        context,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(requests).toEqual([]);
  });
});

describe("Microsoft Teams Bot team channels", () => {
  it("lists a team's channels and names the General channel", async () => {
    const { requests, context } = teamsContext("app-channels", "https://smba.trafficmanager.net/amer");

    await expect(
      microsoftTeamsBotActionHandlers.list_team_channels({ teamId: "19:team@thread.tacv2" }, context),
    ).resolves.toEqual({
      channels: [
        { id: "19:team@thread.tacv2", name: "General" },
        { id: "19:releases@thread.tacv2", name: "Releases" },
      ],
    });
    await microsoftTeamsBotActionHandlers.list_team_channels(
      { teamId: "19:team@thread.tacv2", serviceUrl: "https://smba.trafficmanager.net/emea/" },
      context,
    );

    expect(requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      "GET https://smba.trafficmanager.net/amer/v3/teams/19%3Ateam%40thread.tacv2/conversations",
      "GET https://smba.trafficmanager.net/emea/v3/teams/19%3Ateam%40thread.tacv2/conversations",
    ]);
  });

  it("refuses a service URL outside the Bot Connector hosts", async () => {
    const { requests, context } = teamsContext("app-hosts");
    await expect(
      microsoftTeamsBotActionHandlers.list_team_channels(
        { teamId: "19:team@thread.tacv2", serviceUrl: "https://attacker.example/teams" },
        context,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(requests).toEqual([]);
  });
});
