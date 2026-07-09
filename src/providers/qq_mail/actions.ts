import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "qq_mail" as const;

const emailAddressSchema = s.string({
  description: "An email address.",
  format: "email",
  minLength: 1,
});
const emailAddressArraySchema = (description: string) => s.array(description, emailAddressSchema, { minItems: 1 });
const nonEmptyStringSchema = (description: string) => s.nonEmptyString(description);
const nullableStringSchema = (description: string) => s.nullableString(description);
const nullableIntegerSchema = (description: string) => s.nullableInteger(description);
const folderSchema = s.nonEmptyString("The IMAP folder path returned by list_folders.", {
  default: "INBOX",
});
const limitSchema = s.integer("The maximum number of email summaries to return.", {
  minimum: 1,
  maximum: 100,
  default: 20,
});
const uidSchema = s.positiveInteger("The IMAP UID of the message.");
const attachmentIdSchema = nonEmptyStringSchema(
  "The IMAP body part identifier returned in an attachment metadata item.",
);

const addressSchema = s.requiredObject("A normalized email address.", {
  name: nullableStringSchema("The display name when one was provided."),
  email: nullableStringSchema("The email address when one was provided."),
});

const attachmentSchema = s.requiredObject("Attachment metadata without attachment content.", {
  attachmentId: attachmentIdSchema,
  filename: nullableStringSchema("The attachment filename when available."),
  contentType: nullableStringSchema("The attachment MIME content type when available."),
  size: nullableIntegerSchema("The attachment size in bytes when available."),
  contentId: nullableStringSchema("The attachment Content-ID when available."),
});

const outgoingAttachmentSchema = s.object(
  "An attachment to fetch and include in an outgoing email.",
  {
    filename: nonEmptyStringSchema("The filename to use for the outgoing attachment."),
    contentType: nonEmptyStringSchema("The MIME content type of the attachment."),
    contentUrl: s.url("The public HTTP or HTTPS URL to fetch attachment content from."),
  },
  { optional: ["contentType"] },
);

const outgoingAttachmentsSchema = s.array(
  "Attachments to fetch and include in the outgoing email.",
  outgoingAttachmentSchema,
  { minItems: 1, maxItems: 10 },
);

const transitFileSchema = s.requiredObject("A file uploaded to local transit file storage.", {
  fileId: nonEmptyStringSchema("The local transit file identifier."),
  downloadUrl: s.url("The local transit URL for downloading the file."),
  name: nonEmptyStringSchema("The file name used in transit storage."),
  mimeType: nonEmptyStringSchema("The file MIME type."),
  sizeBytes: s.integer("The stored file size in bytes.", { minimum: 0 }),
});

const messageSummarySchema = s.requiredObject("A lightweight QQ Mail message summary.", {
  uid: uidSchema,
  messageId: nullableStringSchema("The Message-ID header when available."),
  subject: nullableStringSchema("The email subject when available."),
  from: s.nullable(addressSchema),
  to: s.array("The primary recipients parsed from the message envelope.", addressSchema),
  date: s.nullable(s.dateTime("The message date as an ISO 8601 timestamp.")),
  flags: s.array("The IMAP flags currently set on the message.", s.string("One IMAP flag.")),
  seen: s.boolean("Whether the message has the IMAP Seen flag."),
  hasAttachments: s.boolean("Whether the message has attachment parts."),
  size: nullableIntegerSchema("The message size in bytes when available."),
});

const sendEmailInputBaseSchema = s.object(
  "The input payload for sending an email through QQ Mail SMTP.",
  {
    to: emailAddressArraySchema("The primary recipient email addresses."),
    cc: emailAddressArraySchema("The carbon-copy recipient email addresses."),
    bcc: emailAddressArraySchema("The blind-carbon-copy recipient email addresses."),
    replyTo: emailAddressSchema,
    subject: s.string("The email subject."),
    text: s.string("The plain text email body."),
    html: s.string("The HTML email body."),
    attachments: outgoingAttachmentsSchema,
  },
  { optional: ["cc", "bcc", "replyTo", "text", "html", "attachments"] },
);

const sendEmailInputSchema = {
  ...sendEmailInputBaseSchema,
  anyOf: [{ required: ["text"] }, { required: ["html"] }],
} satisfies JsonSchema;

