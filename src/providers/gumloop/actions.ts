import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gumloop";

const userIdSchema = s.nonEmptyString("The Gumloop user ID. If omitted, the user ID stored during connection is used.");
const projectIdSchema = s.nonEmptyString("The Gumloop project or team ID.");
const savedItemIdSchema = s.nonEmptyString("The Gumloop saved flow ID.");
const workbookIdSchema = s.nonEmptyString("The Gumloop workbook ID.");
const runIdSchema = s.nonEmptyString("The Gumloop run ID.");
const rawObjectSchema = s.unknownObject("The raw Gumloop object.");

const contextInputSchema = s.actionInput(
  {
    userId: userIdSchema,
    projectId: projectIdSchema,
  },
  [],
  "Gumloop user or team execution context.",
);

const savedFlowSchema = s.looseRequiredObject(
  "A Gumloop saved flow.",
  {
    saved_item_id: s.string("The ID of the saved flow."),
    name: s.string("The name of the saved flow."),
    description: s.string("The description of the saved flow."),
    created_ts: s.dateTime("The timestamp when the saved flow was created."),
  },
  { optional: ["saved_item_id", "name", "description", "created_ts"] },
);

const workbookSchema = s.looseRequiredObject(
  "A Gumloop workbook with its saved flows.",
  {
    workbook_id: s.string("The ID of the workbook."),
    name: s.string("The name of the workbook."),
    description: s.string("The description of the workbook."),
    created_ts: s.dateTime("The timestamp when the workbook was created."),
    saved_items: s.array("Saved flows in the workbook.", savedFlowSchema),
  },
  { optional: ["workbook_id", "name", "description", "created_ts", "saved_items"] },
);

const inputDefinitionSchema = s.looseRequiredObject(
  "A Gumloop saved flow input definition.",
  {
    data_type: s.stringEnum("The Gumloop input data type.", ["string", "file"]),
    description: s.nullableString("The input description, if Gumloop provides one."),
    name: s.string("The input name."),
  },
  { optional: ["data_type", "description", "name"] },
);

const runStateSchema = s.stringEnum("The Gumloop run state.", [
  "RUNNING",
  "DONE",
  "TERMINATING",
  "FAILED",
  "TERMINATED",
  "QUEUED",
]);

const runOutputSchema = s.record(
  "Output values keyed by Gumloop output node name.",
  s.unknown("A Gumloop output value."),
);

const getInputSchemaInputSchema = s.actionInput(
  {
    savedItemId: savedItemIdSchema,
    userId: userIdSchema,
    projectId: projectIdSchema,
  },
  ["savedItemId"],
  "Input parameters for retrieving a Gumloop saved flow input schema.",
);

const listRunHistoryInputSchema = {
  ...s.actionInput(
    {
      workbookId: workbookIdSchema,
      savedItemId: savedItemIdSchema,
      userId: userIdSchema,
      projectId: projectIdSchema,
    },
    [],
    "Input parameters for retrieving Gumloop recent run history.",
  ),
  anyOf: [{ required: ["workbookId"] }, { required: ["savedItemId"] }],
};

const startFlowRunInputSchema = s.actionInput(
  {
    savedItemId: savedItemIdSchema,
    userId: userIdSchema,
    projectId: projectIdSchema,
    inputs: s.record(
      "Small JSON input values keyed by Gumloop Input node name. File inputs are deferred in this connector pass.",
      s.unknown("A JSON input value for the Gumloop flow."),
    ),
  },
  ["savedItemId"],
  "Input parameters for starting a Gumloop saved flow run.",
);

const runInputSchema = s.actionInput(
  {
    runId: runIdSchema,
    userId: userIdSchema,
    projectId: projectIdSchema,
  },
  ["runId"],
  "Input parameters for a Gumloop flow run.",
);

export const gumloopActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_saved_flows",
    description: "List Gumloop saved flows for a user or team.",
    inputSchema: contextInputSchema,
    outputSchema: s.actionOutput(
      {
        savedFlows: s.array("Saved flows returned by Gumloop.", savedFlowSchema),
        raw: rawObjectSchema,
      },
      "Gumloop saved flow list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_workbooks",
    description: "List Gumloop workbooks and their saved flows for a user or team.",
    inputSchema: contextInputSchema,
    outputSchema: s.actionOutput(
      {
        workbooks: s.array("Workbooks returned by Gumloop.", workbookSchema),
        raw: rawObjectSchema,
      },
      "Gumloop workbook list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_input_schema",
    description: "Retrieve the input schema for a Gumloop saved flow.",
    inputSchema: getInputSchemaInputSchema,
    outputSchema: s.actionOutput(
      {
        inputs: s.array("Input definitions returned by Gumloop.", inputDefinitionSchema),
        raw: rawObjectSchema,
      },
      "Gumloop saved flow input schema response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_run_history",
    description: "Retrieve recent Gumloop run history for a workbook or saved flow.",
    inputSchema: listRunHistoryInputSchema,
    outputSchema: s.actionOutput(
      {
        runHistory: rawObjectSchema,
        raw: rawObjectSchema,
      },
      "Gumloop recent run history response.",
    ),
  }),
  defineProviderAction(service, {
    name: "start_flow_run",
    description: "Start a Gumloop saved flow run with small JSON input values.",
    inputSchema: startFlowRunInputSchema,
    outputSchema: s.actionOutput(
      {
        runId: s.string("The started Gumloop run ID."),
        savedItemId: s.string("The Gumloop saved flow ID returned for the run."),
        workbookId: s.string("The Gumloop workbook ID returned for the run."),
        url: s.string("The Gumloop run URL returned by the API."),
        raw: rawObjectSchema,
      },
      "Gumloop start flow run response.",
    ),
    asyncLifecycle: {
      startActionId: "gumloop.start_flow_run",
      statusActionId: "gumloop.get_run_details",
      cancelActionId: "gumloop.kill_flow_run",
    },
  }),
  defineProviderAction(service, {
    name: "get_run_details",
    description: "Poll a Gumloop flow run and retrieve state, logs, and output node values.",
    inputSchema: runInputSchema,
    outputSchema: s.object(
      "Gumloop run details response with normalized state and outputs.",
      {
        userId: s.string("The Gumloop user ID associated with the run."),
        state: runStateSchema,
        outputs: runOutputSchema,
        createdTs: s.dateTime("The timestamp when the run was created."),
        finishedTs: s.dateTime("The timestamp when the run finished."),
        log: s.array("Log entries returned by Gumloop.", s.string("A Gumloop log entry.")),
        raw: rawObjectSchema,
      },
      { required: ["state", "raw"], optional: ["userId", "outputs", "createdTs", "finishedTs", "log"] },
    ),
  }),
  defineProviderAction(service, {
    name: "kill_flow_run",
    description: "Kill a Gumloop flow run and its subflow runs.",
    inputSchema: runInputSchema,
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether Gumloop reports that the run was killed."),
        runId: s.string("The Gumloop run ID that was killed."),
        raw: rawObjectSchema,
      },
      "Gumloop kill flow run response.",
    ),
  }),
];
