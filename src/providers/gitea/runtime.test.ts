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
    return new Response(payload === null ? null : JSON.stringify(payload), {
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

describe("gitea repository management handlers", () => {
  it("creates a repository with settings", async () => {
    const fetcher = jsonFetch(201, { id: 1, name: "new-repo" });
    await giteaActionHandlers.create_repository(
      { name: "new-repo", private: true, autoInit: true, description: "d" },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/user/repos");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: "new-repo",
      private: true,
      auto_init: true,
      description: "d",
    });
  });

  it("updates a repository with unit toggles", async () => {
    const fetcher = jsonFetch(200, {});
    await giteaActionHandlers.update_repository(
      { owner: "org", repo: "repo", description: "new", hasActions: true, private: false },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toMatchObject({
      description: "new",
      has_actions: true,
      private: false,
    });
  });

  it("deletes a repository and reports ok", async () => {
    const fetcher = jsonFetch(204, null);
    const result = (await giteaActionHandlers.delete_repository(
      { owner: "org", repo: "repo" },
      createContext(fetcher),
    )) as { ok: boolean };

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo");
    expect(init.method).toBe("DELETE");
    expect(result.ok).toBe(true);
  });

  it("lists repository topics", async () => {
    const fetcher = jsonFetch(200, { topics: ["go", "ci"] });
    const result = (await giteaActionHandlers.list_repository_topics(
      { owner: "org", repo: "repo" },
      createContext(fetcher),
    )) as { topics: unknown[] };

    const { url } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/topics");
    expect(result.topics).toEqual(["go", "ci"]);
  });
});

describe("gitea branch handlers", () => {
  it("lists branches with pagination", async () => {
    const fetcher = jsonFetch(200, [{ name: "main" }, { name: "dev" }]);
    await giteaActionHandlers.list_branches({ owner: "org", repo: "repo", page: 1, limit: 20 }, createContext(fetcher));

    const { url } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/branches");
    expect(url).toContain("page=1");
    expect(url).toContain("limit=20");
  });

  it("creates a branch from a ref", async () => {
    const fetcher = jsonFetch(201, { name: "feat/x" });
    await giteaActionHandlers.create_branch(
      { owner: "org", repo: "repo", newBranchName: "feat/x", oldRefName: "main" },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/branches");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      new_branch_name: "feat/x",
      old_ref_name: "main",
    });
  });

  it("deletes a branch with an encoded branch name", async () => {
    const fetcher = jsonFetch(204, null);
    await giteaActionHandlers.delete_branch({ owner: "org", repo: "repo", branch: "feat/x" }, createContext(fetcher));

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/branches/feat/x");
    expect(init.method).toBe("DELETE");
  });
});

describe("gitea commit handlers", () => {
  it("creates a commit status", async () => {
    const fetcher = jsonFetch(201, { id: 1, state: "success" });
    await giteaActionHandlers.create_commit_status(
      { owner: "org", repo: "repo", sha: "abc123", state: "success", context: "ci/build" },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/statuses/abc123");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      state: "success",
      context: "ci/build",
    });
  });

  it("lists commit statuses for a ref", async () => {
    const fetcher = jsonFetch(200, [{ id: 1, state: "success" }]);
    await giteaActionHandlers.list_commit_statuses({ owner: "org", repo: "repo", ref: "main" }, createContext(fetcher));

    const { url } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/commits/main/statuses");
  });
});

describe("gitea tag and release handlers", () => {
  it("creates a tag", async () => {
    const fetcher = jsonFetch(201, { name: "v1.0.0" });
    await giteaActionHandlers.create_tag(
      { owner: "org", repo: "repo", tagName: "v1.0.0", target: "main", message: "release" },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/tags");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      tag_name: "v1.0.0",
      target: "main",
      message: "release",
    });
  });

  it("creates a release", async () => {
    const fetcher = jsonFetch(201, { id: 2, tag_name: "v1.0.0" });
    await giteaActionHandlers.create_release(
      { owner: "org", repo: "repo", tagName: "v1.0.0", name: "v1", body: "notes", draft: true },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/releases");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      tag_name: "v1.0.0",
      name: "v1",
      body: "notes",
      draft: true,
    });
  });

  it("deletes a release by id", async () => {
    const fetcher = jsonFetch(204, null);
    await giteaActionHandlers.delete_release({ owner: "org", repo: "repo", releaseId: 2 }, createContext(fetcher));

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/releases/2");
    expect(init.method).toBe("DELETE");
  });
});

describe("gitea label and milestone handlers", () => {
  it("creates a label", async () => {
    const fetcher = jsonFetch(201, { id: 3, name: "bug" });
    await giteaActionHandlers.create_label(
      { owner: "org", repo: "repo", name: "bug", color: "#d73a4a" },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/labels");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: "bug",
      color: "#d73a4a",
    });
  });

  it("creates a milestone with a due date", async () => {
    const fetcher = jsonFetch(201, { id: 4, title: "sprint-1" });
    await giteaActionHandlers.create_milestone(
      { owner: "org", repo: "repo", title: "sprint-1", dueOn: "2026-08-31T00:00:00Z" },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/milestones");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      title: "sprint-1",
      due_on: "2026-08-31T00:00:00Z",
    });
  });
});

