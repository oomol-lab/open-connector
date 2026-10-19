import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { employeeWriteSchema } from "./employee-schema.ts";

const employmentTypeRecordSchema = s.object(
  "SmartHR employment type data; additional upstream fields are preserved.",
  {
    id: s.string("Resource ID."),
    name: s.string("Resource name."),
    code: s.string("Resource code."),
  },
  { required: [], additionalProperties: true },
);
const jobTitleRecordSchema = s.object(
  "SmartHR job title data; additional upstream fields are preserved.",
  {
    id: s.string("Resource ID."),
    name: s.string("Resource name."),
    rank: s.integer("Resource rank."),
    code: s.string("Resource code."),
  },
  { required: [], additionalProperties: true },
);
const gradeRecordSchema = s.object(
  "SmartHR grade data; additional upstream fields are preserved.",
  {
    id: s.string("Resource ID."),
    name: s.string("Resource name."),
    rank: s.integer("Resource rank."),
  },
  { required: [], additionalProperties: true },
);
const jobCategoryRecordSchema = s.object(
  "SmartHR job category data; additional upstream fields are preserved.",
  { id: s.string("Resource ID."), name: s.string("Resource name.") },
  { required: [], additionalProperties: true },
);
const recruitmentTypeRecordSchema = s.object(
  "SmartHR recruitment type data; additional upstream fields are preserved.",
  { id: s.string("Resource ID."), name: s.string("Resource name.") },
  { required: [], additionalProperties: true },
);
const userRecordSchema = s.object(
  "SmartHR user data; additional upstream fields are preserved.",
  {
    id: s.string("Resource ID."),
    email: s.string("Login email address."),
    admin: s.boolean("Whether the user is an administrator eligible to send employee invitations."),
    crew_id: s.string("Linked employee ID when the employee is not embedded."),
    invitation_accepted_at: s.nullable(s.string("Invitation acceptance date returned by SmartHR.")),
  },
  { required: [], additionalProperties: true },
);
const employeeInformationCollectionFormRecordSchema = s.object(
  "SmartHR employee information collection form data; additional upstream fields are preserved.",
  {
    id: s.string("Resource ID."),
    name: s.string("Resource name."),
    mail_format_id: s.string("Invitation email template ID when the template is not embedded."),
    preset_type: s.string("Preset invitation form type."),
  },
  { required: [], additionalProperties: true },
);
const paymentPeriodRecordSchema = s.object(
  "SmartHR payment period data; additional upstream fields are preserved.",
  {
    id: s.string("Resource ID."),
    name: s.string("Resource name."),
    period_type: s.string("Payment period type, such as monthly or hourly."),
  },
  { required: [], additionalProperties: true },
);
const bankAccountSettingRecordSchema = s.object(
  "SmartHR bank account setting data; additional upstream fields are preserved.",
  {
    id: s.string("Resource ID."),
    name: s.string("Resource name."),
    enabled: s.boolean("Whether this bank account setting is enabled."),
    number: s.integer("Display order of the bank account setting."),
  },
  { required: [], additionalProperties: true },
);
const employeeRecordSchema = s.object(
  "SmartHR employee data; additional upstream fields are preserved.",
  {
    id: s.string("Resource ID."),
    emp_code: s.string("Employee number."),
    first_name: s.string("Given name."),
    last_name: s.string("Family name."),
  },
  { required: [], additionalProperties: true },
);

