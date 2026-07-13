import type { RailwayActionContext } from "./runtime.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { railwayActionHandlers, validateRailwayCredential } from "./runtime.ts";

describe("Railway runtime", () => {
  it("validates a workspace token with its workspace identity", async () => {
    let requestHeaders: Headers | undefined;
    let requestBody: Record<string, unknown> | undefined;
    const result = await validateRailwayCredential(
      "workspace-token",
      { workspaceId: "workspace_1" },
      async (_input, init) => {
        requestHeaders = new Headers(init?.headers);
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse({ data: { workspace: { id: "workspace_1", name: "Platform" } } });
      },
    );

    expect(requestHeaders?.get("authorization")).toBe("Bearer workspace-token");
    expect(requestBody?.variables).toEqual({ workspaceId: "workspace_1" });
    expect(result).toEqual({
      profile: { accountId: "workspace_1", displayName: "Platform" },
      grantedScopes: [],
      metadata: { tokenType: "workspace", workspaceId: "workspace_1" },
    });
  });

  it("lists projects and normalizes GraphQL connection edges", async () => {
    const context = createContext(async () =>
      jsonResponse({
        data: {
          projects: {
            edges: [
              { node: { id: "project_1", name: "API" } },
              { node: null },
              { node: { id: "project_2", name: "Worker" } },
            ],
          },
        },
      }),
    );

    await expect(railwayActionHandlers.list_projects({}, context)).resolves.toEqual({
      projects: [
        { id: "project_1", name: "API" },
        { id: "project_2", name: "Worker" },
      ],
    });
  });

  it("sends an optional commit SHA when deploying a service", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const context = createContext(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ data: { serviceInstanceDeployV2: "deployment_1" } });
    });

    await expect(
      railwayActionHandlers.deploy_service(
        { serviceId: "service_1", environmentId: "environment_1", commitSha: "abc123" },
        context,
      ),
    ).resolves.toEqual({ deploymentId: "deployment_1" });
    expect(requestBody?.variables).toEqual({
      serviceId: "service_1",
      environmentId: "environment_1",
      commitSha: "abc123",
    });
  });

  it("preserves empty variable values", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const context = createContext(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ data: { variableUpsert: true } });
    });

    await expect(
      railwayActionHandlers.upsert_variable(
        {
          projectId: "project_1",
          environmentId: "environment_1",
          name: "OPTIONAL_VALUE",
          value: "",
          skipDeploys: true,
        },
        context,
      ),
    ).resolves.toEqual({ updated: true });
    expect(requestBody?.variables).toEqual({
      input: {
        projectId: "project_1",
        environmentId: "environment_1",
        name: "OPTIONAL_VALUE",
        value: "",
        skipDeploys: true,
      },
    });
  });

  it("rejects a missing variable update result", async () => {
    const context = createContext(async () => jsonResponse({ data: {} }));

    await expect(
      railwayActionHandlers.upsert_variable(
        {
          projectId: "project_1",
          environmentId: "environment_1",
          name: "OPTIONAL_VALUE",
          value: "value",
        },
        context,
      ),
    ).rejects.toMatchObject({
      status: 502,
      message: "Railway variable update result was not returned",
    });
  });

  it("maps GraphQL errors returned with HTTP 200 to provider errors", async () => {
    const context = createContext(async () =>
      jsonResponse({ data: null, errors: [{ message: "Not Authorized", path: ["projects"] }] }),
    );

    const promise = railwayActionHandlers.list_projects({}, context);
    await expect(promise).rejects.toBeInstanceOf(ProviderRequestError);
    await expect(promise).rejects.toMatchObject({ status: 400, message: "Not Authorized" });
  });
});

function createContext(fetcher: typeof fetch): RailwayActionContext {
  return {
    apiKey: "account-token",
    fetcher,
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
