import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "laposta";

const memberCountsSchema = s.looseRequiredObject(
  "Laposta list member counts by state.",
  {
    active: s.nonNegativeInteger("Number of active members."),
    unsubscribed: s.nonNegativeInteger("Number of unsubscribed members."),
    cleaned: s.nonNegativeInteger("Number of cleaned members."),
  },
  { optional: [] },
);

const listSchema = s.looseRequiredObject(
  "A Laposta mailing list.",
  {
    list_id: s.nonEmptyString("Unique Laposta list ID."),
    state: s.stringEnum("Current list state.", ["active", "deleted"]),
    name: s.nonEmptyString("List name."),
    locked: s.boolean("Whether the list is locked against changes in the application."),
    members: memberCountsSchema,
  },
  { optional: [] },
);

const memberSchema = s.looseRequiredObject(
  "A Laposta mailing list member.",
  {
    member_id: s.nonEmptyString("Unique Laposta member ID."),
    list_id: s.nonEmptyString("ID of the list containing the member."),
    email: s.email("Member email address."),
    state: s.stringEnum("Current member state.", ["active", "unsubscribed", "unconfirmed", "cleaned", "deleted"]),
    custom_fields: s.looseObject("Values of the list's custom fields for this member."),
  },
  { optional: [] },
);

const listWriteFields: Record<string, JsonSchema> = {
  name: s.nonEmptyString("List name."),
  locked: s.boolean("Whether the list is locked against changes in the application."),
  remarks: s.string("Optional remarks about the list."),
  subscribe_notification_email: s.email("Email address notified when a member subscribes."),
  unsubscribe_notification_email: s.email("Email address notified when a member unsubscribes."),
};

const memberWriteFields: Record<string, JsonSchema> = {
  email: s.email("Member email address."),
  state: s.stringEnum("New member state.", ["active", "unsubscribed"]),
  custom_fields: s.looseObject("Custom field values keyed by Laposta custom_name."),
};

export type LapostaActionName =
  | "list_lists"
  | "get_list"
  | "create_list"
  | "update_list"
  | "list_members"
  | "get_member"
  | "create_member"
  | "update_member";

export const lapostaActions: readonly ProviderActionDefinition<LapostaActionName>[] = [
  defineProviderAction(service, {
    name: "list_lists",
    operationType: "read",
    description: "List all mailing lists available to the authenticated Laposta account.",
    inputSchema: s.actionInput({}, [], "No input is required to list Laposta lists."),
    outputSchema: s.actionOutput(
      { lists: s.array("Lists returned by Laposta.", listSchema) },
      "Laposta mailing lists.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_list",
    operationType: "read",
    description: "Get one Laposta mailing list by ID.",
    inputSchema: s.actionInput(
      { list_id: s.nonEmptyString("ID of the list to retrieve.") },
      ["list_id"],
      "Input for retrieving a Laposta list.",
    ),
    outputSchema: singleListOutputSchema(),
  }),
  defineProviderAction(service, {
    name: "create_list",
    operationType: "write",
    description: "Create a Laposta mailing list.",
    inputSchema: s.actionInput(listWriteFields, ["name"], "Fields for creating a Laposta list."),
    outputSchema: singleListOutputSchema(),
  }),
  defineProviderAction(service, {
    name: "update_list",
    operationType: "write",
    description: "Update selected fields on a Laposta mailing list.",
    inputSchema: s.actionInput(
      {
        list_id: s.nonEmptyString("ID of the list to update."),
        ...listWriteFields,
      },
      ["list_id"],
      "Fields to update on a Laposta list.",
    ),
    outputSchema: singleListOutputSchema(),
  }),
  defineProviderAction(service, {
    name: "list_members",
    operationType: "read",
    description: "List members of a Laposta mailing list, optionally filtered by state.",
    inputSchema: s.actionInput(
      {
        list_id: s.nonEmptyString("ID of the list whose members should be returned."),
        state: s.stringEnum("Member state filter.", ["active", "unsubscribed", "cleaned"]),
      },
      ["list_id"],
      "Filters for listing Laposta members.",
    ),
    outputSchema: s.actionOutput(
      { members: s.array("Members returned by Laposta.", memberSchema) },
      "Laposta mailing list members.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_member",
    operationType: "read",
    description: "Get one Laposta member by member ID or email address.",
    inputSchema: s.actionInput(
      {
        list_id: s.nonEmptyString("ID of the list containing the member."),
        member_id: s.nonEmptyString("Member ID or raw member email address."),
      },
      ["list_id", "member_id"],
      "Input for retrieving a Laposta member.",
    ),
    outputSchema: singleMemberOutputSchema(),
  }),
  defineProviderAction(service, {
    name: "create_member",
    operationType: "write",
    description: "Add a member to a Laposta mailing list.",
    inputSchema: s.actionInput(
      {
        list_id: s.nonEmptyString("ID of the list to which the member should be added."),
        ip: s.nonEmptyString("IP address from which the member registered."),
        email: s.email("Email address of the member to add."),
        source_url: s.url("URL from which the member registered."),
        custom_fields: s.looseObject("Custom field values keyed by Laposta custom_name."),
        options: s.object(
          "Laposta member creation options.",
          {
            upsert: s.boolean("Update an existing active member with the same email address."),
            suppress_reactivation: s.boolean("Prevent an unsubscribed member from being reactivated during upsert."),
            suppress_email_notification: s.boolean(
              "Prevent Laposta from sending the API subscription notification email.",
            ),
            ignore_doubleoptin: s.boolean(
              "Activate the member immediately without sending a double opt-in confirmation.",
            ),
          },
          {
            optional: ["upsert", "suppress_reactivation", "suppress_email_notification", "ignore_doubleoptin"],
          },
        ),
      },
      ["list_id", "ip", "email"],
      "Fields for creating a Laposta member.",
    ),
    outputSchema: singleMemberOutputSchema(),
  }),
  defineProviderAction(service, {
    name: "update_member",
    operationType: "write",
    description: "Update selected fields on a Laposta mailing list member.",
    inputSchema: s.actionInput(
      {
        list_id: s.nonEmptyString("ID of the list containing the member."),
        member_id: s.nonEmptyString("Member ID or raw member email address."),
        ...memberWriteFields,
      },
      ["list_id", "member_id"],
      "Fields to update on a Laposta member.",
    ),
    outputSchema: singleMemberOutputSchema(),
  }),
];

function singleListOutputSchema(): JsonSchema {
  return s.actionOutput({ list: listSchema }, "A single Laposta list response.");
}

function singleMemberOutputSchema(): JsonSchema {
  return s.actionOutput({ member: memberSchema }, "A single Laposta member response.");
}