const sendEmailOutputSchema = s.requiredObject("The response returned after sending a QQ Mail email.", {
  messageId: nullableStringSchema("The SMTP Message-ID returned by the mail client."),
  accepted: s.array("Recipient addresses accepted by the SMTP server.", emailAddressSchema),
  rejected: s.array("Recipient addresses rejected by the SMTP server.", emailAddressSchema),
  response: s.string("The SMTP response text returned by the server."),
});

const folderSummarySchema = s.requiredObject("A QQ Mail IMAP folder summary.", {
  path: nonEmptyStringSchema("The canonical IMAP mailbox path to pass back into folder inputs."),
  name: nonEmptyStringSchema("The decoded display name for the folder."),
  delimiter: nullableStringSchema("The mailbox hierarchy delimiter when available."),
  flags: s.array("The IMAP flags attached to this mailbox.", s.string("One IMAP mailbox flag.")),
  specialUse: nullableStringSchema("The special-use mailbox flag when available."),
});

const listFoldersAction: ProviderActionDefinition<"list_folders"> = defineProviderAction(service, {
  name: "list_folders",
  description: "List folders visible to the connected QQ Mail account.",
  requiredScopes: ["mail.read"],
  inputSchema: s.object("The input payload for listing QQ Mail folders.", {}),
  outputSchema: s.requiredObject("The response returned when listing QQ Mail folders.", {
    folders: s.array("The folders returned by QQ Mail IMAP.", folderSummarySchema),
  }),
});

const sendEmailAction: ProviderActionDefinition<"send_email"> = defineProviderAction(service, {
  name: "send_email",
  description: "Send an email through QQ Mail SMTP.",
  requiredScopes: ["mail.send"],
  inputSchema: sendEmailInputSchema,
  outputSchema: sendEmailOutputSchema,
});

const searchEmailsAction: ProviderActionDefinition<"search_emails"> = defineProviderAction(service, {
  name: "search_emails",
  description: "Search one QQ Mail folder and return lightweight email summaries.",
  requiredScopes: ["mail.read"],
  inputSchema: s.object(
    "The input payload for searching QQ Mail emails.",
    {
      folder: folderSchema,
      unseen: s.boolean("Whether to return only unread messages."),
      from: nonEmptyStringSchema("A sender search term."),
      to: nonEmptyStringSchema("A recipient search term."),
      subject: nonEmptyStringSchema("A subject search term."),
      text: nonEmptyStringSchema("A body text search term."),
      since: s.date("Only include messages on or after this YYYY-MM-DD date."),
      before: s.date("Only include messages before this YYYY-MM-DD date."),
      limit: limitSchema,
      beforeUid: s.positiveInteger("Only include message UIDs lower than this cursor."),
    },
    {
      optional: ["folder", "unseen", "from", "to", "subject", "text", "since", "before", "limit", "beforeUid"],
    },
  ),
  outputSchema: s.requiredObject("The response returned when searching QQ Mail emails.", {
    folder: nonEmptyStringSchema("The IMAP folder path that was searched."),
    emails: s.array("The email summaries returned for this page.", messageSummarySchema),
    nextBeforeUid: s.nullable(s.positiveInteger("The cursor to pass as beforeUid for the next page.")),
  }),
});

const getEmailAction: ProviderActionDefinition<"get_email"> = defineProviderAction(service, {
  name: "get_email",
  description: "Fetch and parse one QQ Mail message without marking it as read.",
  requiredScopes: ["mail.read"],
  inputSchema: s.object(
    "The input payload for fetching one QQ Mail email.",
    {
      folder: folderSchema,
      uid: uidSchema,
    },
    { optional: ["folder"] },
  ),
  outputSchema: s.requiredObject("The response returned when fetching one QQ Mail email.", {
    folder: nonEmptyStringSchema("The IMAP folder path that contained the message."),
    uid: uidSchema,
    messageId: nullableStringSchema("The Message-ID header when available."),
    subject: nullableStringSchema("The email subject when available."),
    from: s.nullable(addressSchema),
    to: s.array("The primary recipients parsed from the message.", addressSchema),
    cc: s.array("The carbon-copy recipients parsed from the message.", addressSchema),
    date: s.nullable(s.dateTime("The message date as an ISO 8601 timestamp.")),
    flags: s.array("The IMAP flags currently set on the message.", s.string("One IMAP flag.")),
    seen: s.boolean("Whether the message has the IMAP Seen flag."),
    text: nullableStringSchema("The parsed plain text body within the fetch budget."),
    html: nullableStringSchema("The parsed HTML body within the fetch budget."),
    truncated: s.boolean("Whether returned body content was truncated or omitted by budget."),
    attachments: s.array("Attachment metadata parsed from the message.", attachmentSchema),
  }),
});

