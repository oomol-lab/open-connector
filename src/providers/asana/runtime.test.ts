import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { workspaceUserTeamActionHandlers } from "./runtime-workspaces-users-teams.ts";
import {
  deleteAsanaResource,
  getAsanaResource,
  listAsanaResources,
  requestAsana,
  writeAsanaResource,
} from "./runtime.ts";

interface RecordedRequest {
  url: URL;
  init: RequestInit;
}

interface RecordingContext extends ApiKeyProviderContext {
  requests: RecordedRequest[];
}

function recordingContext(...responses: Array<Response | Error>): RecordingContext {
  const requests: RecordedRequest[] = [];
  const fetcher: ProviderFetch = (async (input, init) => {
    requests.push({
      url: input instanceof URL ? input : new URL(input.toString()),
      init: init ?? {},
    });
    const result = responses.shift();
    if (result instanceof Error) {
      throw result;
    }
    if (!result) {
      throw new Error("unexpected Asana request");
    }
    return result;
  }) as ProviderFetch;

  return { apiKey: "asana-token", fetcher, requests };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface HandlerCase {
  name: string;
  input: Record<string, unknown>;
  method: string;
  path: string;
  response: Record<string, unknown>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  expectedOutput?: unknown;
}

const workspaceFields = "name,email_domains,is_organization";
const userFields = "name,email,photo,workspaces,workspaces.name";
const addedWorkspaceUserFields = "name,email,photo";
const teamFields = [
  "name",
  "description",
  "html_description",
  "organization",
  "organization.name",
  "permalink_url",
  "visibility",
  "edit_team_name_or_description_access_level",
  "edit_team_visibility_or_trash_team_access_level",
  "member_invite_management_access_level",
  "guest_invite_management_access_level",
  "join_request_management_access_level",
  "team_member_removal_access_level",
  "team_content_management_access_level",
  "endorsed",
].join(",");
const teamMembershipFields = "team,team.name,user,user.name,is_admin,is_guest,is_limited_access";
const event = {
  user: null,
  resource: {
    gid: "task-1",
    resource_type: "task",
    name: "Ship",
  },
  type: "task",
  action: "changed",
  parent: null,
  created_at: "2026-07-28T00:00:00.000Z",
  change: {
    field: "assignee",
    action: "changed",
    new_value: null,
    added_value: { gid: "u1", resource_type: "user" },
    removed_value: { gid: "u2", resource_type: "user" },
  },
};

const workspaceUserTeamHandlerCases: HandlerCase[] = [
  {
    name: "list_workspaces",
    input: { limit: 25, cursor: "workspace-cursor", includeFields: ["resource_type"] },
    method: "GET",
    path: "/workspaces",
    response: { data: [{ gid: "w1", name: "Engineering" }], next_page: { offset: "next-workspace" } },
    query: {
      limit: "25",
      offset: "workspace-cursor",
      opt_fields: `${workspaceFields},resource_type`,
    },
    expectedOutput: {
      workspaces: [{ gid: "w1", name: "Engineering" }],
      nextCursor: "next-workspace",
    },
  },
  {
    name: "get_workspace",
    input: { workspaceId: "w1", includeFields: ["resource_type"] },
    method: "GET",
    path: "/workspaces/w1",
    response: { data: { gid: "w1" } },
    query: { opt_fields: `${workspaceFields},resource_type` },
    expectedOutput: { workspace: { gid: "w1" } },
  },
  {
    name: "update_workspace",
    input: { workspaceId: "w1", name: "New" },
    method: "PUT",
    path: "/workspaces/w1",
    response: { data: { gid: "w1", name: "New" } },
    query: { opt_fields: workspaceFields },
    body: { name: "New" },
    expectedOutput: { workspace: { gid: "w1", name: "New" } },
  },
  {
    name: "add_workspace_user",
    input: { workspaceId: "w1", user: "me" },
    method: "POST",
    path: "/workspaces/w1/addUser",
    response: { data: { gid: "u1" } },
    query: { opt_fields: addedWorkspaceUserFields },
    body: { user: "me" },
  },
  {
    name: "remove_workspace_user",
    input: { workspaceId: "w1", user: "u1" },
    method: "POST",
    path: "/workspaces/w1/removeUser",
    response: { data: {} },
    body: { user: "u1" },
    expectedOutput: { success: true },
  },
  {
    name: "get_workspace_events",
    input: { workspaceId: "w1", sync: "token" },
    method: "GET",
    path: "/workspaces/w1/events",
    response: { data: [event], sync: "next-token", has_more: true },
    query: { sync: "token" },
  },
  {
    name: "list_users",
    input: {
      workspaceId: "w1",
      teamId: "t1",
      limit: 50,
      cursor: "user-cursor",
      includeFields: ["email"],
    },
    method: "GET",
    path: "/users",
    response: { data: [] },
    query: {
      workspace: "w1",
      team: "t1",
      limit: "50",
      offset: "user-cursor",
      opt_fields: userFields,
    },
  },
  {
    name: "get_user",
    input: { userId: "me", workspaceId: "w1" },
    method: "GET",
    path: "/users/me",
    response: { data: { gid: "u1" } },
    query: { workspace: "w1", opt_fields: userFields },
  },
  {
    name: "update_user",
    input: { userId: "u1", workspaceId: "w1", name: "New", customFields: { cf1: "alpha" } },
    method: "PUT",
    path: "/users/u1",
    response: { data: { gid: "u1", name: "New" } },
    query: { workspace: "w1", opt_fields: userFields },
    body: { name: "New", custom_fields: { cf1: "alpha" } },
  },
  {
    name: "list_user_favorites",
    input: {
      userId: "me",
      workspaceId: "w1",
      resourceType: "project",
      limit: 20,
      cursor: "favorite-cursor",
    },
    method: "GET",
    path: "/users/me/favorites",
    response: { data: [] },
    query: {
      workspace: "w1",
      resource_type: "project",
      limit: "20",
      offset: "favorite-cursor",
      opt_fields: "name",
    },
  },
  {
    name: "list_team_users",
    input: { teamId: "t1" },
    method: "GET",
    path: "/teams/t1/users",
    response: { data: [] },
    query: { opt_fields: userFields },
  },
  {
    name: "list_workspace_users",
    input: { workspaceId: "w1" },
    method: "GET",
    path: "/workspaces/w1/users",
    response: { data: [] },
    query: { opt_fields: userFields },
  },
  {
    name: "get_workspace_user",
    input: { workspaceId: "w1", userId: "u1" },
    method: "GET",
    path: "/workspaces/w1/users/u1",
    response: { data: { gid: "u1" } },
    query: { opt_fields: userFields },
  },
  {
    name: "update_workspace_user",
    input: {
      workspaceId: "w1",
      userId: "u1",
      name: "New",
      customFields: { cf2: "beta" },
    },
    method: "PUT",
    path: "/workspaces/w1/users/u1",
    response: { data: { gid: "u1", name: "New" } },
    query: { opt_fields: userFields },
    body: { name: "New", custom_fields: { cf2: "beta" } },
  },
  {
    name: "create_team",
    input: {
      organizationId: "w1",
      name: "Core",
      editTeamNameOrDescriptionAccessLevel: "all_team_members",
      editTeamVisibilityOrTrashTeamAccessLevel: "only_team_admins",
      memberInviteManagementAccessLevel: "all_team_members",
      guestInviteManagementAccessLevel: "only_team_admins",
      joinRequestManagementAccessLevel: "all_team_members",
      teamMemberRemovalAccessLevel: "only_team_admins",
      teamContentManagementAccessLevel: "no_restriction",
      endorsed: true,
    },
    method: "POST",
    path: "/teams",
    response: { data: { gid: "t1", name: "Core" } },
    query: { opt_fields: teamFields },
    body: {
      organization: "w1",
      name: "Core",
      edit_team_name_or_description_access_level: "all_team_members",
      edit_team_visibility_or_trash_team_access_level: "only_team_admins",
      member_invite_management_access_level: "all_team_members",
      guest_invite_management_access_level: "only_team_admins",
      join_request_management_access_level: "all_team_members",
      team_member_removal_access_level: "only_team_admins",
      team_content_management_access_level: "no_restriction",
      endorsed: true,
    },
  },
  {
    name: "get_team",
    input: { teamId: "t1" },
    method: "GET",
    path: "/teams/t1",
    response: { data: { gid: "t1" } },
    query: { opt_fields: teamFields },
  },
  {
    name: "update_team",
    input: {
      teamId: "t1",
      name: "Core",
      editTeamNameOrDescriptionAccessLevel: "only_team_admins",
      editTeamVisibilityOrTrashTeamAccessLevel: "all_team_members",
      memberInviteManagementAccessLevel: "only_team_admins",
      guestInviteManagementAccessLevel: "all_team_members",
      joinRequestManagementAccessLevel: "only_team_admins",
      teamMemberRemovalAccessLevel: "all_team_members",
      teamContentManagementAccessLevel: "only_team_admins",
      endorsed: false,
    },
    method: "PUT",
    path: "/teams/t1",
    response: { data: { gid: "t1", name: "Core" } },
    query: { opt_fields: teamFields },
    body: {
      name: "Core",
      edit_team_name_or_description_access_level: "only_team_admins",
      edit_team_visibility_or_trash_team_access_level: "all_team_members",
      member_invite_management_access_level: "only_team_admins",
      guest_invite_management_access_level: "all_team_members",
      join_request_management_access_level: "only_team_admins",
      team_member_removal_access_level: "all_team_members",
      team_content_management_access_level: "only_team_admins",
      endorsed: false,
    },
  },
  {
    name: "list_workspace_teams",
    input: { workspaceId: "w1" },
    method: "GET",
    path: "/workspaces/w1/teams",
    response: { data: [] },
    query: { opt_fields: teamFields },
  },
  {
    name: "list_user_teams",
    input: { userId: "u1", organizationId: "w1" },
    method: "GET",
    path: "/users/u1/teams",
    response: { data: [] },
    query: { organization: "w1", opt_fields: teamFields },
  },
  {
    name: "add_team_user",
    input: { teamId: "t1", user: "u1" },
    method: "POST",
    path: "/teams/t1/addUser",
    response: { data: { gid: "tm1" } },
    query: { opt_fields: teamMembershipFields },
    body: { user: "u1" },
  },
  {
    name: "remove_team_user",
    input: { teamId: "t1", user: "u1" },
    method: "POST",
    path: "/teams/t1/removeUser",
    response: { data: {} },
    body: { user: "u1" },
  },
];

describe("Asana runtime", () => {
  it.each(workspaceUserTeamHandlerCases)(
    "maps $name to the Asana method, path, query, and body",
    async ({ name, input, method, path, response, query, body, expectedOutput }) => {
      const context = recordingContext(jsonResponse(response));
      const handler = workspaceUserTeamActionHandlers[name];

      expect(handler).toBeTypeOf("function");
      const result = await handler!(input, context);
      if (expectedOutput !== undefined) {
        expect(result).toEqual(expectedOutput);
      }

      expect(context.requests).toHaveLength(1);
      const request = context.requests[0]!;
      expect(request.init.method).toBe(method);
      expect(request.url.pathname).toBe(`/api/1.0${path}`);
      expect(Object.fromEntries(request.url.searchParams.entries())).toEqual(query ?? {});
      if (body) {
        expect(JSON.parse(request.init.body as string)).toEqual({ data: body });
      } else {
        expect(request.init.body).toBeUndefined();
      }
    },
  );

  it("normalizes workspace events without offset pagination", async () => {
    const context = recordingContext(
      jsonResponse({
        data: [event],
        sync: "next-token",
        has_more: true,
      }),
    );

    await expect(
      workspaceUserTeamActionHandlers.get_workspace_events!({ workspaceId: "w1", sync: "token" }, context),
    ).resolves.toEqual({
      events: [event],
      sync: "next-token",
      has_more: true,
    });
  });

  it("normalizes the initial workspace event sync token returned with HTTP 412", async () => {
    const context = recordingContext(
      jsonResponse({ errors: [{ message: "Sync token required" }], sync: "initial-token" }, 412),
    );

    await expect(
      workspaceUserTeamActionHandlers.get_workspace_events!({ workspaceId: "w1" }, context),
    ).resolves.toEqual({
      events: [],
      sync: "initial-token",
      has_more: false,
    });
    expect(context.requests[0]?.url.searchParams.has("sync")).toBe(false);
  });

  it("normalizes a refreshed workspace event sync token returned with HTTP 412", async () => {
    const context = recordingContext(
      jsonResponse({ errors: [{ message: "Sync token expired" }], sync: "refreshed-token" }, 412),
    );

    await expect(
      workspaceUserTeamActionHandlers.get_workspace_events!({ workspaceId: "w1", sync: "expired-token" }, context),
    ).resolves.toEqual({
      events: [],
      sync: "refreshed-token",
      has_more: false,
    });
    expect(context.requests[0]?.url.searchParams.get("sync")).toBe("expired-token");
  });

  it("preserves workspace event HTTP 412 errors without a valid sync token", async () => {
    const payload = { errors: [{ message: "Sync token unavailable" }], sync: "" };
    const context = recordingContext(jsonResponse(payload, 412));

    await expect(
      workspaceUserTeamActionHandlers.get_workspace_events!({ workspaceId: "w1" }, context),
    ).rejects.toMatchObject({
      status: 412,
      message: "Sync token unavailable",
      details: payload,
    });
  });

  it.each([
    ["list_team_users", { teamId: "t1", limit: 50 }],
    ["list_workspace_users", { workspaceId: "w1", limit: 50 }],
  ])("does not send unsupported limit pagination for %s", async (name, input) => {
    const context = recordingContext(jsonResponse({ data: [] }));

    await workspaceUserTeamActionHandlers[name]!(input, context);

    expect(context.requests[0]?.url.searchParams.has("limit")).toBe(false);
  });

  it.each(["update_workspace", "update_user", "update_workspace_user", "update_team"])(
    "rejects an empty %s update",
    async (name) => {
      const context = recordingContext();
      const input =
        name === "update_workspace_user"
          ? { workspaceId: "w1", userId: "u1" }
          : name === "update_workspace"
            ? { workspaceId: "w1" }
            : name === "update_team"
              ? { teamId: "t1" }
              : { userId: "u1" };

      await expect(
        Promise.resolve().then(() => workspaceUserTeamActionHandlers[name]!(input, context)),
      ).rejects.toMatchObject({
        status: 400,
      });
      expect(context.requests).toHaveLength(0);
    },
  );

  it("creates tasks with the Asana JSON envelope", async () => {
    const context = recordingContext(jsonResponse({ data: { gid: "task-1", name: "Ship" } }, 201));

    await expect(writeAsanaResource("/tasks", { name: "Ship" }, "task", context, { method: "POST" })).resolves.toEqual({
      task: { gid: "task-1", name: "Ship" },
    });

    expect(context.requests).toHaveLength(1);
    expect(context.requests[0]?.url.toString()).toBe("https://app.asana.com/api/1.0/tasks");
    expect(context.requests[0]?.init.method).toBe("POST");
    const headers = new Headers(context.requests[0]?.init.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer asana-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(context.requests[0]?.init.body).toBe(JSON.stringify({ data: { name: "Ship" } }));
  });

  it("posts writes with opt_fields and the Asana JSON envelope", async () => {
    const context = recordingContext(jsonResponse({ data: { gid: "task-1", name: "Ship" } }, 201));

    await expect(
      writeAsanaResource("/tasks", { name: "Ship" }, "task", context, {
        method: "POST",
        query: { opt_fields: "name,notes" },
      }),
    ).resolves.toEqual({ task: { gid: "task-1", name: "Ship" } });

    expect(context.requests[0]?.url.searchParams.get("opt_fields")).toBe("name,notes");
    expect(context.requests[0]?.init.body).toBe(JSON.stringify({ data: { name: "Ship" } }));
  });

  it("lists resources with opt_fields and exposes Asana next_page offsets as cursors", async () => {
    const context = recordingContext(
      jsonResponse({ data: [{ gid: "task-1" }], next_page: { offset: "after-task-1" } }),
    );

    await expect(listAsanaResources("/tasks", { opt_fields: "name,notes" }, "tasks", context)).resolves.toEqual({
      tasks: [{ gid: "task-1" }],
      nextCursor: "after-task-1",
    });

    expect(context.requests[0]?.url.searchParams.get("opt_fields")).toBe("name,notes");
  });

  it("forwards BodyInit request bodies without applying the JSON envelope", async () => {
    const context = recordingContext(jsonResponse({ data: { gid: "task-1" } }));
    const form = new FormData();
    form.set("name", "Ship");

    await expect(
      requestAsana({ path: "/tasks", context, method: "POST", body: form, wrapData: false }),
    ).resolves.toEqual({ data: { gid: "task-1" } });

    expect(context.requests[0]?.init.body).toBe(form);
    const headers = new Headers(context.requests[0]?.init.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.has("content-type")).toBe(false);
  });

  it("returns success after a 204 deletion", async () => {
    const context = recordingContext(new Response(null, { status: 204 }));

    await expect(deleteAsanaResource("/tasks/task-1", context)).resolves.toEqual({ success: true });
    expect(context.requests[0]?.init.method).toBe("DELETE");
  });

  it("uses the first Asana error message", async () => {
    const context = recordingContext(
      jsonResponse({ errors: [{ message: "first error" }, { message: "second error" }] }, 400),
    );

    await expect(requestAsana({ path: "/tasks", context })).rejects.toMatchObject({
      status: 400,
      message: "first error",
    });
  });

  it("maps validation authentication failures to invalid input", async () => {
    const context = recordingContext(jsonResponse({ errors: [{ message: "invalid token" }] }, 401));

    await expect(requestAsana({ path: "/users/me", context, phase: "validate" })).rejects.toMatchObject({
      status: 400,
      message: "invalid token",
    });
  });

  it("maps missing requested resources to invalid input", async () => {
    const context = recordingContext(jsonResponse({ errors: [{ message: "task missing" }] }, 404));

    await expect(getAsanaResource("/tasks/task-1", {}, "task", context)).rejects.toMatchObject({
      status: 400,
      message: "task missing",
    });
  });

  it("preserves Asana rate limits", async () => {
    const context = recordingContext(jsonResponse({ errors: [{ message: "slow down" }] }, 429));

    await expect(requestAsana({ path: "/tasks", context })).rejects.toMatchObject({
      status: 429,
      message: "slow down",
    });
  });

  it("rejects non-JSON responses", async () => {
    const context = recordingContext(
      new Response("upstream outage", { status: 502, headers: { "content-type": "text/plain" } }),
    );

    await expect(requestAsana({ path: "/tasks", context })).rejects.toMatchObject({
      status: 502,
      message: "upstream outage",
    });
  });

  it("maps invalid JSON responses to a stable provider error", async () => {
    const context = recordingContext(
      new Response('{"data":', { status: 200, headers: { "content-type": "application/json" } }),
    );
    const request = requestAsana({ path: "/tasks", context });

    await expect(request).rejects.toBeInstanceOf(ProviderRequestError);
    await expect(request).rejects.toMatchObject({
      status: 502,
      message: "Asana response is not valid JSON",
    });
  });

  it("maps aborted requests to gateway timeouts", async () => {
    const context = recordingContext(new DOMException("cancelled", "AbortError"));

    await expect(requestAsana({ path: "/tasks", context })).rejects.toMatchObject({
      status: 504,
      message: "Asana request failed: cancelled",
    });
  });
});
