import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "slicktext";

const resourceIdSchema = s.integer("The numeric SlickText resource identifier.", { minimum: 1 });
const paginationFields = {
  limit: s.integer("The maximum number of contacts to return.", { minimum: 1, maximum: 250 }),
  offset: s.nonNegativeInteger("The number of contacts to skip before returning results."),
  page: s.nonNegativeInteger("The zero-based page number to return."),
  pageSize: s.integer("The number of contacts to return per page.", {
    minimum: 1,
    maximum: 250,
  }),
};

const customFieldsSchema = s.record(
  "Custom field values keyed by each field's SlickText internal name.",
  s.unknown("A SlickText custom field value."),
);

const contactWriteFields = {
  mobile_number: s.nonEmptyString("The contact's US mobile number; SlickText normalizes it to a plus-prefixed number."),
  first_name: s.string("The contact's first name."),
  last_name: s.string("The contact's last name."),
  email: s.email("The contact's email address."),
  birthdate: s.string("The contact's birth date in YYYY-MM-DD format.", {
    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  }),
  address: s.string("The contact's street address."),
  city: s.string("The contact's city."),
  state: s.string("The contact's state or region."),
  zip: s.string("The contact's postal code."),
  country: s.string("The contact's country code."),
  timezone: s.stringEnum("The contact's SlickText timezone.", [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
  ]),
  language: s.string("The contact's primary language code."),
  opt_in_status: s.stringEnum("The contact's messaging opt-in status.", [
    "not subscribed",
    "subscribed",
    "unsubscribed",
    "blocked",
  ]),
  custom_fields: customFieldsSchema,
};

const contactSchema = s.looseObject("A contact returned by SlickText.", {
  contact_id: resourceIdSchema,
  _brand_id: resourceIdSchema,
  mobile_number: s.nullable(s.string("The contact's normalized mobile number.")),
  first_name: s.nullable(s.string("The contact's first name.")),
  last_name: s.nullable(s.string("The contact's last name.")),
  email: s.nullable(s.email("The contact's email address.")),
  opt_in_status: s.nullable(s.string("The contact's current messaging opt-in status.")),
  custom_fields: s.nullable(customFieldsSchema),
  created: s.nullable(s.string("The timestamp when SlickText created the contact.")),
  last_updated: s.nullable(s.string("The timestamp when SlickText last updated the contact.")),
});

const brandSchema = s.looseObject("The authenticated SlickText brand.", {
  brand_id: resourceIdSchema,
  name: s.string("The brand name."),
  website: s.string("The brand website URL."),
});

const pagingDataSchema = s.looseObject("SlickText pagination metadata.", {
  prevPage: s.nullable(s.integer("The previous zero-based page number.")),
  currentPage: s.nullable(s.integer("The current zero-based page number.")),
  nextPage: s.nullable(s.integer("The next zero-based page number.")),
  currentPageString: s.nullable(s.string("The current page URL or page description.")),
  hasMore: s.boolean("Whether more contacts are available."),
});

const emptyInputSchema = s.object("This action does not require input fields.", {});

const getBrandAction = defineProviderAction(service, {
  name: "get_brand",
  operationType: "read",
  description: "Retrieve the SlickText brand associated with the connected API key.",
  requiredScopes: [],
  inputSchema: emptyInputSchema,
  outputSchema: brandSchema,
});

const listContactsAction = defineProviderAction(service, {
  name: "list_contacts",
  operationType: "read",
  description: "List contacts for the authenticated SlickText brand with optional pagination.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing SlickText contacts.", paginationFields, {
    optional: ["limit", "offset", "page", "pageSize"],
  }),
  outputSchema: s.looseObject("A paginated SlickText contact response.", {
    data: s.array("The contacts returned by SlickText.", contactSchema),
    pagingData: pagingDataSchema,
  }),
});

const getContactAction = defineProviderAction(service, {
  name: "get_contact",
  operationType: "read",
  description: "Retrieve one SlickText contact by contact ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving a SlickText contact.", {
    contact_id: resourceIdSchema,
  }),
  outputSchema: contactSchema,
});

const createContactAction = defineProviderAction(service, {
  name: "create_contact",
  operationType: "write",
  description: "Create a contact in the authenticated SlickText brand.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for creating a SlickText contact.", contactWriteFields, {
    optional: [
      "first_name",
      "last_name",
      "email",
      "birthdate",
      "address",
      "city",
      "state",
      "zip",
      "country",
      "timezone",
      "language",
      "opt_in_status",
      "custom_fields",
    ],
  }),
  outputSchema: contactSchema,
});

const updateContactAction = defineProviderAction(service, {
  name: "update_contact",
  operationType: "write",
  description: "Update an existing SlickText contact by contact ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for updating a SlickText contact.",
    { contact_id: resourceIdSchema, ...contactWriteFields },
    {
      optional: Object.keys(contactWriteFields) as (keyof typeof contactWriteFields)[],
    },
  ),
  outputSchema: contactSchema,
});

const deleteContactAction = defineProviderAction(service, {
  name: "delete_contact",
  operationType: "destructive",
  description: "Delete a SlickText contact by contact ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for deleting a SlickText contact.", {
    contact_id: resourceIdSchema,
  }),
  outputSchema: s.array(
    "The empty array returned after SlickText deletes a contact.",
    s.unknown("An item returned by SlickText."),
  ),
});

export const slicktextActions: ActionDefinition[] = [
  getBrandAction,
  listContactsAction,
  getContactAction,
  createContactAction,
  updateContactAction,
  deleteContactAction,
];
