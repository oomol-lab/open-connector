import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailersend" as const;

const page = s.positiveInteger("Page number to request from the MailerSend API.");
const limit = s.integer("Maximum number of items to return per page.", { minimum: 1, maximum: 100 });
const domainId = s.nonEmptyString("MailerSend domain ID.");
const messageId = s.nonEmptyString("MailerSend message ID.");
const templateId = s.nonEmptyString("MailerSend template ID.");
const identityId = s.nonEmptyString("MailerSend sender identity ID.");
const looseObject = s.looseObject("Object returned by the MailerSend API.");

const recipientSchema = s.object(
  "Recipient object accepted by the MailerSend email API.",
  {
    email: s.email("Email address for the recipient."),
    name: s.string("Display name for the recipient."),
  },
  { optional: ["name"] },
);

const senderSchema = s.object(
  "Sender object accepted by the MailerSend email API.",
  {
    email: s.email("Sender email address."),
    name: s.string("Sender display name."),
  },
  { optional: ["name"] },
);

const attachmentSchema = s.object(
  "Attachment object accepted by the MailerSend email API.",
  {
    content: s.nonEmptyString("Base64-encoded attachment content."),
    filename: s.nonEmptyString("Attachment file name."),
    disposition: s.stringEnum("Attachment disposition used by MailerSend.", ["attachment", "inline"]),
    id: s.string("Inline attachment content ID."),
    type: s.string("Attachment MIME type."),
  },
  { optional: ["disposition", "id", "type"] },
);

const sendEmailInputSchema: JsonSchema = s.object(
  "Request payload for sending a transactional email through MailerSend.",
  {
    from: senderSchema,
    to: s.array("Primary recipients.", recipientSchema, { minItems: 1 }),
    cc: s.array("Carbon copy recipients.", recipientSchema, { minItems: 1 }),
    bcc: s.array("Blind carbon copy recipients.", recipientSchema, { minItems: 1 }),
    reply_to: senderSchema,
    subject: s.nonEmptyString("Email subject line."),
    text: s.string("Plain-text email body."),
    html: s.string("HTML email body."),
    tags: s.stringArray("Tags attached to the email.", {
      minItems: 1,
      itemDescription: "Tag attached to the message.",
    }),
    variables: s.array("Variable substitution payloads accepted by MailerSend.", looseObject),
    personalization: s.array("Per-recipient personalization payloads.", looseObject),
    attachments: s.array("Attachments included with the email.", attachmentSchema),
    send_at: s.string("Datetime string that schedules the email for future delivery."),
  },
  {
    optional: [
      "cc",
      "bcc",
      "reply_to",
      "text",
      "html",
      "tags",
      "variables",
      "personalization",
      "attachments",
      "send_at",
    ],
  },
);
sendEmailInputSchema.anyOf = [{ required: ["text"] }, { required: ["html"] }];

const messageListInputSchema = s.object(
  "Query parameters for listing MailerSend messages.",
  {
    page,
    limit,
    status: s.string("Message status filter."),
    from: s.string("Sender email filter."),
    to: s.string("Recipient email filter."),
    subject: s.string("Message subject filter."),
    domain_id: domainId,
  },
  { optional: ["page", "limit", "status", "from", "to", "subject", "domain_id"] },
);

const listDomainsInputSchema = s.object(
  "Query parameters for listing MailerSend domains.",
  {
    page,
    limit,
    name: s.string("Domain name filter."),
  },
  { optional: ["page", "limit", "name"] },
);

const listDomainRecipientsInputSchema = s.object(
  "Path and query parameters for listing MailerSend domain recipients.",
  {
    domain_id: domainId,
    page,
    limit,
  },
  { optional: ["page", "limit"] },
);

const listTemplatesInputSchema = s.object(
  "Query parameters for listing MailerSend templates.",
  {
    page,
    limit,
  },
  { optional: ["page", "limit"] },
);

const listSenderIdentitiesInputSchema = s.object(
  "Query parameters for listing MailerSend sender identities.",
  {
    page,
    limit,
    domain_id: domainId,
  },
  { optional: ["page", "limit", "domain_id"] },
);

