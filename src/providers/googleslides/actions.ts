import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { googleSlidesReadScopes, googleSlidesWriteScopes } from "./scopes.ts";

const service = "googleslides";

interface GoogleSlidesActionSource {
  name: GoogleSlidesActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const jsonObject = s.unknownObject("A JSON-like object with arbitrary string keys.");
const jsonObjectArray = s.array("An array of JSON-like objects.", jsonObject);
const dimension = s.requiredObject("A dimension value.", {
  magnitude: s.number("The magnitude of the dimension."),
  unit: s.string("The unit for the dimension, such as PT or EMU."),
});
const size = s.requiredObject("The page size of the presentation.", {
  width: dimension,
  height: dimension,
});
const writeControl = s.object("Write control options for a Slides batch update.", {
  requiredRevisionId: s.string("The revision ID that must match before applying the update."),
});
const pageSummary = s.object("A Google Slides page summary.", {
  objectId: s.string("The object ID of the page."),
  pageType: s.string("The type of the page."),
  pageElements: jsonObjectArray,
  pageProperties: jsonObject,
  slideProperties: jsonObject,
  layoutProperties: jsonObject,
  masterProperties: jsonObject,
  notesProperties: jsonObject,
});
const presentation = s.object("A Google Slides presentation.", {
  presentationId: s.string("The ID of the presentation."),
  title: s.string("The title of the presentation."),
  locale: s.string("The locale of the presentation."),
  revisionId: s.string("The revision ID of the presentation."),
  pageSize: size,
  slides: s.array("The slide pages.", pageSummary),
  layouts: s.array("The layout pages.", pageSummary),
  masters: s.array("The master pages.", pageSummary),
});
const thumbnail = s.requiredObject("A Google Slides page thumbnail.", {
  width: s.integer("The width of the thumbnail in pixels."),
  height: s.integer("The height of the thumbnail in pixels."),
  contentUrl: s.string("The temporary content URL of the thumbnail."),
});
const presentationId = s.string("The presentation ID.");
const presentationName = s.string("The presentation title to search for.");
const pageObjectId = s.string("The page object ID.");
const fields = s.string("The partial-response selector for the Slides API request.");
const presentationReferenceWithFields = s.oneOf(
  [
    s.object(
      {
        presentationId,
        presentationName,
        fields,
      },
      { required: ["presentationId"] },
    ),
    s.object(
      {
        presentationId,
        presentationName,
        fields,
      },
      { required: ["presentationName"] },
    ),
  ],
  { description: "The input payload for this action." },
);
const pageReference = s.object(
  "A presentation page reference.",
  {
    presentationId,
    pageObjectId,
  },
  { required: ["presentationId", "pageObjectId"] },
);
const thumbnailProperties = s.object("Thumbnail generation properties.", {
  mimeType: s.literal("PNG", { description: "The mime type for the thumbnail image." }),
  thumbnailSize: s.stringEnum(["THUMBNAIL_SIZE_UNSPECIFIED", "LARGE", "MEDIUM", "SMALL"], {
    description: "The thumbnail size.",
  }),
});
const pageReferenceWithThumbnail = s.object(
  "The input payload for this action.",
  {
    presentationId,
    pageObjectId,
    thumbnailProperties,
  },
  { required: ["presentationId", "pageObjectId"] },
);
const batchUpdateOutput = s.object("The result of a Slides batch update.", {
  presentationId: s.string("The presentation ID that was updated."),
  replies: jsonObjectArray,
  writeControl,
});
const copyPresentationOutput = s.object(
  "The copied presentation metadata.",
  {
    presentationId: s.string("The ID of the copied presentation."),
    driveFileId: s.string("The Drive file ID of the copied presentation."),
    name: s.string("The title of the copied presentation."),
    mimeType: s.string("The MIME type of the copied file."),
    webViewLink: s.string("The browser URL for the copied presentation."),
    parents: s.stringArray("The parent folders of the copied file."),
  },
  { required: ["presentationId", "driveFileId", "name", "mimeType"] },
);

const actions: GoogleSlidesActionSource[] = [
  action(
    "create_presentation",
    "write",
    "Create a blank Google Slides presentation. Optional locale, page size, and presentation ID values are forwarded when provided.",
    googleSlidesWriteScopes,
    input({
      title: s.string("The title of the presentation. If omitted, Google uses a default title."),
      locale: s.string("The locale of the presentation, such as en-US or ja-JP."),
      pageSize: size,
      presentationId: s.string("The explicit presentation ID to create, when supported."),
    }),
    presentation,
  ),
  action(
    "presentations_get",
    "read",
    "Retrieve a Google Slides presentation by presentation ID, or search Google Drive by exact presentation title first and then fetch the presentation.",
    googleSlidesReadScopes,
    presentationReferenceWithFields,
    presentation,
  ),
  action(
    "presentations_batch_update",
    "destructive",
    "Apply raw Google Slides batchUpdate requests to a presentation.",
    googleSlidesWriteScopes,
    input(
      {
        presentationId,
        requests: jsonObjectArray,
        writeControl,
      },
      ["presentationId", "requests"],
    ),
    batchUpdateOutput,
  ),
  action(
    "presentations_pages_get",
    "read",
    "Retrieve a specific page from a Google Slides presentation, including its page elements and page-specific properties.",
    googleSlidesReadScopes,
    pageReference,
    pageSummary,
  ),
  action(
    "get_page_thumbnail2",
    "read",
    "Generate a thumbnail for a Google Slides page. Returns a temporary content URL plus thumbnail dimensions when Google provides them.",
    googleSlidesReadScopes,
    pageReferenceWithThumbnail,
    thumbnail,
  ),
  action(
    "presentations_pages_get_thumbnail",
    "read",
    "Compatibility alias for get_page_thumbnail2. Generates a thumbnail for a Google Slides page.",
    googleSlidesReadScopes,
    pageReferenceWithThumbnail,
    thumbnail,
  ),
  action(
    "presentations_copy_from_template",
    "write",
    "Copy an existing Google Slides presentation through Google Drive so the new presentation preserves the original themes, masters, and layouts.",
    googleSlidesWriteScopes,
    input(
      {
        templatePresentationId: s.string("The presentation ID of the template presentation."),
        newTitle: s.string("The title for the copied presentation."),
        parentFolderId: s.string("The destination Google Drive folder ID for the copied presentation."),
      },
      ["templatePresentationId"],
    ),
    copyPresentationOutput,
  ),
];

export const googleSlidesActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    ...source,
    providerPermissions: source.requiredScopes,
  }),
);

export type GoogleSlidesActionName =
  | "create_presentation"
  | "presentations_get"
  | "presentations_batch_update"
  | "presentations_pages_get"
  | "get_page_thumbnail2"
  | "presentations_pages_get_thumbnail"
  | "presentations_copy_from_template";

function action(
  name: GoogleSlidesActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  requiredScopes: string[],
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): GoogleSlidesActionSource {
  return {
    name,
    operationType,
    description,
    requiredScopes,
    inputSchema,
    outputSchema,
  };
}

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required);
}
