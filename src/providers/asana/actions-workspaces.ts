import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  gidField,
  includeFieldsSchema,
  nextCursorSchema,
  paginationFields,
  resourceRefSchema,
  successOutputSchema,
  userCompactSchema,
  userSchema,
  workspaceSchema,
} from "./schemas.ts";

const service = "asana";

export const asanaWorkspaceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List the Asana workspaces and organizations visible to the connected account.",
    requiredScopes: ["workspaces:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        ...paginationFields,
        includeFields: includeFieldsSchema,
      },
      { optional: ["limit", "cursor", "includeFields"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      workspaces: s.array("The visible Asana workspaces.", workspaceSchema),
      nextCursor: nextCursorSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_workspace",
    description: "Get an Asana workspace or organization by gid.",
    requiredScopes: ["workspaces:read"],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        workspaceId: gidField("The Asana workspace gid."),
        includeFields: includeFieldsSchema,
      },
      { required: ["workspaceId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      workspace: workspaceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_workspace",
    description: "Rename an existing Asana workspace or organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        workspaceId: gidField("The Asana workspace gid."),
        name: s.nonEmptyString("The new workspace name."),
        includeFields: includeFieldsSchema,
      },
      { required: ["workspaceId", "name"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      workspace: workspaceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "add_workspace_user",
    description: "Add or invite a user to an Asana workspace or organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        workspaceId: gidField("The Asana workspace gid."),
        user: s.nonEmptyString("The user gid or email address to add."),
        includeFields: includeFieldsSchema,
      },
      { required: ["workspaceId", "user"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "remove_workspace_user",
    description: "Remove a user from an Asana workspace or organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        workspaceId: gidField("The Asana workspace gid."),
        user: s.nonEmptyString("The user gid or email address to remove."),
      },
      { required: ["workspaceId", "user"] },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_workspace_events",
    description:
      "Read the Enterprise workspace event stream from an optional sync token and return Asana's next sync state.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        workspaceId: gidField("The Asana workspace gid."),
        sync: s.nonEmptyString("The sync token returned by the previous workspace events response."),
      },
      { required: ["workspaceId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      events: s.array(
        "Workspace events since the supplied sync token.",
        s.looseObject("An Asana workspace event.", {
          user: s.nullable(userCompactSchema),
          resource: resourceRefSchema,
          type: s.string("The legacy event type."),
          action: s.string("The action that produced the event."),
          parent: s.nullable(resourceRefSchema),
          created_at: s.string("The event creation timestamp."),
          change: s.looseObject("Details about the changed field.", {
            action: s.string("The change action."),
            field: s.string("The changed field."),
            new_value: s.nullable(s.unknown("The new field value.")),
            added_value: s.unknown("The value added to the field."),
            removed_value: s.unknown("The value removed from the field."),
          }),
        }),
      ),
      sync: s.nonEmptyString("The sync token to use for the next event request."),
      has_more: s.boolean("Whether more events are available for this sync position."),
    }),
  }),
];
