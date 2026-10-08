import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { gmailMaxAttachmentBytes, gmailMaxAttachmentCount, gmailMaxMimeBytes } from "./limits.ts";
import {
  gmailComposeScopes,
  gmailLabelScopes,
  gmailModifyScopes,
  gmailReadScopes,
  gmailSendScopes,
  gmailSettingsBasicScopes,
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
const replyToMessageId = s.string({
  minLength: 1,
  description:
    "Gmail message ID to reply to. Requires mailbox read access. If threadId is also supplied, it must match this message's thread.",
});
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

const attachmentInput = s.requireExactlyOneProperty(
  s.object(
    {
      filename: s.string({
        description: "Attachment filename. Omit for an unnamed Base64 attachment; defaults to the transit file name.",
      }),
      mimeType: s.string({
        description:
          "Attachment MIME type as type/subtype without parameters. Defaults to the transit file MIME type or application/octet-stream.",
      }),
      contentBase64: s.string({
        description:
          "Standard Base64 file content. An empty string represents a zero-byte file. Supply exactly one of contentBase64 or file.",
      }),
      file: s.transitFile("An uploaded transit file. Supply exactly one of file or contentBase64."),
      contentId: s.string({
        minLength: 1,
        description: "Bare Content-ID without cid: or angle brackets. Reference it in HTML as cid:<contentId>.",
      }),
      disposition: s.stringEnum(["inline", "attachment"], {
        description:
          "Defaults to inline when contentId is present, otherwise attachment. Inline attachments require contentId.",
      }),
    },
    { description: "An email attachment or CID inline image." },
  ),
  ["contentBase64", "file"],
);
attachmentInput.allOf = [
  {
    if: { properties: { disposition: { const: "inline" } }, required: ["disposition"] },
    then: { required: ["contentId"] },
  },
];
const attachments = s.array(attachmentInput, {
  maxItems: gmailMaxAttachmentCount,
  description: `Email attachments and CID inline images, up to ${gmailMaxAttachmentBytes} decoded bytes in total and ${gmailMaxMimeBytes} bytes for the complete MIME message. Provide file bytes or a transit file reference; HTML image conversion is performed by the caller.`,
});
const attachmentSummary = s.object(
  {
    attachmentId: s.nullable(
      s.string({ description: "Gmail attachment ID, or null when bytes are stored directly in the message part." }),
    ),
    filename: s.string({ description: "Attachment filename; empty for unnamed parts." }),
    mimeType: s.string({ description: "Attachment MIME type." }),
    size: s.integer({ minimum: 0, description: "Attachment size in bytes." }),
    partId: s.nullable(s.string({ description: "Gmail MIME part ID when supplied." })),
    contentId: s.nullable(s.string({ description: "Bare Content-ID without angle brackets, when supplied." })),
    disposition: s.nullable(
      s.stringEnum(["inline", "attachment"], { description: "Content-Disposition when supplied and recognized." }),
    ),
  },
  {
    required: ["attachmentId", "filename", "mimeType", "size", "partId", "contentId", "disposition"],
    description: "Attachment or inline resource metadata from a Gmail MIME part.",
  },
);

const messageSummaryProperties = {
  messageId,
  threadId,
  labelIds,
  subject: s.string({ description: "Message subject." }),
  sender: s.string({ description: "Message sender." }),
  to: s.string({ description: "Message recipients." }),
  messageTimestamp: s.string({ description: "Message timestamp." }),
  historyId: s.string({ description: "Gmail history ID when the resource carries one." }),
  internalDate: s.string({ description: "Gmail internal date as epoch milliseconds when present." }),
  sizeEstimate: s.integer({ description: "Estimated message size in bytes when present." }),
  snippet: s.string({ description: "Gmail snippet when present." }),
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
    messageText: s.string({
      description: "Extracted message body; HTML is preferred when both HTML and plain-text alternatives are present.",
    }),
    attachmentList: s.array(attachmentSummary, {
      description: "Message attachments and inline resources, including unnamed CID parts.",
    }),
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

const listedDraft = s.object(
  {
    id: draftId,
    message: s.union([
      message,
      s.object({ messageId, threadId }, { description: "Draft message IDs returned when verbose is false." }),
    ]),
  },
  { required: ["id", "message"], description: "Draft with message IDs or hydrated message details." },
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
  operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  outputSchema: JsonSchema;
}): ActionDefinition =>
  defineProviderAction(service, {
    name: input.name,
    operationType: input.operationType,
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
  attachments,
  fromEmail: s.string({ description: "Verified Gmail send-as alias." }),
});

const labelMutation = (): Record<string, JsonSchema> => ({
  addLabelIds: labelIds,
  removeLabelIds: labelIds,
});

export const gmailActions: ActionDefinition[] = [
  action({
    name: "download_attachment",
    operationType: "read",
    description:
      "Decode a Gmail attachment into a downloadable transit file with bounded memory. Requires the filesystem transit backend; the configured file size limit still applies.",
    requiredScopes: gmailReadScopes,
    properties: withUser({
      messageId,
      attachmentId: s.string({ minLength: 1, description: "Attachment ID from the message part body." }),
      fileName: s.string({ description: "Download name from the message part; defaults to attachment." }),
      mimeType: s.string({ description: "MIME type from the message part; defaults to application/octet-stream." }),
    }),
    required: ["messageId", "attachmentId"],
    outputSchema: s.object(
      {
        fileId: s.string(),
        downloadUrl: s.string(),
        sizeBytes: s.integer(),
        name: s.string(),
        mimeType: s.string(),
      },
      {
        required: ["fileId", "downloadUrl", "sizeBytes", "name", "mimeType"],
        description: "Completed transit file. Download bytes from downloadUrl; normal transit expiry applies.",
      },
    ),
  }),
  action({
    name: "search_threads",
    operationType: "read",
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
    operationType: "read",
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
    operationType: "read",
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
    operationType: "read",
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
    operationType: "read",
    description: "Fetch a Gmail message by message ID with a controllable response format.",
    requiredScopes: gmailReadScopes,
    properties: { messageId, format },
    required: ["messageId"],
    outputSchema: message,
  }),
  action({
    name: "fetch_message_by_thread_id",
    operationType: "read",
    description: "Fetch all messages in a Gmail thread.",
    requiredScopes: gmailReadScopes,
    properties: { threadId },
    required: ["threadId"],
    outputSchema: thread,
  }),
  action({
    name: "get_profile",
    operationType: "read",
    description: "Get the connected Gmail profile, including mailbox totals and the current historyId.",
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
    operationType: "write",
    description: "Send an email with optional attachments and CID inline images from the connected Gmail account.",
    requiredScopes: gmailSendScopes,
    properties: recipientFields(),
    outputSchema: s.object({ messageId, threadId }, { required: ["messageId"], description: "Sent message result." }),
  }),
  action({
    name: "reply_email",
    operationType: "write",
    description:
      "Reply to an existing Gmail thread using the original message's reply headers. Supply to to follow up with the recipient of your own sent message; omit it to reply to the original Reply-To or From address.",
    requiredScopes: [...gmailReadScopes, ...gmailSendScopes],
    properties: {
      threadId,
      messageId,
      to: s.email("Optional recipient email address overriding the original Reply-To or From address.", {
        minLength: 1,
      }),
      body: s.string({ description: "Reply body." }),
      isHtml: s.boolean({ description: "Whether the reply body is HTML." }),
      attachments,
    },
    required: ["threadId", "messageId", "body"],
    outputSchema: s.object({ messageId, threadId }, { required: ["messageId"], description: "Reply result." }),
  }),
  action({
    name: "reply_to_thread",
    operationType: "write",
    description:
      "Reply to the most recent non-draft message in an existing Gmail thread while preserving Gmail threading.",
    requiredScopes: [...gmailReadScopes, ...gmailSendScopes],
    properties: { threadId, ...recipientFields() },
    required: ["threadId"],
    outputSchema: s.object({ messageId, threadId }, { required: ["messageId"], description: "Thread reply result." }),
  }),
  action({
    name: "create_draft",
    operationType: "write",
    description:
      "Create a Gmail draft with optional attachments and CID inline images using simplified input fields. Returns the stable draft ID and current message and thread IDs.",
    requiredScopes: gmailComposeScopes,
    properties: {
      to: s.string(),
      subject: s.string(),
      body: s.string(),
      cc: s.union([s.string(), s.array(s.string())]),
      isHtml: s.boolean({ description: "Whether the draft body is HTML." }),
      attachments,
    },
    required: ["to", "subject", "body"],
    outputSchema: s.object(
      { draftId, messageId, threadId },
      { required: ["draftId"], description: "Created draft result." },
    ),
  }),
  action({
    name: "create_email_draft",
    operationType: "write",
    description:
      "Create a Gmail draft with optional attachments or CID inline images. Supply replyToMessageId to reply to a message, or threadId to reply to its most recent non-draft message. Threaded creation additionally requires mailbox read access. Omit subject and To recipients to inherit them from the reply target; a supplied subject must match the target, ignoring Re: prefixes.",
    requiredScopes: gmailComposeScopes,
    properties: { ...recipientFields(), threadId, replyToMessageId },
    outputSchema: s.object({ draftId, messageId, threadId }, { required: ["draftId"], description: "Created draft." }),
  }),
  action({
    name: "list_drafts",
    operationType: "read",
    description: "List Gmail drafts with pagination.",
    requiredScopes: gmailComposeScopes,
    properties: pageFields({ verbose: s.boolean({ description: "Hydrate each draft." }) }),
    outputSchema: s.object(
      { drafts: s.array(listedDraft), nextPageToken: s.nullable(pageToken) },
      { required: ["drafts"], description: "Draft list result." },
    ),
  }),
  action({
    name: "get_draft",
    operationType: "read",
    description: "Get a Gmail draft by draft ID.",
    requiredScopes: gmailComposeScopes,
    properties: { draftId, format },
    required: ["draftId"],
    outputSchema: draft,
  }),
  action({
    name: "update_draft",
    operationType: "write",
    description:
      "Update a Gmail draft while preserving omitted fields, attachments, CID inline images, and reply headers. Supply replyToMessageId or a different threadId to rebuild the reply association; this additionally requires mailbox read access. A reply draft's subject must match its reply target, ignoring Re: prefixes. Omit body to preserve existing MIME body alternatives; supply body to replace them with one text or HTML body. Omit attachments to preserve them, supply a list to replace all attachments and inline images, or [] to remove them. The draft ID stays stable, but the message ID changes on replacement.",
    requiredScopes: gmailComposeScopes,
    properties: {
      draftId,
      ...recipientFields(),
      threadId,
      replyToMessageId,
      body: s.string({
        description:
          "Replacement body. Omit to preserve all existing text and HTML alternatives; an empty string clears the body.",
      }),
      messageBody: s.string({
        description:
          "Alias for the replacement body. Omit both body fields to preserve existing MIME body alternatives.",
      }),
      isHtml: s.boolean({
        description:
          "Whether the replacement body is HTML. Omit to inherit the existing body type (HTML when an HTML alternative exists). Set false for plain text or true for HTML. Requires body or messageBody.",
      }),
      attachments: s.describe(
        attachments,
        "Omit to preserve all attachments and CID inline images. A supplied list replaces all of them; [] clears all attachments and inline images.",
      ),
    },
    required: ["draftId"],
    outputSchema: s.object({ draftId, messageId, threadId }, { required: ["draftId"], description: "Updated draft." }),
  }),
  action({
    name: "send_draft",
    operationType: "write",
    description:
      "Send an existing Gmail draft as-is. Gmail deletes the draft and returns the new sent message ID and its thread ID.",
    requiredScopes: gmailComposeScopes,
    properties: { draftId },
    required: ["draftId"],
    outputSchema: s.object(
      { messageId, threadId: s.nullable(threadId) },
      { required: ["messageId"], description: "Sent draft result." },
    ),
  }),
  action({
    name: "delete_draft",
    operationType: "destructive",
    description: "Permanently delete a Gmail draft by draft ID.",
    requiredScopes: gmailComposeScopes,
    properties: withUser({ draftId }),
    required: ["draftId"],
    outputSchema: success,
  }),
  action({
    name: "list_labels",
    operationType: "read",
    description: "List all system and user-created Gmail labels.",
    requiredScopes: gmailLabelScopes,
    properties: withUser(),
    outputSchema: s.object({ labels: s.array(label) }, { required: ["labels"], description: "Label list." }),
  }),
  action({
    name: "get_label",
    operationType: "read",
    description: "Get details for a Gmail label.",
    requiredScopes: gmailLabelScopes,
    properties: withUser({ labelId }),
    required: ["labelId"],
    outputSchema: label,
  }),
  action({
    name: "create_label",
    operationType: "write",
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
    operationType: "write",
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
    operationType: "write",
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
    operationType: "destructive",
    description: "Permanently delete a user-created Gmail label.",
    requiredScopes: gmailLabelScopes,
    properties: withUser({ labelId }),
    required: ["labelId"],
    outputSchema: success,
  }),
  action({
    name: "add_label_to_email",
    operationType: "write",
    description: "Add and/or remove labels on a single Gmail message.",
    requiredScopes: gmailModifyScopes,
    properties: withUser({ messageId, ...labelMutation() }),
    required: ["messageId"],
    outputSchema: message,
  }),
  action({
    name: "batch_modify_messages",
    operationType: "write",
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
    operationType: "destructive",
    description: "Move a Gmail message to trash.",
    requiredScopes: gmailModifyScopes,
    properties: withUser({ messageId, ...labelMutation() }),
    required: ["messageId"],
    outputSchema: message,
  }),
  action({
    name: "untrash_message",
    operationType: "write",
    description: "Restore a previously trashed Gmail message.",
    requiredScopes: gmailModifyScopes,
    properties: withUser({ messageId, ...labelMutation() }),
    required: ["messageId"],
    outputSchema: message,
  }),
  action({
    name: "modify_thread_labels",
    operationType: "destructive",
    description: "Add and/or remove labels on every message in a Gmail thread.",
    requiredScopes: gmailModifyScopes,
    properties: withUser({ threadId, ...labelMutation() }),
    required: ["threadId"],
    outputSchema: thread,
  }),
  action({
    name: "move_thread_to_trash",
    operationType: "destructive",
    description: "Move an entire Gmail thread to trash.",
    requiredScopes: gmailModifyScopes,
    properties: withUser({ threadId, ...labelMutation() }),
    required: ["threadId"],
    outputSchema: thread,
  }),
  action({
    name: "untrash_thread",
    operationType: "write",
    description: "Restore a previously trashed Gmail thread.",
    requiredScopes: gmailModifyScopes,
    properties: withUser({ threadId, ...labelMutation() }),
    required: ["threadId"],
    outputSchema: thread,
  }),
  action({
    name: "list_history",
    operationType: "read",
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
    operationType: "read",
    description: "List Gmail filters for the mailbox.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser(),
    outputSchema: s.object({ filters: s.array(filter) }, { required: ["filters"], description: "Filter list." }),
  }),
  action({
    name: "get_filter",
    operationType: "read",
    description: "Get a Gmail filter by filter ID.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser({ filterId }),
    required: ["filterId"],
    outputSchema: filter,
  }),
  action({
    name: "create_filter",
    operationType: "write",
    description: "Create a Gmail filter with matching criteria and resulting actions.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser({ criteria: gmailObject, action: gmailObject }),
    required: ["criteria", "action"],
    outputSchema: filter,
  }),
  action({
    name: "delete_filter",
    operationType: "destructive",
    description: "Permanently delete a Gmail filter by filter ID.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser({ filterId }),
    required: ["filterId"],
    outputSchema: success,
  }),
  action({
    name: "get_language_settings",
    operationType: "read",
    description: "Get the Gmail display language settings.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser(),
    outputSchema: gmailObject,
  }),
  action({
    name: "update_language_settings",
    operationType: "write",
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
    operationType: "read",
    description: "Get the Gmail vacation responder settings.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser(),
    outputSchema: gmailObject,
  }),
  action({
    name: "update_vacation_settings",
    operationType: "write",
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
    operationType: "read",
    description: "Get the current Gmail auto-forwarding configuration.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser(),
    outputSchema: gmailObject,
  }),
  action({
    name: "list_forwarding_addresses",
    operationType: "read",
    description: "List registered forwarding addresses.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser(),
    outputSchema: gmailObject,
  }),
  action({
    name: "settings_get_imap",
    operationType: "read",
    description: "Get the Gmail IMAP settings.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser(),
    outputSchema: gmailObject,
  }),
  action({
    name: "settings_get_pop",
    operationType: "read",
    description: "Get the Gmail POP settings.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser(),
    outputSchema: gmailObject,
  }),
  action({
    name: "stop_watch",
    operationType: "destructive",
    description: "Stop Gmail push watch notifications for the mailbox.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser(),
    outputSchema: success,
  }),
  action({
    name: "update_imap_settings",
    operationType: "write",
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
    operationType: "write",
    description: "Update the Gmail POP settings.",
    requiredScopes: gmailSettingsBasicScopes,
    properties: withUser({
      accessWindow: s.string(),
      disposition: s.string(),
    }),
    outputSchema: gmailObject,
  }),
];
