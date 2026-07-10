import { describe, expect, it, vi } from "vitest";
import { oktaActionHandlers, normalizeOktaOrgUrl } from "./runtime.ts";

describe("Okta runtime", () => {
  it("normalizes Okta org URLs to a safe HTTPS origin", () => {
    expect(normalizeOktaOrgUrl("https://example.okta.com/admin/dashboard")).toBe("https://example.okta.com");
    expect(() => normalizeOktaOrgUrl("http://example.okta.com")).toThrow("orgUrl must use https");
    expect(() => normalizeOktaOrgUrl("https://token@example.okta.com")).toThrow("orgUrl must not include credentials");
    expect(() => normalizeOktaOrgUrl("https://localhost")).toThrow("orgUrl must not target local hosts");
  });

  it("lists users with SSWS authorization and normalized pagination", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        new Response(
          JSON.stringify([
            {
              id: "00u123",
              status: "ACTIVE",
              created: "2026-01-01T00:00:00.000Z",
              profile: {
                login: "user@example.com",
                email: "user@example.com",
              },
            },
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              link: '<https://example.okta.com/api/v1/users?after=cursor-2>; rel="next"',
            },
          },
        ),
    );

    const result = await oktaActionHandlers.list_users(
      {
        limit: 2,
        search: 'profile.email eq "user@example.com"',
      },
      {
        apiToken: "test-token",
        orgUrl: "https://example.okta.com",
        fetcher,
      },
    );

    expect(result).toEqual({
      users: [
        {
          id: "00u123",
          status: "ACTIVE",
          created: "2026-01-01T00:00:00.000Z",
          activated: null,
          statusChanged: null,
          lastLogin: null,
          lastUpdated: null,
          passwordChanged: null,
          profile: {
            login: "user@example.com",
            email: "user@example.com",
          },
          raw: {
            id: "00u123",
            status: "ACTIVE",
            created: "2026-01-01T00:00:00.000Z",
            profile: {
              login: "user@example.com",
              email: "user@example.com",
            },
          },
        },
      ],
      nextAfter: "cursor-2",
      raw: [
        {
          id: "00u123",
          status: "ACTIVE",
          created: "2026-01-01T00:00:00.000Z",
          profile: {
            login: "user@example.com",
            email: "user@example.com",
          },
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://example.okta.com/api/v1/users?limit=2&search=profile.email+eq+%22user%40example.com%22"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          accept: "application/json",
          authorization: "SSWS test-token",
          "content-type": "application/json",
          "user-agent": "oomol-connect/0.1",
        }),
      }),
    );
  });
});
