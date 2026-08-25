import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "airfocus";
const workspaceIdSchema = s.uuid("The airfocus workspace ID.");
const itemIdSchema = s.uuid("The airfocus item ID.");
const searchFilterSchema = s.unknownObject(
  "An airfocus search filter object following the provider's documented discriminator format.",
);
const searchSortSchema = s.unknownObject(
  "An airfocus sort object following the provider's documented discriminator format.",
);
const itemFieldsSchema = s.record(
  "Custom field values keyed by airfocus field ID.",
  s.unknown("A provider-defined custom field value."),
);
const richTextSchema = s.unknownObject(
  "Structured airfocus rich-text content using the provider's documented block format.",
);
const itemWriteFields: Record<string, JsonSchema> = {
  name: s.optional(s.nonEmptyString("The item name or title.")),
  description: s.optional(richTextSchema),
  statusId: s.optional(s.uuid("The status ID to assign to the item.")),
  archived: s.optional(s.boolean("Whether the item is archived.")),
  assigneeUserIds: s.optional(s.array("User IDs assigned to the item.", s.uuid("An assigned airfocus user ID."))),
  assigneeUserGroupIds: s.optional(
    s.array("User group IDs assigned to the item.", s.uuid("An assigned airfocus user group ID.")),
  ),
  fields: s.optional(itemFieldsSchema),
  order: s.optional(s.integer("The item order number used for sorting.")),
};
const resource = (description: string) => s.unknownObject(description);

export const airfocusActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_profile",
    description: "Get the profile associated with the connected airfocus personal access token.",
    inputSchema: s.actionInput({}, [], "No input is required for this airfocus request."),
    outputSchema: s.actionOutput({ profile: resource("The airfocus user profile returned by the API.") }),
  }),
  defineProviderAction(service, {
    name: "search_workspaces",
    description: "Search airfocus workspaces with optional archived, filter, and sort criteria.",
    inputSchema: s.actionInput(
      {
        archived: s.boolean("Whether to search archived workspaces."),
        filter: searchFilterSchema,
        sort: searchSortSchema,
      },
      [],
      "Search criteria for airfocus workspaces.",
    ),
    outputSchema: s.actionOutput({
      workspaces: s.array("Workspaces matching the search query.", resource("An airfocus workspace.")),
      totalItems: s.integer("The total number of matching workspaces."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_workspace",
    description: "Get one airfocus workspace by ID.",
    inputSchema: s.actionInput({ workspaceId: workspaceIdSchema }, ["workspaceId"]),
    outputSchema: s.actionOutput({ workspace: resource("The airfocus workspace returned by the API.") }),
  }),
  defineProviderAction(service, {
    name: "search_items",
    description: "Search items in an airfocus workspace with optional filter and sort criteria.",
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdSchema,
        archived: s.boolean("Whether to search archived items."),
        filter: searchFilterSchema,
        sort: searchSortSchema,
      },
      ["workspaceId"],
      "Search criteria for airfocus items.",
    ),
    outputSchema: s.actionOutput({
      items: s.array("Items matching the search query.", resource("An airfocus item.")),
      totalItems: s.integer("The total number of matching items."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_item",
    description: "Get one item from an airfocus workspace by ID.",
    inputSchema: s.actionInput({ workspaceId: workspaceIdSchema, itemId: itemIdSchema }, ["workspaceId", "itemId"]),
    outputSchema: s.actionOutput({ item: resource("The airfocus item returned by the API.") }),
  }),
  defineProviderAction(service, {
    name: "create_item",
    description: "Create an item in an airfocus workspace.",
    inputSchema: s.actionInput(
      { workspaceId: workspaceIdSchema, ...itemWriteFields, name: s.nonEmptyString("The item name or title.") },
      ["workspaceId", "name"],
      "Parameters for creating an airfocus item.",
    ),
    outputSchema: s.actionOutput({ item: resource("The airfocus item returned by the API.") }),
  }),
  defineProviderAction(service, {
    name: "update_item",
    description: "Update the supplied fields of an existing airfocus item.",
    inputSchema: s.actionInput(
      { workspaceId: workspaceIdSchema, itemId: itemIdSchema, ...itemWriteFields },
      ["workspaceId", "itemId"],
      "Parameters for updating an airfocus item.",
    ),
    outputSchema: s.actionOutput({ item: resource("The airfocus item returned by the API.") }),
  }),
  defineProviderAction(service, {
    name: "delete_item",
    description: "Permanently delete an item from an airfocus workspace.",
    inputSchema: s.actionInput({ workspaceId: workspaceIdSchema, itemId: itemIdSchema }, ["workspaceId", "itemId"]),
    outputSchema: s.actionOutput({
      deleted: s.boolean("Whether the item was deleted successfully."),
      itemId: itemIdSchema,
    }),
  }),
];
