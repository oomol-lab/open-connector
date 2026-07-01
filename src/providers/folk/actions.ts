import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "folk";

const idField = (description: string) => s.string({ minLength: 40, maxLength: 40, description });
const limitField = s.integer("The number of items to return.", { minimum: 1, maximum: 100 });
const cursorField = s.string({
  minLength: 1,
  maxLength: 128,
  description: "The opaque pagination cursor returned by a previous Folk response.",
});
const combinatorField = s.stringEnum("The logical operator used to combine multiple Folk filters.", ["and", "or"]);
const nonEmptyStringField = (description: string, maxLength = 1000) =>
  s.string({ minLength: 1, maxLength, description });
const nullSchema: JsonSchema = { type: "null" };
const nullableDateField = s.nullable(
  s.string({
    format: "date",
    minLength: 10,
    maxLength: 10,
    description: "The ISO 8601 calendar date in YYYY-MM-DD format.",
  }),
);
const nullableDateTimeField = s.nullable(s.dateTime("The ISO 8601 date-time returned by Folk when available."));

const userSchema = s.object("A Folk workspace user.", {
  id: idField("The Folk user ID."),
  fullName: s.string("The full name of the workspace user."),
  email: s.string("The email address of the workspace user."),
});
const paginationSchema = s.object("Pagination metadata returned by Folk list endpoints.", {
  nextLink: s.nullable(s.url("The full URL of the next page when Folk returned one.")),
  nextCursor: s.nullable(s.string("The cursor extracted from pagination.nextLink for the next list request.")),
});
const groupSchema = s.object("A Folk group.", {
  id: idField("The Folk group ID."),
  name: s.string("The group name."),
});
const groupCustomFieldOptionSchema = s.object("One selectable option for a Folk group custom field.", {
  label: s.string("The option label."),
  color: s.string("The color string returned by Folk for the option."),
});
const groupCustomFieldConfigSchema = s.object("The configuration block returned for some Folk custom fields.", {
  format: s.string("The display format returned by Folk when available."),
  currency: s.string("The currency code returned by Folk when available."),
});
const groupCustomFieldSchema = s.object("A custom field attached to one Folk group and entity type.", {
  name: s.string("The custom field name."),
  type: s.string("The custom field type returned by Folk."),
  options: s.nullable(
    s.array("The selectable options returned for select-type custom fields.", groupCustomFieldOptionSchema),
  ),
  config: s.nullable(groupCustomFieldConfigSchema),
});
const companyReferenceSchema = s.object("A company reference returned on a Folk person record.", {
  id: idField("The Folk company ID."),
  name: s.string("The company name."),
});
const interactionCountSchema = s.object("Interaction counters returned by Folk.", {
  approximateCount: s.integer({ minimum: 0, description: "The approximate number of matching interactions." }),
  lastInteractedAt: nullableDateTimeField,
});
const interactionWorkspaceSchema = s.object("Workspace-level interaction metadata returned by Folk.", {
  approximateCount: s.integer({ minimum: 0, description: "The approximate number of workspace interactions." }),
  lastInteractedAt: nullableDateTimeField,
  lastInteractedBy: s.array("The workspace users who last interacted with the contact.", userSchema),
});
const interactionMetadataSchema = s.object("Interaction metadata returned by Folk for a contact.", {
  user: interactionCountSchema,
  workspace: interactionWorkspaceSchema,
});
const strongestConnectionSchema = s.record(userSchema, {
  description: "The strongest-connection map keyed by Folk group ID.",
});
const customFieldValuesSchema = s.unknownObject("Custom field values grouped by Folk group ID and custom field name.");
const personSchema = s.object("A normalized Folk person record.", {
  id: idField("The Folk person ID."),
  firstName: s.string("The person's first name."),
  lastName: s.string("The person's last name."),
  fullName: s.string("The person's full name."),
  description: s.string("The person's description."),
  birthday: nullableDateField,
  jobTitle: s.string("The person's job title."),
  createdAt: nullableDateTimeField,
  createdBy: s.nullable(userSchema),
  groups: s.array("The groups associated with the person.", groupSchema),
  companies: s.array("The companies associated with the person.", companyReferenceSchema),
  addresses: s.array("The addresses associated with the person.", s.string("One address value.")),
  emails: s.array("The email addresses associated with the person.", s.string("One email value.")),
  phones: s.array("The phone numbers associated with the person.", s.string("One phone value.")),
  urls: s.array("The URLs associated with the person.", s.string("One URL value.")),
  customFieldValues: customFieldValuesSchema,
  interactionMetadata: s.nullable(interactionMetadataSchema),
  strongestConnection: strongestConnectionSchema,
});
const companySchema = s.object("A normalized Folk company record.", {
  id: idField("The Folk company ID."),
  name: s.string("The company name."),
  description: s.string("The company description."),
  fundingRaised: s.nullable(s.string("The amount of funding raised by the company in USD as a string.")),
  lastFundingDate: nullableDateField,
  industry: s.nullable(s.string("The industry returned by Folk when available.")),
  foundationYear: s.nullable(s.string("The company foundation year returned by Folk.")),
  employeeRange: s.nullable(s.string("The employee range returned by Folk.")),
  groups: s.array("The groups associated with the company.", groupSchema),
  addresses: s.array("The addresses associated with the company.", s.string("One address value.")),
  emails: s.array("The email addresses associated with the company.", s.string("One email value.")),
  phones: s.array("The phone numbers associated with the company.", s.string("One phone value.")),
  urls: s.array("The URLs associated with the company.", s.string("One URL value.")),
  createdAt: nullableDateTimeField,
  createdBy: s.nullable(userSchema),
  customFieldValues: customFieldValuesSchema,
});
const groupReferenceInputSchema = s.object("A Folk group reference identified by group ID.", {
  id: idField("The Folk group ID."),
});
const companyReferenceInputSchema = s.anyOf(
  [
    s.object("Create or link a company by name.", {
      name: nonEmptyStringField("The company name.", 500),
    }),
    s.object("Link an existing company by ID.", {
      id: idField("The Folk company ID."),
    }),
  ],
  { description: "A Folk company reference identified by name or ID." },
);
const stringListField = (itemDescription: string, listDescription: string, maxItems = 20) =>
  s.array(listDescription, s.string({ minLength: 1, description: itemDescription }), { maxItems });
