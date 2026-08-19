import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "perdoo";

const idSchema = s.uuid("A Perdoo UUID.");
const cursorSchema = s.string("A Perdoo GraphQL pagination cursor.", { minLength: 1 });
const dateSchema = s.date("A date in YYYY-MM-DD format.");
const timestampSchema = s.dateTime("An ISO 8601 timestamp returned by Perdoo.");
const rawObjectSchema = s.looseObject("A raw JSON object returned by Perdoo.");

const goalTypeSchema = s.stringEnum("The Perdoo goal type.", [
  "STRATEGIC_PILLAR",
  "KPI",
  "OBJECTIVE",
  "KEY_RESULT",
  "INITIATIVE",
]);

const commitStatusSchema = s.stringEnum("The Perdoo commit status.", [
  "NO_STATUS",
  "OFF_TRACK",
  "NEEDS_ATTENTION",
  "ON_TRACK",
  "ACCOMPLISHED",
]);

const objectiveStageSchema = s.stringEnum("The Perdoo objective stage.", ["DRAFT", "ACTIVE", "CLOSED"]);

const companySummarySchema = s.object(
  "A compact Perdoo company.",
  {
    id: idSchema,
    name: s.string("The company name."),
  },
  { required: ["id", "name"], additionalProperties: true },
);

const userSummarySchema = s.object(
  "A compact Perdoo user.",
  {
    id: idSchema,
    email: s.email("The user's email address."),
    firstName: s.nullableString("The user's first name."),
    lastName: s.nullableString("The user's last name."),
  },
  { optional: ["firstName", "lastName"], additionalProperties: true },
);

const timeframeSummarySchema = s.object(
  "A compact Perdoo timeframe.",
  {
    id: idSchema,
    name: s.string("The timeframe name."),
    startDate: dateSchema,
    endDate: dateSchema,
  },
  { required: ["id", "name", "startDate", "endDate"], additionalProperties: true },
);

const parentGoalSchema = s.object(
  "A compact parent Perdoo goal.",
  {
    id: idSchema,
    name: s.string("The goal name."),
    type: goalTypeSchema,
  },
  { required: ["id", "name", "type"], additionalProperties: true },
);

const goalSchema = s.object(
  "A Perdoo goal.",
  {
    id: idSchema,
    type: goalTypeSchema,
    name: s.string("The goal name."),
    description: s.nullableString("The goal description."),
    private: s.boolean("Whether the goal is private."),
    currentValue: s.nullableNumber("The goal's current value."),
    status: s.nullable(commitStatusSchema),
    stage: s.nullable(objectiveStageSchema),
    progress: s.nullable(s.integer("The goal progress percentage.")),
    archived: s.boolean("Whether the goal is archived."),
    metricUnit: s.string("The metric unit configured for the goal."),
    startDate: s.nullable(dateSchema),
    endDate: s.nullable(dateSchema),
    createdDate: timestampSchema,
    lastEditedDate: timestampSchema,
    company: companySummarySchema,
    parent: s.nullable(parentGoalSchema),
    lead: s.nullable(userSummarySchema),
    timeframe: s.nullable(timeframeSummarySchema),
    cursor: s.nullable(cursorSchema),
    raw: rawObjectSchema,
  },
  {
    optional: [
      "description",
      "currentValue",
      "status",
      "stage",
      "progress",
      "startDate",
      "endDate",
      "parent",
      "lead",
      "timeframe",
      "cursor",
      "raw",
    ],
    additionalProperties: true,
  },
);

const pageInfoSchema = s.object(
  "Perdoo cursor pagination metadata.",
  {
    hasNextPage: s.boolean("Whether another page exists after this page."),
    hasPreviousPage: s.boolean("Whether another page exists before this page."),
    startCursor: s.nullable(cursorSchema),
    endCursor: s.nullable(cursorSchema),
  },
  { required: ["hasNextPage", "hasPreviousPage", "startCursor", "endCursor"] },
);

const graphqlRequestSchema = s.object(
  "A Perdoo GraphQL request payload.",
  {
    query: s.string("The GraphQL document to execute.", { minLength: 1 }),
    variables: s.record("GraphQL variables keyed by variable name.", s.unknown("A variable.")),
    operationName: s.string("The GraphQL operation name to execute.", { minLength: 1 }),
  },
  { optional: ["variables", "operationName"] },
);

const listGoalsInputSchema = s.object(
  "Input for listing Perdoo goals.",
  {
    first: s.positiveInteger("The number of goals to return after the cursor."),
    after: cursorSchema,
    type: goalTypeSchema,
    status: commitStatusSchema,
    stage: objectiveStageSchema,
    archived: s.boolean("Whether to return archived goals."),
    includeArchived: s.boolean("Whether archived goals should be included."),
    orderBy: s.string("The Perdoo ordering expression.", { minLength: 1 }),
  },
  {
    optional: ["first", "after", "type", "status", "stage", "archived", "includeArchived", "orderBy"],
  },
);

