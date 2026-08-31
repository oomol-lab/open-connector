import type { FeishuJsonRequest } from "./client.ts";

import { providerInputError } from "../../provider-runtime.ts";

interface FeishuAttendanceActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

export function createFeishuAttendanceActionHandlers(
  request: FeishuJsonRequest,
): Record<string, FeishuAttendanceActionHandler> {
  return {
    query_my_attendance_tasks(input) {
      return queryMyAttendanceTasks(input, request);
    },
  };
}

async function queryMyAttendanceTasks(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const checkDateFrom = requireDate(input.checkDateFrom, "checkDateFrom");
  const checkDateTo = requireDate(input.checkDateTo, "checkDateTo");
  if (checkDateFrom > checkDateTo) {
    throw providerInputError("checkDateFrom must not be later than checkDateTo");
  }
  const data = await request({
    method: "POST",
    path: "/attendance/v1/user_tasks/query",
    query: {
      employee_type: "employee_no",
      include_terminated_user: optionalBoolean(input.includeTerminatedUser),
      ignore_invalid_users: optionalBoolean(input.ignoreInvalidUsers),
    },
    body: {
      user_ids: [],
      check_date_from: checkDateFrom,
      check_date_to: checkDateTo,
      need_overtime_result: optionalBoolean(input.needOvertimeResult),
    },
  });
  return {
    tasks: Array.isArray(data.user_task_results) ? data.user_task_results : [],
    invalidUserIds: stringArray(data.invalid_user_ids),
    unauthorizedUserIds: stringArray(data.unauthorized_user_ids),
  };
}

function requireDate(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || !isValidDate(value)) {
    throw providerInputError(`${fieldName} must be a valid date in yyyyMMdd form`);
  }
  return value;
}

function isValidDate(value: number) {
  const year = Math.trunc(value / 10_000);
  const month = Math.trunc((value % 10_000) / 100);
  const day = value % 100;
  if (year < 2000 || year > 2999 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
