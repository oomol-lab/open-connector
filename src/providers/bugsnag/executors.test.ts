import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("Bugsnag credential validation", () => {
  it("accepts a valid user identity when the organization list is empty", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "bugsnag-token", values: {} },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://api.bugsnag.com/user");
          expect(new Headers(init?.headers).get("authorization")).toBe("token bugsnag-token");
          return Response.json({
            id: "user-42",
            name: "Ada Lovelace",
            email: "ada@example.com",
          });
        },
      },
    );

    expect(result).toEqual({
      profile: { accountId: "user-42", displayName: "Ada Lovelace" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: "https://api.bugsnag.com",
        validationEndpoint: "/user",
        userId: "user-42",
        email: "ada@example.com",
        name: "Ada Lovelace",
      },
    });
  });

  it("uses the user email as the display name when the name is missing", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "bugsnag-token", values: {} },
      {
        fetcher: async () =>
          Response.json({
            id: "user-42",
            email: "ada@example.com",
          }),
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "user-42", displayName: "ada@example.com" },
      metadata: { validationEndpoint: "/user", userId: "user-42", email: "ada@example.com" },
    });
  });

  it("rejects a current-user response that is missing an id", async () => {
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "bugsnag-token", values: {} },
        {
          fetcher: async () => Response.json({ email: "ada@example.com" }),
        },
      ),
    ).rejects.toMatchObject({ status: 502, message: "bugsnag user id is required." });
  });
});
