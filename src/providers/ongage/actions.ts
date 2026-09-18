import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ongage";

const listIdSchema = s.positiveInteger("The numeric Ongage list ID.");
const listTypeSchema = s.stringEnum("The Ongage list type.", ["sending", "suppression"]);
const sortOrderSchema = s.stringEnum("The list sort direction.", ["ASC", "DESC"]);
const contactStatusSchema = s.stringEnum("The contact status transition to apply.", [
  "resubscribe",
  "unsubscribe",
  "bounce",
  "complaint",
  "soft_bounce",
]);
const customFieldsSchema = s.looseObject("Account-defined Ongage contact fields keyed by the list field name.");
const listResourceSchema = s.looseObject("An Ongage list resource.", {
  id: s.integer("The numeric list ID."),
  account_id: s.integer("The numeric Ongage account ID."),
  name: s.string("The list name."),
  type: listTypeSchema,
});
const contactResourceSchema = s.looseObject("An Ongage contact resource.", {
  id: s.string("The Ongage contact ID."),
  email: s.email("The contact email address."),
  ocx_status: s.string("The contact status returned by Ongage."),
});
const emailResultMapSchema = s.anyOf(
  "Results keyed by contact email address, or an empty array when Ongage has no results.",
  [
    s.looseObject("Results keyed by contact email address."),
    s.array("An empty or provider-defined list of email results.", s.unknown("One email result.")),
  ],
);
const contactMutationOutputSchema = s.looseObject("An Ongage contact mutation summary.", {
  rows: s.nonNegativeInteger("The number of contact rows submitted."),
  success: s.nonNegativeInteger("The number of successful contact rows."),
  failed: s.nonNegativeInteger("The number of failed contact rows."),
  created: s.nonNegativeInteger("The number of contacts created."),
  created_emails: emailResultMapSchema,
  updated: s.nonNegativeInteger("The number of contacts updated."),
  updated_emails: emailResultMapSchema,
  revived: s.nonNegativeInteger("The number of contacts revived."),
  revived_emails: emailResultMapSchema,
  success_emails: emailResultMapSchema,
  failed_emails: emailResultMapSchema,
});

const upsertContactSchema = s.object(
  "One contact to create or optionally overwrite in an Ongage list.",
  {
    email: s.email("The contact email address."),
    overwrite: s.boolean("Whether Ongage should overwrite fields for an existing contact."),
    fields: customFieldsSchema,
  },
  { optional: ["overwrite", "fields"] },
);

const updateContactSchema = s.oneOf(
  [
    s.object("Update an Ongage contact selected by email address.", {
      email: s.email("The existing contact email address."),
      fields: customFieldsSchema,
    }),
    s.object("Update an Ongage contact selected by contact ID.", {
      id: s.string("The existing Ongage contact ID.", { minLength: 1 }),
      fields: customFieldsSchema,
    }),
  ],
  { description: "One existing Ongage contact and the fields to update." },
);

export type OngageActionName =
  | "list_lists"
  | "get_list"
  | "get_contact_by_email"
  | "get_contact_by_id"
  | "upsert_contacts"
  | "update_contacts"
  | "change_contact_status";

export const ongageActions: readonly ProviderActionDefinition<OngageActionName>[] = [
  defineProviderAction(service, {
    name: "list_lists",
    operationType: "read",
    description: "List Ongage sending or suppression lists with offset pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing Ongage lists.",
      {
        name: s.string("Filter by list name.", { minLength: 1 }),
        type: listTypeSchema,
        sort: s.string("List column name used for sorting.", { minLength: 1 }),
        order: sortOrderSchema,
        offset: s.nonNegativeInteger("Number of matching lists to skip."),
        limit: s.positiveInteger("Maximum number of lists to return."),
      },
      { optional: ["name", "type", "sort", "order", "offset", "limit"] },
    ),
    outputSchema: s.object("A page of Ongage lists.", {
      lists: s.array("Lists returned by Ongage.", listResourceSchema),
      total: s.nonNegativeInteger("Total number of matching lists."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_list",
    operationType: "read",
    description: "Get one Ongage list by its numeric ID.",
    requiredScopes: [],
    inputSchema: s.object("The Ongage list to retrieve.", { listId: listIdSchema }),
    outputSchema: s.object("The requested Ongage list.", { list: listResourceSchema }),
  }),
  defineProviderAction(service, {
    name: "get_contact_by_email",
    operationType: "read",
    description: "Get one contact from an Ongage list by email address.",
    requiredScopes: [],
    inputSchema: s.object("The list and contact email to retrieve.", {
      listId: listIdSchema,
      email: s.email("The contact email address."),
    }),
    outputSchema: s.object("The requested Ongage contact.", {
      contact: contactResourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact_by_id",
    operationType: "read",
    description: "Get one contact from an Ongage list by contact ID.",
    requiredScopes: [],
    inputSchema: s.object("The list and contact ID to retrieve.", {
      listId: listIdSchema,
      contactId: s.string("The Ongage contact ID.", { minLength: 1 }),
    }),
    outputSchema: s.object("The requested Ongage contact.", {
      contact: contactResourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "upsert_contacts",
    operationType: "write",
    description: "Create contacts in an Ongage list and optionally overwrite existing fields.",
    requiredScopes: [],
    inputSchema: s.object("A bounded batch of contacts to create or overwrite.", {
      listId: listIdSchema,
      contacts: s.array("Contacts to create or overwrite.", upsertContactSchema, {
        minItems: 1,
        maxItems: 500,
      }),
    }),
    outputSchema: contactMutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contacts",
    operationType: "write",
    description: "Update existing contacts in an Ongage list by email address or contact ID.",
    requiredScopes: [],
    inputSchema: s.object("A bounded batch of existing contacts to update.", {
      listId: listIdSchema,
      contacts: s.array("Existing contacts and fields to update.", updateContactSchema, {
        minItems: 1,
        maxItems: 500,
      }),
    }),
    outputSchema: contactMutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "change_contact_status",
    operationType: "destructive",
    description: "Change non-destructive subscription or delivery status for contacts in an Ongage list.",
    requiredScopes: [],
    inputSchema: s.object(
      "A bounded batch of email addresses and the status transition to apply.",
      {
        listId: listIdSchema,
        changeTo: contactStatusSchema,
        emails: s.array("Contact email addresses whose status should change.", s.email("A contact email address."), {
          minItems: 1,
          maxItems: 500,
        }),
        ocxChildId: s.positiveInteger("Optional campaign child ID used to attribute unsubscribe statistics."),
        ocxConnectionId: s.positiveInteger(
          "Optional ESP connection ID used to attribute transactional unsubscribe statistics.",
        ),
      },
      { optional: ["ocxChildId", "ocxConnectionId"] },
    ),
    outputSchema: contactMutationOutputSchema,
  }),
];
