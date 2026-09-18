import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "textit";

function action(
  name: TextitActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, { name, operationType, description, inputSchema, outputSchema });
}

const nonEmptyString = (description: string): JsonSchema => s.string({ description, minLength: 1 });
const uuidString = (description: string): JsonSchema => s.uuid(description);
const textitDateTime = (description: string): JsonSchema => s.dateTime(description);
const cursorField = nonEmptyString("The pagination cursor returned by a previous TextIt response.");
const nextCursorField = s.nullable(
  s.string("The cursor to pass as cursor on the next request, or null when there is no next page."),
);
const previousCursorField = s.nullable(
  s.string("The cursor to pass as cursor for the previous page, or null when there is no previous page."),
);
const rawResponseField = s.looseObject("The raw TextIt API response.");
const contactFieldsSchema = s.record(
  "TextIt contact field values keyed by contact field key.",
  s.unknown("A TextIt contact field value."),
);
const quickReplySchema = s.looseObject("A TextIt quick reply object.", {
  text: s.string("The quick reply display text."),
  extra: s.string("Optional extra quick reply metadata."),
});
const translationTextSchema = s.record(
  "Message text translations keyed by ISO-639-3 language code.",
  s.string("The translated message text."),
);
const translationAttachmentsSchema = s.record(
  "Attachment media UUIDs keyed by ISO-639-3 language code.",
  s.array("Attachment media UUIDs for one language.", s.string("A TextIt media object UUID.")),
);
const translationQuickRepliesSchema = s.record(
  "Quick replies keyed by ISO-639-3 language code.",
  s.array("Quick replies for one language.", quickReplySchema),
);

const contactRefSchema = s.looseObject("A TextIt contact reference.", {
  uuid: uuidString("The contact UUID."),
  name: s.string("The contact name."),
});
const groupRefSchema = s.looseObject("A TextIt group reference.", {
  uuid: uuidString("The group UUID."),
  name: s.string("The group name."),
});
const labelRefSchema = s.looseObject("A TextIt label reference.", {
  uuid: uuidString("The label UUID."),
  name: s.string("The label name."),
});
const flowRefSchema = s.looseObject("A TextIt flow reference.", {
  uuid: uuidString("The flow UUID."),
  name: s.string("The flow name."),
});

const workspaceSchema = s.looseObject("A TextIt workspace.", {
  uuid: uuidString("The workspace UUID."),
  name: s.string("The workspace name."),
  country: s.string("The workspace country code."),
  languages: s.array("The workspace language codes.", s.string("An ISO-639-3 language code.")),
  timezone: s.string("The workspace timezone."),
  date_style: s.string("The workspace date style."),
  anon: s.boolean("Whether the workspace is anonymous."),
});

const contactSchema = s.looseObject("A TextIt contact.", {
  uuid: uuidString("The contact UUID."),
  name: s.nullable(s.string("The contact name.")),
  status: s.string("The contact status returned by TextIt."),
  language: s.nullable(s.string("The preferred language for the contact.")),
  urns: s.array("The URNs associated with the contact.", s.string("A contact URN.")),
  groups: s.array("The groups this contact belongs to.", groupRefSchema),
  fields: contactFieldsSchema,
  flow: s.nullable(flowRefSchema),
  created_on: textitDateTime("When the contact was created."),
  modified_on: textitDateTime("When the contact was last modified."),
  last_seen_on: s.nullable(textitDateTime("When the contact last communicated.")),
});

const groupSchema = s.looseObject("A TextIt contact group.", {
  uuid: uuidString("The group UUID."),
  name: s.string("The group name."),
  query: s.nullable(s.string("The smart group query, or null for manual groups.")),
  status: s.string("The group status returned by TextIt."),
  system: s.boolean("Whether this is a system group."),
  count: s.integer("The number of contacts in the group."),
});

const messageSchema = s.looseObject("A TextIt message.", {
  uuid: uuidString("The message UUID."),
  contact: contactRefSchema,
  urn: s.string("The sender or receiver URN for the message."),
  channel: s.looseObject("The TextIt channel that handled the message.", {
    uuid: uuidString("The channel UUID."),
    name: s.string("The channel name."),
  }),
  direction: s.string("The message direction returned by TextIt."),
  type: s.string("The TextIt message type."),
  status: s.string("The message status returned by TextIt."),
  visibility: s.string("The message visibility returned by TextIt."),
  text: s.string("The logical message text."),
  attachments: s.array("The message attachments returned by TextIt.", s.looseObject("An attachment.")),
  quick_replies: s.array("The message quick replies returned by TextIt.", quickReplySchema),
  labels: s.array("The message labels returned by TextIt.", labelRefSchema),
  flow: s.nullable(flowRefSchema),
  created_on: textitDateTime("When the message was created or received."),
  sent_on: s.nullable(textitDateTime("When the message was sent.")),
  modified_on: textitDateTime("When the message was last modified."),
});

