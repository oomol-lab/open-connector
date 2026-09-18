import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sage_hr" as const;

const pageField = s.positiveInteger("The Sage HR page number to request.");
const employeeIdField = s.positiveInteger("The Sage HR employee ID.");
const rawSchema = s.looseObject("The raw Sage HR API response payload.");
const metaSchema = s.looseObject("Pagination metadata returned by Sage HR.");

const employeeHistoryFields = {
  page: pageField,
  includeTeamHistory: s.boolean("Whether Sage HR should include team_history records in employee responses."),
  includeEmploymentStatusHistory: s.boolean(
    "Whether Sage HR should include employment_status_history records in employee responses.",
  ),
  includePositionHistory: s.boolean("Whether Sage HR should include position_history records in employee responses."),
};
const employeeHistoryOptionalFields = [
  "page",
  "includeTeamHistory",
  "includeEmploymentStatusHistory",
  "includePositionHistory",
] as const;

const employeeSchema = s.looseObject("A Sage HR active employee object.");
const terminatedEmployeeSchema = s.looseObject("A Sage HR terminated employee object.");
const teamSchema = s.looseObject("A Sage HR team object.");
const positionSchema = s.looseObject("A Sage HR position object.");
const terminationReasonSchema = s.looseObject("A Sage HR termination reason object.");
const timeOffRequestSchema = s.looseObject("A Sage HR time off request object.");

const employeeListOutputSchema = s.object("The Sage HR active employee list response.", {
  employees: s.array("The active employees returned by Sage HR.", employeeSchema),
  meta: metaSchema,
  raw: rawSchema,
});
const employeeOutputSchema = s.object("The Sage HR active employee response.", {
  employee: employeeSchema,
  raw: rawSchema,
});
const terminatedEmployeeListOutputSchema = s.object("The Sage HR terminated employee list response.", {
  terminatedEmployees: s.array("The terminated employees returned by Sage HR.", terminatedEmployeeSchema),
  meta: metaSchema,
  raw: rawSchema,
});
const terminatedEmployeeOutputSchema = s.object("The Sage HR terminated employee response.", {
  terminatedEmployee: terminatedEmployeeSchema,
  raw: rawSchema,
});
const teamListOutputSchema = s.object("The Sage HR team list response.", {
  teams: s.array("The teams returned by Sage HR.", teamSchema),
  meta: metaSchema,
  raw: rawSchema,
});
const positionListOutputSchema = s.object("The Sage HR position list response.", {
  positions: s.array("The positions returned by Sage HR.", positionSchema),
  meta: metaSchema,
  raw: rawSchema,
});
const terminationReasonListOutputSchema = s.object("The Sage HR termination reason list response.", {
  terminationReasons: s.array("The termination reasons returned by Sage HR.", terminationReasonSchema),
  meta: metaSchema,
  raw: rawSchema,
});
const timeOffRequestListOutputSchema = s.object("The Sage HR time off request list response.", {
  timeOffRequests: s.array("The time off requests returned by Sage HR.", timeOffRequestSchema),
  meta: metaSchema,
  raw: rawSchema,
});
const timeOffRequestListInputSchema = s.object(
  "Input parameters for listing Sage HR time off requests.",
  {
    page: pageField,
    from: s.date(
      "Start date for the time off request range. Sage HR expects YYYY-MM-DD; when from and to are both provided, the range must be less than 65 days.",
    ),
    to: s.date(
      "End date for the time off request range. Sage HR expects YYYY-MM-DD; when from and to are both provided, the range must be less than 65 days.",
    ),
  },
  {
    optional: ["page", "from", "to"],
  },
);

export const sageHrActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_employees",
    operationType: "read",
    description: "List active employees in Sage HR with optional pagination and history expansions.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Sage HR active employees.",
      {
        ...employeeHistoryFields,
      },
      {
        optional: employeeHistoryOptionalFields,
      },
    ),
    outputSchema: employeeListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_employee",
    operationType: "read",
    description: "Get a single active Sage HR employee by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for getting a Sage HR active employee.",
      {
        employeeId: employeeIdField,
        includeTeamHistory: employeeHistoryFields.includeTeamHistory,
        includeEmploymentStatusHistory: employeeHistoryFields.includeEmploymentStatusHistory,
        includePositionHistory: employeeHistoryFields.includePositionHistory,
      },
      {
        optional: ["includeTeamHistory", "includeEmploymentStatusHistory", "includePositionHistory"],
      },
    ),
    outputSchema: employeeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_terminated_employees",
    operationType: "read",
    description: "List terminated employees in Sage HR with optional pagination and history expansions.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Sage HR terminated employees.",
      {
        ...employeeHistoryFields,
      },
      {
        optional: employeeHistoryOptionalFields,
      },
    ),
    outputSchema: terminatedEmployeeListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_terminated_employee",
    operationType: "read",
    description: "Get a single terminated Sage HR employee by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting a Sage HR terminated employee.", {
      employeeId: employeeIdField,
    }),
    outputSchema: terminatedEmployeeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_teams",
    operationType: "read",
    description: "List teams in Sage HR with optional pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Sage HR teams.",
      {
        page: pageField,
      },
      {
        optional: ["page"],
      },
    ),
    outputSchema: teamListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_positions",
    operationType: "read",
    description: "List positions in Sage HR with optional pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Sage HR positions.",
      {
        page: pageField,
      },
      {
        optional: ["page"],
      },
    ),
    outputSchema: positionListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_termination_reasons",
    operationType: "read",
    description: "List termination reasons configured in Sage HR with optional pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Sage HR termination reasons.",
      {
        page: pageField,
      },
      {
        optional: ["page"],
      },
    ),
    outputSchema: terminationReasonListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_time_off_requests",
    operationType: "read",
    description: "List Sage HR time off requests with optional date range and pagination filters.",
    requiredScopes: [],
    inputSchema: timeOffRequestListInputSchema,
    outputSchema: timeOffRequestListOutputSchema,
  }),
];
