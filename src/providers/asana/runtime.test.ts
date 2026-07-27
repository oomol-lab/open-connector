import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { asanaProjectSectionActions } from "./actions-projects.ts";
import { projectSectionActionHandlers } from "./runtime-projects-sections.ts";
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
const projectFields = [
  "name",
  "archived",
  "color",
  "icon",
  "notes",
  "html_notes",
  "due_on",
  "start_on",
  "default_view",
  "privacy_setting",
  "default_access_level",
  "minimum_access_level_for_customization",
  "minimum_access_level_for_sharing",
  "created_at",
  "modified_at",
  "owner",
  "owner.name",
  "workspace",
  "workspace.name",
  "team",
  "team.name",
  "members",
  "members.name",
  "followers",
  "followers.name",
  "permalink_url",
].join(",");
const jobFields = "resource_subtype,status,new_project,new_project.name";
const customFieldSettingFields = "custom_field,custom_field.name,is_important,parent,parent.name,project,project.name";
const taskCountFields =
  "num_tasks,num_incomplete_tasks,num_completed_tasks,num_milestones,num_incomplete_milestones,num_completed_milestones";
const sectionFields = "name,created_at,project,project.name";
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

const projectSectionHandlerCases: HandlerCase[] = [
  {
    name: "list_projects",
    input: {
      teamId: "team / 1",
      archived: false,
      limit: 25,
      cursor: "project-cursor",
      includeFields: ["resource_type"],
    },
    method: "GET",
    path: "/projects",
    response: { data: [{ gid: "p1" }], next_page: { offset: "next-project" } },
    query: {
      team: "team / 1",
      archived: "false",
      limit: "25",
      offset: "project-cursor",
      opt_fields: `${projectFields},resource_type`,
    },
    expectedOutput: { projects: [{ gid: "p1" }], nextCursor: "next-project" },
  },
  {
    name: "create_project",
    input: {
      workspaceId: "w1",
      name: "Roadmap",
      htmlNotes: "<body>Plan</body>",
      owner: "me",
      dueOn: "2026-09-30",
      startOn: "2026-09-01",
      privacySetting: "private",
      defaultView: "timeline",
      defaultAccessLevel: "editor",
      minimumAccessLevelForCustomization: "admin",
      minimumAccessLevelForSharing: "editor",
      color: "light-blue",
      icon: "rocket",
      customFields: { cf1: "planned" },
      followers: ["me", "u1"],
      archived: false,
      includeFields: ["resource_type"],
    },
    method: "POST",
    path: "/projects",
    response: { data: { gid: "p1", name: "Roadmap" } },
    query: { opt_fields: `${projectFields},resource_type` },
    body: {
      workspace: "w1",
      name: "Roadmap",
      html_notes: "<body>Plan</body>",
      owner: "me",
      due_on: "2026-09-30",
      start_on: "2026-09-01",
      privacy_setting: "private",
      default_view: "timeline",
      default_access_level: "editor",
      minimum_access_level_for_customization: "admin",
      minimum_access_level_for_sharing: "editor",
      color: "light-blue",
      icon: "rocket",
      custom_fields: { cf1: "planned" },
      followers: "me,u1",
      archived: false,
    },
    expectedOutput: { project: { gid: "p1", name: "Roadmap" } },
  },
  {
    name: "get_project",
    input: { projectId: "project / 1", includeFields: ["resource_type"] },
    method: "GET",
    path: "/projects/project%20%2F%201",
    response: { data: { gid: "p1" } },
    query: { opt_fields: `${projectFields},resource_type` },
    expectedOutput: { project: { gid: "p1" } },
  },
  {
    name: "update_project",
    input: {
      projectId: "p1",
      name: "Updated",
      notes: "",
      owner: null,
      dueOn: null,
      startOn: null,
      color: null,
      icon: null,
      minimumAccessLevelForCustomization: "editor",
      minimumAccessLevelForSharing: "admin",
    },
    method: "PUT",
    path: "/projects/p1",
    response: { data: { gid: "p1", name: "Updated" } },
    query: { opt_fields: projectFields },
    body: {
      name: "Updated",
      notes: "",
      owner: null,
      due_on: null,
      start_on: null,
      color: null,
      icon: null,
      minimum_access_level_for_customization: "editor",
      minimum_access_level_for_sharing: "admin",
    },
    expectedOutput: { project: { gid: "p1", name: "Updated" } },
  },
  {
    name: "delete_project",
    input: { projectId: "p1" },
    method: "DELETE",
    path: "/projects/p1",
    response: { data: {} },
    expectedOutput: { success: true },
  },
  {
    name: "duplicate_project",
    input: {
      projectId: "p1",
      name: "Roadmap copy",
      include: ["members", "notes", "task_dates"],
      scheduleDates: {
        shouldSkipWeekends: true,
        startOn: "2026-10-01",
      },
      includeFields: ["gid"],
    },
    method: "POST",
    path: "/projects/p1/duplicate",
    response: { data: { gid: "job1", resource_type: "job", status: "not_started" } },
    query: { opt_fields: `${jobFields},gid` },
    body: {
      name: "Roadmap copy",
      include: "members,notes,task_dates",
      schedule_dates: {
        should_skip_weekends: true,
        start_on: "2026-10-01",
      },
    },
    expectedOutput: { job: { gid: "job1", resource_type: "job", status: "not_started" } },
  },
  {
    name: "list_task_projects",
    input: { taskId: "task / 1", limit: 10, cursor: "task-project-cursor" },
    method: "GET",
    path: "/tasks/task%20%2F%201/projects",
    response: { data: [{ gid: "p1" }] },
    query: { limit: "10", offset: "task-project-cursor", opt_fields: projectFields },
    expectedOutput: { projects: [{ gid: "p1" }], nextCursor: null },
  },
  {
    name: "list_team_projects",
    input: { teamId: "t1", archived: true, limit: 20, cursor: "team-project-cursor" },
    method: "GET",
    path: "/teams/t1/projects",
    response: { data: [{ gid: "p1" }] },
    query: {
      archived: "true",
      limit: "20",
      offset: "team-project-cursor",
      opt_fields: projectFields,
    },
    expectedOutput: { projects: [{ gid: "p1" }], nextCursor: null },
  },
  {
    name: "create_team_project",
    input: { teamId: "t1", name: "Team project", notes: "Shared", followers: ["u1", "u2"] },
    method: "POST",
    path: "/teams/t1/projects",
    response: { data: { gid: "p2", name: "Team project" } },
    query: { opt_fields: projectFields },
    body: { name: "Team project", notes: "Shared", followers: "u1,u2" },
    expectedOutput: { project: { gid: "p2", name: "Team project" } },
  },
  {
    name: "list_workspace_projects",
    input: { workspaceId: "w1", archived: false, limit: 30, cursor: "workspace-project-cursor" },
    method: "GET",
    path: "/workspaces/w1/projects",
    response: { data: [{ gid: "p1" }] },
    query: {
      archived: "false",
      limit: "30",
      offset: "workspace-project-cursor",
      opt_fields: projectFields,
    },
    expectedOutput: { projects: [{ gid: "p1" }], nextCursor: null },
  },
  {
    name: "create_workspace_project",
    input: {
      workspaceId: "w1",
      name: "Workspace project",
      color: "dark-blue",
      followers: ["me"],
    },
    method: "POST",
    path: "/workspaces/w1/projects",
    response: { data: { gid: "p3", name: "Workspace project" } },
    query: { opt_fields: projectFields },
    body: { name: "Workspace project", color: "dark-blue", followers: "me" },
    expectedOutput: { project: { gid: "p3", name: "Workspace project" } },
  },
  {
    name: "search_workspace_projects",
    input: {
      workspaceId: "w1",
      limit: 77,
      text: "launch",
      sortBy: "relevance",
      sortAscending: true,
      completed: false,
      teamIds: ["t1", "t2"],
      ownerIds: ["u1"],
      memberIds: ["u2", "u3"],
      excludedMemberIds: ["u4"],
      portfolioIds: ["pf1"],
      completedOn: null,
      completedOnBefore: "2026-07-31",
      completedOnAfter: "2026-06-01",
      completedAtBefore: "2026-07-31T12:00:00Z",
      completedAtAfter: "2026-06-01T12:00:00Z",
      createdOn: null,
      createdOnBefore: "2026-05-31",
      createdOnAfter: "2026-04-01",
      createdAtBefore: "2026-05-31T12:00:00Z",
      createdAtAfter: "2026-04-01T12:00:00Z",
      dueOn: null,
      dueOnBefore: "2026-08-31",
      dueOnAfter: "2026-07-01",
      dueAtBefore: "2026-08-31T12:00:00Z",
      dueAtAfter: "2026-07-01T12:00:00Z",
      startOn: null,
      startOnBefore: "2026-07-31",
      startOnAfter: "2026-07-01",
      customFieldFilters: [
        {
          customFieldId: "cf1",
          isSet: true,
          value: "Approved",
          startsWith: "App",
          endsWith: "ved",
          contains: "prov",
          lessThan: 10,
          greaterThan: 1,
        },
      ],
      includeFields: ["resource_type"],
    },
    method: "GET",
    path: "/workspaces/w1/projects/search",
    response: { data: [{ gid: "p1" }] },
    query: {
      limit: "77",
      text: "launch",
      sort_by: "relevance",
      sort_ascending: "true",
      completed: "false",
      "teams.any": "t1,t2",
      "owner.any": "u1",
      "members.any": "u2,u3",
      "members.not": "u4",
      "portfolios.any": "pf1",
      completed_on: "null",
      "completed_on.before": "2026-07-31",
      "completed_on.after": "2026-06-01",
      "completed_at.before": "2026-07-31T12:00:00Z",
      "completed_at.after": "2026-06-01T12:00:00Z",
      created_on: "null",
      "created_on.before": "2026-05-31",
      "created_on.after": "2026-04-01",
      "created_at.before": "2026-05-31T12:00:00Z",
      "created_at.after": "2026-04-01T12:00:00Z",
      due_on: "null",
      "due_on.before": "2026-08-31",
      "due_on.after": "2026-07-01",
      "due_at.before": "2026-08-31T12:00:00Z",
      "due_at.after": "2026-07-01T12:00:00Z",
      start_on: "null",
      "start_on.before": "2026-07-31",
      "start_on.after": "2026-07-01",
      "custom_fields.cf1.is_set": "true",
      "custom_fields.cf1.value": "Approved",
      "custom_fields.cf1.starts_with": "App",
      "custom_fields.cf1.ends_with": "ved",
      "custom_fields.cf1.contains": "prov",
      "custom_fields.cf1.less_than": "10",
      "custom_fields.cf1.greater_than": "1",
      opt_fields: `${projectFields},resource_type`,
    },
    expectedOutput: { projects: [{ gid: "p1" }], nextCursor: null },
  },
  {
    name: "add_project_custom_field",
    input: {
      projectId: "p1",
      customFieldId: "cf1",
      isImportant: true,
      insertBefore: "setting1",
      includeFields: ["gid"],
    },
    method: "POST",
    path: "/projects/p1/addCustomFieldSetting",
    response: { data: { gid: "setting2" } },
    query: { opt_fields: `${customFieldSettingFields},gid` },
    body: { custom_field: "cf1", is_important: true, insert_before: "setting1" },
    expectedOutput: { customFieldSetting: { gid: "setting2" } },
  },
  {
    name: "remove_project_custom_field",
    input: { projectId: "p1", customFieldId: "cf1" },
    method: "POST",
    path: "/projects/p1/removeCustomFieldSetting",
    response: { data: {} },
    body: { custom_field: "cf1" },
    expectedOutput: { success: true },
  },
  {
    name: "get_project_task_counts",
    input: { projectId: "p1" },
    method: "GET",
    path: "/projects/p1/task_counts",
    response: {
      data: {
        num_tasks: 20,
        num_incomplete_tasks: 5,
        num_completed_tasks: 15,
        num_milestones: 3,
        num_incomplete_milestones: 1,
        num_completed_milestones: 2,
      },
    },
    query: { opt_fields: taskCountFields },
    expectedOutput: {
      taskCounts: {
        num_tasks: 20,
        num_incomplete_tasks: 5,
        num_completed_tasks: 15,
        num_milestones: 3,
        num_incomplete_milestones: 1,
        num_completed_milestones: 2,
      },
    },
  },
  {
    name: "add_project_members",
    input: { projectId: "p1", members: ["me", "user@example.com", "u1"] },
    method: "POST",
    path: "/projects/p1/addMembers",
    response: { data: { gid: "p1", members: [{ gid: "u1" }] } },
    query: { opt_fields: projectFields },
    body: { members: "me,user@example.com,u1" },
    expectedOutput: { project: { gid: "p1", members: [{ gid: "u1" }] } },
  },
  {
    name: "remove_project_members",
    input: { projectId: "p1", members: ["u1", "u2"] },
    method: "POST",
    path: "/projects/p1/removeMembers",
    response: { data: { gid: "p1", members: [] } },
    query: { opt_fields: projectFields },
    body: { members: "u1,u2" },
    expectedOutput: { project: { gid: "p1", members: [] } },
  },
  {
    name: "add_project_followers",
    input: { projectId: "p1", followers: ["me", "u1"] },
    method: "POST",
    path: "/projects/p1/addFollowers",
    response: { data: { gid: "p1", followers: [{ gid: "u1" }] } },
    query: { opt_fields: projectFields },
    body: { followers: "me,u1" },
    expectedOutput: { project: { gid: "p1", followers: [{ gid: "u1" }] } },
  },
  {
    name: "remove_project_followers",
    input: { projectId: "p1", followers: ["u1"] },
    method: "POST",
    path: "/projects/p1/removeFollowers",
    response: { data: { gid: "p1", followers: [] } },
    query: { opt_fields: projectFields },
    body: { followers: "u1" },
    expectedOutput: { project: { gid: "p1", followers: [] } },
  },
  {
    name: "get_section",
    input: { sectionId: "section / 1", includeFields: ["resource_type"] },
    method: "GET",
    path: "/sections/section%20%2F%201",
    response: { data: { gid: "s1", name: "Doing" } },
    query: { opt_fields: `${sectionFields},resource_type` },
    expectedOutput: { section: { gid: "s1", name: "Doing" } },
  },
  {
    name: "update_section",
    input: { sectionId: "s1", name: "In progress" },
    method: "PUT",
    path: "/sections/s1",
    response: { data: { gid: "s1", name: "In progress" } },
    query: { opt_fields: sectionFields },
    body: { name: "In progress" },
    expectedOutput: { section: { gid: "s1", name: "In progress" } },
  },
  {
    name: "delete_section",
    input: { sectionId: "s1" },
    method: "DELETE",
    path: "/sections/s1",
    response: { data: {} },
    expectedOutput: { success: true },
  },
  {
    name: "list_project_sections",
    input: { projectId: "p1", limit: 15, cursor: "section-cursor" },
    method: "GET",
    path: "/projects/p1/sections",
    response: { data: [{ gid: "s1" }], next_page: { offset: "next-section" } },
    query: { limit: "15", offset: "section-cursor", opt_fields: sectionFields },
    expectedOutput: { sections: [{ gid: "s1" }], nextCursor: "next-section" },
  },
  {
    name: "create_project_section",
    input: { projectId: "p1", name: "Doing", insertAfter: "s0" },
    method: "POST",
    path: "/projects/p1/sections",
    response: { data: { gid: "s1", name: "Doing" } },
    query: { opt_fields: sectionFields },
    body: { name: "Doing", insert_after: "s0" },
    expectedOutput: { section: { gid: "s1", name: "Doing" } },
  },
  {
    name: "add_section_task",
    input: { sectionId: "s1", taskId: "task1", insertBefore: "task2" },
    method: "POST",
    path: "/sections/s1/addTask",
    response: { data: {} },
    body: { task: "task1", insert_before: "task2" },
    expectedOutput: { success: true },
  },
  {
    name: "insert_project_section",
    input: { projectId: "p1", sectionId: "s1", afterSectionId: "s0" },
    method: "POST",
    path: "/projects/p1/sections/insert",
    response: { data: {} },
    body: { section: "s1", after_section: "s0" },
    expectedOutput: { success: true },
  },
];

