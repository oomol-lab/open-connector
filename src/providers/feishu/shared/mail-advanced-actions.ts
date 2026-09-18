import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
export const feishuMailAdvancedProviderPermissions = {
  mailboxRead: "mail:user_mailbox:readonly",
  messageRead: "mail:user_mailbox.message:readonly",
  addressRead: "mail:user_mailbox.message.address:read",
  subjectRead: "mail:user_mailbox.message.subject:read",
  bodyRead: "mail:user_mailbox.message.body:read",
  messageModify: "mail:user_mailbox.message:modify",
  messageSend: "mail:user_mailbox.message:send",
  event: "mail:event",
  eventAddressRead: "mail:user_mailbox.event.mail_address:read",
  imSend: "im:message.send_as_user",
  imMessage: "im:message",
};
const mailboxIdSchema = s.string("The mailbox email address. Use `me` for the authorized user's mailbox.", {
  minLength: 1,
});
const messageIdSchema = s.string("The Feishu mail message ID.", { minLength: 1 });
const templateIdSchema = s.string("The decimal Feishu mail template ID.", {
  minLength: 1,
  pattern: "^[0-9]+$",
});
const looseMailObject = s.looseRequiredObject(
  "A Feishu mail API object.",
  {},
  {
    optional: [],
  },
);
const addressSchema = s.object(
  "One mail template recipient.",
  {
    mailAddress: s.email("The recipient email address."),
    name: s.string("The optional recipient display name."),
  },
  {
    optional: ["name"],
  },
);
const attachmentSchema = s.object(
  "One existing Drive-backed template attachment.",
  {
    fileKey: s.string("The Drive file key used as the attachment ID and body.", {
      minLength: 1,
    }),
    fileName: s.string("The attachment file name.", { minLength: 1 }),
    cid: s.string("The Content-ID referenced by inline HTML.", { minLength: 1 }),
    inline: s.boolean("Whether this is an inline attachment."),
    attachmentType: s.stringEnum("How Feishu delivers the attachment.", ["small", "large"]),
  },
  {
    optional: ["cid", "inline", "attachmentType"],
  },
);
const templateFields = {
  name: s.string("The template name, limited to 100 Unicode characters.", {
    minLength: 1,
    maxLength: 100,
  }),
  subject: s.string("The default message subject."),
  templateContent: s.string("The HTML or plain-text template body."),
  isPlainText: s.boolean("Whether Feishu should treat the template as plain text."),
  to: s.array("Default primary recipients.", addressSchema),
  cc: s.array("Default carbon-copy recipients.", addressSchema),
  bcc: s.array("Default blind-carbon-copy recipients.", addressSchema),
  attachments: s.array(
    "Existing Drive-backed attachments. Upload files separately before referencing their keys.",
    attachmentSchema,
  ),
};
export function createFeishuMailAdvancedActions(service: string): readonly ActionDefinition[] {
  const messageReadPermissions = [
    feishuMailAdvancedProviderPermissions.mailboxRead,
    feishuMailAdvancedProviderPermissions.messageRead,
    feishuMailAdvancedProviderPermissions.addressRead,
    feishuMailAdvancedProviderPermissions.subjectRead,
    feishuMailAdvancedProviderPermissions.bodyRead,
  ];
  return [
    defineProviderAction(service, {
      name: "send_mail_read_receipt",
      operationType: "write",
      description: "Send a system-generated RFC 3798-style read receipt for a message that requested one.",
      requiredScopes: [
        ...messageReadPermissions,
        feishuMailAdvancedProviderPermissions.messageModify,
        feishuMailAdvancedProviderPermissions.messageSend,
      ],
      providerPermissions: [
        ...messageReadPermissions,
        feishuMailAdvancedProviderPermissions.messageModify,
        feishuMailAdvancedProviderPermissions.messageSend,
      ],
      inputSchema: s.object(
        "Identify the original message and optional sender override.",
        {
          mailboxId: mailboxIdSchema,
          messageId: messageIdSchema,
          from: s.email("The receipt sender address; omit to use the mailbox primary address."),
          language: s.stringEnum("The generated receipt language.", ["auto", "zh", "en"]),
        },
        {
          optional: ["mailboxId", "from", "language"],
        },
      ),
      outputSchema: s.object(
        "The sent receipt result.",
        {
          receiptForMessageId: messageIdSchema,
          draftId: s.string("The draft ID used to send the receipt."),
          messageId: s.nullable(s.string("The delivered receipt message ID.")),
          threadId: s.nullable(s.string("The delivered receipt thread ID.")),
          raw: looseMailObject,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "decline_mail_read_receipt",
      operationType: "destructive",
      description:
        "Dismiss a message's read-receipt request without sending mail, safely doing nothing when already cleared.",
      requiredScopes: [...messageReadPermissions, feishuMailAdvancedProviderPermissions.messageModify],
      providerPermissions: [...messageReadPermissions, feishuMailAdvancedProviderPermissions.messageModify],
      inputSchema: s.object(
        "Identify the message whose receipt prompt should be dismissed.",
        {
          mailboxId: mailboxIdSchema,
          messageId: messageIdSchema,
        },
        {
          optional: ["mailboxId"],
        },
      ),
      outputSchema: s.object(
        "The receipt-decline result.",
        {
          messageId: messageIdSchema,
          declined: s.boolean("Whether the receipt label was removed by this call."),
          alreadyCleared: s.boolean("Whether the label was already absent."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_mail_signature_detail",
      operationType: "read",
      description: "Fetch one complete mail signature and annotate whether it is the send or reply default.",
      requiredScopes: [feishuMailAdvancedProviderPermissions.mailboxRead],
      providerPermissions: [feishuMailAdvancedProviderPermissions.mailboxRead],
      inputSchema: s.object(
        "Identify one mailbox signature.",
        {
          mailboxId: mailboxIdSchema,
          signatureId: s.string("The signature ID returned by list_mail_signatures.", {
            minLength: 1,
          }),
        },
        {
          optional: ["mailboxId"],
        },
      ),
      outputSchema: s.object(
        "The selected signature and usage details.",
        {
          signature: looseMailObject,
          isSendDefault: s.boolean("Whether this is a default sending signature."),
          isReplyDefault: s.boolean("Whether this is a default reply signature."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "share_mail_to_chat",
      operationType: "write",
      description: "Create a Feishu mail share card for one message or thread and send it to an IM recipient.",
      requiredScopes: [
        feishuMailAdvancedProviderPermissions.messageRead,
        feishuMailAdvancedProviderPermissions.imMessage,
        feishuMailAdvancedProviderPermissions.imSend,
      ],
      providerPermissions: [
        feishuMailAdvancedProviderPermissions.messageRead,
        feishuMailAdvancedProviderPermissions.imMessage,
        feishuMailAdvancedProviderPermissions.imSend,
      ],
      inputSchema: s.object(
        "Choose one mail resource and an IM recipient.",
        {
          mailboxId: mailboxIdSchema,
          messageId: messageIdSchema,
          threadId: s.string("The Feishu mail thread ID.", { minLength: 1 }),
          receiveId: s.string("The IM recipient identifier.", { minLength: 1 }),
          receiveIdType: s.stringEnum("The identifier type used by receiveId.", [
            "chat_id",
            "open_id",
            "user_id",
            "union_id",
            "email",
          ]),
        },
        {
          optional: ["mailboxId", "messageId", "threadId", "receiveIdType"],
        },
      ),
      outputSchema: s.object(
        "The sent mail share card.",
        {
          cardId: s.string("The generated mail share card ID."),
          imMessageId: s.nullable(s.string("The delivered IM message ID.")),
          raw: looseMailObject,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "create_mail_template",
      operationType: "write",
      description: "Create a personal Feishu mail template from JSON content and existing Drive-backed attachments.",
      requiredScopes: [
        feishuMailAdvancedProviderPermissions.messageModify,
        feishuMailAdvancedProviderPermissions.mailboxRead,
      ],
      providerPermissions: [
        feishuMailAdvancedProviderPermissions.messageModify,
        feishuMailAdvancedProviderPermissions.mailboxRead,
      ],
      inputSchema: s.object(
        "Describe the new mail template.",
        {
          mailboxId: mailboxIdSchema,
          ...templateFields,
        },
        {
          optional: ["mailboxId", "subject", "templateContent", "isPlainText", "to", "cc", "bcc", "attachments"],
        },
      ),
      outputSchema: s.object(
        "The created mail template.",
        {
          template: looseMailObject,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "update_mail_template",
      operationType: "destructive",
      description:
        "Fetch and fully replace a mail template after merging provided JSON fields; concurrent writes are last-write-wins.",
      requiredScopes: [
        feishuMailAdvancedProviderPermissions.messageModify,
        feishuMailAdvancedProviderPermissions.mailboxRead,
      ],
      providerPermissions: [
        feishuMailAdvancedProviderPermissions.messageModify,
        feishuMailAdvancedProviderPermissions.mailboxRead,
      ],
      inputSchema: s.object(
        "Identify the template and provide fields to merge.",
        {
          mailboxId: mailboxIdSchema,
          templateId: templateIdSchema,
          ...templateFields,
          attachmentsMode: s.stringEnum("Whether supplied attachments replace or append to existing attachments.", [
            "replace",
            "append",
          ]),
        },
        {
          optional: [
            "mailboxId",
            "name",
            "subject",
            "templateContent",
            "isPlainText",
            "to",
            "cc",
            "bcc",
            "attachments",
            "attachmentsMode",
          ],
        },
      ),
      outputSchema: s.object(
        "The updated mail template.",
        {
          template: looseMailObject,
          warning: s.string("The concurrency warning for this full-replace endpoint."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "triage_mail_messages",
      operationType: "read",
      description:
        "Auto-paginate compact mailbox summaries through list or search APIs with a stable continuation token.",
      requiredScopes: messageReadPermissions,
      providerPermissions: messageReadPermissions,
      inputSchema: s.object(
        "Describe a bounded mailbox triage query.",
        {
          mailboxId: mailboxIdSchema,
          query: s.string("Full-text terms searched across mail metadata and body.", {
            minLength: 1,
            maxLength: 50,
          }),
          folderId: s.string("A folder ID for the list path.", { minLength: 1 }),
          labelId: s.string("A label ID for the list path.", { minLength: 1 }),
          folder: s.string("A folder name for the search path.", { minLength: 1 }),
          label: s.string("A label name for the search path.", { minLength: 1 }),
          from: s.array("Sender addresses to match.", s.email("A sender email address."), {
            minItems: 1,
          }),
          to: s.array("Recipient addresses to match.", s.email("A recipient email address."), {
            minItems: 1,
          }),
          cc: s.array("CC addresses to match.", s.email("A CC email address."), {
            minItems: 1,
          }),
          bcc: s.array("BCC addresses to match.", s.email("A BCC email address."), {
            minItems: 1,
          }),
          subject: s.string("Subject text to match.", { minLength: 1 }),
          unread: s.literal(true, { description: "Filter unread messages when set to true." }),
          hasAttachment: s.boolean("Whether messages must have attachments."),
          startTime: s.dateTime("The earliest creation time."),
          endTime: s.dateTime("The latest creation time."),
          includeLabels: s.boolean("Whether search results should be enriched with label IDs."),
          maxResults: s.positiveInteger("The maximum number of summaries to return.", {
            maximum: 400,
          }),
          pageToken: s.string("A `list:` or `search:` continuation token returned by this action.", { minLength: 1 }),
        },
        {
          optional: [
            "mailboxId",
            "query",
            "folderId",
            "labelId",
            "folder",
            "label",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "unread",
            "hasAttachment",
            "startTime",
            "endTime",
            "includeLabels",
            "maxResults",
            "pageToken",
          ],
        },
      ),
      outputSchema: s.object(
        "The compact triage result.",
        {
          messages: s.array("The normalized mail summaries.", looseMailObject),
          mailboxId: mailboxIdSchema,
          count: s.nonNegativeInteger("The number of returned summaries."),
          source: s.stringEnum("The API path selected by the action.", ["list", "search"]),
          hasMore: s.boolean("Whether more results remain."),
          pageToken: s.nullable(s.string("The prefixed continuation token.")),
          notice: s.nullable(s.string("An optional Feishu search notice.")),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "subscribe_mail_events",
      operationType: "write",
      description:
        "Subscribe a user mailbox to Feishu message-received events before consuming the corresponding push event.",
      requiredScopes: [
        feishuMailAdvancedProviderPermissions.event,
        feishuMailAdvancedProviderPermissions.eventAddressRead,
        feishuMailAdvancedProviderPermissions.mailboxRead,
      ],
      providerPermissions: [
        feishuMailAdvancedProviderPermissions.event,
        feishuMailAdvancedProviderPermissions.eventAddressRead,
        feishuMailAdvancedProviderPermissions.mailboxRead,
      ],
      inputSchema: s.object(
        "Identify the user mailbox to subscribe.",
        { mailboxId: mailboxIdSchema },
        {
          optional: ["mailboxId"],
        },
      ),
      outputSchema: s.object(
        "The mailbox event subscription result.",
        {
          mailboxId: mailboxIdSchema,
          subscribed: s.boolean("Whether the subscription request succeeded."),
          eventType: s.literal(1, { description: "The Feishu mailbox event type number." }),
          raw: looseMailObject,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "unsubscribe_mail_events",
      operationType: "destructive",
      description: "Unsubscribe a user mailbox from Feishu message-received events.",
      requiredScopes: [
        feishuMailAdvancedProviderPermissions.event,
        feishuMailAdvancedProviderPermissions.eventAddressRead,
        feishuMailAdvancedProviderPermissions.mailboxRead,
      ],
      providerPermissions: [
        feishuMailAdvancedProviderPermissions.event,
        feishuMailAdvancedProviderPermissions.eventAddressRead,
        feishuMailAdvancedProviderPermissions.mailboxRead,
      ],
      inputSchema: s.object(
        "Identify the user mailbox to unsubscribe.",
        { mailboxId: mailboxIdSchema },
        {
          optional: ["mailboxId"],
        },
      ),
      outputSchema: s.object(
        "The mailbox event unsubscription result.",
        {
          mailboxId: mailboxIdSchema,
          unsubscribed: s.boolean("Whether the unsubscription request succeeded."),
          eventType: s.literal(1, { description: "The Feishu mailbox event type number." }),
          raw: looseMailObject,
        },
        {
          optional: [],
        },
      ),
    }),
  ];
}
