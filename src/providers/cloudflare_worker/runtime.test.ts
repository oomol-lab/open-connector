import type { CloudflareWorkerContext } from "./runtime.ts";

import { describe, expect, it } from "vitest";
import { optionalRecord } from "../../core/cast.ts";
import { cloudflareWorkerActions } from "./actions.ts";
import { cloudflareWorkerActionHandlers } from "./runtime.ts";

const getWorkerScriptSettings = cloudflareWorkerActionHandlers.get_worker_script_settings;

describe("Cloudflare Worker account resolution", () => {
  it("reuses the account ID from a custom-credential connection", async () => {
    const { context, requestedUrls } = testContext({
      authType: "custom_credential",
      accountId: "custom-account",
    });

    await getWorkerScriptSettings({ scriptName: "example-worker" }, context);

    expect(requestedUrls).toEqual([
      "https://api.cloudflare.com/client/v4/accounts/custom-account/workers/scripts/example-worker/settings",
    ]);
  });

  it("reuses the account ID from single-account OAuth metadata", async () => {
    const { context, requestedUrls } = testContext({
      authType: "oauth2",
      metadata: { accountId: "oauth-account" },
    });

    await getWorkerScriptSettings({ scriptName: "example-worker" }, context);

    expect(requestedUrls).toEqual([
      "https://api.cloudflare.com/client/v4/accounts/oauth-account/workers/scripts/example-worker/settings",
    ]);
  });

  it("requires an explicit accessible account ID for multi-account OAuth", async () => {
    const { context, requestedUrls } = testContext({
      authType: "oauth2",
      metadata: {
        availableAccounts: [{ id: "first-account" }, { id: "second-account" }],
      },
    });

    await expect(getWorkerScriptSettings({ scriptName: "example-worker" }, context)).rejects.toMatchObject({
      status: 400,
      message:
        "accountId is required for this Cloudflare Worker action because the OAuth credential can access multiple accounts",
    });

    await getWorkerScriptSettings({ accountId: "second-account", scriptName: "example-worker" }, context);
    expect(requestedUrls).toEqual([
      "https://api.cloudflare.com/client/v4/accounts/second-account/workers/scripts/example-worker/settings",
    ]);
  });

  it("documents the conditional account ID requirement in the action catalog", () => {
    const action = cloudflareWorkerActions.find(({ name }) => name === "get_worker_script_settings");
    const properties = optionalRecord(action?.inputSchema.properties);
    const accountId = optionalRecord(properties?.accountId);

    expect(action?.inputSchema.required).toEqual(["scriptName"]);
    expect(accountId?.description).toContain("connection can uniquely determine the account");
    expect(accountId?.description).toContain("multi-account OAuth");
    expect(accountId?.description).toContain("list_accounts");
  });
});

function testContext(overrides: Pick<CloudflareWorkerContext, "authType"> & Partial<CloudflareWorkerContext>): {
  context: CloudflareWorkerContext;
  requestedUrls: string[];
} {
  const requestedUrls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    requestedUrls.push(String(input));
    return Response.json({ success: true, result: {} });
  };
  return {
    context: {
      accessToken: "test-token",
      metadata: {},
      fetcher,
      ...overrides,
    },
    requestedUrls,
  };
}
