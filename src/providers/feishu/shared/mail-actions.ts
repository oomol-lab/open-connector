import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
const mailboxId = s.string("The mailbox email address. Use `me` for the authorized user's mailbox.", { minLength: 1 });
const messageId = s.string("The Feishu mail message ID.", { minLength: 1 });
const draftId = s.string("The Feishu mail draft ID.", { minLength: 1 });
const pageSize = s.positiveInteger("The maximum number of results on this page.", {
  maximum: 50,
});
const pageToken = s.string("The page token returned by the previous request.", { minLength: 1 });
const email = s.email("An email address.");
const mailItem = s.looseRequiredObject(
  "A Feishu mail object.",
  {},
  {
    optional: [],
  },
);
const pageOutput = s.object(
  "A normalized page of mail objects.",
  {
    items: s.array("The mail objects returned on this page.", mailItem),
    hasMore: s.boolean("Whether another page is available."),
    pageToken: s.nullable(s.string("The token for the next page.")),
  },
  {
    optional: [],
  },
);
const composeFields = {
  from: s.email("The sender address. Omit to resolve the mailbox's primary address."),
  to: s.array("Primary recipient email addresses.", email),
  cc: s.array("Carbon-copy recipient email addresses.", email),
  bcc: s.array("Blind-carbon-copy recipient email addresses.", email),
  subject: s.string("The email subject."),
  text: s.string("The plain-text email body."),
  html: s.string("The HTML email body."),
  attachments: s.array(
    "Public files to fetch and attach to the MIME message.",
    s.object(
      "One URL-backed mail attachment.",
      {
        fileUrl: s.url("The public HTTPS URL of the attachment."),
        fileName: s.string("The attachment file name.", { minLength: 1 }),
        contentType: s.string("The attachment MIME type.", { minLength: 1 }),
      },
      {
        optional: ["fileName", "contentType"],
      },
    ),
    { maxItems: 20 },
  ),
};
const draftOutput = s.object(
  "A normalized draft result.",
  {
    draftId: s.string("The draft ID."),
    raw: mailItem,
  },
  {
    optional: [],
  },
);
const sendOutput = s.object(
  "A normalized mail send result.",
  {
    draftId: s.string("The draft used for delivery."),
    messageId: s.nullable(s.string("The delivered message ID, when Feishu reports it.")),
    threadId: s.nullable(s.string("The delivered thread ID, when Feishu reports it.")),
    raw: mailItem,
  },
  {
    optional: [],
  },
);
function messageLifecycleInput() {
  return s.object(
    "Identify one sent or scheduled mailbox message.",
    {
      mailboxId,
      messageId,
    },
    {
      optional: ["mailboxId"],
    },
  );
}
export function createFeishuMailActions(service: string): readonly ActionDefinition[] {
  const readPermissions = [
    "mail:user_mailbox.message:readonly",
    "mail:user_mailbox.message.address:read",
    "mail:user_mailbox.message.subject:read",
    "mail:user_mailbox.message.body:read",
  ];
  return [
    defineProviderAction(service, {
      name: "list_mail_messages",
      description: "List message IDs in a Feishu mailbox folder or label.",
      requiredScopes: readPermissions,
      providerPermissions: readPermissions,
      inputSchema: s.object(
        "Configure mailbox message pagination.",
        {
          mailboxId,
          folderId: s.string("The folder ID. Defaults to `INBOX`.", { minLength: 1 }),
          labelId: s.string("A label ID. It cannot be combined with folderId.", { minLength: 1 }),
          onlyUnread: s.boolean("Whether to return unread messages only."),
          pageSize,
          pageToken,
        },
        {
          optional: ["mailboxId", "folderId", "labelId", "onlyUnread", "pageSize", "pageToken"],
        },
      ),
      outputSchema: pageOutput,
    }),
    defineProviderAction(service, {
      name: "search_mail_messages",
      description: "Search Feishu mail by text, addresses, subject, state, and creation time.",
      requiredScopes: readPermissions,
      providerPermissions: readPermissions,
      inputSchema: s.object(
        "Describe the mailbox search.",
        {
          mailboxId,
          query: s.string("Full-text search terms."),
          from: s.array("Sender addresses to match.", email),
          to: s.array("Recipient addresses to match.", email),
          cc: s.array("CC recipient addresses to match.", email),
          bcc: s.array("BCC recipient addresses to match.", email),
          subject: s.string("Subject text to match."),
          folder: s.string("A folder name to match."),
          label: s.string("A label name to match."),
          unread: s.boolean("Whether messages must be unread."),
          hasAttachment: s.boolean("Whether messages must have attachments."),
          startTime: s.dateTime("The earliest message creation time."),
          endTime: s.dateTime("The latest message creation time."),
          pageSize,
          pageToken,
        },
        {
          optional: [
            "mailboxId",
            "query",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "folder",
            "label",
            "unread",
            "hasAttachment",
            "startTime",
            "endTime",
            "pageSize",
            "pageToken",
          ],
        },
      ),
      outputSchema: pageOutput,
    }),
    defineProviderAction(service, {
      name: "get_mail_message",
      description: "Read one Feishu mail message with body and attachment metadata.",
      requiredScopes: readPermissions,
      providerPermissions: readPermissions,
      inputSchema: s.object(
        "Identify the mailbox message.",
        {
          mailboxId,
          messageId,
          includeHtml: s.boolean("Whether to include the HTML body."),
        },
        {
          optional: ["mailboxId", "includeHtml"],
        },
      ),
      outputSchema: s.object(
        "The requested message.",
        { message: mailItem },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_mail_thread",
      description: "Read every message in a Feishu mail thread in chronological order.",
      requiredScopes: readPermissions,
      providerPermissions: readPermissions,
      inputSchema: s.object(
        "Identify the mail thread.",
        {
          mailboxId,
          threadId: s.string("The Feishu mail thread ID.", { minLength: 1 }),
          includeHtml: s.boolean("Whether to include HTML bodies."),
          includeSpamTrash: s.boolean("Whether to include spam and trashed messages."),
        },
        {
          optional: ["mailboxId", "includeHtml", "includeSpamTrash"],
        },
      ),
      outputSchema: s.object(
        "The requested mail thread.",
        {
          threadId: s.string("The thread ID."),
          messages: s.array("Messages ordered by internal date.", mailItem),
        },
        {
          optional: [],
        },
      ),
    }),
    ...draftActions(service),
    defineProviderAction(service, {
      name: "send_mail",
      description: "Compose a new email, create a Feishu draft, and send it immediately.",
      requiredScopes: [
        "mail:user_mailbox.message:modify",
        "mail:user_mailbox.message:send",
        "mail:user_mailbox:readonly",
      ],
      providerPermissions: [
        "mail:user_mailbox.message:modify",
        "mail:user_mailbox.message:send",
        "mail:user_mailbox:readonly",
      ],
      inputSchema: s.object(
        "Compose the email.",
        { mailboxId, ...composeFields },
        {
          optional: ["mailboxId"],
        },
      ),
      outputSchema: sendOutput,
    }),
    defineProviderAction(service, {
      name: "get_mail_send_status",
      description: "Get the latest per-recipient delivery status for one sent Feishu mail message.",
      requiredScopes: ["mail:user_mailbox.message:readonly"],
      providerPermissions: ["mail:user_mailbox.message:readonly"],
      inputSchema: messageLifecycleInput(),
      outputSchema: s.object(
        "The normalized mail delivery status.",
        {
          messageId,
          details: s.array("Per-recipient delivery status entries.", mailItem),
          raw: mailItem,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "cancel_scheduled_send",
      description: "Cancel a Feishu mail message before its scheduled delivery time.",
      requiredScopes: ["mail:user_mailbox.message:send"],
      providerPermissions: ["mail:user_mailbox.message:send"],
      inputSchema: messageLifecycleInput(),
      outputSchema: s.object(
        "The scheduled-send cancellation result.",
        {
          messageId,
          canceled: s.boolean("Whether Feishu accepted the cancellation."),
          raw: mailItem,
        },
        {
          optional: [],
        },
      ),
    }),
    ...replyActions(service, readPermissions),
    defineProviderAction(service, {
      name: "recall_sent_mail",
      description: "Request asynchronous recall of one delivered Feishu mail message within its recall window.",
      requiredScopes: ["mail:user_mailbox.message:modify"],
      providerPermissions: ["mail:user_mailbox.message:modify"],
      inputSchema: messageLifecycleInput(),
      outputSchema: s.object(
        "The mail recall request result.",
        {
          messageId,
          recallStatus: s.nullable(s.string("Whether the message is available for recall or unavailable.")),
          recallRestrictionReason: s.nullable(s.string("Why the message cannot be recalled, when unavailable.")),
          raw: mailItem,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_mail_recall_detail",
      description: "Get asynchronous recall progress and per-recipient results for one Feishu mail message.",
      requiredScopes: ["mail:user_mailbox.message:readonly"],
      providerPermissions: ["mail:user_mailbox.message:readonly"],
      inputSchema: messageLifecycleInput(),
      outputSchema: s.object(
        "The normalized mail recall progress.",
        {
          messageId,
          recallStatus: s.nullable(s.string("The overall recall progress.")),
          recallResult: s.nullable(s.string("The aggregate recall result.")),
          successCount: s.nullable(s.nonNegativeInteger("The number of successful recipients.")),
          failureCount: s.nullable(s.nonNegativeInteger("The number of failed recipients.")),
          processingCount: s.nullable(s.nonNegativeInteger("The number of recipients still processing.")),
          items: s.array("Per-recipient recall details.", mailItem),
          raw: mailItem,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "modify_mail_messages",
      description: "Add or remove labels and move Feishu mail messages in batches of 20.",
      requiredScopes: ["mail:user_mailbox.message:modify"],
      providerPermissions: ["mail:user_mailbox.message:modify"],
      inputSchema: s.object(
        "Describe the message changes.",
        {
          mailboxId,
          messageIds: s.array("Message IDs to modify.", messageId, { minItems: 1 }),
          addLabelIds: s.array("Label IDs to add.", s.string("A label ID.", { minLength: 1 })),
          removeLabelIds: s.array("Label IDs to remove.", s.string("A label ID.", { minLength: 1 })),
          targetFolderId: s.string("The folder ID to move the messages into.", { minLength: 1 }),
        },
        {
          optional: ["mailboxId", "addLabelIds", "removeLabelIds", "targetFolderId"],
        },
      ),
      outputSchema: s.object(
        "The batch modification result.",
        {
          successfulMessageIds: s.array("Successfully modified message IDs.", messageId),
          failed: s.array("Failed message operations.", mailItem),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "trash_mail_messages",
      description: "Move Feishu mail messages to trash in batches of 20.",
      requiredScopes: ["mail:user_mailbox.message:modify"],
      providerPermissions: ["mail:user_mailbox.message:modify"],
      inputSchema: s.object(
        "Identify messages to trash.",
        {
          mailboxId,
          messageIds: s.array("Message IDs to trash.", messageId, { minItems: 1 }),
        },
        {
          optional: ["mailboxId"],
        },
      ),
      outputSchema: s.object(
        "The batch trash result.",
        {
          successfulMessageIds: s.array("Successfully trashed message IDs.", messageId),
          failed: s.array("Failed message operations.", mailItem),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_mail_signatures",
      description: "List the authorized user's Feishu mail signatures and default usages.",
      requiredScopes: ["mail:user_mailbox:readonly"],
      providerPermissions: ["mail:user_mailbox:readonly"],
      inputSchema: s.object(
        "Identify the mailbox.",
        { mailboxId },
        {
          optional: ["mailboxId"],
        },
      ),
      outputSchema: pageOutput,
    }),
  ];
}
function draftActions(service: string): readonly ActionDefinition[] {
  const writePermissions = ["mail:user_mailbox.message:modify", "mail:user_mailbox:readonly"];
  return [
    defineProviderAction(service, {
      name: "create_mail_draft",
      description: "Compose and save a new Feishu mail draft without sending it.",
      requiredScopes: writePermissions,
      providerPermissions: writePermissions,
      inputSchema: s.object(
        "Compose the draft.",
        { mailboxId, ...composeFields },
        {
          optional: ["mailboxId"],
        },
      ),
      outputSchema: draftOutput,
    }),
    defineProviderAction(service, {
      name: "update_mail_draft",
      description: "Replace the complete content of an existing Feishu mail draft.",
      requiredScopes: writePermissions,
      providerPermissions: writePermissions,
      inputSchema: s.object(
        "Identify and compose the replacement draft.",
        { mailboxId, draftId, ...composeFields },
        {
          optional: ["mailboxId"],
        },
      ),
      outputSchema: draftOutput,
    }),
    defineProviderAction(service, {
      name: "delete_mail_draft",
      description: "Delete a Feishu mail draft.",
      requiredScopes: ["mail:user_mailbox.message:modify"],
      providerPermissions: ["mail:user_mailbox.message:modify"],
      inputSchema: s.object(
        "Identify the draft.",
        { mailboxId, draftId },
        {
          optional: ["mailboxId"],
        },
      ),
      outputSchema: s.object(
        "The draft deletion result.",
        {
          deleted: s.boolean("Whether the draft was deleted."),
          draftId: s.string("The deleted draft ID."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "send_mail_draft",
      description: "Send an existing Feishu mail draft immediately or at a scheduled time.",
      requiredScopes: ["mail:user_mailbox.message:send"],
      providerPermissions: ["mail:user_mailbox.message:send"],
      inputSchema: s.object(
        "Identify the draft and optional delivery time.",
        {
          mailboxId,
          draftId,
          sendTime: s.dateTime("The scheduled delivery time. Omit to send immediately."),
        },
        {
          optional: ["mailboxId", "sendTime"],
        },
      ),
      outputSchema: sendOutput,
    }),
  ];
}
function replyActions(service: string, readPermissions: readonly string[]): readonly ActionDefinition[] {
  const permissions = [
    ...readPermissions,
    "mail:user_mailbox.message:modify",
    "mail:user_mailbox.message:send",
    "mail:user_mailbox:readonly",
  ];
  const replyInput = s.object(
    "Identify the source message and compose the response.",
    {
      mailboxId,
      messageId,
      from: composeFields.from,
      to: composeFields.to,
      cc: composeFields.cc,
      bcc: composeFields.bcc,
      subject: composeFields.subject,
      text: composeFields.text,
      html: composeFields.html,
      attachments: composeFields.attachments,
    },
    {
      optional: ["mailboxId", "from", "to", "cc", "bcc", "subject", "text", "html", "attachments"],
    },
  );
  return [
    defineProviderAction(service, {
      name: "reply_mail",
      description: "Reply to a Feishu mail message, preserving conversation headers.",
      requiredScopes: permissions,
      providerPermissions: permissions,
      inputSchema: replyInput,
      outputSchema: sendOutput,
    }),
    defineProviderAction(service, {
      name: "reply_all_mail",
      description: "Reply to all participants of a Feishu mail message.",
      requiredScopes: permissions,
      providerPermissions: permissions,
      inputSchema: replyInput,
      outputSchema: sendOutput,
    }),
    defineProviderAction(service, {
      name: "forward_mail",
      description: "Forward a Feishu mail message to new recipients.",
      requiredScopes: permissions,
      providerPermissions: permissions,
      inputSchema: replyInput,
      outputSchema: sendOutput,
    }),
  ];
}
