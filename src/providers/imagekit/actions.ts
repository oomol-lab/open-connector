import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "imagekit";

const assetSchema = s.looseObject("An ImageKit asset object returned by the Digital Asset Management API.");
const metadataSchema = s.looseObject("Image or video metadata returned by ImageKit.");

const listAssetsInputSchema = s.object(
  "Input parameters for listing or searching ImageKit media library assets.",
  {
    path: s.nonEmptyString("Folder path used to limit the search to a specific folder."),
    searchQuery: s.nonEmptyString("Lucene-like ImageKit search query for advanced asset search."),
    fileType: s.stringEnum("File type filter for listed ImageKit assets.", ["all", "image", "non-image"]),
    sort: s.stringEnum("Sort order for listed ImageKit assets.", [
      "ASC_NAME",
      "DESC_NAME",
      "ASC_CREATED",
      "DESC_CREATED",
      "ASC_UPDATED",
      "DESC_UPDATED",
      "ASC_HEIGHT",
      "DESC_HEIGHT",
      "ASC_WIDTH",
      "DESC_WIDTH",
      "ASC_SIZE",
      "DESC_SIZE",
      "ASC_RELEVANCE",
      "DESC_RELEVANCE",
    ]),
    limit: s.integer("Maximum number of assets to return.", { minimum: 1, maximum: 1000 }),
    skip: s.nonNegativeInteger("Number of assets to skip before returning results."),
  },
  { optional: ["path", "searchQuery", "fileType", "sort", "limit", "skip"] },
);

const fileIdInputSchema = s.actionInput(
  {
    fileId: s.nonEmptyString("The unique ImageKit fileId returned by upload or list assets APIs."),
  },
  ["fileId"],
  "Input parameters for an ImageKit file operation.",
);

export const imagekitActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_assets",
    description: "List or search assets in the ImageKit media library.",
    inputSchema: listAssetsInputSchema,
    outputSchema: s.actionOutput(
      {
        assets: s.array("ImageKit assets returned by the list and search API.", assetSchema),
      },
      "The listed ImageKit assets.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_file_details",
    description: "Get details for the current version of an ImageKit file.",
    inputSchema: fileIdInputSchema,
    outputSchema: s.actionOutput(
      {
        asset: assetSchema,
      },
      "The ImageKit file details response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_uploaded_file_metadata",
    description: "Get image or video metadata for an uploaded ImageKit file.",
    inputSchema: fileIdInputSchema,
    outputSchema: s.actionOutput(
      {
        metadata: metadataSchema,
      },
      "The ImageKit uploaded file metadata response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_remote_file_metadata",
    description: "Get image or video metadata from a remote URL through ImageKit.",
    inputSchema: s.actionInput(
      {
        url: s.url("The remote image or video URL to inspect."),
      },
      ["url"],
      "Input parameters for reading metadata from a remote URL.",
    ),
    outputSchema: s.actionOutput(
      {
        metadata: metadataSchema,
      },
      "The ImageKit remote file metadata response.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_file",
    description: "Delete one ImageKit file and all of its versions permanently.",
    inputSchema: fileIdInputSchema,
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the delete request completed successfully."),
      },
      "The ImageKit delete file result.",
    ),
  }),
  defineProviderAction(service, {
    name: "purge_cache",
    description: "Submit a cache purge request for an ImageKit file URL.",
    followUpActions: ["imagekit.get_purge_status"],
    asyncLifecycle: {
      startActionId: "imagekit.purge_cache",
      statusActionId: "imagekit.get_purge_status",
    },
    inputSchema: s.actionInput(
      {
        url: s.url("The full ImageKit file URL to purge from cache."),
      },
      ["url"],
      "Input parameters for purging ImageKit cache.",
    ),
    outputSchema: s.actionOutput(
      {
        requestId: s.string("The purge request identifier returned by ImageKit."),
      },
      "The ImageKit purge cache response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_purge_status",
    description: "Get the status of an ImageKit cache purge request.",
    asyncLifecycle: {
      startActionId: "imagekit.purge_cache",
      statusActionId: "imagekit.get_purge_status",
    },
    inputSchema: s.actionInput(
      {
        requestId: s.nonEmptyString("The ImageKit purge request identifier."),
      },
      ["requestId"],
      "Input parameters for checking ImageKit purge status.",
    ),
    outputSchema: s.actionOutput(
      {
        status: s.stringEnum("The current purge request status.", ["Pending", "Completed"]),
      },
      "The ImageKit purge cache status response.",
    ),
  }),
];
