import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "make";

const makeIdField = s.positiveInteger("Make resource ID.");
const scenarioIdField = s.positiveInteger("Make scenario ID.");
const teamIdField = s.positiveInteger("Make team ID.");
const organizationIdField = s.positiveInteger("Make organization ID.");
const paginationOffsetField = s.nonNegativeInteger("Number of records to skip.");
const paginationLimitField = s.positiveInteger("Maximum number of records to return.");
const sortDirectionField = s.stringEnum("Make sorting direction.", ["asc", "desc"]);
const scenarioTypeField = s.stringEnum("Make scenario type.", ["scenario", "tool"]);
const columnField = s.string("Make response column name.", { minLength: 1 });
const looseMakeObject = s.unknownObject("Object returned by the Make API.");

const paginationSchema = s.looseObject(
  {
    last: s.string("Cursor for the last page when returned by Make."),
    showLast: s.boolean("Whether Make reports a last-page cursor."),
    sortBy: s.string("Active sort field returned by Make."),
    sortDir: s.string("Active sort direction returned by Make."),
    limit: s.integer("Result limit returned by Make."),
    offset: s.integer("Result offset returned by Make."),
  },
  { description: "Make pagination metadata." },
);

const userSchema = s.looseObject(
  {
    id: makeIdField,
    name: s.string("Make user name."),
    email: s.email("Make user email address."),
    language: s.string("Make user language."),
    avatar: s.url("Make user avatar URL."),
  },
  { description: "Make user profile." },
);

const authorizationSchema = s.looseObject(
  {
    scope: s.array("Scopes granted to the Make credential.", s.string("Make API scope.")),
    authUsed: s.string("Authentication method used by Make."),
  },
  { description: "Make authorization information." },
);

const teamSchema = s.looseObject(
  {
    id: makeIdField,
    name: s.string("Make team name."),
    organizationId: organizationIdField,
  },
  { description: "Make team." },
);

const scenarioSchema = s.looseObject(
  {
    id: scenarioIdField,
    name: s.string("Make scenario name."),
    teamId: teamIdField,
    organizationId: organizationIdField,
    description: s.string("Make scenario description."),
    folderId: makeIdField,
    isActive: s.boolean("Whether the Make scenario is active."),
    isPaused: s.boolean("Whether the Make scenario is paused."),
    islocked: s.boolean("Whether the Make scenario is locked."),
    isinvalid: s.boolean("Whether the Make scenario is invalid."),
    lastEdit: s.string("Last edit timestamp returned by Make."),
    created: s.string("Creation timestamp returned by Make."),
    nextExec: s.string("Next execution timestamp returned by Make."),
    type: scenarioTypeField,
  },
  { description: "Make scenario." },
);

const currentUserInputSchema = s.object(
  "Input for retrieving the current Make user.",
  {
    includeInvitedOrg: s.boolean("Whether pending organization invitations are included."),
    cols: s.array("Make user columns to include in the response.", columnField),
  },
  { optional: ["includeInvitedOrg", "cols"] },
);

const listTeamsInputSchema = s.object(
  "Input for listing Make teams.",
  {
    organizationId: organizationIdField,
    offset: paginationOffsetField,
    limit: paginationLimitField,
    sortBy: s.string("Make team field to sort by.", { minLength: 1 }),
    sortDir: sortDirectionField,
  },
  { optional: ["organizationId", "offset", "limit", "sortBy", "sortDir"] },
);

const listScenariosInputSchema = {
  ...s.object(
    "Input for listing Make scenarios.",
    {
      teamId: teamIdField,
      organizationId: organizationIdField,
      ids: s.array("Specific Make scenario IDs to retrieve.", scenarioIdField, { minItems: 1 }),
      folderId: makeIdField,
      isActive: s.boolean("Whether to return only active or inactive scenarios."),
      concept: s.boolean("Whether to return only scenario concepts."),
      type: scenarioTypeField,
      cols: s.array("Make scenario columns to include in the response.", columnField),
      offset: paginationOffsetField,
      limit: paginationLimitField,
      sortBy: s.string("Make scenario field to sort by.", { minLength: 1 }),
      sortDir: sortDirectionField,
    },
    {
      optional: [
        "teamId",
        "organizationId",
        "ids",
        "folderId",
        "isActive",
        "concept",
        "type",
        "cols",
        "offset",
        "limit",
        "sortBy",
        "sortDir",
      ],
    },
  ),
  oneOf: [
    { required: ["teamId"], not: { required: ["organizationId"] } },
    { required: ["organizationId"], not: { required: ["teamId"] } },
  ],
} satisfies JsonSchema;

