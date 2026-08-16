import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const canvaProviderScopes = {
  designMetaRead: "design:meta:read",
  designContentRead: "design:content:read",
  designContentWrite: "design:content:write",
  assetRead: "asset:read",
  assetWrite: "asset:write",
  folderRead: "folder:read",
  folderWrite: "folder:write",
  profileRead: "profile:read",
} as const;

export const canvaOAuthScopes: string[] = [
  canvaProviderScopes.designMetaRead,
  canvaProviderScopes.designContentRead,
  canvaProviderScopes.designContentWrite,
  canvaProviderScopes.assetRead,
  canvaProviderScopes.assetWrite,
  canvaProviderScopes.folderRead,
  canvaProviderScopes.folderWrite,
  canvaProviderScopes.profileRead,
];

const emptyInputSchema = s.object("No input is required for this action.", {});

const canvaDesignSchema = s.object("A normalized Canva design metadata record.", {
  id: s.string("The Canva design ID."),
  title: s.nullable(s.string("The Canva design title when returned.")),
  editUrl: s.nullable(s.url("The Canva URL for editing the design when returned.")),
  viewUrl: s.nullable(s.url("The Canva URL for viewing the design when returned.")),
  thumbnailUrl: s.nullable(s.url("The Canva thumbnail URL when returned.")),
  thumbnailWidth: s.nullable(s.integer("The thumbnail width in pixels when returned.")),
  thumbnailHeight: s.nullable(s.integer("The thumbnail height in pixels when returned.")),
  ownerUserId: s.nullable(s.string("The Canva owner user ID when returned.")),
  ownerTeamId: s.nullable(s.string("The Canva owner team ID when returned.")),
  createdAt: s.nullable(s.dateTime("The design creation timestamp when returned.")),
  updatedAt: s.nullable(s.dateTime("The design update timestamp when returned.")),
});

const canvaFolderSchema = s.object("A normalized Canva folder metadata record.", {
  id: s.string("The Canva folder ID."),
  name: s.nullable(s.string("The Canva folder name when returned.")),
  title: s.nullable(s.string("The Canva folder title or legacy title when returned.")),
  url: s.nullable(s.url("The Canva folder URL when returned.")),
  thumbnailUrl: s.nullable(s.url("The Canva folder thumbnail URL when returned.")),
  thumbnailWidth: s.nullable(s.integer("The thumbnail width in pixels when returned.")),
  thumbnailHeight: s.nullable(s.integer("The thumbnail height in pixels when returned.")),
  createdAt: s.nullable(s.dateTime("The folder creation timestamp when returned.")),
  updatedAt: s.nullable(s.dateTime("The folder update timestamp when returned.")),
});

const importStatusSchema = s.object("The deprecated Canva asset import status when returned.", {
  state: s.stringEnum("The Canva asset import status state.", ["failed", "in_progress", "success"]),
  errorCode: s.nullable(s.string("The Canva import error code when the import failed.")),
  errorMessage: s.nullable(s.string("The Canva import error message when the import failed.")),
});

const exportJobSchema = s.object("A normalized Canva export job.", {
  id: s.string("The Canva export job ID."),
  status: s.stringEnum("The Canva export job status.", ["in_progress", "success", "failed"]),
  urls: s.array("The generated download URLs for a successful export job.", s.url("A download URL.")),
  errorCode: s.nullable(s.string("The Canva error code for a failed export job.")),
  errorMessage: s.nullable(s.string("The Canva error message for a failed export job.")),
});

