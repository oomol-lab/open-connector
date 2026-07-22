import type { ResolvedCredential } from "../../core/types.ts";
import type { CloudflareWorkerContext } from "./runtime.ts";

import { describe, expect, it } from "vitest";
import { optionalRecord } from "../../core/cast.ts";
import { cloudflareWorkerActions } from "./actions.ts";
import { credentialValidators } from "./executors.ts";
import { cloudflareWorkerActionHandlers } from "./runtime.ts";

const getWorkerScriptSettings = cloudflareWorkerActionHandlers.get_worker_script_settings;
const oauthCredential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "test-token",
  tokenType: "Bearer",
  profile: {
    accountId: "cloudflare-worker-oauth",
    displayName: "Cloudflare Worker",
    grantedScopes: ["workers-scripts.read"],
  },
  metadata: {},
};

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
      metadata: { requiresAccountSelection: true },
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

  it("allows an account ID discovered after the OAuth validation page", async () => {
    const validation = await credentialValidators.oauth2?.(oauthCredential, {
      fetcher: accountsFetcher(
        Array.from({ length: 50 }, (_, index) => ({ id: `account-${index + 1}` })),
        { page: 1, per_page: 50, count: 50, total_count: 51, total_pages: 2 },
      ),
    });
    const metadata = validation?.metadata ?? {};
    const { context, requestedUrls } = testContext({ authType: "oauth2", metadata });

    await getWorkerScriptSettings({ accountId: "page-two-account", scriptName: "example-worker" }, context);

    expect(metadata).toMatchObject({ requiresAccountSelection: true });
    expect(metadata).not.toHaveProperty("availableAccounts");
    expect(requestedUrls).toEqual([
      "https://api.cloudflare.com/client/v4/accounts/page-two-account/workers/scripts/example-worker/settings",
    ]);
  });

  it("rejects OAuth credentials that cannot access any accounts", async () => {
    await expect(
      credentialValidators.oauth2?.(oauthCredential, {
        fetcher: accountsFetcher([], { page: 1, per_page: 50, count: 0, total_count: 0, total_pages: 0 }),
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Cloudflare OAuth credential cannot access any accounts",
    });
  });

  it("requires account selection when the OAuth account total is unknown", async () => {
    const validation = await credentialValidators.oauth2?.(oauthCredential, {
      fetcher: accountsFetcher([{ id: "only-returned-account" }], {
        page: 1,
        per_page: 50,
        count: 1,
        total_pages: 1,
      }),
    });

    expect(validation?.metadata).toMatchObject({ requiresAccountSelection: true });
    expect(validation?.metadata).not.toHaveProperty("accountId");
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

function accountsFetcher(accounts: Array<{ id: string }>, resultInfo: Record<string, number>): typeof fetch {
  return async () => Response.json({ success: true, result: accounts, result_info: resultInfo });
}
