import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialValidators, executors } from "./executors.ts";

const values = {
  website: "https://example.com/login",
  username: "alice@example.com",
  secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
};

const credential: ResolvedCredential = {
  authType: "custom_credential",
  values,
  profile: {
    accountId: "https://example.com#alice@example.com",
    displayName: "alice@example.com at example.com",
    grantedScopes: [],
  },
  metadata: {},
};

const context: ExecutionContext = {
  getCredential: async () => credential,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TOTP executors", () => {
  it("generates a code for the configured website account", async () => {
    vi.spyOn(Date, "now").mockReturnValue(59_000);

    const result = await executors["totp.generate_code"]!({}, context);

    expect(result).toEqual({
      ok: true,
      output: {
        code: "287082",
        expiresAt: "1970-01-01T00:01:00.000Z",
        remainingSeconds: 1,
        website: values.website,
        username: values.username,
      },
    });
    expect(JSON.stringify(result)).not.toContain(values.secret);
  });

  it("validates credentials and returns a non-secret account profile", async () => {
    const result = await credentialValidators.customCredential!({ values }, { fetcher: fetch });

    expect(result).toEqual({
      profile: {
        accountId: "https://example.com#alice@example.com",
        displayName: "alice@example.com at example.com",
      },
      grantedScopes: [],
      metadata: {
        websiteOrigin: "https://example.com",
        algorithm: "SHA-1",
        digits: 6,
        periodSeconds: 30,
      },
    });
    expect(JSON.stringify(result)).not.toContain(values.secret);
  });
});
