import { describe, expect, it } from "vitest";
import { credentialValidators, gitlabActionHandlers } from "./executors.ts";

function actionContext(fetcher: typeof fetch) {
  return {
    accessToken: "gitlab-token",
    tokenType: "Bearer",
    apiBaseUrl: "https://gitlab.com/api/v4",
    fetcher,
  };
}

describe("GitLab credentials", () => {
  it("validates OAuth credentials against their configured GitLab instance", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "gitlab-oauth-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {
          apiBaseUrl: "https://attacker.example.com/api/v4",
          scope: "api read_user",
          oauthClientExtra: { instanceUrl: "https://gitlab.example.com" },
        },
      },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://gitlab.example.com/api/v4/user");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer gitlab-oauth-token");
          return Response.json({ id: 7, username: "alice", name: "Alice" });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "gitlab:gitlab.example.com:7", displayName: "Alice" },
      grantedScopes: ["api", "read_user"],
      metadata: { apiBaseUrl: "https://gitlab.example.com/api/v4", username: "alice" },
    });
  });

  it("keeps personal access tokens compatible with Bearer authentication", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "gitlab-pat", values: {} },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://gitlab.com/api/v4/user");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer gitlab-pat");
          return Response.json({ id: 8, username: "bob", name: "Bob" });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "gitlab:8", displayName: "Bob" },
      grantedScopes: [],
    });
  });
});