const downloadAttachmentAction: ProviderActionDefinition<"download_attachment"> = defineProviderAction(service, {
  name: "download_attachment",
  description: "Download one QQ Mail attachment by IMAP body part identifier.",
  requiredScopes: ["mail.read"],
  inputSchema: s.object(
    "The input payload for downloading one QQ Mail attachment.",
    {
      folder: folderSchema,
      uid: uidSchema,
      attachmentId: attachmentIdSchema,
    },
    { optional: ["folder"] },
  ),
  outputSchema: s.requiredObject("The response returned when downloading one QQ Mail attachment.", {
    folder: nonEmptyStringSchema("The IMAP folder path that contained the message."),
    uid: uidSchema,
    attachmentId: attachmentIdSchema,
    size: nullableIntegerSchema("The attachment size in bytes when available."),
    file: transitFileSchema,
  }),
});

const markEmailReadAction: ProviderActionDefinition<"mark_email_read"> = defineProviderAction(service, {
  name: "mark_email_read",
  description: "Mark one QQ Mail message as read.",
  requiredScopes: ["mail.modify"],
  inputSchema: s.object(
    "The input payload for marking one QQ Mail email as read.",
    {
      folder: folderSchema,
      uid: uidSchema,
    },
    { optional: ["folder"] },
  ),
  outputSchema: s.requiredObject("The response returned after marking one QQ Mail email as read.", {
    folder: nonEmptyStringSchema("The IMAP folder path that contained the message."),
    uid: uidSchema,
    read: s.literal(true, { description: "Whether the message is now marked as read." }),
  }),
});

const markEmailUnreadAction: ProviderActionDefinition<"mark_email_unread"> = defineProviderAction(service, {
  name: "mark_email_unread",
  description: "Mark one QQ Mail message as unread.",
  requiredScopes: ["mail.modify"],
  inputSchema: s.object(
    "The input payload for marking one QQ Mail email as unread.",
    {
      folder: folderSchema,
      uid: uidSchema,
    },
    { optional: ["folder"] },
  ),
  outputSchema: s.requiredObject("The response returned after marking one QQ Mail email as unread.", {
    folder: nonEmptyStringSchema("The IMAP folder path that contained the message."),
    uid: uidSchema,
    read: s.literal(false, { description: "Whether the message is now marked as read." }),
  }),
});

const moveEmailAction: ProviderActionDefinition<"move_email"> = defineProviderAction(service, {
  name: "move_email",
  description: "Move one QQ Mail message to another folder.",
  requiredScopes: ["mail.modify"],
  inputSchema: s.object(
    "The input payload for moving one QQ Mail email.",
    {
      folder: folderSchema,
      uid: uidSchema,
      targetFolder: nonEmptyStringSchema("The destination IMAP folder path."),
    },
    { optional: ["folder"] },
  ),
  outputSchema: s.requiredObject("The response returned after moving one QQ Mail email.", {
    folder: nonEmptyStringSchema("The source IMAP folder path."),
    targetFolder: nonEmptyStringSchema("The destination IMAP folder path."),
    uid: uidSchema,
    moved: s.literal(true, { description: "Whether the message was moved." }),
  }),
});

const deleteEmailAction: ProviderActionDefinition<"delete_email"> = defineProviderAction(service, {
  name: "delete_email",
  description: "Delete one QQ Mail message from a folder.",
  requiredScopes: ["mail.modify"],
  inputSchema: s.object(
    "The input payload for deleting one QQ Mail email.",
    {
      folder: folderSchema,
      uid: uidSchema,
    },
    { optional: ["folder"] },
  ),
  outputSchema: s.requiredObject("The response returned after deleting one QQ Mail email.", {
    folder: nonEmptyStringSchema("The IMAP folder path that contained the message."),
    uid: uidSchema,
    deleted: s.literal(true, { description: "Whether the message was deleted." }),
  }),
});

