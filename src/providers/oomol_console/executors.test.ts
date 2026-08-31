import { describe, expect, it, vi } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("OOMOL Console credentials", () => {
  it("validates the user-provided API key as a Bearer token", async () => {
    const fetcher = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://relation-control.oomol.com/v1/me/teams");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer user-api-key");
      return Response.json({ teams: [] });
    });

    const result = await credentialValidators.apiKey!(
      { apiKey: "user-api-key", values: { teamId: "team-1" } },
      { fetcher: fetcher as typeof fetch },
    );

    expect(result?.metadata).toEqual({
      accessibleTeamCount: 0,
      defaultTeamId: "team-1",
    });
  });
});
