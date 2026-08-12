import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "resend";
const fullAccessScopes = ["full_access"];

const emailIdSchema = s.nonEmptyString("The Resend email ID.");
const attachmentIdSchema = s.nonEmptyString("The Resend attachment ID.");
const emailAddressSchema = s.email("An email address.");
const emailAddressListSchema = (description: string, maxItems?: number): JsonSchema =>
  s.array(description, emailAddressSchema, {
    minItems: 1,
    maxItems,
  });

const nullableEmailAddressListSchema = (description: string): JsonSchema =>
  s.nullable(s.array(description, emailAddressSchema));

const tagInputSchema = s.object("A custom email tag.", {
  name: s.string("The tag name.", {
    minLength: 1,
    maxLength: 256,
    pattern: "^[A-Za-z0-9_-]+$",
  }),
  value: s.string("The tag value.", {
    minLength: 1,
    maxLength: 256,
    pattern: "^[A-Za-z0-9_-]+$",
  }),
});

const tagOutputSchema = s.object("A tag attached to an email.", {
  name: s.string("The tag name."),
  value: s.string("The tag value."),
});

const templateInputSchema = s.object(
  "A published Resend template used to render an email.",
  {
    id: s.nonEmptyString("The published template ID or alias."),
    variables: s.record(
      "Template variables keyed by variable name.",
      s.union([s.string("A string template value."), s.number("A numeric template value.")]),
    ),
  },
  { optional: ["variables"] },
);

const batchEmailInputSchema: JsonSchema = {
  ...s.object(
    "One email in a Resend batch request.",
    {
      from: s.nonEmptyString("The sender address, optionally formatted as Name <sender@example.com>."),
      to: emailAddressListSchema("Primary recipient email addresses, up to 50 per email.", 50),
      subject: s.nonEmptyString("The email subject."),
      html: s.string("The HTML message body."),
      text: s.string("The plain-text message body."),
      cc: emailAddressListSchema("Cc recipient email addresses."),
      bcc: emailAddressListSchema("Bcc recipient email addresses."),
      replyTo: emailAddressListSchema("Reply-to email addresses."),
      headers: s.record("Custom email headers.", s.string("A custom header value.")),
      tags: s.array("Custom tags attached to the email.", tagInputSchema),
      template: templateInputSchema,
    },
    { optional: ["html", "text", "cc", "bcc", "replyTo", "headers", "tags", "template"] },
  ),
  oneOf: [
    {
      anyOf: [{ required: ["html"] }, { required: ["text"] }],
      not: { required: ["template"] },
    },
    {
      required: ["template"],
      not: { anyOf: [{ required: ["html"] }, { required: ["text"] }] },
    },
  ],
};

const paginationFields = {
  limit: s.integer("The number of records to return, from 1 to 100.", { minimum: 1, maximum: 100 }),
  after: s.nonEmptyString("Return records after this resource ID."),
  before: s.nonEmptyString("Return records before this resource ID."),
};

const paginationInputSchema: JsonSchema = {
  ...s.object("Cursor pagination parameters.", paginationFields, { optional: ["limit", "after", "before"] }),
  not: { required: ["after", "before"] },
};

const sentEmailSummarySchema = s.object("A sent Resend email summary.", {
  id: s.string("The email ID."),
  messageId: s.nullableString("The provider message ID, or null when unavailable."),
  to: emailAddressListSchema("Primary recipient email addresses."),
  from: s.string("The sender address."),
  createdAt: s.string("The email creation timestamp."),
  subject: s.string("The email subject."),
  bcc: nullableEmailAddressListSchema("Bcc recipient addresses, or null when omitted."),
  cc: nullableEmailAddressListSchema("Cc recipient addresses, or null when omitted."),
  replyTo: nullableEmailAddressListSchema("Reply-to addresses, or null when omitted."),
  lastEvent: s.nullableString("The latest delivery event, or null when unavailable."),
  scheduledAt: s.nullableString("The scheduled send timestamp, or null when not scheduled."),
});

const sentEmailSchema = s.object("A sent Resend email with message content.", {
  id: s.string("The email ID."),
  messageId: s.nullableString("The provider message ID, or null when unavailable."),
  to: emailAddressListSchema("Primary recipient email addresses."),
  from: s.string("The sender address."),
  createdAt: s.string("The email creation timestamp."),
  subject: s.string("The email subject."),
  html: s.nullableString("The HTML message body, or null when unavailable."),
  text: s.nullableString("The plain-text message body, or null when unavailable."),
  bcc: nullableEmailAddressListSchema("Bcc recipient addresses, or null when omitted."),
  cc: nullableEmailAddressListSchema("Cc recipient addresses, or null when omitted."),
  replyTo: nullableEmailAddressListSchema("Reply-to addresses, or null when omitted."),
  lastEvent: s.nullableString("The latest delivery event, or null when unavailable."),
  scheduledAt: s.nullableString("The scheduled send timestamp, or null when not scheduled."),
  tags: s.array("Tags attached to the email.", tagOutputSchema),
});

