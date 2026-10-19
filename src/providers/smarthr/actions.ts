import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { smarthrSupplementalActions } from "./supplemental-actions.ts";

export const smarthrActions: ActionDefinition[] = [
  ...smarthrSupplementalActions,
  defineProviderAction("smarthr", {
    name: "list_employees",

    description: "List SmartHR employees with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing employees.",
      {
        page: s.integer("Page number, starting at 1. Defaults to 1.", { minimum: 1 }),
        perPage: s.integer("Results per page, from 1 to 100. Defaults to 10.", {
          minimum: 1,
          maximum: 100,
        }),
        employeeCode: s.string("Filter by employee number."),
        employmentTypeIds: s.array(
          "Filter by employment type IDs.",
          s.string("One identifier or field name.", { minLength: 1 }),
          { minItems: 1 },
        ),
        employmentStatus: s.stringEnum("Filter by employment status.", ["employed", "absent", "retired"]),
        gender: s.stringEnum("Filter by legal gender.", ["male", "female"]),
        sort: s.string("Sort fields separated by commas; prefix a field with - for descending order."),
        userIds: s.array("Filter by user IDs.", s.string("One identifier or field name.", { minLength: 1 }), {
          minItems: 1,
        }),
        departmentIds: s.array(
          "Filter by department IDs.",
          s.string("One identifier or field name.", { minLength: 1 }),
          { minItems: 1 },
        ),
        positionIds: s.array("Filter by position IDs.", s.string("One identifier or field name.", { minLength: 1 }), {
          minItems: 1,
        }),
        employeeIds: s.array("Filter by employee IDs.", s.string("One identifier or field name.", { minLength: 1 }), {
          minItems: 1,
        }),
        fields: s.array(
          "Employee field names to return. Omit to use the upstream default.",
          s.string("One identifier or field name.", { minLength: 1 }),
          { minItems: 1 },
        ),
        query: s.string("Search names, business names, departments, and positions."),
        preferBusinessName: s.boolean("Prefer business names when searching."),
        enteredAtFrom: s.string("Joined on or after this date.", { format: "date" }),
        enteredAtTo: s.string("Joined on or before this date.", { format: "date" }),
        resignedAtFrom: s.string("Resigned on or after this date.", { format: "date" }),
        resignedAtTo: s.string("Resigned on or before this date.", { format: "date" }),
      },
      { required: [] },
    ),
    outputSchema: s.object(
      "One page of employees.",
      {
        employees: s.array(
          "Returned employees.",
          s.object(
            "Employee data; fields depend on the token permissions and requested fields.",
            {
              id: s.string("Employee ID."),
              emp_code: s.string("Employee number."),
              last_name: s.string("Family name."),
              first_name: s.string("Given name."),
              emp_status: s.string("Employment status."),
            },
            { required: [], additionalProperties: true },
          ),
        ),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["employees", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "list_companies",

    description: "List SmartHR companies with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing companies.",
      {
        page: s.integer("Page number, starting at 1. Defaults to 1.", { minimum: 1 }),
        perPage: s.integer("Results per page, from 1 to 100. Defaults to 10.", {
          minimum: 1,
          maximum: 100,
        }),
        embed: s.stringEnum("Optionally include the company owner.", ["owner"]),
      },
      { required: [] },
    ),
    outputSchema: s.object(
      "One page of companies.",
      {
        companies: s.array(
          "Returned companies.",
          s.object(
            "Company information.",
            { id: s.string("Resource ID."), name: s.string("Resource name.") },
            { required: [], additionalProperties: true },
          ),
        ),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["companies", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "list_departments",

    description: "List SmartHR departments with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing departments.",
      {
        page: s.integer("Page number, starting at 1. Defaults to 1.", { minimum: 1 }),
        perPage: s.integer("Results per page, from 1 to 100. Defaults to 10.", {
          minimum: 1,
          maximum: 100,
        }),
        code: s.string("Filter by department code."),
        sort: s.string("Sort fields separated by commas; prefix a field with - for descending order."),
      },
      { required: [] },
    ),
    outputSchema: s.object(
      "One page of departments.",
      {
        departments: s.array(
          "Returned departments.",
          s.object(
            "Department data, including any nested hierarchy returned by SmartHR.",
            { id: s.string("Resource ID."), name: s.string("Resource name.") },
            { required: [], additionalProperties: true },
          ),
        ),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["departments", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "list_employment_types",
    description: "List SmartHR employment types with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing employment types.",
      {
        page: s.integer("Page number, starting at 1. Defaults to 1.", { minimum: 1 }),
        perPage: s.integer("Results per page, from 1 to 100. Defaults to 10.", {
          minimum: 1,
          maximum: 100,
        }),
      },
      { required: [] },
    ),
    outputSchema: s.object(
      "One page of employment types.",
      {
        employmentTypes: s.array(
          "Returned employment types.",
          s.object(
            "Employment type information.",
            { id: s.string("Resource ID."), name: s.string("Resource name.") },
            { required: [], additionalProperties: true },
          ),
        ),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["employmentTypes", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "list_custom_fields",
    description: "List SmartHR custom employee fields with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing custom employee fields.",
      {
        page: s.integer("Page number, starting at 1. Defaults to 1.", { minimum: 1 }),
        perPage: s.integer("Results per page, from 1 to 100. Defaults to 10.", {
          minimum: 1,
          maximum: 100,
        }),
        embed: s.stringEnum("Include the field group instead of group_id.", ["group"]),
      },
      { required: [] },
    ),
    outputSchema: s.object(
      "One page of custom employee fields.",
      {
        customFields: s.array(
          "Returned custom employee fields.",
          s.object(
            "Custom field definition, including type and dropdown elements when available.",
            { id: s.string("Resource ID."), name: s.string("Resource name.") },
            { required: [], additionalProperties: true },
          ),
        ),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["customFields", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "list_custom_field_groups",
    description: "List SmartHR custom employee field groups with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing custom employee field groups.",
      {
        page: s.integer("Page number, starting at 1. Defaults to 1.", { minimum: 1 }),
        perPage: s.integer("Results per page, from 1 to 100. Defaults to 10.", {
          minimum: 1,
          maximum: 100,
        }),
        embed: s.stringEnum("Include the templates belonging to each group.", ["templates"]),
      },
      { required: [] },
    ),
    outputSchema: s.object(
      "One page of custom employee field groups.",
      {
        customFieldGroups: s.array(
          "Returned custom employee field groups.",
          s.object(
            "Custom field group information.",
            { id: s.string("Resource ID."), name: s.string("Resource name.") },
            { required: [], additionalProperties: true },
          ),
        ),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["customFieldGroups", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "list_business_establishments",

    description: "List SmartHR business establishments with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing business establishments.",
      {
        page: s.integer("Page number, starting at 1. Defaults to 1.", { minimum: 1 }),
        perPage: s.integer("Results per page, from 1 to 100. Defaults to 10.", {
          minimum: 1,
          maximum: 100,
        }),
        embed: s.stringEnum("Related object to include in the response.", [
          "soc_ins_owner",
          "lab_ins_owner",
          "company",
        ]),
      },
      { required: [] },
    ),
    outputSchema: s.object(
      "One page of business establishments.",
      {
        businessEstablishments: s.array(
          "Returned business establishments.",
          s.object(
            "Business establishment information.",
            { id: s.string("Resource ID."), name: s.string("Resource name.") },
            { required: [], additionalProperties: true },
          ),
        ),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["businessEstablishments", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "get_employee",

    description: "Get a SmartHR employee by ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Resource lookup parameters.",
      {
        employeeId: s.string("The employee ID.", { minLength: 1 }),
        fields: s.array(
          "Employee field names to return. Omit to use the upstream default.",
          s.string("One identifier or field name.", { minLength: 1 }),
          { minItems: 1 },
        ),
      },
      { required: ["employeeId"] },
    ),
    outputSchema: s.object(
      "Requested resource.",
      {
        employee: s.object(
          "Employee data; fields depend on the token permissions and requested fields.",
          {
            id: s.string("Employee ID."),
            emp_code: s.string("Employee number."),
            last_name: s.string("Family name."),
            first_name: s.string("Given name."),
            emp_status: s.string("Employment status."),
          },
          { required: [], additionalProperties: true },
        ),
      },
      { required: ["employee"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "get_department",

    description: "Get a SmartHR department by ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Resource lookup parameters.",
      { departmentId: s.string("The department ID.", { minLength: 1 }) },
      { required: ["departmentId"] },
    ),
    outputSchema: s.object(
      "Requested resource.",
      {
        department: s.object(
          "Department data, including any nested hierarchy returned by SmartHR.",
          { id: s.string("Resource ID."), name: s.string("Resource name.") },
          { required: [], additionalProperties: true },
        ),
      },
      { required: ["department"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "get_employment_type",
    description: "Get a SmartHR employment type by ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Resource lookup parameters.",
      { employmentTypeId: s.string("The employment type ID.", { minLength: 1 }) },
      { required: ["employmentTypeId"] },
    ),
    outputSchema: s.object(
      "Requested resource.",
      {
        employmentType: s.object(
          "Employment type information.",
          { id: s.string("Resource ID."), name: s.string("Resource name.") },
          { required: [], additionalProperties: true },
        ),
      },
      { required: ["employmentType"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "create_department",

    description: "Create a SmartHR department.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Department write parameters.",
      {
        name: s.string(
          "Department name; must not contain a slash. Required by the official create and update schemas.",
          { minLength: 1, pattern: "^[^/]+$" },
        ),
        code: s.string("Department code."),
        position: s.integer("Display position; automatically assigned on creation when omitted."),
        companyId: s.string("Company ID."),
        parentId: s.string("Parent department ID."),
      },
      { required: ["name"] },
    ),
    outputSchema: s.object(
      "Department write result.",
      {
        department: s.object(
          "Department data, including any nested hierarchy returned by SmartHR.",
          { id: s.string("Resource ID."), name: s.string("Resource name.") },
          { required: [], additionalProperties: true },
        ),
      },
      { required: ["department"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "update_department",

    description: "Partially update a SmartHR department, preserving unspecified attributes. SmartHR requires name.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Department write parameters.",
      {
        departmentId: s.string("The department ID.", { minLength: 1 }),
        name: s.string(
          "Department name; must not contain a slash. Required by the official create and update schemas.",
          { minLength: 1, pattern: "^[^/]+$" },
        ),
        code: s.string("Department code."),
        position: s.integer("Display position; automatically assigned on creation when omitted."),
        companyId: s.string("Company ID."),
        parentId: s.string("Parent department ID."),
      },
      { required: ["name", "departmentId"] },
    ),
    outputSchema: s.object(
      "Department write result.",
      {
        department: s.object(
          "Department data, including any nested hierarchy returned by SmartHR.",
          { id: s.string("Resource ID."), name: s.string("Resource name.") },
          { required: [], additionalProperties: true },
        ),
      },
      { required: ["department"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "replace_department",

    description: "Replace a SmartHR department. Unspecified attributes are cleared by SmartHR.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Department write parameters.",
      {
        departmentId: s.string("The department ID.", { minLength: 1 }),
        name: s.string(
          "Department name; must not contain a slash. Required by the official create and update schemas.",
          { minLength: 1, pattern: "^[^/]+$" },
        ),
        code: s.string("Department code."),
        position: s.integer("Display position; automatically assigned on creation when omitted."),
        companyId: s.string("Company ID."),
        parentId: s.string("Parent department ID."),
      },
      { required: ["name", "departmentId"] },
    ),
    outputSchema: s.object(
      "Department write result.",
      {
        department: s.object(
          "Department data, including any nested hierarchy returned by SmartHR.",
          { id: s.string("Resource ID."), name: s.string("Resource name.") },
          { required: [], additionalProperties: true },
        ),
      },
      { required: ["department"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "discontinue_department",
    description:
      "Discontinue a SmartHR department on its last active date. The date must be in the past; scheduled employee changes can prevent discontinuation.",
    operationType: "destructive",
    requiredScopes: [],
    inputSchema: s.object(
      "Department discontinuation parameters.",
      {
        departmentId: s.string("The department ID.", { minLength: 1 }),
        discontinuedDate: s.string("Last date the department existed, in YYYY-MM-DD format; must be in the past.", {
          format: "date",
        }),
      },
      { required: ["departmentId", "discontinuedDate"] },
    ),
    outputSchema: s.object(
      "Department discontinuation result.",
      { discontinued: s.boolean("Whether SmartHR accepted the discontinuation.") },
      { required: ["discontinued"] },
    ),
  }),
];
