import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sendgrid" as const;

const emptyObjectInputSchema = s.object(
  {},
  {
    description: "The empty input payload for this action.",
  },
);

const recipientSchema = s.object(
  {
    email: s.email("The recipient email address."),
    name: s.nonEmptyString("The optional recipient display name."),
  },
  {
    optional: ["name"],
    description: "One SendGrid email recipient.",
  },
);

const senderSchema = s.object(
  {
    email: s.email("The sender email address."),
    name: s.nonEmptyString("The optional sender display name."),
  },
  {
    optional: ["name"],
    description: "One SendGrid sender object.",
  },
);

const attachmentSchema = s.object(
  {
    contentBase64: s.nonEmptyString("The Base64-encoded attachment content."),
    filename: s.nonEmptyString("The attachment file name."),
    type: s.nonEmptyString("The optional attachment MIME type."),
    disposition: s.stringEnum("The optional attachment disposition.", ["attachment", "inline"]),
    contentId: s.nonEmptyString("The optional content ID used for inline attachments."),
  },
  {
    optional: ["type", "disposition", "contentId"],
    description: "One attachment accepted by the SendGrid Mail Send API.",
  },
);

const generationsSchema = s.stringEnum("The template generations accepted by the SendGrid templates API.", [
  "legacy",
  "dynamic",
  "legacy,dynamic",
]);

const listTransactionalTemplatesInputSchema = s.object(
  {
    pageSize: s.positiveInteger("The number of templates to return per page."),
    pageToken: s.nonEmptyString("The opaque page token returned by a previous SendGrid templates response."),
    generations: generationsSchema,
  },
  {
    optional: ["pageSize", "pageToken", "generations"],
    description: "The query parameters for listing SendGrid transactional templates.",
  },
);

const templateVersionSchema = s.object(
  {
    id: s.string("The transactional template version ID."),
    name: s.string("The transactional template version name."),
    active: s.integer("Whether this template version is active as 1 or 0."),
    editor: s.stringEnum("The editor mode used for this template version.", ["code", "design"]),
    subject: s.string("The template version subject."),
    testData: s.string("The dynamic template test data returned by SendGrid."),
    updatedAt: s.string("The last update timestamp for this version."),
    templateId: s.string("The parent transactional template ID."),
    htmlContent: s.string("The HTML content stored on this version."),
    plainContent: s.string("The plain-text content stored on this version."),
    thumbnailUrl: s.string("The optional thumbnail preview URL returned by SendGrid."),
    generatePlainContent: s.boolean("Whether SendGrid generates plain text from the HTML content."),
  },
  {
    optional: [
      "editor",
      "subject",
      "testData",
      "updatedAt",
      "templateId",
      "htmlContent",
      "plainContent",
      "thumbnailUrl",
      "generatePlainContent",
    ],
    description: "One SendGrid transactional template version.",
  },
);

const transactionalTemplateSchema = s.object(
  {
    id: s.string("The transactional template ID."),
    name: s.string("The transactional template name."),
    generation: s.stringEnum("The transactional template generation returned by SendGrid.", ["legacy", "dynamic"]),
    updatedAt: s.string("The last update timestamp for this transactional template."),
    versions: s.array("The transactional template versions returned by SendGrid.", templateVersionSchema),
  },
  {
    description: "One SendGrid transactional template.",
  },
);

const sendEmailInputSchema = s.object(
  {
    from: senderSchema,
    to: s.array("The primary recipients for this email.", recipientSchema, { minItems: 1 }),
    cc: s.array("The optional Cc recipients.", recipientSchema, { minItems: 1 }),
    bcc: s.array("The optional Bcc recipients.", recipientSchema, { minItems: 1 }),
    replyTo: senderSchema,
    subject: s.nonEmptyString("The email subject line."),
    htmlContent: s.string("The optional HTML body content."),
    textContent: s.string("The optional plain-text body content."),
    templateId: s.nonEmptyString("The optional SendGrid template ID."),
    dynamicTemplateData: s.looseObject("The optional dynamic template data sent with the email."),
    categories: s.stringArray("The optional SendGrid categories attached to this email.", {
      maxItems: 10,
      itemDescription: "One SendGrid category name.",
    }),
    customArgs: s.record(
      "The optional custom arguments attached to this email.",
      s.string("One custom argument value."),
    ),
    sendAt: s.positiveInteger("The optional Unix timestamp that schedules this email."),
    attachments: s.array("The optional attachments included with this email.", attachmentSchema),
  },
  {
    required: ["from", "to"],
    description: "The request payload for sending a transactional email with SendGrid.",
  },
);
sendEmailInputSchema.allOf = [
  {
    anyOf: [{ required: ["templateId"] }, { required: ["subject"] }],
  },
  {
    anyOf: [{ required: ["templateId"] }, { required: ["htmlContent"] }, { required: ["textContent"] }],
  },
];

export const sendgridActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_info",
    description: "Get the current SendGrid account type and sender reputation.",
    requiredScopes: [],
    providerPermissions: ["user.account.read"],
    inputSchema: emptyObjectInputSchema,
    outputSchema: s.object(
      {
        accountType: s.string("The SendGrid account type."),
        reputation: s.number("The sender reputation score returned by SendGrid."),
      },
      {
        description: "The SendGrid account information returned by this action.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_user_scopes",
    description: "Get the SendGrid API key scopes available to the current credential.",
    requiredScopes: [],
    inputSchema: emptyObjectInputSchema,
    outputSchema: s.object(
      {
        scopes: s.array(
          "The SendGrid scopes available to this API key.",
          s.string("One SendGrid scope granted to this API key."),
        ),
      },
      {
        description: "The SendGrid scope list returned by this action.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_transactional_templates",
    description: "List SendGrid transactional templates with pagination metadata.",
    requiredScopes: [],
    providerPermissions: ["templates.read"],
    inputSchema: listTransactionalTemplatesInputSchema,
    outputSchema: s.object(
      {
        templates: s.array("The transactional templates returned by SendGrid.", transactionalTemplateSchema),
        count: s.nullableInteger("The total template count returned by SendGrid, or null when absent."),
        nextPageToken: s.nullableString("The next page token extracted from SendGrid pagination metadata."),
        previousPageToken: s.nullableString("The previous page token extracted from SendGrid pagination metadata."),
      },
      {
        description: "The normalized SendGrid transactional template list.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "send_email",
    description: "Send a transactional email with SendGrid Mail Send.",
    requiredScopes: [],
    providerPermissions: ["mail.send"],
    inputSchema: sendEmailInputSchema,
    outputSchema: s.object(
      {
        accepted: s.boolean("Whether SendGrid accepted the email for delivery."),
        messageId: s.nullableString("The optional SendGrid message ID response header."),
      },
      {
        description: "The normalized SendGrid mail submission result.",
      },
    ),
  }),
];