const broadcastSchema = s.looseObject("A TextIt broadcast.", {
  uuid: uuidString("The broadcast UUID."),
  urns: s.array("The URNs that received the broadcast.", s.string("A recipient URN.")),
  contacts: s.array("The contacts that received the broadcast.", contactRefSchema),
  groups: s.array("The groups that received the broadcast.", groupRefSchema),
  text: translationTextSchema,
  attachments: translationAttachmentsSchema,
  quick_replies: translationQuickRepliesSchema,
  base_language: s.string("The default translation language."),
  status: s.string("The broadcast status returned by TextIt."),
  created_on: textitDateTime("When the broadcast was created."),
});

const contactMutationFields = {
  name: s.string("The full name of the contact."),
  language: s.string("The preferred language for the contact as a 3 letter ISO code."),
  urns: s.array("URNs to associate with the contact.", s.string("A contact URN."), {
    maxItems: 100,
  }),
  groups: s.array("Group UUIDs this contact should belong to.", uuidString("A TextIt group UUID."), {
    maxItems: 100,
  }),
  fields: contactFieldsSchema,
};

const contactListInputSchema = s.object(
  "Filters for listing TextIt contacts.",
  {
    uuid: uuidString("Filter by contact UUID."),
    urn: nonEmptyString("Filter by contact URN."),
    group: nonEmptyString("Filter by group name or UUID."),
    before: textitDateTime("Return contacts modified before this datetime."),
    after: textitDateTime("Return contacts modified after this datetime."),
    cursor: cursorField,
  },
  { optional: ["uuid", "urn", "group", "before", "after", "cursor"] },
);

const createContactInputSchema = s.object("Input payload for creating a TextIt contact.", contactMutationFields, {
  optional: ["name", "language", "urns", "groups", "fields"],
});

const updateContactInputSchema = s.object(
  "Input payload for updating a TextIt contact by UUID or URN. Provide exactly one of uuid or urn, and at least one contact field to update.",
  {
    uuid: uuidString("The contact UUID to update."),
    urn: nonEmptyString("The contact URN to update."),
    ...contactMutationFields,
  },
  { optional: ["uuid", "urn", "name", "language", "urns", "groups", "fields"] },
);

const contactTargetInputSchema = s.object(
  "Input payload for selecting a TextIt contact by UUID or URN. Provide exactly one of uuid or urn.",
  {
    uuid: uuidString("The contact UUID."),
    urn: nonEmptyString("The contact URN."),
  },
  { optional: ["uuid", "urn"] },
);

const groupListInputSchema = s.object(
  "Filters for listing TextIt contact groups.",
  {
    uuid: uuidString("Filter by group UUID."),
    name: nonEmptyString("Filter by group name."),
    manualOnly: s.boolean("Whether to only return manual groups."),
    cursor: cursorField,
  },
  { optional: ["uuid", "name", "manualOnly", "cursor"] },
);

const groupNameInputSchema = s.object(
  "Input payload for creating a TextIt group.",
  {
    name: nonEmptyString("The group name."),
  },
  { required: ["name"] },
);

const updateGroupInputSchema = s.object(
  "Input payload for updating a TextIt group.",
  {
    uuid: uuidString("The group UUID to update."),
    name: nonEmptyString("The new group name."),
  },
  { required: ["uuid", "name"] },
);

const groupTargetInputSchema = s.object(
  "Input payload for selecting a TextIt group.",
  {
    uuid: uuidString("The group UUID."),
  },
  { required: ["uuid"] },
);

const messageListInputSchema = s.object(
  "Filters for listing TextIt messages.",
  {
    uuid: uuidString("Filter by message UUID."),
    folder: s.stringEnum("The message folder to list.", ["inbox", "flows", "archived", "outbox", "sent", "failed"]),
    before: textitDateTime("Return messages created before this datetime."),
    after: textitDateTime("Return messages created after this datetime."),
    cursor: cursorField,
  },
  { optional: ["uuid", "folder", "before", "after", "cursor"] },
);

const sendMessageInputSchema = s.object(
  "Input payload for sending a TextIt message to one contact.",
  {
    contact: uuidString("The UUID of the contact to message."),
    text: nonEmptyString("The message text."),
    attachments: s.array("TextIt media object UUIDs to attach.", s.string("A media object UUID."), {
      maxItems: 10,
    }),
    quick_replies: s.array("Quick replies to include with the message.", quickReplySchema, {
      maxItems: 10,
    }),
  },
  { optional: ["attachments", "quick_replies"] },
);

const broadcastListInputSchema = s.object(
  "Filters for listing TextIt broadcasts.",
  {
    uuid: uuidString("Filter by broadcast UUID."),
    before: textitDateTime("Return broadcasts created before this datetime."),
    after: textitDateTime("Return broadcasts created after this datetime."),
    cursor: cursorField,
  },
  { optional: ["uuid", "before", "after", "cursor"] },
);

