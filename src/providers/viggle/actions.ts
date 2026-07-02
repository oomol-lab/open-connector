import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "viggle";

const limitSchema = s.integer("The maximum number of items to return.", { minimum: 1, maximum: 100 });
const offsetSchema = s.nonNegativeInteger("The zero-based number of items to skip.");
const modelSchema = s.stringEnum("The Viggle model to use for preprocessing or rendering.", [
  "V3_Preview",
  "V4_Preview",
]);
const backgroundModeSchema = s.stringEnum("The background handling mode for the rendered video.", [
  "original",
  "solid",
  "transparent",
]);
const nullableString = s.nullable(s.string("The string value returned by Viggle."));
const nullableNumber = s.nullable(s.number("The numeric value returned by Viggle."));
const nullableInteger = s.nullable(s.integer("The integer value returned by Viggle."));
const nullableDateTime = s.nullable(s.dateTime("The timestamp returned by Viggle."));

const creditBalanceSchema = s.object(
  "The Viggle credit balance response.",
  {
    balance: s.number("The current credit balance."),
    credits: s.number("The credit balance alias returned by Viggle."),
    total_purchased: s.number("The total number of purchased credits."),
    total_used: s.number("The total number of used credits."),
    updated_at: s.dateTime("The timestamp when the balance was last updated."),
  },
  { optional: ["credits", "total_purchased", "total_used", "updated_at"] },
);

const characterStatusSchema = s.stringEnum("The Viggle character processing status.", [
  "pending",
  "processing",
  "ready",
  "failed",
]);
const characterListItemSchema = s.object(
  "A Viggle character list item.",
  {
    id: s.string("The character identifier."),
    name: s.string("The character display name."),
    status: characterStatusSchema,
    created_at: nullableDateTime,
    completed_at: nullableDateTime,
  },
  { optional: ["created_at", "completed_at"] },
);
const characterSchema = s.object(
  "A Viggle character detail response.",
  {
    id: s.string("The character identifier."),
    name: s.string("The character display name."),
    status: characterStatusSchema,
    has_v3_encoding: s.boolean("Whether V3_Preview encoding is available for this character."),
    has_v4_encoding: s.boolean("Whether V4_Preview encoding is available for this character."),
    job_id: nullableString,
    error: nullableString,
    error_message: nullableString,
    thumbnail_url: nullableString,
    credits_used: nullableNumber,
    created_at: nullableDateTime,
    completed_at: nullableDateTime,
  },
  {
    optional: [
      "has_v3_encoding",
      "has_v4_encoding",
      "job_id",
      "error",
      "error_message",
      "thumbnail_url",
      "credits_used",
      "created_at",
      "completed_at",
    ],
  },
);
const characterCreatedSchema = s.object(
  "The response returned after starting character creation.",
  {
    id: s.string("The character identifier."),
    job_id: s.string("The character preprocessing job identifier."),
    status: s.string("The initial character status."),
    credits_reserved: s.number("The number of credits reserved by Viggle."),
    message: s.string("The creation message returned by Viggle."),
  },
  { optional: ["job_id", "credits_reserved", "message"] },
);

const sceneStatusSchema = s.stringEnum("The Viggle scene processing status.", ["pending", "ready", "failed"]);
const sceneListItemSchema = s.object(
  "A Viggle scene list item.",
  {
    id: s.string("The scene identifier."),
    name: s.string("The scene display name."),
    status: sceneStatusSchema,
    duration_seconds: nullableNumber,
    created_at: nullableDateTime,
    completed_at: nullableDateTime,
  },
  { optional: ["duration_seconds", "created_at", "completed_at"] },
);
const sceneSchema = s.object(
  "A Viggle scene detail response.",
  {
    id: s.string("The scene identifier."),
    name: s.string("The scene display name."),
    status: sceneStatusSchema,
    duration_seconds: nullableNumber,
    fps: nullableNumber,
    total_frames: nullableInteger,
    width: nullableInteger,
    height: nullableInteger,
    job_id: nullableString,
    error_message: nullableString,
    credits_used: nullableNumber,
    created_at: nullableDateTime,
    completed_at: nullableDateTime,
  },
  {
    optional: [
      "duration_seconds",
      "fps",
      "total_frames",
      "width",
      "height",
      "job_id",
      "error_message",
      "credits_used",
      "created_at",
      "completed_at",
    ],
  },
);
const sceneImportedSchema = s.object(
  "The response returned after importing a Viggle template.",
  {
    scene_id: s.string("The imported scene identifier."),
    job_id: s.string("The scene import job identifier."),
    status: s.string("The initial scene import status."),
    message: s.string("The import message returned by Viggle."),
    character_uuids: s.array(
      "Tracked person identifiers returned for multi-person templates.",
      s.string("One tracked person identifier."),
    ),
  },
  { optional: ["job_id", "message", "character_uuids"] },
);

