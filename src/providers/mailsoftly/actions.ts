import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailsoftly" as const;

const emptyInputSchema = s.requiredObject("No input parameters are required.", {});
const contactIdSchema = s.integer("The Mailsoftly contact ID.");
const contactListIdSchema = s.integer("The Mailsoftly contact list ID.");
const emailSchema = s.email("The contact email address.");
const optionalContactFields = [
  "first_name",
  "last_name",
  "job_title",
  "mobile_phone",
  "work_phone",
  "website",
  "address",
  "address_line_1",
  "address_line_2",
  "note",
  "date_of_birth",
  "gender",
  "country",
  "city",
  "state",
  "zip_code",
  "email_sending_status",
  "industry",
  "company",
  "source",
  "opt_in_date",
] as const;

const contactSummarySchema = s.looseRequiredObject("A Mailsoftly contact summary.", {
  id: s.optional(contactIdSchema),
  first_name: s.optional(s.string("The contact first name.")),
  last_name: s.optional(s.string("The contact last name.")),
  email: s.optional(s.email("The contact email address.")),
});

const contactSchema = s.looseObject("A Mailsoftly contact with any additional fields returned by the account.", {
  id: s.optional(contactIdSchema),
  first_name: s.optional(s.string("The contact first name.")),
  last_name: s.optional(s.string("The contact last name.")),
  email: s.optional(s.email("The contact email address.")),
  job_title: s.optional(s.nullable(s.string("The contact job title."))),
  mobile_phone: s.optional(s.nullable(s.string("The contact mobile phone number."))),
  work_phone: s.optional(s.nullable(s.string("The contact work phone number."))),
  website: s.optional(s.nullable(s.string("The contact website."))),
  address: s.optional(s.nullable(s.string("The contact address."))),
  address_line_1: s.optional(s.nullable(s.string("The first contact address line."))),
  address_line_2: s.optional(s.nullable(s.string("The second contact address line."))),
  note: s.optional(s.nullable(s.string("A note stored on the contact."))),
  date_of_birth: s.optional(s.nullable(s.date("The contact date of birth."))),
  gender: s.optional(s.nullable(s.string("The contact gender value."))),
  country: s.optional(s.nullable(s.string("The contact country."))),
  city: s.optional(s.nullable(s.string("The contact city."))),
  state: s.optional(s.nullable(s.string("The contact state or region."))),
  zip_code: s.optional(s.nullable(s.string("The contact postal code."))),
  industry: s.optional(s.nullable(s.string("The contact industry."))),
  company: s.optional(s.nullable(s.string("The contact company."))),
  source: s.optional(s.nullable(s.string("The source recorded for the contact."))),
  opt_in_date: s.optional(s.nullable(s.dateTime("The contact opt-in timestamp."))),
  new_custom_fields: s.optional(s.nullable(s.looseObject("Custom field values stored on the contact."))),
  created_at: s.optional(s.dateTime("The contact creation timestamp.")),
  updated_at: s.optional(s.dateTime("The contact update timestamp.")),
});

const createContactInputSchema = s.object(
  "Fields for creating a Mailsoftly contact.",
  {
    email: emailSchema,
    first_name: s.string("The contact first name."),
    last_name: s.string("The contact last name."),
    job_title: s.string("The contact job title."),
    mobile_phone: s.string("The contact mobile phone number."),
    work_phone: s.string("The contact work phone number."),
    website: s.string("The contact website."),
    address: s.string("The contact address."),
    address_line_1: s.string("The first contact address line."),
    address_line_2: s.string("The second contact address line."),
    note: s.string("A note to store on the contact."),
    date_of_birth: s.date("The contact date of birth."),
    gender: s.string("The contact gender value."),
    country: s.string("The contact country."),
    city: s.string("The contact city."),
    state: s.string("The contact state or region."),
    zip_code: s.string("The contact postal code."),
    email_sending_status: s.stringEnum("The contact email subscription status.", [
      "nonesubscribed",
      "subscribed",
      "unsubscribed",
      "bounced",
      "complaint",
    ]),
    industry: s.string("The contact industry."),
    company: s.string("The contact company."),
    source: s.string("The source to record for the contact."),
    opt_in_date: s.dateTime("The contact opt-in timestamp."),
  },
  { optional: optionalContactFields },
);

const updateContactInputSchema = s.object(
  "Fields for updating a Mailsoftly contact; omitted fields remain unchanged.",
  {
    contact_id: contactIdSchema,
    first_name: s.string("The updated contact first name."),
    last_name: s.string("The updated contact last name."),
    email: emailSchema,
    job_title: s.string("The updated contact job title."),
    company: s.string("The updated contact company."),
    country: s.string("The updated contact country."),
    city: s.string("The updated contact city."),
  },
  {
    optional: ["first_name", "last_name", "email", "job_title", "company", "country", "city"],
  },
);

const contactListSchema = s.looseRequiredObject("A Mailsoftly contact list summary.", {
  id: s.optional(contactListIdSchema),
  name: s.optional(s.string("The contact list name.")),
  contact_count: s.optional(s.integer("The number of contacts in the list.")),
});

const searchResultSchema = s.looseRequiredObject("Mailsoftly contact search results.", {
  status: s.optional(s.string("The search operation status.")),
  message: s.optional(s.string("A message describing the search result.")),
  contacts: s.optional(
    s.array(
      "Contacts matching the exact search criteria.",
      s.looseRequiredObject("A contact returned by Mailsoftly search.", {
        id: s.optional(contactIdSchema),
        first_name: s.optional(s.string("The contact first name.")),
        last_name: s.optional(s.string("The contact last name.")),
        email: s.optional(s.string("The contact email address.")),
        source: s.optional(s.nullable(s.string("The source recorded for the contact."))),
      }),
    ),
  ),
});