const folderStatusAction: ProviderActionDefinition<"get_folder_status"> = defineProviderAction(service, {
  name: "get_folder_status",
  description: "Get lightweight message counters for one QQ Mail folder.",
  requiredScopes: ["mail.read"],
  inputSchema: s.object(
    "The input payload for reading one QQ Mail folder status.",
    {
      folder: folderSchema,
    },
    { optional: ["folder"] },
  ),
  outputSchema: s.requiredObject("The response returned when reading one QQ Mail folder status.", {
    folder: nonEmptyStringSchema("The IMAP folder path that was checked."),
    messages: nullableIntegerSchema("The total number of messages when available."),
    recent: nullableIntegerSchema("The number of recent messages when available."),
    unseen: nullableIntegerSchema("The number of unread messages when available."),
    uidNext: nullableIntegerSchema("The next predicted IMAP UID when available."),
    uidValidity: nullableStringSchema("The mailbox UIDVALIDITY value when available."),
  }),
});

const replyEmailInputBaseSchema = s.object(
  "The input payload for replying to one QQ Mail email.",
  {
    folder: folderSchema,
    uid: uidSchema,
    to: emailAddressArraySchema("Override reply recipient email addresses."),
    cc: emailAddressArraySchema("Override carbon-copy recipient email addresses."),
    bcc: emailAddressArraySchema("Blind-carbon-copy recipient email addresses."),
    replyAll: s.boolean({
      description: "Whether to include original To and Cc recipients except the connected account.",
      default: false,
    }),
    subject: s.string("Override reply email subject."),
    text: s.string("The plain text reply body."),
    html: s.string("The HTML reply body."),
    attachments: outgoingAttachmentsSchema,
  },
  {
    optional: ["folder", "to", "cc", "bcc", "replyAll", "subject", "text", "html", "attachments"],
  },
);

const replyEmailInputSchema = {
  ...replyEmailInputBaseSchema,
  anyOf: [{ required: ["text"] }, { required: ["html"] }],
} satisfies JsonSchema;

const replyEmailAction: ProviderActionDefinition<"reply_email"> = defineProviderAction(service, {
  name: "reply_email",
  description: "Reply to one QQ Mail email using SMTP reply headers and quoted content.",
  requiredScopes: ["mail.read", "mail.send"],
  inputSchema: replyEmailInputSchema,
  outputSchema: sendEmailOutputSchema,
});

const forwardEmailAction: ProviderActionDefinition<"forward_email"> = defineProviderAction(service, {
  name: "forward_email",
  description: "Forward one QQ Mail email using SMTP with quoted original content.",
  requiredScopes: ["mail.read", "mail.send"],
  inputSchema: s.object(
    "The input payload for forwarding one QQ Mail email.",
    {
      folder: folderSchema,
      uid: uidSchema,
      to: emailAddressArraySchema("The forwarding recipient email addresses."),
      cc: emailAddressArraySchema("The carbon-copy recipient email addresses."),
      bcc: emailAddressArraySchema("The blind-carbon-copy recipient email addresses."),
      subject: s.string("Override forward email subject."),
      text: s.string("Additional plain text content to prepend before the forwarded message."),
      html: s.string("Additional HTML content to prepend before the forwarded message."),
      attachments: outgoingAttachmentsSchema,
    },
    { optional: ["folder", "cc", "bcc", "subject", "text", "html", "attachments"] },
  ),
  outputSchema: sendEmailOutputSchema,
});

type QqMailAction =
  | typeof sendEmailAction
  | typeof listFoldersAction
  | typeof searchEmailsAction
  | typeof getEmailAction
  | typeof downloadAttachmentAction
  | typeof markEmailReadAction
  | typeof markEmailUnreadAction
  | typeof moveEmailAction
  | typeof deleteEmailAction
  | typeof folderStatusAction
  | typeof replyEmailAction
  | typeof forwardEmailAction;

export const qqMailActions: readonly QqMailAction[] = [
  sendEmailAction,
  listFoldersAction,
  searchEmailsAction,
  getEmailAction,
  downloadAttachmentAction,
  markEmailReadAction,
  markEmailUnreadAction,
  moveEmailAction,
  deleteEmailAction,
  folderStatusAction,
  replyEmailAction,
  forwardEmailAction,
] as const satisfies readonly ProviderActionDefinition[];

export type QqMailActionName = QqMailAction["name"];

export const qqMailActionByName: ReadonlyMap<QqMailActionName, QqMailAction> = new Map(
  qqMailActions.map((action) => [action.name, action] as const),
);
