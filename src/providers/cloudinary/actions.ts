import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cloudinary";

const resourceTypeSchema = s.stringEnum("The Cloudinary resource type for the asset.", ["image", "video", "raw"]);
const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);

const assetSchema = s.object(
  "A normalized Cloudinary asset.",
  {
    assetId: s.string("The immutable Cloudinary asset ID."),
    publicId: s.string("The Cloudinary public ID."),
    version: s.integer("The Cloudinary asset version."),
    versionId: s.string("The Cloudinary version ID."),
    signature: s.string("The Cloudinary response signature."),
    format: s.string("The asset format returned by Cloudinary."),
    resourceType: s.string("The Cloudinary resource type."),
    deliveryType: s.string("The Cloudinary delivery type."),
    createdAt: s.string("The asset creation timestamp returned by Cloudinary."),
    bytes: s.integer("The asset size in bytes."),
    width: s.integer("The asset width in pixels."),
    height: s.integer("The asset height in pixels."),
    assetFolder: s.string("The Cloudinary asset folder."),
    displayName: s.string("The Cloudinary display name."),
    tags: s.stringArray("The tags assigned to the asset."),
    context: s.record("The context object returned by Cloudinary.", s.unknown("A context value.")),
    url: s.string("The non-secure delivery URL returned by Cloudinary."),
    secureUrl: s.string("The secure delivery URL returned by Cloudinary."),
  },
  {
    required: ["assetId", "publicId", "resourceType", "deliveryType", "createdAt"],
    optional: [
      "version",
      "versionId",
      "signature",
      "format",
      "bytes",
      "width",
      "height",
      "assetFolder",
      "displayName",
      "tags",
      "context",
      "url",
      "secureUrl",
    ],
  },
);

const tagsSchema = s.array(
  "The list of tags to send to Cloudinary.",
  nonEmptyString("One tag to send to Cloudinary."),
  {
    minItems: 1,
  },
);

const uploadAssetInputSchema = s.object(
  "The input payload for uploading one asset to Cloudinary.",
  {
    resourceType: resourceTypeSchema,
    fileUrl: s.url("The remote HTTP or HTTPS file URL to upload."),
    fileDataUri: nonEmptyString("The Data URI content to upload to Cloudinary."),
    publicId: nonEmptyString("The public ID to assign to the uploaded asset."),
    displayName: nonEmptyString("The user-friendly display name to assign to the asset."),
    assetFolder: nonEmptyString("The Cloudinary asset folder where the uploaded asset should be placed."),
    tags: tagsSchema,
  },
  {
    optional: ["resourceType", "fileUrl", "fileDataUri", "publicId", "displayName", "assetFolder", "tags"],
  },
) as JsonSchema;
uploadAssetInputSchema.oneOf = [{ required: ["fileUrl"] }, { required: ["fileDataUri"] }];

const updateAssetInputSchema = s.object(
  "The input payload for updating one uploaded Cloudinary asset.",
  {
    resourceType: resourceTypeSchema,
    publicId: nonEmptyString("The public ID of the uploaded asset to update."),
    displayName: nonEmptyString("The replacement display name for the uploaded asset."),
    assetFolder: nonEmptyString("The replacement asset folder for the uploaded asset."),
    tags: tagsSchema,
  },
  { required: ["publicId"], optional: ["resourceType", "displayName", "assetFolder", "tags"] },
) as JsonSchema;
updateAssetInputSchema.anyOf = [{ required: ["displayName"] }, { required: ["assetFolder"] }, { required: ["tags"] }];

export const cloudinaryActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "upload_asset",
    description:
      "Upload one asset to Cloudinary from a remote URL or Data URI and return the normalized uploaded asset record.",
    inputSchema: uploadAssetInputSchema,
    outputSchema: s.object("The output payload for uploading one asset to Cloudinary.", {
      asset: assetSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_asset",
    description: "Update selected mutable fields of one uploaded Cloudinary asset by public ID using the explicit API.",
    inputSchema: updateAssetInputSchema,
    outputSchema: s.object("The output payload for updating one uploaded Cloudinary asset.", {
      asset: assetSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "rename_asset",
    description:
      "Rename one uploaded Cloudinary asset by changing its public ID and return the normalized asset record.",
    inputSchema: s.object(
      "The input payload for renaming one uploaded Cloudinary asset.",
      {
        resourceType: resourceTypeSchema,
        fromPublicId: nonEmptyString("The current public ID of the uploaded asset."),
        toPublicId: nonEmptyString("The replacement public ID for the uploaded asset."),
      },
      { required: ["fromPublicId", "toPublicId"], optional: ["resourceType"] },
    ),
    outputSchema: s.object("The output payload for renaming one uploaded Cloudinary asset.", {
      asset: assetSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_assets",
    description:
      "List uploaded Cloudinary assets of one resource type with optional prefix filtering and cursor pagination.",
    inputSchema: s.object(
      "The input payload for listing uploaded Cloudinary assets.",
      {
        resourceType: resourceTypeSchema,
        prefix: nonEmptyString("Only list uploaded assets whose public IDs start with this prefix."),
        maxResults: s.integer("The maximum number of uploaded assets to return.", { minimum: 1, maximum: 500 }),
        nextCursor: nonEmptyString("The pagination cursor returned by the previous list request."),
        direction: s.stringEnum("The created_at sort direction for uploaded assets.", ["asc", "desc"]),
        includeTags: s.boolean("Whether to include tags in the list response."),
        includeContext: s.boolean("Whether to include context metadata in the list response."),
      },
      {
        optional: ["resourceType", "prefix", "maxResults", "nextCursor", "direction", "includeTags", "includeContext"],
      },
    ),
    outputSchema: s.object("The output payload for listing uploaded Cloudinary assets.", {
      assets: s.array("The normalized uploaded Cloudinary assets.", assetSchema),
      nextCursor: s.nullable(s.string("The cursor for the next page, or null when no next page exists.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_asset",
    description: "Fetch one Cloudinary asset by immutable asset ID and return the normalized asset record.",
    inputSchema: s.object(
      "The input payload for fetching one Cloudinary asset by asset ID.",
      {
        assetId: nonEmptyString("The immutable Cloudinary asset ID."),
      },
      { required: ["assetId"] },
    ),
    outputSchema: s.object("The output payload for fetching one Cloudinary asset.", {
      asset: assetSchema,
    }),
  }),
];
