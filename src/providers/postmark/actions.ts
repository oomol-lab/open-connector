import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "postmark";
const loose = s.object("Additional upstream fields returned by Postmark.", {}, { additionalProperties: true });
const trackLinks = s.stringEnum("Link tracking mode recognized by the official Postmark API.", [
  "None",
  "HtmlAndText",
  "HtmlOnly",
  "TextOnly",
]);
const templateType = s.stringEnum("Template type recognized by the official Postmark API.", ["Standard", "Layout"]);
const header = s.object({ Name: s.nonEmptyString("Custom header name."), Value: s.string("Custom header value.") });
const attachment = s.object(
  {
    Name: s.nonEmptyString("Attachment file name."),
    Content: s.nonEmptyString("Base64-encoded attachment content."),
    ContentType: s.nonEmptyString("Attachment MIME type."),
    ContentID: s.nonEmptyString("Optional content ID for inline attachments."),
  },
  { optional: ["ContentID"] },
);
const metadata = s.record("Custom metadata key-value pairs attached to the message.", s.string("Metadata value."));
const messageFields = {
  From: s.nonEmptyString("Sender email address or full formatted sender string accepted by Postmark."),
  To: s.nonEmptyString("Recipient email address string. Multiple recipients are comma separated."),
  Cc: s.string("Cc recipient email address string."),
  Bcc: s.string("Bcc recipient email address string."),
  Tag: s.string("Email tag used for categorization and analytics."),
  ReplyTo: s.string("Reply-To email address override."),
  Headers: s.array("Custom headers to include on the email.", header),
  TrackOpens: s.boolean("Whether open tracking is enabled."),
  TrackLinks: trackLinks,
  Attachments: s.array("Attachments to include on the email.", attachment),
  Metadata: metadata,
  MessageStream: s.string("Message stream ID to use when sending the email."),
};
const templateMessage = s.object(
  {
    TemplateId: s.positiveInteger("Template ID to use when rendering this message."),
    TemplateAlias: s.nonEmptyString("Template alias to use when rendering this message."),
    TemplateModel: loose,
    InlineCss: s.boolean("Whether CSS blocks should be inlined into rendered HTML content."),
    ...messageFields,
  },
  {
    optional: [
      "TemplateId",
      "TemplateAlias",
      "InlineCss",
      "Cc",
      "Bcc",
      "Tag",
      "ReplyTo",
      "Headers",
      "TrackOpens",
      "TrackLinks",
      "Attachments",
      "Metadata",
      "MessageStream",
    ],
  },
);
const messageResponse = s.object("Postmark message submission result.", {}, { additionalProperties: true });
const count = s.integer("Number of results to return per request.", { minimum: 1, maximum: 500 });
const offset = s.nonNegativeInteger("Number of results to skip before returning the current page.");

