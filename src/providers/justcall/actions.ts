import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "justcall";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const identifierSchema = s.integer("The numeric identifier assigned by JustCall.", { minimum: 1 });
const suppressionStatusSchema = s.stringEnum("A JustCall contact suppression list.", ["blacklist", "dnd", "dnm"]);
const otherNumberSchema = s.requiredObject("An additional phone number for the contact.", {
  label: nonEmptyString("The label for the additional phone number."),
  number: nonEmptyString("The additional phone number."),
});
const noteSchema = s.requiredObject("A note to append to the contact.", {
  note: nonEmptyString("The note text."),
});
const rawObjectSchema = s.looseObject("The raw object returned by JustCall.");
const recordOutputSchema = s.requiredObject("A JustCall record response.", {
  record: rawObjectSchema,
  raw: rawObjectSchema,
});
const listOutputSchema = s.requiredObject("A JustCall list response.", {
  records: s.array("The records returned by JustCall.", rawObjectSchema),
  pagination: s.looseObject("Pagination metadata returned by JustCall."),
  raw: rawObjectSchema,
});

const contactFields = {
  firstName: nonEmptyString("The contact's first name."),
  lastName: nonEmptyString("The contact's last name."),
  contactNumber: nonEmptyString("The contact's primary phone number."),
  otherNumbers: s.array("Additional phone numbers for the contact.", otherNumberSchema),
  extension: s.integer("The extension assigned to the contact.", { minimum: 0 }),
  email: s.string("The contact's email address."),
  company: s.string("The company associated with the contact."),
  address: s.string("The contact's postal address."),
};

const contactOptionalFields = ["lastName", "otherNumbers", "extension", "email", "company", "address"] as string[];

const selectorFields = {
  id: identifierSchema,
  contactNumber: nonEmptyString("The primary phone number used to find the contact."),
};

export const justCallActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List JustCall contacts with optional agent, phone, name, status, and pagination filters.",
    inputSchema: s.object(
      "Filters and pagination for listing JustCall contacts.",
      {
        acrossTeam: s.boolean("Whether to include contacts associated with all agents."),
        agentIds: s.array("Agent IDs whose contacts should be returned.", identifierSchema),
        contactNumber: nonEmptyString("A phone number used to filter contacts."),
        firstName: nonEmptyString("A first name used to filter contacts."),
        lastName: nonEmptyString("A last name used to filter contacts."),
        statuses: s.array("Suppression statuses used to filter contacts.", suppressionStatusSchema),
        perPage: s.integer("The maximum number of contacts to return, up to 500.", {
          minimum: 1,
          maximum: 500,
        }),
        page: s.integer("The zero-indexed page number to return.", { minimum: 0 }),
        order: s.stringEnum("The order of contacts by numeric ID.", ["asc", "desc"]),
        lastContactIdFetched: s.integer(
          "The last contact ID from the previous page, used to avoid duplicate records.",
          { minimum: 1 },
        ),
      },
      {
        optional: [
          "acrossTeam",
          "agentIds",
          "contactNumber",
          "firstName",
          "lastName",
          "statuses",
          "perPage",
          "page",
          "order",
          "lastContactIdFetched",
        ],
      },
    ),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Get one JustCall contact by its numeric ID.",
    inputSchema: s.requiredObject("The JustCall contact to retrieve.", { id: identifierSchema }),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    operationType: "write",
    description: "Create a contact in JustCall for the owner, selected agents, or the whole team.",
    inputSchema: s.object(
      "Fields for creating a JustCall contact.",
      {
        ...contactFields,
        notes: s.string("Additional information to store with the contact."),
        acrossTeam: s.boolean("Whether to create the contact for all agents."),
        agentId: identifierSchema,
        agentIds: s.array(
          "Agent IDs for whom the contact should be created.",
          s.nonEmptyString("One JustCall agent ID."),
        ),
      },
      { optional: [...contactOptionalFields, "notes", "acrossTeam", "agentId", "agentIds"] },
    ),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    operationType: "write",
    description: "Update a JustCall contact selected by ID or primary phone number.",
    inputSchema: s.object(
      "Selector and fields for updating a JustCall contact.",
      {
        ...selectorFields,
        ...contactFields,
        notes: s.array("Notes to append to the contact.", noteSchema),
        acrossTeam: s.boolean("Whether a contact selected by phone number should be updated for all agents."),
      },
      {
        optional: ["id", "contactNumber", "firstName", ...contactOptionalFields, "notes", "acrossTeam"],
      },
    ),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact_status",
    operationType: "destructive",
    description: "Add or remove a JustCall contact from DND, DNM, or blacklist suppression lists.",
    inputSchema: s.object(
      "Selector and suppression-list changes for a JustCall contact.",
      {
        ...selectorFields,
        addTo: s.array("Suppression lists to add the contact to.", suppressionStatusSchema, {
          minItems: 1,
        }),
        removeFrom: s.array("Suppression lists to remove the contact from.", suppressionStatusSchema, { minItems: 1 }),
        acrossTeam: s.boolean("Whether a contact selected by phone number should be changed for all agents."),
      },
      { optional: ["id", "contactNumber", "addTo", "removeFrom", "acrossTeam"] },
    ),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    operationType: "destructive",
    description: "Delete a JustCall contact selected by ID or primary phone number.",
    inputSchema: s.object(
      "Selector for deleting a JustCall contact.",
      {
        ...selectorFields,
        acrossTeam: s.boolean("Whether contacts selected by phone number should be deleted for all agents."),
      },
      { optional: ["id", "contactNumber", "acrossTeam"] },
    ),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List users in a JustCall account with availability, group, role, and pagination filters.",
    inputSchema: s.object(
      "Filters and pagination for listing JustCall users.",
      {
        available: s.boolean("Whether to return only agents available during their working hours."),
        email: s.string("An email address used to filter users."),
        groupId: identifierSchema,
        role: s.string("A JustCall role used to filter users."),
        page: s.integer("The zero-indexed page number to return.", { minimum: 0 }),
        perPage: s.integer("The maximum number of users to return, up to 100.", {
          minimum: 1,
          maximum: 100,
        }),
        order: s.stringEnum("The order of users by agent ID.", ["asc", "desc"]),
      },
      { optional: ["available", "email", "groupId", "role", "page", "perPage", "order"] },
    ),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Get one JustCall user by numeric agent ID.",
    inputSchema: s.requiredObject("The JustCall user to retrieve.", { id: identifierSchema }),
    outputSchema: recordOutputSchema,
  }),
];
