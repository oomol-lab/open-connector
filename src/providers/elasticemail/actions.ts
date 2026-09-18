import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "elasticemail";

const queryLimitField = s.integer("Maximum number of returned items accepted by Elastic Email.", {
  minimum: 0,
});
const queryOffsetField = s.integer("Number of items to skip before returning results.", {
  minimum: 0,
});
const emailField = s.email("Proper email address accepted by Elastic Email.");
const listNameField = s.nonWhitespaceString("Elastic Email contact list name.");
const customFieldsSchema = s.record(
  "Key-value collection of Elastic Email custom contact fields.",
  s.string("One custom field string value."),
);
const contactStatusSchema = s.stringEnum("Elastic Email contact status.", [
  "Transactional",
  "Engaged",
  "Active",
  "Bounced",
  "Unsubscribed",
  "Abuse",
  "Inactive",
  "Stale",
  "NotConfirmed",
]);
const consentTrackingSchema = s.stringEnum("Elastic Email consent tracking value.", ["Unknown", "Allow", "Deny"]);
const consentInputSchema = s.object(
  "Consent data accepted by Elastic Email contact write endpoints.",
  {
    consentIp: s.string("IP address of consent to send email; Elastic Email uses the current public IP when omitted."),
    consentDate: s.dateTime("Date of consent to send email."),
    consentTracking: consentTrackingSchema,
  },
  { optional: ["consentIp", "consentDate", "consentTracking"] },
);
const contactCreateSchema = s.object(
  "One contact payload accepted by the Elastic Email add-contacts endpoint.",
  {
    email: emailField,
    status: contactStatusSchema,
    firstName: s.string("Contact first name."),
    lastName: s.string("Contact last name."),
    customFields: customFieldsSchema,
    consent: consentInputSchema,
  },
  { optional: ["status", "firstName", "lastName", "customFields", "consent"] },
);
const emailListSchema = s.array(
  "Contact email addresses accepted by Elastic Email list membership endpoints.",
  emailField,
  { minItems: 1 },
);
const queryPageInputSchema = s.object(
  "Elastic Email limit and offset query parameters.",
  {
    limit: queryLimitField,
    offset: queryOffsetField,
  },
  { optional: ["limit", "offset"] },
);
const contactEmailInputSchema = s.requiredObject("Path parameters for one Elastic Email contact.", {
  email: emailField,
});
const addContactsInputSchema = s.object(
  "Request payload for adding up to 1000 Elastic Email contacts.",
  {
    contacts: s.array("Contact payloads to create or add through Elastic Email.", contactCreateSchema, {
      minItems: 1,
      maxItems: 1000,
    }),
    listNames: s.array("Names of lists to which Elastic Email should add the uploaded contacts.", listNameField, {
      minItems: 1,
    }),
  },
  { optional: ["listNames"] },
);
const updateContactInputSchema = s.object(
  "Request payload for updating one Elastic Email contact.",
  {
    email: emailField,
    firstName: s.string("Contact first name."),
    lastName: s.string("Contact last name."),
    customFields: customFieldsSchema,
  },
  { optional: ["firstName", "lastName", "customFields"] },
);
const createListInputSchema = s.object(
  "Request payload for creating an Elastic Email list.",
  {
    listName: listNameField,
    allowUnsubscribe: s.boolean("Whether Elastic Email should allow unsubscribing from this list."),
    emails: s.array("Existing contact emails to add to the new list.", emailField, {
      minItems: 1,
    }),
  },
  { optional: ["allowUnsubscribe", "emails"] },
);
const listNameInputSchema = s.requiredObject("Path parameters for one Elastic Email list.", {
  listName: listNameField,
});
const updateListInputSchema = s.object(
  "Request payload for updating one Elastic Email list.",
  {
    listName: listNameField,
    newListName: s.nonEmptyString("New Elastic Email list name."),
    allowUnsubscribe: s.boolean("Whether Elastic Email should allow unsubscribing from this list."),
  },
  { optional: ["newListName", "allowUnsubscribe"] },
);
const listContactsInListInputSchema = s.object(
  "Path and query parameters for listing contacts in an Elastic Email list.",
  {
    listName: listNameField,
    limit: queryLimitField,
    offset: queryOffsetField,
  },
  { optional: ["limit", "offset"] },
);
const listMembershipInputSchema = s.requiredObject("Request payload for Elastic Email list membership.", {
  listName: listNameField,
  emails: emailListSchema,
});
const successOutputSchema = s.requiredObject("Success marker returned after Elastic Email accepts a request.", {
  success: s.boolean("Whether Elastic Email accepted the operation."),
});
const elasticEmailDateTimeSchema = s.string(
  "Date and time string returned by Elastic Email, usually in YYYY-MM-DDThh:mm:ss format.",
);
const consentOutputSchema = s.looseRequiredObject(
  "Consent data returned by Elastic Email.",
  {
    ConsentIP: s.string("IP address recorded for consent."),
    ConsentDate: s.nullable(s.string("Date of consent returned by Elastic Email, when present.")),
    ConsentTracking: s.string("Consent tracking value returned by Elastic Email."),
  },
  { optional: ["ConsentIP", "ConsentDate", "ConsentTracking"] },
);
const contactOutputSchema = s.looseRequiredObject(
  "Contact object returned by Elastic Email.",
  {
    Email: s.string("Contact email address."),
    Status: s.string("Elastic Email contact status."),
    FirstName: s.string("Contact first name."),
    LastName: s.string("Contact last name."),
    CustomFields: s.record(
      "Elastic Email custom contact fields returned for this contact.",
      s.string("One custom field string value."),
    ),
    Consent: consentOutputSchema,
    Source: s.string("Contact source returned by Elastic Email."),
    SourceInfo: s.string("Additional contact source information."),
    DateAdded: elasticEmailDateTimeSchema,
    DateUpdated: s.nullable(s.string("Last contact update date returned by Elastic Email, when present.")),
    StatusChangeDate: s.nullable(s.string("Last contact status-change date returned by Elastic Email.")),
    Activity: s.looseObject("Contact activity object returned by Elastic Email, when present."),
  },
  {
    optional: [
      "Email",
      "Status",
      "FirstName",
      "LastName",
      "CustomFields",
      "Consent",
      "Source",
      "SourceInfo",
      "DateAdded",
      "DateUpdated",
      "StatusChangeDate",
      "Activity",
    ],
  },
);
const listOutputSchema = s.looseRequiredObject(
  "Contact list object returned by Elastic Email.",
  {
    ListName: s.string("Elastic Email list name."),
    PublicListID: s.nullable(s.string("Elastic Email public list identifier, when present.")),
    DateAdded: elasticEmailDateTimeSchema,
    AllowUnsubscribe: s.boolean("Whether Elastic Email allows unsubscribing from this list."),
  },
  { optional: ["ListName", "PublicListID", "DateAdded", "AllowUnsubscribe"] },
);
const contactArrayOutputSchema = s.array("Contacts returned by the official Elastic Email API.", contactOutputSchema);
const listArrayOutputSchema = s.array("Contact lists returned by the official Elastic Email API.", listOutputSchema);

