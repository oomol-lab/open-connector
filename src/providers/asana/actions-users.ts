import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  gidField,
  includeFieldsSchema,
  nextCursorSchema,
  paginationFields,
  resourceRefSchema,
  userSchema,
} from "./schemas.ts";

const service = "asana";

const usersOutputSchema = s.object("The output payload for this action.", {
  users: s.array("The Asana users.", userSchema),
  nextCursor: nextCursorSchema,
});

const userMutationFields = {
  name: s.nonEmptyString("The new user display name."),
  customFields: s.record("Custom field values keyed by custom field gid.", s.unknown("The custom field value.")),
};

function userUpdateInputSchema(properties: Record<string, JsonSchema>, required: string[]): JsonSchema {
  const schema = s.object("The input payload for this action.", properties, { required });
  schema.anyOf = [{ required: ["name"] }, { required: ["customFields"] }];
  return schema;
}

export const asanaUserActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    description: "List users visible to the connected account, optionally filtered by workspace or team.",
    requiredScopes: ["users:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        workspaceId: gidField("The workspace or organization gid to filter users on."),
        teamId: gidField("The team gid to filter users on."),
        ...paginationFields,
        includeFields: includeFieldsSchema,
      },
      { optional: ["workspaceId", "teamId", "limit", "cursor", "includeFields"] },
    ),
    outputSchema: usersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: 'Get an Asana user by gid, email, or the special identifier "me".',
    requiredScopes: ["users:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        userId: gidField('The user gid, email address, or special identifier "me".'),
        workspaceId: gidField("The workspace or organization gid used to contextualize the user."),
        includeFields: includeFieldsSchema,
      },
      { required: ["userId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_user",
    description: "Update an Asana user's display name or custom field values.",
    requiredScopes: [],
    inputSchema: userUpdateInputSchema(
      {
        userId: gidField('The user gid, email address, or special identifier "me".'),
        workspaceId: gidField("The workspace or organization gid used to contextualize the user."),
        ...userMutationFields,
        includeFields: includeFieldsSchema,
      },
      ["userId"],
    ),
    outputSchema: s.object("The output payload for this action.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_user_favorites",
    description: "List a user's favorite Asana resources within a workspace.",
    requiredScopes: ["users:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        userId: gidField('The user gid or special identifier "me"; Asana currently supports only "me".'),
        workspaceId: gidField("The workspace containing the favorite resources."),
        resourceType: s.stringEnum("The favorite resource type to return.", [
          "portfolio",
          "project",
          "project_template",
          "tag",
          "task",
          "user",
        ]),
        ...paginationFields,
        includeFields: includeFieldsSchema,
      },
      { required: ["userId", "workspaceId", "resourceType"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      favorites: s.array("The user's favorite Asana resources.", resourceRefSchema),
      nextCursor: nextCursorSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_team_users",
    description: "List users who belong to an Asana team.",
    requiredScopes: ["users:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        teamId: gidField("The Asana team gid."),
        cursor: paginationFields.cursor,
        includeFields: includeFieldsSchema,
      },
      { required: ["teamId"] },
    ),
    outputSchema: usersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_workspace_users",
    description: "List users in an Asana workspace or organization.",
    requiredScopes: ["users:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        workspaceId: gidField("The Asana workspace gid."),
        cursor: paginationFields.cursor,
        includeFields: includeFieldsSchema,
      },
      { required: ["workspaceId"] },
    ),
    outputSchema: usersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_workspace_user",
    description: "Get a user record in the context of an Asana workspace or organization.",
    requiredScopes: ["users:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        workspaceId: gidField("The Asana workspace gid."),
        userId: gidField('The user gid, email address, or special identifier "me".'),
        includeFields: includeFieldsSchema,
      },
      { required: ["workspaceId", "userId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_workspace_user",
    description: "Update an Asana user in the context of a workspace or organization.",
    requiredScopes: [],
    inputSchema: userUpdateInputSchema(
      {
        workspaceId: gidField("The Asana workspace gid."),
        userId: gidField('The user gid, email address, or special identifier "me".'),
        ...userMutationFields,
        includeFields: includeFieldsSchema,
      },
      ["workspaceId", "userId"],
    ),
    outputSchema: s.object("The output payload for this action.", {
      user: userSchema,
    }),
  }),
];
