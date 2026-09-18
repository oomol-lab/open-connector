import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "planhat";

const rawObjectSchema = s.looseObject("Raw object returned by the official Planhat API.");
const customFieldsSchema = s.looseObject("Custom Planhat field values keyed by field name.");
const extraPropertiesSchema = s.looseObject("Additional documented top-level Planhat properties forwarded as-is.");
const stringArraySchema = s.array("String values.", s.string("One string value."));

const companyPayloadSchema = {
  name: s.nonEmptyString("The company name."),
  owner: s.nonEmptyString("The Planhat user ID of the company owner."),
  coOwner: s.nonEmptyString("The Planhat user ID of the company co-owner."),
  externalId: s.nonEmptyString("The company ID from your own system."),
  sourceId: s.nonEmptyString("The company ID from an integration source."),
  phase: s.nonEmptyString("The Planhat lifecycle phase name."),
  status: s.stringEnum("The Planhat company status.", ["prospect", "coming", "customer", "canceled", "lost"]),
  domains: s.array("Company domains.", s.nonEmptyString("One company domain.")),
  tags: stringArraySchema,
  description: s.string("The company description."),
  address: s.string("The company physical address."),
  country: s.string("The company country."),
  city: s.string("The company city."),
  zip: s.string("The company postal code."),
  phonePrimary: s.string("The company primary phone number."),
  web: s.string("The company website URL."),
  custom: customFieldsSchema,
  properties: extraPropertiesSchema,
};

const enduserPayloadSchema = {
  email: s.email("The end user email address."),
  companyId: s.nonEmptyString(
    "The related company ID. Use extid- or srcid-prefixed values to reference a company externalId or sourceId.",
  ),
  firstName: s.string("The end user first name."),
  lastName: s.string("The end user last name."),
  name: s.string("The end user display name."),
  externalId: s.nonEmptyString("The end user ID from your own system."),
  sourceId: s.nonEmptyString("The end user ID from an integration source."),
  position: s.string("The end user role or position."),
  phone: s.string("The end user phone number."),
  tags: stringArraySchema,
  featured: s.boolean("Whether the end user is a featured contact."),
  primary: s.boolean("Whether Planhat should give this end user extra email weighting."),
  archived: s.boolean("Whether the end user should be archived."),
  otherEmails: s.array("Additional end user email addresses.", s.email("One extra email address.")),
  npsUnsubscribed: s.boolean("Whether the end user is unsubscribed from NPS."),
  custom: customFieldsSchema,
  properties: extraPropertiesSchema,
};

const companyOutputSchema = s.looseObject("A normalized Planhat company resource.", {
  id: s.string("The Planhat company ID."),
  name: s.nullableString("The company name."),
  externalId: s.nullableString("The company ID from your own system."),
  sourceId: s.nullableString("The company ID from an integration source."),
  status: s.nullableString("The Planhat company status."),
  phase: s.nullableString("The Planhat lifecycle phase name."),
  raw: rawObjectSchema,
});

const enduserOutputSchema = s.looseObject("A normalized Planhat end user resource.", {
  id: s.string("The Planhat end user ID."),
  email: s.nullableString("The end user email address."),
  name: s.nullableString("The end user display name."),
  firstName: s.nullableString("The end user first name."),
  lastName: s.nullableString("The end user last name."),
  companyId: s.nullableString("The related Planhat company ID."),
  companyName: s.nullableString("The related Planhat company name."),
  externalId: s.nullableString("The end user ID from your own system."),
  sourceId: s.nullableString("The end user ID from an integration source."),
  raw: rawObjectSchema,
});

const listCompaniesInputSchema = s.object(
  "Query parameters for listing Planhat companies.",
  {
    companyId: s.nonEmptyString("Filter by one or more comma-separated Planhat company IDs."),
    limit: s.integer("Maximum number of companies to return.", { minimum: 1, maximum: 5000 }),
    offset: s.nonNegativeInteger("Zero-based list offset."),
    sort: s.nonEmptyString("Property to sort by. Prefix with - for descending order."),
    select: s.nonEmptyString("Comma-separated properties to include in the response."),
  },
  { optional: ["companyId", "limit", "offset", "sort", "select"] },
);

const listEndusersInputSchema = s.object(
  "Query parameters for listing Planhat end users.",
  {
    companyId: s.nonEmptyString("Filter by one or more comma-separated Planhat company IDs."),
    limit: s.integer("Maximum number of end users to return.", { minimum: 1, maximum: 2000 }),
    offset: s.nonNegativeInteger("Zero-based list offset."),
    sort: s.nonEmptyString("Property to sort by. Prefix with - for descending order."),
    select: s.nonEmptyString("Comma-separated properties to include in the response."),
    archived: s.boolean("Whether archived end users should be included."),
    email: s.email("Filter by email address."),
    euId: s.nonEmptyString("Filter by Planhat end user ID."),
  },
  { optional: ["companyId", "limit", "offset", "sort", "select", "archived", "email", "euId"] },
);

