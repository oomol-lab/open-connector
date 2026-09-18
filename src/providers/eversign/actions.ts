import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "eversign";

const rawObjectSchema = s.looseObject("The raw object returned by the Xodo Sign API.");
const nullableStringSchema = s.nullable(s.string("The string value returned by Xodo Sign when available."));
const nullableIntegerSchema = s.nullable(s.integer("The integer value returned by Xodo Sign when available."));

const businessIdSchema = s.integer("The Xodo Sign business ID.", { minimum: 1 });
const documentHashSchema = s.nonEmptyString("The Xodo Sign document or template hash.");

const businessSchema = s.requiredObject("One Xodo Sign business.", {
  businessId: businessIdSchema,
  businessStatus: s.integer("The business status, where 1 is active and 2 is inactive or deleted."),
  businessIdentifier: s.string("The workspace URL subdomain for the business."),
  businessName: s.string("The display name of the business."),
  creationTimestamp: s.integer("The business creation time as a Unix timestamp."),
  isPrimary: s.boolean("Whether this is the account's primary business."),
  raw: rawObjectSchema,
});

const signerOutputSchema = s.requiredObject("One signer returned by Xodo Sign.", {
  signerId: s.integer("The signer ID within the document."),
  name: nullableStringSchema,
  email: nullableStringSchema,
  role: nullableStringSchema,
  order: nullableIntegerSchema,
  signed: s.boolean("Whether this signer has signed the document."),
  status: nullableStringSchema,
  raw: rawObjectSchema,
});

const documentSchema = s.requiredObject("A normalized Xodo Sign document or template.", {
  documentHash: documentHashSchema,
  title: nullableStringSchema,
  message: nullableStringSchema,
  requesterEmail: nullableStringSchema,
  templateId: nullableStringSchema,
  created: nullableIntegerSchema,
  completed: nullableIntegerSchema,
  expires: nullableIntegerSchema,
  isDraft: s.boolean("Whether the document is a draft."),
  isTemplate: s.boolean("Whether the object is a template."),
  isCompleted: s.boolean("Whether all required signing is complete."),
  isArchived: s.boolean("Whether the document is archived."),
  isDeleted: s.boolean("Whether the document is deleted."),
  isTrashed: s.boolean("Whether the document is in trash."),
  isCancelled: s.boolean("Whether the document is cancelled."),
  signers: s.array("The signers attached to the document.", signerOutputSchema),
  raw: rawObjectSchema,
});

const documentSelectionInputSchema = s.requiredObject("Input for selecting one Xodo Sign document or template.", {
  businessId: businessIdSchema,
  documentHash: documentHashSchema,
});

const sourceFileSchema = s.oneOf(
  [
    s.requiredObject("A file Xodo Sign should fetch from a public URL.", {
      name: s.nonEmptyString("The file name shown in Xodo Sign."),
      fileUrl: s.url("A publicly accessible file URL that Xodo Sign should fetch."),
    }),
    s.requiredObject("A file already uploaded to Xodo Sign.", {
      name: s.nonEmptyString("The file name shown in Xodo Sign."),
      fileId: s.nonEmptyString("An existing Xodo Sign file ID."),
    }),
  ],
  { description: "One file Xodo Sign should include in a new document." },
);

const documentSignerSchema = s.object(
  "One signer for a new Xodo Sign document.",
  {
    id: s.integer("A unique signer ID within this document.", { minimum: 1 }),
    name: s.nonEmptyString("The signer's full name."),
    email: s.email("The signer's email address."),
    order: s.integer("The one-based signing order when signer ordering is enabled.", {
      minimum: 1,
    }),
    pin: s.nonEmptyString("An optional PIN the signer must enter."),
    message: s.nonEmptyString("A custom delivery message for this signer."),
    language: s.nonEmptyString("The two-letter language code for signing emails and pages."),
  },
  { optional: ["order", "pin", "message", "language"] },
);

const recipientSchema = s.object(
  "One non-signing recipient who receives document notifications.",
  {
    name: s.nonEmptyString("The recipient's full name."),
    email: s.email("The recipient's email address."),
    language: s.nonEmptyString("The two-letter language code for recipient emails and status pages."),
  },
  { optional: ["language"] },
);