const listOutputSchema = (itemDescription: string) =>
  s.object(
    "Paginated list response returned by the MailerSend API.",
    {
      data: s.array("List items returned by MailerSend.", s.looseObject(itemDescription)),
      links: s.looseObject("Pagination links returned by the MailerSend API."),
      meta: s.looseObject("Pagination metadata returned by the MailerSend API."),
    },
    { optional: ["links", "meta"] },
  );

const idInputSchema = (description: string, field: string, schema: JsonSchema) =>
  s.object(description, {
    [field]: schema,
  });

export const mailersendActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_email",
    description: "Send a transactional email through MailerSend.",
    inputSchema: sendEmailInputSchema,
    outputSchema: s.object("Submission result returned after sending a MailerSend email.", {
      message: s.string("Response message returned by MailerSend."),
      message_id: s.string("Message ID extracted from the x-message-id response header."),
      raw: s.looseObject("Raw JSON response body returned by MailerSend."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_messages",
    description: "List messages available to the current MailerSend API token.",
    inputSchema: messageListInputSchema,
    outputSchema: listOutputSchema("Message object returned by MailerSend."),
  }),
  defineProviderAction(service, {
    name: "get_message",
    description: "Get a single MailerSend message by ID.",
    inputSchema: idInputSchema("Path parameters for fetching a MailerSend message.", "message_id", messageId),
    outputSchema: s.looseObject("Message object returned by MailerSend."),
  }),
  defineProviderAction(service, {
    name: "list_domains",
    description: "List MailerSend domains available to the current API token.",
    inputSchema: listDomainsInputSchema,
    outputSchema: listOutputSchema("Domain object returned by MailerSend."),
  }),
  defineProviderAction(service, {
    name: "get_domain",
    description: "Get a single MailerSend domain by ID.",
    inputSchema: idInputSchema("Path parameters for fetching a MailerSend domain.", "domain_id", domainId),
    outputSchema: s.looseObject("Domain object returned by MailerSend."),
  }),
  defineProviderAction(service, {
    name: "list_domain_recipients",
    description: "List recipients associated with a MailerSend domain.",
    inputSchema: listDomainRecipientsInputSchema,
    outputSchema: listOutputSchema("Domain recipient object returned by MailerSend."),
  }),
  defineProviderAction(service, {
    name: "get_domain_dns_records",
    description: "Get DNS records required for a MailerSend domain.",
    inputSchema: idInputSchema("Path parameters for fetching MailerSend domain DNS records.", "domain_id", domainId),
    outputSchema: s.looseObject("Domain DNS records returned by MailerSend."),
  }),
  defineProviderAction(service, {
    name: "get_domain_verification_status",
    description: "Get the verification status for a MailerSend domain.",
    inputSchema: idInputSchema(
      "Path parameters for fetching a MailerSend domain verification status.",
      "domain_id",
      domainId,
    ),
    outputSchema: s.looseObject("Domain verification status returned by MailerSend."),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List MailerSend templates available to the current API token.",
    inputSchema: listTemplatesInputSchema,
    outputSchema: listOutputSchema("Template object returned by MailerSend."),
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Get a single MailerSend template by ID.",
    inputSchema: idInputSchema("Path parameters for fetching a MailerSend template.", "template_id", templateId),
    outputSchema: s.looseObject("Template object returned by MailerSend."),
  }),
  defineProviderAction(service, {
    name: "list_sender_identities",
    description: "List MailerSend sender identities available to the current API token.",
    inputSchema: listSenderIdentitiesInputSchema,
    outputSchema: listOutputSchema("Sender identity object returned by MailerSend."),
  }),
  defineProviderAction(service, {
    name: "get_sender_identity",
    description: "Get a single MailerSend sender identity by ID.",
    inputSchema: idInputSchema("Path parameters for fetching a MailerSend sender identity.", "identity_id", identityId),
    outputSchema: s.looseObject("Sender identity object returned by MailerSend."),
  }),
];
