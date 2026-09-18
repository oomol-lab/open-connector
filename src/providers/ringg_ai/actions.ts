import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ringg_ai";

const paginationProperties = {
  limit: s.integer("The maximum number of items to return, up to 100.", {
    minimum: 1,
    maximum: 100,
  }),
  offset: s.integer("The number of items to skip before returning results.", { minimum: 0 }),
};

const emptyInputSchema = s.object("An empty input payload.", {});
const looseResourceSchema = (description: string) => s.looseObject(description, {});
const idInputSchema = (description: string) =>
  s.object(description, {
    id: s.nonEmptyString("The Ringg AI resource identifier."),
  });

const callerNumberSchema = s.describe(
  {
    oneOf: [
      { type: "string", minLength: 1 },
      { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
    ],
  },
  "A caller phone number or a non-empty array of caller phone numbers, including country codes.",
);

const initiateCallInputSchema = {
  ...s.object(
    "The input payload for initiating one outbound Ringg AI call.",
    {
      name: s.nonEmptyString("The name of the person to call."),
      mobile_number: s.nonEmptyString("The destination phone number including its country code."),
      agent_id: s.nonEmptyString("The identifier of the assistant that will handle the call."),
      from_number: callerNumberSchema,
      from_number_id: s.describe(
        callerNumberSchema,
        "A workspace number identifier or a non-empty array of workspace number identifiers.",
      ),
      custom_args_values: s.record(
        "Custom variable values substituted into the assistant prompt.",
        s.string("A custom variable value."),
      ),
      version_id: s.nonEmptyString("The assistant version identifier; defaults to the active version."),
      call_category: s.nonEmptyString("A category used for internal reporting or workflow grouping."),
      parent_call_id: s.nonEmptyString("The parent call identifier for a follow-up or chained call."),
    },
    {
      optional: [
        "from_number",
        "from_number_id",
        "custom_args_values",
        "version_id",
        "call_category",
        "parent_call_id",
      ],
    },
  ),
  oneOf: [{ required: ["from_number_id"] }, { required: ["from_number"] }],
};

const workspaceOutputSchema = s.looseRequiredObject("The Ringg AI workspace response.", {
  workspace_info: s.looseRequiredObject("The authenticated Ringg AI workspace.", {
    id: s.nonEmptyString("The unique workspace identifier."),
    name: s.nonEmptyString("The workspace display name."),
  }),
});

const assistantsOutputSchema = s.looseRequiredObject("The Ringg AI assistant list response.", {
  data: s.looseRequiredObject("The assistant list data envelope.", {
    agents: s.array("The assistants available in the workspace.", looseResourceSchema("A Ringg AI assistant.")),
  }),
});

const assistantOutputSchema = s.looseRequiredObject("The Ringg AI assistant details response.", {
  agents: s.looseRequiredObject("The requested Ringg AI assistant.", {
    id: s.nonEmptyString("The unique assistant identifier."),
  }),
});

const voicesOutputSchema = s.looseRequiredObject("The Ringg AI voice list response.", {
  voices: s.array("The voices available to Ringg AI assistants.", looseResourceSchema("A Ringg AI voice.")),
});

const workspaceNumbersOutputSchema = s.looseRequiredObject("The Ringg AI workspace number list response.", {
  workspace_numbers: s.array(
    "The caller numbers available in the workspace.",
    looseResourceSchema("A Ringg AI workspace number."),
  ),
});

const initiateCallOutputSchema = s.looseRequiredObject("The Ringg AI call initiation response.", {
  status: s.nonEmptyString("The result status returned by Ringg AI."),
  data: s.looseRequiredObject("The initiated call data.", {
    call_id: s.nonEmptyString("The unique identifier of the initiated call."),
  }),
  message: s.nonEmptyString("The result message returned by Ringg AI."),
});

const callHistoryOutputSchema = s.looseRequiredObject("The paginated Ringg AI call history response.", {
  calls: s.array("The calls in the current result page.", looseResourceSchema("A Ringg AI call history entry.")),
  limit: s.integer("The maximum number of calls requested for this page."),
  offset: s.integer("The number of calls skipped before this page."),
  count: s.integer("The number of calls returned in this page."),
  total: s.integer("The total number of calls matching the filters."),
});

const callDetailsOutputSchema = s.looseRequiredObject("The Ringg AI call details response.", {
  status: s.nonEmptyString("The result status returned by Ringg AI."),
  data: s.looseRequiredObject("The requested call details.", {
    id: s.nonEmptyString("The unique call identifier."),
  }),
});

export const ringgAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_workspace",
    operationType: "read",
    description: "Retrieve information about the Ringg AI workspace associated with the API key.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: workspaceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_assistants",
    operationType: "read",
    description: "List assistants available in the current Ringg AI workspace.",
    requiredScopes: [],
    inputSchema: s.object("Pagination options for listing Ringg AI assistants.", paginationProperties, {
      optional: ["limit", "offset"],
    }),
    outputSchema: assistantsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_assistant",
    operationType: "read",
    description: "Retrieve detailed configuration for one Ringg AI assistant.",
    requiredScopes: [],
    inputSchema: idInputSchema("The assistant to retrieve."),
    outputSchema: assistantOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_voices",
    operationType: "read",
    description: "List voices available for Ringg AI assistants, optionally filtered by language.",
    requiredScopes: [],
    inputSchema: s.object(
      "Language filtering options for listing Ringg AI voices.",
      {
        language: s.nonEmptyString("A language code or comma-separated language codes, such as en-US or en-US,hi-IN."),
      },
      { optional: ["language"] },
    ),
    outputSchema: voicesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_workspace_numbers",
    operationType: "read",
    description: "List caller numbers available in the current Ringg AI workspace.",
    requiredScopes: [],
    inputSchema: s.object("Pagination options for listing Ringg AI workspace numbers.", paginationProperties, {
      optional: ["limit", "offset"],
    }),
    outputSchema: workspaceNumbersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "initiate_call",
    operationType: "write",
    description: "Initiate one outbound call with a Ringg AI assistant and caller number.",
    requiredScopes: [],
    inputSchema: initiateCallInputSchema,
    outputSchema: initiateCallOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_calls",
    operationType: "read",
    description: "List Ringg AI call history with pagination and optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination options for Ringg AI call history.",
      {
        start_date: s.string("The inclusive call start date in ISO 8601 format.", {
          format: "date-time",
        }),
        end_date: s.string("The inclusive call end date in ISO 8601 format.", {
          format: "date-time",
        }),
        ...paginationProperties,
        agent_id: s.nonEmptyString("The assistant identifier used to filter calls."),
        status: s.stringEnum("The call status used to filter results.", [
          "registered",
          "ongoing",
          "retry",
          "error",
          "completed",
          "failed",
          "cancelled",
          "forwarded",
        ]),
        bulk_list_id: s.nonEmptyString("The campaign bulk list identifier used to filter calls."),
      },
      {
        optional: ["start_date", "end_date", "limit", "offset", "agent_id", "status", "bulk_list_id"],
      },
    ),
    outputSchema: callHistoryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_call",
    operationType: "read",
    description: "Retrieve details for one Ringg AI call, optionally including analysis data.",
    requiredScopes: [],
    inputSchema: s.object(
      "The call details request.",
      {
        id: s.nonEmptyString("The unique identifier of the call to retrieve."),
        send_analysis: s.boolean("Whether to include platform and client analysis data in the response."),
      },
      { optional: ["send_analysis"] },
    ),
    outputSchema: callDetailsOutputSchema,
  }),
];