const scenarioIdInputSchema = s.object("Input containing one Make scenario ID.", {
  scenarioId: scenarioIdField,
});

const runScenarioInputSchema = s.object(
  "Input for running one Make scenario.",
  {
    scenarioId: scenarioIdField,
    data: s.unknownObject("Scenario input values keyed by the Make scenario input name."),
    responsive: s.boolean("Whether Make should wait for the scenario execution to finish."),
    callbackUrl: s.url("Callback URL Make should call when the scenario execution finishes."),
  },
  { optional: ["data", "responsive", "callbackUrl"] },
);

const getScenarioInputSchema = s.object(
  "Input for retrieving one Make scenario.",
  {
    scenarioId: scenarioIdField,
    cols: s.array("Make scenario columns to include in the response.", columnField),
  },
  { optional: ["cols"] },
);

const getScenarioUsageInputSchema = s.object(
  "Input for retrieving Make scenario usage.",
  {
    scenarioId: scenarioIdField,
    organizationTimezone: s.boolean("Whether usage days are calculated in the organization timezone."),
  },
  { optional: ["organizationTimezone"] },
);

const currentUserOutputSchema = s.object("Normalized Make current user response.", {
  user: userSchema,
  raw: looseMakeObject,
});
const authorizationOutputSchema = s.object("Normalized Make current authorization response.", {
  authorization: authorizationSchema,
  raw: looseMakeObject,
});
const listTeamsOutputSchema = s.object(
  "Normalized Make team list response.",
  {
    teams: s.array("Make teams returned by the API.", teamSchema),
    pg: paginationSchema,
    raw: looseMakeObject,
  },
  { optional: ["pg"] },
);
const listScenariosOutputSchema = s.object(
  "Normalized Make scenario list response.",
  {
    scenarios: s.array("Make scenarios returned by the API.", scenarioSchema),
    pg: paginationSchema,
    raw: looseMakeObject,
  },
  { optional: ["pg"] },
);
const scenarioOutputSchema = s.object("Normalized Make scenario response.", {
  scenario: scenarioSchema,
  raw: looseMakeObject,
});
const successOutputSchema = s.object("Normalized Make operation response.", {
  success: s.boolean("Whether Make accepted the operation."),
  raw: looseMakeObject,
});
const runScenarioOutputSchema = s.object(
  "Normalized Make scenario run response.",
  {
    executionId: s.string("Make scenario execution ID."),
    status: s.string("Make scenario execution status when returned by Make."),
    raw: looseMakeObject,
  },
  { optional: ["executionId", "status"] },
);
const scenarioUsageOutputSchema = s.object("Normalized Make scenario usage response.", {
  usage: s.array("Daily Make scenario usage records.", looseMakeObject),
  raw: looseMakeObject,
});

export const makeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the authenticated Make user profile.",
    inputSchema: currentUserInputSchema,
    outputSchema: currentUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_current_authorization",
    description: "Get the current Make credential authorization details and scopes.",
    inputSchema: s.object("Input for retrieving Make authorization details.", {}),
    outputSchema: authorizationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_teams",
    description: "List Make teams visible to the authenticated credential.",
    inputSchema: listTeamsInputSchema,
    outputSchema: listTeamsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_scenarios",
    description: "List Make scenarios for one team or organization.",
    inputSchema: listScenariosInputSchema,
    outputSchema: listScenariosOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_scenario",
    description: "Get details for one Make scenario.",
    inputSchema: getScenarioInputSchema,
    outputSchema: scenarioOutputSchema,
  }),
  defineProviderAction(service, {
    name: "activate_scenario",
    description: "Activate a Make scenario.",
    inputSchema: scenarioIdInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "deactivate_scenario",
    description: "Deactivate a Make scenario.",
    inputSchema: scenarioIdInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "run_scenario_once",
    description: "Run a Make scenario once on demand.",
    inputSchema: runScenarioInputSchema,
    outputSchema: runScenarioOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_scenario_usage",
    description: "Get daily usage for a Make scenario over the previous 30 days.",
    inputSchema: getScenarioUsageInputSchema,
    outputSchema: scenarioUsageOutputSchema,
  }),
];
