import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "quentn";

const trimmedString = (description: string): JsonSchema => s.string(description, { minLength: 1, pattern: "\\S" });

const sortSchema = s.stringEnum("The order of Quentn list results.", ["asc", "desc"]);
const duplicateCheckMethodSchema = s.stringEnum("Method Quentn uses to search for duplicate contacts.", [
  "auto",
  "email",
  "none",
]);
const duplicateMergeMethodSchema = s.stringEnum("Method Quentn uses to merge a contact when a duplicate is found.", [
  "update_add",
  "update",
  "add",
]);

const stringArraySchema = (description: string): JsonSchema => s.array(description, trimmedString("One field name."));

const roleSchema = s.object(
  "A Quentn user role.",
  {
    rid: s.nullableInteger("Quentn role ID."),
    name: s.nullableString("Quentn role name."),
    raw: s.looseObject("Raw Quentn role payload."),
  },
  { required: ["rid", "name", "raw"] },
);

const userSchema = s.object(
  "A Quentn user.",
  {
    uid: s.nullableInteger("Quentn user ID."),
    mail: s.nullableString("User email address."),
    first_name: s.nullableString("User first name."),
    last_name: s.nullableString("User last name."),
    timezone: s.nullableString("User timezone."),
    language: s.nullableString("User language code."),
    created: s.nullableInteger("UNIX timestamp when the user was created."),
    changed: s.nullableInteger("UNIX timestamp when the user was changed."),
    roles: s.array("Roles assigned to the user.", roleSchema),
    raw: s.looseObject("Raw Quentn user payload."),
  },
  {
    required: ["uid", "mail", "first_name", "last_name", "timezone", "language", "created", "changed", "roles", "raw"],
  },
);

const contactFieldsSchema = s.looseObject("Quentn contact fields, including custom fields.", {
  first_name: s.string("Contact first name."),
  family_name: s.string("Contact family name."),
  mail: s.email("Contact email address."),
  request_ip: s.string("IPv4 address associated with this contact submission."),
  ba_street: s.string("Billing address street, required when mail is omitted."),
  ba_city: s.string("Billing address city, required when mail is omitted."),
  ba_postal_code: s.string("Billing address postal code, required when mail is omitted."),
});

const contactSchema = s.object(
  "A Quentn contact response.",
  {
    id: s.nullableInteger("Quentn contact ID."),
    first_name: s.nullableString("Contact first name."),
    family_name: s.nullableString("Contact family name."),
    mail: s.nullableString("Contact email address."),
    mail_status: s.nullableInteger("Quentn contact mail status."),
    raw: s.looseObject("Raw Quentn contact payload."),
  },
  { required: ["id", "first_name", "family_name", "mail", "mail_status", "raw"] },
);

const termSchema = s.object(
  "A Quentn term.",
  {
    id: s.nullableInteger("Quentn term ID."),
    name: s.nullableString("Quentn term name."),
    description: s.nullableString("Quentn term description."),
    deletion_blocked: s.nullableBoolean("Whether Quentn blocks deletion for this term."),
    raw: s.looseObject("Raw Quentn term payload."),
  },
  { required: ["id", "name", "description", "deletion_blocked", "raw"] },
);

const successOutputSchema = s.actionOutput(
  {
    success: s.boolean("Whether Quentn reported the operation as successful."),
    raw: s.looseObject("Raw Quentn response payload."),
  },
  "Quentn success response.",
);

const idOutputSchema = (description: string): JsonSchema =>
  s.actionOutput(
    {
      id: s.nullableInteger("ID returned by Quentn."),
      raw: s.looseObject("Raw Quentn response payload."),
    },
    description,
  );

const contactLookupInputSchema = s.actionInput(
  {
    contact_id: s.positiveInteger("Quentn contact ID."),
    fields: stringArraySchema("Optional contact field names to return."),
  },
  ["contact_id"],
  "Input fields for fetching a Quentn contact with optional returned fields.",
);

const contactIdInputSchema = s.actionInput(
  {
    contact_id: s.positiveInteger("Quentn contact ID."),
  },
  ["contact_id"],
  "Input fields for selecting a Quentn contact.",
);

const contactOutputSchema = s.actionOutput(
  {
    contact: contactSchema,
  },
  "Quentn contact response.",
);

const contactListOutputSchema = s.actionOutput(
  {
    contacts: s.array("Contacts returned by Quentn.", contactSchema),
    raw: s.array("Raw Quentn contact payloads.", s.looseObject("Raw Quentn contact payload.")),
  },
  "Quentn contact list response.",
);

const termIdInputSchema = s.actionInput(
  {
    term_id: s.positiveInteger("Quentn term ID."),
  },
  ["term_id"],
  "Input fields for selecting a Quentn term.",
);

const termOutputSchema = s.actionOutput(
  {
    term: termSchema,
  },
  "Quentn term response.",
);

