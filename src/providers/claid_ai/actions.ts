import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "claid_ai";

const stringOrNullSchema = s.nullable(s.string("A string value."));
const processingImageSchema = s.object(
  "The Claid image metadata object returned for an input or output image.",
  {
    ext: s.string("The file extension returned by Claid."),
    mps: s.number("The megapixel count returned by Claid."),
    mime: s.string("The MIME type returned by Claid."),
    format: s.string("The file format returned by Claid."),
    width: s.integer("The image width in pixels."),
    height: s.integer("The image height in pixels."),
    tmp_url: s.nullable(s.url("The temporary public output URL returned by Claid.")),
    object_key: stringOrNullSchema,
    object_bucket: stringOrNullSchema,
    object_uri: stringOrNullSchema,
    claid_storage_uri: stringOrNullSchema,
  },
  { optional: ["tmp_url", "object_key", "object_bucket", "object_uri", "claid_storage_uri"] },
);
const editResultSchema = s.object(
  "The normalized synchronous Claid edit result.",
  {
    input: processingImageSchema,
    output: processingImageSchema,
    profiling: s.unknown("The optional profiling object returned by Claid."),
  },
  { optional: ["profiling"] },
);
const asyncErrorSchema = s.looseObject("One async processing error returned by Claid.", {
  error: s.string("The error text returned by Claid."),
  created_at: s.string("The timestamp when this error was created."),
  input_object: processingImageSchema,
});
const asyncTaskResultSchema = s.object("The async task result returned by Claid.", {
  input_object: processingImageSchema,
  output_object: processingImageSchema,
});
const taskStatusSchema = s.stringEnum("The Claid async task status.", [
  "ACCEPTED",
  "WAITING",
  "PROCESSING",
  "DONE",
  "ERROR",
  "CANCELLED",
  "PAUSED",
]);
const operationsSchema = s.looseObject("The Claid image operations object.", {
  restorations: s.looseObject("The restorations options sent to Claid."),
  adjustments: s.looseObject("The adjustments options sent to Claid."),
  background: s.looseObject("The background options sent to Claid."),
  resizing: s.looseObject("The resizing options sent to Claid."),
  privacy: s.looseObject("The privacy options sent to Claid."),
  generative: s.looseObject("The generative options sent to Claid."),
});
const outputMetadataSchema = s.object(
  "The output metadata options accepted by Claid.",
  {
    dpi: s.integer("The output DPI value."),
    color_space: s.union(
      [
        s.stringEnum("The simple color space enum.", ["RGB", "CMYK"]),
        s.object("The detailed CMYK color space configuration.", {
          type: s.stringEnum("The color space type.", ["CMYK"]),
          color_profile: s.stringEnum("The CMYK profile to apply.", [
            "ISO_Coated",
            "ISO_Uncoated",
            "USWeb_Coated",
            "USWeb_Uncoated",
          ]),
        }),
      ],
      { description: "The color space configuration sent to Claid." },
    ),
  },
  { optional: ["dpi", "color_space"] },
);
const outputFormatSchema = s.union(
  [
    s.stringEnum("The simple output format.", ["jpeg", "png", "webp", "avif", "tiff"]),
    s.looseObject("The detailed output format configuration.", {
      type: s.string("The output format type."),
      quality: s.integer("The compression quality value.", { minimum: 1, maximum: 100 }),
      compression: s.unknown("The compression configuration."),
      progressive: s.boolean("Whether progressive JPEG output should be used."),
    }),
  ],
  { description: "The output format configuration accepted by Claid." },
);
const outputSchema = s.union(
  [
    s.url("The explicit output destination URL or storage URI."),
    s.object(
      "The detailed output configuration.",
      {
        destination: s.url("The explicit output destination URL or storage URI."),
        metadata: outputMetadataSchema,
        format: outputFormatSchema,
      },
      { optional: ["destination", "metadata", "format"] },
    ),
  ],
  { description: "The output destination or options accepted by Claid." },
);
const editRequestEchoSchema = s.object(
  "The request object echoed by Claid async tasks.",
  {
    input: s.url("The input image URL or storage URI sent to Claid."),
    operations: operationsSchema,
    output: outputSchema,
  },
  { optional: ["output"] },
);
const baseEditInputSchema = s.object(
  "The Claid image edit request payload.",
  {
    input: s.url("The public input image URL or Claid storage URI sent to Claid."),
    operations: operationsSchema,
    output: outputSchema,
  },
  { optional: ["output"] },
);
const taskSchema = s.object(
  "The current Claid async edit task state.",
  {
    id: s.integer("The Claid async task identifier."),
    status: taskStatusSchema,
    result_url: s.nullable(s.url("The Claid result polling URL when returned.")),
    created_at: s.string("The task creation timestamp returned by Claid."),
    request: editRequestEchoSchema,
    errors: s.array("The task errors returned by Claid.", asyncErrorSchema),
    result: s.nullable(asyncTaskResultSchema),
  },
  { optional: ["result_url", "errors", "result"] },
);
const claidEditLifecycle = {
  startActionId: "claid_ai.submit_edit_image",
  statusActionId: "claid_ai.get_edit_task",
};

export const claidAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "edit_image",
    description:
      "Edit one publicly accessible image with Claid's synchronous image editing API and return the processed image metadata.",
    requiredScopes: ["image_editing"],
    providerPermissions: ["image_editing"],
    inputSchema: baseEditInputSchema,
    outputSchema: s.actionOutput({ result: editResultSchema }, "The normalized synchronous Claid edit response."),
  }),
  defineProviderAction(service, {
    name: "submit_edit_image",
    description:
      "Submit one publicly accessible image to Claid's async image editing API and return the task handle for later polling.",
    requiredScopes: ["image_editing"],
    providerPermissions: ["image_editing"],
    followUpActions: ["claid_ai.get_edit_task"],
    asyncLifecycle: claidEditLifecycle,
    inputSchema: baseEditInputSchema,
    outputSchema: s.actionOutput({ task: taskSchema }, "The normalized Claid async submit response."),
  }),
  defineProviderAction(service, {
    name: "get_edit_task",
    description:
      "Poll one Claid async image editing task by ID and return its current status plus the finished result when available.",
    requiredScopes: ["image_editing"],
    providerPermissions: ["image_editing"],
    asyncLifecycle: claidEditLifecycle,
    inputSchema: s.actionInput(
      { taskId: s.integer("The Claid async task identifier.") },
      ["taskId"],
      "The Claid async task to retrieve.",
    ),
    outputSchema: s.actionOutput({ task: taskSchema }, "The normalized Claid async task response."),
  }),
];
