import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const id = (description: string) => s.string(description, { pattern: "^(0|[1-9][0-9]*)$" });
const accountId = id("The account ID returned by list_accounts, preserved as a decimal string.");
const folderId = id("The folder ID returned by list_folders.");
const messageId = id("The Zoho message ID, not the RFC Message-ID header.");
const location = { accountId, folderId, messageId };
const page = {
  start: s.integer("The one-based starting position; defaults to 1.", { minimum: 1 }),
  limit: s.integer("The page size; defaults to 10.", { minimum: 1, maximum: 200 }),
};
const output = s.object("The Zoho response, preserving additional upstream fields.", {
  data: s.unknown("The upstream result data, or null for operations without result data."),
});
const listOutput = s.object("One page of Zoho resources.", {
  items: s.array(
    "The resources returned by Zoho.",
    s.looseObject("An upstream resource with additional fields preserved."),
  ),
});
const attachments = s.array(
  "Attachments downloaded from public URLs and uploaded before sending. Each file is limited to 20 MiB by the connector.",
  s.object("An attachment to upload.", {
    fileUrl: s.string("A publicly accessible HTTP or HTTPS download URL.", { format: "uri" }),
    fileName: s.nonEmptyString("The attachment file name without a directory path."),
  }),
);
const compose = {
  accountId,
  fromAddress: s.nonEmptyString("The sender address belonging to the authenticated account."),
  toAddress: s.nonEmptyString("The recipient email addresses in Zoho's address-list format."),
  ccAddress: s.string("The Cc recipient addresses."),
  bccAddress: s.string("The Bcc recipient addresses."),
  subject: s.string("The message subject."),
  content: s.string("The message body in the selected mail format."),
  mailFormat: s.stringEnum("The body format; Zoho defaults to html.", ["html", "plaintext"]),
  askReceipt: s.stringEnum("Whether to request a read receipt.", ["yes", "no"]),
  encoding: s.stringEnum("The body character encoding; defaults to UTF-8.", [
    "Big5",
    "EUC-JP",
    "EUC-KR",
    "GB2312",
    "ISO-2022-JP",
    "ISO-8859-1",
    "KOI8-R",
    "Shift_JIS",
    "US-ASCII",
    "UTF-8",
    "WINDOWS-1251",
    "X-WINDOWS-ISO2022JP",
  ]),
  attachments,
};
const schedule = {
  isSchedule: s.boolean("Whether to schedule delivery instead of sending immediately."),
  scheduleType: s.integer(
    "Schedule preset: 1 one hour, 2 two hours, 3 four hours, 4 tomorrow morning, 5 tomorrow afternoon, 6 custom time.",
    { minimum: 1, maximum: 6 },
  ),
  timeZone: s.string("The Zoho scheduling timezone, such as GMT 5:30; required for custom time."),
  scheduleTime: s.string("Custom delivery date and time in MM/DD/YYYY HH:MM:SS format."),
};
const targets = {
  accountId,
  messageId: s.array("Message IDs to update.", id("A message ID."), { minItems: 1 }),
  threadId: s.array("Thread IDs to update instead of individual messages.", id("A thread ID."), {
    minItems: 1,
  }),
};

