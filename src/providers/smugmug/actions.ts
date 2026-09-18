import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "smugmug";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const rawObject = (description: string) => s.looseObject({}, { description });
const uriLinkSchema = s.looseObject(
  {
    Uri: s.string("The API URI for the related resource."),
    Locator: s.string("The locator name of the related resource."),
    LocatorType: s.string("Whether the related resource is an object or a list."),
    UriDescription: s.string("The human-readable description of the related resource."),
    EndpointType: s.string("The endpoint type of the related resource."),
  },
  { description: "A SmugMug related resource reference." },
);
const urisSchema = s.record(
  "The related SmugMug resource URIs keyed by relation name.",
  s.anyOf([s.string("The API URI for the related resource."), uriLinkSchema]),
);
const pagesSchema = s.looseObject(
  {
    count: s.integer("The number of items returned in the current page."),
    start: s.integer("The 1-based start index of the current page."),
    total: s.integer("The total number of available items."),
    firstPage: s.string("The API URI for the first page of results."),
    prevPage: s.string("The API URI for the previous page of results."),
    nextPage: s.string("The API URI for the next page of results."),
    lastPage: s.string("The API URI for the last page of results."),
    requestedCount: s.integer("The number of items that were requested."),
  },
  { description: "The SmugMug pagination metadata." },
);
const userSchema = rawObject("A SmugMug user object.");
const userProfileSchema = rawObject("A SmugMug user profile object.");
const nodeSchema = rawObject("A SmugMug node object.");
const folderSchema = rawObject("A SmugMug folder object.");
const albumSchema = rawObject("A SmugMug album object.");
const imageSchema = rawObject("A SmugMug image object.");
const imageMetadataSchema = rawObject("A SmugMug image metadata object.");
const imageSizeDetailsSchema = rawObject("The full SmugMug image size details payload.");
const imageSizeSchema = s.looseObject(
  {
    name: s.string("The SmugMug size bucket name."),
    url: s.string("The direct URL for this image size."),
    width: s.integer("The width in pixels."),
    height: s.integer("The height in pixels."),
    size: s.integer("The asset size in bytes."),
    ext: s.string("The file extension for this image size."),
    md5: s.string("The MD5 checksum for this image size."),
  },
  { description: "A summarized SmugMug image size entry." },
);

const nicknameInput = s.actionInput(
  {
    nickname: nonEmptyString("The SmugMug nickname of the user."),
  },
  ["nickname"],
);
const nodeIdInput = s.actionInput(
  {
    nodeId: nonEmptyString("The SmugMug node ID."),
  },
  ["nodeId"],
);
const albumKeyInput = s.actionInput(
  {
    albumKey: nonEmptyString("The SmugMug album key."),
  },
  ["albumKey"],
);
const imageKeyInput = s.actionInput(
  {
    imageKey: nonEmptyString("The SmugMug image key."),
  },
  ["imageKey"],
);
const paginationFields = {
  count: s.integer("The number of results to return per page.", { minimum: 1, maximum: 100 }),
  start: s.integer("The 1-based start index for pagination.", { minimum: 1 }),
};
const folderLookupInput = s.object(
  {
    nickname: nonEmptyString("The SmugMug nickname of the user."),
    folderPath: s.string("The folder path relative to the user's root folder."),
    folderId: s.string("Optional folder ID to assert against the resolved folder."),
  },
  {
    required: ["nickname"],
    optional: ["folderPath", "folderId"],
    description: "Input for resolving a user folder by path.",
  },
);
const albumImageInput = s.actionInput(
  {
    albumKey: nonEmptyString("The SmugMug album key."),
    imageKey: nonEmptyString("The SmugMug image key."),
  },
  ["albumKey", "imageKey"],
);

function action(
  name: SmugmugActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, { name, operationType, description, inputSchema, outputSchema });
}

const listOutput = (key: string, itemSchema: JsonSchema, description: string) =>
  s.actionOutput(
    {
      [key]: s.array(description, itemSchema),
      pages: pagesSchema,
    },
    `A paged SmugMug ${key} response.`,
  );

export type SmugmugActionName =
  | "get_user"
  | "get_user_profile"
  | "get_user_features"
  | "get_user_root_node"
  | "get_user_bio_image"
  | "get_user_featured_albums"
  | "search_user_content"
  | "get_folder_by_user_path"
  | "get_folder_details"
  | "get_folder_subfolders"
  | "get_folder_albums"
  | "list_child_nodes"
  | "get_node_parent"
  | "get_node_parents"
  | "get_node_highlight_image"
  | "get_album"
  | "get_album_highlight_image"
  | "get_album_images"
  | "get_album_image"
  | "get_image"
  | "get_image_metadata"
  | "get_image_sizes"
  | "get_image_size_details";

