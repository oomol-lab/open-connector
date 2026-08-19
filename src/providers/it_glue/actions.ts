import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "it_glue";

const idSchema = s.positiveInteger("The IT Glue numeric resource ID.");
const organizationIdSchema = s.positiveInteger("The IT Glue organization ID.");
const organizationTypeIdSchema = s.positiveInteger("Filter organizations by IT Glue organization type ID.");
const organizationStatusIdSchema = s.positiveInteger("Filter organizations by IT Glue organization status ID.");
const configurationTypeIdSchema = s.positiveInteger("Filter configurations by IT Glue configuration type ID.");
const configurationStatusIdSchema = s.positiveInteger("Filter configurations by IT Glue configuration status ID.");
const contactTypeIdSchema = s.positiveInteger("Filter contacts by IT Glue contact type ID.");
const pageNumberSchema = s.positiveInteger("The 1-based IT Glue page number.");
const pageSizeSchema = s.integer("The number of records to return. IT Glue allows 1 through 1000.", {
  minimum: 1,
  maximum: 1000,
});
const dateRangeSchema = s.string("An IT Glue date range string such as 2026-01-01,2026-01-07 or *,2026-01-07.", {
  minLength: 1,
});
const jsonApiResourceSchema = s.looseRequiredObject("An IT Glue JSON:API resource object.", {
  id: s.string("The resource ID returned by IT Glue."),
  type: s.string("The JSON:API resource type returned by IT Glue."),
  attributes: s.looseObject("The resource attributes returned by IT Glue."),
});
const metaSchema = s.looseObject("The JSON:API meta object returned by IT Glue.");
const linksSchema = s.looseObject("The JSON:API links object returned by IT Glue.");
const rawEnvelopeSchema = s.looseObject("The raw JSON:API response envelope returned by IT Glue.");

const paginationFields = {
  pageNumber: pageNumberSchema,
  pageSize: pageSizeSchema,
};

const organizationSortSchema = s.stringEnum("The organization sort field.", [
  "name",
  "-name",
  "id",
  "-id",
  "updated_at",
  "-updated_at",
  "organization_status_name",
  "-organization_status_name",
  "organization_type_name",
  "-organization_type_name",
  "created_at",
  "-created_at",
  "short_name",
  "-short_name",
  "my_glue_account_id",
  "-my_glue_account_id",
]);

const userSortSchema = s.stringEnum("The user sort field.", [
  "name",
  "-name",
  "email",
  "-email",
  "reputation",
  "-reputation",
  "id",
  "-id",
  "created_at",
  "-created_at",
  "updated_at",
  "-updated_at",
]);

const configurationSortSchema = s.stringEnum("The configuration sort field.", [
  "name",
  "-name",
  "id",
  "-id",
  "created_at",
  "-created_at",
  "updated_at",
  "-updated_at",
]);

const contactSortSchema = s.stringEnum("The contact sort field.", [
  "first_name",
  "-first_name",
  "last_name",
  "-last_name",
  "id",
  "-id",
  "created_at",
  "-created_at",
  "updated_at",
  "-updated_at",
]);

const organizationIncludeSchema = s.array(
  "Safe organization relationships to include. Attachment payloads are intentionally not exposed in this first pass.",
  s.stringEnum("A supported organization include value.", ["adapters_resources", "rmm_companies"]),
  { minItems: 1 },
);

const configurationIncludeSchema = s.array(
  "Safe configuration relationships to include. Passwords, attachments, and tickets are intentionally not exposed in this first pass.",
  s.stringEnum("A supported configuration include value.", [
    "adapters_resources",
    "configuration_interfaces",
    "rmm_records",
    "dnet_fa_remote_assets",
    "user_resource_accesses",
    "group_resource_accesses",
  ]),
  { minItems: 1 },
);

const contactIncludeSchema = s.array(
  "Safe contact relationships to include. Passwords, attachments, and tickets are intentionally not exposed in this first pass.",
  s.stringEnum("A supported contact include value.", [
    "location",
    "distinct_remote_contacts",
    "resource_fields",
    "user_resource_accesses",
    "group_resource_accesses",
  ]),
  { minItems: 1 },
);

const listOrganizationsInputSchema = s.object(
  "Query parameters for listing IT Glue organizations.",
  {
    ...paginationFields,
    sort: organizationSortSchema,
    include: organizationIncludeSchema,
    name: s.string("Filter organizations by name.", { minLength: 1 }),
    organizationTypeId: organizationTypeIdSchema,
    organizationStatusId: organizationStatusIdSchema,
    primary: s.boolean("Filter organizations by primary status."),
    createdAtRange: dateRangeSchema,
    updatedAtRange: dateRangeSchema,
  },
  {
    optional: [
      "pageNumber",
      "pageSize",
      "sort",
      "include",
      "name",
      "organizationTypeId",
      "organizationStatusId",
      "primary",
      "createdAtRange",
      "updatedAtRange",
    ],
  },
);

const getOrganizationInputSchema = s.object(
  "Input parameters for retrieving one IT Glue organization.",
  {
    id: idSchema,
    include: organizationIncludeSchema,
  },
  { optional: ["include"] },
);

