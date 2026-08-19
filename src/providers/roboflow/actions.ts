import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "roboflow";

const workspaceField = s.nonEmptyString("The Roboflow workspace slug.");
const projectField = s.nonEmptyString("The Roboflow project slug.");
const versionField = s.positiveInteger("The Roboflow project version number.");
const rawPayloadSchema = s.looseObject("The raw Roboflow payload for fields not normalized yet.");
const workflowSpecificationSchema = s.looseObject(
  "Roboflow workflow specification object defining version, inputs, steps, and outputs.",
);
const workflowInputsSchema = s.looseObject("Runtime values keyed by Roboflow workflow input name.");
const workflowIdField = s.nonEmptyString("The Roboflow workflow identifier.");
const workflowVersionIdField = s.nonEmptyString(
  "Specific saved workflow version identifier to use instead of the latest version.",
);

const projectSchema = s.object("A normalized Roboflow project summary.", {
  id: s.nullableString("The Roboflow project identifier when returned."),
  name: s.nullableString("The Roboflow project display name when returned."),
  type: s.nullableString("The Roboflow project type when returned."),
  raw: rawPayloadSchema,
});

const versionSummarySchema = s.object("A normalized Roboflow version summary.", {
  id: s.nullableString("The Roboflow version identifier when returned."),
  name: s.nullableString("The Roboflow version display name when returned."),
  model: s.nullableString("The model type or model family when returned."),
  trained: s.nullableBoolean("Whether Roboflow reports the version as trained."),
  raw: rawPayloadSchema,
});

const versionDetailSchema = s.object("A normalized Roboflow version detail.", {
  id: s.nullableString("The Roboflow version identifier when returned."),
  name: s.nullableString("The Roboflow version display name when returned."),
  model: s.nullableString("The model type or model family when returned."),
  trained: s.nullableBoolean("Whether Roboflow reports the version as trained."),
  exports: s.array(
    "Dataset export formats Roboflow reports for this version.",
    s.string("One Roboflow export format."),
  ),
  raw: rawPayloadSchema,
});

const detectObjectsInputSchema = {
  ...s.object(
    "Input parameters for running Roboflow hosted object detection.",
    {
      project: projectField,
      version: versionField,
      imageUrl: s.url("A public image URL to send to Roboflow for inference."),
      imageBase64: s.nonEmptyString("Base64-encoded image bytes to send to Roboflow for inference."),
      confidence: s.integer("Minimum confidence threshold percentage for returned predictions.", {
        minimum: 0,
        maximum: 100,
      }),
      overlap: s.integer("Maximum bounding box overlap percentage for non-max suppression.", {
        minimum: 0,
        maximum: 100,
      }),
    },
    { optional: ["imageUrl", "imageBase64", "confidence", "overlap"] },
  ),
  oneOf: [{ required: ["imageUrl"] }, { required: ["imageBase64"] }],
};

const describeWorkflowInterfaceInputSchema = {
  ...s.object(
    "Input parameters for describing a Roboflow workflow interface.",
    {
      specification: workflowSpecificationSchema,
      workspace: workspaceField,
      workflowId: workflowIdField,
      workflowVersionId: workflowVersionIdField,
      useCache: s.boolean(
        "Whether Roboflow should use cached saved workflow definitions when describing a saved workflow.",
      ),
    },
    { optional: ["specification", "workspace", "workflowId", "workflowVersionId", "useCache"] },
  ),
  oneOf: [{ required: ["specification"] }, { required: ["workspace", "workflowId"] }],
};

const workflowRunOutputSchema = s.object("Roboflow workflow execution result.", {
  outputs: s.array("Serialized outputs returned by the workflow.", rawPayloadSchema),
  profilerTrace: s.nullable(s.array("Profiler trace events returned when profiling is enabled.", rawPayloadSchema)),
  raw: rawPayloadSchema,
});

const workflowInterfaceOutputSchema = s.object("Roboflow workflow interface description.", {
  inputs: rawPayloadSchema,
  outputs: rawPayloadSchema,
  typingHints: rawPayloadSchema,
  kindsSchemas: rawPayloadSchema,
  raw: rawPayloadSchema,
});

