import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "serveravatar";

const organizationIdSchema = s.positiveInteger("The ServerAvatar organization ID.");
const pageSchema = s.positiveInteger("The one-based result page to return.");

const organizationSchema = s.looseRequiredObject("A ServerAvatar organization.", {
  id: s.positiveInteger("The organization ID."),
  name: s.string("The organization name."),
  description: s.nullable(s.string("The organization description when configured.")),
  logo: s.nullable(s.string("The organization logo URL when configured.")),
  created_at: s.string("The timestamp when the organization was created."),
  updated_at: s.string("The timestamp when the organization was last updated."),
});

const serverSchema = s.looseRequiredObject("A server managed by ServerAvatar.", {
  id: s.positiveInteger("The server ID."),
  organization_id: s.positiveInteger("The organization that owns the server."),
  name: s.string("The server name."),
  hostname: s.string("The server hostname."),
  ip: s.string("The server IP address."),
  provider_name: s.string("The connected infrastructure provider name."),
  operating_system: s.string("The server operating system."),
  health_status: s.string("The current ServerAvatar health status."),
});

const applicationSchema = s.looseRequiredObject("An application managed by ServerAvatar.", {
  id: s.positiveInteger("The application ID."),
  server_id: s.positiveInteger("The server that hosts the application."),
  name: s.string("The application name."),
  primary_domain: s.string("The application's primary domain."),
  framework: s.string("The application framework."),
  active: s.anyOf("Whether the application is active as returned by ServerAvatar.", [
    s.boolean("The application active flag as a boolean."),
    s.integer("The application active flag as an integer."),
  ]),
});

const databaseSchema = s.looseRequiredObject("A database managed by ServerAvatar.", {
  id: s.positiveInteger("The database ID."),
  server_id: s.positiveInteger("The server that hosts the database."),
  name: s.string("The database name."),
  database_type: s.string("The database engine type."),
  server_name: s.string("The name of the hosting server."),
  remoteAccess: s.boolean("Whether remote database access is enabled."),
});

const paginationFields = {
  current_page: s.positiveInteger("The current result page."),
  first_page_url: s.string("The URL of the first result page."),
  from: s.nullable(s.nonNegativeInteger("The index of the first record on this page.")),
  last_page: s.positiveInteger("The final result page."),
  last_page_url: s.string("The URL of the final result page."),
  links: s.array("The pagination links returned by ServerAvatar.", s.looseObject("One ServerAvatar pagination link.")),
  next_page_url: s.nullable(s.string("The next page URL when another page exists.")),
  path: s.string("The API path represented by this paginated response."),
  per_page: s.positiveInteger("The maximum number of records in one page."),
  prev_page_url: s.nullable(s.string("The previous page URL when one exists.")),
  to: s.nullable(s.nonNegativeInteger("The index of the final record on this page.")),
  total: s.nonNegativeInteger("The total number of matching records."),
};

const paginationOptionalKeys = [
  "current_page",
  "first_page_url",
  "from",
  "last_page",
  "last_page_url",
  "links",
  "next_page_url",
  "path",
  "per_page",
  "prev_page_url",
  "to",
  "total",
];

function paginatedResourceSchema(description: string, itemDescription: string, itemSchema: JsonSchema) {
  return s.looseRequiredObject(
    description,
    {
      data: s.array(itemDescription, itemSchema),
      ...paginationFields,
    },
    { optional: paginationOptionalKeys },
  );
}

const listOrganizationsAction = defineProviderAction(service, {
  name: "list_organizations",
  operationType: "read",
  description: "List the organizations available to the connected ServerAvatar API token.",
  inputSchema: s.object("No input is required to list ServerAvatar organizations.", {}),
  outputSchema: s.requiredObject("The ServerAvatar organization list.", {
    organizations: s.array("The organizations available to the API token.", organizationSchema),
  }),
});

const getOrganizationAction = defineProviderAction(service, {
  name: "get_organization",
  operationType: "read",
  description: "Get one ServerAvatar organization by its ID.",
  inputSchema: s.requiredObject("Input parameters for getting a ServerAvatar organization.", {
    organizationId: organizationIdSchema,
  }),
  outputSchema: s.requiredObject("The ServerAvatar organization response.", {
    organization: organizationSchema,
  }),
});

const listServersAction = defineProviderAction(service, {
  name: "list_servers",
  operationType: "read",
  description: "List the servers managed in a ServerAvatar organization.",
  inputSchema: s.object(
    "Input parameters for listing servers in a ServerAvatar organization.",
    {
      organizationId: organizationIdSchema,
      page: pageSchema,
    },
    { optional: ["page"] },
  ),
  outputSchema: s.requiredObject("The paginated ServerAvatar server response.", {
    servers: paginatedResourceSchema(
      "ServerAvatar servers and pagination metadata.",
      "The servers returned for this page.",
      serverSchema,
    ),
  }),
});

const listApplicationsAction = defineProviderAction(service, {
  name: "list_applications",
  operationType: "read",
  description: "List applications across a ServerAvatar organization.",
  inputSchema: s.object(
    "Input parameters for listing applications in a ServerAvatar organization.",
    {
      organizationId: organizationIdSchema,
      page: pageSchema,
    },
    { optional: ["page"] },
  ),
  outputSchema: s.requiredObject("The paginated ServerAvatar application response.", {
    applications: paginatedResourceSchema(
      "ServerAvatar applications and pagination metadata.",
      "The applications returned for this page.",
      applicationSchema,
    ),
  }),
});

const listDatabasesAction = defineProviderAction(service, {
  name: "list_databases",
  operationType: "read",
  description: "List or search databases across a ServerAvatar organization.",
  inputSchema: s.object(
    "Input parameters for listing databases in a ServerAvatar organization.",
    {
      organizationId: organizationIdSchema,
      page: pageSchema,
      search: s.nonEmptyString("A database-name search filter."),
    },
    { optional: ["page", "search"] },
  ),
  outputSchema: s.requiredObject("The paginated ServerAvatar database response.", {
    databases: paginatedResourceSchema(
      "ServerAvatar databases and pagination metadata.",
      "The databases returned for this page.",
      databaseSchema,
    ),
  }),
});

export const serverAvatarActions: ActionDefinition[] = [
  listOrganizationsAction,
  getOrganizationAction,
  listServersAction,
  listApplicationsAction,
  listDatabasesAction,
];
