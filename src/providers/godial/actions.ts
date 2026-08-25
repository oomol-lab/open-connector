import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "godial";

const assignmentModeSchema = s.stringEnum(
  "How GoDial should assign the new contact when an explicit assignee is not used.",
  ["default", "roundrobin"],
);
const customFieldSchema = s.object("One custom field entry sent to GoDial.", {
  name: s.nonEmptyString("The custom field name."),
  value: s.unknown("The custom field value."),
});
const sourceMarketingSchema = s.looseObject("UTM-style marketing attribution object forwarded to GoDial.");
const rawItemSchema = s.looseObject("One raw GoDial item.");

const accountSummarySchema = s.object("A normalized GoDial account summary.", {
  id: s.string("The GoDial account identifier."),
  name: s.string("The GoDial account display name."),
  raw: rawItemSchema,
});
const listSummarySchema = s.object("A normalized GoDial list summary.", {
  id: s.string("The GoDial list identifier."),
  name: s.string("The GoDial list display name."),
  raw: rawItemSchema,
});
const contactSummarySchema = s.object("A normalized GoDial contact summary.", {
  id: s.string("The GoDial contact identifier."),
  phone: s.string("The primary phone number returned for the contact."),
  name: s.string("The contact name when GoDial returns it."),
  raw: rawItemSchema,
});

const listContactsInListInputSchema = s.object("Input for listing contacts in one GoDial list.", {
  listId: s.nonEmptyString("The GoDial list ID whose contacts should be returned."),
});
const getContactInputSchema = s.object("Input for reading one GoDial contact.", {
  contactId: s.nonEmptyString("The GoDial contact ID to fetch."),
});
const createContactInputSchema = s.object(
  "Input for creating one GoDial contact in a list.",
  {
    name: s.nonEmptyString("The contact name."),
    email: s.nonEmptyString("The contact email address."),
    phone: s.nonEmptyString("The primary phone number of the contact."),
    secondPhone: s.nonEmptyString("An alternate phone number for the contact."),
    companyName: s.nonEmptyString("The contact company name."),
    note: s.nonEmptyString("The note text saved for the contact."),
    remarks: s.nonEmptyString("The remarks text saved for the contact."),
    extra: s.nonEmptyString("Extra note content saved for the contact."),
    assignmentMode: assignmentModeSchema,
    customFields: s.array("Custom fields forwarded to GoDial.", customFieldSchema),
    listId: s.nonEmptyString("The GoDial list ID where the contact should be stored."),
    assignedAccountId: s.nonEmptyString("The GoDial account ID assigned to the contact."),
    source: s.nonEmptyString("The lead source label for the contact."),
    address: s.nonEmptyString("The contact address."),
    sourceMarketing: sourceMarketingSchema,
  },
  {
    optional: [
      "name",
      "email",
      "secondPhone",
      "companyName",
      "note",
      "remarks",
      "extra",
      "assignmentMode",
      "customFields",
      "assignedAccountId",
      "source",
      "address",
      "sourceMarketing",
    ],
  },
);

export const godialActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List GoDial accounts in the current company.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing GoDial accounts.", {}),
    outputSchema: s.actionOutput(
      {
        accounts: s.array("Accounts returned by GoDial.", accountSummarySchema),
        raw: s.array("The raw account payload returned by GoDial.", rawItemSchema),
      },
      "Normalized output for GoDial account listing.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_lists",
    description: "List GoDial lists in the current company.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing GoDial lists.", {}),
    outputSchema: s.actionOutput(
      {
        lists: s.array("Lists returned by GoDial.", listSummarySchema),
        raw: s.array("The raw list payload returned by GoDial.", rawItemSchema),
      },
      "Normalized output for GoDial list listing.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_contacts_in_list",
    description: "List all contacts currently stored in one GoDial list.",
    requiredScopes: [],
    inputSchema: listContactsInListInputSchema,
    outputSchema: s.actionOutput(
      {
        contacts: s.array("Contacts returned for the GoDial list.", contactSummarySchema),
        raw: s.array("The raw contact payload returned by GoDial.", rawItemSchema),
      },
      "Normalized output for listing contacts in one GoDial list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Fetch one GoDial contact by contact ID.",
    requiredScopes: [],
    inputSchema: getContactInputSchema,
    outputSchema: s.actionOutput(
      {
        contact: s.object("The normalized contact returned by GoDial.", {
          id: s.string("The GoDial contact identifier."),
          raw: rawItemSchema,
        }),
      },
      "Normalized output for reading one GoDial contact.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create one GoDial contact in a target list using the official external API form fields.",
    requiredScopes: [],
    inputSchema: createContactInputSchema,
    outputSchema: s.actionOutput(
      {
        raw: s.looseObject("The raw GoDial response returned after contact creation."),
      },
      "Normalized output for creating one GoDial contact.",
    ),
  }),
];