export const zohoMailActions: ActionDefinition[] = [
  defineProviderAction("zoho_mail", {
    name: "list_accounts",
    description: "List the authenticated user's Zoho Mail accounts and discover account IDs.",
    inputSchema: s.object("Account discovery.", {}, { required: [] }),
    requiredScopes: ["ZohoMail.accounts.READ"],
    operationType: "read",
    outputSchema: listOutput,
  }),
  defineProviderAction("zoho_mail", {
    name: "list_folders",
    description: "List folders in a Zoho Mail account.",
    inputSchema: s.object("Folder lookup.", { accountId }, { required: ["accountId"] }),
    requiredScopes: ["ZohoMail.folders.READ"],
    operationType: "read",
    outputSchema: listOutput,
  }),
  defineProviderAction("zoho_mail", {
    name: "list_messages",
    description: "List a page of emails with folder, status, label, thread and sorting filters.",
    inputSchema: s.object(
      "Message listing filters.",
      {
        accountId,
        folderId,
        ...page,
        status: s.stringEnum("Filter by read state.", ["read", "unread", "all"]),
        flagid: s.integer("Flag: 0 unset, 1 info, 2 important, 3 followup.", {
          minimum: 0,
          maximum: 3,
        }),
        labelid: id("Filter by label ID."),
        threadId: id("Filter by thread ID."),
        sortBy: s.stringEnum("The sort field.", ["date", "messageId", "size"]),
        sortorder: s.boolean("True for ascending order; false for descending order."),
        includeto: s.boolean("Include To recipient details."),
        includesent: s.boolean("Include sent messages."),
        includearchive: s.boolean("Include archived messages."),
        attachedMails: s.boolean("Only messages with attachments."),
        inlinedMails: s.boolean("Only messages with inline images."),
        flaggedMails: s.boolean("Only flagged messages."),
        respondedMails: s.boolean("Only messages with replies."),
        threadedMails: s.boolean("Only messages belonging to conversations."),
      },
      { required: ["accountId"] },
    ),
    requiredScopes: ["ZohoMail.messages.READ"],
    operationType: "read",
    outputSchema: listOutput,
  }),
  defineProviderAction("zoho_mail", {
    name: "search_messages",
    description: "Search emails using Zoho Mail search syntax and one-based pagination.",
    inputSchema: s.object(
      "Message search.",
      {
        accountId,
        ...page,
        searchKey: s.nonEmptyString("Zoho Mail search expression, such as newMails or from:sender@example.com."),
        receivedTime: s.integer(
          "Only retrieve emails received before this Unix timestamp in milliseconds. Zoho defaults to two minutes before now.",
        ),
        includeto: s.boolean("Include To recipient details."),
      },
      { required: ["accountId", "searchKey"] },
    ),
    requiredScopes: ["ZohoMail.messages.READ"],
    operationType: "read",
    outputSchema: listOutput,
  }),
  defineProviderAction("zoho_mail", {
    name: "get_message",
    description: "Get email metadata such as subject, recipients and received time.",
    inputSchema: s.object("Message location.", location, { required: Object.keys(location) }),
    requiredScopes: ["ZohoMail.messages.READ"],
    operationType: "read",
    outputSchema: output,
  }),
  defineProviderAction("zoho_mail", {
    name: "get_message_content",
    description: "Read the email body, optionally including quoted block content.",
    inputSchema: s.object(
      "Message content lookup.",
      {
        ...location,
        includeBlockContent: s.boolean("Include quoted block content alongside the original body."),
      },
      { required: Object.keys(location) },
    ),
    requiredScopes: ["ZohoMail.messages.READ"],
    operationType: "read",
    outputSchema: output,
  }),
  defineProviderAction("zoho_mail", {
    name: "get_message_headers",
    description: "Retrieve email headers, including RFC Message-ID values needed for reply drafts.",
    inputSchema: s.object("Message header lookup.", location, { required: Object.keys(location) }),
    requiredScopes: ["ZohoMail.messages.READ"],
    operationType: "read",
    outputSchema: output,
  }),
  defineProviderAction("zoho_mail", {
    name: "send_message",
    description: "Send or schedule an email, uploading URL attachments automatically.",
    inputSchema: s.object(
      "Email composition and scheduling.",
      { ...compose, ...schedule },
      { required: ["accountId", "fromAddress", "toAddress"] },
    ),
    requiredScopes: ["ZohoMail.messages.CREATE"],
    operationType: "write",
    outputSchema: output,
  }),
  defineProviderAction("zoho_mail", {
    name: "reply_message",
    description: "Reply to an existing email, optionally scheduling delivery and uploading URL attachments.",
    inputSchema: s.object(
      "Reply composition.",
      { ...compose, ...schedule, messageId },
      { required: ["accountId", "messageId", "fromAddress", "toAddress"] },
    ),
    requiredScopes: ["ZohoMail.messages.CREATE"],
    operationType: "write",
    outputSchema: output,
  }),
  defineProviderAction("zoho_mail", {
    name: "save_draft",
    description: "Save an email as a draft or template, including optional reply-thread headers.",
    inputSchema: s.object(
      "Draft or template composition.",
      {
        ...compose,
        mode: s.stringEnum("Save as a draft (default) or template.", ["draft", "template"]),
        inReplyTo: s.string("The RFC Message-ID header of the email being replied to; required for reply drafts."),
        refHeader: s.string(
          "Space-separated RFC Message-ID headers in chronological order for an existing reply thread.",
        ),
      },
      { required: ["accountId", "fromAddress", "toAddress"] },
    ),
    requiredScopes: ["ZohoMail.messages.CREATE"],
    operationType: "write",
    outputSchema: output,
  }),
  defineProviderAction("zoho_mail", {
    name: "set_read_state",
    description: "Mark messages or threads as read or unread.",
    inputSchema: s.object(
      "Read-state update.",
      { ...targets, read: s.boolean("True marks read; false marks unread.") },
      { required: ["accountId", "read"] },
    ),
    requiredScopes: ["ZohoMail.messages.UPDATE"],
    operationType: "write",
    outputSchema: output,
  }),
  defineProviderAction("zoho_mail", {
    name: "move_messages",
    description: "Move messages or threads into another folder.",
    inputSchema: s.object(
      "Message move.",
      {
        ...targets,
        destfolderId: id("The destination folder ID."),
        folderId,
        isFolderSpecific: s.boolean("Restrict the move to folderId; requires folderId when true."),
        isArchive: s.boolean("Include archived messages in addition to non-archived messages."),
      },
      { required: ["accountId", "destfolderId"] },
    ),
    requiredScopes: ["ZohoMail.messages.UPDATE"],
    operationType: "write",
    outputSchema: output,
  }),
  defineProviderAction("zoho_mail", {
    name: "list_attachments",
    description: "Get attachment metadata, optionally including inline images.",
    inputSchema: s.object(
      "Attachment lookup.",
      { ...location, includeInline: s.boolean("Include inline image metadata.") },
      { required: Object.keys(location) },
    ),
    requiredScopes: ["ZohoMail.messages.READ"],
    operationType: "read",
    outputSchema: output,
  }),
  defineProviderAction("zoho_mail", {
    name: "download_attachment",
    description:
      "Download an email attachment to a temporary file URL. Requires configured file transit; connector limit is 20 MiB.",
    inputSchema: s.object(
      "Attachment download.",
      {
        ...location,
        attachmentId: id("The attachment ID returned by list_attachments."),
        fileName: s.nonEmptyString("The output file name returned by list_attachments."),
      },
      { required: [...Object.keys(location), "attachmentId", "fileName"] },
    ),
    requiredScopes: ["ZohoMail.messages.READ"],
    operationType: "read",
    outputSchema: s.object("The downloaded attachment.", {
      fileId: s.string("Transit file ID."),
      downloadUrl: s.string("The temporary file-transit download URL."),
      name: s.string("The attachment file name."),
      mimeType: s.string("The attachment MIME type."),
      sizeBytes: s.integer("The attachment size in bytes."),
    }),
  }),
];
