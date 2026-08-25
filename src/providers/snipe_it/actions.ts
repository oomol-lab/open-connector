import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "snipe_it" as const;

const emptyInputSchema = s.object("No input parameters are required.", {});
const looseRowSchema = s.looseObject("One object returned by the Snipe-IT API.");

const paginationFields = {
  limit: s.integer("Number of records to return.", { minimum: 1 }),
  offset: s.integer("Offset to use when retrieving results.", { minimum: 0 }),
  search: s.string("Search string.", { minLength: 1 }),
  sort: s.string("Field to order by.", { minLength: 1 }),
  order: s.stringEnum("Sort order.", ["asc", "desc"]),
};

const listResultSchema = (description: string, key: string) =>
  s.object(description, {
    total: s.integer("Total number of matching records returned by Snipe-IT."),
    [key]: s.array("Rows returned by Snipe-IT.", looseRowSchema),
  });

const filterSchema = s.record(
  "Key-value filters to send as Snipe-IT's JSON filter query parameter.",
  s.unknown("A filter value accepted by Snipe-IT."),
);

const listHardwareInputSchema = s.object(
  "Query parameters for listing Snipe-IT hardware assets.",
  {
    ...paginationFields,
    orderNumber: s.string("Return only assets associated with a specific order number.", {
      minLength: 1,
    }),
    modelId: s.integer("Restrict asset results to this asset model ID."),
    categoryId: s.integer("Restrict asset results to this category ID."),
    manufacturerId: s.integer("Restrict asset results to this manufacturer ID."),
    companyId: s.integer("Restrict asset results to this company ID."),
    locationId: s.integer("Restrict asset results to this location ID."),
    status: s.string("Restrict asset results to a documented Snipe-IT status value.", {
      minLength: 1,
    }),
    statusId: s.integer("Restrict asset results to this status label ID."),
    assignedTo: s.integer("Restrict asset results to this assigned user or item ID."),
    assignedType: s.stringEnum("Restrict asset results by assigned item type.", [
      "App\\Models\\Asset",
      "App\\Models\\Accessory",
      "App\\Models\\User",
    ]),
    filter: filterSchema,
  },
  {
    optional: [
      "limit",
      "offset",
      "search",
      "sort",
      "order",
      "orderNumber",
      "modelId",
      "categoryId",
      "manufacturerId",
      "companyId",
      "locationId",
      "status",
      "statusId",
      "assignedTo",
      "assignedType",
      "filter",
    ],
  },
);

const listUsersInputSchema = s.object(
  "Query parameters for listing Snipe-IT users.",
  {
    ...paginationFields,
    firstName: s.string("Filter by first name.", { minLength: 1 }),
    lastName: s.string("Filter by last name.", { minLength: 1 }),
    username: s.string("Filter by username.", { minLength: 1 }),
    email: s.string("Filter by email address or email search text.", { minLength: 1 }),
    employeeNum: s.string("Filter by employee number.", { minLength: 1 }),
    state: s.string("Filter by state.", { minLength: 1 }),
    zip: s.string("Filter by zip or postal code.", { minLength: 1 }),
    country: s.string("Filter by country.", { minLength: 1 }),
    groupId: s.integer("Filter by group ID."),
    departmentId: s.integer("Filter by department ID."),
    companyId: s.integer("Filter by company ID."),
    locationId: s.integer("Filter by location ID."),
    deleted: s.boolean("Return only deleted users."),
    all: s.boolean("Return both deleted and active users."),
    ldapImport: s.boolean("Filter by whether the user was imported or synced with LDAP."),
    assetsCount: s.integer("Filter by number of checked out assets."),
    licensesCount: s.integer("Filter by number of checked out licenses."),
    accessoriesCount: s.integer("Filter by number of checked out accessories."),
    consumablesCount: s.integer("Filter by number of checked out consumables."),
    remote: s.boolean("Filter by whether the user is marked as remote."),
    vip: s.boolean("Filter by whether the user is marked as VIP."),
    startDate: s.date("Filter by start date."),
    endDate: s.date("Filter by end date."),
    filter: filterSchema,
  },
  {
    optional: [
      "limit",
      "offset",
      "search",
      "sort",
      "order",
      "firstName",
      "lastName",
      "username",
      "email",
      "employeeNum",
      "state",
      "zip",
      "country",
      "groupId",
      "departmentId",
      "companyId",
      "locationId",
      "deleted",
      "all",
      "ldapImport",
      "assetsCount",
      "licensesCount",
      "accessoriesCount",
      "consumablesCount",
      "remote",
      "vip",
      "startDate",
      "endDate",
      "filter",
    ],
  },
);

