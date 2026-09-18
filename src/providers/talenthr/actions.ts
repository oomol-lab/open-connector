import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "talenthr";

const employeeIdSchema = s.integer("The TalentHR employee ID whose role should be changed.", {
  exclusiveMinimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
});
const roleSchema = s.stringEnum("The TalentHR role to assign to the employee.", ["employee", "hr_manager"]);

export const talenthrActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "change_employee_role",
    operationType: "write",
    description:
      "Change a TalentHR employee's user role to Employee or HR-Manager using the official employee role endpoints.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        employeeId: employeeIdSchema,
        role: roleSchema,
      },
      ["employeeId", "role"],
      "Request parameters for changing a TalentHR employee role.",
    ),
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether TalentHR reported that the operation succeeded."),
        employeeId: s.integer("The TalentHR employee ID returned by the role change endpoint.", {
          exclusiveMinimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        }),
        role: roleSchema,
        raw: s.looseObject("Raw TalentHR response payload."),
      },
      "TalentHR employee role change response.",
    ),
  }),
];
