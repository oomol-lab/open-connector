import type { ExecutionContext } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { executors } from "./executors.ts";

afterEach(() => vi.unstubAllGlobals());

const context: ExecutionContext = {
  getCredential: async () => ({
    authType: "api_key",
    apiKey: "lin_api_test",
    values: { apiKey: "lin_api_test" },
    profile: { accountId: "me", displayName: "Test", grantedScopes: [] },
    metadata: {},
  }),
};

function stubIssuesResponse() {
  const fetcher = vi.fn(async () =>
    Response.json({
      data: {
        issues: {
          nodes: [{ id: "i1", identifier: "ENG-1", title: "One", updatedAt: "2026-09-25T10:00:00.000Z" }],
          pageInfo: { hasNextPage: false, endCursor: null, hasPreviousPage: false, startCursor: null },
        },
      },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function sentVariables(fetcher: ReturnType<typeof vi.fn>) {
  const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
  return JSON.parse(String(init.body)) as { query: string; variables: Record<string, unknown> };
}

describe("linear.list_linear_issues incremental inputs", () => {
  it("forwards updated_after, include_archived and order_by to the GraphQL variables", async () => {
    const fetcher = stubIssuesResponse();
    const result = await executors["linear.list_linear_issues"]!(
      { updated_after: "2026-09-01T00:00:00Z", include_archived: true, order_by: "updatedAt", project_id: "p1" },
      context,
    );
    expect(result).toMatchObject({ ok: true, output: { issues: [{ id: "i1", identifier: "ENG-1" }] } });
    const { query, variables } = sentVariables(fetcher);
    expect(query).toContain("includeArchived: $includeArchived");
    expect(query).toContain("orderBy: $orderBy");
    expect(variables).toEqual({
      filter: { project: { id: { eq: "p1" } }, updatedAt: { gte: "2026-09-01T00:00:00Z" } },
      includeArchived: true,
      orderBy: "updatedAt",
    });
  });

  it("keeps the old defaults when the new inputs are absent", async () => {
    const fetcher = stubIssuesResponse();
    await executors["linear.list_linear_issues"]!({}, context);
    expect(sentVariables(fetcher).variables).toEqual({ includeArchived: false });
  });
});
