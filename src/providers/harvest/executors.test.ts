import type { ResolvedCredential } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { credentialValidators } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "harvest-access-token",
  tokenType: "Bearer",
  profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
  metadata: { scope: "all" },
};

describe("Harvest OAuth credential validation", () => {
  it("rejects credentials without an executable Harvest account", async () => {
    await expect(
      credentialValidators.oauth2!(credential, {
        fetcher: async () => Response.json({ user: { id: 42 }, accounts: [] }),
      }),
    ).rejects.toEqual(new ProviderRequestError(400, "harvest OAuth credential has no accessible Harvest account"));
  });

  it("selects the default Harvest account without a second API probe", async () => {
    const calls: string[] = [];
    const result = await credentialValidators.oauth2!(credential, {
      fetcher: async (input) => {
        calls.push(input.toString());
        return Response.json({
          user: { id: 42, first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
          accounts: [
            { id: 7, name: "Personal", product: "harvest", is_active: true },
            { id: 9, name: "Work", product: "harvest", is_default: true },
          ],
        });
      },
    });

    expect(calls).toEqual(["https://id.getharvest.com/api/v2/accounts"]);
    expect(result).toMatchObject({
      profile: { accountId: "42", displayName: "Ada Lovelace" },
      metadata: { accountId: "9", defaultAccountId: "9" },
    });
  });
});
