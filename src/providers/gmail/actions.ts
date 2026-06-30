import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  gmailComposeScopes,
  gmailLabelScopes,
  gmailModifyScopes,
  gmailReadScopes,
  gmailSendScopes,
  gmailSettingsBasicScopes,
  gmailSettingsSharingScopes,
} from "./scopes.ts";

const service = "gmail";

const userId = s.string({ description: "Gmail user ID. Omit to use the connected mailbox." });
const query = s.string({ description: "Gmail search query." });
const pageToken = s.string({ description: "Opaque pagination token returned by Gmail." });
const maxResults = s.integer({
  minimum: 1,
  maximum: 500,
  description: "Maximum number of results to return.",
});
const messageId = s.string({ minLength: 1, description: "Gmail message ID." });
const threadId = s.string({ minLength: 1, description: "Gmail thread ID." });
const draftId = s.string({ minLength: 1, description: "Gmail draft ID." });
const labelId = s.string({ minLength: 1, description: "Gmail label ID." });
const filterId = s.string({ minLength: 1, description: "Gmail filter ID." });
const labelIds = s.array(s.string({ minLength: 1 }), { description: "Gmail label IDs." });
const format = s.stringEnum(["minimal", "full", "raw", "metadata"], {
  description: "Gmail response format to request.",
});
const gmailObject = s.record(true, { description: "Gmail API object." });
const success = s.object(
  { success: s.boolean({ description: "Whether the operation completed successfully." }) },
  { required: ["success"], description: "Operation result." },
);

const messageSummaryProperties = {
  messageId,
  threadId,
  labelIds,
  subject: s.string({ description: "Message subject." }),
  sender: s.string({ description: "Message sender." }),
  to: s.string({ description: "Message recipients." }),
  messageTimestamp: s.string({ description: "Message timestamp." }),
};

const messageSummary = s.object(messageSummaryProperties, {
  required: ["messageId", "threadId", "labelIds", "subject", "sender", "to", "messageTimestamp"],
  additionalProperties: true,
  description: "Normalized Gmail message summary.",
});

const message = s.object(
  {
    ...messageSummaryProperties,
    preview: gmailObject,
    payload: s.nullable(gmailObject),
    messageText: s.string({ description: "Extracted message body text." }),
    attachmentList: s.array(gmailObject, { description: "Message attachments." }),
    raw: s.string({ description: "Raw RFC 2822 message when requested." }),
  },
  {
    required: ["messageId", "threadId", "labelIds", "subject", "sender", "to", "messageTimestamp"],
    additionalProperties: true,
    description: "Normalized Gmail message.",
  },
);

const thread = s.object(
  {
    threadId,
    historyId: s.nullable(s.string({ description: "Mailbox history checkpoint ID." })),
    snippet: s.string({ description: "Thread snippet." }),
    messages: s.array(message, { description: "Messages in the thread." }),
  },
  {
    required: ["threadId"],
    additionalProperties: true,
    description: "Gmail thread.",
  },
);

const draft = s.object(
  {
    id: draftId,
    message,
  },
  {
    required: ["id", "message"],
    additionalProperties: true,
    description: "Gmail draft.",
  },
);

const labelColor = s.object(
  {
    textColor: s.string({ description: "Hex text color." }),
    backgroundColor: s.string({ description: "Hex background color." }),
  },
  { description: "Gmail label color." },
);

const label = s.object(
  {
    id: labelId,
    name: s.string({ description: "Label display name." }),
    type: s.string({ description: "Label type." }),
    messageListVisibility: s.stringEnum(["show", "hide"], {
      description: "Whether messages with this label appear in the message list.",
    }),
    labelListVisibility: s.stringEnum(["labelShow", "labelShowIfUnread", "labelHide"], {
      description: "Whether the label appears in the label list.",
    }),
    color: labelColor,
  },
  {
    required: ["id", "name", "type"],
    additionalProperties: true,
    description: "Gmail label.",
  },
);

const filter = s.object(
  {
    id: filterId,
    criteria: gmailObject,
    action: gmailObject,
  },
  {
    required: ["id"],
    additionalProperties: true,
    description: "Gmail filter.",
  },
);