const getGoalInputSchema = s.object("Input for retrieving one Perdoo goal.", { id: idSchema }, { required: ["id"] });

const upsertCommitInputSchema = s.object(
  "Input for creating or updating a Perdoo progress update.",
  {
    goalId: idSchema,
    keyResultId: idSchema,
    kpiId: idSchema,
    commitId: idSchema,
    commitDate: dateSchema,
    commitType: s.string("The Perdoo commit type, such as MANUAL.", { minLength: 1 }),
    value: s.number("The progress value to submit."),
    status: commitStatusSchema,
    description: s.string("The progress update description.", { minLength: 1 }),
    userId: idSchema,
  },
  {
    optional: [
      "goalId",
      "keyResultId",
      "kpiId",
      "commitId",
      "commitDate",
      "commitType",
      "value",
      "status",
      "description",
      "userId",
    ],
  },
);
upsertCommitInputSchema.oneOf = exactlyOneRequired(["goalId", "keyResultId", "kpiId"]);

const mutationErrorSchema = s.object(
  "A Perdoo mutation validation error.",
  {
    field: s.string("The field that failed validation."),
    messages: s.array("Validation messages returned by Perdoo.", s.string("A validation message.")),
  },
  { required: ["field", "messages"] },
);

const commitTargetSchema = s.object(
  "A compact Perdoo progress target.",
  {
    id: idSchema,
    name: s.string("The target name."),
    currentValue: s.nullableNumber("The target's current value."),
  },
  { optional: ["currentValue"], additionalProperties: true },
);

const commitGoalTargetSchema = s.object(
  "A compact Perdoo goal progress target.",
  {
    id: idSchema,
    name: s.string("The target name."),
    type: goalTypeSchema,
    currentValue: s.nullableNumber("The target's current value."),
  },
  { optional: ["currentValue"], additionalProperties: true },
);

const commitSchema = s.object(
  "A Perdoo progress update.",
  {
    id: idSchema,
    description: s.nullableString("The progress update description."),
    commitType: s.string("The commit type returned by Perdoo."),
    createdDate: timestampSchema,
    commitDate: dateSchema,
    value: s.number("The submitted progress value."),
    delta: s.number("The change in value produced by the commit."),
    valueBefore: s.number("The previous value before the commit."),
    status: commitStatusSchema,
    statusBefore: commitStatusSchema,
    keyResult: s.nullable(commitTargetSchema),
    kpi: s.nullable(commitTargetSchema),
    goal: s.nullable(commitGoalTargetSchema),
    user: s.nullable(userSummarySchema),
  },
  { optional: ["description", "keyResult", "kpi", "goal", "user"], additionalProperties: true },
);

export const perdooActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_goals",
    description: "List Perdoo goals with the documented GraphQL goal filters and cursor pagination.",
    inputSchema: listGoalsInputSchema,
    outputSchema: s.object(
      "A page of Perdoo goals.",
      {
        goals: s.array("Goals returned by Perdoo.", goalSchema),
        pageInfo: pageInfoSchema,
        totalCount: s.integer("The total number of matching goals."),
        edgeCount: s.integer("The number of returned edges."),
      },
      { required: ["goals", "pageInfo", "totalCount", "edgeCount"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_goal",
    description: "Retrieve one Perdoo goal by UUID.",
    inputSchema: getGoalInputSchema,
    outputSchema: s.object("A Perdoo goal lookup result.", { goal: s.nullable(goalSchema) }, { required: ["goal"] }),
  }),
  defineProviderAction(service, {
    name: "upsert_commit",
    description: "Create or update a Perdoo progress update for exactly one goal, key result, or KPI.",
    inputSchema: upsertCommitInputSchema,
    outputSchema: s.object(
      "The Perdoo upsertCommit mutation result.",
      {
        commit: s.nullable(commitSchema),
        errors: s.array("Mutation validation errors returned by Perdoo.", mutationErrorSchema),
      },
      { required: ["commit", "errors"] },
    ),
  }),
  defineProviderAction(service, {
    name: "execute_graphql",
    description: "Execute a JSON-friendly Perdoo GraphQL query or mutation.",
    inputSchema: graphqlRequestSchema,
    outputSchema: s.object(
      "The raw Perdoo GraphQL response data and extensions.",
      {
        data: s.unknown("The raw GraphQL data object returned by Perdoo."),
        extensions: rawObjectSchema,
      },
      { optional: ["extensions"] },
    ),
  }),
];

function exactlyOneRequired(keys: string[]): JsonSchema[] {
  return keys.map((key) => ({
    required: [key],
    not: {
      anyOf: keys.filter((candidate) => candidate !== key).map((candidate) => ({ required: [candidate] })),
    },
  }));
}
