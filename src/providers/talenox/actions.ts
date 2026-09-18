import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "talenox";

const branchSchema = s.looseObject("A Talenox branch object.");
const employeeSchema = s.looseObject("A Talenox employee object.");
const workingDaySchema = s.looseObject("A Talenox working day object.");
const workingHourSchema = s.looseObject("A Talenox working hour object.");

export const talenoxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_company_settings",
    operationType: "read",
    description: "Retrieve the current Talenox company settings visible to the API token.",
    inputSchema: s.actionInput({}, [], "Input for retrieving Talenox company settings."),
    outputSchema: s.actionOutput(
      { companySettings: s.looseObject("The company settings returned by Talenox.") },
      "The Talenox company settings response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_branches",
    operationType: "read",
    description: "List all Talenox branches for the connected company.",
    inputSchema: s.actionInput({}, [], "Input for listing Talenox branches."),
    outputSchema: s.actionOutput(
      { branches: s.array("The branches returned by Talenox.", branchSchema) },
      "The Talenox branch list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_branch",
    operationType: "read",
    description: "Retrieve one Talenox branch by branch ID.",
    inputSchema: s.actionInput(
      { id: s.positiveInteger("The Talenox branch ID.") },
      ["id"],
      "Input for retrieving one Talenox branch.",
    ),
    outputSchema: s.actionOutput({ branch: branchSchema }, "The Talenox branch response."),
  }),
  defineProviderAction(service, {
    name: "list_employees",
    operationType: "read",
    description: "List all Talenox employees for the connected company.",
    inputSchema: s.actionInput({}, [], "Input for listing Talenox employees."),
    outputSchema: s.actionOutput(
      { employees: s.array("The employees returned by Talenox.", employeeSchema) },
      "The Talenox employee list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_employee",
    operationType: "read",
    description: "Retrieve one Talenox employee by employee ID.",
    inputSchema: s.actionInput(
      { id: s.positiveInteger("The Talenox employee ID.") },
      ["id"],
      "Input for retrieving one Talenox employee.",
    ),
    outputSchema: s.actionOutput({ employee: employeeSchema }, "The Talenox employee response."),
  }),
  defineProviderAction(service, {
    name: "list_working_days",
    operationType: "read",
    description: "List all Talenox working day configurations.",
    inputSchema: s.actionInput({}, [], "Input for listing Talenox working days."),
    outputSchema: s.actionOutput(
      { workingDays: s.array("The working days returned by Talenox.", workingDaySchema) },
      "The Talenox working day list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_working_day",
    operationType: "read",
    description: "Retrieve one Talenox working day configuration by ID.",
    inputSchema: s.actionInput(
      { id: s.positiveInteger("The Talenox working day ID.") },
      ["id"],
      "Input for retrieving one Talenox working day.",
    ),
    outputSchema: s.actionOutput({ workingDay: workingDaySchema }, "The Talenox working day response."),
  }),
  defineProviderAction(service, {
    name: "list_working_hours",
    operationType: "read",
    description: "List all Talenox working hour configurations.",
    inputSchema: s.actionInput({}, [], "Input for listing Talenox working hours."),
    outputSchema: s.actionOutput(
      { workingHours: s.array("The working hours returned by Talenox.", workingHourSchema) },
      "The Talenox working hour list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_working_hour",
    operationType: "read",
    description: "Retrieve one Talenox working hour configuration by ID.",
    inputSchema: s.actionInput(
      { id: s.positiveInteger("The Talenox working hour ID.") },
      ["id"],
      "Input for retrieving one Talenox working hour.",
    ),
    outputSchema: s.actionOutput({ workingHour: workingHourSchema }, "The Talenox working hour response."),
  }),
];
