import type { CredentialValidationResult } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { lovableActionHandlers, credentialValidators } from "./executors.ts";

describe("Lovable executors", () => {
  it("validates API key credentials successfully", async () => {
    const mockUserResponse = {
      user: {
        id: "usr_123",
        email: "user@example.com",
        name: "Test User",
      },
    };

    const fetcher = (async (url: any, init?: any): Promise<Response> => {
      expect(String(url)).toBe("https://mcp.lovable.dev/");
      expect(init?.method).toBe("POST");

      const headers = init?.headers as Record<string, string>;
      expect(headers["Lovable-API-Key"]).toBe("lov_key123");
      expect(headers["Mcp-Protocol-Version"]).toBe("2024-11-05");

      const body = JSON.parse(init?.body as string);
      expect(body.method).toBe("tools/call");
      expect(body.params.name).toBe("get_me");

      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(mockUserResponse),
            },
          ],
        },
      });
    }) as typeof fetch;

    const result = (await credentialValidators.apiKey!(
      { apiKey: "lov_key123", values: {} },
      { fetcher },
    )) as CredentialValidationResult;

    expect(result.profile?.accountId).toBe("usr_123");
    expect(result.profile?.displayName).toBe("Test User");
    expect(result.metadata?.user).toEqual(mockUserResponse);
  });

  it("validates OAuth2 credentials successfully", async () => {
    const mockUserResponse = {
      user: {
        id: "usr_oauth",
        email: "oauth@example.com",
        name: "OAuth User",
      },
    };

    const fetcher = (async (url: any, init?: any): Promise<Response> => {
      const headers = init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer oauth_token_123");

      const body = JSON.parse(init?.body as string);

      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(mockUserResponse),
            },
          ],
        },
      });
    }) as typeof fetch;

    const result = (await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "oauth_token_123",
        tokenType: "Bearer",
        profile: { accountId: "usr_oauth", displayName: "OAuth User", grantedScopes: [] },
        metadata: {},
      },
      { fetcher },
    )) as CredentialValidationResult;

    expect(result.profile?.accountId).toBe("usr_oauth");
    expect(result.profile?.displayName).toBe("OAuth User");
  });

  it("executes an action successfully", async () => {
    const mockWorkspaceResponse = {
      workspaces: [{ id: "ws_1", name: "Workspace 1" }],
    };

    const fetcher = (async (url: any, init?: any): Promise<Response> => {
      const body = JSON.parse(init?.body as string);
      expect(body.params.name).toBe("list_workspaces");
      expect(body.params.arguments).toEqual({ limit: 10 });

      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(mockWorkspaceResponse),
            },
          ],
        },
      });
    }) as typeof fetch;

    const result = await lovableActionHandlers.list_workspaces({ limit: 10 }, { accessToken: "lov_key123", fetcher });

    expect(result).toEqual(mockWorkspaceResponse);
  });

  it("handles errors from the MCP server correctly", async () => {
    const fetcher = (async (url: any, init?: any): Promise<Response> => {
      const body = JSON.parse(init?.body as string);
      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        error: {
          code: -32601,
          message: "Method not found",
        },
      });
    }) as typeof fetch;

    await expect(lovableActionHandlers.get_me({}, { accessToken: "lov_key123", fetcher })).rejects.toMatchObject({
      status: 400,
      message: "Method not found",
    });
  });

  it("handles tool execution errors correctly", async () => {
    const fetcher = (async (url: any, init?: any): Promise<Response> => {
      const body = JSON.parse(init?.body as string);
      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          isError: true,
          content: [
            {
              type: "text",
              text: "Workspace not found",
            },
          ],
        },
      });
    }) as typeof fetch;

    await expect(
      lovableActionHandlers.get_workspace({ workspace_id: "ws_invalid" }, { accessToken: "lov_key123", fetcher }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Workspace not found",
    });
  });
});
