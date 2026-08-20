import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { executors } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "custom_credential" }> = {
  authType: "custom_credential",
  values: {
    accessKeyId: "AKIATEST",
    secretAccessKey: "secret",
  },
  profile: { accountId: "AKIATEST", displayName: "AWS STS", grantedScopes: [] },
  metadata: {},
};

const context: ExecutionContext = {
  getCredential: async () => credential,
};

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
  vi.unstubAllGlobals();
});

describe("AWS STS region resolver DNS", () => {
  it("rejects a region host that resolves to cloud metadata before any fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "169.254.169.254", family: 4 }]);

    const result = await executors["aws_sts.assume_role"]!(
      { roleArn: "arn:aws:iam::123456789012:role/demo", region: "ap-southeast-1" },
      context,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("must not resolve to private or reserved IP addresses") },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
