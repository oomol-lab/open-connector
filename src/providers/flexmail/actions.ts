import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "flexmail";

const trimmedString = (description: string, options: { minLength?: number; maxLength?: number } = {}) =>
  s.string(description, options);
const nonEmptyString = (description: string, options: { maxLength?: number } = {}) =>
  s.string(description, { ...options, minLength: 1 });

const supportedLanguageValues = [
  "nl",
  "fr",
  "de",
  "it",
  "es",
  "ru",
  "da",
  "se",
  "zh",
  "pt",
  "pl",
  "en",
  "hu",
  "bg",
  "hr",
  "cs",
  "et",
  "fi",
  "el",
  "ga",
  "lv",
  "lt",
  "mt",
  "ro",
  "sk",
  "sl",
  "uk",
  "ca",
];
const supportedLanguageSchemaBase = trimmedString("The language the contact wants to receive emails in.", {
  minLength: 2,
  maxLength: 2,
});
supportedLanguageSchemaBase.enum = supportedLanguageValues;
const supportedLanguageSchema = supportedLanguageSchemaBase;

const contactIdSchema = s.positiveInteger("The Flexmail contact id.");
const sourceIdSchema = s.positiveInteger("The Flexmail source id.");
const preferenceIdSchema = s.positiveInteger("The Flexmail preference id.");
const interestIdSchema = s.uuid("The Flexmail interest UUID.");
const compoundIdSchema = nonEmptyString("The Flexmail compound id for a relation.");

const paginationInputSchema = {
  limit: s.integer("The maximum number of items to return. Flexmail accepts values from 1 to 500.", {
    minimum: 1,
    maximum: 500,
  }),
  offset: s.nonNegativeInteger("The zero-based item offset for pagination."),
};

const loosePayloadSchema = s.looseObject(
  "The raw Flexmail HAL payload returned by the API, including links and embedded resources.",
);
const itemArraySchema = s.array("The embedded Flexmail resources extracted from the HAL payload.", loosePayloadSchema);
const collectionOutputSchema = s.object(
  "A normalized Flexmail collection response with the original HAL payload.",
  {
    items: itemArraySchema,
    total: s.integer("The total number of resources reported by Flexmail."),
    limit: s.integer("The requested page size returned by Flexmail."),
    offset: s.integer("The requested page offset returned by Flexmail."),
    payload: loosePayloadSchema,
  },
  { optional: ["total", "limit", "offset"] },
);
const resourceOutputSchema = s.requiredObject("A normalized Flexmail resource response.", {
  resource: loosePayloadSchema,
});
const createdResourceOutputSchema = s.object(
  "The identifier and location returned after Flexmail creates a resource.",
  {
    id: s.anyOf("The created resource identifier returned by Flexmail.", [
      s.integer("A numeric Flexmail resource id."),
      s.uuid("A UUID Flexmail resource id."),
      s.string("A string Flexmail resource id."),
    ]),
    location: s.string("The Location response header returned by Flexmail."),
  },
  { optional: ["id", "location"] },
);
const emptyOutputSchema = s.requiredObject("A Flexmail acknowledgement for an operation with no response body.", {
  ok: s.boolean("Whether Flexmail accepted the request."),
});

const customFieldsSchema = s.object(
  "Custom field values keyed by Flexmail custom field placeholder.",
  {},
  { additionalProperties: s.unknown("One custom field value for the contact.") },
);

const contactWriteFields = {
  email: s.string("The contact email address.", { format: "email", maxLength: 200 }),
  first_name: trimmedString("The contact first name.", { maxLength: 50 }),
  name: trimmedString("The contact last name.", { maxLength: 50 }),
  language: supportedLanguageSchema,
  custom_fields: customFieldsSchema,
};

const createContactInputSchema = s.object(
  "The input payload for creating a Flexmail contact.",
  {
    ...contactWriteFields,
    source: sourceIdSchema,
  },
  { optional: ["first_name", "name", "language", "custom_fields"] },
);

const updateContactInputSchema = s.object(
  "The input payload for partially updating a Flexmail contact.",
  {
    id: contactIdSchema,
    first_name: contactWriteFields.first_name,
    name: contactWriteFields.name,
    language: contactWriteFields.language,
    custom_fields: customFieldsSchema,
  },
  { optional: ["first_name", "name", "language", "custom_fields"] },
);

const contactIdInputSchema = s.requiredObject("The input payload for selecting a Flexmail contact.", {
  id: contactIdSchema,
});

const listContactsAction = defineProviderAction(service, {
  name: "list_contacts",
  operationType: "read",
  description: "List Flexmail contacts, optionally filtering by email address and paging through the collection.",
  inputSchema: s.object(
    "The input payload for listing Flexmail contacts.",
    {
      email: s.email("An email address to filter contacts by."),
      ...paginationInputSchema,
    },
    { optional: ["email", "limit", "offset"] },
  ),
  outputSchema: collectionOutputSchema,
});