export const postmarkActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_server",
    operationType: "read",
    description: "Get the current Postmark server configuration for the connected server token.",
    inputSchema: s.object({}),
    outputSchema: loose,
  }),
  defineProviderAction(service, {
    name: "send_email",
    operationType: "write",
    description: "Send a transactional email through the current Postmark server.",
    inputSchema: s.object(
      {
        ...messageFields,
        Subject: s.nonEmptyString("Email subject line."),
        HtmlBody: s.string("HTML body content of the email."),
        TextBody: s.string("Plain-text body content of the email."),
      },
      {
        optional: [
          "HtmlBody",
          "TextBody",
          "Cc",
          "Bcc",
          "Tag",
          "ReplyTo",
          "Headers",
          "TrackOpens",
          "TrackLinks",
          "Attachments",
          "Metadata",
          "MessageStream",
        ],
      },
    ),
    outputSchema: messageResponse,
  }),
  defineProviderAction(service, {
    name: "send_email_with_template",
    operationType: "write",
    description: "Send a single templated email through the current Postmark server.",
    inputSchema: templateMessage,
    outputSchema: messageResponse,
  }),
  defineProviderAction(service, {
    name: "send_batch_with_templates",
    operationType: "write",
    description: "Send up to 500 templated emails in a single Postmark batch request.",
    inputSchema: s.object({
      Messages: s.array("Templated messages to send in this batch request.", templateMessage, {
        minItems: 1,
        maxItems: 500,
      }),
    }),
    outputSchema: s.array("Per-message results returned by Postmark batch template sending.", messageResponse),
  }),
  defineProviderAction(service, {
    name: "search_outbound_messages",
    operationType: "read",
    description: "Search outbound Postmark messages with filters and pagination.",
    inputSchema: s.object(
      {
        count,
        offset,
        recipient: s.string("Filter by the user who was receiving the email."),
        fromemail: s.string("Filter by the sender email address."),
        tag: s.string("Filter by message tag."),
        status: s.stringEnum("Outbound message status filter accepted by Postmark search.", [
          "queued",
          "sent",
          "processed",
        ]),
        todate: s.string("Filter messages up to this datetime, inclusive."),
        fromdate: s.string("Filter messages starting from this datetime, inclusive."),
        subject: s.string("Filter by email subject."),
        messagestream: s.string("Filter by message stream ID."),
        metadata: s.record(
          "Metadata filters mapped to Postmark metadata_<key> query parameters for outbound search.",
          s.string("Metadata value."),
        ),
      },
      {
        optional: [
          "count",
          "offset",
          "recipient",
          "fromemail",
          "tag",
          "status",
          "todate",
          "fromdate",
          "subject",
          "messagestream",
          "metadata",
        ],
      },
    ),
    outputSchema: s.object({
      TotalCount: s.integer("Total number of messages that matched the search."),
      Messages: s.array("Outbound messages returned by the search.", loose),
    }),
  }),
  defineProviderAction(service, {
    name: "get_outbound_message_details",
    operationType: "read",
    description: "Get detailed content and events for one outbound Postmark message.",
    inputSchema: s.object({ messageId: s.nonEmptyString("Outbound message ID returned by Postmark.") }),
    outputSchema: loose,
  }),
  defineProviderAction(service, {
    name: "get_bounces",
    operationType: "read",
    description: "Get Postmark bounces for the current server with optional filters.",
    inputSchema: s.object(
      {
        count,
        offset,
        type: s.string("Filter by bounce type."),
        inactive: s.boolean("Whether to return only inactive bounces."),
        emailFilter: s.string("Filter by bounced email address."),
        messageID: s.string("Filter by outbound message ID."),
        mailboxHash: s.string("Filter by the mailbox hash portion of the address."),
        tag: s.string("Filter by tag."),
        todate: s.string("Only include bounces before this datetime."),
        fromdate: s.string("Only include bounces after this datetime."),
      },
      {
        optional: [
          "count",
          "offset",
          "type",
          "inactive",
          "emailFilter",
          "messageID",
          "mailboxHash",
          "tag",
          "todate",
          "fromdate",
        ],
      },
    ),
    outputSchema: s.object({
      TotalCount: s.integer("Total number of bounces that matched the filter."),
      Bounces: s.array("Bounces returned by Postmark.", loose),
    }),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    operationType: "read",
    description: "List Postmark templates for the current server.",
    inputSchema: s.object(
      { count, offset, TemplateType: templateType, LayoutTemplate: s.string("Filter by layout template alias.") },
      { optional: ["count", "offset", "TemplateType", "LayoutTemplate"] },
    ),
    outputSchema: s.object({
      TotalCount: s.integer("Total number of templates."),
      Templates: s.array("Templates returned by Postmark.", loose),
    }),
  }),
  defineProviderAction(service, {
    name: "get_template",
    operationType: "read",
    description: "Get one Postmark template by template ID or alias.",
    inputSchema: s.object({
      templateIdOrAlias: s.anyOf("Template ID or template alias accepted by the Postmark path parameter.", [
        s.positiveInteger("Template ID."),
        s.nonEmptyString("Template alias."),
      ]),
    }),
    outputSchema: loose,
  }),
  defineProviderAction(service, {
    name: "create_template",
    operationType: "write",
    description: "Create a Postmark template.",
    inputSchema: s.object(
      {
        Name: s.nonEmptyString("Template name."),
        Subject: s.string("Subject content for the template. Required for standard templates."),
        HtmlBody: s.string("HTML body content of the template."),
        TextBody: s.string("Plain-text body content of the template."),
        TemplateType: templateType,
        Alias: s.string("Optional alias that identifies the template within the server."),
        LayoutTemplate: s.string("Optional layout template alias used by a standard template."),
      },
      { optional: ["Subject", "HtmlBody", "TextBody", "TemplateType", "Alias", "LayoutTemplate"] },
    ),
    outputSchema: loose,
  }),
  defineProviderAction(service, {
    name: "edit_template",
    operationType: "write",
    description: "Edit an existing Postmark template.",
    inputSchema: s.object(
      {
        templateIdOrAlias: s.anyOf("Template ID or template alias accepted by the Postmark path parameter.", [
          s.positiveInteger("Template ID."),
          s.nonEmptyString("Template alias."),
        ]),
        Name: s.nonEmptyString("Updated template name."),
        Subject: s.string("Updated template subject content when the template is standard."),
        HtmlBody: s.string("Updated HTML body content."),
        TextBody: s.string("Updated plain-text body content."),
        Alias: s.string("Updated alias that identifies the template within the server."),
        LayoutTemplate: s.string("Updated layout template alias for a standard template."),
      },
      { optional: ["Subject", "HtmlBody", "TextBody", "Alias", "LayoutTemplate"] },
    ),
    outputSchema: loose,
  }),
  defineProviderAction(service, {
    name: "validate_template",
    operationType: "read",
    description: "Validate Postmark template content and render test output.",
    inputSchema: s.object(
      {
        Subject: s.string("Subject content to validate against Postmark template syntax."),
        HtmlBody: s.string("HTML body content to validate."),
        TextBody: s.string("Plain-text body content to validate."),
        TestRenderModel: loose,
        InlineCssForHtmlTestRender: s.boolean("Whether CSS blocks should be inlined when rendering HTML test output."),
        TemplateType: templateType,
        LayoutTemplate: s.string("Optional layout template alias used while validating a standard template."),
      },
      { optional: ["Subject", "HtmlBody", "TextBody", "InlineCssForHtmlTestRender", "TemplateType", "LayoutTemplate"] },
    ),
    outputSchema: loose,
  }),
];
