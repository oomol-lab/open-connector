import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { ActionDefinition, JsonSchema } from "../../core/types.ts";
import type { FusionApiInputField, FusionApiInputFieldKind, FusionApiOperation } from "./operations.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { ocrActions } from "./ocr-actions.ts";
import { fusionApiOperations } from "./operations.ts";

const service = "fusion-api";
const fusionApiActionsById = new Set(fusionApiOperations.map((operation) => `${service}.${operation.actionName}`));

const urlArrayItemSchema = s.url("One URL accepted by Fusion API.");

const completedStateSchema = s.object("The Fusion API task completed.", {
  state: s.literal("completed", { description: "Task state." }),
});
const processingStateSchema = s.object("The Fusion API task is still processing.", {
  state: s.literal("processing", { description: "Task state." }),
  progress: s.number("Task progress reported by Fusion API."),
});
const missingStateSchema = s.object("The Fusion API task failed or was not found.", {
  state: s.stringEnum(["failed", "not_found"], { description: "Task state." }),
  error: s.string("Error message returned by Fusion API."),
});
const taskResultSchema = s.union(
  [
    s.object("The Fusion API task completed with result data.", {
      state: s.literal("completed", { description: "Task state." }),
      data: s.unknown("Task result data returned by Fusion API."),
    }),
    processingStateSchema,
    missingStateSchema,
  ],
  { description: "The normalized Fusion API task result." },
);
const taskStateSchema = s.union([completedStateSchema, processingStateSchema, missingStateSchema], {
  description: "The normalized Fusion API task state.",
});
const submitOutputSchema = s.object("The Fusion API task submission handle.", {
  sessionId: s.nonEmptyString("Task session ID used by result and state actions."),
});
const syncActionOutputSchema = s.unknown("The normalized Fusion API action result.");

export const fusionApiActions: ProviderActionDefinition<string>[] = [
  ...ocrActions,
  ...fusionApiOperations
    .filter((operation) => operation.tag !== "oomol-ocr")
    .map((operation) =>
      defineProviderAction(service, {
        name: operation.actionName,
        operationType: operation.operationType,
        description: operation.description,
        inputSchema: buildInputSchema(operation),
        outputSchema: buildOutputSchema(operation),
        followUpActions: buildFollowUpActions(operation),
        asyncLifecycle: buildAsyncLifecycle(operation),
      }),
    ),
];

function buildInputSchema(operation: FusionApiOperation): JsonSchema {
  if (operation.actionName === "ffmpeg_submit") {
    return s.object(
      "FFmpeg command and input files.",
      {
        inputURLs: s.array(s.url("Input file URL."), {
          description:
            "Ordered HTTPS input URLs. in0.mp4 selects the first URL. Maximum 100 MiB per file and 200 MiB total.",
          minItems: 1,
          maxItems: 4,
        }),
        args: s.array(s.string("One FFmpeg argument."), {
          description:
            "Arguments without the executable or shell syntax. Reference inputs as in<index>.<ext> and put the output filename last. Maximum 16 KiB of text.",
          minItems: 3,
          maxItems: 128,
        }),
        outputFilename: s.stringEnum(
          ["out.mp4", "out.webm", "out.mkv", "out.mp3", "out.wav", "out.gif", "out.png", "out.jpg"],
          { description: "Single output filename. Maximum 200 MiB." },
        ),
      },
      { required: ["inputURLs", "args", "outputFilename"], additionalProperties: false },
    );
  }
  const properties = Object.fromEntries(
    operation.inputFields.map((field) => [field.name, buildFieldSchema(field)] as const),
  );
  const required = operation.inputFields.filter((field) => field.required).map((field) => field.name);
  return s.object("The Fusion API request payload.", properties, {
    required,
    additionalProperties: true,
  });
}

