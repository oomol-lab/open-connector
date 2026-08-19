import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailbluster";

const tagListSchema = s.array(
  "MailBluster tags associated with the lead.",
  s.nonEmptyString("One MailBluster tag name."),
);
const customFieldsSchema = s.record(
  "Custom fields keyed by MailBluster field merge tag.",
  s.unknown("A JSON value for one custom field."),
);
const leadMetaSchema = s.looseObject(
  "Additional MailBluster lead metadata such as company, role, source, or geolocation values.",
);

const fieldSchema = s.looseObject("A MailBluster custom field object.", {
  id: s.integer("The MailBluster field identifier."),
  fieldLabel: s.string("The display label of the custom field."),
  fieldMergeTag: s.string("The merge tag used as the custom field key."),
  createdAt: s.dateTime("The timestamp when the field was created."),
  updatedAt: s.dateTime("The timestamp when the field was last updated."),
});

const leadSchema = s.looseObject("A MailBluster lead object.", {
  id: s.integer("The MailBluster lead identifier."),
  firstName: s.string("The lead's first name."),
  lastName: s.string("The lead's last name."),
  fullName: s.string("The lead's full name."),
  fields: customFieldsSchema,
  email: s.email("The lead's email address."),
  timezone: s.string("The lead's timezone."),
  ipAddress: s.string("The lead's IP address."),
  subscribed: s.boolean("Whether the lead is subscribed."),
  optInStatus: s.nullableString("The lead's opt-in status, or null when unavailable."),
  meta: leadMetaSchema,
  tags: tagListSchema,
  createdAt: s.dateTime("The timestamp when the lead was created."),
  updatedAt: s.dateTime("The timestamp when the lead was last updated."),
});

const leadHashInputSchema = s.object("Path parameters for a MailBluster lead action.", {
  lead_hash: s.nonEmptyString("The MD5 hash of the lead email address."),
});

const leadMutationFields = {
  firstName: s.nonEmptyString("The lead's first name."),
  lastName: s.nonEmptyString("The lead's last name."),
  email: s.email("The lead's email address."),
  timezone: s.nonEmptyString("The lead's timezone, such as America/Los_Angeles."),
  ipAddress: s.nonEmptyString("The lead's IP address."),
  subscribed: s.boolean("Whether the lead should be subscribed."),
  fields: customFieldsSchema,
  meta: leadMetaSchema,
  tags: tagListSchema,
};

const createLeadInputSchema = s.object(
  "Request body for creating a MailBluster lead.",
  {
    ...leadMutationFields,
    doubleOptIn: s.boolean("Whether MailBluster should require double opt-in for this lead."),
    overrideExisting: s.boolean("Whether MailBluster should update the existing lead when the email already exists."),
  },
  {
    optional: [
      "firstName",
      "lastName",
      "timezone",
      "ipAddress",
      "fields",
      "meta",
      "tags",
      "doubleOptIn",
      "overrideExisting",
    ],
  },
);

const updateLeadInputSchema = s.object(
  "Path parameter and request body for updating a MailBluster lead.",
  {
    lead_hash: s.nonEmptyString("The MD5 hash of the lead email address to update."),
    ...leadMutationFields,
    addTags: tagListSchema,
    removeTags: tagListSchema,
  },
  {
    optional: [
      "firstName",
      "lastName",
      "email",
      "timezone",
      "ipAddress",
      "subscribed",
      "fields",
      "meta",
      "tags",
      "addTags",
      "removeTags",
    ],
  },
);

const listFieldsOutputSchema = s.object("The MailBluster custom field list response.", {
  fields: s.array("The custom fields returned by MailBluster.", fieldSchema),
});

const deleteLeadOutputSchema = s.object("The MailBluster delete lead response.", {
  message: s.string("The MailBluster response message."),
  leadHash: s.string("The MD5 hash of the deleted lead email address."),
});

function leadMutationOutputSchema(description: string) {
  return s.object(description, {
    message: s.string("The MailBluster response message."),
    lead: leadSchema,
  });
}

export const mailblusterActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_fields",
    description: "List all MailBluster custom fields configured for the current brand.",
    inputSchema: s.object("This action does not require input.", {}),
    outputSchema: listFieldsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_lead",
    description:
      "Create a MailBluster lead with optional custom fields, metadata, tags, subscription state, and double opt-in settings.",
    inputSchema: createLeadInputSchema,
    outputSchema: leadMutationOutputSchema("The MailBluster create lead response."),
  }),
  defineProviderAction(service, {
    name: "get_lead",
    description: "Get one MailBluster lead by the MD5 hash of the lead email address.",
    inputSchema: leadHashInputSchema,
    outputSchema: leadSchema,
  }),
  defineProviderAction(service, {
    name: "update_lead",
    description:
      "Update one MailBluster lead by lead hash, including custom fields, metadata, subscription state, and tag changes.",
    inputSchema: updateLeadInputSchema,
    outputSchema: leadMutationOutputSchema("The MailBluster update lead response."),
  }),
  defineProviderAction(service, {
    name: "delete_lead",
    description: "Delete one MailBluster lead by the MD5 hash of the lead email address.",
    inputSchema: leadHashInputSchema,
    outputSchema: deleteLeadOutputSchema,
  }),
];
