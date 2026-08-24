import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("Ringba credential validation", () => {
  it("accepts a valid token when Ringba has not provisioned an account yet", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "ringba-token", values: {} },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://api.ringba.com/v2/ringbaaccounts");
          expect(new Headers(init?.headers).get("authorization")).toBe("Token ringba-token");
          return Response.json({ account: [] });
        },
      },
    );

    expect(result).toEqual({
      profile: { accountId: "ringba", displayName: "Ringba API Token" },
      grantedScopes: [],
      metadata: {
        accountId: undefined,
        accessibleAccountIds: [],
      },
    });
  });

  it("treats a missing account field as an empty account list", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "ringba-token", values: {} },
      {
        fetcher: async () => Response.json({}),
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "ringba", displayName: "Ringba API Token" },
      metadata: { accessibleAccountIds: [] },
    });
  });

  it("treats a successful empty body as an empty account list", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "ringba-token", values: {} },
      {
        fetcher: async () => new Response(null, { status: 200 }),
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "ringba" },
      metadata: { accessibleAccountIds: [] },
    });
  });

  it("still records a requested account when the token can access it", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "ringba-token", values: { accountId: "RA-1" } },
      {
        fetcher: async () =>
          Response.json({
            account: [
              { accountId: "RA-1", name: "Primary" },
              { id: "RA-2", name: "Secondary" },
            ],
          }),
      },
    );

    expect(result).toEqual({
      profile: { accountId: "RA-1", displayName: "Primary" },
      grantedScopes: [],
      metadata: {
        accountId: "RA-1",
        accessibleAccountIds: ["RA-1", "RA-2"],
      },
    });
  });

  it("rejects a requested accountId that is not in the accessible list", async () => {
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "ringba-token", values: { accountId: "RA-missing" } },
        {
          fetcher: async () => Response.json({ account: [{ accountId: "RA-1", name: "Primary" }] }),
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "Ringba accountId is not accessible with the provided API token",
    });
  });
});