const createContactAction = defineProviderAction(service, {
  name: "create_contact",
  operationType: "write",
  description: "Create a Flexmail contact in a specific source.",
  inputSchema: createContactInputSchema,
  outputSchema: createdResourceOutputSchema,
});

const getContactAction = defineProviderAction(service, {
  name: "get_contact",
  operationType: "read",
  description: "Fetch a Flexmail contact by id.",
  inputSchema: contactIdInputSchema,
  outputSchema: resourceOutputSchema,
});

const updateContactAction = defineProviderAction(service, {
  name: "update_contact",
  operationType: "write",
  description: "Partially update a Flexmail contact.",
  inputSchema: updateContactInputSchema,
  outputSchema: resourceOutputSchema,
});

const unsubscribeContactAction = defineProviderAction(service, {
  name: "unsubscribe_contact",
  operationType: "destructive",
  description: "Unsubscribe a Flexmail contact from all future communication.",
  inputSchema: contactIdInputSchema,
  outputSchema: emptyOutputSchema,
});

const listCustomFieldsAction = defineProviderAction(service, {
  name: "list_custom_fields",
  operationType: "read",
  description: "List custom fields configured in the Flexmail account.",
  inputSchema: s.object(
    "The input payload for listing Flexmail custom fields.",
    {
      type: s.stringEnum("Limits custom fields to the selected Flexmail type.", [
        "free_text",
        "multiple_choice",
        "numeric",
        "date",
      ]),
      language: trimmedString("The account contact language used for custom field labels.", {
        minLength: 2,
      }),
    },
    { optional: ["type", "language"] },
  ),
  outputSchema: collectionOutputSchema,
});

const interestFields = {
  name: nonEmptyString("The internal Flexmail interest name.", {
    maxLength: 50,
  }),
  visibility: s.stringEnum("The Flexmail interest visibility.", ["public", "private"]),
  label: trimmedString("The label shown to contacts for this interest.", { maxLength: 50 }),
  description: trimmedString("A short description shown to contacts for this interest.", {
    maxLength: 100,
  }),
};

const listInterestsAction = defineProviderAction(service, {
  name: "list_interests",
  operationType: "read",
  description: "List Flexmail interests with optional name and visibility filters.",
  inputSchema: s.object(
    "The input payload for listing Flexmail interests.",
    {
      name: trimmedString("Limits interests to ones whose name contains this value."),
      visibility: interestFields.visibility,
      order_by: s.stringEnum("The Flexmail interest property used for ordering.", ["name"]),
      order_direction: s.stringEnum("The ordering direction.", ["asc", "desc"]),
      ...paginationInputSchema,
    },
    { optional: ["name", "visibility", "order_by", "order_direction", "limit", "offset"] },
  ),
  outputSchema: collectionOutputSchema,
});

const createInterestAction = defineProviderAction(service, {
  name: "create_interest",
  operationType: "write",
  description: "Create a Flexmail interest.",
  inputSchema: s.object("The input payload for creating a Flexmail interest.", interestFields, {
    optional: ["label", "description"],
  }),
  outputSchema: createdResourceOutputSchema,
});

const getInterestAction = defineProviderAction(service, {
  name: "get_interest",
  operationType: "read",
  description: "Fetch a Flexmail interest by UUID.",
  inputSchema: s.requiredObject("The input payload for selecting a Flexmail interest.", {
    id: interestIdSchema,
  }),
  outputSchema: resourceOutputSchema,
});

const updateInterestAction = defineProviderAction(service, {
  name: "update_interest",
  operationType: "write",
  description: "Partially update a Flexmail interest.",
  inputSchema: s.object(
    "The input payload for partially updating a Flexmail interest.",
    {
      id: interestIdSchema,
      ...interestFields,
    },
    { optional: ["name", "visibility", "label", "description"] },
  ),
  outputSchema: resourceOutputSchema,
});

const deleteInterestAction = defineProviderAction(service, {
  name: "delete_interest",
  operationType: "destructive",
  description: "Delete a Flexmail interest by UUID.",
  inputSchema: s.requiredObject("The input payload for deleting a Flexmail interest.", {
    id: interestIdSchema,
  }),
  outputSchema: emptyOutputSchema,
});

const listContactInterestSubscriptionsAction = defineProviderAction(service, {
  name: "list_contact_interest_subscriptions",
  operationType: "read",
  description: "List the interests to which a Flexmail contact is subscribed.",
  inputSchema: contactIdInputSchema,
  outputSchema: collectionOutputSchema,
});