const attachmentReferenceSchema = s.object("Attachment metadata included with a received email.", {
  id: s.string("The attachment ID."),
  filename: s.nullableString("The attachment filename, or null when unavailable."),
  size: s.nullableInteger("The attachment size in bytes, or null when unavailable.", { minimum: 0 }),
  contentType: s.nullableString("The attachment media type, or null when unavailable."),
  contentDisposition: s.nullableString("The attachment disposition, or null when unavailable."),
  contentId: s.nullableString("The inline content ID, or null when unavailable."),
});

const attachmentSchema = s.object("A Resend attachment with a temporary download URL.", {
  id: s.string("The attachment ID."),
  filename: s.nullableString("The attachment filename, or null when unavailable."),
  size: s.integer("The attachment size in bytes.", { minimum: 0 }),
  contentType: s.string("The attachment media type."),
  contentDisposition: s.nullableString("The attachment disposition, or null when unavailable."),
  contentId: s.nullableString("The inline content ID, or null when unavailable."),
  downloadUrl: s.url("The temporary signed attachment download URL."),
  expiresAt: s.string("The download URL expiration timestamp."),
});

const receivedEmailSummarySchema = s.object("A received Resend email summary.", {
  id: s.string("The email ID."),
  messageId: s.nullableString("The provider message ID, or null when unavailable."),
  to: emailAddressListSchema("Primary recipient email addresses."),
  from: s.string("The sender address."),
  createdAt: s.string("The email creation timestamp."),
  subject: s.nullableString("The email subject, or null when omitted."),
  bcc: nullableEmailAddressListSchema("Bcc recipient addresses, or null when omitted."),
  cc: nullableEmailAddressListSchema("Cc recipient addresses, or null when omitted."),
  replyTo: nullableEmailAddressListSchema("Reply-to addresses, or null when omitted."),
  attachments: s.array("Attachment metadata included with the email.", attachmentReferenceSchema),
});

const rawEmailSchema = s.object("Temporary raw email download information.", {
  downloadUrl: s.url("The temporary signed URL for the original raw email."),
  expiresAt: s.string("The raw email download URL expiration timestamp."),
});

const receivedEmailSchema = s.object("A received Resend email with message content.", {
  id: s.string("The email ID."),
  messageId: s.nullableString("The provider message ID, or null when unavailable."),
  to: emailAddressListSchema("Primary recipient email addresses."),
  from: s.string("The sender address."),
  createdAt: s.string("The email creation timestamp."),
  subject: s.string("The email subject."),
  html: s.nullableString("The HTML message body, or null when unavailable."),
  text: s.nullableString("The plain-text message body, or null when unavailable."),
  headers: s.nullable(s.record("Received email headers.", s.string("A header value."))),
  bcc: nullableEmailAddressListSchema("Bcc recipient addresses, or null when omitted."),
  cc: nullableEmailAddressListSchema("Cc recipient addresses, or null when omitted."),
  replyTo: nullableEmailAddressListSchema("Reply-to addresses, or null when omitted."),
  raw: s.nullable(rawEmailSchema),
  attachments: s.array("Attachment metadata included with the email.", attachmentReferenceSchema),
});

const emailOperationOutputSchema = s.object("The Resend email operation result.", {
  emailId: s.string("The affected email ID."),
});

function listInput(description: string): JsonSchema {
  return { ...paginationInputSchema, description };
}

function attachmentListInput(description: string): JsonSchema {
  return {
    ...s.object(
      description,
      { emailId: emailIdSchema, ...paginationFields },
      { optional: ["limit", "after", "before"] },
    ),
    not: { required: ["after", "before"] },
  };
}

function getAttachmentInput(description: string): JsonSchema {
  return s.object(description, {
    emailId: emailIdSchema,
    attachmentId: attachmentIdSchema,
  });
}

