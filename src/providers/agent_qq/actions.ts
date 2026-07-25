import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "agent_qq";

const noInput = s.object({}, { description: "No input parameters are required for this action." });

const emailRecipient = s.object(
  {
    email: s.email("Email address."),
    name: s.string("Display name."),
  },
  { description: "An email recipient with optional display name.", optional: ["name"], additionalProperties: true },
);

const messageSummary = s.object(
  {
    message_id: s.string("The message identifier."),
    subject: s.string("The message subject."),
    snippet: s.string("A short preview of the message body."),
    is_read: s.boolean("Whether the message has been read."),
    created_at: s.dateTime("The message creation time."),
    from: emailRecipient,
  },
  { description: "A message summary from a mailbox list.", additionalProperties: true },
);

const pagination = s.object(
  {
    has_more: s.boolean("Whether more results exist."),
    next_cursor: s.string("Cursor for the next page."),
    previous_cursor: s.string("Cursor for the previous page."),
  },
  { description: "Pagination information.", optional: ["next_cursor", "previous_cursor"], additionalProperties: true },
);

const listMessagesInput = s.object(
  {
    alias_id: s.nonEmptyString("The alias identifier to use as the mailbox."),
    q: s.string("Full-text search query. When provided, the search endpoint is used."),
    dir: s.stringEnum("Mailbox folder.", ["inbox", "sent", "trash", "spam"]),
    limit: s.integer("Maximum messages to return (max 50).", { minimum: 1, maximum: 50, default: 10 }),
    cursor: s.string("Pagination cursor from a previous response."),
    before: s.dateTime("Only messages before this ISO 8601 time."),
    after: s.dateTime("Only messages after this ISO 8601 time."),
    is_read: s.boolean("Only return messages with this read state."),
    is_unread: s.boolean("Only return unread messages (translated to is_read=false)."),
    has_attachments: s.boolean("Only return messages that have attachments."),
  },
  {
    description: "Input for listing or searching messages in an alias mailbox.",
    required: ["alias_id"],
    optional: ["q", "dir", "limit", "cursor", "before", "after", "is_read", "is_unread", "has_attachments"],
  },
);
listMessagesInput.not = s.object(
  {
    is_read: s.literal(true),
    is_unread: s.literal(true),
  },
  {
    required: ["is_read", "is_unread"],
    additionalProperties: true,
  },
);

const listMessagesOutput = s.object(
  {
    ok: s.boolean("Whether the request succeeded."),
    data: s.object(
      {
        data: s.array("Messages.", messageSummary),
        pagination,
      },
      { optional: ["pagination"], description: "The message list result.", additionalProperties: true },
    ),
  },
  { description: "Response from listing or searching messages.", required: ["ok", "data"], additionalProperties: true },
);

const readMessageInput = s.object(
  {
    alias_id: s.nonEmptyString("The alias identifier that owns the message."),
    message_id: s.nonEmptyString("The message identifier."),
  },
  { description: "Input for reading a single message.", required: ["alias_id", "message_id"] },
);

const readMessageOutput = s.object(
  {
    ok: s.boolean("Whether the request succeeded."),
    data: s.unknownObject("The full message object returned by the AgentMail API."),
  },
  { description: "Response from reading a message.", required: ["ok", "data"], additionalProperties: true },
);

const sendMessageInput = s.object(
  {
    alias_id: s.nonEmptyString("The alias identifier to send from."),
    to: s.array("Recipient email addresses.", s.email("Recipient email address."), { minItems: 1 }),
    cc: s.array("CC recipient email addresses.", s.email("CC email address.")),
    bcc: s.array("BCC recipient email addresses.", s.email("BCC email address.")),
    subject: s.nonEmptyString("The message subject."),
    body: s.nonEmptyString("The message body."),
    body_format: s.stringEnum("Body format.", ["auto", "plain", "html"]),
    confirmation_token: s.string("Confirmation token from a previous send request."),
  },
  {
    description: "Input for sending a new message.",
    required: ["alias_id", "to", "subject", "body"],
    optional: ["cc", "bcc", "body_format", "confirmation_token"],
  },
);

const sendMessageOutput = s.object(
  { ok: s.boolean("Whether the request succeeded.") },
  { description: "Response from sending a message.", additionalProperties: true },
);

const deleteMessageInput = s.object(
  {
    alias_id: s.nonEmptyString("The alias identifier that owns the message."),
    message_id: s.nonEmptyString("The message identifier."),
  },
  { description: "Input for deleting a message.", required: ["alias_id", "message_id"] },
);

const deleteMessageOutput = s.object(
  {
    ok: s.boolean("Whether the request succeeded."),
    deleted: s.literal(true, { description: "True when the message was moved to trash." }),
  },
  { description: "Response from deleting a message.", required: ["ok", "deleted"], additionalProperties: true },
);

const alias = s.object(
  {
    alias_id: s.string("The alias identifier."),
    email: s.email("The alias email address."),
    is_primary: s.boolean("Whether this is the primary alias."),
  },
  { description: "An AgentMail alias.", optional: ["is_primary"], additionalProperties: true },
);

const listAliasesOutput = s.object(
  {
    ok: s.boolean("Whether the request succeeded."),
    data: s.object(
      { aliases: s.array("Aliases.", alias) },
      { description: "Alias list result.", additionalProperties: true },
    ),
  },
  { description: "Response from listing aliases.", required: ["ok", "data"], additionalProperties: true },
);

export const agentQQActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_aliases",
    description: "List the current user's AgentMail aliases and account limits.",
    requiredScopes: [],
    inputSchema: noInput,
    outputSchema: listAliasesOutput,
  }),
  defineProviderAction(service, {
    name: "list_messages",
    description: "List or search messages in an alias mailbox.",
    requiredScopes: [],
    inputSchema: listMessagesInput,
    outputSchema: listMessagesOutput,
  }),
  defineProviderAction(service, {
    name: "read_message",
    description: "Read a single message including body and attachments.",
    requiredScopes: [],
    inputSchema: readMessageInput,
    outputSchema: readMessageOutput,
  }),
  defineProviderAction(service, {
    name: "send_message",
    description:
      "Send a new message. When confirmation_token is omitted, the first phase returns a confirmation token; the action automatically completes the second phase.",
    requiredScopes: [],
    inputSchema: sendMessageInput,
    outputSchema: sendMessageOutput,
  }),
  defineProviderAction(service, {
    name: "delete_message",
    description: "Move a message to trash (soft delete), automatically completing the provider confirmation flow.",
    requiredScopes: [],
    inputSchema: deleteMessageInput,
    outputSchema: deleteMessageOutput,
  }),
];
