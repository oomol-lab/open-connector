import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "workpath";

const pageSchema = s.positiveInteger(
  "The Workpath page number to request. Workpath returns the first page when omitted.",
);

const paginationSchema = s.object("Pagination metadata returned by Workpath response headers.", {
  page: s.nullableInteger("The Workpath page number returned in the response headers."),
  limit: s.nullableInteger("The maximum number of items per page returned by Workpath."),
  pageCount: s.nullableInteger("The total number of pages reported by Workpath."),
  itemCount: s.nullableInteger("The total number of items reported by Workpath."),
  nextPage: s.nullableString("The URL for the next page, or null when no next page is present."),
  link: s.nullableString("The raw Link header returned by Workpath, or null when absent."),
});

const listGoalsInputSchema = {
  ...s.object(
    "Query parameters for listing Workpath goals.",
    {
      page: pageSchema,
      startDate: s.date(
        "Return goals whose start and target dates overlap this start date. Must be passed with endDate.",
      ),
      endDate: s.date(
        "Return goals whose start and target dates overlap this end date. Must be passed with startDate.",
      ),
    },
    { optional: ["page", "startDate", "endDate"] },
  ),
  anyOf: [
    { required: ["startDate", "endDate"] },
    { not: { anyOf: [{ required: ["startDate"] }, { required: ["endDate"] }] } },
  ],
} satisfies JsonSchema;

const pagedListInputSchema = s.object(
  "Query parameters for listing a paginated Workpath resource.",
  {
    page: pageSchema,
  },
  { optional: ["page"] },
);

const idInputSchema = (resourceName: string): JsonSchema =>
  s.object(
    `Path parameters for retrieving one Workpath ${resourceName}.`,
    {
      id: s.positiveInteger(`The unique Workpath ${resourceName} identifier.`),
    },
    { required: ["id"] },
  );

const goalIdInputSchema = s.object(
  "Path parameters for listing Workpath goal key results.",
  {
    goalId: s.positiveInteger("The unique Workpath goal identifier."),
  },
  { required: ["goalId"] },
);

const workpathObjectSchema = (description: string): JsonSchema => s.unknownObject(description);
const workpathArraySchema = (description: string, itemDescription: string): JsonSchema =>
  s.array(description, workpathObjectSchema(itemDescription));

export const workpathActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_goals",
    description: "List Workpath goals visible to the API client, optionally filtered by an overlapping date range.",
    inputSchema: listGoalsInputSchema,
    outputSchema: s.object(
      "The paginated Workpath goals response.",
      {
        goals: workpathArraySchema("The Workpath goals returned for the requested page.", "One Workpath goal object."),
        pagination: paginationSchema,
      },
      { required: ["goals", "pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_goal",
    description: "Get one Workpath goal by its unique identifier.",
    inputSchema: idInputSchema("goal"),
    outputSchema: s.object(
      "The Workpath goal response.",
      {
        goal: workpathObjectSchema("The Workpath goal object."),
      },
      { required: ["goal"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_goal_key_results",
    description: "List all key results associated with a specific Workpath goal.",
    inputSchema: goalIdInputSchema,
    outputSchema: s.object(
      "The Workpath goal key results response.",
      {
        keyResults: workpathArraySchema(
          "The Workpath key results returned for the goal.",
          "One Workpath key result object.",
        ),
      },
      { required: ["keyResults"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_goal_key_result",
    description: "Get one Workpath key result by its unique identifier using the official convenience endpoint.",
    inputSchema: idInputSchema("key result"),
    outputSchema: s.object(
      "The Workpath key result response.",
      {
        keyResult: workpathObjectSchema("The Workpath key result object."),
      },
      { required: ["keyResult"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Workpath users visible to the API client.",
    inputSchema: pagedListInputSchema,
    outputSchema: s.object(
      "The paginated Workpath users response.",
      {
        users: workpathArraySchema("The Workpath users returned for the requested page.", "One Workpath user object."),
        pagination: paginationSchema,
      },
      { required: ["users", "pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get one Workpath user by their unique identifier.",
    inputSchema: idInputSchema("user"),
    outputSchema: s.object(
      "The Workpath user response.",
      {
        user: workpathObjectSchema("The Workpath user object."),
      },
      { required: ["user"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_teams",
    description: "List Workpath teams visible to the API client.",
    inputSchema: pagedListInputSchema,
    outputSchema: s.object(
      "The paginated Workpath teams response.",
      {
        teams: workpathArraySchema("The Workpath teams returned for the requested page.", "One Workpath team object."),
        pagination: paginationSchema,
      },
      { required: ["teams", "pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_team",
    description: "Get one Workpath team by its unique identifier.",
    inputSchema: idInputSchema("team"),
    outputSchema: s.object(
      "The Workpath team response.",
      {
        team: workpathObjectSchema("The Workpath team object."),
      },
      { required: ["team"] },
    ),
  }),
];
