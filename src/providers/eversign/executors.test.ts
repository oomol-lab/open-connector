import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("Xodo Sign credential validation", () => {
  it.each([
    ["an empty business list", Response.json([])],
    ["an empty response body", new Response(null, { status: 200 })],
    [
      "the documented no-businesses response",
      Response.json({ success: false, error: { type: "no_businesses_found_for_user" } }),
    ],
  ])("accepts a valid API key with %s", async (_description, response) => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "eversign-key", values: {} },
      { fetcher: async () => response },
    );

    expect(result).toEqual({
      profile: { accountId: "eversign", displayName: "Xodo Sign API Key" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: "https://api.eversign.com",
        validationEndpoint: "/business",
        primaryBusinessId: undefined,
        primaryBusinessName: undefined,
        businessCount: 0,
      },
    });
  });

  it("keeps rejecting invalid API keys", async () => {
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "invalid-key", values: {} },
        {
          fetcher: async () =>
            Response.json(
              { success: false, error: { type: "invalid_access_key", message: "Invalid access key" } },
              { status: 200 },
            ),
        },
      ),
    ).rejects.toMatchObject({ status: 400, message: "Invalid access key" });
  });
});
