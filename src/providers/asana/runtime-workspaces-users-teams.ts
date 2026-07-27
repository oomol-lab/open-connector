import type { AsanaActionHandler } from "./runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  asanaInvalidInputError,
  asanaPathGid,
  buildAsanaCursorQuery,
  buildAsanaFieldsQuery,
  buildAsanaPaginationQuery,
  compactAsanaQuery,
  getAsanaResource,
  listAsanaResources,
  requestAsana,
  requireNonEmptyAsanaBody,
  writeAsanaResource,
} from "./runtime.ts";

const defaultWorkspaceFields = ["name", "email_domains", "is_organization"];
const defaultUserFields = ["name", "email", "photo", "workspaces", "workspaces.name"];
const defaultAddedWorkspaceUserFields = ["name", "email", "photo"];
const defaultTeamFields = [
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
];
const defaultTeamMembershipFields = [
  "team",
  "team.name",
  "user",
  "user.name",
  "is_admin",
  "is_guest",
  "is_limited_access",
];
const defaultFavoriteFields = ["name"];

export const workspaceUserTeamActionHandlers: Record<string, AsanaActionHandler> = {
  list_workspaces(input, context) {
    return listAsanaResources(
      "/workspaces",
      buildAsanaPaginationQuery(input, defaultWorkspaceFields),
      "workspaces",
      context,
    );
  },

  get_workspace(input, context) {
    return getAsanaResource(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}`,
      buildAsanaFieldsQuery(input, defaultWorkspaceFields),
      "workspace",
      context,
    );
  },

  update_workspace(input, context) {
    const body = compactObject({
      name: optionalString(input.name),
    });
    requireNonEmptyAsanaBody(body, "At least one workspace field must be provided.");
    return writeAsanaResource(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}`,
      body,
      "workspace",
      context,
      {
        method: "PUT",
        query: buildAsanaFieldsQuery(input, defaultWorkspaceFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  add_workspace_user(input, context) {
    return writeAsanaResource(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/addUser`,
      { user: requiredString(input.user, "user", asanaInvalidInputError) },
      "user",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultAddedWorkspaceUserFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  async remove_workspace_user(input, context) {
    await requestAsana({
      path: `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/removeUser`,
      context,
      method: "POST",
      body: { user: requiredString(input.user, "user", asanaInvalidInputError) },
      notFoundAsInvalidInput: true,
    });
    return { success: true };
  },

  async get_workspace_events(input, context) {
    let payload: Record<string, unknown>;
    try {
      payload = await requestAsana({
        path: `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/events`,
        context,
        query: compactAsanaQuery({
          sync: optionalString(input.sync),
        }),
        notFoundAsInvalidInput: true,
      });
    } catch (error) {
      const freshSync =
        error instanceof ProviderRequestError ? optionalString(optionalRecord(error.details)?.sync) : null;
      if (!(error instanceof ProviderRequestError) || error.status !== 412 || !freshSync) {
        throw error;
      }
      return {
        events: [],
        sync: freshSync,
        has_more: false,
      };
    }
    const hasMore = payload.has_more;
    if (typeof hasMore !== "boolean") {
      throw new ProviderRequestError(502, "asana workspace events has_more must be a boolean");
    }
    return {
      events: objectArray(
        payload.data,
        "asana workspace events data",
        (message) => new ProviderRequestError(502, message),
      ),
      sync: requiredString(
        payload.sync,
        "asana workspace events sync",
        (message) => new ProviderRequestError(502, message),
      ),
      has_more: hasMore,
    };
  },

  list_users(input, context) {
    return listAsanaResources(
      "/users",
      compactAsanaQuery({
        workspace: optionalString(input.workspaceId),
        team: optionalString(input.teamId),
        ...buildAsanaPaginationQuery(input, defaultUserFields),
      }),
      "users",
      context,
    );
  },

  get_user(input, context) {
    return getAsanaResource(
      `/users/${asanaPathGid(input.userId, "userId")}`,
      compactAsanaQuery({
        workspace: optionalString(input.workspaceId),
        ...buildAsanaFieldsQuery(input, defaultUserFields),
      }),
      "user",
      context,
    );
  },

  update_user(input, context) {
    const body = buildUserUpdateBody(input);
    return writeAsanaResource(`/users/${asanaPathGid(input.userId, "userId")}`, body, "user", context, {
      method: "PUT",
      query: compactAsanaQuery({
        workspace: optionalString(input.workspaceId),
        ...buildAsanaFieldsQuery(input, defaultUserFields),
      }),
      notFoundAsInvalidInput: true,
    });
  },

  list_user_favorites(input, context) {
    return listAsanaResources(
      `/users/${asanaPathGid(input.userId, "userId")}/favorites`,
      compactAsanaQuery({
        workspace: requiredString(input.workspaceId, "workspaceId", asanaInvalidInputError),
        resource_type: optionalString(input.resourceType),
        ...buildAsanaPaginationQuery(input, defaultFavoriteFields),
      }),
      "favorites",
      context,
    );
  },

  list_team_users(input, context) {
    return listAsanaResources(
      `/teams/${asanaPathGid(input.teamId, "teamId")}/users`,
      buildAsanaCursorQuery(input, defaultUserFields),
      "users",
      context,
    );
  },

  list_workspace_users(input, context) {
    return listAsanaResources(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/users`,
      buildAsanaCursorQuery(input, defaultUserFields),
      "users",
      context,
    );
  },

  get_workspace_user(input, context) {
    return getAsanaResource(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/users/${asanaPathGid(input.userId, "userId")}`,
      buildAsanaFieldsQuery(input, defaultUserFields),
      "user",
      context,
    );
  },

  update_workspace_user(input, context) {
    return writeAsanaResource(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/users/${asanaPathGid(input.userId, "userId")}`,
      buildUserUpdateBody(input),
      "user",
      context,
      {
        method: "PUT",
        query: buildAsanaFieldsQuery(input, defaultUserFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  create_team(input, context) {
    return writeAsanaResource(
      "/teams",
      compactObject({
        organization: requiredString(input.organizationId, "organizationId", asanaInvalidInputError),
        name: requiredString(input.name, "name", asanaInvalidInputError),
        description: optionalString(input.description),
        html_description: optionalString(input.htmlDescription),
        visibility: optionalString(input.visibility),
        edit_team_name_or_description_access_level: optionalString(input.editTeamNameOrDescriptionAccessLevel),
        edit_team_visibility_or_trash_team_access_level: optionalString(input.editTeamVisibilityOrTrashTeamAccessLevel),
        member_invite_management_access_level: optionalString(input.memberInviteManagementAccessLevel),
        guest_invite_management_access_level: optionalString(input.guestInviteManagementAccessLevel),
        join_request_management_access_level: optionalString(input.joinRequestManagementAccessLevel),
        team_member_removal_access_level: optionalString(input.teamMemberRemovalAccessLevel),
        team_content_management_access_level: optionalString(input.teamContentManagementAccessLevel),
        endorsed: optionalBoolean(input.endorsed),
      }),
      "team",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultTeamFields),
      },
    );
  },

  get_team(input, context) {
    return getAsanaResource(
      `/teams/${asanaPathGid(input.teamId, "teamId")}`,
      buildAsanaFieldsQuery(input, defaultTeamFields),
      "team",
      context,
    );
  },

  update_team(input, context) {
    const body = compactObject({
      name: optionalString(input.name),
      description: optionalString(input.description),
      html_description: optionalString(input.htmlDescription),
      visibility: optionalString(input.visibility),
      edit_team_name_or_description_access_level: optionalString(input.editTeamNameOrDescriptionAccessLevel),
      edit_team_visibility_or_trash_team_access_level: optionalString(input.editTeamVisibilityOrTrashTeamAccessLevel),
      member_invite_management_access_level: optionalString(input.memberInviteManagementAccessLevel),
      guest_invite_management_access_level: optionalString(input.guestInviteManagementAccessLevel),
      join_request_management_access_level: optionalString(input.joinRequestManagementAccessLevel),
      team_member_removal_access_level: optionalString(input.teamMemberRemovalAccessLevel),
      team_content_management_access_level: optionalString(input.teamContentManagementAccessLevel),
      endorsed: optionalBoolean(input.endorsed),
    });
    requireNonEmptyAsanaBody(body, "At least one team field must be provided.");
    return writeAsanaResource(`/teams/${asanaPathGid(input.teamId, "teamId")}`, body, "team", context, {
      method: "PUT",
      query: buildAsanaFieldsQuery(input, defaultTeamFields),
      notFoundAsInvalidInput: true,
    });
  },

  list_workspace_teams(input, context) {
    return listAsanaResources(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/teams`,
      buildAsanaPaginationQuery(input, defaultTeamFields),
      "teams",
      context,
    );
  },

  list_user_teams(input, context) {
    return listAsanaResources(
      `/users/${asanaPathGid(input.userId, "userId")}/teams`,
      compactAsanaQuery({
        organization: requiredString(input.organizationId, "organizationId", asanaInvalidInputError),
        ...buildAsanaPaginationQuery(input, defaultTeamFields),
      }),
      "teams",
      context,
    );
  },

  add_team_user(input, context) {
    return writeAsanaResource(
      `/teams/${asanaPathGid(input.teamId, "teamId")}/addUser`,
      { user: requiredString(input.user, "user", asanaInvalidInputError) },
      "team_membership",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultTeamMembershipFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  async remove_team_user(input, context) {
    await requestAsana({
      path: `/teams/${asanaPathGid(input.teamId, "teamId")}/removeUser`,
      context,
      method: "POST",
      body: { user: requiredString(input.user, "user", asanaInvalidInputError) },
      notFoundAsInvalidInput: true,
    });
    return { success: true };
  },
};

function buildUserUpdateBody(input: Record<string, unknown>): Record<string, unknown> {
  const body = compactObject({
    name: optionalString(input.name),
    custom_fields: optionalRecord(input.customFields),
  });
  requireNonEmptyAsanaBody(body, "At least one user field must be provided.");
  return body;
}