const deletedSchema = s.object("The delete response returned by Viggle.", {
  success: s.boolean("Whether Viggle accepted the delete request."),
});
const renderCreatedSchema = s.object(
  "The response returned after creating a render job.",
  {
    job_id: s.string("The render job identifier."),
    status: s.string("The initial render job status."),
    mode: s.string("The render mode selected by Viggle."),
    enqueued_at: s.dateTime("The timestamp when the job was enqueued."),
    poll_url: s.string("The relative URL for polling the job status."),
    status_url: s.string("The relative URL for retrieving the job status."),
  },
  { optional: ["mode", "enqueued_at", "poll_url", "status_url"] },
);
const renderProgressSchema = s.object(
  "The legacy progress object returned by Viggle.",
  {
    completed_chunks: s.integer("The number of completed chunks."),
    total_chunks: s.integer("The total number of chunks."),
    percent: s.number("The completion percentage."),
  },
  { optional: ["completed_chunks", "total_chunks", "percent"] },
);
const renderJobStatusSchema = s.stringEnum("The Viggle render job status.", [
  "queued",
  "processing",
  "complete",
  "failed",
  "cancelled",
]);
const renderJobSchema = s.object(
  "The current Viggle render job status response.",
  {
    job_id: s.string("The render job identifier."),
    status: renderJobStatusSchema,
    mode: nullableString,
    checkpoint: nullableString,
    progress_pct: nullableNumber,
    cdn_url: nullableString,
    mask_cdn_url: nullableString,
    error: nullableString,
    error_code: nullableString,
    error_message: nullableString,
    progress: s.nullable(renderProgressSchema),
    download_url: nullableString,
    chunks: s.array("The compatibility chunks array returned by Viggle.", s.looseObject("A chunk.")),
    created_at: nullableDateTime,
    completed_at: nullableDateTime,
  },
  {
    optional: [
      "mode",
      "checkpoint",
      "progress_pct",
      "cdn_url",
      "mask_cdn_url",
      "error",
      "error_code",
      "error_message",
      "progress",
      "download_url",
      "chunks",
      "created_at",
      "completed_at",
    ],
  },
);

export type ViggleActionName =
  | "get_credit_balance"
  | "create_character"
  | "list_characters"
  | "get_character"
  | "delete_character"
  | "import_template"
  | "list_scenes"
  | "get_scene"
  | "delete_scene"
  | "create_render_job"
  | "get_render_job_status";

