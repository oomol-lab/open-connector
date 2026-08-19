import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailercloud";

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const boundedString = (description: string, options: { minLength?: number; maxLength?: number }) =>
  s.string(description, options);
const propertyValueSchema = s.anyOf("A custom property value accepted by Mailercloud.", [
  s.string("A string custom property value."),
  s.number("A numeric custom property value."),
]);
const customFieldsSchema = s.record(
  "Custom contact property values keyed by Mailercloud property ID.",
  propertyValueSchema,
);

const mailercloudResponseSchema = s.looseObject("A Mailercloud JSON response.", {
  id: s.string("The Mailercloud resource ID returned by create or update operations."),
  success: s.boolean("Whether Mailercloud accepted the request."),
  message: s.string("A response message returned by Mailercloud."),
  error: s.string("An error message returned by Mailercloud."),
  count: s.number("The total number of records returned by Mailercloud."),
  data: s.unknown("The response payload returned by Mailercloud."),
  errors: s.array(
    "Errors returned by Mailercloud.",
    s.looseObject("A Mailercloud error item.", {
      field: s.string("The field associated with the error."),
      message: s.string("The error message."),
    }),
  ),
});

const createContactInputSchema = s.object(
  "Input payload for creating a Mailercloud contact.",
  {
    email: s.string("The contact's email address.", {
      format: "email",
      maxLength: 200,
    }),
    list_id: nonEmptyString("The Mailercloud list ID where the contact should be added."),
    first_name: boundedString("The contact's first name.", { minLength: 1, maxLength: 25 }),
    middle_name: boundedString("The contact's middle name.", { minLength: 1, maxLength: 25 }),
    last_name: boundedString("The contact's last name.", { minLength: 1, maxLength: 25 }),
    phone: boundedString("The contact's phone number.", { minLength: 1, maxLength: 25 }),
    city: boundedString("The contact's city.", { minLength: 1, maxLength: 100 }),
    state: boundedString("The contact's state or province.", { minLength: 1, maxLength: 100 }),
    country: boundedString("The contact's country.", { minLength: 1, maxLength: 50 }),
    postal_code: boundedString("The contact's postal code.", { minLength: 1, maxLength: 25 }),
    company_name: boundedString("The contact's company name.", { minLength: 1, maxLength: 150 }),
    job_title: boundedString("The contact's job title.", { minLength: 1, maxLength: 100 }),
    department: boundedString("The contact's department.", { minLength: 1, maxLength: 100 }),
    industry: boundedString("The contact's industry.", { minLength: 1, maxLength: 100 }),
    salary: s.number("The contact's salary or numeric value used by Mailercloud segmentation."),
    lead_source: boundedString("The source where this contact was collected.", {
      minLength: 1,
      maxLength: 50,
    }),
    contact_type: s.stringEnum("The Mailercloud contact status to set.", [
      "active",
      "bounce",
      "abuse",
      "unsubscribe",
      "suppressed",
      "spam complaints",
    ]),
    tags: s.array("Tags to attach to the contact.", nonEmptyString("A Mailercloud contact tag.")),
    custom_fields: customFieldsSchema,
  },
  {
    optional: [
      "first_name",
      "middle_name",
      "last_name",
      "phone",
      "city",
      "state",
      "country",
      "postal_code",
      "company_name",
      "job_title",
      "department",
      "industry",
      "salary",
      "lead_source",
      "contact_type",
      "tags",
      "custom_fields",
    ],
  },
);

const createListInputSchema = s.object(
  "Input payload for creating a Mailercloud recipient list.",
  {
    name: boundedString("The display name of the recipient list.", {
      minLength: 3,
      maxLength: 100,
    }),
    list_type: s.literal(1, { description: "The Mailercloud list type. Use 1 for a normal list." }),
  },
  { required: ["name", "list_type"] },
);

const listPropertiesInputSchema = s.object(
  "Input payload for listing Mailercloud contact properties.",
  {
    page: s.positiveInteger("The page number to request."),
    limit: s.integer("The number of records to return per page.", {
      minimum: 10,
      maximum: 100,
    }),
    search: nonEmptyString("Filter contact properties by name."),
    type: s.stringEnum("Filter contact properties by property source.", ["default", "custom"]),
  },
  { optional: ["search", "type"] },
);

const createPropertyInputSchema = s.object(
  "Input payload for creating a Mailercloud contact custom property.",
  {
    name: boundedString("The name of the custom property.", { minLength: 3, maxLength: 30 }),
    type: s.stringEnum("The custom property type.", ["text", "number", "date", "textarea"]),
    description: boundedString("A description of the custom property's purpose.", {
      minLength: 3,
      maxLength: 500,
    }),
  },
  { optional: ["description"] },
);

const updatePropertyInputSchema = s.object(
  "Input payload for updating a Mailercloud contact custom property.",
  {
    property_id: nonEmptyString("The ID of the custom property to update."),
    name: boundedString("The new custom property name.", { minLength: 3, maxLength: 30 }),
    description: boundedString("The new custom property description.", {
      minLength: 3,
      maxLength: 500,
    }),
  },
  { optional: ["description"] },
);

const deletePropertyInputSchema = s.object(
  "Input payload for deleting a Mailercloud contact custom property.",
  {
    property_id: nonEmptyString("The ID of the custom property to delete."),
  },
  { required: ["property_id"] },
);

export const mailercloudActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a Mailercloud contact in a recipient list with optional standard and custom fields.",
    inputSchema: createContactInputSchema,
    outputSchema: mailercloudResponseSchema,
  }),
  defineProviderAction(service, {
    name: "create_list",
    description: "Create a Mailercloud recipient list for storing and managing contacts.",
    inputSchema: createListInputSchema,
    outputSchema: mailercloudResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_contact_properties",
    description: "List Mailercloud contact custom properties.",
    inputSchema: listPropertiesInputSchema,
    outputSchema: mailercloudResponseSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact_property",
    description: "Create a custom property for Mailercloud contact records.",
    inputSchema: createPropertyInputSchema,
    outputSchema: mailercloudResponseSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact_property",
    description: "Update the name or description of a Mailercloud contact custom property.",
    inputSchema: updatePropertyInputSchema,
    outputSchema: mailercloudResponseSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact_property",
    description: "Delete a Mailercloud contact custom property by ID.",
    inputSchema: deletePropertyInputSchema,
    outputSchema: mailercloudResponseSchema,
  }),
];