const assetSchema = s.object("A normalized Canva asset metadata record.", {
  id: s.string("The Canva asset ID."),
  type: s.nullable(s.stringEnum("The Canva asset type when returned.", ["image", "video"])),
  name: s.nullable(s.string("The Canva asset name when returned.")),
  tags: s.array("The user-facing tags attached to the asset.", s.string("An asset tag.")),
  thumbnailUrl: s.nullable(s.url("The Canva asset thumbnail URL when returned.")),
  thumbnailWidth: s.nullable(s.integer("The thumbnail width in pixels when returned.")),
  thumbnailHeight: s.nullable(s.integer("The thumbnail height in pixels when returned.")),
  ownerUserId: s.nullable(s.string("The Canva owner user ID when returned.")),
  ownerTeamId: s.nullable(s.string("The Canva owner team ID when returned.")),
  createdAt: s.nullable(s.dateTime("The asset creation timestamp when returned.")),
  updatedAt: s.nullable(s.dateTime("The asset update timestamp when returned.")),
  importStatus: s.nullable(importStatusSchema),
  metadata: s.nullable(
    s.object("Type-specific Canva asset metadata when returned.", {
      type: s.nullable(s.stringEnum("The metadata type when returned.", ["image", "video"])),
      width: s.nullable(s.integer("The image or video width in pixels when returned.")),
      height: s.nullable(s.integer("The image or video height in pixels when returned.")),
      duration: s.nullable(s.integer("The video duration in seconds when returned.")),
      smartTags: s.array("The AI-generated smart tags returned for an image asset.", s.string("A smart tag.")),
    }),
  ),
});

const assetUploadJobSchema = s.object("A normalized Canva asset upload job.", {
  id: s.string("The Canva asset upload job ID."),
  status: s.stringEnum("The Canva asset upload job status.", ["in_progress", "success", "failed"]),
  asset: s.nullable(assetSchema),
  errorCode: s.nullable(s.string("The Canva error code for a failed asset upload job.")),
  errorMessage: s.nullable(s.string("The Canva error message for a failed asset upload job.")),
});

const exportFormatSchema: JsonSchema = s.object(
  "The Canva export format request. The fields map to Canva's documented export format object. Quality is required for Canva JPG and MP4 exports.",
  {
    type: s.stringEnum("The export file type.", [
      "jpg",
      "png",
      "gif",
      "pptx",
      "mp4",
      "pdf",
      "csv",
      "html_bundle",
      "html_standalone",
    ]),
    size: s.stringEnum("The PDF size option when exporting PDF.", ["a4", "a3", "letter", "legal"]),
    pages: s.array(
      "The 1-based design page numbers to export when Canva supports page selection.",
      s.integer("A 1-based page number.", { minimum: 1 }),
      { minItems: 1 },
    ),
    exportQuality: s.stringEnum("The export quality option when Canva supports it.", ["regular", "pro"]),
    width: s.integer("The exported image width in pixels when Canva supports it.", {
      minimum: 40,
      maximum: 25000,
    }),
    height: s.integer("The exported image height in pixels when Canva supports it.", {
      minimum: 40,
      maximum: 25000,
    }),
    quality: s.anyOf("The required quality field for JPG or MP4 exports.", [
      s.integer("The JPG compression quality from 1 to 100.", { minimum: 1, maximum: 100 }),
      s.stringEnum("The MP4 export quality.", [
        "horizontal_480p",
        "horizontal_720p",
        "horizontal_1080p",
        "horizontal_4k",
        "vertical_480p",
        "vertical_720p",
        "vertical_1080p",
        "vertical_4k",
      ]),
    ]),
    lossless: s.boolean("Whether Canva should export a PNG without lossy compression."),
    transparentBackground: s.boolean("Whether the exported PNG should use a transparent background when supported."),
    asSingleImage: s.boolean("Whether Canva should merge a multi-page PNG export into one image."),
  },
  {
    optional: [
      "size",
      "pages",
      "exportQuality",
      "width",
      "height",
      "quality",
      "lossless",
      "transparentBackground",
      "asSingleImage",
    ],
  },
);

const designTypeInputSchema: JsonSchema = s.oneOf(
  [
    s.object("A preset Canva design type.", {
      type: s.literal("preset", { description: "The preset design type discriminator." }),
      name: s.stringEnum("The preset design type name.", ["doc", "email", "presentation", "whiteboard"]),
    }),
    s.object("A custom Canva design type with pixel dimensions.", {
      type: s.literal("custom", { description: "The custom design type discriminator." }),
      width: s.integer("The width of the design in pixels.", { minimum: 40, maximum: 8000 }),
      height: s.integer("The height of the design in pixels.", { minimum: 40, maximum: 8000 }),
    }),
  ],
  { description: "The Canva design type to create." },
);

