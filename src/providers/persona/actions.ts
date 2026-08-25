import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "persona";

const personaResourceIdentifierSchema = s.object("A Persona JSON:API resource identifier.", {
  id: s.nonEmptyString("The Persona resource ID."),
  type: s.nonEmptyString("The Persona resource type."),
});

const personaInquiryAttributesSchema = s.object(
  "Persona inquiry attributes returned by the API.",
  {
    status: s.string("The current Persona inquiry status."),
    referenceId: s.nullableString("The external reference ID attached to the inquiry."),
    note: s.nullableString("The note attached to the inquiry."),
    tags: s.array("The tags attached to the inquiry.", s.string("One Persona inquiry tag.")),
    createdAt: s.nullableString("The timestamp when the inquiry was created."),
    updatedAt: s.nullableString("The timestamp when the inquiry was last updated."),
    completedAt: s.nullableString("The timestamp when the inquiry was completed."),
    decisionedAt: s.nullableString("The timestamp when the inquiry was decisioned."),
    fields: s.looseObject("Template-specific field values returned by Persona."),
  },
  {
    optional: [
      "status",
      "referenceId",
      "note",
      "tags",
      "createdAt",
      "updatedAt",
      "completedAt",
      "decisionedAt",
      "fields",
    ],
    additionalProperties: true,
  },
);

const personaInquirySchema = s.object(
  "One Persona inquiry.",
  {
    id: s.nonEmptyString("The Persona inquiry ID."),
    type: s.nonEmptyString("The Persona resource type."),
    attributes: personaInquiryAttributesSchema,
    relationships: s.looseObject("Persona relationships included on the inquiry."),
    raw: s.looseObject("The raw Persona inquiry object."),
  },
  { optional: ["attributes", "relationships", "raw"], additionalProperties: true },
);

const personaLinksSchema = s.object("Persona pagination links.", {
  prev: s.nullableString("The previous page URL returned by Persona, or null."),
  next: s.nullableString("The next page URL returned by Persona, or null."),
});

const pageInputSchema = s.object(
  "Cursor pagination options for Persona list endpoints.",
  {
    after: s.nonEmptyString("Object ID cursor for the next page."),
    before: s.nonEmptyString("Object ID cursor for the previous page."),
    size: s.positiveInteger("The maximum number of objects to return."),
  },
  { optional: ["after", "before", "size"] },
);

const sparseFieldsSchema = s.record(
  "Sparse fieldsets keyed by Persona resource type.",
  s.nonEmptyString("Comma-separated fields for one resource type."),
);

const listInquiriesInputSchema = s.object(
  "Input payload for listing Persona inquiries.",
  {
    page: pageInputSchema,
    filter: s.object(
      "Persona inquiry filters.",
      {
        inquiryId: s.nonEmptyString("Comma-separated inquiry IDs starting with inq_ to filter by."),
        accountId: s.nonEmptyString("Comma-separated account IDs starting with act_ to filter by."),
        note: s.nonEmptyString("Filter inquiries by note. Must be the only filter."),
        referenceId: s.nonEmptyString("Filter inquiries by reference ID."),
        inquiryTemplateId: s.nonEmptyString("Comma-separated inquiry template IDs starting with itmpl_ to filter by."),
        templateId: s.nonEmptyString("Comma-separated legacy template IDs starting with tmpl_ to filter by."),
        status: s.nonEmptyString("Comma-separated inquiry statuses to filter by."),
        createdAtStart: s.nonEmptyString("Filter inquiries created at or after this ISO timestamp."),
        createdAtEnd: s.nonEmptyString("Filter inquiries created at or before this ISO timestamp."),
      },
      {
        optional: [
          "inquiryId",
          "accountId",
          "note",
          "referenceId",
          "inquiryTemplateId",
          "templateId",
          "status",
          "createdAtStart",
          "createdAtEnd",
        ],
      },
    ),
    include: s.nonEmptyString("Comma-separated relationship paths to include in the response."),
    fields: sparseFieldsSchema,
  },
  { optional: ["page", "filter", "include", "fields"] },
);