const action = (input: {
  name: string;
  description: string;
  requiredScopes: string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  outputSchema: JsonSchema;
}): ActionDefinition =>
  defineProviderAction(service, {
    name: input.name,
    description: input.description,
    requiredScopes: input.requiredScopes,
    inputSchema: s.object(input.properties ?? {}, {
      required: input.required,
      description: "The input payload for this action.",
    }),
    outputSchema: input.outputSchema,
  });

const withUser = (properties: Record<string, JsonSchema> = {}): Record<string, JsonSchema> => ({
  ...properties,
  userId,
});

const pageFields = (extra: Record<string, JsonSchema> = {}): Record<string, JsonSchema> => ({
  ...extra,
  maxResults,
  pageToken,
});

const recipientFields = (): Record<string, JsonSchema> => ({
  recipientEmail: s.string({ description: "Primary recipient email address." }),
  to: s.string({ description: "Primary recipient email address." }),
  extraRecipients: s.array(s.string(), { description: "Additional To recipients." }),
  cc: s.union([s.string(), s.array(s.string())], { description: "Cc recipients." }),
  bcc: s.union([s.string(), s.array(s.string())], { description: "Bcc recipients." }),
  subject: s.string({ description: "Email subject line." }),
  body: s.string({ description: "Email body content." }),
  messageBody: s.string({ description: "Reply or draft body content." }),
  isHtml: s.boolean({ description: "Whether the body is HTML." }),
  fromEmail: s.string({ description: "Verified Gmail send-as alias." }),
});

const labelMutation = (): Record<string, JsonSchema> => ({
  addLabelIds: labelIds,
  removeLabelIds: labelIds,
});