describe("Asana runtime", () => {
  it("defines all 26 project and section actions with official scope metadata", () => {
    expect(asanaProjectSectionActions).toHaveLength(26);
    expect(
      Object.fromEntries(asanaProjectSectionActions.map((action) => [action.name, action.requiredScopes])),
    ).toEqual({
      list_projects: ["projects:read"],
      create_project: ["projects:write"],
      get_project: ["projects:read"],
      update_project: ["projects:write"],
      delete_project: ["projects:delete"],
      duplicate_project: ["projects:write"],
      list_task_projects: ["projects:read"],
      list_team_projects: ["projects:read"],
      create_team_project: ["projects:write"],
      list_workspace_projects: ["projects:read"],
      create_workspace_project: ["projects:write"],
      search_workspace_projects: ["projects:read"],
      add_project_custom_field: ["projects:write"],
      remove_project_custom_field: ["projects:write"],
      get_project_task_counts: ["projects:read"],
      add_project_members: [],
      remove_project_members: [],
      add_project_followers: [],
      remove_project_followers: [],
      get_section: [],
      update_section: [],
      delete_section: [],
      list_project_sections: [],
      create_project_section: [],
      add_section_task: ["tasks:write"],
      insert_project_section: [],
    });
  });

  it.each(projectSectionHandlerCases)(
    "maps $name to the official Asana method, path, complete query, body, and result",
    async ({ name, input, method, path, response, query, body, expectedOutput }) => {
      const context = recordingContext(jsonResponse(response));
      const handler = projectSectionActionHandlers[name];

      expect(handler).toBeTypeOf("function");
      await expect(handler!(input, context)).resolves.toEqual(expectedOutput);
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

  it.each([
    ["list_projects", { workspaceId: "w1", teamId: "t1" }],
    ["list_projects", {}],
    ["create_project", { name: "No location" }],
    ["create_project", { workspaceId: "w1", teamId: "t1", name: "Two locations" }],
  ])("rejects invalid project location input for %s", async (name, input) => {
    const context = recordingContext();

    await expect(
      Promise.resolve().then(() => projectSectionActionHandlers[name]!(input, context)),
    ).rejects.toMatchObject({ status: 400 });
    expect(context.requests).toHaveLength(0);
  });

  it("rejects an empty project update without making a request", async () => {
    const context = recordingContext();

    await expect(
      Promise.resolve().then(() => projectSectionActionHandlers.update_project!({ projectId: "p1" }, context)),
    ).rejects.toMatchObject({ status: 400 });
    expect(context.requests).toHaveLength(0);
  });

  it("supports the generic project create endpoint with a team location", async () => {
    const context = recordingContext(jsonResponse({ data: { gid: "p1" } }, 201));

    await projectSectionActionHandlers.create_project!({ teamId: "t1", name: "Team project" }, context);

    expect(JSON.parse(context.requests[0]?.init.body as string)).toEqual({
      data: { team: "t1", name: "Team project" },
    });
  });

  it.each([
    ["create_project", { workspaceId: "w1", name: "Project", notes: "plain", htmlNotes: "<body>rich</body>" }],
    ["update_project", { projectId: "p1", notes: "plain", htmlNotes: "<body>rich</body>" }],
  ])("rejects mutually exclusive project notes for %s", async (name, input) => {
    const context = recordingContext();

    await expect(
      Promise.resolve().then(() => projectSectionActionHandlers[name]!(input, context)),
    ).rejects.toMatchObject({ status: 400 });
    expect(context.requests).toHaveLength(0);
  });

  it.each([
    ["create_project", { workspaceId: "w1", name: "Project", startOn: "2026-09-01" }],
    ["update_project", { projectId: "p1", startOn: null }],
    ["update_project", { projectId: "p1", startOn: "2026-09-01", dueOn: "2026-09-01" }],
  ])("rejects an invalid project date range for %s", async (name, input) => {
    const context = recordingContext();

    await expect(
      Promise.resolve().then(() => projectSectionActionHandlers[name]!(input, context)),
    ).rejects.toMatchObject({ status: 400 });
    expect(context.requests).toHaveLength(0);
  });

  it.each([
    {
      projectId: "p1",
      name: "Copy",
      include: ["notes"],
      scheduleDates: { shouldSkipWeekends: true, startOn: "2026-10-01" },
    },
    {
      projectId: "p1",
      name: "Copy",
      include: ["task_dates"],
      scheduleDates: { startOn: "2026-10-01" },
    },
    {
      projectId: "p1",
      name: "Copy",
      include: ["task_dates"],
      scheduleDates: {
        shouldSkipWeekends: true,
        startOn: "2026-10-01",
        dueOn: "2026-10-31",
      },
    },
    {
      projectId: "p1",
      name: "Copy",
      include: ["task_dates"],
      scheduleDates: { shouldSkipWeekends: true },
    },
  ])("rejects invalid duplicate project schedule constraints", async (input) => {
    const context = recordingContext();

    await expect(
      Promise.resolve().then(() => projectSectionActionHandlers.duplicate_project!(input, context)),
    ).rejects.toMatchObject({ status: 400 });
    expect(context.requests).toHaveLength(0);
  });

  it("accepts duplicate project scheduling with task_dates, a boolean, and exactly one date", async () => {
    const context = recordingContext(jsonResponse({ data: { gid: "job1", status: "not_started" } }, 201));

    await expect(
      projectSectionActionHandlers.duplicate_project!(
        {
          projectId: "p1",
          name: "Copy",
          include: ["task_dates"],
          scheduleDates: { shouldSkipWeekends: false, dueOn: "2026-10-31" },
        },
        context,
      ),
    ).resolves.toEqual({ job: { gid: "job1", status: "not_started" } });
    expect(JSON.parse(context.requests[0]?.init.body as string)).toEqual({
      data: {
        name: "Copy",
        include: "task_dates",
        schedule_dates: {
          should_skip_weekends: false,
          due_on: "2026-10-31",
        },
      },
    });
  });

  it.each([
    ["add_project_custom_field", { projectId: "p1", customFieldId: "cf1", insertBefore: "a", insertAfter: "b" }],
    ["create_project_section", { projectId: "p1", name: "Section", insertBefore: "a", insertAfter: "b" }],
    ["add_section_task", { sectionId: "s1", taskId: "t1", insertBefore: "a", insertAfter: "b" }],
    ["insert_project_section", { projectId: "p1", sectionId: "s1" }],
    ["insert_project_section", { projectId: "p1", sectionId: "s1", beforeSectionId: "a", afterSectionId: "b" }],
  ])("rejects invalid placement anchors for %s", async (name, input) => {
    const context = recordingContext();

    await expect(
      Promise.resolve().then(() => projectSectionActionHandlers[name]!(input, context)),
    ).rejects.toMatchObject({ status: 400 });
    expect(context.requests).toHaveLength(0);
  });

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