const listContactsAction = defineProviderAction(service, {
  name: "list_contacts",
  operationType: "read",
  description: "List contacts available to the current Elastic Email API key.",
  requiredScopes: [],
  inputSchema: queryPageInputSchema,
  outputSchema: contactArrayOutputSchema,
});

const getContactAction = defineProviderAction(service, {
  name: "get_contact",
  operationType: "read",
  description: "Fetch one Elastic Email contact by email address.",
  requiredScopes: [],
  inputSchema: contactEmailInputSchema,
  outputSchema: contactOutputSchema,
});

const addContactsAction = defineProviderAction(service, {
  name: "add_contacts",
  operationType: "write",
  description: "Add up to 1000 contacts to Elastic Email and optionally assign them to lists.",
  requiredScopes: [],
  inputSchema: addContactsInputSchema,
  outputSchema: contactArrayOutputSchema,
});

const updateContactAction = defineProviderAction(service, {
  name: "update_contact",
  operationType: "write",
  description: "Update an existing Elastic Email contact by email address.",
  requiredScopes: [],
  inputSchema: updateContactInputSchema,
  outputSchema: contactOutputSchema,
});

const deleteContactAction = defineProviderAction(service, {
  name: "delete_contact",
  operationType: "destructive",
  description: "Delete one Elastic Email contact by email address.",
  requiredScopes: [],
  inputSchema: contactEmailInputSchema,
  outputSchema: successOutputSchema,
});

const listListsAction = defineProviderAction(service, {
  name: "list_lists",
  operationType: "read",
  description: "List Elastic Email contact lists.",
  requiredScopes: [],
  inputSchema: queryPageInputSchema,
  outputSchema: listArrayOutputSchema,
});

const getListAction = defineProviderAction(service, {
  name: "get_list",
  operationType: "read",
  description: "Fetch one Elastic Email contact list by name.",
  requiredScopes: [],
  inputSchema: listNameInputSchema,
  outputSchema: listOutputSchema,
});

const createListAction = defineProviderAction(service, {
  name: "create_list",
  operationType: "write",
  description: "Create a new Elastic Email contact list.",
  requiredScopes: [],
  inputSchema: createListInputSchema,
  outputSchema: listOutputSchema,
});

const updateListAction = defineProviderAction(service, {
  name: "update_list",
  operationType: "write",
  description: "Update an existing Elastic Email contact list.",
  requiredScopes: [],
  inputSchema: updateListInputSchema,
  outputSchema: listOutputSchema,
});

const deleteListAction = defineProviderAction(service, {
  name: "delete_list",
  operationType: "destructive",
  description: "Delete an Elastic Email list without deleting its contacts.",
  requiredScopes: [],
  inputSchema: listNameInputSchema,
  outputSchema: successOutputSchema,
});

const listContactsInListAction = defineProviderAction(service, {
  name: "list_contacts_in_list",
  operationType: "read",
  description: "List contacts that belong to an Elastic Email contact list.",
  requiredScopes: [],
  inputSchema: listContactsInListInputSchema,
  outputSchema: contactArrayOutputSchema,
});

const addContactsToListAction = defineProviderAction(service, {
  name: "add_contacts_to_list",
  operationType: "write",
  description: "Add existing Elastic Email contacts to a contact list.",
  requiredScopes: [],
  inputSchema: listMembershipInputSchema,
  outputSchema: listOutputSchema,
});

const removeContactsFromListAction = defineProviderAction(service, {
  name: "remove_contacts_from_list",
  operationType: "destructive",
  description: "Remove Elastic Email contacts from a contact list.",
  requiredScopes: [],
  inputSchema: listMembershipInputSchema,
  outputSchema: successOutputSchema,
});

export const elasticemailActions: readonly ActionDefinition[] = [
  listContactsAction,
  getContactAction,
  addContactsAction,
  updateContactAction,
  deleteContactAction,
  listListsAction,
  getListAction,
  createListAction,
  updateListAction,
  deleteListAction,
  listContactsInListAction,
  addContactsToListAction,
  removeContactsFromListAction,
];
