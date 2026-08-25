import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "happy_scribe";

const nonEmptyString = (description: string) => s.nonWhitespaceString(description);

const rawObjectSchema = s.looseObject("The raw Happy Scribe response object.");
const orderIdSchema = nonEmptyString("The unique identifier of the Happy Scribe order.");
const transcriptionIdSchema = nonEmptyString("The unique identifier of the Happy Scribe transcription.");
const exportIdSchema = nonEmptyString("The unique identifier of the Happy Scribe export.");
const organizationIdSchema = s.integer("The Happy Scribe organization identifier.", {
  minimum: 1,
});

const orderSchema = s.looseObject("A Happy Scribe order and its current processing state.", {
  id: s.nullable(s.string("The unique identifier of the order.")),
  state: s.nullable(s.string("The current processing state of the order.")),
});

const transcriptionSchema = s.looseObject("A Happy Scribe transcription record.", {
  id: s.nullable(s.string("The unique identifier of the transcription.")),
  name: s.nullable(s.string("The display name of the transcription.")),
  state: s.nullable(s.string("The current processing state of the transcription.")),
  language: s.nullable(s.string("The language code of the transcription.")),
});

const exportSchema = s.looseObject("A Happy Scribe export and its current state.", {
  id: s.nullable(s.string("The unique identifier of the export.")),
  state: s.nullable(s.string("The current processing state of the export.")),
  format: s.nullable(s.string("The requested export format.")),
  download_link: s.nullable(s.string("The temporary download URL when the export is ready.")),
});

const organizationSchema = s.looseObject("A Happy Scribe organization.", {
  id: s.nullable(s.integer("The unique identifier of the organization.")),
  name: s.nullable(s.string("The display name of the organization.")),
  role: s.nullable(s.string("The authenticated user's role in the organization.")),
});

const createTranscriptionOrderAction = defineProviderAction(service, {
  name: "create_transcription_order",
  description: "Submit a transcription or subtitling order from a public media URL.",
  requiredScopes: [],
  asyncLifecycle: {
    startActionId: "happy_scribe.create_transcription_order",
    statusActionId: "happy_scribe.get_order",
  },
  inputSchema: s.object(
    "The input payload for creating a Happy Scribe transcription order.",
    {
      mediaUrl: s.url("The public URL of the audio or video file to process."),
      language: nonEmptyString("The spoken language code, such as en-US or es."),
      service: s.stringEnum("The transcription service level.", ["auto", "pro"]),
      organizationId: organizationIdSchema,
      name: nonEmptyString("The display name for the order."),
      folder: nonEmptyString("The destination folder name."),
      confirm: s.boolean("Whether to submit the order for processing immediately."),
      isSubtitle: s.boolean("Whether the order should produce subtitles."),
      webhookUrl: s.url("The URL Happy Scribe should notify when processing changes."),
      tags: s.array("The tags to attach to the transcription.", nonEmptyString("One tag.")),
    },
    { optional: ["name", "folder", "confirm", "isSubtitle", "webhookUrl", "tags"] },
  ),
  outputSchema: s.object("The response returned when creating a transcription order.", {
    order: orderSchema,
  }),
});

const createTranslationOrderAction = defineProviderAction(service, {
  name: "create_translation_order",
  description: "Submit a translation order for an existing Happy Scribe transcription.",
  requiredScopes: [],
  asyncLifecycle: { startActionId: "happy_scribe.create_translation_order", statusActionId: "happy_scribe.get_order" },
  inputSchema: s.object(
    "The input payload for creating a Happy Scribe translation order.",
    {
      sourceTranscriptionId: transcriptionIdSchema,
      targetLanguages: s.array(
        "The target language codes for the translation.",
        nonEmptyString("One target language code."),
        { minItems: 1 },
      ),
      service: s.stringEnum("The translation service level.", ["auto", "pro"]),
      confirm: s.boolean("Whether to submit the order for processing immediately."),
      webhookUrl: s.url("The URL Happy Scribe should notify when processing changes."),
    },
    { optional: ["confirm", "webhookUrl"] },
  ),
  outputSchema: s.object("The response returned when creating a translation order.", {
    order: orderSchema,
  }),
});

const getOrderAction = defineProviderAction(service, {
  name: "get_order",
  description: "Get the current state and details of a Happy Scribe order.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving a Happy Scribe order.", {
    orderId: orderIdSchema,
  }),
  outputSchema: s.object("The response returned when retrieving a Happy Scribe order.", {
    order: orderSchema,
  }),
});

const confirmOrderAction = defineProviderAction(service, {
  name: "confirm_order",
  description: "Confirm a previously created Happy Scribe order so processing can begin.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for confirming a Happy Scribe order.", {
    orderId: orderIdSchema,
  }),
  outputSchema: s.object("The response returned when confirming a Happy Scribe order.", {
    confirmed: s.boolean("Whether Happy Scribe accepted the order confirmation."),
    orderId: orderIdSchema,
  }),
});

