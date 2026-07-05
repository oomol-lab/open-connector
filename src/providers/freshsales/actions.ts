import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "freshsales";

export type FreshsalesActionName =
  | "list_contact_filters"
  | "list_contacts"
  | "get_contact"
  | "create_contact"
  | "update_contact"
  | "delete_contact";

const positiveIdSchema = (description: string) => s.positiveInteger(description);
const pageSchema = s.positiveInteger("One-based Freshsales page number.");

const contactIncludeSchema = s.stringEnum("Non-deprecated Freshsales contact include handle.", [
  "sales_activities",
  "owner",
  "creater",
  "updater",
  "source",
  "campaign",
  "tasks",
  "appointments",
  "notes",
  "deals",
  "sales_accounts",
  "territory",
]);

const contactIncludesSchema = s.array(
  "Freshsales include values to expand on a contact response.",
  contactIncludeSchema,
  { minItems: 1 },
);

const contactFieldsSchema = s.looseObject(
  "Freshsales contact fields, including custom_field and related account payloads accepted by the API.",
);
const contactSchema = s.looseObject("Freshsales contact payload.");
const contactFilterSchema = s.looseObject("Freshsales contact filter payload.");

const contactOutputSchema = s.object("Freshsales contact response wrapper.", {
  contact: contactSchema,
});

export const freshsalesActions: Array<ProviderActionDefinition<FreshsalesActionName>> = [
  defineProviderAction(service, {
    name: "list_contact_filters",
    description: "List Freshsales contact filters used to discover contact view IDs.",
    inputSchema: s.object("Input parameters for listing Freshsales contact filters.", {}),
    outputSchema: s.object("Freshsales contact filters response wrapper.", {
      filters: s.array("Freshsales contact filters available to the current API key.", contactFilterSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Freshsales contacts from a saved contact view.",
    inputSchema: s.object(
      "Input parameters for listing Freshsales contacts from a saved view.",
      {
        viewId: positiveIdSchema("Freshsales contact view ID returned by list_contact_filters."),
        page: pageSchema,
      },
      { optional: ["page"] },
    ),
    outputSchema: s.object("Freshsales contacts list response wrapper.", {
      contacts: s.array("Freshsales contacts returned for the requested view page.", contactSchema),
      hasMore: s.boolean("Whether another Freshsales contacts page is likely available."),
      nextPage: s.nullable(s.positiveInteger("Next Freshsales page number when another page is available.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get one Freshsales contact by ID.",
    inputSchema: s.object(
      "Input parameters for reading a Freshsales contact.",
      {
        contactId: positiveIdSchema("Freshsales contact ID."),
        include: contactIncludesSchema,
      },
      { optional: ["include"] },
    ),
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a Freshsales contact from a JSON contact payload.",
    inputSchema: s.object("Input parameters for creating a Freshsales contact.", {
      contact: contactFieldsSchema,
    }),
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a Freshsales contact by ID.",
    inputSchema: s.object("Input parameters for updating a Freshsales contact.", {
      contactId: positiveIdSchema("Freshsales contact ID."),
      contact: contactFieldsSchema,
    }),
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete a Freshsales contact by ID.",
    inputSchema: s.object("Input parameters for deleting a Freshsales contact.", {
      contactId: positiveIdSchema("Freshsales contact ID."),
    }),
    outputSchema: s.object("Freshsales delete contact response wrapper.", {
      deleted: s.literal(true),
    }),
  }),
];
