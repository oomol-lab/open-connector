import type { FivetranContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { fivetranActionHandlers, validateFivetranCredential } from "./runtime.ts";

function context(fetcher: typeof fetch): FivetranContext {
  return {
    apiKey: "test-key",
    apiSecret: "test-secret",
    fetcher,
  };
}

describe("Fivetran runtime", () => {
  it("validates credentials with official Basic authentication and account info", async () => {
    const fetcher = vi.fn(
      async (): Promise<Response> =>
        Response.json({
          code: "Success",
          data: {
            account_id: "account-123",
            account_name: "Analytics Team",
            system_key_id: "system-key-123",
          },
        }),
    );

    await expect(
      validateFivetranCredential({ apiKey: "test-key", apiSecret: "test-secret" }, fetcher),
    ).resolves.toEqual({
      profile: {
        accountId: "account-123",
        displayName: "Analytics Team",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: "https://api.fivetran.com",
        validationEndpoint: "/v1/account/info",
      },
    });

    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.fivetran.com/v1/account/info");
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("test-key:test-secret").toString("base64")}`,
    );
  });

  it("maps Fivetran cursor pagination for transformation projects", async () => {
    const project = {
      id: "project-123",
      type: "DBT_CORE",
      group_id: "group-123",
    };
    const fetcher = vi.fn(
      async (): Promise<Response> =>
        Response.json({
          code: "Success",
          data: {
            items: [project],
            next_cursor: "next-page",
          },
        }),
    );

    await expect(
      fivetranActionHandlers.list_transformation_projects!({ cursor: "current-page", limit: 25 }, context(fetcher)),
    ).resolves.toEqual({
      projects: [project],
      nextCursor: "next-page",
    });

    const [url] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.fivetran.com/v1/transformation-projects?cursor=current-page&limit=25");
  });

  it("passes the documented group filter when listing hybrid deployment agents", async () => {
    const fetcher = vi.fn(
      async (): Promise<Response> =>
        Response.json({
          code: "Success",
          data: {
            items: [],
          },
        }),
    );

    await expect(
      fivetranActionHandlers.list_hybrid_deployment_agents!({ groupId: "group-123" }, context(fetcher)),
    ).resolves.toEqual({
      agents: [],
      nextCursor: null,
    });

    const [url] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.fivetran.com/v1/hybrid-deployment-agents?groupId=group-123");
  });

  it("preserves Fivetran API error messages", async () => {
    const fetcher = vi.fn(
      async (): Promise<Response> =>
        Response.json(
          {
            code: "Unauthorized",
            message: "Invalid authorization credentials",
          },
          { status: 401 },
        ),
    );

    await expect(fivetranActionHandlers.list_log_services!({}, context(fetcher))).rejects.toMatchObject({
      status: 401,
      message: "Invalid authorization credentials",
    });
  });
});
