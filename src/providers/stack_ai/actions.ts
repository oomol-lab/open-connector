import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "stack_ai";

const nullableText = (description: string) => s.nullable(s.string(description, { minLength: 1 }));

const runResultSchema = s.object("The normalized StackAI run payload returned by the deployed flow API.", {
  runId: nullableText("The StackAI run identifier when StackAI returns one."),
  status: nullableText("The run status returned by StackAI when available."),
  output: s.unknown("The primary StackAI output payload."),
  text: nullableText("The text response returned by StackAI when available."),
  raw: s.unknown("The raw StackAI JSON payload."),
});

export const stackAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "run_flow",
    description: "Run a deployed StackAI flow with JSON variables and return its normalized result.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        userId: s.nonEmptyString("The StackAI user identifier used for the run."),
        variables: s.looseObject("The JSON variables object passed to the deployed flow."),
      },
      ["userId"],
      "Input parameters for running a deployed StackAI flow with JSON variables.",
    ),
    outputSchema: runResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_run_metadata",
    description: "Fetch metadata for one previously started StackAI run.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        runId: s.nonEmptyString("The StackAI run identifier returned by a previous run."),
      },
      ["runId"],
      "Input parameters for reading one StackAI run metadata.",
    ),
    outputSchema: s.requiredObject("The normalized StackAI run metadata wrapper.", {
      run: s.object("The StackAI run metadata payload.", {
        runId: s.nonEmptyString("The StackAI run identifier."),
        status: nullableText("The run status returned by StackAI when available."),
        createdAt: nullableText("The run creation timestamp returned by StackAI."),
        finishedAt: nullableText("The run completion timestamp returned by StackAI."),
        userId: nullableText("The StackAI user identifier attached to the run."),
        conversationId: nullableText("The StackAI conversation identifier attached to the run."),
        output: s.unknown("The run output payload returned by StackAI."),
        text: nullableText("The text response returned by StackAI when available."),
        usage: s.nullable(s.looseObject("The usage metadata returned by StackAI when available.")),
        raw: s.unknown("The raw StackAI run metadata payload."),
      }),
    }),
  }),
];