export const smugmugActions: ActionDefinition[] = [
  action(
    "get_user",
    "read",
    "Retrieve a SmugMug user by nickname.",
    nicknameInput,
    s.actionOutput({ user: userSchema }),
  ),
  action(
    "get_user_profile",
    "read",
    "Retrieve the public profile for a SmugMug user.",
    nicknameInput,
    s.actionOutput({ userProfile: userProfileSchema }),
  ),
  action(
    "get_user_features",
    "read",
    "Retrieve the feature and entitlement map for a SmugMug user.",
    nicknameInput,
    s.actionOutput({ features: rawObject("The SmugMug user feature map.") }),
  ),
  action(
    "get_user_root_node",
    "read",
    "Retrieve the root node for a SmugMug user.",
    nicknameInput,
    s.actionOutput({ rootNode: nodeSchema }),
  ),
  action(
    "get_user_bio_image",
    "read",
    "Retrieve the biography image for a SmugMug user.",
    nicknameInput,
    s.actionOutput({ bioImage: imageSchema }),
  ),
  action(
    "get_user_featured_albums",
    "read",
    "List featured albums for a SmugMug user.",
    nicknameInput,
    listOutput("featuredAlbums", albumSchema, "Featured albums returned by SmugMug."),
  ),
  action(
    "search_user_content",
    "read",
    "Search images in a SmugMug user's public content.",
    s.object(
      {
        nickname: nonEmptyString("The SmugMug nickname of the user."),
        query: nonEmptyString("The search query."),
        order: s.stringEnum("The SmugMug search sort order.", ["LastUpdated", "DateAdded", "DateTaken"]),
        ...paginationFields,
      },
      {
        required: ["nickname", "query"],
        optional: ["order", "count", "start"],
        description: "Input for searching SmugMug user content.",
      },
    ),
    listOutput("images", imageSchema, "Image search results."),
  ),
  action(
    "get_folder_by_user_path",
    "read",
    "Resolve a SmugMug folder by user nickname and path.",
    folderLookupInput,
    s.actionOutput({ folder: folderSchema }),
  ),
  action(
    "get_folder_details",
    "read",
    "Retrieve details for a SmugMug folder node.",
    nodeIdInput,
    s.actionOutput({ folder: folderSchema }),
  ),
  action(
    "get_folder_subfolders",
    "read",
    "List subfolders below a SmugMug folder path.",
    folderLookupInput,
    listOutput("folders", folderSchema, "Subfolders returned by SmugMug."),
  ),
  action(
    "get_folder_albums",
    "read",
    "List albums below a SmugMug folder path.",
    folderLookupInput,
    listOutput("albums", albumSchema, "Albums returned by SmugMug."),
  ),
  action(
    "list_child_nodes",
    "read",
    "List child nodes below a SmugMug node.",
    s.object(
      { nodeId: nonEmptyString("The SmugMug node ID."), ...paginationFields },
      { required: ["nodeId"], optional: ["count", "start"], description: "Input for listing child nodes." },
    ),
    listOutput("nodes", nodeSchema, "Child nodes returned by SmugMug."),
  ),
  action(
    "get_node_parent",
    "read",
    "Retrieve the parent node for a SmugMug node.",
    nodeIdInput,
    s.actionOutput({ parentNode: nodeSchema }),
  ),
  action(
    "get_node_parents",
    "read",
    "List all parent nodes for a SmugMug node.",
    nodeIdInput,
    listOutput("parentNodes", nodeSchema, "Parent nodes returned by SmugMug."),
  ),
  action(
    "get_node_highlight_image",
    "read",
    "Retrieve the highlight image for a SmugMug node.",
    nodeIdInput,
    s.actionOutput({ highlightImage: imageSchema }),
  ),
  action(
    "get_album",
    "read",
    "Retrieve a SmugMug album by key.",
    albumKeyInput,
    s.actionOutput({ album: albumSchema }),
  ),
  action(
    "get_album_highlight_image",
    "read",
    "Retrieve the highlight image for a SmugMug album.",
    albumKeyInput,
    s.actionOutput({ highlightImage: imageSchema }),
  ),
  action(
    "get_album_images",
    "read",
    "List images in a SmugMug album.",
    s.object(
      { albumKey: nonEmptyString("The SmugMug album key."), ...paginationFields },
      { required: ["albumKey"], optional: ["count", "start"], description: "Input for listing album images." },
    ),
    listOutput("albumImages", imageSchema, "Album images returned by SmugMug."),
  ),
  action(
    "get_album_image",
    "read",
    "Retrieve a SmugMug album image relationship.",
    albumImageInput,
    s.actionOutput({ albumImage: imageSchema }),
  ),
  action(
    "get_image",
    "read",
    "Retrieve a SmugMug image by key.",
    imageKeyInput,
    s.actionOutput({ image: imageSchema }),
  ),
  action(
    "get_image_metadata",
    "read",
    "Retrieve metadata for a SmugMug image.",
    imageKeyInput,
    s.actionOutput({ imageMetadata: imageMetadataSchema }),
  ),
  action(
    "get_image_sizes",
    "read",
    "List direct image size URLs for a SmugMug image.",
    imageKeyInput,
    s.actionOutput({
      usableSizes: s.stringArray("The usable SmugMug image size buckets."),
      sizes: s.array("Summarized image size entries.", imageSizeSchema),
    }),
  ),
  action(
    "get_image_size_details",
    "read",
    "Retrieve full image size details for a SmugMug image.",
    imageKeyInput,
    s.actionOutput({ imageSizeDetails: imageSizeDetailsSchema }),
  ),
];

void urisSchema;