export const quentnActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List Quentn users visible to the current API key.",
    inputSchema: s.actionInput(
      {
        range: s.nonNegativeInteger("Result range index, starting from 0."),
        limit: s.integer("Maximum number of users to return, between 1 and 20.", {
          minimum: 1,
          maximum: 20,
        }),
        sort: sortSchema,
      },
      [],
      "Pagination options for listing Quentn users.",
    ),
    outputSchema: s.actionOutput(
      {
        number_users: s.nullableInteger("Total number of users."),
        range: s.nullableInteger("Returned result range."),
        limit: s.nullableInteger("Returned result limit."),
        sort: s.nullableString("Returned sort order."),
        number_ranges: s.nullableInteger("Total number of result ranges."),
        users: s.array("Users returned by Quentn.", userSchema),
        raw: s.looseObject("Raw Quentn response payload."),
      },
      "Quentn user list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Get one Quentn user by ID.",
    inputSchema: s.actionInput(
      {
        user_id: s.positiveInteger("Quentn user ID."),
      },
      ["user_id"],
      "Input fields for fetching a Quentn user.",
    ),
    outputSchema: s.actionOutput(
      {
        user: userSchema,
      },
      "Quentn user response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_contact_by_id",
    operationType: "read",
    description: "Get one Quentn contact by contact ID.",
    inputSchema: contactLookupInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "find_contacts_by_email",
    operationType: "read",
    description: "Find Quentn contacts by email address.",
    inputSchema: s.actionInput(
      {
        email: s.email("Contact email address."),
        fields: stringArraySchema("Optional contact field names to return."),
      },
      ["email"],
      "Input fields for finding Quentn contacts by email.",
    ),
    outputSchema: contactListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    operationType: "write",
    description: "Create one Quentn contact with optional duplicate handling.",
    inputSchema: s.actionInput(
      {
        contact: contactFieldsSchema,
        duplicate_check_method: duplicateCheckMethodSchema,
        duplicate_merge_method: duplicateMergeMethodSchema,
        return_fields: stringArraySchema("Additional contact fields Quentn should return."),
        flood_limit: s.nonNegativeInteger(
          "Maximum contacts allowed from the same request_ip within an hour; 0 disables the check.",
        ),
        spam_protection: s.boolean("Whether Quentn should check request_ip for spam protection."),
      },
      ["contact"],
      "Input fields for creating a Quentn contact.",
    ),
    outputSchema: s.actionOutput(
      {
        contact: contactSchema,
      },
      "Quentn create contact response.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    operationType: "write",
    description: "Update one Quentn contact by contact ID.",
    inputSchema: s.actionInput(
      {
        contact_id: s.positiveInteger("Quentn contact ID."),
        updates: contactFieldsSchema,
        return_fields: stringArraySchema("Additional contact fields Quentn should return."),
      },
      ["contact_id", "updates"],
      "Input fields for updating a Quentn contact.",
    ),
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether Quentn reported a successful update."),
        contact: s.nullable(contactSchema),
        raw: s.looseObject("Raw Quentn response payload."),
      },
      "Quentn update contact response.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    operationType: "destructive",
    description: "Delete one Quentn contact by contact ID.",
    inputSchema: contactIdInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_terms",
    operationType: "read",
    description: "List Quentn terms.",
    inputSchema: s.actionInput(
      {
        offset: s.nonNegativeInteger("Number of terms to skip."),
        limit: s.positiveInteger("Maximum number of terms to return."),
      },
      [],
      "Pagination options for listing Quentn terms.",
    ),
    outputSchema: s.actionOutput(
      {
        terms: s.array("Terms returned by Quentn.", termSchema),
        raw: s.array("Raw Quentn term payloads.", s.looseObject("Raw Quentn term payload.")),
      },
      "Quentn term list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_term",
    operationType: "read",
    description: "Get one Quentn term by ID.",
    inputSchema: termIdInputSchema,
    outputSchema: termOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_term",
    operationType: "write",
    description: "Create one Quentn term.",
    inputSchema: s.actionInput(
      {
        name: trimmedString("Term name."),
        description: s.string("Term description."),
      },
      ["name"],
      "Input fields for creating a Quentn term.",
    ),
    outputSchema: idOutputSchema("Quentn create term response."),
  }),
  defineProviderAction(service, {
    name: "update_term",
    operationType: "write",
    description: "Update one Quentn term by ID.",
    inputSchema: s.actionInput(
      {
        term_id: s.positiveInteger("Quentn term ID."),
        name: trimmedString("Updated term name."),
        description: s.string("Updated term description."),
      },
      ["term_id"],
      "Input fields for updating a Quentn term.",
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_term",
    operationType: "destructive",
    description: "Delete one Quentn term by ID.",
    inputSchema: termIdInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contact_terms",
    operationType: "read",
    description: "List all Quentn terms assigned to one contact.",
    inputSchema: s.actionInput(
      {
        contact_id: s.positiveInteger("Quentn contact ID."),
      },
      ["contact_id"],
      "Input fields for listing terms assigned to a contact.",
    ),
    outputSchema: s.actionOutput(
      {
        terms: s.array("Terms assigned to the contact.", termSchema),
        raw: s.array("Raw Quentn contact term payloads.", s.looseObject("Raw Quentn term payload.")),
      },
      "Quentn contact terms response.",
    ),
  }),
  defineProviderAction(service, {
    name: "set_contact_terms",
    operationType: "write",
    description: "Set the complete Quentn term ID list assigned to one contact.",
    inputSchema: s.actionInput(
      {
        contact_id: s.positiveInteger("Quentn contact ID."),
        term_ids: s.array("Quentn term IDs to assign to the contact.", s.positiveInteger("Term ID."), {
          minItems: 1,
        }),
      },
      ["contact_id", "term_ids"],
      "Input fields for setting contact terms.",
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_contact_terms",
    operationType: "destructive",
    description: "Remove selected Quentn terms from one contact.",
    inputSchema: s.actionInput(
      {
        contact_id: s.positiveInteger("Quentn contact ID."),
        term_ids: s.array("Quentn term IDs to remove from the contact.", s.positiveInteger("Term ID."), {
          minItems: 1,
        }),
      },
      ["contact_id", "term_ids"],
      "Input fields for removing contact terms.",
    ),
    outputSchema: successOutputSchema,
  }),
];