export const gmailActions: ActionDefinition[] = [
  action({
    name: "search_threads",
    description:
      "Search Gmail threads by query and return lightweight thread summaries. Spam and trash stay excluded unless explicitly targeted in the query.",
    requiredScopes: gmailReadScopes,
    properties: { query, maxResults },
    required: ["query"],
    outputSchema: s.object(
      { threads: s.array(thread, { description: "Matching thread summaries." }) },
      { required: ["threads"], description: "Thread search result." },
    ),
  }),
  action({
    name: "list_threads",
    description: "List Gmail threads with optional query filtering and pagination.",
    requiredScopes: gmailReadScopes,
    properties: pageFields({ query, verbose: s.boolean({ description: "Hydrate each thread." }) }),
    outputSchema: s.object(
      {
        threads: s.array(thread, { description: "Returned threads." }),
        nextPageToken: s.nullable(pageToken),
        resultSizeEstimate: s.integer({ description: "Approximate result count." }),
      },
      { required: ["threads"], description: "Thread list result." },
    ),
  }),
  action({
    name: "fetch_emails",
    description:
      "List Gmail messages with optional query, label, and pagination filters. Use detail to choose IDs, summaries, or full messages.",
    requiredScopes: gmailReadScopes,
    properties: pageFields({
      query,
      labelIds,
      includeSpamTrash: s.boolean({ description: "Whether to include Spam and Trash." }),
      detail: s.stringEnum(["ids", "summary", "full"], {
        default: "summary",
        description: "Message detail level.",
      }),
    }),
    outputSchema: s.object(
      {
        messages: s.array(s.union([messageSummary, message, gmailObject]), {
          description: "Returned messages.",
        }),
        nextPageToken: s.nullable(pageToken),
        resultSizeEstimate: s.integer({ description: "Approximate result count." }),
      },
      { required: ["messages"], description: "Message list result." },
    ),
  }),
  action({
    name: "get_message",
    description: "Get a Gmail message by message ID with a simplified normalized output.",
    requiredScopes: gmailReadScopes,
    properties: { messageId },
    required: ["messageId"],
    outputSchema: s.object(
      {
        messageId,
        threadId,
        subject: s.string(),
        from: s.string(),
        to: s.string(),
        date: s.string(),
        body: s.string(),
      },
      { required: ["messageId", "threadId"], description: "Simplified Gmail message." },
    ),
  }),
  action({
    name: "fetch_message_by_message_id",
    description: "Fetch a Gmail message by message ID with a controllable response format.",
    requiredScopes: gmailReadScopes,
    properties: { messageId, format },
    required: ["messageId"],
    outputSchema: message,
  }),
  action({
    name: "fetch_message_by_thread_id",
    description: "Fetch all messages in a Gmail thread.",
    requiredScopes: gmailReadScopes,
    properties: { threadId },
    required: ["threadId"],
    outputSchema: thread,
  }),
  action({
    name: "get_profile",
    description:
      "Get the connected Gmail profile, including mailbox totals and the current historyId.",
    requiredScopes: gmailReadScopes,
    properties: withUser(),
    outputSchema: s.object(
      {
        emailAddress: s.string(),
        messagesTotal: s.integer(),
        threadsTotal: s.integer(),
        historyId: s.string(),
      },
      {
        required: ["emailAddress", "messagesTotal", "threadsTotal", "historyId"],
        description: "Gmail profile.",
      },
    ),
  }),
  action({
    name: "send_email",
    description: "Send an email from the connected Gmail account.",
    requiredScopes: gmailSendScopes,
    properties: recipientFields(),
    outputSchema: s.object(
      { messageId },
      { required: ["messageId"], description: "Sent message result." },
    ),
  }),
  action({
    name: "reply_email",
    description: "Reply to an existing Gmail thread using the original message's reply headers.",
    requiredScopes: gmailSendScopes,
    properties: { threadId, messageId, body: s.string({ description: "Reply body." }) },
    required: ["threadId", "messageId", "body"],
    outputSchema: s.object(
      { messageId },
      { required: ["messageId"], description: "Reply result." },
    ),
  }),
  action({
    name: "reply_to_thread",
    description: "Reply to an existing Gmail thread while preserving Gmail threading.",
    requiredScopes: gmailSendScopes,
    properties: { threadId, ...recipientFields() },
    required: ["threadId"],
    outputSchema: s.object(
      { messageId, threadId },
      { required: ["messageId"], description: "Thread reply result." },
    ),
  }),
  action({
    name: "create_draft",
    description: "Create a Gmail draft with a simplified input and output shape.",
    requiredScopes: gmailComposeScopes,
    properties: {
      to: s.string(),
      subject: s.string(),
      body: s.string(),
      cc: s.union([s.string(), s.array(s.string())]),
    },
    required: ["to", "subject", "body"],
    outputSchema: s.object(
      { draftId },
      { required: ["draftId"], description: "Created draft result." },
    ),
  }),
  action({
    name: "create_email_draft",
    description: "Create a Gmail draft with recipients, subject, body, and optional threading.",
    requiredScopes: gmailComposeScopes,
    properties: { ...recipientFields(), threadId },
    outputSchema: s.object(
      { draftId, messageId, threadId },
      { required: ["draftId"], description: "Created draft." },
    ),
  }),
  action({
    name: "list_drafts",
    description: "List Gmail drafts with pagination.",
    requiredScopes: gmailComposeScopes,
    properties: pageFields({ verbose: s.boolean({ description: "Hydrate each draft." }) }),
    outputSchema: s.object(
      { drafts: s.array(draft), nextPageToken: s.nullable(pageToken) },
      { required: ["drafts"], description: "Draft list result." },
    ),
  }),
  action({
    name: "get_draft",
    description: "Get a Gmail draft by draft ID.",
    requiredScopes: gmailComposeScopes,
    properties: { draftId, format },
    required: ["draftId"],
    outputSchema: draft,
  }),
  action({
    name: "update_draft",
    description: "Update an existing Gmail draft in place.",
    requiredScopes: gmailComposeScopes,
    properties: { draftId, ...recipientFields(), threadId },
    required: ["draftId"],
    outputSchema: s.object(
      { draftId, messageId, threadId },
      { required: ["draftId"], description: "Updated draft." },
    ),
  }),
  action({
    name: "send_draft",
    description: "Send an existing Gmail draft as-is.",
    requiredScopes: gmailSendScopes,
    properties: { draftId },
    required: ["draftId"],
    outputSchema: s.object(
      { messageId, threadId: s.nullable(threadId) },
      { required: ["messageId"], description: "Sent draft result." },
    ),
  }),
  action({
    name: "delete_draft",
    description: "Permanently delete a Gmail draft by draft ID.",
    requiredScopes: gmailComposeScopes,
    properties: withUser({ draftId }),
    required: ["draftId"],
    outputSchema: success,
  }),
  action({
    name: "list_labels",
    description: "List all system and user-created Gmail labels.",
    requiredScopes: gmailLabelScopes,
    properties: withUser(),
    outputSchema: s.object(
      { labels: s.array(label) },
      { required: ["labels"], description: "Label list." },
    ),
  }),
  action({
    name: "get_label",
    description: "Get details for a Gmail label.",
    requiredScopes: gmailLabelScopes,
    properties: withUser({ labelId }),
    required: ["labelId"],
    outputSchema: label,
  }),
  action({
    name: "create_label",
    description: "Create a new Gmail label and return its internal label ID.",
    requiredScopes: gmailLabelScopes,
    properties: withUser({
      name: s.string({ minLength: 1, description: "Display name for the new label." }),
      labelListVisibility: s.stringEnum(["labelShow", "labelShowIfUnread", "labelHide"]),
      messageListVisibility: s.stringEnum(["show", "hide"]),
      color: labelColor,
    }),
    required: ["name"],
    outputSchema: label,
  }),
  action({
    name: "patch_label",
    description: "Patch a user-created Gmail label.",
    requiredScopes: gmailLabelScopes,
    properties: withUser({
      labelId,
      name: s.string({ description: "Updated display name for the label." }),
      labelListVisibility: s.stringEnum(["labelShow", "labelShowIfUnread", "labelHide"]),
      messageListVisibility: s.stringEnum(["show", "hide"]),
      color: labelColor,
    }),
    required: ["labelId"],
    outputSchema: label,
  }),
  action({
    name: "update_label",
    description: "Update an existing Gmail label.",
    requiredScopes: gmailLabelScopes,
    properties: withUser({
      labelId,
      name: s.string({ description: "Updated display name for the label." }),
      labelListVisibility: s.stringEnum(["labelShow", "labelShowIfUnread", "labelHide"]),
      messageListVisibility: s.stringEnum(["show", "hide"]),
      color: labelColor,
    }),
    required: ["labelId"],
    outputSchema: label,
  }),
  action({
    name: "delete_label",
    description: "Permanently delete a user-created Gmail label.",
    requiredScopes: gmailLabelScopes,
    properties: withUser({ labelId }),
    required: ["labelId"],
    outputSchema: success,
  }),
  action({
    name: "add_label_to_email",
    description: "Add and/or remove labels on a single Gmail message.",
    requiredScopes: gmailModifyScopes,
    properties: withUser({ messageId, ...labelMutation() }),
    required: ["messageId"],
    outputSchema: message,
  }),
  action({
    name: "batch_modify_messages",
    description: "Add and/or remove labels on up to 1,000 Gmail messages.",
    requiredScopes: gmailModifyScopes,
    properties: withUser({
      messageIds: s.array(messageId, { description: "Message IDs to modify." }),
      ...labelMutation(),
    }),
    required: ["messageIds"],
    outputSchema: success,
  }),
  action({
    name: "move_to_trash",
    description: "Move a Gmail message to trash.",
    requiredScopes: gmailModifyScopes,
    properties: withUser({ messageId, ...labelMutation() }),
    required: ["messageId"],
    outputSchema: message,
  }),
  action({
    name: "untrash_message",
    description: "Restore a previously trashed Gmail message.",
    requiredScopes: gmailModifyScopes,
    properties: withUser({ messageId, ...labelMutation() }),
    required: ["messageId"],
    outputSchema: message,
  }),
  action({
    name: "modify_thread_labels",
    description: "Add and/or remove labels on every message in a Gmail thread.",
    requiredScopes: gmailModifyScopes,
    properties: withUser({ threadId, ...labelMutation() }),
    required: ["threadId"],
    outputSchema: thread,
  }),
  action({
    name: "move_thread_to_trash",
    description: "Move an entire Gmail thread to trash.",
    requiredScopes: gmailModifyScopes,
    properties: withUser({ threadId, ...labelMutation() }),
    required: ["threadId"],
    outputSchema: thread,
  }),
  action({
    name: "untrash_thread",
    description: "Restore a previously trashed Gmail thread.",
    requiredScopes: gmailModifyScopes,
    properties: withUser({ threadId, ...labelMutation() }),
    required: ["threadId"],
    outputSchema: thread,
  }),
  action({
    name: "list_history",
    description: "List Gmail mailbox change history after a known startHistoryId.",
    requiredScopes: gmailReadScopes,
    properties: withUser({
      startHistoryId: s.string({ minLength: 1, description: "History checkpoint." }),
      pageToken,
      maxResults,
      labelId,
      historyTypes: s.array(s.string(), { description: "History event types to include." }),
    }),
    required: ["startHistoryId"],
    outputSchema: s.object(
      {
        history: s.array(gmailObject),
        historyId: s.string(),
        nextPageToken: s.nullable(pageToken),
      },
      { required: ["history", "historyId"], description: "Mailbox history result." },
    ),
  }),
  action({
    name: "list_filters",
    description: "List Gmail filters for the mailbox.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser(),
    outputSchema: s.object(
      { filters: s.array(filter) },
      { required: ["filters"], description: "Filter list." },
    ),
  }),
  action({
    name: "get_filter",
    description: "Get a Gmail filter by filter ID.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser({ filterId }),
    required: ["filterId"],
    outputSchema: filter,
  }),
  action({
    name: "create_filter",
    description: "Create a Gmail filter with matching criteria and resulting actions.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser({ criteria: gmailObject, action: gmailObject }),
    required: ["criteria", "action"],
    outputSchema: filter,
  }),
  action({
    name: "delete_filter",
    description: "Permanently delete a Gmail filter by filter ID.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser({ filterId }),
    required: ["filterId"],
    outputSchema: success,
  }),
  action({
    name: "get_language_settings",
    description: "Get the Gmail display language settings.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser(),
    outputSchema: gmailObject,
  }),
  action({
    name: "update_language_settings",
    description: "Update the Gmail display language settings.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser({
      displayLanguage: s.string({ minLength: 1, description: "Language code." }),
    }),
    required: ["displayLanguage"],
    outputSchema: gmailObject,
  }),
  action({
    name: "get_vacation_settings",
    description: "Get the Gmail vacation responder settings.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser(),
    outputSchema: gmailObject,
  }),
  action({
    name: "update_vacation_settings",
    description: "Update the Gmail vacation responder settings.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser({
      enableAutoReply: s.boolean(),
      responseSubject: s.string(),
      responseBodyPlainText: s.string(),
      responseBodyHtml: s.string(),
      restrictToContacts: s.boolean(),
      restrictToDomain: s.boolean(),
      startTime: s.string(),
      endTime: s.string(),
    }),
    outputSchema: gmailObject,
  }),
  action({
    name: "get_auto_forwarding",
    description: "Get the current Gmail auto-forwarding configuration.",
    requiredScopes: gmailSettingsSharingScopes,
    properties: withUser(),
    outputSchema: gmailObject,
  }),
  action({
    name: "list_forwarding_addresses",
    description: "List registered forwarding addresses.",
    requiredScopes: gmailSettingsSharingScopes,
    properties: withUser(),
    outputSchema: gmailObject,
  }),
  action({
    name: "settings_get_imap",
    description: "Get the Gmail IMAP settings.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser(),
    outputSchema: gmailObject,
  }),
  action({
    name: "settings_get_pop",
    description: "Get the Gmail POP settings.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser(),
    outputSchema: gmailObject,
  }),
  action({
    name: "stop_watch",
    description: "Stop Gmail push watch notifications for the mailbox.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser(),
    outputSchema: success,
  }),
  action({
    name: "update_imap_settings",
    description: "Update the Gmail IMAP settings.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser({
      enabled: s.boolean(),
      autoExpunge: s.boolean(),
      expungeBehavior: s.string(),
      maxFolderSize: s.integer(),
    }),
    outputSchema: gmailObject,
  }),
  action({
    name: "update_pop_settings",
    description: "Update the Gmail POP settings.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser({
      accessWindow: s.string(),
      disposition: s.string(),
    }),
    outputSchema: gmailObject,
  }),
];
