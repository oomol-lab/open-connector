import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  gidField,
  includeFieldsSchema,
  nextCursorSchema,
  paginationFields,
  successOutputSchema,
  teamCompactSchema,
  teamSchema,
  userCompactSchema,
} from "./schemas.ts";

const service = "asana";

const teamMembershipSchema = s.looseObject("An Asana team membership.", {
  gid: s.string("The team membership gid."),
  resource_type: s.string("The resource type."),
  team: teamCompactSchema,
  user: userCompactSchema,
  is_admin: s.boolean("Whether the user is a team administrator."),
  is_guest: s.boolean("Whether the user is an organization guest."),
  is_limited_access: s.boolean("Whether the user has limited access."),
});

const teamsOutputSchema = s.object("The output payload for this action.", {
  teams: s.array("The Asana teams.", teamSchema),
  nextCursor: nextCursorSchema,
});

const teamAdministrationAccessLevels = ["all_team_members", "only_team_admins"];

const teamMutationFields = {
  name: s.nonEmptyString("The team name."),
  description: s.string("The plain-text team description."),
  htmlDescription: s.string("The HTML team description."),
  visibility: s.stringEnum("The team's visibility within its organization.", ["public", "request_to_join", "secret"]),
  editTeamNameOrDescriptionAccessLevel: s.stringEnum(
    "Who can edit the team name or description.",
    teamAdministrationAccessLevels,
  ),
  editTeamVisibilityOrTrashTeamAccessLevel: s.stringEnum(
    "Who can edit team visibility or trash the team.",
    teamAdministrationAccessLevels,
  ),
  memberInviteManagementAccessLevel: s.stringEnum(
    "Who can manage team membership invitations.",
    teamAdministrationAccessLevels,
  ),
  guestInviteManagementAccessLevel: s.stringEnum("Who can invite guests to the team.", teamAdministrationAccessLevels),
  joinRequestManagementAccessLevel: s.stringEnum(
    "Who can manage requests to join the team.",
    teamAdministrationAccessLevels,
  ),
  teamMemberRemovalAccessLevel: s.stringEnum("Who can remove team members.", teamAdministrationAccessLevels),
  teamContentManagementAccessLevel: s.stringEnum("Who can create and share content with the team.", [
    "no_restriction",
    "only_team_admins",
  ]),
  endorsed: s.boolean("Whether the team is endorsed by the organization."),
};

export const asanaTeamActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_team",
    description: "Create an Asana team within an organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        organizationId: gidField("The organization workspace gid that will own the team."),
        ...teamMutationFields,
        includeFields: includeFieldsSchema,
      },
      { required: ["organizationId", "name"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      team: teamSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_team",
    description: "Get an Asana team by gid.",
    requiredScopes: ["teams:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        teamId: gidField("The Asana team gid."),
        includeFields: includeFieldsSchema,
      },
      { required: ["teamId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      team: teamSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_team",
    description: "Update an existing Asana team.",
    requiredScopes: [],
    inputSchema: (() => {
      const schema = s.object(
        "The input payload for this action.",
        {
          teamId: gidField("The Asana team gid."),
          ...teamMutationFields,
          includeFields: includeFieldsSchema,
        },
        { required: ["teamId"] },
      );
      schema.anyOf = Object.keys(teamMutationFields).map((field) => ({ required: [field] }));
      return schema;
    })(),
    outputSchema: s.object("The output payload for this action.", {
      team: teamSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_workspace_teams",
    description: "List teams in an Asana organization workspace.",
    requiredScopes: ["teams:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        workspaceId: gidField("The Asana organization workspace gid."),
        ...paginationFields,
        includeFields: includeFieldsSchema,
      },
      { required: ["workspaceId"] },
    ),
    outputSchema: teamsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_user_teams",
    description: "List the teams to which an Asana user belongs in an organization.",
    requiredScopes: ["teams:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        userId: gidField('The user gid, email address, or special identifier "me".'),
        organizationId: gidField("The organization workspace gid used to filter memberships."),
        ...paginationFields,
        includeFields: includeFieldsSchema,
      },
      { required: ["userId", "organizationId"] },
    ),
    outputSchema: teamsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_team_user",
    description: "Add an existing organization user to an Asana team.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        teamId: gidField("The Asana team gid."),
        user: s.nonEmptyString("The user gid or email address to add."),
        includeFields: includeFieldsSchema,
      },
      { required: ["teamId", "user"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      team_membership: teamMembershipSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "remove_team_user",
    description: "Remove a user from an Asana team.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        teamId: gidField("The Asana team gid."),
        user: s.nonEmptyString("The user gid or email address to remove."),
      },
      { required: ["teamId", "user"] },
    ),
    outputSchema: successOutputSchema,
  }),
];
