import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "docuseal" as const;

const idSchema = s.positiveInteger("The DocuSeal numeric identifier.");
const nullableStringSchema = s.nullable(s.string("The string value returned by DocuSeal."));
const loosePayloadSchema = s.looseObject("The raw DocuSeal object payload.");
const paginationSchema = s.object("DocuSeal pagination metadata.", {
  count: s.integer("The number of records returned in this page."),
  next: s.nullable(s.integer("The ID cursor for loading the next page.")),
  prev: s.nullable(s.integer("The ID cursor for loading the previous page.")),
});

const templateSummarySchema = s.object("A compact DocuSeal template summary returned by the connector.", {
  id: idSchema,
  slug: s.string("The unique template slug."),
  name: s.string("The template name."),
  source: nullableStringSchema,
  externalId: nullableStringSchema,
  folderName: nullableStringSchema,
  archivedAt: nullableStringSchema,
  createdAt: s.string("The date and time when the template was created."),
  updatedAt: s.string("The date and time when the template was last updated."),
  raw: loosePayloadSchema,
});

const submitterOutputSchema = s.object("A compact DocuSeal submitter response returned after creating a submission.", {
  id: idSchema,
  submissionId: idSchema,
  uuid: s.string("The submitter UUID."),
  email: nullableStringSchema,
  phone: nullableStringSchema,
  name: nullableStringSchema,
  role: nullableStringSchema,
  status: nullableStringSchema,
  slug: nullableStringSchema,
  externalId: nullableStringSchema,
  embedSrc: nullableStringSchema,
  sentAt: nullableStringSchema,
  openedAt: nullableStringSchema,
  completedAt: nullableStringSchema,
  declinedAt: nullableStringSchema,
  createdAt: nullableStringSchema,
  updatedAt: nullableStringSchema,
  raw: loosePayloadSchema,
});

const messageSchema = s.object(
  "Custom signature request email message settings.",
  {
    subject: s.string("Custom signature request email subject.", { minLength: 1 }),
    body: s.string("Custom signature request email body.", { minLength: 1 }),
  },
  { optional: ["subject", "body"] },
);

const fieldValidationSchema = s.object(
  "Validation rules for a DocuSeal submitter field.",
  {
    pattern: s.string("HTML field validation pattern string.", { minLength: 1 }),
    message: s.string("A custom error message to display on validation failure.", {
      minLength: 1,
    }),
    min: s.oneOf([s.number("A numeric minimum value."), s.string("A string minimum value.")], {
      description: "The minimum value constraint.",
    }),
    max: s.oneOf([s.number("A numeric maximum value."), s.string("A string maximum value.")], {
      description: "The maximum value constraint.",
    }),
    step: s.number("Increment step for a number field."),
  },
  { optional: ["pattern", "message", "min", "max", "step"] },
);

const fieldPreferencesSchema = s.object(
  "Display and formatting preferences for a DocuSeal field value.",
  {
    font_size: s.integer("Font size of the field value in pixels."),
    font_type: s.stringEnum("Font type of the field value.", ["bold", "italic", "bold_italic"]),
    font: s.stringEnum("Font family of the field value.", ["Times", "Helvetica", "Courier"]),
    color: s.stringEnum("Font color of the field value.", ["black", "white", "blue"]),
    background: s.stringEnum("Field box background color.", ["black", "white", "blue"]),
    align: s.stringEnum("Horizontal alignment of the field text value.", ["left", "center", "right"]),
    valign: s.stringEnum("Vertical alignment of the field text value.", ["top", "center", "bottom"]),
    format: s.string("Data format for different field types.", { minLength: 1 }),
    price: s.number("Price value of the payment field."),
    currency: s.stringEnum("Currency value of the payment field.", ["USD", "EUR", "GBP", "CAD", "AUD"]),
    mask: s.oneOf([s.integer("A numeric mask setting."), s.boolean("A boolean mask setting.")], {
      description: "Mask setting for the field.",
    }),
    reasons: s.array(
      "An array of signature reasons to choose from.",
      s.string("One signature reason.", { minLength: 1 }),
    ),
  },
  {
    optional: [
      "font_size",
      "font_type",
      "font",
      "color",
      "background",
      "align",
      "valign",
      "format",
      "price",
      "currency",
      "mask",
      "reasons",
    ],
  },
);

const submitterFieldSchema = s.object(
  "A field configuration for one DocuSeal submitter.",
  {
    name: s.string("Document template field name.", { minLength: 1 }),
    default_value: s.oneOf(
      [
        s.string("A string field value."),
        s.number("A numeric field value."),
        s.boolean("A boolean field value."),
        s.array(
          "An array field value.",
          s.oneOf([s.string("A string item."), s.number("A numeric item."), s.boolean("A boolean item.")], {
            description: "One array item value.",
          }),
        ),
      ],
      { description: "Default field value." },
    ),
    readonly: s.boolean("Whether the submitter can edit the predefined field value."),
    required: s.boolean("Whether the field is required."),
    title: s.string("Field title displayed on the signing form.", { minLength: 1 }),
    description: s.string("Field description displayed on the signing form.", { minLength: 1 }),
    validation: fieldValidationSchema,
    preferences: fieldPreferencesSchema,
  },
  {
    optional: ["default_value", "readonly", "required", "title", "description", "validation", "preferences"],
  },
);

