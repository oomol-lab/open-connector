import { describe, expect, it } from "vitest";
import { cloudflareCurrentUserDisplayName, readCloudflareCurrentUser } from "./cloudflare-current-user.ts";
import { ProviderRequestError } from "./provider-runtime.ts";

describe("Cloudflare current-user parsing", () => {
  it("normalizes a Cloudflare user and display name", () => {
    const user = readCloudflareCurrentUser({
      id: "user-1",
      email: "ada@example.com",
      first_name: "Ada",
      last_name: "Lovelace",
      username: "ada",
    });

    expect(user).toEqual({
      userId: "user-1",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
    });
    expect(cloudflareCurrentUserDisplayName(user, "Cloudflare")).toBe("Ada Lovelace");
  });

  it("rejects a user response without an id", () => {
    expect(() => readCloudflareCurrentUser({ email: "ada@example.com" })).toThrow(
      new ProviderRequestError(502, "cloudflare user response is missing id"),
    );
  });
});