export const roboflowActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Roboflow projects visible to the API key workspace.",
    inputSchema: s.object("Input parameters for listing Roboflow projects.", {}),
    outputSchema: s.object("Roboflow workspace projects returned by the connector.", {
      workspace: s.nullableString("The Roboflow workspace slug when returned."),
      projects: s.array("Projects visible to the API key.", projectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_project_versions",
    description: "Get one Roboflow project and list its available versions.",
    inputSchema: s.object("Input parameters for reading one Roboflow project.", {
      workspace: workspaceField,
      project: projectField,
    }),
    outputSchema: s.object("Roboflow project details and version summaries.", {
      project: projectSchema,
      versions: s.array("Versions returned for the requested project.", versionSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_version",
    description: "Read one Roboflow project version and return training/export metadata.",
    inputSchema: s.object("Input parameters for reading one Roboflow project version.", {
      workspace: workspaceField,
      project: projectField,
      version: versionField,
    }),
    outputSchema: s.object("Roboflow version details returned by the connector.", {
      version: versionDetailSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "detect_objects",
    description:
      "Run Roboflow hosted object detection for one project version using a public image URL or Base64 image content.",
    inputSchema: detectObjectsInputSchema,
    outputSchema: s.object("Roboflow object detection result returned by the connector.", {
      predictions: s.array(
        "Object detection predictions returned by Roboflow.",
        s.object("A normalized Roboflow object detection prediction.", {
          className: s.nullableString("The predicted class label."),
          classId: s.nullableString("The predicted class identifier when returned."),
          confidence: s.nullableNumber("The prediction confidence score."),
          x: s.nullableNumber("The prediction center X coordinate in pixels."),
          y: s.nullableNumber("The prediction center Y coordinate in pixels."),
          width: s.nullableNumber("The prediction bounding box width in pixels."),
          height: s.nullableNumber("The prediction bounding box height in pixels."),
          detectionId: s.nullableString("The Roboflow detection identifier when returned."),
          raw: rawPayloadSchema,
        }),
      ),
      image: s.nullable(
        s.object("The image dimensions returned by Roboflow when available.", {
          width: s.nullableNumber("The image width in pixels when returned."),
          height: s.nullableNumber("The image height in pixels when returned."),
        }),
      ),
      timeSeconds: s.nullableNumber("The inference duration in seconds when returned."),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "run_workflow",
    description: "Run a Roboflow workflow specification with runtime inputs and return serialized workflow outputs.",
    inputSchema: s.object(
      "Input parameters for running a Roboflow workflow specification.",
      {
        specification: workflowSpecificationSchema,
        inputs: workflowInputsSchema,
        workflowId: workflowIdField,
        excludedFields: s.array(
          "Output field names to exclude from the workflow response.",
          s.string("One workflow output field name to exclude."),
        ),
        enableProfiling: s.boolean("Whether to request workflow profiler trace data."),
        isPreview: s.boolean("Whether to run the workflow in Roboflow preview mode."),
      },
      { optional: ["workflowId", "excludedFields", "enableProfiling", "isPreview"] },
    ),
    outputSchema: workflowRunOutputSchema,
  }),
  defineProviderAction(service, {
    name: "run_saved_workflow",
    description: "Run a workflow saved in Roboflow using workspace and workflow identifiers with runtime inputs.",
    inputSchema: s.object(
      "Input parameters for running a saved Roboflow workflow.",
      {
        workspace: workspaceField,
        workflowId: workflowIdField,
        inputs: workflowInputsSchema,
        workflowVersionId: workflowVersionIdField,
        useCache: s.boolean("Whether Roboflow should use cached saved workflow definitions."),
        excludedFields: s.array(
          "Output field names to exclude from the workflow response.",
          s.string("One workflow output field name to exclude."),
        ),
        enableProfiling: s.boolean("Whether to request workflow profiler trace data."),
      },
      { optional: ["workflowVersionId", "useCache", "excludedFields", "enableProfiling"] },
    ),
    outputSchema: workflowRunOutputSchema,
  }),
  defineProviderAction(service, {
    name: "validate_workflow",
    description: "Validate a Roboflow workflow specification before running it.",
    inputSchema: s.object("Input parameters for validating a Roboflow workflow specification.", {
      specification: workflowSpecificationSchema,
    }),
    outputSchema: s.object("Roboflow workflow validation result.", {
      status: s.nullableString("Roboflow workflow validation status."),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "describe_workflow_interface",
    description:
      "Describe workflow inputs, outputs, typing hints, and kind schemas for a specification or saved Roboflow workflow.",
    inputSchema: describeWorkflowInterfaceInputSchema,
    outputSchema: workflowInterfaceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_workflow_schema",
    description: "Fetch the Roboflow workflow block JSON schema.",
    inputSchema: s.object("Input parameters for fetching the Roboflow workflow schema.", {}),
    outputSchema: s.object("Roboflow workflow block schema result.", {
      schema: rawPayloadSchema,
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_execution_engine_versions",
    description: "List available Roboflow workflow execution engine versions.",
    inputSchema: s.object("Input parameters for listing execution engine versions.", {}),
    outputSchema: s.object("Roboflow execution engine versions result.", {
      versions: s.array("Execution engine versions returned by Roboflow.", s.string("One execution engine version.")),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_server_info",
    description: "Read Roboflow inference server name, version, and UUID.",
    inputSchema: s.object("Input parameters for reading Roboflow inference server info.", {}),
    outputSchema: s.object("Roboflow inference server info.", {
      name: s.nullableString("The Roboflow inference server name."),
      version: s.nullableString("The Roboflow inference server version."),
      uuid: s.nullableString("The Roboflow inference server UUID."),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_server_metrics",
    description: "Read Prometheus metrics exposed by the Roboflow inference server.",
    inputSchema: s.object("Input parameters for reading Roboflow inference server metrics.", {}),
    outputSchema: s.object("Roboflow inference server metrics text.", {
      metricsText: s.string("Prometheus metrics text returned by the inference server."),
    }),
  }),
];
