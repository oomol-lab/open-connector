import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { executors as slackbotExecutors } from "../slackbot/executors.ts";
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
  ])("rejects the other authorization path for $actionId", async ({ rawTokenType, execute }) => {
    const context: ExecutionContext = {
      getCredential: async () => oauthCredential(rawTokenType),
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
  ])("allows the matching authorization path for $actionId", async ({ rawTokenType, execute }) => {
    const context: ExecutionContext = {
      getCredential: async () => oauthCredential(rawTokenType),
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
      metadata: {
        rawTokenType: "user",
        scope: "channels:read",
        authed_user: { scope: "chat:write,search:read" },
      },
      scopes: ["chat:write", "search:read"],
    },
    {
      tokenType: "bot",
      metadata: {
        rawTokenType: "bot",
        scope: "channels:read,chat:write",
        authed_user: { scope: "search:read" },
      },
      scopes: ["channels:read", "chat:write"],
    },
  ])("reads scopes from a $tokenType token response", async ({ tokenType, metadata, scopes }) => {
    const result = await credentialValidators.oauth2!(oauthCredential(tokenType, metadata), {
      fetcher: async (url, init) => {
        expect(url.toString()).toBe("https://slack.com/api/auth.test");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-token");
        return Response.json({ ok: true, team: "Example workspace", user_id: "U123" });
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

function oauthCredential(rawTokenType: string, metadata: Record<string, unknown> = {}): OAuthCredential {
  return {
    authType: "oauth2",
    accessToken: "access-token",
    tokenType: rawTokenType,
    profile: {
      accountId: "U123",
      displayName: "Example workspace",
      grantedScopes: [],
    },
    metadata: { ...metadata, rawTokenType },
  };
}
