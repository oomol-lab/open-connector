import type { ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { credentialValidators, miroActionHandlers } from "./executors.ts";

const actionContext = {
  accessToken: "miro-access-token",
  tokenType: "Bearer",
};

describe("Miro OAuth credentials", () => {
  it("validates the token through its access-token context", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "miro-access-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {},
      },
      {
        fetcher: async (input, init) => {
          expect(input.toString()).toBe("https://api.miro.com/v1/oauth-token");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer miro-access-token");
          return Response.json({
            id: "token-123",
            scopes: ["boards:read", "boards:write"],
            user: { id: "user-123", name: "Alice", type: "user" },
            team: { id: "team-123", name: "Product", type: "team" },
            createdAt: "2026-08-13T12:00:00Z",
          });
        },
      },
    );

    expect(result).toMatchObject({
      profile: {
        accountId: "user-123",
        displayName: "Alice (Product)",
        grantedScopes: ["boards:read", "boards:write"],
      },
      grantedScopes: ["boards:read", "boards:write"],
      metadata: {
        apiBaseUrl: "https://api.miro.com",
        validationEndpoint: "/v1/oauth-token",
        tokenId: "token-123",
        currentUser: { id: "user-123", name: "Alice" },
        team: { id: "team-123", name: "Product" },
      },
    });
  });
});

describe("Miro board actions", () => {
  it("maps board filters and offset pagination to the v2 API", async () => {
    const fetcher: ProviderFetch = async (input, init) => {
      const url = new URL(input.toString());
      expect(url.pathname).toBe("/v2/boards");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        team_id: "team-123",
        query: "roadmap",
        limit: "5",
        offset: "10",
        sort: "last_modified",
      });
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer miro-access-token");
      return Response.json({
        size: 1,
        limit: 5,
        offset: 10,
        data: [{ id: "board-123", name: "Roadmap", type: "board" }],
      });
    };

    await expect(
      miroActionHandlers.list_boards(
        { teamId: "team-123", query: "roadmap", limit: 5, offset: 10, sort: "last_modified" },
        { ...actionContext, fetcher },
      ),
    ).resolves.toEqual({
      boards: [{ id: "board-123", name: "Roadmap", type: "board" }],
      pagination: { limit: 5, offset: 10, size: 1 },
    });
  });
});

describe("Miro item actions", () => {
  it("creates a sticky note with provider-native nested fields", async () => {
    const fetcher: ProviderFetch = async (input, init) => {
      expect(new URL(input.toString()).pathname).toBe("/v2/boards/board-123/sticky_notes");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        data: { content: "Ship it", shape: "square" },
        style: { fillColor: "light_yellow" },
        position: { x: 10, y: 20 },
        geometry: { width: 240 },
      });
      return Response.json({ id: "item-123", type: "sticky_note", data: { content: "Ship it" } });
    };

    await expect(
      miroActionHandlers.create_sticky_note(
        {
          boardId: "board-123",
          data: { content: "Ship it", shape: "square" },
          style: { fillColor: "light_yellow" },
          position: { x: 10, y: 20 },
          geometry: { width: 240 },
        },
        { ...actionContext, fetcher },
      ),
    ).resolves.toEqual({
      item: { id: "item-123", type: "sticky_note", data: { content: "Ship it" } },
    });
  });

  it("rejects conflicting sticky-note dimensions before making a request", async () => {
    const fetcher: ProviderFetch = async () => {
      throw new Error("fetch should not run");
    };
    await expect(
      miroActionHandlers.create_sticky_note(
        {
          boardId: "board-123",
          data: { content: "Ship it" },
          geometry: { width: 240, height: 120 },
        },
        { ...actionContext, fetcher },
      ),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("either width or height") });
  });
});
