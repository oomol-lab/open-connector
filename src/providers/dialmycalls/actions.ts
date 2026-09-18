import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dialmycalls" as const;

const uuidSchema = (description: string) => s.string(description, { format: "uuid" });
const timestampSchema = (description: string) => s.string(description);

const responseMetaSchema = s.looseRequiredObject("Metadata returned with every DialMyCalls API response.", {
  result: s.stringEnum("Whether the upstream request succeeded.", ["success", "failure"]),
  status: s.integer("The HTTP status recorded by DialMyCalls."),
  request_id: uuidSchema("The unique DialMyCalls request identifier."),
});

const groupReferenceSchema = s.looseRequiredObject("A group assigned to a DialMyCalls contact.", {
  id: uuidSchema("The unique DialMyCalls group identifier."),
});

const contactSchema = s.looseRequiredObject("A contact returned by DialMyCalls.", {
  id: uuidSchema("The unique DialMyCalls contact identifier."),
  firstname: s.string("The contact's first name."),
  lastname: s.string("The contact's last name."),
  miscellaneous: s.string("Miscellaneous contact information returned by DialMyCalls."),
  phone: s.string("The contact's phone number."),
  extension: s.string("The contact's phone extension."),
  email: s.string("The contact's email address."),
  extra1: s.string("Additional caller-defined contact data."),
  groups: s.array("The groups assigned to this contact.", groupReferenceSchema),
  created_at: timestampSchema("The timestamp when the contact was created."),
  updated_at: timestampSchema("The timestamp when the contact was last updated."),
});

const groupSchema = s.looseRequiredObject("A contact group returned by DialMyCalls.", {
  id: uuidSchema("The unique DialMyCalls group identifier."),
  name: s.string("The contact group name."),
  contacts_count: s.integer("The number of contacts assigned to the group."),
  created_at: timestampSchema("The timestamp when the group was created."),
  updated_at: timestampSchema("The timestamp when the group was last updated."),
});

const accountSchema = s.looseRequiredObject("The current DialMyCalls account details.", {
  credits_available: s.number("The number of credits available on the account."),
  created_at: timestampSchema("The timestamp when the DialMyCalls account was created."),
});

const contactIdInputSchema = s.object("The input payload for selecting one DialMyCalls contact.", {
  contact_id: uuidSchema("The unique DialMyCalls contact identifier."),
});

const groupIdInputSchema = s.object("The input payload for selecting one DialMyCalls group.", {
  group_id: uuidSchema("The unique DialMyCalls group identifier."),
});

const contactMutationFields = {
  firstname: s.optional(s.string("The contact's first name.")),
  lastname: s.optional(s.string("The contact's last name.")),
  phone: s.nonEmptyString("The contact's phone number."),
  extension: s.optional(s.string("The contact's phone extension.")),
  email: s.optional(s.string("The contact's email address.")),
  extra1: s.optional(s.string("Additional caller-defined contact data.")),
  groups: s.optional(
    s.array(
      "The DialMyCalls group IDs that the contact should belong to.",
      uuidSchema("A DialMyCalls group identifier."),
    ),
  ),
} as const;

const paginationFields = {
  range_start: s.withDefault(s.integer("The one-based index of the first record to return.", { minimum: 1 }), 1),
  range_end: s.withDefault(s.integer("The one-based index of the last record to return.", { minimum: 1 }), 100),
} as const;

const paginationSchema = (description: string, properties = {}) =>
  s.requiredObject(description, {
    ...properties,
    ...paginationFields,
  });

const contactEnvelopeSchema = s.requiredObject("A DialMyCalls contact response.", {
  results: contactSchema,
  meta: responseMetaSchema,
});

const contactsEnvelopeSchema = s.requiredObject("A DialMyCalls contact list response.", {
  results: s.array("The contacts returned by DialMyCalls.", contactSchema),
  meta: responseMetaSchema,
});