const templateSignerSchema = s.object(
  "One signer assigned to a role in an existing Xodo Sign template.",
  {
    role: s.nonEmptyString("The signer role name defined by the template."),
    name: s.nonEmptyString("The signer's full name when the template role does not prefill one."),
    email: s.email("The signer's email address when the template role does not prefill one."),
    pin: s.nonEmptyString("An optional PIN the signer must enter."),
    message: s.nonEmptyString("A custom delivery message for this signer."),
    deliverEmail: s.boolean("Whether Xodo Sign should email this signer for an embedded document."),
    language: s.nonEmptyString("The two-letter language code for signing emails and pages."),
  },
  {
    optional: ["name", "email", "pin", "message", "deliverEmail", "language"],
  },
);

const templateRecipientSchema = s.object(
  "One non-signing recipient assigned to a template role.",
  {
    role: s.nonEmptyString("The recipient role name defined by the template."),
    name: s.nonEmptyString("The recipient's full name."),
    email: s.email("The recipient's email address."),
    language: s.nonEmptyString("The two-letter language code for recipient emails and status pages."),
  },
  { optional: ["language"] },
);

const mergeFieldSchema = s.requiredObject("One merge field value for a template.", {
  identifier: s.nonEmptyString("The merge field identifier defined by the template."),
  value: s.string("The value Xodo Sign should place in the merge field."),
});

const commonDocumentOptions = {
  sandbox: s.boolean("Whether to create a non-binding sandbox document."),
  title: s.nonEmptyString("The document title."),
  message: s.nonEmptyString("The general message sent with the document."),
  customRequesterName: s.nonEmptyString("A verified custom requester name shown in document communication."),
  customRequesterEmail: s.email("A verified custom requester email shown in document communication."),
  redirectUrl: s.url("The URL used after a signer completes signing."),
  declineRedirectUrl: s.url("The URL used after a signer declines signing."),
  client: s.nonEmptyString("An internal application reference for this document."),
  expires: s.integer("The document expiration time as a Unix timestamp.", {
    minimum: 1,
  }),
  embeddedSigningEnabled: s.boolean("Whether signing should be available through an embedded iframe."),
};

const optionalCommonDocumentOptions: readonly string[] = [
  "sandbox",
  "title",
  "message",
  "customRequesterName",
  "customRequesterEmail",
  "redirectUrl",
  "declineRedirectUrl",
  "client",
  "expires",
  "embeddedSigningEnabled",
];

