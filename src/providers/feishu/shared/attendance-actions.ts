import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
export const feishuAttendanceProviderScopes = {
  read: "attendance:task:readonly",
};
export function createFeishuAttendanceActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "query_my_attendance_tasks",
      operationType: "read",
      description: "Query the current authorized user's attendance tasks and clock-in records for a work-date range.",
      requiredScopes: [feishuAttendanceProviderScopes.read],
      providerPermissions: [feishuAttendanceProviderScopes.read],
      inputSchema: s.object(
        "Choose the inclusive work-date range and optional result details.",
        {
          checkDateFrom: s.integer("The first work date in `yyyyMMdd` form.", {
            minimum: 20000101,
            maximum: 29991231,
          }),
          checkDateTo: s.integer("The final work date in `yyyyMMdd` form.", {
            minimum: 20000101,
            maximum: 29991231,
          }),
          needOvertimeResult: s.boolean("Include overtime shift segments in addition to normal shifts."),
          includeTerminatedUser: s.boolean("Include terminated employees that reused the same employee number."),
          ignoreInvalidUsers: s.boolean("Return valid results even when Feishu reports invalid or unauthorized users."),
        },
        {
          optional: ["needOvertimeResult", "includeTerminatedUser", "ignoreInvalidUsers"],
        },
      ),
      outputSchema: s.object(
        "The current user's attendance tasks and validation notices.",
        {
          tasks: s.array(
            "The attendance task results.",
            s.looseObject("An attendance task containing day, group, shift, and clock-in record details."),
          ),
          invalidUserIds: s.array("Employee IDs Feishu considered invalid.", s.string("An invalid employee ID.")),
          unauthorizedUserIds: s.array(
            "Employee IDs outside the caller's data scope.",
            s.string("An unauthorized employee ID."),
          ),
        },
        {
          optional: [],
        },
      ),
    }),
  ];
}
