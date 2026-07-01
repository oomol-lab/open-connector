import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fireberry";

const rawObjectSchema = s.looseObject({}, { description: "The raw Fireberry object returned by the API." });

const queryScalarValueSchema = s.oneOf(
  [
    s.string("A string condition value."),
    s.number("A numeric condition value."),
    s.boolean("A boolean condition value."),
  ],
  { description: "A scalar Fireberry query condition value." },
);

const queryConditionValueSchema = s.oneOf(
  [queryScalarValueSchema, s.array("A list condition value for in or between operators.", queryScalarValueSchema)],
  { description: "The value to compare against in a Fireberry query." },
);

const queryFieldSchema = s.object(
  "A Fireberry query field to include in the response.",
  {
    name: s.string("A valid Fireberry field name, including related fields using underscore."),
    alias: s.string("An alias for the aggregated field in the result set."),
    aggrFunc: s.stringEnum("The aggregate function to apply to the field.", ["SUM", "COUNT", "MIN", "MAX"]),
  },
  { optional: ["alias", "aggrFunc"] },
);

const queryConditionSchema = s.object(
  "A Fireberry query filter condition.",
  {
    fieldName: s.string("The Fireberry field name to filter on."),
    operator: s.stringEnum("The Fireberry comparison operator.", [
      "eq",
      "ne",
      "lt",
      "gt",
      "le",
      "ge",
      "start-with",
      "not-start-with",
      "is-null",
      "is-not-null",
      "eq-in",
      "not-in",
      "between",
      "userid",
    ]),
    value: queryConditionValueSchema,
  },
  { optional: ["value"] },
);

const queryFilterGroupSchema = s.requiredObject("A Fireberry query condition group.", {
  type: s.stringEnum("The logical operator applied between conditions in this group.", ["AND", "OR"]),
  conditions: s.array("Filter conditions in this group.", queryConditionSchema, {
    minItems: 1,
  }),
});

const queryOrderSchema = s.object(
  "A Fireberry query sort instruction.",
  {
    fieldName: s.string("The Fireberry field name to sort by."),
    direction: s.stringEnum("The sort direction.", ["ASC", "DESC"]),
  },
  { optional: ["direction"] },
);

const queryGroupSchema = s.requiredObject("A Fireberry query grouping field.", {
  fieldName: s.string("The Fireberry field name to group by."),
});

const queryRecordsInputSchema = s.object(
  "Input for querying Fireberry records using the v3 query endpoint.",
  {
    objectType: s.integer("The numeric Fireberry object type code to query."),
    fields: s.array("Fields to include in the response.", queryFieldSchema, { minItems: 1 }),
    filter: s.array("Filter condition groups to apply.", queryFilterGroupSchema),
    orderBy: s.array("Sort instructions to apply.", queryOrderSchema),
    groupBy: s.array("Grouping fields to apply for aggregation mode.", queryGroupSchema),
    pageNumber: s.integer("The page number to return.", { minimum: 1 }),
    pageSize: s.integer("The number of records to return. Fireberry accepts 1 through 500.", {
      minimum: 1,
      maximum: 500,
    }),
  },
  {
    required: ["objectType", "fields"],
    optional: ["filter", "orderBy", "groupBy", "pageNumber", "pageSize"],
  },
);

const listRecordsInputSchema = s.object(
  "Input for listing Fireberry records from a built-in object.",
  {
    pageSize: s.integer("The maximum number of records to return. Fireberry accepts 1 through 50.", {
      minimum: 1,
      maximum: 50,
    }),
    pageNumber: s.integer("The page number to return. Fireberry accepts 1 through 10.", {
      minimum: 1,
      maximum: 10,
    }),
  },
  { optional: ["pageSize", "pageNumber"] },
);

const idInputSchema = s.requiredObject("Input for reading or deleting one Fireberry record.", {
  id: s.string("The Fireberry record GUID.", { minLength: 1 }),
});

const accountFieldsSchema = s.looseRequiredObject(
  "Fireberry account fields to create or update.",
  {
    accountname: s.string("Name of the account.", { minLength: 1 }),
    accountnumber: s.string("Account identifier; unique values are recommended."),
    emailaddress1: s.string("Primary email address for the account."),
    telephone1: s.string("Primary telephone number for the account."),
    websiteurl: s.string("Website URL for the account."),
    billingcity: s.string("Billing city."),
    billingcountry: s.string("Billing country."),
    billingstate: s.string("Billing state."),
    billingstreet: s.string("Billing street."),
    billingzipcode: s.string("Billing zip code."),
    description: s.string("Description of up to 4,000 characters."),
    ownerid: s.string("The GUID of the system user who owns the record."),
  },
  {
    optional: [
      "accountnumber",
      "emailaddress1",
      "telephone1",
      "websiteurl",
      "billingcity",
      "billingcountry",
      "billingstate",
      "billingstreet",
      "billingzipcode",
      "description",
      "ownerid",
    ],
  },
);

