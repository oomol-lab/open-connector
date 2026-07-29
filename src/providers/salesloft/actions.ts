import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "salesloft";

const metadataSchema = s.nullable(s.looseObject("The Salesloft metadata object returned with list responses."));
const resourceSchema = s.looseObject("A Salesloft resource object returned by the API.");
const filtersSchema = s.record(
  "Salesloft query filters keyed by official filter name. Nested objects are encoded as bracket query parameters, such as industry[_starts_with].",
  s.unknown("A Salesloft filter value."),
);

const listInputSchema = s.actionInput(
  {
    page: s.positiveInteger("The Salesloft page number to fetch. The minimum page is 1."),
    perPage: s.integer("The number of records to fetch per page.", {
      minimum: 1,
      maximum: 100,
    }),
    sortBy: s.nonEmptyString("The Salesloft field name to sort by."),
    sortDirection: s.stringEnum("The Salesloft sort direction.", ["ASC", "DESC"]),
    filters: filtersSchema,
  },
  [],
  "Common Salesloft list input parameters.",
);

const idInputSchema = s.actionInput(
  {
    id: s.nonEmptyString("The Salesloft resource ID or GUID."),
  },
  ["id"],
  "Input parameters for fetching one Salesloft resource.",
);

export type SalesloftActionName =
  | "get_current_user"
  | "list_people"
  | "get_person"
  | "list_accounts"
  | "get_account"
  | "list_cadences"
  | "get_cadence";

export const salesloftActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Fetch information about the authenticated Salesloft user.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "Input payload for fetching the authenticated Salesloft user."),
    outputSchema: s.actionOutput(
      {
        user: resourceSchema,
        metadata: metadataSchema,
      },
      "The authenticated Salesloft user response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_people",
    description: "List Salesloft people with optional paging, sorting, and filters.",
    requiredScopes: ["people:read"],
    inputSchema: listInputSchema,
    outputSchema: s.actionOutput(
      {
        people: s.array("The Salesloft people returned by the API.", resourceSchema),
        metadata: metadataSchema,
      },
      "The Salesloft people list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_person",
    description: "Fetch a Salesloft person by ID or GUID.",
    requiredScopes: ["people:read"],
    inputSchema: idInputSchema,
    outputSchema: s.actionOutput(
      {
        person: resourceSchema,
        metadata: metadataSchema,
      },
      "The Salesloft person response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List Salesloft accounts with optional paging, sorting, and filters.",
    requiredScopes: ["accounts:read"],
    inputSchema: listInputSchema,
    outputSchema: s.actionOutput(
      {
        accounts: s.array("The Salesloft accounts returned by the API.", resourceSchema),
        metadata: metadataSchema,
      },
      "The Salesloft accounts list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_account",
    description: "Fetch a Salesloft account by ID or GUID.",
    requiredScopes: ["accounts:read"],
    inputSchema: idInputSchema,
    outputSchema: s.actionOutput(
      {
        account: resourceSchema,
        metadata: metadataSchema,
      },
      "The Salesloft account response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_cadences",
    description: "List Salesloft cadences with optional paging, sorting, and filters.",
    requiredScopes: ["cadences:read"],
    inputSchema: listInputSchema,
    outputSchema: s.actionOutput(
      {
        cadences: s.array("The Salesloft cadences returned by the API.", resourceSchema),
        metadata: metadataSchema,
      },
      "The Salesloft cadences list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_cadence",
    description: "Fetch a Salesloft cadence by ID or GUID.",
    requiredScopes: ["cadences:read"],
    inputSchema: idInputSchema,
    outputSchema: s.actionOutput(
      {
        cadence: resourceSchema,
        metadata: metadataSchema,
      },
      "The Salesloft cadence response.",
    ),
  }),
];