const listCompaniesInputSchema = s.object(
  "Query parameters for listing Snipe-IT companies.",
  {
    name: s.string("Company name to filter by.", { minLength: 1 }),
  },
  { optional: ["name"] },
);

const listCategoriesInputSchema = s.object(
  "Query parameters for listing Snipe-IT categories.",
  {
    ...paginationFields,
    name: s.string("Category name to filter by.", { minLength: 1 }),
    categoryId: s.integer("ID number of the category to filter by."),
    categoryType: s.stringEnum("Type of category to filter by.", [
      "asset",
      "accessory",
      "consumable",
      "component",
      "license",
    ]),
    useDefaultEula: s.boolean("Filter by whether the category uses the default EULA."),
    requireAcceptance: s.boolean("Filter by whether the category requires acceptance."),
    checkinEmail: s.boolean("Filter by whether the category sends check-in email."),
  },
  {
    optional: [
      "limit",
      "offset",
      "search",
      "sort",
      "order",
      "name",
      "categoryId",
      "categoryType",
      "useDefaultEula",
      "requireAcceptance",
      "checkinEmail",
    ],
  },
);

const listStatusLabelsInputSchema = s.object(
  "Query parameters for listing Snipe-IT status labels.",
  {
    ...paginationFields,
    name: s.string("Status label name to filter by.", { minLength: 1 }),
    statusType: s.stringEnum("Status label type to filter by.", ["deployable", "undeployable", "pending", "archived"]),
  },
  { optional: ["limit", "offset", "search", "sort", "order", "name", "statusType"] },
);

const currentUserOutputSchema = s.object("The current Snipe-IT API user.", {
  user: looseRowSchema,
});

export const snipeItActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get details for the Snipe-IT user associated with the API key.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: currentUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_hardware",
    description: "List Snipe-IT hardware assets with optional search and filters.",
    requiredScopes: [],
    inputSchema: listHardwareInputSchema,
    outputSchema: listResultSchema("A page of Snipe-IT hardware assets.", "hardware"),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Snipe-IT users with optional search and filters.",
    requiredScopes: [],
    inputSchema: listUsersInputSchema,
    outputSchema: listResultSchema("A page of Snipe-IT users.", "users"),
  }),
  defineProviderAction(service, {
    name: "list_companies",
    description: "List Snipe-IT companies.",
    requiredScopes: [],
    inputSchema: listCompaniesInputSchema,
    outputSchema: listResultSchema("A page of Snipe-IT companies.", "companies"),
  }),
  defineProviderAction(service, {
    name: "list_categories",
    description: "List Snipe-IT categories with optional search and filters.",
    requiredScopes: [],
    inputSchema: listCategoriesInputSchema,
    outputSchema: listResultSchema("A page of Snipe-IT categories.", "categories"),
  }),
  defineProviderAction(service, {
    name: "list_status_labels",
    description: "List Snipe-IT status labels with optional search and filters.",
    requiredScopes: [],
    inputSchema: listStatusLabelsInputSchema,
    outputSchema: listResultSchema("A page of Snipe-IT status labels.", "statusLabels"),
  }),
];

export const snipeItActionByName: ReadonlyMap<string, ActionDefinition> = new Map(
  snipeItActions.map((action) => [action.name, action]),
);
