import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "7_shifts" as const;

const dateSchema = s.string("A date in YYYY-MM-DD format.", {
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});
const apiVersionSchema = s.string("The 7shifts API version to send as x-api-version.", {
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});
const companyGuidSchema = s.uuid("The 7shifts company GUID to send as x-company-guid.");
const companyIdSchema = s.integer("The 7shifts company ID.");
const cursorInputSchema = s.string("The cursor for the next or previous page of results.", {
  minLength: 1,
});
const limitInputSchema = s.integer("The number of results desired per page.", { minimum: 1 });
const locationIdSchema = s.integer("The 7shifts location ID.");
const departmentIdSchema = s.integer("The 7shifts department ID.");
const roleIdSchema = s.integer("The 7shifts role ID.");

const commonInputFields = {
  apiVersion: apiVersionSchema,
  companyGuid: companyGuidSchema,
};

const cursorSchema = s.object("The cursor metadata returned by 7shifts.", {
  current: s.nullable(s.string("The current cursor.")),
  prev: s.nullable(s.string("A cursor for navigating to the previous page.")),
  next: s.nullable(s.string("A cursor for navigating to the next page.")),
  count: s.nullable(s.integer("The total items in the current cursor.")),
});

const identityUserSchema = s.object("A normalized 7shifts user identity.", {
  id: s.integer("The 7shifts user ID."),
  identityId: s.nullable(s.integer("The 7shifts identity ID for the user.")),
  companyId: s.integer("The 7shifts company ID associated with the user."),
  firstName: s.nullable(s.string("The user's first name.")),
  lastName: s.nullable(s.string("The user's last name.")),
  email: s.nullable(s.string("The user's email address.")),
  active: s.nullable(s.boolean("Whether the user is active.")),
  raw: s.looseObject("The raw user object returned by 7shifts."),
});

const identitySchema = s.object("A normalized 7shifts identity response.", {
  identityId: s.integer("The authenticated 7shifts identity ID."),
  users: s.array("The 7shifts users associated with the identity.", identityUserSchema),
  raw: s.looseObject("The raw identity object returned by 7shifts."),
});

const companySchema = s.object("A normalized 7shifts company.", {
  id: s.integer("The 7shifts company ID."),
  name: s.string("The company name."),
  status: s.nullable(s.string("The company status returned by 7shifts.")),
  raw: s.looseObject("The raw company object returned by 7shifts."),
});

const locationSchema = s.object("A normalized 7shifts location.", {
  id: s.integer("The 7shifts location ID."),
  name: s.string("The location name."),
  raw: s.looseObject("The raw location object returned by 7shifts."),
});

const departmentSchema = s.object("A normalized 7shifts department.", {
  id: s.integer("The 7shifts department ID."),
  name: s.string("The department name."),
  raw: s.looseObject("The raw department object returned by 7shifts."),
});

const roleSchema = s.object("A normalized 7shifts role.", {
  id: s.integer("The 7shifts role ID."),
  name: s.string("The role name."),
  raw: s.looseObject("The raw role object returned by 7shifts."),
});

const userSchema = s.object("A normalized 7shifts user.", {
  id: s.integer("The 7shifts user ID."),
  firstName: s.nullable(s.string("The user's first name.")),
  lastName: s.nullable(s.string("The user's last name.")),
  email: s.nullable(s.string("The user's email address.")),
  active: s.nullable(s.boolean("Whether the user is active.")),
  raw: s.looseObject("The raw user object returned by 7shifts."),
});

const retrieveIdentityAction = defineProviderAction(service, {
  name: "retrieve_identity",
  description: "Retrieve the 7shifts identity associated with the access token.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving a 7shifts identity.", commonInputFields, {
    optional: ["apiVersion", "companyGuid"],
  }),
  outputSchema: s.object("The response returned when retrieving a 7shifts identity.", {
    identity: identitySchema,
  }),
});

const listCompaniesAction = defineProviderAction(service, {
  name: "list_companies",
  description: "List 7shifts companies available to the access token.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing 7shifts companies.",
    {
      ...commonInputFields,
      modified_since: dateSchema,
    },
    { optional: ["apiVersion", "companyGuid", "modified_since"] },
  ),
  outputSchema: s.object("The response returned when listing 7shifts companies.", {
    companies: s.array("The companies returned by 7shifts.", companySchema),
  }),
});