export const resendActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_email",
    description: "Send an email with Resend.",
    inputSchema: {
      ...s.object(
        "The input payload for sending a Resend email.",
        {
          from: s.nonEmptyString("The sender email address."),
          to: s.nonEmptyString("The recipient email address."),
          subject: s.nonEmptyString("The email subject line."),
          html: s.string("The HTML body of the email."),
          text: s.string("The plain text body of the email."),
        },
        { optional: ["html", "text"] },
      ),
      anyOf: [{ required: ["html"] }, { required: ["text"] }],
    },
    outputSchema: s.object("The output payload for this action.", {
      emailId: s.string("The unique identifier of the sent email."),
    }),
  }),
  defineProviderAction(service, {
    name: "send_batch_emails",
    description: "Send up to 100 emails in one Resend batch request.",
    inputSchema: s.object(
      "Emails and request options for a Resend batch send.",
      {
        emails: s.array("The emails to send in request order.", batchEmailInputSchema, {
          minItems: 1,
          maxItems: 100,
        }),
        idempotencyKey: s.string("A unique key that prevents duplicate sends for 24 hours.", {
          minLength: 1,
          maxLength: 256,
        }),
      },
      { optional: ["idempotencyKey"] },
    ),
    outputSchema: s.object("The Resend batch send result.", {
      emailIds: s.array("Created email IDs in the same order as the input emails.", s.string("An email ID."), {
        minItems: 1,
        maxItems: 100,
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_sent_emails",
    description: "List emails sent by the authenticated Resend team.",
    requiredScopes: fullAccessScopes,
    inputSchema: listInput("Cursor pagination for sent Resend emails."),
    outputSchema: s.object("A page of sent Resend emails.", {
      hasMore: s.boolean("Whether another page of sent emails is available."),
      emails: s.array("Sent email summaries.", sentEmailSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_sent_email",
    description: "Retrieve one sent Resend email, including its message content and delivery state.",
    requiredScopes: fullAccessScopes,
    inputSchema: s.object("The sent email to retrieve.", { emailId: emailIdSchema }),
    outputSchema: s.object("The sent Resend email response.", { email: sentEmailSchema }),
  }),
  defineProviderAction(service, {
    name: "update_scheduled_email",
    description: "Change the delivery time of a scheduled Resend email.",
    requiredScopes: fullAccessScopes,
    inputSchema: s.object("The scheduled email and its new delivery time.", {
      emailId: emailIdSchema,
      scheduledAt: s.dateTime("The new ISO 8601 delivery timestamp."),
    }),
    outputSchema: emailOperationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "cancel_scheduled_email",
    description: "Cancel a scheduled Resend email before delivery.",
    requiredScopes: fullAccessScopes,
    inputSchema: s.object("The scheduled email to cancel.", { emailId: emailIdSchema }),
    outputSchema: emailOperationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_sent_email_attachments",
    description: "List attachments for a sent Resend email.",
    requiredScopes: fullAccessScopes,
    inputSchema: attachmentListInput("The sent email and cursor pagination for its attachments."),
    outputSchema: s.object("The sent email attachment list.", {
      hasMore: s.boolean("Whether Resend reports more attachments."),
      attachments: s.array("Attachments on the sent email.", attachmentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_sent_email_attachment",
    description: "Retrieve one attachment from a sent Resend email, including its temporary download URL.",
    requiredScopes: fullAccessScopes,
    inputSchema: getAttachmentInput("The sent email attachment to retrieve."),
    outputSchema: s.object("The sent email attachment response.", { attachment: attachmentSchema }),
  }),
  defineProviderAction(service, {
    name: "list_received_emails",
    description: "List emails received by the authenticated Resend team.",
    requiredScopes: fullAccessScopes,
    inputSchema: listInput("Cursor pagination for received Resend emails."),
    outputSchema: s.object("A page of received Resend emails.", {
      hasMore: s.boolean("Whether another page of received emails is available."),
      emails: s.array("Received email summaries.", receivedEmailSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_received_email",
    description: "Retrieve one received Resend email, including its content, headers, and attachment metadata.",
    requiredScopes: fullAccessScopes,
    inputSchema: s.object("The received email to retrieve.", { emailId: emailIdSchema }),
    outputSchema: s.object("The received Resend email response.", { email: receivedEmailSchema }),
  }),
  defineProviderAction(service, {
    name: "list_received_email_attachments",
    description: "List attachments for a received Resend email.",
    requiredScopes: fullAccessScopes,
    inputSchema: attachmentListInput("The received email and cursor pagination for its attachments."),
    outputSchema: s.object("The received email attachment list.", {
      hasMore: s.boolean("Whether another page of attachments is available."),
      attachments: s.array("Attachments on the received email.", attachmentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_received_email_attachment",
    description: "Retrieve one attachment from a received Resend email, including its temporary download URL.",
    requiredScopes: fullAccessScopes,
    inputSchema: getAttachmentInput("The received email attachment to retrieve."),
    outputSchema: s.object("The received email attachment response.", { attachment: attachmentSchema }),
  }),
];