const addContactInterestSubscriptionAction = defineProviderAction(service, {
  name: "add_contact_interest_subscription",
  operationType: "write",
  description: "Subscribe a Flexmail contact to an interest.",
  inputSchema: s.requiredObject("The input payload for subscribing a Flexmail contact to an interest.", {
    contactId: contactIdSchema,
    interestId: interestIdSchema,
  }),
  outputSchema: createdResourceOutputSchema,
});

const removeContactInterestSubscriptionAction = defineProviderAction(service, {
  name: "remove_contact_interest_subscription",
  operationType: "destructive",
  description: "Remove a Flexmail contact from an interest.",
  inputSchema: s.requiredObject("The input payload for removing a Flexmail contact from an interest.", {
    contactId: contactIdSchema,
    interestId: interestIdSchema,
  }),
  outputSchema: emptyOutputSchema,
});

const listContactPreferencesAction = defineProviderAction(service, {
  name: "list_contact_preferences",
  operationType: "read",
  description: "List preferences selected by a Flexmail contact.",
  inputSchema: contactIdInputSchema,
  outputSchema: collectionOutputSchema,
});

const addContactPreferenceSubscriptionAction = defineProviderAction(service, {
  name: "add_contact_preference_subscription",
  operationType: "write",
  description: "Subscribe a Flexmail contact to a preference.",
  inputSchema: s.requiredObject("The input payload for subscribing a Flexmail contact to a preference.", {
    contactId: contactIdSchema,
    preferenceId: preferenceIdSchema,
  }),
  outputSchema: createdResourceOutputSchema,
});

const removeContactPreferenceSubscriptionAction = defineProviderAction(service, {
  name: "remove_contact_preference_subscription",
  operationType: "destructive",
  description: "Remove a Flexmail contact preference subscription by compound id.",
  inputSchema: s.requiredObject("The input payload for deleting a Flexmail contact preference subscription.", {
    id: compoundIdSchema,
  }),
  outputSchema: emptyOutputSchema,
});

const listContactSourcesAction = defineProviderAction(service, {
  name: "list_contact_sources",
  operationType: "read",
  description: "List sources through which a Flexmail contact was added.",
  inputSchema: contactIdInputSchema,
  outputSchema: collectionOutputSchema,
});

const listAccountContactLanguagesAction = defineProviderAction(service, {
  name: "list_account_contact_languages",
  operationType: "read",
  description: "Fetch the contact languages configured for the Flexmail account.",
  inputSchema: s.object("The input payload for fetching Flexmail account contact languages.", {}),
  outputSchema: resourceOutputSchema,
});

const listInterestLabelsAction = defineProviderAction(service, {
  name: "list_interest_labels",
  operationType: "read",
  description: "List Flexmail interest labels.",
  inputSchema: s.object("The input payload for listing Flexmail interest labels.", {}),
  outputSchema: collectionOutputSchema,
});

const listPreferencesAction = defineProviderAction(service, {
  name: "list_preferences",
  operationType: "read",
  description: "List preferences configured in the Flexmail account.",
  inputSchema: s.object("The input payload for listing Flexmail preferences.", {}),
  outputSchema: collectionOutputSchema,
});

const listSegmentsAction = defineProviderAction(service, {
  name: "list_segments",
  operationType: "read",
  description: "List active segments in the Flexmail account.",
  inputSchema: s.object("The input payload for listing Flexmail segments.", {}),
  outputSchema: collectionOutputSchema,
});

const listSourcesAction = defineProviderAction(service, {
  name: "list_sources",
  operationType: "read",
  description: "List sources configured in the Flexmail account.",
  inputSchema: s.object("The input payload for listing Flexmail sources.", {}),
  outputSchema: collectionOutputSchema,
});

const getSourceAction = defineProviderAction(service, {
  name: "get_source",
  operationType: "read",
  description: "Fetch a Flexmail source by id.",
  inputSchema: s.requiredObject("The input payload for selecting a Flexmail source.", {
    id: sourceIdSchema,
  }),
  outputSchema: resourceOutputSchema,
});

export const flexmailActions: ActionDefinition[] = [
  listContactsAction,
  createContactAction,
  getContactAction,
  updateContactAction,
  unsubscribeContactAction,
  listCustomFieldsAction,
  listInterestsAction,
  createInterestAction,
  getInterestAction,
  updateInterestAction,
  deleteInterestAction,
  listContactInterestSubscriptionsAction,
  addContactInterestSubscriptionAction,
  removeContactInterestSubscriptionAction,
  listContactPreferencesAction,
  addContactPreferenceSubscriptionAction,
  removeContactPreferenceSubscriptionAction,
  listContactSourcesAction,
  listAccountContactLanguagesAction,
  listInterestLabelsAction,
  listPreferencesAction,
  listSegmentsAction,
  listSourcesAction,
  getSourceAction,
];