export const viggleActions: ProviderActionDefinition<ViggleActionName>[] = [
  defineProviderAction(service, {
    name: "get_credit_balance",
    description: "Get the current Viggle credit balance for the authenticated account.",
    inputSchema: s.object("No input is required for this action.", {}),
    outputSchema: s.object("The Viggle credit balance wrapper.", { credit_balance: creditBalanceSchema }),
  }),
  defineProviderAction(service, {
    name: "create_character",
    description:
      "Create a reusable Viggle character from a publicly accessible image URL and return the preprocessing handle.",
    inputSchema: s.object(
      "Input parameters for creating a Viggle character from an image URL.",
      {
        name: s.nonEmptyString("The display name for the character."),
        image_url: s.url("The publicly accessible character image URL."),
        model: modelSchema,
      },
      { optional: ["model"] },
    ),
    outputSchema: s.object("The created character response wrapper.", { character: characterCreatedSchema }),
    followUpActions: ["viggle.get_character"],
  }),
  defineProviderAction(service, {
    name: "list_characters",
    description: "List Viggle characters for the authenticated account.",
    inputSchema: s.object(
      "Input parameters for listing Viggle characters.",
      { limit: limitSchema, offset: offsetSchema },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.object("The Viggle character list response.", {
      characters: s.array("The characters returned by Viggle.", characterListItemSchema),
      total: s.integer("The total number of characters returned."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_character",
    description: "Get a Viggle character by ID, including preprocessing status.",
    inputSchema: s.object("Input parameters for retrieving a Viggle character.", {
      character_id: s.nonEmptyString("The character identifier returned by Viggle."),
    }),
    outputSchema: s.object("The Viggle character response wrapper.", { character: characterSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_character",
    description: "Soft-delete a Viggle character by ID.",
    inputSchema: s.object("Input parameters for deleting a Viggle character.", {
      character_id: s.nonEmptyString("The character identifier to delete."),
    }),
    outputSchema: deletedSchema,
  }),
  defineProviderAction(service, {
    name: "import_template",
    description: "Import a Viggle template as a reusable scene.",
    inputSchema: s.object(
      "Input parameters for importing a Viggle template.",
      {
        template_uuid: s.nonEmptyString("The Viggle template UUID to import."),
        name: s.nonEmptyString("An optional display name for the imported scene."),
      },
      { optional: ["name"] },
    ),
    outputSchema: s.object("The imported scene response wrapper.", { scene: sceneImportedSchema }),
    followUpActions: ["viggle.get_scene"],
  }),
  defineProviderAction(service, {
    name: "list_scenes",
    description: "List Viggle scenes for the authenticated account.",
    inputSchema: s.object(
      "Input parameters for listing Viggle scenes.",
      { limit: limitSchema, offset: offsetSchema },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.object("The Viggle scene list response.", {
      scenes: s.array("The scenes returned by Viggle.", sceneListItemSchema),
      total: s.integer("The total number of scenes returned."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_scene",
    description: "Get a Viggle scene by ID, including preprocessing status.",
    inputSchema: s.object("Input parameters for retrieving a Viggle scene.", {
      scene_id: s.nonEmptyString("The scene identifier returned by Viggle."),
    }),
    outputSchema: s.object("The Viggle scene response wrapper.", { scene: sceneSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_scene",
    description: "Soft-delete a Viggle scene by ID.",
    inputSchema: s.object("Input parameters for deleting a Viggle scene.", {
      scene_id: s.nonEmptyString("The scene identifier to delete."),
    }),
    outputSchema: deletedSchema,
  }),
  defineProviderAction(service, {
    name: "create_render_job",
    description: "Create a Viggle render job from URL inputs or preprocessed character and scene IDs.",
    inputSchema: s.object(
      "Input parameters for creating a Viggle render job.",
      {
        ref_image_url: s.url("The public character image URL for on-demand rendering."),
        driving_video_url: s.url("The public driving video URL for on-demand rendering."),
        character_id: s.nonEmptyString("The ready character ID for preprocessed rendering."),
        scene_id: s.nonEmptyString("The ready scene ID for preprocessed rendering."),
        model: modelSchema,
        background_mode: backgroundModeSchema,
        bg_color: s.nonEmptyString('The RGB string for solid backgrounds, such as "0,255,0".'),
      },
      {
        optional: [
          "ref_image_url",
          "driving_video_url",
          "character_id",
          "scene_id",
          "model",
          "background_mode",
          "bg_color",
        ],
      },
    ),
    outputSchema: s.object("The created render job response wrapper.", { render: renderCreatedSchema }),
    followUpActions: ["viggle.get_render_job_status"],
  }),
  defineProviderAction(service, {
    name: "get_render_job_status",
    description: "Get a Viggle render job status and return the video URL when rendering is complete.",
    inputSchema: s.object("Input parameters for retrieving a Viggle render job status.", {
      job_id: s.nonEmptyString("The render job identifier returned by Viggle."),
    }),
    outputSchema: s.object("The Viggle render job status response wrapper.", { render: renderJobSchema }),
  }),
];
