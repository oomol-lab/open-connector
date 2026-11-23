import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { wereadActions } from "./actions.ts";
import { credentialValidators, executors } from "./executors.ts";

const upgradeInfo = { message: "A new skill version is available. This request was processed normally." };

function contextWithKey(apiKey = "wrk-test-key"): ExecutionContext {
  const credential: ResolvedCredential = {
    authType: "api_key",
    apiKey,
    values: { apiKey },
    profile: { accountId: "api_key", displayName: "WeRead API Key", grantedScopes: [] },
    metadata: {},
  };
  return { getCredential: async () => credential };
}

function stubGateway(payload: Record<string, unknown>): void {
  const fetch = vi.fn(async () => Response.json(payload));
  vi.stubGlobal("fetch", fetch);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WeRead upgrade notices", () => {
  it("returns the business data when the response carries a non-blocking upgrade_info", async () => {
    stubGateway({ errcode: 0, books: [{ bookId: "123", title: "Book" }], albums: [], upgrade_info: upgradeInfo });
    const action = wereadActions.find((action) => action.name === "get_shelf")!;

    const result = await executeAction(action, executors["weread.get_shelf"], {}, contextWithKey());

    expect(result).toMatchObject({ ok: true, output: { books: [{ bookId: "123" }], upgrade_info: upgradeInfo } });
  });

  it("accepts an API key when the validation response carries upgrade_info", async () => {
    stubGateway({ errcode: 0, upgrade_info: upgradeInfo });

    const result = await credentialValidators.apiKey!(
      { apiKey: "wrk-test-key", values: { apiKey: "wrk-test-key" } },
      { fetcher: fetch },
    );

    expect(result).toMatchObject({ profile: { displayName: "WeRead API Key" } });
  });

  it("still fails when the gateway returns a nonzero errcode", async () => {
    stubGateway({ errcode: -2012, errmsg: "Invalid API key", upgrade_info: upgradeInfo });
    const action = wereadActions.find((action) => action.name === "get_shelf")!;

    const result = await executeAction(action, executors["weread.get_shelf"], {}, contextWithKey());

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "provider_error",
        message: "WeRead request failed (errcode -2012): Invalid API key",
        details: { status: 502 },
      },
    });
  });
});
