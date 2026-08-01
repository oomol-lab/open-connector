import type { GitHubActionContext } from "./runtime-shared.ts";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FakeUnauthorizedError extends Error {}
  class FakeStreamableHTTPError extends Error {
    code?: number;
    constructor(message: string, code?: number) {
      super(message);
      this.code = code;
    }
  }
  class FakeMcpError extends Error {}
  return {
    connect: vi.fn(async () => undefined),
    callTool: vi.fn(async () => ({ isError: false, content: [] }) as { isError: boolean; content: unknown[] }),
    close: vi.fn(async () => undefined),
    transportCtor: vi.fn(),
    FakeUnauthorizedError,
    FakeStreamableHTTPError,
    FakeMcpError,
  };
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    connect = mocks.connect;
    callTool = mocks.callTool;
    close = mocks.close;
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class {
    constructor(url: URL, options: unknown) {
      mocks.transportCtor(url, options);
    }
  },
  StreamableHTTPError: mocks.FakeStreamableHTTPError,
}));

vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({
  UnauthorizedError: mocks.FakeUnauthorizedError,
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  McpError: mocks.FakeMcpError,
}));

import { projectActionHandlers } from "./runtime-project.ts";

const accessToken = "gho_test_token";
const fetcher = vi.fn() as unknown as typeof fetch;

function context(): GitHubActionContext {
  return { accessToken, fetcher };
}

beforeEach(() => {
  mocks.connect.mockReset().mockResolvedValue(undefined);
  mocks.callTool.mockReset().mockResolvedValue({ isError: false, content: [] });
  mocks.close.mockReset().mockResolvedValue(undefined);
  mocks.transportCtor.mockClear();
});

describe("GitHub Projects runtime", () => {
  it("connects to the hosted github-mcp-server with the projects toolset header and bearer token", async () => {
    await projectActionHandlers.list_projects({ owner: "octocat" }, context());

    expect(mocks.transportCtor).toHaveBeenCalledTimes(1);
    const [url, options] = mocks.transportCtor.mock.calls[0] as [URL, { requestInit: { headers: Headers } }];
    expect(String(url)).toBe("https://api.githubcopilot.com/mcp/");
    expect(options.requestInit.headers.get("authorization")).toBe(`Bearer ${accessToken}`);
    expect(options.requestInit.headers.get("x-mcp-toolsets")).toBe("projects");
  });

  it("list_projects calls projects_list with method + owner, dropping undefined fields", async () => {
    await projectActionHandlers.list_projects({ owner: "octocat", query: "roadmap is:open" }, context());

    expect(mocks.callTool).toHaveBeenCalledWith({
      name: "projects_list",
      arguments: { method: "list_projects", owner: "octocat", query: "roadmap is:open" },
    });
  });

  it("list_project_items translates fieldNames/fields and projectNumber to the tool's snake_case names", async () => {
    await projectActionHandlers.list_project_items(
      { owner: "octocat", projectNumber: 5, fieldNames: ["Status"] },
      context(),
    );

    expect(mocks.callTool).toHaveBeenCalledWith({
      name: "projects_list",
      arguments: {
        method: "list_project_items",
        owner: "octocat",
        project_number: 5,
        field_names: ["Status"],
      },
    });
  });

  it("get_project_field calls projects_get with method + field_id", async () => {
    await projectActionHandlers.get_project_field({ owner: "octocat", projectNumber: 5, fieldId: 102589 }, context());

    expect(mocks.callTool).toHaveBeenCalledWith({
      name: "projects_get",
      arguments: {
        method: "get_project_field",
        owner: "octocat",
        project_number: 5,
        field_id: 102589,
      },
    });
  });

  it("get_project_item calls projects_get with method + item_id and field selection", async () => {
    await projectActionHandlers.get_project_item(
      { owner: "octocat", projectNumber: 5, itemId: 42, fields: ["102589"] },
      context(),
    );

    expect(mocks.callTool).toHaveBeenCalledWith({
      name: "projects_get",
      arguments: {
        method: "get_project_item",
        owner: "octocat",
        project_number: 5,
        item_id: 42,
        fields: ["102589"],
      },
    });
  });

  it("get_project_status_update calls projects_get with method + status_update_id", async () => {
    await projectActionHandlers.get_project_status_update(
      { owner: "octocat", projectNumber: 5, statusUpdateId: "SU_abc123" },
      context(),
    );

    expect(mocks.callTool).toHaveBeenCalledWith({
      name: "projects_get",
      arguments: {
        method: "get_project_status_update",
        owner: "octocat",
        project_number: 5,
        status_update_id: "SU_abc123",
      },
    });
  });

  it("throws a 502 ProviderRequestError when the tool result reports isError", async () => {
    mocks.callTool.mockResolvedValueOnce({
      isError: true,
      content: [{ type: "text", text: "Project not found" }],
    });

    await expect(
      projectActionHandlers.get_project({ owner: "octocat", projectNumber: 999 }, context()),
    ).rejects.toMatchObject({ status: 502, message: "Project not found" });
  });

  it("maps an UnauthorizedError to a 401 naming the missing scope", async () => {
    mocks.connect.mockRejectedValueOnce(new mocks.FakeUnauthorizedError("nope"));

    await expect(projectActionHandlers.list_projects({ owner: "octocat" }, context())).rejects.toMatchObject({
      status: 401,
    });
  });

  it("maps a StreamableHTTPError with a 4xx code to a 400", async () => {
    mocks.connect.mockRejectedValueOnce(new mocks.FakeStreamableHTTPError("bad request", 422));

    await expect(projectActionHandlers.list_projects({ owner: "octocat" }, context())).rejects.toMatchObject({
      status: 400,
    });
  });

  it("maps a StreamableHTTPError with a 401/403 code to a 401", async () => {
    mocks.connect.mockRejectedValueOnce(new mocks.FakeStreamableHTTPError("forbidden", 403));

    await expect(projectActionHandlers.list_projects({ owner: "octocat" }, context())).rejects.toMatchObject({
      status: 401,
    });
  });

  it("closes the MCP client even when the call fails", async () => {
    mocks.connect.mockRejectedValueOnce(new Error("boom"));

    await expect(projectActionHandlers.list_projects({ owner: "octocat" }, context())).rejects.toThrow();
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});