const listUsersInputSchema = s.object(
  "Query parameters for listing IT Glue users.",
  {
    ...paginationFields,
    sort: userSortSchema,
    name: s.string("Filter users by name.", { minLength: 1 }),
    email: s.string("Filter users by email.", { minLength: 1 }),
    roleName: s.string("Filter users by role name.", { minLength: 1 }),
  },
  { optional: ["pageNumber", "pageSize", "sort", "name", "email", "roleName"] },
);

const getUserInputSchema = s.object("Input parameters for retrieving one IT Glue user.", {
  id: idSchema,
});

const listConfigurationsInputSchema = s.object(
  "Query parameters for listing IT Glue configurations.",
  {
    ...paginationFields,
    organizationId: organizationIdSchema,
    sort: configurationSortSchema,
    include: configurationIncludeSchema,
    name: s.string("Filter configurations by name.", { minLength: 1 }),
    serialNumber: s.string("Filter configurations by serial number.", { minLength: 1 }),
    assetTag: s.string("Filter configurations by asset tag.", { minLength: 1 }),
    configurationTypeId: configurationTypeIdSchema,
    configurationStatusId: configurationStatusIdSchema,
    archived: s.boolean("Filter configurations by archived status."),
  },
  {
    optional: [
      "pageNumber",
      "pageSize",
      "organizationId",
      "sort",
      "include",
      "name",
      "serialNumber",
      "assetTag",
      "configurationTypeId",
      "configurationStatusId",
      "archived",
    ],
  },
);

const getConfigurationInputSchema = s.object(
  "Input parameters for retrieving one IT Glue configuration.",
  {
    id: idSchema,
    organizationId: organizationIdSchema,
    include: configurationIncludeSchema,
  },
  { optional: ["organizationId", "include"] },
);

const listContactsInputSchema = s.object(
  "Query parameters for listing IT Glue contacts.",
  {
    ...paginationFields,
    organizationId: organizationIdSchema,
    sort: contactSortSchema,
    include: contactIncludeSchema,
    firstName: s.string("Filter contacts by first name.", { minLength: 1 }),
    lastName: s.string("Filter contacts by last name.", { minLength: 1 }),
    title: s.string("Filter contacts by title.", { minLength: 1 }),
    contactTypeId: contactTypeIdSchema,
    important: s.boolean("Filter contacts by important status."),
    primaryEmail: s.string("Filter contacts by primary email.", { minLength: 1 }),
  },
  {
    optional: [
      "pageNumber",
      "pageSize",
      "organizationId",
      "sort",
      "include",
      "firstName",
      "lastName",
      "title",
      "contactTypeId",
      "important",
      "primaryEmail",
    ],
  },
);

const getContactInputSchema = s.object(
  "Input parameters for retrieving one IT Glue contact.",
  {
    id: idSchema,
    organizationId: organizationIdSchema,
    include: contactIncludeSchema,
  },
  { optional: ["organizationId", "include"] },
);

function listOutputSchema(description: string, key: string): JsonSchema {
  return s.object(description, {
    [key]: s.array(`The IT Glue ${key} returned by the API.`, jsonApiResourceSchema),
    meta: metaSchema,
    links: linksSchema,
    raw: rawEnvelopeSchema,
  });
}

function itemOutputSchema(description: string, key: string): JsonSchema {
  return s.object(description, {
    [key]: jsonApiResourceSchema,
    meta: metaSchema,
    links: linksSchema,
    raw: rawEnvelopeSchema,
  });
}

export const itGlueActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizations",
    description: "List organizations in an IT Glue account with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: listOrganizationsInputSchema,
    outputSchema: listOutputSchema("Output payload for IT Glue organizations.", "organizations"),
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Retrieve one IT Glue organization by ID.",
    requiredScopes: [],
    inputSchema: getOrganizationInputSchema,
    outputSchema: itemOutputSchema("Output payload for one IT Glue organization.", "organization"),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List users in an IT Glue account with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: listUsersInputSchema,
    outputSchema: listOutputSchema("Output payload for IT Glue users.", "users"),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Retrieve one IT Glue user by ID.",
    requiredScopes: [],
    inputSchema: getUserInputSchema,
    outputSchema: itemOutputSchema("Output payload for one IT Glue user.", "user"),
  }),
  defineProviderAction(service, {
    name: "list_configurations",
    description: "List IT Glue configurations, optionally scoped to one organization, with filters and pagination.",
    requiredScopes: [],
    inputSchema: listConfigurationsInputSchema,
    outputSchema: listOutputSchema("Output payload for IT Glue configurations.", "configurations"),
  }),
  defineProviderAction(service, {
    name: "get_configuration",
    description: "Retrieve one IT Glue configuration by ID, optionally scoped to one organization.",
    requiredScopes: [],
    inputSchema: getConfigurationInputSchema,
    outputSchema: itemOutputSchema("Output payload for one IT Glue configuration.", "configuration"),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List IT Glue contacts, optionally scoped to one organization, with filters and pagination.",
    requiredScopes: [],
    inputSchema: listContactsInputSchema,
    outputSchema: listOutputSchema("Output payload for IT Glue contacts.", "contacts"),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Retrieve one IT Glue contact by ID, optionally scoped to one organization.",
    requiredScopes: [],
    inputSchema: getContactInputSchema,
    outputSchema: itemOutputSchema("Output payload for one IT Glue contact.", "contact"),
  }),
];