describe("gitea issue label and comment handlers", () => {
  it("updates an issue state and assignees", async () => {
    const fetcher = jsonFetch(200, { id: 5, state: "closed" });
    await giteaActionHandlers.update_issue(
      { owner: "org", repo: "repo", issueNumber: 5, state: "closed", assignees: ["alice"] },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/issues/5");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toMatchObject({
      state: "closed",
      assignees: ["alice"],
    });
  });

  it("adds labels to an issue", async () => {
    const fetcher = jsonFetch(200, [{ id: 3, name: "bug" }]);
    await giteaActionHandlers.add_issue_labels(
      { owner: "org", repo: "repo", issueNumber: 5, labels: [3] },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/issues/5/labels");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ labels: [3] });
  });

  it("updates an issue comment by id", async () => {
    const fetcher = jsonFetch(200, { id: 9, body: "updated" });
    await giteaActionHandlers.update_issue_comment(
      { owner: "org", repo: "repo", commentId: 9, body: "updated" },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/issues/comments/9");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ body: "updated" });
  });
});

describe("gitea pull request extra handlers", () => {
  it("checks a merged pull request when the response is 204", async () => {
    const fetcher = jsonFetch(204, null);
    const result = (await giteaActionHandlers.check_pull_request_merged(
      { owner: "org", repo: "repo", pullRequestNumber: 3 },
      createContext(fetcher),
    )) as { merged: boolean };

    expect(result.merged).toBe(true);
  });

  it("checks an unmerged pull request when the response is 404", async () => {
    const fetcher = jsonFetch(404, { message: "not merged" });
    const result = (await giteaActionHandlers.check_pull_request_merged(
      { owner: "org", repo: "repo", pullRequestNumber: 3 },
      createContext(fetcher),
    )) as { merged: boolean };

    expect(result.merged).toBe(false);
  });

  it("requests reviewers for a pull request", async () => {
    const fetcher = jsonFetch(200, { id: 3 });
    await giteaActionHandlers.request_pull_request_reviewers(
      { owner: "org", repo: "repo", pullRequestNumber: 3, reviewers: ["alice"] },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/pulls/3/requested_reviewers");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ reviewers: ["alice"] });
  });

  it("dismisses a pull request review", async () => {
    const fetcher = jsonFetch(200, { id: 9, dismissed: true });
    await giteaActionHandlers.dismiss_pull_request_review(
      { owner: "org", repo: "repo", pullRequestNumber: 3, reviewId: 9, message: "noise", priors: true },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/pulls/3/reviews/9/dismissals");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      message: "noise",
      priors: true,
    });
  });
});

describe("gitea webhook, collaborator and organization handlers", () => {
  it("creates a repository webhook", async () => {
    const fetcher = jsonFetch(201, { id: 6, type: "gitea" });
    await giteaActionHandlers.create_repository_hook(
      {
        owner: "org",
        repo: "repo",
        type: "gitea",
        config: { url: "https://example.com/hook" },
        events: ["push"],
        active: true,
      },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/hooks");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      type: "gitea",
      config: { url: "https://example.com/hook" },
      events: ["push"],
      active: true,
    });
  });

  it("adds a collaborator with permission", async () => {
    const fetcher = jsonFetch(204, null);
    await giteaActionHandlers.add_collaborator(
      { owner: "org", repo: "repo", collaborator: "alice", permission: "write" },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/collaborators/alice");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ permission: "write" });
  });

  it("URL-encodes collaborator and organization single-segment identifiers", async () => {
    const collaboratorFetcher = jsonFetch(204, null);
    await giteaActionHandlers.add_collaborator(
      { owner: "org", repo: "repo", collaborator: "a/b c" },
      createContext(collaboratorFetcher),
    );
    expect(lastRequest(collaboratorFetcher).url).toContain("/repos/org/repo/collaborators/a%2Fb%20c");

    const orgFetcher = jsonFetch(200, { id: 1, name: "a/b c" });
    await giteaActionHandlers.get_organization({ org: "a/b c" }, createContext(orgFetcher));
    expect(lastRequest(orgFetcher).url).toContain("/orgs/a%2Fb%20c");
  });

  it("lists organizations of the authenticated user", async () => {
    const fetcher = jsonFetch(200, [{ id: 1, name: "org" }]);
    await giteaActionHandlers.list_my_organizations({ page: 1, limit: 10 }, createContext(fetcher));

    const { url } = lastRequest(fetcher);
    expect(url).toContain("/user/orgs");
    expect(url).toContain("page=1");
    expect(url).toContain("limit=10");
  });

  it("lists organization repositories", async () => {
    const fetcher = jsonFetch(200, [{ id: 1, name: "repo" }]);
    await giteaActionHandlers.list_organization_repositories({ org: "org" }, createContext(fetcher));

    const { url } = lastRequest(fetcher);
    expect(url).toContain("/orgs/org/repos");
  });
});

describe("gitea star and deploy key handlers", () => {
  it("stars a repository", async () => {
    const fetcher = jsonFetch(204, null);
    await giteaActionHandlers.star_repository({ owner: "org", repo: "repo" }, createContext(fetcher));

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/user/starred/org/repo");
    expect(init.method).toBe("PUT");
  });

  it("creates a deploy key", async () => {
    const fetcher = jsonFetch(201, { id: 8, title: "ci" });
    await giteaActionHandlers.create_repository_key(
      { owner: "org", repo: "repo", title: "ci", key: "ssh-rsa AAA...", readOnly: true },
      createContext(fetcher),
    );

    const { url, init } = lastRequest(fetcher);
    expect(url).toContain("/repos/org/repo/keys");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      title: "ci",
      key: "ssh-rsa AAA...",
      read_only: true,
    });
  });
});
