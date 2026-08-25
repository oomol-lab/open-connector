import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "vectorshift";

const fileLikeValueSchema = s.object("A VectorShift file value that may be returned in outputs.", {
  type: s.literal("file", { description: "The VectorShift datatype identifier for file inputs." }),
  raw_bytes: s.string("The base64 payload for a file input."),
  metadata: s.looseObject("Optional VectorShift file metadata."),
});

const scalarValueSchema = s.anyOf("A JSON-safe VectorShift scalar value.", [
  s.string("A string value."),
  s.integer("An integer value."),
  s.number("A number value."),
  s.boolean("A boolean value."),
  { type: "null", description: "A null value." },
]);

const mapValueSchema = s.object("A VectorShift map datatype value.", {
  type: s.literal("map", { description: "The VectorShift datatype identifier for map values." }),
  items: s.record("The nested values inside the VectorShift map.", s.unknown("One nested value.")),
});

const jsonSafeValueSchema = s.anyOf("A JSON-safe VectorShift input value.", [
  scalarValueSchema,
  s.array("An array of JSON-safe values.", s.unknown("One array item.")),
  mapValueSchema,
  s.looseObject("A plain JSON object value."),
]);

const outputsValueSchema = s.anyOf("One VectorShift output value.", [
  scalarValueSchema,
  s.array("An array output value.", s.unknown("One output array item.")),
  mapValueSchema,
  fileLikeValueSchema,
  s.looseObject("A plain JSON object output value."),
]);

const pipelineIdSchema = s.nonEmptyString("The VectorShift pipeline identifier.");
const inputsSchema = s.record("Map of input names to their JSON-safe values.", jsonSafeValueSchema);
const runItemSchema = s.object("One pipeline run request forwarded to VectorShift.", {
  inputs: inputsSchema,
});

export const vectorshiftActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_pipelines",
    description: "List VectorShift pipelines that are accessible to the connected API key.",
    inputSchema: s.actionInput(
      {
        include_shared: s.boolean("Whether shared pipelines should be included in the result."),
        verbose: s.boolean("Whether VectorShift should include full pipeline objects."),
      },
      [],
      "Optional flags for listing VectorShift pipelines.",
    ),
    outputSchema: s.actionOutput(
      {
        status: s.stringEnum("The VectorShift request status.", ["success", "failed"]),
        pipeline_ids: s.array(
          "The pipeline identifiers returned by VectorShift.",
          s.string("One VectorShift pipeline identifier."),
        ),
        pipelines: s.array(
          "The full pipeline objects returned when verbose=true.",
          s.looseObject("One VectorShift pipeline object."),
        ),
      },
      "The VectorShift pipeline list result.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_pipeline",
    description: "Fetch one VectorShift pipeline by pipeline ID or by pipeline name.",
    inputSchema: s.actionInput(
      {
        pipeline_id: pipelineIdSchema,
        name: s.nonEmptyString("The VectorShift pipeline name."),
        username: s.nonEmptyString("Optional username used by VectorShift when resolving a pipeline by name."),
        org_name: s.nonEmptyString("Optional organization name used by VectorShift when resolving a pipeline by name."),
      },
      [],
      "The pipeline selector for fetching one VectorShift pipeline.",
    ),
    outputSchema: s.actionOutput(
      {
        status: s.stringEnum("The VectorShift request status.", ["success", "failed"]),
        pipeline: s.looseObject("The pipeline object returned by VectorShift."),
      },
      "The requested VectorShift pipeline object.",
    ),
  }),
  defineProviderAction(service, {
    name: "run_pipeline",
    description: "Run one VectorShift pipeline with JSON-safe inputs and return the resulting outputs.",
    inputSchema: s.actionInput(
      { pipeline_id: pipelineIdSchema, inputs: inputsSchema },
      ["pipeline_id", "inputs"],
      "The pipeline run request sent to VectorShift.",
    ),
    outputSchema: s.actionOutput(
      {
        status: s.stringEnum("The VectorShift request status.", ["success", "failed"]),
        run_id: s.string("The VectorShift run identifier."),
        outputs: s.record("The pipeline outputs returned by VectorShift.", outputsValueSchema),
      },
      "The VectorShift pipeline run result.",
    ),
  }),
  defineProviderAction(service, {
    name: "bulk_run_pipeline",
    description: "Run multiple instances of the same VectorShift pipeline with JSON-safe inputs in one request.",
    inputSchema: s.actionInput(
      {
        pipeline_id: pipelineIdSchema,
        runs: s.array("The list of run payloads sent to VectorShift.", runItemSchema, { minItems: 1 }),
      },
      ["pipeline_id", "runs"],
      "The bulk pipeline run request sent to VectorShift.",
    ),
    outputSchema: s.actionOutput(
      {
        status: s.stringEnum("The VectorShift request status.", ["success", "failed"]),
        run_outputs: s.array(
          "The outputs returned for each VectorShift pipeline run.",
          s.object("One VectorShift run output object.", {
            run_id: s.string("The VectorShift run identifier."),
            outputs: s.record("The outputs returned for this VectorShift pipeline run.", outputsValueSchema),
          }),
        ),
      },
      "The VectorShift bulk pipeline run result.",
    ),
  }),
];
