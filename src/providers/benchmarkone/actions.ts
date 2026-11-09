import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "benchmarkone";

const emailSchema = s.object(
  "A BenchmarkONE email address attached to a contact.",
  {
    id: s.string("The encrypted email record ID when updating an existing email."),
    address: s.nonEmptyString("The email address.", { format: "email" }),
    type: s.string("The configured email type name, such as work, home, or other."),
    typeId: s.string("The configured email type ID."),
  },
  { optional: ["id", "type", "typeId"] },
);

const phoneSchema = s.object(
  "A BenchmarkONE phone number attached to a contact.",
  {
    id: s.string("The encrypted phone record ID when updating an existing phone."),
    number: s.nonEmptyString("The phone number."),
    type: s.string("The configured phone type name, such as work, home, or other."),
    typeId: s.string("The configured phone type ID."),
  },
  { optional: ["id", "type", "typeId"] },
);

const addressSchema = s.object(
  "A BenchmarkONE street address attached to a contact.",
  {
    id: s.string("The encrypted address record ID when updating an existing address."),
    street: s.string("The street address."),
    city: s.string("The city."),
    state: s.string("The state or region."),
    zip: s.string("The postal code."),
    country: s.string("The country name from the BenchmarkONE country list."),
    type: s.string("The configured address type name, such as work or home."),
    typeId: s.string("The configured address type ID."),
  },
  { optional: ["id", "street", "city", "state", "zip", "country", "type", "typeId"] },
);

const namedIdSchema = s.requireAnyProperty(
  s.object(
    "A BenchmarkONE configured value referenced by name or encrypted ID.",
    {
      name: s.string("The configured value name."),
      id: s.string("The encrypted configured value ID."),
    },
    { optional: ["name", "id"] },
  ),
  ["name", "id"],
);

const salesRepSchema = s.requireAnyProperty(
  s.object(
    "A BenchmarkONE sales representative referenced by username or encrypted ID.",
    {
      username: s.string("The sales representative username."),
      id: s.string("The encrypted sales representative ID."),
    },
    { optional: ["username", "id"] },
  ),
  ["username", "id"],
);

const customFieldSchema = s.object("A BenchmarkONE custom field value.", {
  name: s.nonEmptyString("The unique custom field name."),
  type: s.nonEmptyString("The custom field type, such as Text, Dropdown, MText, Number, or Date."),
  value: s.string("The custom field value serialized as a string."),
});

const contactFields = {
  contactId: s.string("The encrypted contact ID. Required when updating a contact."),
  firstName: s.string("The contact's first name."),
  lastName: s.string("The contact's last name."),
  title: s.string("The contact's job title."),
  company: s.string("The contact's company name."),
  emails: s.array("The contact's email addresses.", emailSchema),
  phones: s.array("The contact's phone numbers.", phoneSchema),
  status: namedIdSchema,
  temperature: namedIdSchema,
  salesRep: salesRepSchema,
  addresses: s.array("The contact's street addresses.", addressSchema),
  subscribed: s.boolean("Whether the contact opted in to email marketing."),
  timezone: s.string("The contact's timezone."),
  source: namedIdSchema,
  referredBy: s.string("The optional name of the contact who made the referral."),
  customFields: s.array("The contact's custom field values.", customFieldSchema),
};

const mutableContactSchema = s.object("The BenchmarkONE contact fields to create or update.", contactFields, {
  optional: Object.keys(contactFields),
});

const contactOutputSchema = s.looseObject(
  "The contact object returned by BenchmarkONE. Stable top-level fields follow the official contact schema while additional upstream fields are preserved.",
  {
    contactId: s.string("The encrypted contact ID."),
    firstName: s.string("The contact's first name."),
    lastName: s.string("The contact's last name."),
    title: s.string("The contact's job title."),
    company: s.string("The contact's company name."),
    emails: s.array("The contact's email records.", s.looseObject("An email record returned by BenchmarkONE.")),
    phones: s.array("The contact's phone records.", s.looseObject("A phone record returned by BenchmarkONE.")),
    subscribed: s.boolean("Whether the contact opted in to email marketing."),
  },
);

const configuredValueSchema = s.looseObject("A configured BenchmarkONE account value.", {
  id: s.string("The encrypted configured value ID."),
  name: s.string("The configured value name."),
});

const searchContactsAction = defineProviderAction(service, {
  name: "search_contacts",
  description: "Search BenchmarkONE contacts by encrypted contact ID, name, or email address.",
  operationType: "read",
  inputSchema: s.object(
    "The contact search criteria. Provide at least one field.",
    {
      contactId: s.string("The encrypted contact ID to search for."),
      firstName: s.string("The contact first name to search for."),
      lastName: s.string("The contact last name to search for."),
      emailAddresses: s.array(
        "The email addresses to search for.",
        s.nonEmptyString("One email address to search for.", { format: "email" }),
        { minItems: 1 },
      ),
    },
    { optional: ["contactId", "firstName", "lastName", "emailAddresses"] },
  ),
  outputSchema: s.object("The BenchmarkONE contact search response.", {
    contacts: s.array("The matching contacts.", contactOutputSchema),
  }),
});

const createContactAction = defineProviderAction(service, {
  name: "create_contact",
  description: "Create a contact in BenchmarkONE.",
  operationType: "write",
  inputSchema: s.object("The input payload for creating a BenchmarkONE contact.", {
    contact: mutableContactSchema,
  }),
  outputSchema: s.object("The BenchmarkONE contact creation response.", {
    contact: contactOutputSchema,
  }),
});

const updateContactAction = defineProviderAction(service, {
  name: "update_contact",
  description: "Update a BenchmarkONE contact by encrypted contact ID.",
  operationType: "write",
  inputSchema: s.object("The input payload for updating a BenchmarkONE contact.", {
    contactId: s.nonEmptyString("The encrypted ID of the contact to update."),
    contact: mutableContactSchema,
  }),
  outputSchema: s.object("The BenchmarkONE contact update response.", {
    contact: contactOutputSchema,
  }),
});

function defineListSettingsAction(input: { name: string; description: string; outputDescription: string }) {
  return defineProviderAction(service, {
    name: input.name,
    description: input.description,
    operationType: "read",
    inputSchema: s.object(`The input payload for ${input.description.toLowerCase()}`, {}),
    outputSchema: s.object(input.outputDescription, {
      values: s.array("The configured values returned by BenchmarkONE.", configuredValueSchema),
    }),
  });
}

const listContactStatusesAction = defineListSettingsAction({
  name: "list_contact_statuses",
  description: "List contact statuses configured in the BenchmarkONE account.",
  outputDescription: "The configured BenchmarkONE contact statuses.",
});

const listContactSourcesAction = defineListSettingsAction({
  name: "list_contact_sources",
  description: "List contact sources configured in the BenchmarkONE account.",
  outputDescription: "The configured BenchmarkONE contact sources.",
});

const listContactTemperaturesAction = defineListSettingsAction({
  name: "list_contact_temperatures",
  description: "List contact temperatures configured in the BenchmarkONE account.",
  outputDescription: "The configured BenchmarkONE contact temperatures.",
});

export const benchmarkoneActions: readonly ActionDefinition[] = [
  searchContactsAction,
  createContactAction,
  updateContactAction,
  listContactStatusesAction,
  listContactSourcesAction,
  listContactTemperaturesAction,
];
