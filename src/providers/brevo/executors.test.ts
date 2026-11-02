import { expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

it("preserves distinct string organization IDs during credential validation", async () => {
  const ids = ["5fa2b8c123456789abcdef01", "5fa2b8c123456789abcdef02"];
  const accounts = await Promise.all(
    ids.map(async (organization_id) => {
      const result = await credentialValidators.apiKey!(
        { apiKey: "test-key", values: {} },
        {
          fetcher: async (url, init) => {
            expect(String(url)).toBe("https://api.brevo.com/v3/account");
            expect(new Headers(init?.headers).get("api-key")).toBe("test-key");
            return Response.json({ organization_id, email: "owner@example.com" });
          },
        },
      );
      expect(result?.metadata?.organizationId).toBe(organization_id);
      expect(result?.profile?.displayName).toBe("owner@example.com");
      return result?.profile?.accountId;
    }),
  );
  expect(accounts).toEqual(ids.map((id) => `brevo:account:${id}`));
});

it.each([undefined, null, ""])(
  "accepts an account response without an organization ID (%s)",
  async (organization_id) => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "test-key", values: {} },
      { fetcher: async () => Response.json({ organization_id, email: "owner@example.com" }) },
    );
    expect(result?.profile).toEqual({ accountId: "brevo:api_key", displayName: "owner@example.com" });
    expect(result?.metadata?.organizationId).toBeUndefined();
  },
);