const contactFieldsSchema = s.looseRequiredObject(
  "Fireberry contact fields to create or update.",
  {
    firstname: s.string("First name of the contact.", { minLength: 1 }),
    lastname: s.string("Last name of the contact."),
    accountid: s.string("The related account GUID."),
    companyname: s.string("Company name."),
    jobtitle: s.string("Job title."),
    emailaddress1: s.string("Primary email address for the contact."),
    mobilephone1: s.string("Primary mobile phone number."),
    telephone1: s.string("Primary telephone number."),
    billingcity: s.string("Billing city."),
    billingcountry: s.string("Billing country."),
    billingstate: s.string("Billing state."),
    billingstreet: s.string("Billing street."),
    billingzipcode: s.string("Billing zip code."),
    description: s.string("Description of up to 4,000 characters."),
    ownerid: s.string("The GUID of the system user who owns the record."),
  },
  {
    optional: [
      "lastname",
      "accountid",
      "companyname",
      "jobtitle",
      "emailaddress1",
      "mobilephone1",
      "telephone1",
      "billingcity",
      "billingcountry",
      "billingstate",
      "billingstreet",
      "billingzipcode",
      "description",
      "ownerid",
    ],
  },
);

const createAccountInputSchema = s.requiredObject("Input for creating one Fireberry account.", {
  fields: accountFieldsSchema,
});

const updateAccountInputSchema = s.requiredObject("Input for updating one Fireberry account.", {
  id: s.string("The Fireberry account GUID.", { minLength: 1 }),
  fields: accountFieldsSchema,
});

const createContactInputSchema = s.requiredObject("Input for creating one Fireberry contact.", {
  fields: contactFieldsSchema,
});

const updateContactInputSchema = s.requiredObject("Input for updating one Fireberry contact.", {
  id: s.string("The Fireberry contact GUID.", { minLength: 1 }),
  fields: contactFieldsSchema,
});

const listRecordsOutputSchema = s.requiredObject("A Fireberry list records result.", {
  primaryKey: s.string("The primary key field name for the object."),
  primaryField: s.string("The primary display field name for the object."),
  totalRecords: s.integer("The total number of available records.", { minimum: 0 }),
  pageSize: s.integer("The returned page size.", { minimum: 0 }),
  pageNumber: s.integer("The returned page number.", { minimum: 0 }),
  records: s.array("Fireberry records returned by the API.", rawObjectSchema),
  raw: rawObjectSchema,
});

const recordOutputSchema = s.requiredObject("A Fireberry single record result.", {
  record: rawObjectSchema,
  raw: rawObjectSchema,
});

const mutationOutputSchema = s.requiredObject("A Fireberry mutation result.", {
  success: s.boolean("Whether Fireberry reported the mutation as successful."),
  message: s.string("The Fireberry response message."),
  record: rawObjectSchema,
  raw: rawObjectSchema,
});

const deleteOutputSchema = s.requiredObject("A Fireberry delete result.", {
  success: s.boolean("Whether Fireberry reported the delete as successful."),
  message: s.string("The Fireberry response message."),
  raw: rawObjectSchema,
});

const queryRecordsOutputSchema = s.requiredObject("A Fireberry v3 query result.", {
  records: s.array("Fireberry query records returned by the API.", rawObjectSchema),
  raw: rawObjectSchema,
});

export const fireberryActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_records",
    description: "Search, filter, sort, aggregate, and paginate Fireberry records using v3 query.",
    requiredScopes: [],
    inputSchema: queryRecordsInputSchema,
    outputSchema: queryRecordsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List Fireberry account records with simple page and page size controls.",
    requiredScopes: [],
    inputSchema: listRecordsInputSchema,
    outputSchema: listRecordsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_account",
    description: "Get one Fireberry account record by GUID.",
    requiredScopes: [],
    inputSchema: idInputSchema,
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_account",
    description: "Create one Fireberry account record.",
    requiredScopes: [],
    inputSchema: createAccountInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_account",
    description: "Update one Fireberry account record by GUID.",
    requiredScopes: [],
    inputSchema: updateAccountInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_account",
    description: "Delete one Fireberry account record by GUID.",
    requiredScopes: [],
    inputSchema: idInputSchema,
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Fireberry contact records with simple page and page size controls.",
    requiredScopes: [],
    inputSchema: listRecordsInputSchema,
    outputSchema: listRecordsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get one Fireberry contact record by GUID.",
    requiredScopes: [],
    inputSchema: idInputSchema,
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create one Fireberry contact record.",
    requiredScopes: [],
    inputSchema: createContactInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update one Fireberry contact record by GUID.",
    requiredScopes: [],
    inputSchema: updateContactInputSchema,
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete one Fireberry contact record by GUID.",
    requiredScopes: [],
    inputSchema: idInputSchema,
    outputSchema: deleteOutputSchema,
  }),
];

export type FireberryActionName =
  | "query_records"
  | "list_accounts"
  | "get_account"
  | "create_account"
  | "update_account"
  | "delete_account"
  | "list_contacts"
  | "get_contact"
  | "create_contact"
  | "update_contact"
  | "delete_contact";
