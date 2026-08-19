import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "signwell";

const rawObjectSchema = s.looseObject("The raw SignWell object returned by the API.");
const idSchema = s.nonEmptyString("The SignWell identifier.");
const optionalTextSchema = s.nonEmptyString("The string value.");
const metadataSchema = s.record("Optional SignWell metadata key-value pairs.", s.string("One metadata string value."));
const recipientInputSchema = s.object(
  "One SignWell recipient.",
  {
    id: optionalTextSchema,
    name: s.nonEmptyString("The recipient name."),
    email: s.email("The recipient email address."),
    role: optionalTextSchema,
    placeholder_name: optionalTextSchema,
    subject: optionalTextSchema,
    message: optionalTextSchema,
    send_email: s.boolean("Whether SignWell should email this recipient."),
    send_email_delay: s.integer("Delayed email notification window in minutes."),
    signing_order: s.integer("The recipient signing order."),
  },
  {
    required: ["name", "email"],
    optional: [
      "id",
      "role",
      "placeholder_name",
      "subject",
      "message",
      "send_email",
      "send_email_delay",
      "signing_order",
    ],
  },
);
const documentFileInputSchema = {
  ...s.object(
    "One additional file reference sent to SignWell.",
    {
      name: s.nonEmptyString("The name of the uploaded file."),
      file_url: s.url("The publicly accessible file URL that SignWell should fetch."),
      file_base64: s.nonEmptyString("The RFC 4648 base64-encoded file content."),
    },
    { required: ["name"], optional: ["file_url", "file_base64"] },
  ),
  oneOf: [{ required: ["name", "file_url"] }, { required: ["name", "file_base64"] }],
} satisfies JsonSchema;
const labelInputSchema = s.object("One SignWell label update item.", {
  name: s.nonEmptyString("The SignWell label name."),
});
const checkboxGroupInputSchema = s.looseObject(
  "One SignWell checkbox group definition.",
  {
    group_name: s.nonEmptyString("A unique checkbox group identifier."),
    checkbox_ids: s.array("The checkbox API IDs grouped together.", s.nonEmptyString("One checkbox API ID.")),
  },
  { description: "One SignWell checkbox group definition." },
);

const documentMutationFields = {
  test_mode: s.boolean("Whether SignWell should create the document in test mode."),
  name: optionalTextSchema,
  subject: optionalTextSchema,
  message: optionalTextSchema,
  expires_in: s.integer("Number of days until the document expires."),
  reminders: s.boolean("Whether SignWell should send automatic reminders."),
  apply_signing_order: s.boolean("Whether recipients must sign in signing_order sequence."),
  api_application_id: optionalTextSchema,
  embedded_signing: s.boolean("Whether to enable embedded signing."),
  embedded_signing_notifications: s.boolean("Whether embedded signing should send notifications."),
  custom_requester_name: optionalTextSchema,
  custom_requester_email: s.email("The custom requester email address."),
  redirect_url: s.url("The URL where SignWell redirects after signing."),
  allow_decline: s.boolean("Whether recipients can decline signing."),
  allow_reassign: s.boolean("Whether recipients can reassign signing."),
  decline_redirect_url: s.url("The URL where SignWell redirects after a decline."),
  metadata: metadataSchema,
  labels: s.array("Labels to assign to the SignWell document.", labelInputSchema),
  checkbox_groups: s.array("Checkbox groups to create on the document.", checkboxGroupInputSchema),
};

export const signwellActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_me",
    description: "Get the authenticated SignWell account, workspace, and user information.",
    inputSchema: s.object("This action does not require any input fields.", {}),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Retrieve one SignWell document template by ID.",
    inputSchema: s.object("The SignWell template to retrieve.", {
      id: idSchema,
    }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_document_from_template",
    description: "Create a SignWell document from one or more templates.",
    inputSchema: s.object(
      "The SignWell template document creation payload.",
      {
        template_id: idSchema,
        template_ids: s.array("Template IDs used to create the document.", idSchema),
        draft: s.boolean("Whether to leave the created document as a draft."),
        with_signature_page: s.boolean("Whether to append a signature page."),
        text_tags: s.boolean("Whether SignWell should parse text tags."),
        language: optionalTextSchema,
        recipients: s.array("Recipients assigned to the SignWell document.", recipientInputSchema),
        exclude_placeholders: s.array("Template placeholder names to exclude.", optionalTextSchema),
        template_fields: s.array("Template field values passed through to SignWell.", rawObjectSchema),
        files: s.array("Additional files to attach to the document.", documentFileInputSchema),
        fields: s.array("Field definitions passed through to SignWell.", rawObjectSchema),
        attachment_requests: s.array("Attachment requests passed through to SignWell.", rawObjectSchema),
        copied_contacts: s.array("Copied contacts passed through to SignWell.", rawObjectSchema),
        ...documentMutationFields,
      },
      {
        optional: [
          "template_id",
          "template_ids",
          "draft",
          "with_signature_page",
          "text_tags",
          "language",
          "recipients",
          "exclude_placeholders",
          "template_fields",
          "files",
          "fields",
          "attachment_requests",
          "copied_contacts",
          ...Object.keys(documentMutationFields),
        ],
      },
    ),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_document",
    description: "Retrieve one SignWell document by ID.",
    inputSchema: s.object("The SignWell document to retrieve.", {
      id: idSchema,
    }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "send_document",
    description: "Send a SignWell draft document for signing.",
    inputSchema: s.object(
      "The SignWell document send payload.",
      {
        id: idSchema,
        ...documentMutationFields,
      },
      { required: ["id"], optional: Object.keys(documentMutationFields) },
    ),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "send_document_reminder",
    description: "Send a reminder for a SignWell document.",
    inputSchema: s.object(
      "The SignWell reminder payload.",
      {
        id: idSchema,
        recipients: s.array("Optional recipient subset to remind.", recipientInputSchema),
      },
      { required: ["id"], optional: ["recipients"] },
    ),
    outputSchema: rawObjectSchema,
  }),
];
