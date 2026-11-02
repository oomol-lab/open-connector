import { describe, expect, it } from "vitest";
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
