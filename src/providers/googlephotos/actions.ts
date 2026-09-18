import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  photosAppendonlyScope,
  photosEditAppCreatedScope,
  photosPickerReadonlyScope,
  photosReadonlyAppCreatedScope,
} from "./scopes.ts";

const service = "googlephotos";

interface GooglePhotosActionSource {
  name: GooglePhotosActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const anyObject = s.unknownObject("A JSON-like object with arbitrary string keys.");
const nullableString = s.nullableString("A nullable string value.");
const latLng = s.requiredObject("A geographic coordinate.", {
  latitude: s.number("The latitude in decimal degrees."),
  longitude: s.number("The longitude in decimal degrees."),
});
const namedLocation = s.requiredObject("A named geographic location.", {
  locationName: s.nonEmptyString("The name of the location."),
  latlng: latLng,
});
const albumPosition = s.object(
  "The position type within the album.",
  {
    position: s.stringEnum(
      ["POSITION_TYPE_UNSPECIFIED", "FIRST_IN_ALBUM", "LAST_IN_ALBUM", "AFTER_MEDIA_ITEM", "AFTER_ENRICHMENT_ITEM"],
      { description: "The position type within the album." },
    ),
    relativeMediaItemId: s.nonEmptyString("The media item ID to position after when position is AFTER_MEDIA_ITEM."),
    relativeEnrichmentItemId: s.nonEmptyString(
      "The enrichment item ID to position after when position is AFTER_ENRICHMENT_ITEM.",
    ),
  },
  { required: ["position"] },
);
const enrichmentItem = s.object("One Google Photos enrichment variant.", {
  textEnrichment: s.requiredObject("A text enrichment item.", {
    text: s.nonEmptyString("The text content of the enrichment item."),
  }),
  locationEnrichment: s.requiredObject("A location enrichment item.", {
    location: namedLocation,
  }),
  mapEnrichment: s.requiredObject("A map enrichment item showing a route between two locations.", {
    origin: namedLocation,
    destination: namedLocation,
  }),
});
const album = s.object(
  "A Google Photos album.",
  {
    id: s.string("The unique identifier for the album."),
    title: s.string("The title of the album."),
    productUrl: nullableString,
    mediaItemsCount: nullableString,
    coverPhotoBaseUrl: nullableString,
    coverPhotoMediaItemId: nullableString,
    isWriteable: s.boolean("Whether the album is writable by the current user."),
    shareInfo: s.nullable(anyObject),
  },
  {
    required: [
      "id",
      "title",
      "productUrl",
      "mediaItemsCount",
      "coverPhotoBaseUrl",
      "coverPhotoMediaItemId",
      "shareInfo",
    ],
  },
);
const mediaMetadata = s.requiredObject("Google Photos media metadata.", {
  creationTime: nullableString,
  width: nullableString,
  height: nullableString,
  photo: anyObject,
  video: anyObject,
});
const mediaItem = s.requiredObject("A Google Photos media item.", {
  id: s.string("The unique identifier for the media item."),
  description: nullableString,
  productUrl: nullableString,
  baseUrl: nullableString,
  mimeType: nullableString,
  filename: nullableString,
  mediaMetadata,
  contributorInfo: s.nullable(anyObject),
});
const pickerPollingConfig = s.requiredObject("Polling guidance for checking picker session readiness.", {
  pollInterval: s.string("The recommended polling interval duration."),
  timeoutIn: s.string("The recommended polling timeout duration."),
});
const pickerSessionState = {
  id: s.string("The unique identifier for the picker session."),
  expireTime: s.string("The time at which the picker session expires."),
  mediaItemsSet: s.boolean("Whether the user has finished selecting media items for this session."),
  pollingConfig: pickerPollingConfig,
};
const pickerSession = s.object(
  "A Google Photos Picker session state.",
  {
    ...pickerSessionState,
    pickerUri: s.string("The Google Photos Picker URI for this session."),
  },
  { required: ["id", "expireTime", "mediaItemsSet", "pickerUri"] },
);
const pickerSessionStatus = s.object(
  "A Google Photos Picker session.",
  {
    ...pickerSessionState,
    pickerUri: s.string("The Google Photos Picker URI for this session."),
  },
  { required: ["id", "expireTime", "mediaItemsSet"] },
);
const pickedMediaType = s.stringEnum(["TYPE_UNSPECIFIED", "PHOTO", "VIDEO"], {
  description: "The type of the picked media item.",
});
const pickedVideoProcessingStatus = s.stringEnum(["UNSPECIFIED", "PROCESSING", "READY", "FAILED"], {
  description: "The video processing status returned by Google Photos Picker.",
});
const pickedMediaFileMetadata = s.looseObject("Metadata for the picked media file.", {
  videoMetadata: s.looseObject("Video-specific metadata returned by Google Photos Picker.", {
    processingStatus: pickedVideoProcessingStatus,
  }),
});
const pickedMediaItem = s.requiredObject(
  "A media item selected from the user's Google Photos library through Picker.",
  {
    id: s.string("The unique identifier for the picked media item."),
    createTime: s.string("The creation time of the picked media item."),
    type: pickedMediaType,
    baseUrl: s.string("The temporary download base URL for the picked media item."),
    mimeType: s.string("The MIME type of the picked media item."),
    filename: s.string("The filename of the picked media item."),
    mediaFileMetadata: pickedMediaFileMetadata,
  },
);
const mediaFileInput = s.object("One media file input to upload.", {
  url: s.url("The URL of the media file to upload."),
  contentBase64: s.nonEmptyString("The base64-encoded content of the media file to upload."),
  fileName: s.nonEmptyString("The filename for the uploaded media item."),
  mimeType: s.nonEmptyString("The MIME type of the media file."),
  description: s.string({
    maxLength: 1000,
    description: "A description for the uploaded media item.",
  }),
});
const uploadMediaInput = s.object("The input payload for uploading one media item.", {
  url: s.url("The URL of the media file to upload."),
  contentBase64: s.nonEmptyString("The base64-encoded content of the media file to upload."),
  fileName: s.nonEmptyString("The filename for the uploaded media item."),
  mimeType: s.nonEmptyString("The MIME type of the media file."),
  description: s.string({
    maxLength: 1000,
    description: "A description for the uploaded media item.",
  }),
});
const transitDownloadOutput = {
  fileName: s.string("The filename of the downloaded media item."),
  mimeType: s.string("The MIME type of the downloaded media item."),
  transitUrl: s.string("The local transit download URL for the media item."),
  fileId: s.string("The local transit file identifier."),
  downloadUrl: s.string("The local transit download URL for the media item."),
  sizeBytes: s.integer("The downloaded file size in bytes."),
};

const actions: GooglePhotosActionSource[] = [
  action(
    "list_albums",
    "read",
    "List Google Photos albums visible to the current application connection. If you need the user to choose from their existing Google Photos library, use the Picker actions instead.",
    [photosReadonlyAppCreatedScope],
    input({
      pageSize: s.integer("The maximum number of albums to return per page (1-50).", { minimum: 1, maximum: 50 }),
      pageToken: s.string("A page token to retrieve the next page of results."),
    }),
    output(
      {
        albums: s.array("The list of albums.", album),
        nextPageToken: s.nullableString("A token to retrieve the next page of results, if any."),
        message: s.string(
          "An optional hint explaining that empty results may reflect the Google Photos Library API app-created data boundary.",
        ),
      },
      ["albums", "nextPageToken"],
    ),
  ),
  action(
    "get_album",
    "read",
    "Fetch one Google Photos album by ID.",
    [photosReadonlyAppCreatedScope],
    input(
      {
        albumId: s.nonEmptyString("The ID of the album to fetch."),
      },
      ["albumId"],
    ),
    output({ album }),
  ),
  action(
    "create_album",
    "write",
    "Create a Google Photos album.",
    [photosAppendonlyScope],
    input(
      {
        title: s.string({ maxLength: 500, description: "The title for the new album (maximum 500 characters)." }),
      },
      ["title"],
    ),
    output({ album }),
  ),
  action(
    "update_album",
    "write",
    "Update a Google Photos album title or cover photo.",
    [photosEditAppCreatedScope],
    input(
      {
        albumId: s.nonEmptyString("The ID of the album to update."),
        title: s.string({ maxLength: 500, description: "The new title for the album (maximum 500 characters)." }),
        coverPhotoMediaItemId: s.nonEmptyString("The media item ID to set as the new album cover photo."),
      },
      ["albumId"],
    ),
    output({ album }),
  ),
  action(
    "add_enrichment",
    "write",
    "Add an enrichment item to a Google Photos album.",
    [photosAppendonlyScope],
    input(
      {
        albumId: s.nonEmptyString("The ID of the album to add the enrichment to."),
        albumPosition,
        newEnrichmentItem: enrichmentItem,
      },
      ["albumId", "albumPosition", "newEnrichmentItem"],
    ),
    output(
      {
        albumId: s.string("The ID of the album to which the enrichment was added."),
        enrichmentItem: anyObject,
      },
      ["albumId"],
    ),
  ),
  action(
    "list_media_items",
    "read",
    "List Google Photos Library API media items created by this application.",
    [photosReadonlyAppCreatedScope],
    input({
      pageSize: s.integer("The maximum number of media items to return per page (1-100).", {
        minimum: 1,
        maximum: 100,
      }),
      pageToken: s.string("A page token to retrieve the next page of results."),
    }),
    output({
      mediaItems: s.array("The list of media items.", mediaItem),
      nextPageToken: s.nullableString("A token to retrieve the next page of results, if any."),
    }),
  ),
  action(
    "search_media_items",
    "read",
    "Search Google Photos Library API media items created by this application.",
    [photosReadonlyAppCreatedScope],
    input({
      albumId: s.nonEmptyString("The ID of the album to search within."),
      pageSize: s.integer("The maximum number of media items to return per page (1-100).", {
        minimum: 1,
        maximum: 100,
      }),
      pageToken: s.string("A page token to retrieve the next page of results."),
      orderBy: s.string("The sort order for the results."),
      filters: anyObject,
    }),
    output({
      mediaItems: s.array("The list of matching media items.", mediaItem),
      nextPageToken: s.nullableString("A token to retrieve the next page of results, if any."),
    }),
  ),
  action(
    "batch_get_media_items",
    "read",
    "Fetch multiple Google Photos media items by ID.",
    [photosReadonlyAppCreatedScope],
    input(
      {
        mediaItemIds: s.stringArray("The list of media item IDs to fetch (1-50).", { minItems: 1, maxItems: 50 }),
      },
      ["mediaItemIds"],
    ),
    output({
      mediaItemResults: s.array("The list of media item results returned by the API.", anyObject),
    }),
  ),
  action(
    "get_media_item_download",
    "read",
    "Download a Google Photos Library API media item created by this application through local file transit.",
    [photosReadonlyAppCreatedScope],
    input(
      {
        mediaItemId: s.nonEmptyString("The ID of the media item to download."),
      },
      ["mediaItemId"],
    ),
    output({
      mediaItemId: s.string("The ID of the downloaded media item."),
      ...transitDownloadOutput,
    }),
  ),
  action(
    "upload_media",
    "write",
    "Upload one media item into Google Photos from a URL or base64 payload.",
    [photosAppendonlyScope],
    uploadMediaInput,
    output({
      mediaItem,
    }),
  ),
  action(
    "batch_create_media_items",
    "write",
    "Batch create Google Photos media items from URLs or base64 payloads.",
    [photosAppendonlyScope],
    input({
      urls: s.array(
        "A list of URLs of media files to upload (maximum 50).",
        s.url("The URL of a media file to upload."),
        {
          maxItems: 50,
        },
      ),
      mediaFiles: s.array("A list of media file inputs to upload (maximum 50).", mediaFileInput, { maxItems: 50 }),
      albumId: s.nonEmptyString("The ID of the album to add the media items to."),
      albumPosition,
    }),
    output({
      newMediaItemResults: s.array("The list of newly created media item results returned by the API.", anyObject),
    }),
  ),
  action(
    "batch_add_media_items",
    "write",
    "Add existing Google Photos media items to an album.",
    [photosAppendonlyScope],
    input(
      {
        albumId: s.nonEmptyString("The ID of the album to add the media items to."),
        mediaItemIds: s.stringArray("The list of media item IDs to add to the album (1-50).", {
          minItems: 1,
          maxItems: 50,
        }),
      },
      ["albumId", "mediaItemIds"],
    ),
    output({
      albumId: s.string("The ID of the album to which the items were added."),
      mediaItemsAdded: s.integer("The number of media items successfully added."),
      message: s.string("A human-readable summary of the operation result."),
    }),
  ),
  action(
    "update_media_item",
    "write",
    "Update a Google Photos media item description.",
    [photosEditAppCreatedScope],
    input(
      {
        mediaItemId: s.nonEmptyString("The ID of the media item to update."),
        description: s.string({
          maxLength: 1000,
          description: "The new description for the media item (maximum 1000 characters).",
        }),
      },
      ["mediaItemId", "description"],
    ),
    output({ mediaItem }),
  ),
  action(
    "create_picker_session",
    "write",
    "Create a Google Photos Picker session for selecting items from the user's library.",
    [photosPickerReadonlyScope],
    input({
      maxItemCount: s.positiveInteger("The maximum number of media items the user can pick."),
    }),
    output({ session: pickerSession }),
  ),
  action(
    "get_picker_session",
    "read",
    "Get the current state of a Google Photos Picker session.",
    [photosPickerReadonlyScope],
    input(
      {
        sessionId: s.nonEmptyString("The ID of the picker session."),
      },
      ["sessionId"],
    ),
    output({ session: pickerSessionStatus }),
  ),
  action(
    "delete_picker_session",
    "destructive",
    "Delete a Google Photos Picker session.",
    [photosPickerReadonlyScope],
    input(
      {
        sessionId: s.nonEmptyString("The ID of the picker session to delete."),
      },
      ["sessionId"],
    ),
    output({
      sessionId: s.string("The deleted picker session ID."),
      deleted: s.literal(true, { description: "Whether the picker session was deleted." }),
    }),
  ),
  action(
    "list_picked_media_items",
    "read",
    "List media items selected from the user's Google Photos library in a picker session.",
    [photosPickerReadonlyScope],
    input(
      {
        sessionId: s.nonEmptyString("The ID of the picker session."),
        pageSize: s.positiveInteger("The maximum number of picked media items to return per page."),
        pageToken: s.string("A page token to retrieve the next page of picked media items."),
      },
      ["sessionId"],
    ),
    output({
      mediaItems: s.array("The picked media items selected in this picker session.", pickedMediaItem),
      nextPageToken: s.nullableString("A token to retrieve the next page of picked media items, if any."),
    }),
  ),
  action(
    "get_picked_media_item_download",
    "read",
    "Download a picked Google Photos media item through local file transit using its trusted temporary base URL.",
    [photosPickerReadonlyScope],
    input(
      {
        baseUrl: s.string("The temporary download base URL for the picked media item."),
        mimeType: s.string("The MIME type of the picked media item."),
        filename: s.string("The filename of the picked media item."),
        type: pickedMediaType,
        mediaFileMetadata: pickedMediaFileMetadata,
      },
      ["baseUrl", "mimeType", "filename", "type"],
    ),
    output(transitDownloadOutput),
  ),
];

export const googlePhotosActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    ...source,
    providerPermissions: source.requiredScopes,
  }),
);

export type GooglePhotosActionName =
  | "list_albums"
  | "get_album"
  | "create_album"
  | "update_album"
  | "add_enrichment"
  | "list_media_items"
  | "search_media_items"
  | "batch_get_media_items"
  | "get_media_item_download"
  | "upload_media"
  | "batch_create_media_items"
  | "batch_add_media_items"
  | "update_media_item"
  | "create_picker_session"
  | "get_picker_session"
  | "delete_picker_session"
  | "list_picked_media_items"
  | "get_picked_media_item_download";

function action(
  name: GooglePhotosActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  requiredScopes: string[],
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): GooglePhotosActionSource {
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

function output(properties: Record<string, JsonSchema>, required: string[] = Object.keys(properties)): JsonSchema {
  return s.actionOutput(properties, "Action output.", required);
}