const personMutationFields: Record<string, JsonSchema> = {
  firstName: nonEmptyStringField("The person's first name.", 500),
  lastName: nonEmptyStringField("The person's last name.", 500),
  fullName: nonEmptyStringField("The person's full name.", 1000),
  description: s.string({ maxLength: 5000, description: "The person's description." }),
  birthday: nullableDateField,
  jobTitle: s.string({ maxLength: 500, description: "The person's job title." }),
  groups: s.array("The groups to associate with the person.", groupReferenceInputSchema, { maxItems: 100 }),
  companies: s.array("The companies to associate with the person.", companyReferenceInputSchema, { maxItems: 20 }),
  addresses: stringListField("One address value.", "The addresses associated with the person."),
  emails: stringListField("One email address.", "The email addresses associated with the person."),
  phones: stringListField("One phone number.", "The phone numbers associated with the person."),
  urls: stringListField("One URL value.", "The URLs associated with the person."),
  customFieldValues: customFieldValuesSchema,
};
const companyMutationFields: Record<string, JsonSchema> = {
  name: nonEmptyStringField("The company name."),
  description: s.string({ maxLength: 5000, description: "The company description." }),
  fundingRaised: s.anyOf(
    [
      s.number("The funding amount as a number."),
      s.string({ minLength: 1, maxLength: 20, description: "The funding amount as a string." }),
      nullSchema,
    ],
    { description: "The amount of funding raised by the company in USD." },
  ),
  lastFundingDate: nullableDateField,
  industry: s.nullable(s.string({ maxLength: 1000, description: "The company industry." })),
  foundationYear: s.anyOf(
    [
      s.string({
        minLength: 4,
        maxLength: 4,
        pattern: "^\\d{4}$",
        description: "The foundation year as a string.",
      }),
      s.integer("The foundation year as a number.", { minimum: 1000, maximum: 2100 }),
      nullSchema,
    ],
    { description: "The company foundation year in YYYY format." },
  ),
  employeeRange: s.nullable(
    s.stringEnum("The company employee range.", [
      "1-10",
      "11-50",
      "51-200",
      "201-500",
      "501-1000",
      "1001-5000",
      "5001-10000",
      "10000+",
    ]),
  ),
  groups: s.array("The groups to associate with the company.", groupReferenceInputSchema, { maxItems: 100 }),
  addresses: stringListField("One address value.", "The addresses associated with the company."),
  emails: stringListField("One email address.", "The email addresses associated with the company."),
  phones: stringListField("One phone number.", "The phone numbers associated with the company."),
  urls: stringListField("One URL value.", "The URLs associated with the company."),
  customFieldValues: customFieldValuesSchema,
};
const personMutableKeys = Object.keys(personMutationFields);
const companyMutableKeys = Object.keys(companyMutationFields);

function listInputSchema(description: string, withFilters: boolean): JsonSchema {
  return s.object(
    description,
    {
      limit: limitField,
      cursor: cursorField,
      combinator: combinatorField,
      filter: s.unknownObject(
        'The official Folk filter object. Use nested properties such as {"fullName":{"like":"John"}} or {"groups":{"all":{"id":["grp_1","grp_2"]}}}. For empty and not_empty filters, pass true.',
      ),
    },
    {
      optional: withFilters ? ["limit", "cursor", "combinator", "filter"] : ["limit", "cursor", "combinator"],
    },
  );
}