function buildFieldSchema(field: FusionApiInputField): JsonSchema {
  const options = buildFieldOptions(field);

  if (field.enumValues && field.enumValues.length > 0) {
    return s.stringEnum(field.enumValues, options);
  }
  if (isUrlStringField(field)) {
    return s.url(field.description);
  }
  if (isUrlArrayField(field)) {
    return s.array(urlArrayItemSchema, options);
  }

  switch (field.kind satisfies FusionApiInputFieldKind) {
    case "string":
      return s.string(options);
    case "number":
      return s.number({ ...options, minimum: field.minimum, maximum: field.maximum });
    case "integer":
      return s.integer({ ...options, minimum: field.minimum, maximum: field.maximum });
    case "boolean":
      return s.boolean(options);
    case "array":
      return s.array(s.unknown("One array item."), options);
    case "object":
      return s.record(field.description, s.unknown("One object property value."));
    case "unknown":
      return s.unknown(field.description);
  }
}

function buildFieldOptions(field: FusionApiInputField): {
  description: string;
  default?: string | number | boolean;
  format?: string;
} {
  return {
    description: field.description,
    default: field.defaultValue,
    format: field.format,
  };
}

function isUrlStringField(field: FusionApiInputField): boolean {
  return field.kind === "string" && fieldNameLooksLikeUrl(field.name);
}

function isUrlArrayField(field: FusionApiInputField): boolean {
  return field.kind === "array" && fieldNameLooksLikeUrls(field.name);
}

function fieldNameLooksLikeUrl(name: string): boolean {
  return name.toLowerCase().endsWith("url");
}

function fieldNameLooksLikeUrls(name: string): boolean {
  return name.toLowerCase().endsWith("urls");
}

function buildOutputSchema(operation: FusionApiOperation): JsonSchema {
  if (operation.actionName === "ffmpeg_result") {
    return s.union(
      [
        s.object(
          "The FFmpeg task completed.",
          {
            state: s.literal("completed", { description: "Task state." }),
            data: s.object(
              "Output file and media metadata.",
              {
                downloadURL: s.url("Output download URL for reuse in subsequent actions."),
                filename: s.string("Output filename."),
                mimeType: s.string("Output MIME type."),
                bytes: s.integer("Output size in bytes."),
                duration: s.number("Media duration in seconds when available."),
                width: s.number("Video or image width in pixels when available."),
                height: s.number("Video or image height in pixels when available."),
              },
              { required: ["downloadURL", "filename", "mimeType", "bytes"] },
            ),
          },
          { required: ["state", "data"] },
        ),
        processingStateSchema,
        missingStateSchema,
      ],
      { description: "FFmpeg task result." },
    );
  }
  if (operation.actionName.endsWith("_submit")) {
    return submitOutputSchema;
  }
  if (operation.actionName.endsWith("_result")) {
    return taskResultSchema;
  }
  if (operation.actionName.endsWith("_state")) {
    return taskStateSchema;
  }
  return syncActionOutputSchema;
}

function buildFollowUpActions(operation: FusionApiOperation): string[] | undefined {
  if (!operation.actionName.endsWith("_submit")) {
    return undefined;
  }

  const prefix = operation.actionName.slice(0, -"_submit".length);
  const followUps = [`${service}.${prefix}_result`, `${service}.${prefix}_state`].filter((actionId) =>
    fusionApiActionsById.has(actionId),
  );
  return followUps.length > 0 ? followUps : undefined;
}

function buildAsyncLifecycle(operation: FusionApiOperation): ActionDefinition["asyncLifecycle"] {
  if (!operation.actionName.endsWith("_submit")) {
    return undefined;
  }

  const prefix = operation.actionName.slice(0, -"_submit".length);
  const resultActionId = `${service}.${prefix}_result`;
  if (!fusionApiActionsById.has(resultActionId)) {
    return undefined;
  }
  return {
    startActionId: `${service}.${operation.actionName}`,
    statusActionId: resultActionId,
  };
}