const createDesignInputSchema: JsonSchema = s.oneOf(
  [
    s.object(
      "Create a Canva design by specifying a preset or custom design type and optionally inserting an image asset.",
      {
        type: s.literal("type_and_asset", {
          description: "The Canva create-design mode for type and asset creation.",
        }),
        designType: designTypeInputSchema,
        assetId: s.string("The Canva image asset ID to insert into the created design.", {
          minLength: 1,
        }),
        title: s.string("The name of the created Canva design.", { minLength: 1, maxLength: 255 }),
      },
      { optional: ["type", "designType", "assetId", "title"] },
    ),
    s.object(
      "Create a copy of an existing Canva design.",
      {
        type: s.literal("design", { description: "The Canva create-design mode for copying a design." }),
        designId: s.string("The Canva design ID to copy.", { minLength: 1, maxLength: 50 }),
        pageNumbers: s.array(
          "The 1-based page numbers to copy from the source design. Omit to copy every page.",
          s.integer("A 1-based page number.", { minimum: 1 }),
          { minItems: 1 },
        ),
      },
      { optional: ["pageNumbers"] },
    ),
    s.object(
      "Create a Canva design from a brand template.",
      {
        type: s.literal("brand_template", {
          description: "The Canva create-design mode for copying a brand template.",
        }),
        brandTemplateId: s.string("The Canva brand template ID to copy.", {
          minLength: 1,
          maxLength: 50,
        }),
        pageNumbers: s.array(
          "The 1-based page numbers to copy from the brand template. Omit to copy every page.",
          s.integer("A 1-based page number.", { minimum: 1 }),
          { minItems: 1 },
        ),
      },
      { optional: ["pageNumbers"] },
    ),
  ],
  {
    description:
      "Input parameters for creating a Canva design. For type_and_asset mode, designType or assetId is required.",
  },
);

const folderItemSchema = s.object("A normalized Canva folder item.", {
  type: s.stringEnum("The Canva folder item type.", ["folder", "design", "image"]),
  id: s.string("The Canva item ID."),
  name: s.nullable(s.string("The item name when the item is a folder or asset.")),
  title: s.nullable(s.string("The item title or display name when returned.")),
  url: s.nullable(s.url("The Canva URL for the item when returned.")),
  thumbnailUrl: s.nullable(s.url("The Canva item thumbnail URL when returned.")),
  thumbnailWidth: s.nullable(s.integer("The thumbnail width in pixels when returned.")),
  thumbnailHeight: s.nullable(s.integer("The thumbnail height in pixels when returned.")),
  createdAt: s.nullable(s.dateTime("The item creation timestamp when returned.")),
  updatedAt: s.nullable(s.dateTime("The item update timestamp when returned.")),
});