const listOrganizationsAction = defineProviderAction(service, {
  name: "list_organizations",
  description: "List the Happy Scribe organizations available to the current API key.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing Happy Scribe organizations.", {}),
  outputSchema: s.object("The response returned when listing Happy Scribe organizations.", {
    organizations: s.array("The organizations available to the API key.", organizationSchema),
    raw: rawObjectSchema,
  }),
});

const listTranscriptionsAction = defineProviderAction(service, {
  name: "list_transcriptions",
  description: "List transcriptions in a Happy Scribe organization.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Happy Scribe transcriptions.",
    {
      organizationId: organizationIdSchema,
      page: s.integer("The results page number, starting from zero.", { minimum: 0 }),
      perPage: s.integer("The number of transcriptions to return per page.", {
        minimum: 1,
        maximum: 100,
      }),
      folderId: s.integer("The folder identifier used to filter transcriptions.", { minimum: 1 }),
      tags: s.array("The tags used to filter transcriptions.", nonEmptyString("One tag.")),
    },
    { optional: ["page", "perPage", "folderId", "tags"] },
  ),
  outputSchema: s.object("The response returned when listing Happy Scribe transcriptions.", {
    transcriptions: s.array("The transcription records returned by Happy Scribe.", transcriptionSchema),
    raw: rawObjectSchema,
  }),
});

const getTranscriptionAction = defineProviderAction(service, {
  name: "get_transcription",
  description: "Get one Happy Scribe transcription by ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving a Happy Scribe transcription.", {
    transcriptionId: transcriptionIdSchema,
  }),
  outputSchema: s.object("The response returned when retrieving a transcription.", {
    transcription: transcriptionSchema,
  }),
});

const updateTranscriptionAction = defineProviderAction(service, {
  name: "update_transcription",
  description: "Update editable fields on a Happy Scribe transcription.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for updating a Happy Scribe transcription.",
    {
      transcriptionId: transcriptionIdSchema,
      organizationId: organizationIdSchema,
      name: nonEmptyString("The new transcription display name."),
      sharingEnabled: s.boolean("Whether anyone with the editor URL can access the transcription."),
      folderId: s.integer("The destination folder identifier in the same organization.", {
        minimum: 1,
      }),
    },
    { optional: ["name", "sharingEnabled", "folderId"] },
  ),
  outputSchema: s.object("The response returned when updating a transcription.", {
    transcription: transcriptionSchema,
  }),
});

const deleteTranscriptionAction = defineProviderAction(service, {
  name: "delete_transcription",
  description: "Delete one Happy Scribe transcription by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for deleting a Happy Scribe transcription.",
    {
      transcriptionId: transcriptionIdSchema,
      permanent: s.boolean("Whether to delete irreversibly instead of moving the transcription to Trash."),
    },
    { optional: ["permanent"] },
  ),
  outputSchema: s.object("The response returned when deleting a transcription.", {
    deleted: s.boolean("Whether Happy Scribe accepted the deletion."),
    transcriptionId: transcriptionIdSchema,
  }),
});

const createExportAction = defineProviderAction(service, {
  name: "create_export",
  description: "Create an asynchronous export for one or more Happy Scribe transcriptions.",
  requiredScopes: [],
  asyncLifecycle: { startActionId: "happy_scribe.create_export", statusActionId: "happy_scribe.get_export" },
  inputSchema: s.object(
    "The input payload for creating a Happy Scribe export.",
    {
      transcriptionIds: s.array("The transcription identifiers included in the export.", transcriptionIdSchema, {
        minItems: 1,
      }),
      format: nonEmptyString("The export format, such as txt, srt, vtt, json, csv, or docx."),
      showTimestamps: s.boolean("Whether to include timestamps in the export."),
      showSpeakers: s.boolean("Whether to include speaker names in the export."),
      showComments: s.boolean("Whether to include comments in the export."),
      showHighlights: s.boolean("Whether to include highlights in the export."),
    },
    { optional: ["showTimestamps", "showSpeakers", "showComments", "showHighlights"] },
  ),
  outputSchema: s.object("The response returned when creating a Happy Scribe export.", {
    export: exportSchema,
  }),
});

const getExportAction = defineProviderAction(service, {
  name: "get_export",
  description: "Get the state and download link of a Happy Scribe export.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving a Happy Scribe export.", {
    exportId: exportIdSchema,
  }),
  outputSchema: s.object("The response returned when retrieving a Happy Scribe export.", {
    export: exportSchema,
  }),
});

export const happyScribeActions: readonly ActionDefinition[] = [
  listOrganizationsAction,
  createTranscriptionOrderAction,
  createTranslationOrderAction,
  getOrderAction,
  confirmOrderAction,
  listTranscriptionsAction,
  getTranscriptionAction,
  updateTranscriptionAction,
  deleteTranscriptionAction,
  createExportAction,
  getExportAction,
];
