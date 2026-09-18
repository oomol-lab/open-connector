import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  outlookProviderScopes,
  outlookReadScopes,
  outlookSendScopes,
  outlookSettingsReadScopes,
  outlookSettingsWriteScopes,
  outlookWriteScopes,
} from "./scopes.ts";

const service = "outlook";

interface OutlookActionSource {
  name: string;
  operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  providerPermissions: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const rawObject = s.record(true, { description: "A generic JSON object returned by Microsoft Graph." });
const nonEmptyString = (description: string): JsonSchema => s.string({ minLength: 1, description });
const stringArray = (description: string): JsonSchema =>
  s.array(nonEmptyString("A string value."), { minItems: 1, description });
const recipient = s.anyOf(
  [
    nonEmptyString("Recipient email address."),
    s.object(
      {
        address: nonEmptyString("Recipient email address."),
        name: s.string({ description: "Recipient display name." }),
      },
      { required: ["address"], description: "Recipient object with optional display name." },
    ),
  ],
  { description: "Recipient email address or recipient object with display name." },
);
const recipientList = (description: string): JsonSchema => s.array(recipient, { description });
const bodyContentType = s.stringEnum(["text", "html"], {
  description: "Preferred Outlook body content type for the response.",
});
const importance = s.stringEnum(["low", "normal", "high"], { description: "Message importance." });
const messageId = nonEmptyString("Outlook message ID.");
const mailFolderId = nonEmptyString("Outlook mail folder ID.");
const nextLink = s.url("Opaque pagination URL returned by a previous Outlook response.");
const outlookUser = s.looseObject(
  {
    id: nonEmptyString("Unique identifier for the current account."),
    displayName: s.string({ description: "Display name of the current account." }),
    mail: s.nullableString("Primary SMTP address for the current account."),
    userPrincipalName: s.string({ description: "User principal name for the current account." }),
  },
  { description: "Current Outlook account profile." },
);
const outlookMessage = s.looseObject(
  {
    id: nonEmptyString("Message ID."),
    subject: s.string({ description: "Message subject." }),
    bodyPreview: s.string({ description: "Preview snippet of the message body." }),
    importance: s.string({ description: "Message importance." }),
    isRead: s.boolean({ description: "Whether the message is marked as read." }),
    isDraft: s.boolean({ description: "Whether the message is a draft." }),
    webLink: s.string({ description: "Web URL for the message in Outlook." }),
    body: rawObject,
    sender: rawObject,
    from: rawObject,
    toRecipients: s.array(rawObject, { description: "Primary recipients." }),
    ccRecipients: s.array(rawObject, { description: "Cc recipients." }),
    bccRecipients: s.array(rawObject, { description: "Bcc recipients." }),
    replyTo: s.array(rawObject, { description: "Reply-to recipients." }),
    flag: rawObject,
  },
  { description: "Outlook message resource." },
);
const mailFolder = s.looseObject(
  {
    id: nonEmptyString("Mail folder ID."),
    displayName: nonEmptyString("Display name for the mail folder."),
    parentFolderId: s.string({ description: "Parent mail folder ID." }),
    childFolderCount: s.integer({ description: "Number of child folders." }),
    unreadItemCount: s.integer({ description: "Unread item count." }),
    totalItemCount: s.integer({ description: "Total item count." }),
    isHidden: s.boolean({ description: "Whether the folder is hidden." }),
  },
  { description: "Outlook mail folder resource." },
);
const mailboxSettings = s.looseObject(
  {
    automaticRepliesSetting: rawObject,
    timeZone: s.string({ description: "Preferred mailbox time zone." }),
    language: rawObject,
    workingHours: rawObject,
    userPurpose: rawObject,
    dateFormat: s.string({ description: "Preferred date format." }),
    timeFormat: s.string({ description: "Preferred time format." }),
    delegateMeetingMessageDeliveryOptions: s.string({ description: "Delegate meeting-message delivery behavior." }),
  },
  { description: "Mailbox settings for the current Outlook account." },
);
const success = s.object(
  {
    success: s.literal(true, { description: "Whether the Outlook operation completed successfully." }),
  },
  { required: ["success"], description: "Successful Outlook mutation acknowledgement." },
);

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, "Outlook action input.");
}

