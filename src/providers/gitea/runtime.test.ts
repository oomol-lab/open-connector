import type { GiteaActionContext } from "./runtime.ts";

import { describe, expect, it, vi } from "vitest";
import { giteaActionHandlers } from "./runtime.ts";

const baseUrl = "https://gitea.example.com";
const apiKey = "test-token";

function createContext(fetcher: typeof fetch): GiteaActionContext {
  return { apiKey, baseUrl, fetcher };
}

function jsonFetch(status = 200, payload: unknown = {}): typeof fetch {
  return vi.fn(async () => {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function lastRequest(fetcher: typeof fetch): { url: string; init: RequestInit } {
  const mock = fetcher as ReturnType<typeof vi.fn>;
  const [input, init] = mock.mock.calls.at(-1) as [RequestInfo | URL, RequestInit | undefined];
  return { url: input instanceof Request ? input.url : input.toString(), init: init ?? {} };
}

describe("gitea pull request handlers", () => {
  it("lists pull requests with pagination and filters", async () => {
    const fetcher = jsonFetch(200, [{ number: 1, title: "feat" }]);
    await giteaActionHandlers.list_pull_requests(
      { owner: "org", repo: "repo", state: "open", page: 2, limit: 10 },
      createContext(fetcher),
    );

    const { url } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/pulls");
    expect(url).toContain("state=open");
    expect(url).toContain("page=2");
    expect(url).toContain("limit=10");
  });

  it("creates a pull request with head/base and reviewers", async () => {
    const fetcher = jsonFetch(201, { number: 7 });
    await giteaActionHandlers.create_pull_request(
      {
        owner: "org",
        repo: "repo",
        title: "Add feature",
        body: "Body",
        base: "main",
        head: "feat/x",
        reviewers: ["alice"],
      },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/pulls");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      title: "Add feature",
      base: "main",
      head: "feat/x",
      reviewers: ["alice"],
    });
  });

  it("merges a pull request with the merge style", async () => {
    const fetcher = jsonFetch(200, {});
    await giteaActionHandlers.merge_pull_request(
      { owner: "org", repo: "repo", pullRequestNumber: 3, do: "squash" },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/pulls/3/merge");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ Do: "squash" });
  });

  it("creates a pull request review and submits it", async () => {
    const fetcher = jsonFetch(200, { id: 9, state: "APPROVED" });
    await giteaActionHandlers.create_pull_request_review(
      { owner: "org", repo: "repo", pullRequestNumber: 3, event: "APPROVED", body: "LGTM" },
      createContext(fetcher),
    );

    let { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/pulls/3/reviews");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ event: "APPROVED", body: "LGTM" });

    await giteaActionHandlers.submit_pull_request_review(
      { owner: "org", repo: "repo", pullRequestNumber: 3, reviewId: 9, event: "APPROVED" },
      createContext(fetcher),
    );

    ({ url, init } = lastRequest(fetcher));
    expect(url).toContain("/repos/org/repo/pulls/3/reviews/9");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ event: "APPROVED" });
  });
});

describe("gitea file content handlers", () => {
  it("gets repository contents with a URL-encoded nested path", async () => {
    const fetcher = jsonFetch(200, { type: "file", content: "aGVsbG8=", encoding: "base64" });
    await giteaActionHandlers.get_repository_contents(
      { owner: "org", repo: "repo", filePath: "src/utils/helper.ts" },
      createContext(fetcher),
    );

    const { url } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/contents/src/utils/helper.ts");
  });

  it("creates a file with base64-encoded content", async () => {
    const fetcher = jsonFetch(201, { content: { path: "README.md" }, commit: { sha: "abc" } });
    await giteaActionHandlers.create_file(
      { owner: "org", repo: "repo", filePath: "README.md", content: "hello", message: "init" },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/contents/README.md");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      content: "aGVsbG8=",
      message: "init",
    });
  });

  it("updates a file with SHA and optional identity", async () => {
    const fetcher = jsonFetch(200, {});
    await giteaActionHandlers.update_file(
      {
        owner: "org",
        repo: "repo",
        filePath: "README.md",
        content: "updated",
        sha: "deadbeef",
        authorName: "Alice",
        authorEmail: "alice@example.com",
      },
      createContext(fetcher),
    );

    const { init } = lastRequest(fetcher);
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      content: "dXBkYXRlZA==",
      sha: "deadbeef",
      author: { name: "Alice", email: "alice@example.com" },
    });
  });

  it("deletes a file with the required SHA", async () => {
    const fetcher = jsonFetch(200, {});
    await giteaActionHandlers.delete_file(
      { owner: "org", repo: "repo", filePath: "old.txt", sha: "deadbeef", message: "remove" },
      createContext(fetcher),
    );

    const { init } = lastRequest(fetcher);
    expect(init.method).toBe("DELETE");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ sha: "deadbeef", message: "remove" });
  });
});
