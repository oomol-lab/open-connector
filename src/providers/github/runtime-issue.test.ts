import { describe, expect, it } from "vitest";
import { provider } from "./definition.ts";
import { issueActionHandlers } from "./runtime-issue.ts";

function pageFetcher(items: unknown[]): typeof fetch {
  return async () =>
    new Response(JSON.stringify(items), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

describe("list_repository_issues pagination signal", () => {
  it("reports the raw page length before pull requests are filtered out", async () => {
    // A raw GitHub page of 3 items where one is a pull request. The
    // filtered `issues` array alone would read as a short page and stop
    // page-number pagination early; `pageInfo.fetched` preserves the raw
    // length so callers can keep paginating correctly.
    const result = (await issueActionHandlers.list_repository_issues(
      { owner: "acme", repo: "widgets", perPage: 3 },
      {
        accessToken: "token",
        fetcher: pageFetcher([
          { id: 1, number: 10, title: "real issue" },
          { id: 2, number: 11, title: "a pull request", pull_request: { url: "https://example.test" } },
          { id: 3, number: 12, title: "another issue" },
        ]),
      },
    )) as { issues: Array<{ id: number }>; pageInfo: { fetched: number } };

    expect(result.issues.map((issue) => issue.id)).toEqual([1, 3]);
    expect(result.pageInfo.fetched).toBe(3);
  });

  it("reports fetched on an all-pull-request page whose issues array is empty", async () => {
    const result = (await issueActionHandlers.list_repository_issues(
      { owner: "acme", repo: "widgets", perPage: 2 },
      {
        accessToken: "token",
        fetcher: pageFetcher([
          { id: 1, pull_request: {} },
          { id: 2, pull_request: {} },
        ]),
      },
    )) as { issues: unknown[]; pageInfo: { fetched: number } };

    expect(result.issues).toEqual([]);
    expect(result.pageInfo.fetched).toBe(2);
  });

  it("declares pageInfo.fetched in the action's output schema", () => {
    interface ObjectSchema {
      properties?: Record<string, ObjectSchema>;
      required?: string[];
      type?: string;
    }
    const action = provider.actions.find((entry) => entry.name === "list_repository_issues");
    const pageInfo = (action?.outputSchema as ObjectSchema | undefined)?.properties?.pageInfo;

    expect(pageInfo?.properties?.fetched?.type).toBe("integer");
    expect(pageInfo?.required).toContain("fetched");
  });
});