const sendBroadcastInputSchema = s.object(
  "Input payload for creating and sending a TextIt broadcast. Provide at least one of urns, contacts, or groups.",
  {
    urns: s.array("Recipient URNs for the broadcast.", s.string("A recipient URN."), {
      maxItems: 100,
    }),
    contacts: s.array("Recipient contact UUIDs for the broadcast.", uuidString("A contact UUID."), {
      maxItems: 100,
    }),
    groups: s.array("Recipient group UUIDs for the broadcast.", uuidString("A group UUID."), {
      maxItems: 100,
    }),
    text: translationTextSchema,
    attachments: translationAttachmentsSchema,
    quick_replies: translationQuickRepliesSchema,
    base_language: s.string("The default translation language as an ISO-639-3 code."),
  },
  { optional: ["urns", "contacts", "groups", "attachments", "quick_replies", "base_language"] },
);

const paginatedContactsOutputSchema = s.object("A page of TextIt contacts.", {
  nextCursor: nextCursorField,
  previousCursor: previousCursorField,
  contacts: s.array("Contacts returned by TextIt.", contactSchema),
  raw: rawResponseField,
});
const contactOutputSchema = s.object("A TextIt contact response.", {
  contact: contactSchema,
  raw: rawResponseField,
});
const deleteOutputSchema = s.object("Deletion status for a TextIt resource.", {
  deleted: s.boolean("Whether the resource was deleted."),
});
const paginatedGroupsOutputSchema = s.object("A page of TextIt contact groups.", {
  nextCursor: nextCursorField,
  previousCursor: previousCursorField,
  groups: s.array("Groups returned by TextIt.", groupSchema),
  raw: rawResponseField,
});
const groupOutputSchema = s.object("A TextIt group response.", {
  group: groupSchema,
  raw: rawResponseField,
});
const paginatedMessagesOutputSchema = s.object("A page of TextIt messages.", {
  nextCursor: nextCursorField,
  previousCursor: previousCursorField,
  messages: s.array("Messages returned by TextIt.", messageSchema),
  raw: rawResponseField,
});
const messageOutputSchema = s.object("A TextIt message response.", {
  message: messageSchema,
  raw: rawResponseField,
});
const paginatedBroadcastsOutputSchema = s.object("A page of TextIt broadcasts.", {
  nextCursor: nextCursorField,
  previousCursor: previousCursorField,
  broadcasts: s.array("Broadcasts returned by TextIt.", broadcastSchema),
  raw: rawResponseField,
});
const broadcastOutputSchema = s.object("A TextIt broadcast response.", {
  broadcast: broadcastSchema,
  raw: rawResponseField,
});

export const textitActions: ActionDefinition[] = [
  action(
    "get_workspace",
    "read",
    "Get the current TextIt workspace details for the API token.",
    s.object("No input parameters are required.", {}),
    s.object("The current TextIt workspace response.", {
      workspace: workspaceSchema,
      raw: rawResponseField,
    }),
  ),
  action(
    "list_contacts",
    "read",
    "List TextIt contacts with optional UUID, URN, group, date, and cursor filters.",
    contactListInputSchema,
    paginatedContactsOutputSchema,
  ),
  action(
    "create_contact",
    "write",
    "Create a TextIt contact with optional URNs, groups, language, and fields.",
    createContactInputSchema,
    contactOutputSchema,
  ),
  action(
    "update_contact",
    "write",
    "Update a TextIt contact by UUID or URN.",
    updateContactInputSchema,
    contactOutputSchema,
  ),
  action(
    "delete_contact",
    "destructive",
    "Delete a TextIt contact by UUID or URN.",
    contactTargetInputSchema,
    deleteOutputSchema,
  ),
  action(
    "list_groups",
    "read",
    "List TextIt contact groups with optional filters.",
    groupListInputSchema,
    paginatedGroupsOutputSchema,
  ),
  action("create_group", "write", "Create a TextIt contact group.", groupNameInputSchema, groupOutputSchema),
  action("update_group", "write", "Update a TextIt contact group name.", updateGroupInputSchema, groupOutputSchema),
  action(
    "delete_group",
    "destructive",
    "Delete a TextIt contact group by UUID.",
    groupTargetInputSchema,
    deleteOutputSchema,
  ),
  action(
    "list_messages",
    "read",
    "List TextIt messages with optional folder, UUID, date, and cursor filters.",
    messageListInputSchema,
    paginatedMessagesOutputSchema,
  ),
  action(
    "send_message",
    "write",
    "Send a TextIt message to a single contact.",
    sendMessageInputSchema,
    messageOutputSchema,
  ),
  action(
    "list_broadcasts",
    "read",
    "List TextIt broadcasts with optional UUID, date, and cursor filters.",
    broadcastListInputSchema,
    paginatedBroadcastsOutputSchema,
  ),
  action(
    "send_broadcast",
    "write",
    "Create and send a TextIt broadcast to URNs, contacts, or groups.",
    sendBroadcastInputSchema,
    broadcastOutputSchema,
  ),
];

export type TextitActionName =
  | "get_workspace"
  | "list_contacts"
  | "create_contact"
  | "update_contact"
  | "delete_contact"
  | "list_groups"
  | "create_group"
  | "update_group"
  | "delete_group"
  | "list_messages"
  | "send_message"
  | "list_broadcasts"
  | "send_broadcast";
