import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "postgrid";

const trimmedString = (description: string): JsonSchema => s.string({ description, minLength: 1, pattern: "\\S" });

const metadataSchema = s.record(
  "Metadata key-value pairs stored with the PostGrid resource.",
  s.unknown("A metadata value stored with the PostGrid resource."),
);

const listInputSchema = s.object(
  {
    skip: s.nonNegativeInteger("The number of resources to skip before returning results."),
    limit: s.positiveInteger("The maximum number of resources to return."),
    search: trimmedString(
      "An unstructured search string or a JSON string representing a PostGrid structured search query.",
    ),
  },
  {
    required: [],
    description: "Pagination and search options for listing PostGrid resources.",
  },
);

const contactIdInputSchema = s.object(
  {
    id: trimmedString("The PostGrid contact ID."),
  },
  {
    required: ["id"],
    description: "The input payload for selecting a PostGrid contact.",
  },
);

const templateIdInputSchema = s.object(
  {
    id: trimmedString("The PostGrid template ID."),
  },
  {
    required: ["id"],
    description: "The input payload for selecting a PostGrid template.",
  },
);

const contactSchema = s.looseObject("A PostGrid contact object.", {
  id: s.string("The unique PostGrid contact ID."),
  object: s.literal("contact", { description: "The PostGrid object type." }),
  live: s.boolean("Whether the contact belongs to live mode."),
  addressLine1: s.string("The first line of the contact's address."),
  addressLine2: s.string("The second line of the contact's address when present."),
  city: s.string("The city of the contact's address."),
  provinceOrState: s.string("The state or province of the contact's address."),
  postalOrZip: s.string("The postal or ZIP code of the contact's address."),
  countryCode: s.string("The ISO 3166-1 country code of the contact's address."),
  addressStatus: s.string("The address verification status returned by PostGrid."),
  addressErrors: s.string("Address verification warnings or errors returned by PostGrid."),
  companyName: s.string("The contact company name."),
  firstName: s.string("The contact first name."),
  lastName: s.string("The contact last name."),
  email: s.string("The contact email address."),
  phoneNumber: s.string("The contact phone number."),
  jobTitle: s.string("The contact job title."),
  description: s.string("The optional contact description stored in PostGrid."),
  metadata: metadataSchema,
  skipVerification: s.boolean("Whether PostGrid skipped address verification for this contact."),
  forceVerifiedStatus: s.boolean("Whether PostGrid forced this contact to verified status."),
  createdAt: s.dateTime("The time when PostGrid created the contact."),
  updatedAt: s.dateTime("The time when PostGrid last updated the contact."),
});

const templateSchema = s.looseObject("A PostGrid template object.", {
  id: s.string("The unique PostGrid template ID."),
  object: s.literal("template", { description: "The PostGrid object type." }),
  live: s.boolean("Whether the template belongs to live mode."),
  html: s.string("The HTML content of the template."),
  description: s.string("The optional template description stored in PostGrid."),
  metadata: metadataSchema,
  createdAt: s.dateTime("The time when PostGrid created the template."),
  updatedAt: s.dateTime("The time when PostGrid last updated the template."),
});

const contactListOutputSchema = s.actionOutput(
  {
    object: s.literal("list", { description: "The PostGrid list object type." }),
    totalCount: s.integer("The total number of contacts matching the query."),
    skip: s.integer("The number of contacts skipped by PostGrid."),
    limit: s.integer("The maximum number of contacts PostGrid returned."),
    data: s.array("The contacts returned by PostGrid.", contactSchema),
  },
  "The paginated PostGrid contact list response.",
);

const templateListOutputSchema = s.actionOutput(
  {
    object: s.literal("list", { description: "The PostGrid list object type." }),
    totalCount: s.integer("The total number of templates matching the query."),
    skip: s.integer("The number of templates skipped by PostGrid."),
    limit: s.integer("The maximum number of templates PostGrid returned."),
    data: s.array("The templates returned by PostGrid.", templateSchema),
  },
  "The paginated PostGrid template list response.",
);