describe("GitLab actions", () => {
  it("creates a project with documented project fields", async () => {
    const result = await gitlabActionHandlers.create_project(
      {
        name: "demo",
        namespaceId: 42,
        visibility: "private",
        initializeWithReadme: true,
      },
      actionContext(async (url, init) => {
        expect(url.toString()).toBe("https://gitlab.com/api/v4/projects");
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer gitlab-token");
        expect(JSON.parse(String(init?.body))).toEqual({
          name: "demo",
          namespace_id: 42,
          visibility: "private",
          initialize_with_readme: true,
        });
        return Response.json({ id: 1, name: "demo" });
      }),
    );

    expect(result).toEqual({ id: 1, name: "demo" });
  });

  it.each([
    { archived: true, endpoint: "archive" },
    { archived: false, endpoint: "unarchive" },
  ])("routes archived=$archived through the dedicated project endpoint", async ({ archived, endpoint }) => {
    const result = await gitlabActionHandlers.update_project(
      { projectId: "1", archived },
      actionContext(async (url, init) => {
        expect(url.toString()).toBe(`https://gitlab.com/api/v4/projects/1/${endpoint}`);
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeUndefined();
        return Response.json({ id: 1, archived });
      }),
    );

    expect(result).toEqual({ id: 1, archived });
  });

  it("rejects archived when combined with regular project updates", async () => {
    const noRequest = actionContext(async () => {
      throw new Error("no request expected");
    });

    await expect(
      Promise.resolve().then(() =>
        gitlabActionHandlers.update_project({ projectId: "1", archived: true, name: "renamed" }, noRequest),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("updates a project issue and maps API field names", async () => {
    const result = await gitlabActionHandlers.update_project_issue(
      {
        projectId: "group%2Fdemo",
        issueIid: 7,
        title: "Updated title",
        description: "",
        labels: "",
        stateEvent: "close",
        assigneeIds: [9],
      },
      actionContext(async (url, init) => {
        expect(url.toString()).toBe("https://gitlab.com/api/v4/projects/group%2Fdemo/issues/7");
        expect(init?.method).toBe("PUT");
        expect(JSON.parse(String(init?.body))).toEqual({
          title: "Updated title",
          description: "",
          labels: "",
          state_event: "close",
          assignee_ids: [9],
        });
        return Response.json({ iid: 7, title: "Updated title", state: "closed" });
      }),
    );

    expect(result).toMatchObject({ iid: 7, state: "closed" });
  });

  it("lists project merge requests with pagination and branch filters", async () => {
    const result = await gitlabActionHandlers.list_project_merge_requests(
      {
        projectId: "group%2Fdemo",
        state: "opened",
        sourceBranch: "feature",
        page: 2,
        perPage: 10,
      },
      actionContext(async (url) => {
        expect(url.toString()).toBe(
          "https://gitlab.com/api/v4/projects/group%2Fdemo/merge_requests?state=opened&source_branch=feature&page=2&per_page=10",
        );
        return new Response(JSON.stringify([{ iid: 3, title: "Add feature" }]), {
          headers: { "x-total": "12", "x-next-page": "3" },
        });
      }),
    );

    expect(result).toEqual({
      mergeRequests: [{ iid: 3, title: "Add feature" }],
      total: 12,
      nextPage: 3,
    });
  });

  it.each([
    { projectId: "%2e" },
    { projectId: "%2e%2e" },
    { projectId: "%2E%2E" },
    { projectId: ".%2e" },
    { projectId: "%2e." },
  ])("rejects encoded dot project ID $projectId before making a request", async ({ projectId }) => {
    const noRequest = actionContext(async () => {
      throw new Error("no request expected");
    });

    await expect(
      Promise.resolve().then(() => gitlabActionHandlers.list_project_merge_requests({ projectId }, noRequest)),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("merges a merge request", async () => {
    let mergeBody: unknown;
    const result = await gitlabActionHandlers.merge_merge_request(
      {
        projectId: "1",
        mergeRequestIid: 8,
        autoMerge: true,
        sha: "abc123",
        squash: true,
      },
      actionContext(async (url, init) => {
        expect(url.toString()).toBe("https://gitlab.com/api/v4/projects/1/merge_requests/8/merge");
        expect(init?.method).toBe("PUT");
        mergeBody = JSON.parse(String(init?.body));
        return Response.json({ iid: 8, state: "merged" });
      }),
    );
    expect(mergeBody).toEqual({ auto_merge: true, sha: "abc123", squash: true });
    expect(result).toEqual({ iid: 8, state: "merged" });
  });

  it("gets a single merge request with its optional detail flags", async () => {
    const result = await gitlabActionHandlers.get_merge_request(
      { projectId: "group%2Fdemo", mergeRequestIid: 4, includeDivergedCommitsCount: true },
      actionContext(async (url, init) => {
        expect(url.toString()).toBe(
          "https://gitlab.com/api/v4/projects/group%2Fdemo/merge_requests/4?include_diverged_commits_count=true",
        );
        expect(init?.method).toBe("GET");
        return Response.json({ iid: 4, diverged_commits_count: 2 });
      }),
    );
    expect(result).toEqual({ iid: 4, diverged_commits_count: 2 });
  });

  it("posts issue and merge request notes with the body unchanged", async () => {
    const requests: { url: string; body: unknown }[] = [];
    const context = actionContext(async (url, init) => {
      expect(init?.method).toBe("POST");
      requests.push({ url: url.toString(), body: JSON.parse(String(init?.body)) });
      return Response.json({ id: 99, body: "Looking into it", system: false, commands_changes: {} }, { status: 201 });
    });
    const body = "Looking into it\n\n```\nindented code\n```\n";

    await expect(
      gitlabActionHandlers.create_issue_note({ projectId: "1", issueIid: 7, body, internal: true }, context),
    ).resolves.toEqual({
      note: { id: 99, body: "Looking into it", system: false, commands_changes: {} },
      commandsChanges: {},
      commandSummary: [],
    });
    await gitlabActionHandlers.create_merge_request_note({ projectId: "1", mergeRequestIid: 8, body }, context);

    expect(requests).toEqual([
      { url: "https://gitlab.com/api/v4/projects/1/issues/7/notes", body: { body, internal: true } },
      { url: "https://gitlab.com/api/v4/projects/1/merge_requests/8/notes", body: { body } },
    ]);
  });

  it("reports a body of only quick actions as applied commands without a note", async () => {
    const result = await gitlabActionHandlers.create_issue_note(
      { projectId: "1", issueIid: 7, body: "/close" },
      actionContext(async () =>
        Response.json({ commands_changes: { state_event: "close" }, summary: ["Closed this issue."] }, { status: 202 }),
      ),
    );
    expect(result).toEqual({
      note: null,
      commandsChanges: { state_event: "close" },
      commandSummary: ["Closed this issue."],
    });
  });

  it("lists issue and merge request notes with filters and pagination", async () => {
    const urls: string[] = [];
    const context = actionContext(async (url) => {
      urls.push(url.toString());
      return new Response(JSON.stringify([{ id: 1, body: "First" }]), {
        headers: { "x-total": "3", "x-next-page": "2" },
      });
    });

    await expect(
      gitlabActionHandlers.list_issue_notes(
        { projectId: "1", issueIid: 7, activityFilter: "only_comments", sort: "asc", perPage: 1 },
        context,
      ),
    ).resolves.toEqual({ notes: [{ id: 1, body: "First" }], total: 3, nextPage: 2 });
    await gitlabActionHandlers.list_merge_request_notes(
      { projectId: "1", mergeRequestIid: 8, orderBy: "updated_at", page: 2 },
      context,
    );

    expect(urls).toEqual([
      "https://gitlab.com/api/v4/projects/1/issues/7/notes?activity_filter=only_comments&sort=asc&per_page=1",
      "https://gitlab.com/api/v4/projects/1/merge_requests/8/notes?order_by=updated_at&page=2",
    ]);
  });

  it("normalizes a no-content deletion", async () => {
    const deleted = await gitlabActionHandlers.delete_project_issue(
      { projectId: "1", issueIid: 9 },
      actionContext(async (url, init) => {
        expect(url.toString()).toBe("https://gitlab.com/api/v4/projects/1/issues/9");
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      }),
    );
    expect(deleted).toEqual({ deleted: true });
  });

  it("rejects invalid update payloads and identifiers before making a request", async () => {
    const noRequest = actionContext(async () => {
      throw new Error("no request expected");
    });

    await expect(
      Promise.resolve().then(() =>
        gitlabActionHandlers.update_project_issue({ projectId: "1", issueIid: 9 }, noRequest),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      Promise.resolve().then(() => gitlabActionHandlers.delete_project_issue({ projectId: "1" }, noRequest)),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      Promise.resolve().then(() => gitlabActionHandlers.merge_merge_request({ projectId: "1" }, noRequest)),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      Promise.resolve().then(() => gitlabActionHandlers.get_project({ projectId: "1/../../groups/2" }, noRequest)),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      Promise.resolve().then(() =>
        gitlabActionHandlers.create_issue_note({ projectId: "1", issueIid: 7, body: "  \n" }, noRequest),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
