import { describe, expect, it, vi } from "vitest";
import { microsoftGraphRequest } from "./microsoft-graph.ts";

describe("Microsoft Graph URL validation", () => {
  it("applies the pagination allowlist to root-relative URLs", async () => {
    const fetcher = vi.fn(async () => Response.json({}));

    await expect(
      microsoftGraphRequest("/v1.0/me/messages", {
        accessToken: "access-token",
        fetcher,
        label: "Microsoft Graph test",
        allowNextLink: (pathname) => pathname === "/v1.0/me/mailFolders",
      }),
    ).rejects.toThrow("nextLink does not target an allowed Microsoft Graph endpoint");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Microsoft Graph rate limit details", () => {
  it.each([429, 503])("preserves Retry-After on a %d", async (status) => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: { code: "TooManyRequests", message: "Too many requests." } },
        { status, headers: { "Retry-After": "73" } },
      ),
    );

    await expect(
      microsoftGraphRequest("me/messages", { accessToken: "access-token", fetcher, label: "Microsoft Graph test" }),
    ).rejects.toMatchObject({ status, message: "Too many requests.", details: { retryAfterSeconds: 73 } });
  });

  it("leaves the details empty when the 429 carries no Retry-After", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: { code: "TooManyRequests", message: "Too many requests." } }, { status: 429 }),
    );

    await expect(
      microsoftGraphRequest("me/messages", { accessToken: "access-token", fetcher, label: "Microsoft Graph test" }),
    ).rejects.toMatchObject({ status: 429, details: undefined });
  });
});
