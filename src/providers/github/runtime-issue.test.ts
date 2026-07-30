import type { JsonSchema } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { provider } from "./definition.ts";
import { issueActionHandlers } from "./runtime-issue.ts";

function pageFetcher(items: unknown[], onRequest?: (url: string) => void): typeof fetch {
  return async (url) => {
    onRequest?.(String(url));
    return new Response(JSON.stringify(items), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
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

  it("requests the documented default page size when perPage is omitted", async () => {
    let requestedUrl = "";
    await issueActionHandlers.list_repository_issues(
      { owner: "acme", repo: "widgets" },
      {
        accessToken: "token",
        fetcher: pageFetcher([], (url) => {
          requestedUrl = url;
        }),
      },
    );

    expect(new URL(requestedUrl).searchParams.get("per_page")).toBe("30");
  });

  it("declares the pagination contract in the action schemas", () => {
    const action = provider.actions.find((entry) => entry.name === "list_repository_issues");
    const inputProperties = action?.inputSchema.properties as Record<string, JsonSchema> | undefined;
    const outputProperties = action?.outputSchema.properties as Record<string, JsonSchema> | undefined;
    const perPage = inputProperties?.perPage;
    const pageInfo = outputProperties?.pageInfo;
    const pageInfoProperties = pageInfo?.properties as Record<string, JsonSchema> | undefined;

    expect(perPage).toMatchObject({ type: "integer", minimum: 1, maximum: 100, default: 30 });
    expect(pageInfoProperties?.fetched?.type).toBe("integer");
    expect(pageInfo?.required as string[] | undefined).toContain("fetched");
  });
});