const personMutationInputSchema = s.object("The input payload for creating a Folk person.", personMutationFields, {
  optional: personMutableKeys,
});
const companyMutationInputSchema = s.object("The input payload for creating a Folk company.", companyMutationFields, {
  optional: companyMutableKeys,
});
const updatePersonInputSchema = {
  ...s.object(
    "The input payload for updating a Folk person.",
    {
      personId: idField("The Folk person ID."),
      ...personMutationFields,
    },
    { optional: personMutableKeys },
  ),
  anyOf: personMutableKeys.map((key) => ({ required: [key] })),
};
const updateCompanyInputSchema = {
  ...s.object(
    "The input payload for updating a Folk company.",
    {
      companyId: idField("The Folk company ID."),
      ...companyMutationFields,
    },
    { optional: companyMutableKeys },
  ),
  anyOf: companyMutableKeys.map((key) => ({ required: [key] })),
};

export const folkActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current Folk workspace user associated with the API key.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching the current Folk user.", {}),
    outputSchema: s.object("The response returned when fetching the current Folk user.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List workspace users from Folk with cursor pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Folk workspace users.",
      { limit: limitField, cursor: cursorField },
      { optional: ["limit", "cursor"] },
    ),
    outputSchema: s.object("The response returned when listing Folk workspace users.", {
      users: s.array("The users returned by Folk.", userSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get one Folk workspace user by user ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching one Folk user.", {
      userId: idField("The Folk user ID."),
    }),
    outputSchema: s.object("The response returned when fetching one Folk user.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List Folk workspace groups with cursor pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Folk groups.",
      { limit: limitField, cursor: cursorField },
      { optional: ["limit", "cursor"] },
    ),
    outputSchema: s.object("The response returned when listing Folk groups.", {
      groups: s.array("The groups returned by Folk.", groupSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_group_custom_fields",
    description: "List Folk custom fields for one group and entity type.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Folk custom fields for one group.",
      {
        groupId: idField("The Folk group ID."),
        entityType: nonEmptyStringField("The entity type such as person, company, or a custom object name.", 500),
        limit: limitField,
        cursor: cursorField,
      },
      { optional: ["limit", "cursor"] },
    ),
    outputSchema: s.object("The response returned when listing Folk group custom fields.", {
      customFields: s.array("The custom fields returned by Folk.", groupCustomFieldSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_people",
    description: "List Folk people with official cursor pagination and the documented nested filter syntax.",
    requiredScopes: [],
    inputSchema: listInputSchema("The input payload for listing Folk people.", true),
    outputSchema: s.object("The response returned when listing Folk people.", {
      people: s.array("The people returned by Folk.", personSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_person",
    description: "Get one Folk person by person ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching one Folk person.", {
      personId: idField("The Folk person ID."),
    }),
    outputSchema: s.object("The response returned when fetching one Folk person.", {
      person: personSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_person",
    description: "Create one Folk person using the official people payload fields.",
    requiredScopes: [],
    inputSchema: personMutationInputSchema,
    outputSchema: s.object("The response returned when creating one Folk person.", {
      person: personSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_person",
    description: "Update one Folk person by person ID using the official people payload fields.",
    requiredScopes: [],
    inputSchema: updatePersonInputSchema,
    outputSchema: s.object("The response returned when updating one Folk person.", {
      person: personSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_person",
    description: "Delete one Folk person by person ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for deleting one Folk person.", {
      personId: idField("The Folk person ID."),
    }),
    outputSchema: s.object("The response returned when deleting one Folk person.", {
      id: idField("The deleted Folk person ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_companies",
    description: "List Folk companies with official cursor pagination and the documented nested filter syntax.",
    requiredScopes: [],
    inputSchema: listInputSchema("The input payload for listing Folk companies.", true),
    outputSchema: s.object("The response returned when listing Folk companies.", {
      companies: s.array("The companies returned by Folk.", companySchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_company",
    description: "Get one Folk company by company ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching one Folk company.", {
      companyId: idField("The Folk company ID."),
    }),
    outputSchema: s.object("The response returned when fetching one Folk company.", {
      company: companySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_company",
    description: "Create one Folk company using the official companies payload fields.",
    requiredScopes: [],
    inputSchema: companyMutationInputSchema,
    outputSchema: s.object("The response returned when creating one Folk company.", {
      company: companySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_company",
    description: "Update one Folk company by company ID using the official companies payload fields.",
    requiredScopes: [],
    inputSchema: updateCompanyInputSchema,
    outputSchema: s.object("The response returned when updating one Folk company.", {
      company: companySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_company",
    description: "Delete one Folk company by company ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for deleting one Folk company.", {
      companyId: idField("The Folk company ID."),
    }),
    outputSchema: s.object("The response returned when deleting one Folk company.", {
      id: idField("The deleted Folk company ID."),
    }),
  }),
];

export type FolkActionName =
  | "get_current_user"
  | "list_users"
  | "get_user"
  | "list_groups"
  | "list_group_custom_fields"
  | "list_people"
  | "get_person"
  | "create_person"
  | "update_person"
  | "delete_person"
  | "list_companies"
  | "get_company"
  | "create_company"
  | "update_company"
  | "delete_company";

export const folkPersonMutableKeys: readonly string[] = personMutableKeys;
export const folkCompanyMutableKeys: readonly string[] = companyMutableKeys;