const submitterInputSchema = s.object(
  "One DocuSeal submitter for a signature request.",
  {
    name: s.string("The name of the submitter.", { minLength: 1 }),
    role: s.string("The role name or title of the submitter.", { minLength: 1 }),
    email: s.email("The email address of the submitter."),
    phone: s.string("The E.164 phone number of the submitter.", { minLength: 1 }),
    values: s.looseObject("Pre-filled values keyed by template field name."),
    external_id: s.string("Your application-specific submitter identifier.", { minLength: 1 }),
    completed: s.boolean("Whether to mark the submitter as completed and auto-signed via API."),
    metadata: s.looseObject("Metadata object with additional submitter information."),
    send_email: s.boolean("Whether DocuSeal should email this submitter."),
    send_sms: s.boolean("Whether DocuSeal should send this request via SMS."),
    reply_to: s.email("Reply-To address for this submitter's notification emails."),
    completed_redirect_url: s.url("Submitter-specific URL to redirect to after completion."),
    order: s.integer("The order of the submitter in the workflow."),
    require_phone_2fa: s.boolean("Whether to require phone 2FA for this submitter."),
    require_email_2fa: s.boolean("Whether to require email 2FA for this submitter."),
    message: messageSchema,
    fields: s.array("Field configurations for this submitter.", submitterFieldSchema),
    roles: s.array("Role names to merge into this submitter.", s.string("One role name.")),
  },
  {
    optional: [
      "name",
      "role",
      "email",
      "phone",
      "values",
      "external_id",
      "completed",
      "metadata",
      "send_email",
      "send_sms",
      "reply_to",
      "completed_redirect_url",
      "order",
      "require_phone_2fa",
      "require_email_2fa",
      "message",
      "fields",
      "roles",
    ],
  },
);

export type DocusealActionName = "list_templates" | "get_template" | "create_submission";

export const docusealActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_templates",
    operationType: "read",
    description: "List DocuSeal document templates with optional filters and ID-based pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "The filters and pagination options for listing DocuSeal templates.",
      {
        q: s.string("Filter templates by partial name match.", { minLength: 1 }),
        slug: s.string("Filter templates by unique slug.", { minLength: 1 }),
        external_id: s.string("Filter templates by external ID.", { minLength: 1 }),
        folder: s.string("Filter templates by folder name.", { minLength: 1 }),
        archived: s.boolean("Whether to return archived templates instead of active ones."),
        limit: s.integer("The number of templates to return. The documented maximum is 100.", {
          minimum: 1,
          maximum: 100,
        }),
        after: s.integer("Return templates with IDs greater than this value."),
        before: s.integer("Return templates with IDs less than this value."),
      },
      {
        optional: ["q", "slug", "external_id", "folder", "archived", "limit", "after", "before"],
      },
    ),
    outputSchema: s.object("The connector-normalized DocuSeal template list.", {
      data: s.array("The templates returned by DocuSeal.", templateSummarySchema),
      pagination: paginationSchema,
      raw: loosePayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_template",
    operationType: "read",
    description: "Retrieve one DocuSeal template by ID and return compact metadata with the raw template payload.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving a DocuSeal template.", {
      id: idSchema,
    }),
    outputSchema: templateSummarySchema,
  }),
  defineProviderAction(service, {
    name: "create_submission",
    operationType: "write",
    description: "Create a DocuSeal signature request from an existing template and return the created submitters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for creating a DocuSeal submission from an existing template.",
      {
        template_id: idSchema,
        submitters: s.array("The submitters for the signature request.", submitterInputSchema, {
          minItems: 1,
        }),
        send_email: s.boolean("Whether to send signature request emails."),
        send_sms: s.boolean("Whether to send signature requests via SMS."),
        order: s.stringEnum("Submission delivery order.", ["preserved", "random"]),
        completed_redirect_url: s.url("URL to redirect to after submission completion."),
        bcc_completed: s.email("BCC address for signed documents after completion."),
        reply_to: s.email("Reply-To address for notification emails."),
        expire_at: s.string("Expiration date and time for the submission.", { minLength: 1 }),
        variables: s.looseObject("Dynamic content variables for the template."),
        message: messageSchema,
      },
      {
        optional: [
          "send_email",
          "send_sms",
          "order",
          "completed_redirect_url",
          "bcc_completed",
          "reply_to",
          "expire_at",
          "variables",
          "message",
        ],
      },
    ),
    outputSchema: s.object("The connector-normalized DocuSeal submission creation result.", {
      submitters: s.array("The submitters returned by DocuSeal.", submitterOutputSchema),
      raw: s.array("The raw submitter objects returned by DocuSeal.", loosePayloadSchema),
    }),
  }),
];