const companyResultSchema = s.requiredObject("Company returned by Planhat.", {
  company: companyOutputSchema,
  raw: rawObjectSchema,
});

const enduserResultSchema = s.requiredObject("End user returned by Planhat.", {
  enduser: enduserOutputSchema,
  raw: rawObjectSchema,
});

export const planhatActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_company",
    operationType: "write",
    description: "Create a Planhat company.",
    requiredScopes: [],
    inputSchema: s.object("Input for creating a Planhat company.", companyPayloadSchema, {
      optional: [
        "owner",
        "coOwner",
        "externalId",
        "sourceId",
        "phase",
        "status",
        "domains",
        "tags",
        "description",
        "address",
        "country",
        "city",
        "zip",
        "phonePrimary",
        "web",
        "custom",
        "properties",
      ],
    }),
    outputSchema: companyResultSchema,
  }),
  defineProviderAction(service, {
    name: "update_company",
    operationType: "write",
    description: "Update a Planhat company by ID, externalId, or sourceId.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for updating a Planhat company.",
      {
        companyId: s.nonEmptyString(
          "The Planhat company ID. Use extid- or srcid-prefixed values to reference externalId or sourceId.",
        ),
        ...companyPayloadSchema,
      },
      {
        optional: [
          "name",
          "owner",
          "coOwner",
          "externalId",
          "sourceId",
          "phase",
          "status",
          "domains",
          "tags",
          "description",
          "address",
          "country",
          "city",
          "zip",
          "phonePrimary",
          "web",
          "custom",
          "properties",
        ],
      },
    ),
    outputSchema: companyResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_company",
    operationType: "read",
    description: "Get a Planhat company by ID, externalId, or sourceId.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input for retrieving a Planhat company.", {
      companyId: s.nonEmptyString(
        "The Planhat company ID. Use extid- or srcid-prefixed values to reference externalId or sourceId.",
      ),
    }),
    outputSchema: companyResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_companies",
    operationType: "read",
    description: "List Planhat companies with offset pagination.",
    requiredScopes: [],
    inputSchema: listCompaniesInputSchema,
    outputSchema: s.requiredObject("A page of Planhat companies.", {
      companies: s.array("Companies returned by Planhat.", companyOutputSchema),
      count: s.integer("Number of companies returned in this page."),
      raw: s.array("Raw company objects returned by Planhat.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_enduser",
    operationType: "write",
    description: "Create a Planhat end user.",
    requiredScopes: [],
    inputSchema: s.object("Input for creating a Planhat end user.", enduserPayloadSchema, {
      optional: [
        "firstName",
        "lastName",
        "name",
        "companyId",
        "externalId",
        "sourceId",
        "position",
        "phone",
        "tags",
        "featured",
        "primary",
        "archived",
        "otherEmails",
        "npsUnsubscribed",
        "custom",
        "properties",
      ],
    }),
    outputSchema: enduserResultSchema,
  }),
  defineProviderAction(service, {
    name: "update_enduser",
    operationType: "write",
    description: "Update a Planhat end user by ID, externalId, or sourceId.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for updating a Planhat end user.",
      {
        enduserId: s.nonEmptyString(
          "The Planhat end user ID. Use extid- or srcid-prefixed values to reference externalId or sourceId.",
        ),
        ...enduserPayloadSchema,
      },
      {
        optional: [
          "email",
          "companyId",
          "firstName",
          "lastName",
          "name",
          "externalId",
          "sourceId",
          "position",
          "phone",
          "tags",
          "featured",
          "primary",
          "archived",
          "otherEmails",
          "npsUnsubscribed",
          "custom",
          "properties",
        ],
      },
    ),
    outputSchema: enduserResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_enduser",
    operationType: "read",
    description: "Get a Planhat end user by ID, externalId, or sourceId.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input for retrieving a Planhat end user.", {
      enduserId: s.nonEmptyString(
        "The Planhat end user ID. Use extid- or srcid-prefixed values to reference externalId or sourceId.",
      ),
    }),
    outputSchema: enduserResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_endusers",
    operationType: "read",
    description: "List Planhat end users with offset pagination.",
    requiredScopes: [],
    inputSchema: listEndusersInputSchema,
    outputSchema: s.requiredObject("A page of Planhat end users.", {
      endusers: s.array("End users returned by Planhat.", enduserOutputSchema),
      count: s.integer("Number of end users returned in this page."),
      raw: s.array("Raw end user objects returned by Planhat.", rawObjectSchema),
    }),
  }),
];