/** Build the shared Canva action catalog for one regional service. */
export function createCanvaActions(service: string): ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "get_current_user",
      description: "Get the Canva user and profile associated with the current OAuth token.",
      requiredScopes: [canvaProviderScopes.profileRead],
      providerPermissions: [canvaProviderScopes.profileRead],
      inputSchema: emptyInputSchema,
      outputSchema: s.object("The normalized Canva current user profile.", {
        userId: s.string("The Canva user ID."),
        teamId: s.nullable(s.string("The Canva team ID when returned.")),
        displayName: s.nullable(s.string("The Canva display name when returned.")),
      }),
    }),
    defineProviderAction(service, {
      name: "list_designs",
      description:
        "List metadata for the current Canva user's designs, with optional search, ownership, sorting, and pagination filters.",
      requiredScopes: [canvaProviderScopes.designMetaRead],
      providerPermissions: [canvaProviderScopes.designMetaRead],
      inputSchema: s.object(
        "Input parameters for listing Canva design metadata.",
        {
          query: s.string("A search term for filtering designs.", { minLength: 1, maxLength: 255 }),
          continuation: s.string("The continuation token returned by a previous list_designs call.", {
            minLength: 1,
          }),
          ownership: s.stringEnum("Filter designs by the current user's ownership.", ["any", "owned", "shared"]),
          sortBy: s.stringEnum("The Canva sort order for the design list.", [
            "relevance",
            "modified_descending",
            "modified_ascending",
            "title_ascending",
            "title_descending",
          ]),
          limit: s.integer("The maximum number of designs to return.", {
            minimum: 1,
            maximum: 100,
          }),
        },
        { optional: ["query", "continuation", "ownership", "sortBy", "limit"] },
      ),
      outputSchema: s.object("A Canva design listing page.", {
        designs: s.array("The normalized Canva designs returned in this page.", canvaDesignSchema),
        continuation: s.nullable(s.string("The continuation token to request the next page when available.")),
      }),
    }),
    defineProviderAction(service, {
      name: "get_design",
      description: "Get metadata for a Canva design, including owner, URLs, and thumbnail details.",
      requiredScopes: [canvaProviderScopes.designMetaRead],
      providerPermissions: [canvaProviderScopes.designMetaRead],
      inputSchema: s.object("Input parameters for retrieving one Canva design.", {
        designId: s.string("The Canva design ID.", { minLength: 1 }),
      }),
      outputSchema: s.object("The normalized Canva design metadata response.", {
        design: canvaDesignSchema,
      }),
    }),
    defineProviderAction(service, {
      name: "create_design",
      description:
        "Create a new Canva design from a preset type, custom dimensions, an optional image asset, an existing design, or a brand template.",
      requiredScopes: [canvaProviderScopes.designContentWrite],
      providerPermissions: [canvaProviderScopes.designContentWrite],
      inputSchema: createDesignInputSchema,
      outputSchema: s.object("The Canva design creation response.", {
        design: canvaDesignSchema,
      }),
    }),
    defineProviderAction(service, {
      name: "list_folder_items",
      description:
        "List Canva folder contents, including folders, designs, and image assets, with pagination and filtering options.",
      requiredScopes: [canvaProviderScopes.folderRead],
      providerPermissions: [canvaProviderScopes.folderRead],
      inputSchema: s.object(
        "Input parameters for listing Canva folder items.",
        {
          folderId: s.string("The Canva folder ID to list.", { minLength: 1, maxLength: 50 }),
          continuation: s.string("The continuation token returned by a previous list_folder_items call.", {
            minLength: 1,
          }),
          limit: s.integer("The maximum number of folder items to return.", {
            minimum: 1,
            maximum: 100,
          }),
          itemTypes: s.array(
            "The Canva folder item types to include.",
            s.stringEnum("One Canva folder item type.", ["design", "folder", "image"]),
            { minItems: 1 },
          ),
          sortBy: s.stringEnum("The Canva sort order for folder items.", [
            "created_ascending",
            "created_descending",
            "modified_ascending",
            "modified_descending",
            "title_ascending",
            "title_descending",
          ]),
          pinStatus: s.stringEnum("Filter folder items by pinned status.", ["any", "pinned"]),
        },
        { optional: ["continuation", "limit", "itemTypes", "sortBy", "pinStatus"] },
      ),
      outputSchema: s.object("A Canva folder item listing page.", {
        items: s.array("The normalized Canva folder items returned in this page.", folderItemSchema),
        continuation: s.nullable(s.string("The continuation token to request the next page when available.")),
      }),
    }),
    defineProviderAction(service, {
      name: "create_folder",
      description: "Create a Canva folder at the top level, in uploads, or inside another folder.",
      requiredScopes: [canvaProviderScopes.folderWrite],
      providerPermissions: [canvaProviderScopes.folderWrite],
      inputSchema: s.object("Input parameters for creating a Canva folder.", {
        name: s.string("The Canva folder name.", { minLength: 1, maxLength: 255 }),
        parentFolderId: s.string(
          "The parent folder ID, root for the top-level projects area, or uploads for the user's Uploads folder.",
          { minLength: 1, maxLength: 50 },
        ),
      }),
      outputSchema: s.object("The Canva folder creation response.", {
        folder: canvaFolderSchema,
      }),
    }),
    defineProviderAction(service, {
      name: "move_folder_item",
      description: "Move a Canva folder item to another Canva folder.",
      requiredScopes: [canvaProviderScopes.folderWrite],
      providerPermissions: [canvaProviderScopes.folderWrite],
      inputSchema: s.object("Input parameters for moving a Canva folder item.", {
        itemId: s.string("The Canva item ID to move.", { minLength: 1, maxLength: 50 }),
        toFolderId: s.string("The destination Canva folder ID, or root for the top-level projects area.", {
          minLength: 1,
          maxLength: 50,
        }),
      }),
      outputSchema: s.object("A Canva folder item move acknowledgement.", {
        moved: s.boolean("Whether Canva accepted the move request."),
        itemId: s.string("The Canva item ID that was moved."),
        toFolderId: s.string("The destination Canva folder ID."),
      }),
    }),
    defineProviderAction(service, {
      name: "get_asset",
      description: "Get metadata for a Canva asset, including owner, thumbnail, and type-specific metadata.",
      requiredScopes: [canvaProviderScopes.assetRead],
      providerPermissions: [canvaProviderScopes.assetRead],
      inputSchema: s.object("Input parameters for retrieving one Canva asset.", {
        assetId: s.string("The Canva asset ID.", { minLength: 1, maxLength: 50 }),
      }),
      outputSchema: s.object("The normalized Canva asset metadata response.", {
        asset: assetSchema,
      }),
    }),
    defineProviderAction(service, {
      name: "get_design_export_formats",
      description: "List the file formats currently available for exporting a Canva design.",
      requiredScopes: [canvaProviderScopes.designContentRead],
      providerPermissions: [canvaProviderScopes.designContentRead],
      inputSchema: s.object("Input parameters for listing Canva design export formats.", {
        designId: s.string("The Canva design ID.", { minLength: 1 }),
      }),
      outputSchema: s.object("The Canva design export format response.", {
        formats: s.array(
          "The raw Canva export format objects supported by this design.",
          s.looseObject("A Canva export format object."),
        ),
      }),
    }),
    defineProviderAction(service, {
      name: "create_design_export_job",
      description: "Start an asynchronous Canva export job for a design and return the job handle for polling.",
      requiredScopes: [canvaProviderScopes.designContentRead],
      providerPermissions: [canvaProviderScopes.designContentRead],
      asyncLifecycle: {
        startActionId: `${service}.create_design_export_job`,
        statusActionId: `${service}.get_design_export_job`,
      },
      inputSchema: s.object("Input parameters for creating a Canva design export job.", {
        designId: s.string("The Canva design ID to export.", { minLength: 1 }),
        format: exportFormatSchema,
      }),
      outputSchema: s.object("The Canva design export job creation response.", {
        job: exportJobSchema,
      }),
    }),
    defineProviderAction(service, {
      name: "get_design_export_job",
      description:
        "Get the current status and result URLs for a Canva design export job created by create_design_export_job.",
      requiredScopes: [canvaProviderScopes.designContentRead],
      providerPermissions: [canvaProviderScopes.designContentRead],
      inputSchema: s.object("Input parameters for retrieving a Canva design export job.", {
        exportId: s.string("The Canva export job ID.", { minLength: 1 }),
      }),
      outputSchema: s.object("The Canva design export job response.", {
        job: exportJobSchema,
      }),
    }),
    defineProviderAction(service, {
      name: "create_url_asset_upload_job",
      description:
        "Start an asynchronous Canva asset upload job from a publicly accessible URL and return the job handle for polling.",
      requiredScopes: [canvaProviderScopes.assetWrite],
      providerPermissions: [canvaProviderScopes.assetWrite],
      asyncLifecycle: {
        startActionId: `${service}.create_url_asset_upload_job`,
        statusActionId: `${service}.get_url_asset_upload_job`,
      },
      inputSchema: s.object("Input parameters for uploading a Canva asset from a URL.", {
        name: s.string("The asset name shown in Canva.", { minLength: 1, maxLength: 255 }),
        url: s.string("The publicly accessible URL of the file to upload to Canva.", {
          format: "uri",
          maxLength: 2048,
        }),
      }),
      outputSchema: s.object("The Canva URL asset upload job creation response.", {
        job: assetUploadJobSchema,
      }),
    }),
    defineProviderAction(service, {
      name: "get_url_asset_upload_job",
      description: "Get the current status and uploaded asset metadata for a Canva URL asset upload job.",
      requiredScopes: [canvaProviderScopes.assetRead],
      providerPermissions: [canvaProviderScopes.assetRead],
      inputSchema: s.object("Input parameters for retrieving a Canva URL asset upload job.", {
        jobId: s.string("The Canva asset upload job ID.", { minLength: 1 }),
      }),
      outputSchema: s.object("The Canva URL asset upload job response.", {
        job: assetUploadJobSchema,
      }),
    }),
  ];
}

export const canvaActions: ActionDefinition[] = createCanvaActions("canva");

export const canvaActionByName: Map<string, ActionDefinition> = new Map(
  canvaActions.map((action) => [action.name, action] as const),
);
