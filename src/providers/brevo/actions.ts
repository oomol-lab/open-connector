import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "brevo";

const limitField = s.integer("The maximum number of items to return.", { minimum: 1, maximum: 500 });
const offsetField = s.integer("The number of items to skip before returning results.", { minimum: 0 });
const sortField = s.stringEnum("The sort direction accepted by the official Brevo API.", ["asc", "desc"]);
const modifiedSinceField = s.dateTime("Only return records modified after this ISO-8601 timestamp.");
const createdSinceField = s.dateTime("Only return records created after this ISO-8601 timestamp.");
const identifierField = s.nonEmptyString("The Brevo contact identifier value used in the request path.");
const identifierTypeField = s.nonEmptyString("The optional Brevo identifier type used to interpret the identifier.");
const listIdField = s.positiveInteger("The Brevo contact list ID.");
const folderIdField = s.positiveInteger("The Brevo folder ID.");
const nonEmptyStringArraySchema = s.stringArray("The non-empty string array accepted by Brevo.", { minItems: 1 });
const positiveIntegerArraySchema = s.array(
  "The non-empty positive integer array accepted by Brevo.",
  {
    type: "integer",
    minimum: 1,
    description: "One positive integer item.",
  },
  { minItems: 1 },
);
const looseObjectSchema = s.unknownObject("A flexible object returned by Brevo.");

const accountPlanSchema = s.looseRequiredObject("One plan object returned by the Brevo account endpoint.", {
  type: s.nonEmptyString("The Brevo plan type."),
  credits: s.number("The available credits for this plan."),
});

const contactAttributesSchema = s.unknownObject("The flexible Brevo contact attributes object.");

const contactStatisticsSchema = s.unknownObject("The flexible Brevo contact statistics object.");

const contactSchema = s.looseRequiredObject("One Brevo contact object.", {
  id: s.number("The Brevo contact ID."),
  email: s.email("The primary email address of the contact."),
  ext_id: s.nonEmptyString("The external identifier returned by Brevo."),
  listIds: s.array("The Brevo contact lists linked to this contact.", s.number("One Brevo contact list ID.")),
  attributes: contactAttributesSchema,
  emailBlacklisted: s.boolean("Whether the contact is email blacklisted."),
  smsBlacklisted: s.boolean("Whether the contact is SMS blacklisted."),
  createdAt: s.dateTime("The contact creation timestamp."),
  modifiedAt: s.dateTime("The contact last update timestamp."),
  statistics: contactStatisticsSchema,
});

const listContactsInputSchema = s.actionInput(
  {
    limit: limitField,
    offset: offsetField,
    sort: sortField,
    modifiedSince: modifiedSinceField,
    createdSince: createdSinceField,
  },
  [],
  "The query parameters for listing Brevo contacts.",
);

const listContactsOutputSchema = s.looseRequiredObject("The paginated Brevo contact list response.", {
  count: s.number("The total number of contacts returned by Brevo."),
  contacts: s.array("The Brevo contacts returned for this page.", contactSchema),
});

const getContactInputSchema = s.actionInput(
  {
    identifier: identifierField,
    identifierType: identifierTypeField,
  },
  ["identifier"],
  "The path and query parameters for retrieving one Brevo contact.",
);

const createContactInputSchema = s.actionInput(
  {
    email: s.email("The email address for the new contact."),
    extId: s.nonEmptyString("The optional external identifier attached to the contact."),
    listIds: positiveIntegerArraySchema,
    emailBlacklisted: s.boolean("Whether the contact should be email blacklisted."),
    smsBlacklisted: s.boolean("Whether the contact should be SMS blacklisted."),
    attributes: contactAttributesSchema,
  },
  ["email"],
  "The request payload for creating a Brevo contact.",
);

const createEntityOutputSchema = s.looseRequiredObject("The entity creation result returned by Brevo.", {
  id: s.number("The numeric identifier returned by Brevo."),
});

const successOutputSchema = s.actionOutput(
  {
    success: s.boolean("Whether the requested Brevo mutation succeeded."),
  },
  "The generic success result returned by the connector.",
);

const folderSchema = s.looseRequiredObject("One Brevo contact folder object.", {
  id: s.number("The Brevo folder ID."),
  name: s.nonEmptyString("The Brevo folder name."),
});

const listContactFoldersInputSchema = s.actionInput(
  {
    limit: limitField,
    offset: offsetField,
    sort: sortField,
  },
  [],
  "The query parameters for listing Brevo contact folders.",
);

const listContactFoldersOutputSchema = s.looseRequiredObject("The paginated Brevo folder list response.", {
  count: s.number("The total number of folders returned by Brevo."),
  folders: s.array("The Brevo contact folders returned for this page.", folderSchema),
});

const listSchema = s.looseRequiredObject("One Brevo contact list object.", {
  id: s.number("The Brevo list ID."),
  name: s.nonEmptyString("The Brevo list name."),
  folderId: s.number("The folder ID that owns this list."),
});

const listContactListsInputSchema = s.actionInput(
  {
    limit: limitField,
    offset: offsetField,
    sort: sortField,
  },
  [],
  "The query parameters for listing Brevo contact lists.",
);

