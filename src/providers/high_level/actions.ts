import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "high_level";

const contactIdSchema = s.nonEmptyString("The HighLevel contact identifier.");
const locationIdSchema = s.nonEmptyString("The HighLevel sub-account or location identifier.");
const rawPayloadSchema = s.looseObject("The raw HighLevel response payload.");

const contactSchema = s.looseObject("A HighLevel contact record.", {
  id: s.string("The HighLevel contact identifier."),
  locationId: s.string("The HighLevel location identifier."),
  firstName: s.string("The contact first name."),
  lastName: s.string("The contact last name."),
  name: s.string("The contact full name."),
  email: s.string("The contact email address."),
  phone: s.string("The contact phone number."),
  tags: s.array("Tags attached to the contact.", s.string("One HighLevel contact tag.")),
});

const contactFieldsSchema = s.looseObject(
  "HighLevel contact fields to create or update. Additional HighLevel custom fields are allowed.",
  {
    locationId: locationIdSchema,
    firstName: s.string("The contact first name."),
    lastName: s.string("The contact last name."),
    name: s.string("The contact full name."),
    email: s.string("The contact email address."),
    phone: s.string("The contact phone number."),
    address1: s.string("The first address line."),
    city: s.string("The city name."),
    state: s.string("The state, region, or province."),
    postalCode: s.string("The postal or ZIP code."),
    website: s.string("The contact website URL."),
    timezone: s.string("The contact timezone."),
    source: s.string("The source label for the contact."),
    country: s.string("The contact country."),
    companyName: s.string("The company name associated with the contact."),
    tags: s.array("Tags to attach to the contact.", s.string("One HighLevel contact tag.")),
    customFields: s.array(
      "HighLevel custom field values.",
      s.looseObject("One HighLevel custom field value.", {
        id: s.nonEmptyString("The custom field identifier."),
        value: s.unknown("The custom field value."),
      }),
    ),
  },
);

const contactOutputSchema = s.actionOutput(
  {
    contact: contactSchema,
    raw: rawPayloadSchema,
  },
  "The HighLevel contact response.",
);

export const highLevelActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get a HighLevel contact by contact ID.",
    inputSchema: s.actionInput(
      { contactId: contactIdSchema },
      ["contactId"],
      "Input for retrieving a HighLevel contact.",
    ),
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a HighLevel contact in a location.",
    inputSchema: s.actionInput({ fields: contactFieldsSchema }, ["fields"], "Input for creating a HighLevel contact."),
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a HighLevel contact by contact ID.",
    inputSchema: s.actionInput(
      {
        contactId: contactIdSchema,
        fields: contactFieldsSchema,
      },
      ["contactId", "fields"],
      "Input for updating a HighLevel contact.",
    ),
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete a HighLevel contact by contact ID.",
    inputSchema: s.actionInput(
      { contactId: contactIdSchema },
      ["contactId"],
      "Input for deleting a HighLevel contact.",
    ),
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether HighLevel accepted the contact deletion request."),
        message: s.string("The HighLevel deletion message."),
        raw: rawPayloadSchema,
      },
      "The HighLevel contact deletion response.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_contacts",
    description: "Search HighLevel contacts in a location.",
    inputSchema: s.actionInput(
      {
        locationId: locationIdSchema,
        query: s.string("A text query for matching contacts."),
        page: s.positiveInteger("The page number to return."),
        pageLimit: s.integer("The maximum number of contacts to return.", { minimum: 1, maximum: 100 }),
        filters: s.array(
          "Advanced HighLevel contact search filters.",
          s.looseObject("One HighLevel contact search filter."),
        ),
        sort: s.array(
          "HighLevel contact search sort options.",
          s.looseObject("One HighLevel contact search sort option."),
        ),
      },
      [],
      "Input for searching HighLevel contacts.",
    ),
    outputSchema: s.actionOutput(
      {
        contacts: s.array("The matching HighLevel contacts.", contactSchema),
        total: s.nonNegativeInteger("The total number of matching contacts."),
        raw: rawPayloadSchema,
      },
      "The HighLevel contact search response.",
    ),
  }),
];