const inquiryIdInputSchema = s.object(
  "Input payload for a Persona inquiry lookup.",
  {
    inquiryId: s.nonEmptyString("The Persona inquiry ID starting with inq_."),
    include: s.nonEmptyString("Comma-separated relationship paths to include in the response."),
    fields: sparseFieldsSchema,
  },
  { optional: ["include", "fields"] },
);

const relationshipSchema = s.record(
  "Additional Persona JSON:API relationships to include in the create request.",
  s.object("One Persona relationship wrapper.", {
    data: s.anyOf("The related resource identifier or identifiers.", [
      personaResourceIdentifierSchema,
      s.array("Related resource identifiers.", personaResourceIdentifierSchema),
    ]),
  }),
);

const createInquiryInputSchema = s.object(
  "Input payload for creating a Persona inquiry.",
  {
    inquiryTemplateId: s.nonEmptyString("The Dynamic Flow inquiry template ID starting with itmpl_."),
    referenceId: s.nonEmptyString("External reference ID to attach to the inquiry."),
    accountId: s.nonEmptyString("Existing Persona account ID to attach to the inquiry."),
    note: s.nonEmptyString("Note to attach to the inquiry."),
    tags: s.array("Tags to attach to the inquiry.", s.nonEmptyString("One Persona tag.")),
    fields: s.looseObject("Template-specific prefill fields accepted by Persona."),
    relationships: relationshipSchema,
    include: s.nonEmptyString("Comma-separated relationship paths to include in the response."),
    fieldsToSerialize: sparseFieldsSchema,
    idempotencyKey: s.nonEmptyString("Idempotency key used by Persona to make the create request safe to retry."),
  },
  {
    optional: [
      "referenceId",
      "accountId",
      "note",
      "tags",
      "fields",
      "relationships",
      "include",
      "fieldsToSerialize",
      "idempotencyKey",
    ],
  },
);

const updateInquiryInputSchema = s.object(
  "Input payload for updating a Persona inquiry.",
  {
    inquiryId: s.nonEmptyString("The Persona inquiry ID starting with inq_."),
    referenceId: s.nonEmptyString("External reference ID to attach to the inquiry."),
    note: s.nonEmptyString("Note to attach to the inquiry."),
    tags: s.array("Tags to attach to the inquiry.", s.nonEmptyString("One Persona tag.")),
    fields: s.looseObject("Template-specific field updates accepted by Persona."),
    include: s.nonEmptyString("Comma-separated relationship paths to include in the response."),
    fieldsToSerialize: sparseFieldsSchema,
    idempotencyKey: s.nonEmptyString("Idempotency key used by Persona to make the update request safe to retry."),
  },
  {
    optional: ["referenceId", "note", "tags", "fields", "include", "fieldsToSerialize", "idempotencyKey"],
  },
);

const inquiryOutputSchema = s.object("The normalized Persona inquiry response.", {
  inquiry: personaInquirySchema,
  included: s.array(
    "Related Persona resources included in the response.",
    s.looseObject("One included Persona resource."),
  ),
  raw: s.looseObject("The raw Persona response payload."),
});

export const personaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_inquiries",
    description: "List Persona inquiries across inquiry templates with documented cursor pagination and filters.",
    requiredScopes: [],
    inputSchema: listInquiriesInputSchema,
    outputSchema: s.object("The normalized Persona inquiry-list response.", {
      inquiries: s.array("The Persona inquiries returned by the API.", personaInquirySchema),
      links: personaLinksSchema,
      included: s.array(
        "Related Persona resources included in the response.",
        s.looseObject("One included Persona resource."),
      ),
      raw: s.looseObject("The raw Persona response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_inquiry",
    description: "Retrieve one Persona inquiry by ID.",
    requiredScopes: [],
    inputSchema: inquiryIdInputSchema,
    outputSchema: inquiryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_inquiry",
    description: "Create a Persona inquiry with an inquiry template and optional JSON prefilled attributes.",
    requiredScopes: [],
    inputSchema: createInquiryInputSchema,
    outputSchema: inquiryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_inquiry",
    description: "Update supported Persona inquiry attributes such as reference ID, note, tags, or fields.",
    requiredScopes: [],
    inputSchema: updateInquiryInputSchema,
    outputSchema: inquiryOutputSchema,
  }),
];
