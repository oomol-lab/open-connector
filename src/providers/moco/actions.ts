import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "moco";

const positiveIdSchema = (description: string): JsonSchema => s.positiveInteger(description);
const nullableStringSchema = (description: string): JsonSchema => s.nullableString(description);
const tagsSchema = s.array("MOCO tags attached to the record.", s.string("One MOCO tag."));
const rawRecordSchema = s.looseObject("The raw MOCO record returned by the API.");
const shortUnitSchema = s.nullable(
  s.object("A compact MOCO unit reference.", {
    id: positiveIdSchema("The MOCO unit identifier."),
    name: s.string("The MOCO unit name."),
  }),
);
const shortCompanySchema = s.nullable(
  s.object("A compact MOCO company reference.", {
    id: positiveIdSchema("The MOCO company identifier."),
    type: nullableStringSchema("The MOCO company type when returned."),
    name: s.string("The MOCO company name."),
  }),
);

const paginationInputFields = {
  page: s.positiveInteger("The MOCO page number to request."),
  perPage: s.integer("The number of MOCO records to request per page.", { minimum: 1, maximum: 100 }),
};

const globalFilterFields = {
  updatedAfter: s.dateTime("Return records updated after this UTC timestamp."),
  sortBy: s.nonEmptyString("The MOCO field name to sort by."),
  sortDirection: s.stringEnum("The MOCO sort direction.", ["asc", "desc"]),
};

const paginationSchema = s.object("Pagination metadata normalized from MOCO response headers.", {
  page: s.nullable(s.integer("The current MOCO response page when returned.")),
  perPage: s.nullable(s.integer("The page size returned by MOCO when returned.")),
  total: s.nullable(s.integer("The total number of matching records when returned.")),
  hasNextPage: s.boolean("Whether the MOCO Link header contains a next page."),
  nextPage: s.nullable(s.integer("The next page number when MOCO returned one.")),
});

const profileSchema = s.object("A normalized MOCO profile.", {
  id: positiveIdSchema("The MOCO profile user identifier."),
  email: nullableStringSchema("The profile email address when returned."),
  fullName: nullableStringSchema("The profile full name when returned."),
  firstName: nullableStringSchema("The profile first name when returned."),
  lastName: nullableStringSchema("The profile last name when returned."),
  active: s.nullable(s.boolean("Whether the profile user is active when returned.")),
  external: s.nullable(s.boolean("Whether the profile user is external when returned.")),
  avatarUrl: nullableStringSchema("The profile avatar URL when returned."),
  unit: shortUnitSchema,
  createdAt: nullableStringSchema("The profile creation timestamp when returned."),
  updatedAt: nullableStringSchema("The profile update timestamp when returned."),
  raw: rawRecordSchema,
});

const companyTypeSchema = s.stringEnum("The MOCO company type.", ["customer", "supplier", "organization"]);

const companySchema = s.object("A normalized MOCO company.", {
  id: positiveIdSchema("The MOCO company identifier."),
  type: nullableStringSchema("The MOCO company type when returned."),
  name: s.string("The MOCO company name."),
  website: nullableStringSchema("The company website when returned."),
  email: nullableStringSchema("The company email address when returned."),
  phone: nullableStringSchema("The company phone number when returned."),
  tags: tagsSchema,
  identifier: nullableStringSchema("The MOCO company identifier string when returned."),
  active: s.nullable(s.boolean("Whether the company is active when returned.")),
  archivedOn: nullableStringSchema("The company archive date when returned."),
  createdAt: nullableStringSchema("The company creation timestamp when returned."),
  updatedAt: nullableStringSchema("The company update timestamp when returned."),
  raw: rawRecordSchema,
});

const contactSchema = s.object("A normalized MOCO contact person.", {
  id: positiveIdSchema("The MOCO contact identifier."),
  gender: nullableStringSchema("The contact gender code when returned."),
  firstName: nullableStringSchema("The contact first name when returned."),
  lastName: nullableStringSchema("The contact last name when returned."),
  fullName: nullableStringSchema("The contact full name assembled from returned name fields."),
  jobPosition: nullableStringSchema("The contact job position when returned."),
  mobilePhone: nullableStringSchema("The contact mobile phone number when returned."),
  workPhone: nullableStringSchema("The contact work phone number when returned."),
  workEmail: nullableStringSchema("The contact work email address when returned."),
  tags: tagsSchema,
  company: shortCompanySchema,
  createdAt: nullableStringSchema("The contact creation timestamp when returned."),
  updatedAt: nullableStringSchema("The contact update timestamp when returned."),
  raw: rawRecordSchema,
});

const companyListInputSchema = s.object("Query parameters for listing MOCO companies.", {
  ...paginationInputFields,
  ...globalFilterFields,
  includeArchived: s.boolean("Whether archived MOCO companies should be included."),
  type: companyTypeSchema,
  tags: s.array("Tags to match as a comma-separated MOCO tags filter.", s.string("One tag."), { minItems: 1 }),
  identifier: s.nonEmptyString("Filter companies by the MOCO identifier string."),
  term: s.nonEmptyString("Search companies by term."),
});

const contactListInputSchema = s.object("Query parameters for listing MOCO contact people.", {
  ...paginationInputFields,
  ...globalFilterFields,
  tags: s.array("Tags to match as a comma-separated MOCO tags filter.", s.string("One tag."), { minItems: 1 }),
  term: s.nonEmptyString("Search contacts by name, email, or company."),
  phone: s.nonEmptyString("Reverse lookup contacts by work or mobile phone number."),
});

export const mocoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_profile",
    operationType: "read",
    description: "Retrieve the current MOCO user's profile.",
    requiredScopes: [],
    inputSchema: s.object("No input is required for retrieving the current MOCO profile.", {}),
    outputSchema: s.object("The normalized MOCO profile response.", {
      profile: profileSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_companies",
    operationType: "read",
    description: "List MOCO companies with official filters and response-header pagination.",
    requiredScopes: [],
    inputSchema: companyListInputSchema,
    outputSchema: s.object("The normalized MOCO company list response.", {
      companies: s.array("Companies returned by MOCO.", companySchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_company",
    operationType: "read",
    description: "Retrieve one MOCO company by ID.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for retrieving a MOCO company.", {
      companyId: positiveIdSchema("The MOCO company identifier."),
    }),
    outputSchema: s.object("The normalized MOCO company response.", {
      company: companySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List MOCO contact people with official filters and response-header pagination.",
    requiredScopes: [],
    inputSchema: contactListInputSchema,
    outputSchema: s.object("The normalized MOCO contact list response.", {
      contacts: s.array("Contacts returned by MOCO.", contactSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Retrieve one MOCO contact person by ID.",
    requiredScopes: [],
    inputSchema: s.object("Path parameters for retrieving a MOCO contact person.", {
      contactId: positiveIdSchema("The MOCO contact identifier."),
    }),
    outputSchema: s.object("The normalized MOCO contact response.", {
      contact: contactSchema,
    }),
  }),
];