export const smarthrSupplementalActions: ActionDefinition[] = [
  defineProviderAction("smarthr", {
    name: "create_employment_type",
    description:
      "Create a SmartHR employment type. System preset and scheduled-change restrictions are enforced by SmartHR.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the employment type operation.",
      { name: s.string("The employment type name."), code: s.string("The employment type code.") },
      { required: ["name"] },
    ),
    outputSchema: s.object(
      "Updated resource.",
      { employmentType: employmentTypeRecordSchema },
      { required: ["employmentType"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "update_employment_type",
    description:
      "Partially update a SmartHR employment type, preserving unspecified attributes. System preset and scheduled-change restrictions are enforced by SmartHR.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the employment type operation.",
      {
        employmentTypeId: s.string("The employment type ID.", { minLength: 1 }),
        name: s.string("The employment type name."),
        code: s.string("The employment type code."),
      },
      { required: ["employmentTypeId", "name"] },
    ),
    outputSchema: s.object(
      "Updated resource.",
      { employmentType: employmentTypeRecordSchema },
      { required: ["employmentType"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "replace_employment_type",
    description:
      "Update a SmartHR employment type using the full-update endpoint; use partial update to preserve unspecified attributes. System preset and scheduled-change restrictions are enforced by SmartHR.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the employment type operation.",
      {
        employmentTypeId: s.string("The employment type ID.", { minLength: 1 }),
        name: s.string("The employment type name."),
      },
      { required: ["employmentTypeId", "name"] },
    ),
    outputSchema: s.object(
      "Updated resource.",
      { employmentType: employmentTypeRecordSchema },
      { required: ["employmentType"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "delete_employment_type",
    description:
      "Delete a SmartHR employment type. System preset and scheduled-change restrictions are enforced by SmartHR.",
    operationType: "destructive",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the employment type operation.",
      { employmentTypeId: s.string("The employment type ID.", { minLength: 1 }) },
      { required: ["employmentTypeId"] },
    ),
    outputSchema: s.object(
      "Deletion result.",
      { deleted: s.boolean("Whether SmartHR accepted the deletion.") },
      { required: ["deleted"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "list_job_titles",
    description: "List SmartHR job title records with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing job title records.",
      {
        page: s.integer("Page number, starting at 1. Defaults to 1.", { minimum: 1 }),
        perPage: s.integer("Results per page, from 1 to 100. Defaults to 10.", {
          minimum: 1,
          maximum: 100,
        }),
        sort: s.string("Sort fields separated by commas; prefix a field with - for descending order."),
      },
      { required: [] },
    ),
    outputSchema: s.object(
      "One page of job title records.",
      {
        jobTitles: s.array("Returned job title records.", jobTitleRecordSchema),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["jobTitles", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "get_job_title",
    description: "Get a SmartHR job title by ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Resource lookup parameters.",
      { jobTitleId: s.string("The job title ID.", { minLength: 1 }) },
      { required: ["jobTitleId"] },
    ),
    outputSchema: s.object("Requested resource.", { jobTitle: jobTitleRecordSchema }, { required: ["jobTitle"] }),
  }),
  defineProviderAction("smarthr", {
    name: "create_job_title",
    description: "Create a SmartHR job title.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the job title operation.",
      {
        name: s.string("The job title name."),
        rank: s.integer("Rank from 1 to 99999.", { minimum: 1, maximum: 99999 }),
        code: s.string("The job title code."),
      },
      { required: [] },
    ),
    outputSchema: s.object("Updated resource.", { jobTitle: jobTitleRecordSchema }, { required: ["jobTitle"] }),
  }),
  defineProviderAction("smarthr", {
    name: "update_job_title",
    description: "Partially update a SmartHR job title, preserving unspecified attributes.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the job title operation.",
      {
        jobTitleId: s.string("The job title ID.", { minLength: 1 }),
        name: s.string("The job title name."),
        rank: s.integer("Rank from 1 to 99999.", { minimum: 1, maximum: 99999 }),
        code: s.string("The job title code."),
      },
      { required: ["jobTitleId"] },
    ),
    outputSchema: s.object("Updated resource.", { jobTitle: jobTitleRecordSchema }, { required: ["jobTitle"] }),
  }),
  defineProviderAction("smarthr", {
    name: "replace_job_title",
    description:
      "Update a SmartHR job title using the full-update endpoint; use partial update to preserve unspecified attributes.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the job title operation.",
      {
        jobTitleId: s.string("The job title ID.", { minLength: 1 }),
        name: s.string("The job title name."),
        rank: s.integer("Rank from 1 to 99999.", { minimum: 1, maximum: 99999 }),
      },
      { required: ["jobTitleId"] },
    ),
    outputSchema: s.object("Updated resource.", { jobTitle: jobTitleRecordSchema }, { required: ["jobTitle"] }),
  }),
  defineProviderAction("smarthr", {
    name: "delete_job_title",
    description: "Delete a SmartHR job title.",
    operationType: "destructive",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the job title operation.",
      { jobTitleId: s.string("The job title ID.", { minLength: 1 }) },
      { required: ["jobTitleId"] },
    ),
    outputSchema: s.object(
      "Deletion result.",
      { deleted: s.boolean("Whether SmartHR accepted the deletion.") },
      { required: ["deleted"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "list_grades",
    description: "List SmartHR grade records with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing grade records.",
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
      "One page of grade records.",
      {
        grades: s.array("Returned grade records.", gradeRecordSchema),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["grades", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "get_grade",
    description: "Get a SmartHR grade by ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Resource lookup parameters.",
      { gradeId: s.string("The grade ID.", { minLength: 1 }) },
      { required: ["gradeId"] },
    ),
    outputSchema: s.object("Requested resource.", { grade: gradeRecordSchema }, { required: ["grade"] }),
  }),
  defineProviderAction("smarthr", {
    name: "create_grade",
    description: "Create a SmartHR grade.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the grade operation.",
      {
        name: s.string("The grade name."),
        rank: s.integer("Rank from 1 to 99999.", { minimum: 1, maximum: 99999 }),
      },
      { required: [] },
    ),
    outputSchema: s.object("Updated resource.", { grade: gradeRecordSchema }, { required: ["grade"] }),
  }),
  defineProviderAction("smarthr", {
    name: "update_grade",
    description: "Partially update a SmartHR grade, preserving unspecified attributes.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the grade operation.",
      {
        gradeId: s.string("The grade ID.", { minLength: 1 }),
        name: s.string("The grade name."),
        rank: s.integer("Rank from 1 to 99999.", { minimum: 1, maximum: 99999 }),
      },
      { required: ["gradeId"] },
    ),
    outputSchema: s.object("Updated resource.", { grade: gradeRecordSchema }, { required: ["grade"] }),
  }),
  defineProviderAction("smarthr", {
    name: "replace_grade",
    description:
      "Update a SmartHR grade using the full-update endpoint; use partial update to preserve unspecified attributes.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the grade operation.",
      {
        gradeId: s.string("The grade ID.", { minLength: 1 }),
        name: s.string("The grade name."),
        rank: s.integer("Rank from 1 to 99999.", { minimum: 1, maximum: 99999 }),
      },
      { required: ["gradeId"] },
    ),
    outputSchema: s.object("Updated resource.", { grade: gradeRecordSchema }, { required: ["grade"] }),
  }),
  defineProviderAction("smarthr", {
    name: "delete_grade",
    description: "Delete a SmartHR grade.",
    operationType: "destructive",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the grade operation.",
      { gradeId: s.string("The grade ID.", { minLength: 1 }) },
      { required: ["gradeId"] },
    ),
    outputSchema: s.object(
      "Deletion result.",
      { deleted: s.boolean("Whether SmartHR accepted the deletion.") },
      { required: ["deleted"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "list_job_categories",
    description: "List SmartHR job category records with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing job category records.",
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
      "One page of job category records.",
      {
        jobCategories: s.array("Returned job category records.", jobCategoryRecordSchema),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["jobCategories", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "get_job_category",
    description: "Get a SmartHR job category by ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Resource lookup parameters.",
      { jobCategoryId: s.string("The job category ID.", { minLength: 1 }) },
      { required: ["jobCategoryId"] },
    ),
    outputSchema: s.object(
      "Requested resource.",
      { jobCategory: jobCategoryRecordSchema },
      { required: ["jobCategory"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "create_job_category",
    description: "Create a SmartHR job category.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the job category operation.",
      { name: s.string("The job category name.") },
      { required: [] },
    ),
    outputSchema: s.object(
      "Updated resource.",
      { jobCategory: jobCategoryRecordSchema },
      { required: ["jobCategory"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "update_job_category",
    description: "Partially update a SmartHR job category, preserving unspecified attributes.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the job category operation.",
      {
        jobCategoryId: s.string("The job category ID.", { minLength: 1 }),
        name: s.string("The job category name."),
      },
      { required: ["jobCategoryId"] },
    ),
    outputSchema: s.object(
      "Updated resource.",
      { jobCategory: jobCategoryRecordSchema },
      { required: ["jobCategory"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "replace_job_category",
    description:
      "Update a SmartHR job category using the full-update endpoint; use partial update to preserve unspecified attributes.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the job category operation.",
      {
        jobCategoryId: s.string("The job category ID.", { minLength: 1 }),
        name: s.string("The job category name."),
      },
      { required: ["jobCategoryId"] },
    ),
    outputSchema: s.object(
      "Updated resource.",
      { jobCategory: jobCategoryRecordSchema },
      { required: ["jobCategory"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "delete_job_category",
    description: "Delete a SmartHR job category.",
    operationType: "destructive",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the job category operation.",
      { jobCategoryId: s.string("The job category ID.", { minLength: 1 }) },
      { required: ["jobCategoryId"] },
    ),
    outputSchema: s.object(
      "Deletion result.",
      { deleted: s.boolean("Whether SmartHR accepted the deletion.") },
      { required: ["deleted"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "list_recruitment_types",
    description: "List SmartHR recruitment type records with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing recruitment type records.",
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
      "One page of recruitment type records.",
      {
        recruitmentTypes: s.array("Returned recruitment type records.", recruitmentTypeRecordSchema),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["recruitmentTypes", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "get_recruitment_type",
    description: "Get a SmartHR recruitment type by ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Resource lookup parameters.",
      { recruitmentTypeId: s.string("The recruitment type ID.", { minLength: 1 }) },
      { required: ["recruitmentTypeId"] },
    ),
    outputSchema: s.object(
      "Requested resource.",
      { recruitmentType: recruitmentTypeRecordSchema },
      { required: ["recruitmentType"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "create_recruitment_type",
    description: "Create a SmartHR recruitment type.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the recruitment type operation.",
      { name: s.string("The recruitment type name.") },
      { required: ["name"] },
    ),
    outputSchema: s.object(
      "Updated resource.",
      { recruitmentType: recruitmentTypeRecordSchema },
      { required: ["recruitmentType"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "update_recruitment_type",
    description: "Partially update a SmartHR recruitment type, preserving unspecified attributes.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the recruitment type operation.",
      {
        recruitmentTypeId: s.string("The recruitment type ID.", { minLength: 1 }),
        name: s.string("The recruitment type name."),
      },
      { required: ["recruitmentTypeId", "name"] },
    ),
    outputSchema: s.object(
      "Updated resource.",
      { recruitmentType: recruitmentTypeRecordSchema },
      { required: ["recruitmentType"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "replace_recruitment_type",
    description:
      "Update a SmartHR recruitment type using the full-update endpoint; use partial update to preserve unspecified attributes.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the recruitment type operation.",
      {
        recruitmentTypeId: s.string("The recruitment type ID.", { minLength: 1 }),
        name: s.string("The recruitment type name."),
      },
      { required: ["recruitmentTypeId", "name"] },
    ),
    outputSchema: s.object(
      "Updated resource.",
      { recruitmentType: recruitmentTypeRecordSchema },
      { required: ["recruitmentType"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "delete_recruitment_type",
    description: "Delete a SmartHR recruitment type.",
    operationType: "destructive",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for the recruitment type operation.",
      { recruitmentTypeId: s.string("The recruitment type ID.", { minLength: 1 }) },
      { required: ["recruitmentTypeId"] },
    ),
    outputSchema: s.object(
      "Deletion result.",
      { deleted: s.boolean("Whether SmartHR accepted the deletion.") },
      { required: ["deleted"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "list_users",
    description: "List SmartHR user records with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing user records.",
      {
        page: s.integer("Page number, starting at 1. Defaults to 1.", { minimum: 1 }),
        perPage: s.integer("Results per page, from 1 to 100. Defaults to 10.", {
          minimum: 1,
          maximum: 100,
        }),
        embed: s.stringEnum("Related user data to embed.", [
          "crew",
          "biz_establishment",
          "biz_establishment_company",
          "department_company",
        ]),
        sort: s.string("Sort fields separated by commas; prefix a field with - for descending order."),
      },
      { required: [] },
    ),
    outputSchema: s.object(
      "One page of user records.",
      {
        users: s.array("Returned user records.", userRecordSchema),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["users", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "get_user",
    description: "Get a SmartHR user by ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Resource lookup parameters.",
      {
        userId: s.string("The user ID.", { minLength: 1 }),
        embed: s.stringEnum("Related user data to embed.", [
          "crew",
          "biz_establishment",
          "biz_establishment_company",
          "department_company",
        ]),
      },
      { required: ["userId"] },
    ),
    outputSchema: s.object("Requested resource.", { user: userRecordSchema }, { required: ["user"] }),
  }),
  defineProviderAction("smarthr", {
    name: "list_employee_input_forms",
    description: "List SmartHR employee information collection form records with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing employee information collection form records.",
      {
        page: s.integer("Page number, starting at 1. Defaults to 1.", { minimum: 1 }),
        perPage: s.integer("Results per page, from 1 to 100. Defaults to 10.", {
          minimum: 1,
          maximum: 100,
        }),
        embed: s.stringEnum("Include the invitation email template.", ["mail_format"]),
      },
      { required: [] },
    ),
    outputSchema: s.object(
      "One page of employee information collection form records.",
      {
        employeeInputForms: s.array(
          "Returned employee information collection form records.",
          employeeInformationCollectionFormRecordSchema,
        ),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["employeeInputForms", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "get_employee_input_form",
    description: "Get a SmartHR employee information collection form by ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Resource lookup parameters.",
      {
        employeeInputFormId: s.string("The employee information collection form ID.", {
          minLength: 1,
        }),
        embed: s.string("Related object to embed, such as mail_format."),
      },
      { required: ["employeeInputFormId"] },
    ),
    outputSchema: s.object(
      "Requested resource.",
      { employeeInputForm: employeeInformationCollectionFormRecordSchema },
      { required: ["employeeInputForm"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "list_payment_periods",
    description: "List SmartHR payment period records with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing payment period records.",
      {
        page: s.integer("Page number, starting at 1. Defaults to 1.", { minimum: 1 }),
        perPage: s.integer("Results per page, from 1 to 100. Defaults to 10.", {
          minimum: 1,
          maximum: 100,
        }),
        sort: s.string("Sort fields separated by commas; prefix a field with - for descending order."),
      },
      { required: [] },
    ),
    outputSchema: s.object(
      "One page of payment period records.",
      {
        paymentPeriods: s.array("Returned payment period records.", paymentPeriodRecordSchema),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["paymentPeriods", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "get_payment_period",
    description: "Get a SmartHR payment period by ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Resource lookup parameters.",
      { paymentPeriodId: s.string("The payment period ID.", { minLength: 1 }) },
      { required: ["paymentPeriodId"] },
    ),
    outputSchema: s.object(
      "Requested resource.",
      { paymentPeriod: paymentPeriodRecordSchema },
      { required: ["paymentPeriod"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "list_bank_account_settings",
    description: "List SmartHR bank account setting records with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing bank account setting records.",
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
      "One page of bank account setting records.",
      {
        bankAccountSettings: s.array("Returned bank account setting records.", bankAccountSettingRecordSchema),
        page: s.integer("Requested page number."),
        perPage: s.integer("Requested page size."),
        totalCount: s.nullable(s.integer("Total matching records from x-total-count, or null when unavailable.")),
        nextPage: s.nullable(
          s.integer("Next page number from the Link header, or null when no next link is provided."),
        ),
      },
      { required: ["bankAccountSettings", "page", "perPage", "totalCount", "nextPage"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "create_employee",
    description: "Create a SmartHR employee. No employee fields are mandatory; attachments accept file URLs.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object("Employee write parameters.", { employee: employeeWriteSchema }, { required: ["employee"] }),
    outputSchema: s.object("Employee write result.", { employee: employeeRecordSchema }, { required: ["employee"] }),
  }),
  defineProviderAction("smarthr", {
    name: "update_employee",
    description:
      "Update only the supplied SmartHR employee fields. SmartHR prevents clearing populated identity fields; attachments accept file URLs.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Employee write parameters.",
      { employeeId: s.string("The employee ID.", { minLength: 1 }), employee: employeeWriteSchema },
      { required: ["employeeId", "employee"] },
    ),
    outputSchema: s.object("Employee write result.", { employee: employeeRecordSchema }, { required: ["employee"] }),
  }),
  defineProviderAction("smarthr", {
    name: "delete_employee",
    description: "Delete a SmartHR employee record.",
    operationType: "destructive",
    requiredScopes: [],
    inputSchema: s.object(
      "Employee deletion parameters.",
      { employeeId: s.string("The employee ID.", { minLength: 1 }) },
      { required: ["employeeId"] },
    ),
    outputSchema: s.object(
      "Deletion result.",
      { deleted: s.boolean("Whether SmartHR accepted the deletion.") },
      { required: ["deleted"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "clear_employee_departments",
    description:
      "Clear all department assignments on a SmartHR employee without deleting the employee or department records.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Employee department assignment parameters.",
      { employeeId: s.string("The employee ID.", { minLength: 1 }) },
      { required: ["employeeId"] },
    ),
    outputSchema: s.object(
      "Department assignment result.",
      { cleared: s.boolean("Whether SmartHR cleared the employee department assignments.") },
      { required: ["cleared"] },
    ),
  }),
  defineProviderAction("smarthr", {
    name: "invite_employee",
    description:
      "Send or resend an invitation to the employee email address. The inviter must be an administrator; the invited user receives member permissions. Already accepted invitations cannot be resent.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "Employee invitation parameters.",
      {
        employeeId: s.string("The employee ID.", { minLength: 1 }),
        inviterUserId: s.string("The administrator sending the invitation ID.", { minLength: 1 }),
        employeeInputFormId: s.string("The employee information collection form ID.", {
          minLength: 1,
        }),
      },
      { required: ["employeeId", "inviterUserId"] },
    ),
    outputSchema: s.object(
      "Invitation result.",
      { invited: s.boolean("Whether SmartHR accepted the invitation request.") },
      { required: ["invited"] },
    ),
  }),
];