const getCompanyAction = defineProviderAction(service, {
  name: "get_company",
  description: "Retrieve one 7shifts company by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for retrieving a 7shifts company.",
    {
      ...commonInputFields,
      id: companyIdSchema,
    },
    { optional: ["apiVersion", "companyGuid"] },
  ),
  outputSchema: s.object("The response returned when retrieving a 7shifts company.", {
    company: companySchema,
  }),
});

const listLocationsAction = defineProviderAction(service, {
  name: "list_locations",
  description: "List 7shifts locations for a company.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing 7shifts locations.",
    {
      ...commonInputFields,
      company_id: companyIdSchema,
      modified_since: dateSchema,
      deleted: s.boolean("Whether to include deleted locations."),
      cursor: cursorInputSchema,
      limit: limitInputSchema,
    },
    { optional: ["apiVersion", "companyGuid", "modified_since", "deleted", "cursor", "limit"] },
  ),
  outputSchema: s.object("The response returned when listing 7shifts locations.", {
    locations: s.array("The locations returned by 7shifts.", locationSchema),
    cursor: s.nullable(cursorSchema),
  }),
});

const listDepartmentsAction = defineProviderAction(service, {
  name: "list_departments",
  description: "List 7shifts departments for a company.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing 7shifts departments.",
    {
      ...commonInputFields,
      company_id: companyIdSchema,
      modified_since: dateSchema,
      location_id: locationIdSchema,
      cursor: cursorInputSchema,
      limit: limitInputSchema,
    },
    {
      optional: ["apiVersion", "companyGuid", "modified_since", "location_id", "cursor", "limit"],
    },
  ),
  outputSchema: s.object("The response returned when listing 7shifts departments.", {
    departments: s.array("The departments returned by 7shifts.", departmentSchema),
    cursor: s.nullable(cursorSchema),
  }),
});

const listRolesAction = defineProviderAction(service, {
  name: "list_roles",
  description: "List 7shifts roles for a company.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing 7shifts roles.",
    {
      ...commonInputFields,
      company_id: companyIdSchema,
      location_id: locationIdSchema,
      department_id: departmentIdSchema,
      ids: s.array("The role IDs to include.", roleIdSchema, { minItems: 1 }),
      modified_since: dateSchema,
      cursor: cursorInputSchema,
      limit: limitInputSchema,
    },
    {
      optional: [
        "apiVersion",
        "companyGuid",
        "location_id",
        "department_id",
        "ids",
        "modified_since",
        "cursor",
        "limit",
      ],
    },
  ),
  outputSchema: s.object("The response returned when listing 7shifts roles.", {
    roles: s.array("The roles returned by 7shifts.", roleSchema),
    cursor: s.nullable(cursorSchema),
  }),
});

const listUsersAction = defineProviderAction(service, {
  name: "list_users",
  description: "List 7shifts users for a company.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing 7shifts users.",
    {
      ...commonInputFields,
      company_id: companyIdSchema,
      modified_since: dateSchema,
      location_id: locationIdSchema,
      department_id: departmentIdSchema,
      role_id: roleIdSchema,
      status: s.stringEnum("The user status to filter by.", ["active", "inactive"]),
      name: s.string("A partial or full employee name to filter by.", { minLength: 1 }),
      sort_by: s.string("The user sort expression, such as firstname.asc,lastname.desc.", {
        minLength: 1,
      }),
      cursor: cursorInputSchema,
      limit: s.integer("The number of results desired per page.", { minimum: 1, maximum: 500 }),
    },
    {
      optional: [
        "apiVersion",
        "companyGuid",
        "modified_since",
        "location_id",
        "department_id",
        "role_id",
        "status",
        "name",
        "sort_by",
        "cursor",
        "limit",
      ],
    },
  ),
  outputSchema: s.object("The response returned when listing 7shifts users.", {
    users: s.array("The users returned by 7shifts.", userSchema),
    cursor: s.nullable(cursorSchema),
  }),
});

export const sevenShiftsActions: ProviderActionDefinition[] = [
  retrieveIdentityAction,
  listCompaniesAction,
  getCompanyAction,
  listLocationsAction,
  listDepartmentsAction,
  listRolesAction,
  listUsersAction,
];