export const mailsoftlyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_contacts",
    operationType: "read",
    description: "List all contacts in the authenticated Mailsoftly account.",
    inputSchema: emptyInputSchema,
    outputSchema: s.array("Contacts in the Mailsoftly account.", contactSummarySchema),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Retrieve one Mailsoftly contact by ID, optionally with detailed fields.",
    inputSchema: s.object(
      "Parameters for retrieving a Mailsoftly contact.",
      {
        contact_id: contactIdSchema,
        type: s.stringEnum("Set to detailed to include all available contact fields.", ["detailed"]),
      },
      { optional: ["type"] },
    ),
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    operationType: "write",
    description: "Create a Mailsoftly contact with a unique email address.",
    inputSchema: createContactInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    operationType: "write",
    description: "Update selected fields on an existing Mailsoftly contact.",
    inputSchema: updateContactInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "search_contacts",
    operationType: "read",
    description: "Search Mailsoftly contacts by exact email, first name, or last name.",
    inputSchema: s.object(
      "Exact-match criteria for searching Mailsoftly contacts.",
      {
        email: s.string("The exact email value to match."),
        first_name: s.string("The exact first name to match."),
        last_name: s.string("The exact last name to match."),
      },
      { optional: ["email", "first_name", "last_name"] },
    ),
    outputSchema: searchResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact_lists",
    operationType: "read",
    description: "List general Mailsoftly contact lists and their contact counts.",
    inputSchema: emptyInputSchema,
    outputSchema: s.array("General contact lists in the Mailsoftly account.", contactListSchema),
  }),
  defineProviderAction(service, {
    name: "get_contact_list",
    operationType: "read",
    description: "Retrieve one Mailsoftly contact list by ID.",
    inputSchema: s.requiredObject("Parameters for retrieving a Mailsoftly contact list.", {
      contact_list_id: contactListIdSchema,
    }),
    outputSchema: s.looseRequiredObject("A Mailsoftly contact list.", {
      id: s.optional(contactListIdSchema),
      name: s.optional(s.string("The contact list name.")),
      contacts_count: s.optional(s.integer("The number of contacts in the list.")),
      created_at: s.optional(s.dateTime("The contact list creation timestamp.")),
      updated_at: s.optional(s.dateTime("The contact list update timestamp.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact_list_contacts",
    operationType: "read",
    description: "List contacts belonging to a Mailsoftly contact list.",
    inputSchema: s.requiredObject("Parameters for listing contacts in a Mailsoftly contact list.", {
      contact_list_id: contactListIdSchema,
    }),
    outputSchema: s.array("Contacts in the selected Mailsoftly list.", contactSummarySchema),
  }),
  defineProviderAction(service, {
    name: "create_contact_list",
    operationType: "write",
    description: "Create an empty Mailsoftly contact list.",
    inputSchema: s.requiredObject("Fields for creating a Mailsoftly contact list.", {
      name: s.nonEmptyString("The contact list name."),
    }),
    outputSchema: s.looseRequiredObject("The created Mailsoftly contact list.", {
      id: s.optional(contactListIdSchema),
      name: s.optional(s.string("The contact list name.")),
      created_at: s.optional(s.dateTime("The contact list creation timestamp.")),
      updated_at: s.optional(s.dateTime("The contact list update timestamp.")),
    }),
  }),
  defineProviderAction(service, {
    name: "add_contact_to_contact_list",
    operationType: "write",
    description: "Add an existing Mailsoftly contact to a contact list.",
    inputSchema: s.requiredObject("IDs for adding a contact to a Mailsoftly list.", {
      contact_list_id: contactListIdSchema,
      contact_id: contactIdSchema,
    }),
    outputSchema: s.looseRequiredObject("The result of adding a contact to a Mailsoftly list.", {
      status: s.optional(s.string("The operation status.")),
      info: s.optional(s.string("Information about the membership operation.")),
    }),
  }),
  defineProviderAction(service, {
    name: "add_contacts_to_contact_list",
    operationType: "write",
    description: "Add contacts to a Mailsoftly list by email, creating contacts that do not already exist.",
    inputSchema: s.requiredObject("Contacts to add to a Mailsoftly contact list.", {
      contact_list_id: contactListIdSchema,
      contacts: s.array(
        "Contacts to match or create by email.",
        s.object(
          "A contact to add to the list.",
          {
            email: emailSchema,
            first_name: s.string("The contact first name."),
            last_name: s.string("The contact last name."),
          },
          { optional: ["first_name", "last_name"] },
        ),
        { minItems: 1 },
      ),
    }),
    outputSchema: s.looseRequiredObject("The bulk contact-list membership result.", {
      status: s.optional(s.string("The operation status.")),
      added_count: s.optional(s.integer("The number of contacts added to the list.")),
      errors: s.optional(
        s.array(
          "Contacts that could not be added.",
          s.looseRequiredObject("One failed contact-list membership operation.", {
            contact: s.optional(s.looseObject("The contact payload that failed.")),
            error: s.optional(s.string("The error reported for the contact.")),
          }),
        ),
      ),
    }),
  }),
];

export type MailsoftlyActionName =
  | "get_contacts"
  | "get_contact"
  | "create_contact"
  | "update_contact"
  | "search_contacts"
  | "get_contact_lists"
  | "get_contact_list"
  | "get_contact_list_contacts"
  | "create_contact_list"
  | "add_contact_to_contact_list"
  | "add_contacts_to_contact_list";