const groupEnvelopeSchema = s.requiredObject("A DialMyCalls contact group response.", {
  results: groupSchema,
  meta: responseMetaSchema,
});

const groupsEnvelopeSchema = s.requiredObject("A DialMyCalls contact group list response.", {
  results: s.array("The contact groups returned by DialMyCalls.", groupSchema),
  meta: responseMetaSchema,
});

const deleteEnvelopeSchema = (resource: string) =>
  s.requiredObject(`A DialMyCalls ${resource} deletion response.`, {
    results: s.looseRequiredObject(`The deleted DialMyCalls ${resource} reference.`, {
      id: uuidSchema(`The unique identifier of the deleted DialMyCalls ${resource}.`),
    }),
    meta: responseMetaSchema,
  });

export const dialMyCallsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description: "Get the current DialMyCalls account details and available credit balance.",
    inputSchema: s.requiredObject("This action does not require any input.", {}),
    outputSchema: s.requiredObject("The current DialMyCalls account response.", {
      results: accountSchema,
      meta: responseMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    operationType: "write",
    description: "Create a contact in the current DialMyCalls account.",
    inputSchema: s.object("The input payload for creating a DialMyCalls contact.", contactMutationFields),
    outputSchema: contactEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Get one DialMyCalls contact by identifier.",
    inputSchema: contactIdInputSchema,
    outputSchema: contactEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    operationType: "write",
    description: "Update one DialMyCalls contact by identifier.",
    inputSchema: s.requiredObject("The input payload for updating a DialMyCalls contact.", {
      contact_id: uuidSchema("The unique DialMyCalls contact identifier."),
      ...contactMutationFields,
    }),
    outputSchema: contactEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    operationType: "destructive",
    description: "Delete one DialMyCalls contact by identifier.",
    inputSchema: contactIdInputSchema,
    outputSchema: deleteEnvelopeSchema("contact"),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List DialMyCalls contacts with a bounded records range.",
    inputSchema: paginationSchema("The input payload for listing DialMyCalls contacts."),
    outputSchema: contactsEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_group_contacts",
    operationType: "read",
    description: "List contacts assigned to one DialMyCalls group.",
    inputSchema: paginationSchema("The input payload for listing contacts in one DialMyCalls group.", {
      group_id: uuidSchema("The unique DialMyCalls group identifier."),
    }),
    outputSchema: contactsEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "create_group",
    operationType: "write",
    description: "Create a contact group in the current DialMyCalls account.",
    inputSchema: s.requiredObject("The input payload for creating a DialMyCalls group.", {
      name: s.nonEmptyString("The contact group name."),
    }),
    outputSchema: groupEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_group",
    operationType: "read",
    description: "Get one DialMyCalls contact group by identifier.",
    inputSchema: groupIdInputSchema,
    outputSchema: groupEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "update_group",
    operationType: "write",
    description: "Update one DialMyCalls contact group by identifier.",
    inputSchema: s.requiredObject("The input payload for updating a DialMyCalls group.", {
      group_id: uuidSchema("The unique DialMyCalls group identifier."),
      name: s.nonEmptyString("The updated contact group name."),
    }),
    outputSchema: groupEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "delete_group",
    operationType: "destructive",
    description: "Delete one DialMyCalls contact group by identifier.",
    inputSchema: groupIdInputSchema,
    outputSchema: deleteEnvelopeSchema("group"),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    operationType: "read",
    description: "List DialMyCalls contact groups with a bounded records range.",
    inputSchema: paginationSchema("The input payload for listing DialMyCalls groups."),
    outputSchema: groupsEnvelopeSchema,
  }),
];

export type DialMyCallsActionName =
  | "get_account"
  | "create_contact"
  | "get_contact"
  | "update_contact"
  | "delete_contact"
  | "list_contacts"
  | "list_group_contacts"
  | "create_group"
  | "get_group"
  | "update_group"
  | "delete_group"
  | "list_groups";