const messageWriteFields = {
  subject: s.string({ description: "Subject line for the message." }),
  body: s.string({ description: "Body content for the message." }),
  isHtml: s.boolean({ description: "Whether the message body is already HTML content." }),
  toRecipients: recipientList("Primary recipients for the message."),
  ccRecipients: recipientList("Cc recipients for the message."),
  bccRecipients: recipientList("Bcc recipients for the message."),
  replyTo: recipientList("Reply-to recipients for the message."),
  importance,
  categories: stringArray("Categories for the message."),
};
const listMessagesOutput = s.object(
  {
    messages: s.array(outlookMessage, { description: "Messages returned by Outlook." }),
    nextLink: s.nullableString("Pagination URL for the next page, or null when there is no next page."),
  },
  { required: ["messages", "nextLink"], description: "Outlook message list response." },
);
const listFoldersOutput = s.object(
  {
    mailFolders: s.array(mailFolder, { description: "Root-level mail folders returned by Outlook." }),
    nextLink: s.nullableString("Pagination URL for the next page, or null when there is no next page."),
  },
  { required: ["mailFolders", "nextLink"], description: "Outlook mail folder list response." },
);
const actions: OutlookActionSource[] = [
  action(
    "get_profile",
    "read",
    "Get the current Outlook account profile from Microsoft Graph so you can identify the connected mailbox.",
    outlookReadScopes,
    [outlookProviderScopes.userRead],
    input({}),
    outlookUser,
  ),
  action(
    "list_mail_folders",
    "read",
    "List the root-level Outlook mail folders for the connected mailbox, with optional hidden folders and field selection.",
    outlookReadScopes,
    [outlookProviderScopes.mailReadWrite],
    input({
      nextLink,
      includeHiddenFolders: s.boolean({ description: "Whether to include hidden mail folders." }),
      top: s.integer({ minimum: 1, maximum: 1000, description: "Maximum number of mail folders to return." }),
      select: stringArray("Mail folder fields to request from Microsoft Graph."),
    }),
    listFoldersOutput,
  ),
  action(
    "list_messages",
    "read",
    "List Outlook messages from the mailbox or from a specific mail folder, with support for OData filters, sorting, field selection, and pagination.",
    outlookReadScopes,
    [outlookProviderScopes.mailReadWrite],
    input({
      mailFolderId,
      top: s.integer({ minimum: 1, maximum: 1000, description: "Maximum number of messages to return." }),
      filter: s.string({
        description:
          "OData filter expression for the messages query. When combined with orderby, include every orderby property first, in the same order. Example: receivedDateTime ge 2026-01-01T00:00:00Z and isRead eq false.",
      }),
      orderby: s.string({
        description:
          "OData orderby expression for the messages query. When combined with filter, every ordered property must appear first in the filter and in the same order. Example: receivedDateTime desc.",
      }),
      select: stringArray("Message fields to request from Microsoft Graph."),
      nextLink,
      bodyContentType,
    }),
    listMessagesOutput,
  ),
  action(
    "get_message",
    "read",
    "Get a single Outlook message by message ID, including message metadata and optional body formatting.",
    outlookReadScopes,
    [outlookProviderScopes.mailReadWrite],
    input({ messageId, select: stringArray("Message fields to request from Microsoft Graph."), bodyContentType }, [
      "messageId",
    ]),
    outlookMessage,
  ),
  action(
    "create_draft",
    "write",
    "Create a new Outlook draft message with subject, body, recipients, and other writable message properties.",
    outlookWriteScopes,
    [outlookProviderScopes.mailReadWrite],
    input(messageWriteFields, ["subject", "body"]),
    outlookMessage,
  ),
  action(
    "update_draft",
    "write",
    "Update an existing Outlook draft message before sending.",
    outlookWriteScopes,
    [outlookProviderScopes.mailReadWrite],
    input({ messageId, ...messageWriteFields }, ["messageId"]),
    outlookMessage,
  ),
  action(
    "send_draft",
    "write",
    "Send an existing Outlook draft message by message ID.",
    outlookSendScopes,
    [outlookProviderScopes.mailSend],
    input({ messageId }, ["messageId"]),
    success,
  ),
  action(
    "send_email",
    "write",
    "Send a new Outlook email in a single operation, without creating a standalone draft first.",
    outlookSendScopes,
    [outlookProviderScopes.mailSend],
    input(
      {
        ...messageWriteFields,
        saveToSentItems: s.boolean({ description: "Whether to save the sent message in Sent Items." }),
      },
      ["subject", "body"],
    ),
    success,
  ),
  action(
    "reply_email",
    "write",
    "Reply to an existing Outlook message with either a comment or a replacement body, and optionally add more recipients to the reply.",
    outlookSendScopes,
    [outlookProviderScopes.mailSend],
    input(
      {
        messageId,
        comment: s.string({ description: "Comment to include with the reply." }),
        body: s.string({ description: "Reply body content." }),
        isHtml: s.boolean({ description: "Whether the reply body is already HTML content." }),
        toRecipients: recipientList("Additional primary recipients for the reply."),
        ccRecipients: recipientList("Additional Cc recipients for the reply."),
        bccRecipients: recipientList("Additional Bcc recipients for the reply."),
      },
      ["messageId"],
    ),
    success,
  ),
  action(
    "get_mailbox_settings",
    "read",
    "Get the current Outlook mailbox settings, including automatic replies, locale, time zone, and working hours.",
    outlookSettingsReadScopes,
    [outlookProviderScopes.mailboxSettingsReadWrite],
    input({}),
    mailboxSettings,
  ),
  action(
    "update_mailbox_settings",
    "write",
    "Update Outlook mailbox settings such as automatic replies, locale, time zone, working hours, and date or time formatting.",
    outlookSettingsWriteScopes,
    [outlookProviderScopes.mailboxSettingsReadWrite],
    input({
      automaticRepliesSetting: rawObject,
      dateFormat: s.string({ description: "Updated date format." }),
      delegateMeetingMessageDeliveryOptions: s.stringEnum(
        ["sendToDelegateAndInformationToPrincipal", "sendToDelegateAndPrincipal", "sendToDelegateOnly"],
        { description: "Updated delegate meeting-message delivery behavior." },
      ),
      language: rawObject,
      timeFormat: s.string({ description: "Updated time format." }),
      timeZone: s.string({ description: "Updated mailbox time zone." }),
      workingHours: rawObject,
    }),
    mailboxSettings,
  ),
];

export const outlookActions: ActionDefinition[] = actions.map((item) => defineProviderAction(service, item));

function action(
  name: string,
  operationType: ActionDefinition["operationType"],
  description: string,
  requiredScopes: string[],
  providerPermissions: string[],
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): OutlookActionSource {
  return { name, operationType, description, requiredScopes, providerPermissions, inputSchema, outputSchema };
}
