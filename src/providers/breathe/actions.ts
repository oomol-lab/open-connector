import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "breathe";

const positiveInteger = (description: string) => s.integer(description, { minimum: 1 });

const paginationInputSchema = s.object(
  "Pagination parameters for Breathe list endpoints.",
  {
    page: positiveInteger("Page of results to fetch."),
    perPage: positiveInteger("Number of results to return per page."),
  },
  { optional: ["page", "perPage"] },
);

const rawPayloadSchema = s.looseObject("Raw Breathe response payload.");
const itemSchema = (description: string) => s.looseObject(description);

const listOutputSchema = (description: string, itemDescription: string, fieldName: string): JsonSchema =>
  s.object(description, {
    [fieldName]: s.array(itemDescription, itemSchema(itemDescription)),
    raw: rawPayloadSchema,
  });

const singleOutputSchema = (description: string, fieldName: string, itemDescription: string): JsonSchema =>
  s.object(description, {
    [fieldName]: itemSchema(itemDescription),
    raw: rawPayloadSchema,
  });

export const breatheActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_employees",
    description: "List employees from Breathe with optional pagination and role filters.",
    inputSchema: s.object(
      "Request parameters for listing Breathe employees.",
      {
        page: positiveInteger("Page of results to fetch."),
        perPage: positiveInteger("Number of results to return per page."),
        filter: s.stringEnum("Type of employees to return.", ["hr", "line_manager", "either", "neither"]),
        rotacloud: s.boolean("Whether to return leave requests where rotacloud is not excluded from integration."),
      },
      { optional: ["page", "perPage", "filter", "rotacloud"] },
    ),
    outputSchema: listOutputSchema("Breathe employees list response.", "Breathe employee record.", "employees"),
  }),
  defineProviderAction(service, {
    name: "get_employee",
    description: "Fetch one employee from Breathe by employee ID.",
    inputSchema: s.object("Request parameters for fetching a Breathe employee.", {
      employeeId: positiveInteger("ID of the Breathe employee to fetch."),
    }),
    outputSchema: singleOutputSchema("Breathe employee detail response.", "employee", "Breathe employee record."),
  }),
  defineProviderAction(service, {
    name: "list_departments",
    description: "List company departments from Breathe.",
    inputSchema: paginationInputSchema,
    outputSchema: listOutputSchema("Breathe departments list response.", "Breathe department record.", "departments"),
  }),
  defineProviderAction(service, {
    name: "list_locations",
    description: "List company locations from Breathe.",
    inputSchema: s.object("No input is required to list Breathe locations.", {}),
    outputSchema: listOutputSchema("Breathe locations list response.", "Breathe location record.", "locations"),
  }),
  defineProviderAction(service, {
    name: "get_account",
    description: "Fetch account details for the authenticated Breathe account.",
    inputSchema: s.object("No input is required to fetch the Breathe account.", {}),
    outputSchema: singleOutputSchema("Breathe account detail response.", "account", "Breathe account record."),
  }),
];