const listContactListsOutputSchema = s.looseRequiredObject("The paginated Brevo contact list response.", {
  count: s.number("The total number of lists returned by Brevo."),
  lists: s.array("The Brevo contact lists returned for this page.", listSchema),
});

const createContactListInputSchema = s.actionInput(
  {
    name: s.nonEmptyString("The Brevo contact list name."),
    folderId: folderIdField,
  },
  ["name", "folderId"],
  "The request payload for creating a Brevo contact list.",
);

const updateContactListInputSchema = s.actionInput(
  {
    listId: listIdField,
    name: s.nonEmptyString("The updated Brevo contact list name."),
    folderId: folderIdField,
  },
  ["listId"],
  "The path and body payload for updating a Brevo contact list.",
);

const listContactsInListInputSchema = s.actionInput(
  {
    listId: listIdField,
    limit: limitField,
    offset: offsetField,
    sort: sortField,
    modifiedSince: modifiedSinceField,
  },
  ["listId"],
  "The path and query parameters for listing contacts inside one Brevo list.",
);

const listSelectorSchema = s.oneOf(
  [
    s.object(
      {
        listId: listIdField,
        emails: nonEmptyStringArraySchema,
      },
      { required: ["listId", "emails"] },
    ),
    s.object(
      {
        listId: listIdField,
        ids: positiveIntegerArraySchema,
      },
      { required: ["listId", "ids"] },
    ),
    s.object(
      {
        listId: listIdField,
        extIds: nonEmptyStringArraySchema,
      },
      { required: ["listId", "extIds"] },
    ),
  ],
  { description: "The path and selector payload for mutating Brevo list membership." },
);

const memberMutationItemSchema = s.union(
  [
    s.number("One numeric contact identifier returned by Brevo."),
    s.nonEmptyString("One string contact identifier returned by Brevo."),
  ],
  { description: "One membership mutation result item returned by Brevo." },
);

const memberMutationOutputSchema = s.looseRequiredObject("The Brevo list membership mutation result.", {
  contacts: s.looseRequiredObject("The nested contact membership mutation result.", {
    success: s.array("The contacts successfully processed by Brevo.", memberMutationItemSchema),
    failure: s.array("The contacts that Brevo could not process.", memberMutationItemSchema),
    processId: s.number("The Brevo async process ID, when returned."),
    total: s.number("The total number of contacts processed."),
  }),
});

export const brevoActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description: "Retrieve the current Brevo account profile and plan information.",
    inputSchema: s.actionInput({}, [], "The empty input payload for retrieving the current Brevo account."),
    outputSchema: s.looseRequiredObject("The account payload returned by the official Brevo account endpoint.", {
      plan: s.array("The Brevo plans attached to the account.", accountPlanSchema),
      relay: looseObjectSchema,
      organization_id: s.number("The Brevo organization identifier."),
      email: s.email("The email address of the connected Brevo account."),
      companyName: s.nonEmptyString("The company name returned by Brevo."),
      firstName: s.nonEmptyString("The account first name returned by Brevo."),
      lastName: s.nonEmptyString("The account last name returned by Brevo."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List Brevo contacts with pagination and timestamp filters.",
    inputSchema: listContactsInputSchema,
    outputSchema: listContactsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Retrieve one Brevo contact by identifier and optional identifier type.",
    inputSchema: getContactInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    operationType: "write",
    description: "Create one Brevo contact with the official contact creation payload.",
    inputSchema: createContactInputSchema,
    outputSchema: createEntityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    operationType: "destructive",
    description: "Delete one Brevo contact by identifier and optional identifier type.",
    inputSchema: getContactInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contact_folders",
    operationType: "read",
    description: "List Brevo contact folders with the official pagination parameters.",
    inputSchema: listContactFoldersInputSchema,
    outputSchema: listContactFoldersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contact_lists",
    operationType: "read",
    description: "List Brevo contact lists with the official pagination parameters.",
    inputSchema: listContactListsInputSchema,
    outputSchema: listContactListsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact_list",
    operationType: "write",
    description: "Create one Brevo contact list inside the specified Brevo folder.",
    inputSchema: createContactListInputSchema,
    outputSchema: createEntityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact_list",
    operationType: "write",
    description: "Update one Brevo contact list by ID.",
    inputSchema: updateContactListInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts_in_list",
    operationType: "read",
    description: "List the Brevo contacts currently linked to one Brevo contact list.",
    inputSchema: listContactsInListInputSchema,
    outputSchema: s.looseRequiredObject("The paginated list-member response returned by Brevo.", {
      contacts: s.array("The Brevo contacts linked to the list.", contactSchema),
      count: s.number("The total number of contacts linked to the list."),
    }),
  }),
  defineProviderAction(service, {
    name: "add_contacts_to_list",
    operationType: "write",
    description: "Add contacts to one Brevo contact list using exactly one official selector.",
    inputSchema: listSelectorSchema,
    outputSchema: memberMutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_contacts_from_list",
    operationType: "destructive",
    description: "Remove contacts from one Brevo contact list using exactly one official selector.",
    inputSchema: listSelectorSchema,
    outputSchema: memberMutationOutputSchema,
  }),
];