export const eversignActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_businesses",
    operationType: "read",
    description: "List businesses available to the connected Xodo Sign API key.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input for listing Xodo Sign businesses.", {}),
    outputSchema: s.requiredObject("Businesses available to the connected account.", {
      businesses: s.array("The Xodo Sign businesses.", businessSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_document",
    operationType: "write",
    description: "Create an Xodo Sign document from public file URLs or existing Xodo Sign file IDs.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating a Xodo Sign document from files.",
      {
        businessId: businessIdSchema,
        files: s.array("Files to include in the document.", sourceFileSchema, {
          minItems: 1,
        }),
        signers: s.array("People required to sign the document.", documentSignerSchema, {
          minItems: 1,
        }),
        recipients: s.array("Non-signing recipients who receive document notifications.", recipientSchema),
        isDraft: s.boolean("Whether to save the document as a draft without sending it."),
        useSignerOrder: s.boolean("Whether signers must sign in the provided order."),
        reminders: s.boolean("Whether Xodo Sign should send automatic reminders."),
        requireAllSigners: s.boolean("Whether every signer must sign before the document is complete."),
        flexibleSigning: s.boolean("Whether signers may place their own fields during signing."),
        useHiddenTags: s.boolean("Whether Xodo Sign should parse hidden tags already present in the files."),
        ...commonDocumentOptions,
      },
      {
        optional: [
          "recipients",
          "isDraft",
          "useSignerOrder",
          "reminders",
          "requireAllSigners",
          "flexibleSigning",
          "useHiddenTags",
          ...optionalCommonDocumentOptions,
        ],
      },
    ),
    outputSchema: s.requiredObject("The newly created Xodo Sign document.", {
      document: documentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_document_from_template",
    operationType: "write",
    description: "Create an Xodo Sign document from an existing template, role assignments, and merge fields.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating a document from a Xodo Sign template.",
      {
        businessId: businessIdSchema,
        templateId: s.nonEmptyString("The document hash of the Xodo Sign template to use."),
        signers: s.array("Signer assignments for required template roles.", templateSignerSchema, {
          minItems: 1,
        }),
        recipients: s.array("Recipient assignments for template CC roles.", templateRecipientSchema),
        mergeFields: s.array("Values for merge fields defined by the template.", mergeFieldSchema),
        ...commonDocumentOptions,
      },
      {
        optional: ["recipients", "mergeFields", ...optionalCommonDocumentOptions],
      },
    ),
    outputSchema: s.requiredObject("The Xodo Sign document created from the template.", {
      document: documentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_document",
    operationType: "read",
    description: "Retrieve an Xodo Sign document or template by its document hash.",
    requiredScopes: [],
    inputSchema: documentSelectionInputSchema,
    outputSchema: s.requiredObject("The requested Xodo Sign document or template.", {
      document: documentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_documents",
    operationType: "read",
    description: "List Xodo Sign documents for a business, optionally filtering by documented status.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Xodo Sign documents.",
      {
        businessId: businessIdSchema,
        type: s.stringEnum("The document status filter.", [
          "all",
          "my_action_required",
          "waiting_for_others",
          "completed",
          "drafts",
          "cancelled",
        ]),
        limit: s.integer("The maximum number of documents to return.", {
          minimum: 1,
        }),
        page: s.integer("The one-based result page.", { minimum: 1 }),
      },
      { optional: ["type", "limit", "page"] },
    ),
    outputSchema: s.requiredObject("A page of Xodo Sign documents.", {
      documents: s.array("The Xodo Sign documents.", documentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    operationType: "read",
    description: "List active, archived, or draft Xodo Sign templates for a business.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Xodo Sign templates.",
      {
        businessId: businessIdSchema,
        type: s.stringEnum("The template status filter.", ["templates", "templates_archived", "template_drafts"]),
        limit: s.integer("The maximum number of templates to return.", {
          minimum: 1,
        }),
        page: s.integer("The one-based result page.", { minimum: 1 }),
      },
      { optional: ["type", "limit", "page"] },
    ),
    outputSchema: s.requiredObject("A page of Xodo Sign templates.", {
      templates: s.array("The Xodo Sign templates.", documentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "send_reminder",
    operationType: "write",
    description: "Send a reminder to one signer of a Xodo Sign document.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input for sending a Xodo Sign reminder.", {
      businessId: businessIdSchema,
      documentHash: documentHashSchema,
      signerId: s.integer("The signer ID to remind.", { minimum: 1 }),
    }),
    outputSchema: s.requiredObject("The reminder operation result.", {
      success: s.boolean("Whether Xodo Sign sent the reminder successfully."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "reassign_signer",
    operationType: "destructive",
    description: "Replace a signer on a Xodo Sign document and notify the affected participants.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for reassigning a Xodo Sign signer.",
      {
        businessId: businessIdSchema,
        documentHash: documentHashSchema,
        signerId: s.integer("The signer ID to replace.", { minimum: 1 }),
        newSignerName: s.nonEmptyString("The replacement signer's full name."),
        newSignerEmail: s.email("The replacement signer's email address."),
        reason: s.nonEmptyString("The reason for the signer reassignment."),
      },
      { optional: ["reason"] },
    ),
    outputSchema: s.requiredObject("The signer reassignment result.", {
      success: s.boolean("Whether Xodo Sign reassigned the signer successfully."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_audit_log",
    operationType: "read",
    description: "Retrieve the complete audit event history for a Xodo Sign document.",
    requiredScopes: [],
    inputSchema: documentSelectionInputSchema,
    outputSchema: s.requiredObject("The Xodo Sign document audit log.", {
      events: s.array(
        "Audit events in the order returned by Xodo Sign.",
        s.requiredObject("One Xodo Sign audit event.", {
          entryId: s.integer("The audit log entry ID."),
          eventType: s.string("The audit event type."),
          signerId: nullableIntegerSchema,
          signerName: nullableStringSchema,
          signerEmail: nullableStringSchema,
          timestamp: s.integer("The event time as a Unix timestamp."),
          raw: rawObjectSchema,
        }),
      ),
    }),
  }),
];