const contactDeleteOutputSchema = s.actionOutput(
  {
    object: s.literal("contact", { description: "The PostGrid object type." }),
    id: s.string("The deleted PostGrid contact ID."),
    deleted: s.literal(true, { description: "Whether PostGrid deleted the contact." }),
  },
  "The PostGrid contact delete response.",
);

const templateDeleteOutputSchema = s.actionOutput(
  {
    object: s.literal("template", { description: "The PostGrid object type." }),
    id: s.string("The deleted PostGrid template ID."),
    deleted: s.literal(true, { description: "Whether PostGrid deleted the template." }),
  },
  "The PostGrid template delete response.",
);

const createContactInputSchema = requireAnyContactName(
  s.object(
    {
      addressLine1: trimmedString("The first line of the contact's address."),
      addressLine2: trimmedString("The second line of the contact's address."),
      city: trimmedString("The city of the contact's address."),
      provinceOrState: trimmedString("The state or province of the contact's address."),
      postalOrZip: trimmedString("The postal or ZIP code of the contact's address."),
      countryCode: s.string({
        description: "The ISO 3166-1 alpha-2 country code of the contact's address.",
        pattern: "^\\s*[A-Za-z]{2}\\s*$",
      }),
      companyName: trimmedString("The contact company name. Required when firstName is omitted."),
      firstName: trimmedString("The contact first name. Required when companyName is omitted."),
      lastName: trimmedString("The contact last name."),
      email: trimmedString("The contact email address."),
      phoneNumber: trimmedString("The contact phone number."),
      jobTitle: trimmedString("The contact job title."),
      description: trimmedString("An optional description visible in PostGrid and the dashboard."),
      metadata: metadataSchema,
      skipVerification: s.boolean("Whether PostGrid should skip address verification."),
      forceVerifiedStatus: s.boolean("Whether PostGrid should force this contact to verified status."),
    },
    {
      required: ["addressLine1", "countryCode"],
      description: "The input payload for creating a PostGrid contact.",
    },
  ),
);

const createTemplateInputSchema = s.object(
  {
    html: trimmedString("The HTML content of the template."),
    description: trimmedString("An optional description visible in PostGrid and the dashboard."),
    metadata: metadataSchema,
  },
  {
    required: [],
    description: "The input payload for creating a PostGrid template.",
  },
);

const updateTemplateInputSchema = s.object(
  {
    id: trimmedString("The PostGrid template ID to update."),
    html: trimmedString("The replacement HTML content for the template."),
    description: trimmedString("The replacement description for the template."),
    metadata: metadataSchema,
  },
  {
    required: ["id"],
    description: "The input payload for updating a PostGrid template.",
  },
);

export const postgridActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a PostGrid Print & Mail contact using either a person name, company name, or both.",
    inputSchema: createContactInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List PostGrid Print & Mail contacts with optional pagination and search.",
    inputSchema: listInputSchema,
    outputSchema: contactListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Retrieve one PostGrid Print & Mail contact by ID.",
    inputSchema: contactIdInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete one PostGrid Print & Mail contact by ID.",
    inputSchema: contactIdInputSchema,
    outputSchema: contactDeleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_template",
    description: "Create a PostGrid Print & Mail template with optional HTML, description, and metadata.",
    inputSchema: createTemplateInputSchema,
    outputSchema: templateSchema,
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List PostGrid Print & Mail templates with optional pagination and search.",
    inputSchema: listInputSchema,
    outputSchema: templateListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Retrieve one PostGrid Print & Mail template by ID.",
    inputSchema: templateIdInputSchema,
    outputSchema: templateSchema,
  }),
  defineProviderAction(service, {
    name: "update_template",
    description: "Update the HTML, description, or metadata of one PostGrid Print & Mail template.",
    inputSchema: updateTemplateInputSchema,
    outputSchema: templateSchema,
  }),
  defineProviderAction(service, {
    name: "delete_template",
    description: "Delete one PostGrid Print & Mail template by ID.",
    inputSchema: templateIdInputSchema,
    outputSchema: templateDeleteOutputSchema,
  }),
];

function requireAnyContactName(schema: JsonSchema): JsonSchema {
  return {
    ...schema,
    anyOf: [{ required: ["firstName"] }, { required: ["companyName"] }],
  };
}
