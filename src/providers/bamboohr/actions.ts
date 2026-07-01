import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bamboohr";

const fieldsSchema = s.array(
  "BambooHR field aliases to request, such as firstName, lastName, jobTitle, or department.",
  s.nonEmptyString("A BambooHR employee field alias."),
  { minItems: 1, maxItems: 400 },
);
const employeeSchema = s.looseObject("A BambooHR employee record.", {
  id: s.string("BambooHR employee ID."),
  employeeId: s.string("BambooHR employee ID returned by list endpoints."),
  firstName: s.string("Employee first name."),
  lastName: s.string("Employee last name."),
  displayName: s.string("Employee display name."),
  jobTitle: s.string("Employee job title."),
  department: s.string("Employee department."),
  location: s.string("Employee location."),
  workEmail: s.string("Employee work email address."),
  status: s.string("Employee status."),
  _restrictedFields: s.stringArray("Fields BambooHR suppressed because the authenticated user cannot view them."),
});
const paginationSchema = s.looseObject("BambooHR pagination metadata.", {
  total: s.integer("Total number of employees matching the request."),
  page: s.looseObject("BambooHR cursor pagination state.", {
    nextCursor: s.nullable(s.string("Cursor for the next page of results.")),
    prevCursor: s.nullable(s.string("Cursor for the previous page of results.")),
  }),
});
const linkSchema = s.looseObject("BambooHR pagination links.", {
  self: s.string("URL for the current page."),
  next: s.nullable(s.string("URL for the next page, if present.")),
  prev: s.nullable(s.string("URL for the previous page, if present.")),
});
const fieldSchema = s.looseObject("A BambooHR employee field definition.", {
  id: s.anyOf("BambooHR field identifier.", [
    s.string("BambooHR field identifier as a string."),
    s.integer("BambooHR field identifier as a number."),
  ]),
  name: s.string("BambooHR field display name."),
  alias: s.string("BambooHR API field alias."),
  type: s.string("BambooHR field data type."),
  deprecated: s.string("Whether this BambooHR field is deprecated."),
});
const companySchema = s.looseObject("BambooHR company profile information.", {
  legalName: s.string("Company legal name."),
  displayName: s.string("Company display name."),
  address: s.looseObject("Company primary address.", {
    line1: s.string("Company primary address line 1."),
    line2: s.string("Company primary address line 2."),
    city: s.string("Company city."),
    state: s.string("Company state or province."),
    zip: s.string("Company ZIP or postal code."),
  }),
  phone: s.string("Company contact phone number."),
});

export const bamboohrActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_company_information",
    description: "Retrieve basic BambooHR company profile information for the connected tenant.",
    requiredScopes: [],
    inputSchema: s.object("No input is required for this BambooHR action.", {}),
    outputSchema: s.object("BambooHR company information output.", {
      company: companySchema,
      raw: s.unknown("Raw BambooHR company information response."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_fields",
    description: "List BambooHR employee fields available to the connected account.",
    requiredScopes: [],
    inputSchema: s.object("No input is required for this BambooHR action.", {}),
    outputSchema: s.object("BambooHR field list output.", {
      fields: s.array("BambooHR field definitions.", fieldSchema),
      raw: s.unknown("Raw BambooHR field list response."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_employees",
    description: "List BambooHR employees with optional additional field aliases and cursor paging.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing BambooHR employees.",
      {
        fields: fieldsSchema,
        limit: s.positiveInteger("Maximum number of employees to return in one page.", { maximum: 2500 }),
        after: s.nonEmptyString("Cursor for the next page of employees."),
        before: s.nonEmptyString("Cursor for the previous page of employees."),
      },
      { optional: ["fields", "limit", "after", "before"] },
    ),
    outputSchema: s.object("BambooHR employee list output.", {
      employees: s.array("BambooHR employees returned for the requested page.", employeeSchema),
      meta: paginationSchema,
      links: linkSchema,
      raw: s.unknown("Raw BambooHR employee list response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_employee",
    description: "Retrieve one BambooHR employee by ID with optional field aliases.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for retrieving one BambooHR employee.",
      {
        employeeId: s.nonEmptyString("The BambooHR employee ID to retrieve."),
        fields: fieldsSchema,
        onlyCurrent: s.boolean("Whether to return only currently effective values for historical fields."),
      },
      { optional: ["fields", "onlyCurrent"] },
    ),
    outputSchema: s.object("BambooHR employee output.", {
      employee: employeeSchema,
      raw: s.unknown("Raw BambooHR employee response."),
    }),
  }),
];

export type BamboohrActionName = (typeof bamboohrActions)[number]["name"];
