import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "figma";

const rawValueSchema = s.unknown("A raw Figma API value.");
const rawObjectSchema = s.record(rawValueSchema, { description: "The raw JSON object returned by the Figma API." });
const rawArraySchema = s.array("The raw JSON array returned by the Figma API.", rawObjectSchema);
const figmaFileKeySchema = s.string("The Figma file key or branch key from a Figma file URL.", { minLength: 1 });
const figmaMainFileKeySchema = s.string("The main Figma file key from a Figma file URL.", { minLength: 1 });
const figmaProjectIdSchema = s.string("The Figma project ID.", { minLength: 1 });
const figmaTeamIdSchema = s.string("The Figma team ID from a Figma team URL.", { minLength: 1 });
const figmaCommentIdSchema = s.string("The Figma comment ID.", { minLength: 1 });
const figmaEmojiSchema = s.string("The emoji reaction shortcode to add or delete.", { minLength: 1 });
const figmaLibraryKeySchema = s.string("The unique Figma library asset key.", { minLength: 1 });
const figmaNodeIdsSchema = s.stringArray("Figma node IDs to fetch or render, for example `1:2` or `123:456`.", {
  minItems: 1,
  itemDescription: "A Figma node ID.",
});
const versionSchema = s.string("A specific Figma file version ID to read.", { minLength: 1 });
const depthSchema = s.integer("The maximum depth of the document tree to return from Figma.", { minimum: 1 });
const pluginDataSchema = s.stringArray("Plugin IDs whose plugin data Figma should include.", {
  minItems: 1,
  itemDescription: "A Figma plugin ID.",
});

const currentUserOutputSchema = s.requiredObject("The current Figma user returned by the connector.", {
  user: rawObjectSchema,
});
const fileMetadataOutputSchema = s.requiredObject("Figma file metadata returned by the connector.", {
  metadata: rawObjectSchema,
});
const fileOutputSchema = s.requiredObject("Figma file JSON returned by the connector.", {
  file: rawObjectSchema,
});
const fileNodesOutputSchema = s.requiredObject("Figma node JSON returned by the connector.", {
  nodes: s.record(rawObjectSchema, { description: "Figma nodes keyed by node ID." }),
  raw: rawObjectSchema,
});
const imagesOutputSchema = s.requiredObject("Figma image rendering URLs returned by the connector.", {
  images: s.record(s.nullable(s.string("The rendered image URL for a Figma node.")), {
    description: "Rendered image URLs keyed by node ID. Missing or failed renders may be null.",
  }),
  err: s.nullable(s.string("The image rendering error returned by Figma.")),
  raw: rawObjectSchema,
});
const imageFillsOutputSchema = s.requiredObject("Figma image fill URLs returned by the connector.", {
  images: s.record(s.string("The temporary image fill URL."), {
    description: "Image fill URLs keyed by Figma image reference.",
  }),
  raw: rawObjectSchema,
});
const fileVersionsOutputSchema = s.requiredObject("Figma file versions returned by the connector.", {
  versions: s.array("The Figma file versions.", rawObjectSchema),
  pagination: rawObjectSchema,
  raw: rawObjectSchema,
});
const commentsOutputSchema = s.requiredObject("Figma comments returned by the connector.", {
  comments: s.array("The comments returned by Figma.", rawObjectSchema),
  raw: rawObjectSchema,
});
const commentOutputSchema = s.requiredObject("A Figma comment result returned by the connector.", {
  comment: rawObjectSchema,
});
const deleteCommentOutputSchema = s.requiredObject("The result of deleting a Figma comment.", {
  deleted: s.boolean("Whether the delete request completed successfully."),
});
const commentReactionsOutputSchema = s.requiredObject("Figma comment reactions returned by the connector.", {
  reactions: rawArraySchema,
  pagination: rawObjectSchema,
  raw: rawObjectSchema,
});
const commentReactionOutputSchema = s.requiredObject("A Figma comment reaction result.", {
  posted: s.boolean("Whether the reaction request completed successfully."),
});
const deleteCommentReactionOutputSchema = s.requiredObject("The result of deleting a Figma comment reaction.", {
  deleted: s.boolean("Whether the delete request completed successfully."),
});
const projectsOutputSchema = s.requiredObject("Figma projects returned by the connector.", {
  projects: rawArraySchema,
  raw: rawObjectSchema,
});
const projectMetadataOutputSchema = s.requiredObject("Figma project metadata returned by the connector.", {
  metadata: rawObjectSchema,
});
const projectFilesOutputSchema = s.requiredObject("Figma project files returned by the connector.", {
  files: rawArraySchema,
  raw: rawObjectSchema,
});
const libraryItemsOutputSchema = s.requiredObject("Figma library items returned by the connector.", {
  items: rawArraySchema,
  pagination: rawObjectSchema,
  raw: rawObjectSchema,
});
const libraryItemOutputSchema = s.requiredObject("A Figma library item returned by the connector.", {
  item: rawObjectSchema,
  raw: rawObjectSchema,
});
const devResourcesOutputSchema = s.requiredObject("Figma dev resources returned by the connector.", {
  devResources: rawArraySchema,
  raw: rawObjectSchema,
});
const devResourcesMutationOutputSchema = s.requiredObject("The result of creating or updating Figma dev resources.", {
  linksCreated: rawArraySchema,
  linksUpdated: rawArraySchema,
  errors: rawArraySchema,
  raw: rawObjectSchema,
});
const deleteDevResourceOutputSchema = s.requiredObject("The result of deleting a Figma dev resource.", {
  deleted: s.boolean("Whether the delete request completed successfully."),
});
const devResourceCreateSchema = s.requiredObject("A Figma dev resource to create.", {
  name: s.string("The display name for the dev resource.", { minLength: 1 }),
  url: s.url("The URL of the dev resource."),
  fileKey: figmaMainFileKeySchema,
  nodeId: s.string("The Figma node ID to attach the dev resource to.", { minLength: 1 }),
});
const devResourceUpdateSchema: JsonSchema = {
  ...s.object(
    "A Figma dev resource update. Include at least one of name or url.",
    {
      id: s.string("The unique Figma dev resource ID.", { minLength: 1 }),
      name: s.string("The new display name for the dev resource.", { minLength: 1 }),
      url: s.url("The new URL for the dev resource."),
    },
    { required: ["id"], optional: ["name", "url"] },
  ),
  anyOf: [{ required: ["name"] }, { required: ["url"] }],
};

interface FigmaActionSource {
  name: FigmaActionName;
  description: string;
  requiredScopes: string[];
  providerPermissions: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export type FigmaActionName =
  | "get_current_user"
  | "get_file_metadata"
  | "get_file"
  | "get_file_nodes"
  | "render_images"
  | "get_image_fills"
  | "list_file_versions"
  | "list_comments"
  | "post_comment"
  | "delete_comment"
  | "list_comment_reactions"
  | "post_comment_reaction"
  | "delete_comment_reaction"
  | "list_team_projects"
  | "get_project_metadata"
  | "list_project_files"
  | "list_file_components"
  | "list_file_component_sets"
  | "list_file_styles"
  | "get_component"
  | "get_component_set"
  | "get_style"
  | "get_dev_resources"
  | "create_dev_resources"
  | "update_dev_resources"
  | "delete_dev_resource";

const figmaActionSources: FigmaActionSource[] = [
  {
    name: "get_current_user",
    description: "Get the current Figma user associated with the credential.",
    requiredScopes: ["current_user:read"],
    providerPermissions: ["current_user:read"],
    inputSchema: s.object("No input is required to get the current Figma user.", {}),
    outputSchema: currentUserOutputSchema,
  },
  {
    name: "get_file_metadata",
    description: "Get lightweight metadata for a Figma file without fetching its full document.",
    requiredScopes: ["file_metadata:read"],
    providerPermissions: ["file_metadata:read"],
    inputSchema: s.requiredObject("Input parameters for reading Figma file metadata.", {
      fileKey: figmaFileKeySchema,
    }),
    outputSchema: fileMetadataOutputSchema,
  },
  {
    name: "get_file",
    description: "Get the JSON document for a Figma file or branch.",
    requiredScopes: ["file_content:read"],
    providerPermissions: ["file_content:read"],
    inputSchema: s.object(
      "Input parameters for reading a Figma file document.",
      {
        fileKey: figmaFileKeySchema,
        version: versionSchema,
        nodeIds: figmaNodeIdsSchema,
        depth: depthSchema,
        geometry: s.stringEnum("Whether Figma should include vector path geometry.", ["paths"]),
        pluginData: pluginDataSchema,
        branchData: s.boolean("Whether Figma should include branch metadata in the response."),
      },
      { required: ["fileKey"], optional: ["version", "nodeIds", "depth", "geometry", "pluginData", "branchData"] },
    ),
    outputSchema: fileOutputSchema,
  },
  {
    name: "get_file_nodes",
    description: "Get JSON for selected node IDs from a Figma file or branch.",
    requiredScopes: ["file_content:read"],
    providerPermissions: ["file_content:read"],
    inputSchema: s.object(
      "Input parameters for reading selected Figma nodes.",
      {
        fileKey: figmaFileKeySchema,
        nodeIds: figmaNodeIdsSchema,
        version: versionSchema,
        depth: depthSchema,
        geometry: s.stringEnum("Whether Figma should include vector path geometry.", ["paths"]),
        pluginData: pluginDataSchema,
      },
      { required: ["fileKey", "nodeIds"], optional: ["version", "depth", "geometry", "pluginData"] },
    ),
    outputSchema: fileNodesOutputSchema,
  },
  {
    name: "render_images",
    description: "Render selected Figma file nodes and return temporary image URLs.",
    requiredScopes: ["file_content:read"],
    providerPermissions: ["file_content:read"],
    inputSchema: s.object(
      "Input parameters for rendering Figma file nodes.",
      {
        fileKey: figmaFileKeySchema,
        nodeIds: figmaNodeIdsSchema,
        version: versionSchema,
        scale: s.number("The image scale factor supported by Figma.", { minimum: 0.01, maximum: 4 }),
        format: s.stringEnum("The image format Figma should render.", ["jpg", "png", "svg", "pdf"]),
        svgIncludeId: s.boolean("Whether SVG exports should include Figma node IDs."),
        svgSimplifyStroke: s.boolean("Whether SVG exports should simplify inside and outside strokes."),
        useAbsoluteBounds: s.boolean("Whether Figma should use full node bounds when rendering."),
      },
      {
        required: ["fileKey", "nodeIds"],
        optional: ["version", "scale", "format", "svgIncludeId", "svgSimplifyStroke", "useAbsoluteBounds"],
      },
    ),
    outputSchema: imagesOutputSchema,
  },
  {
    name: "get_image_fills",
    description: "Get temporary download URLs for image fills used in a Figma file.",
    requiredScopes: ["file_content:read"],
    providerPermissions: ["file_content:read"],
    inputSchema: s.requiredObject("Input parameters for reading Figma image fill URLs.", {
      fileKey: figmaFileKeySchema,
    }),
    outputSchema: imageFillsOutputSchema,
  },
  {
    name: "list_file_versions",
    description: "List version history records for a Figma file.",
    requiredScopes: ["file_versions:read"],
    providerPermissions: ["file_versions:read"],
    inputSchema: s.object(
      "Input parameters for listing Figma file versions.",
      {
        fileKey: figmaFileKeySchema,
        pageSize: s.integer("The maximum number of versions to request from Figma.", { minimum: 1 }),
        before: s.string("A pagination cursor requesting versions before this cursor.", { minLength: 1 }),
        after: s.string("A pagination cursor requesting versions after this cursor.", { minLength: 1 }),
      },
      { required: ["fileKey"], optional: ["pageSize", "before", "after"] },
    ),
    outputSchema: fileVersionsOutputSchema,
  },
  {
    name: "list_comments",
    description: "List comments on a Figma file or branch.",
    requiredScopes: ["file_comments:read"],
    providerPermissions: ["file_comments:read"],
    inputSchema: s.requiredObject("Input parameters for listing Figma comments.", {
      fileKey: figmaFileKeySchema,
    }),
    outputSchema: commentsOutputSchema,
  },
  {
    name: "post_comment",
    description: "Post a comment on a Figma file or branch.",
    requiredScopes: ["file_comments:write"],
    providerPermissions: ["file_comments:write"],
    inputSchema: s.object(
      "Input parameters for posting a Figma comment.",
      {
        fileKey: figmaFileKeySchema,
        message: s.string("The comment message to post.", { minLength: 1 }),
        clientMeta: rawObjectSchema,
        commentId: s.string("An optional parent comment ID to reply to.", { minLength: 1 }),
      },
      { required: ["fileKey", "message"], optional: ["clientMeta", "commentId"] },
    ),
    outputSchema: commentOutputSchema,
  },
  {
    name: "delete_comment",
    description: "Delete a Figma comment created by the authenticated user.",
    requiredScopes: ["file_comments:write"],
    providerPermissions: ["file_comments:write"],
    inputSchema: s.requiredObject("Input parameters for deleting a Figma comment.", {
      fileKey: figmaFileKeySchema,
      commentId: figmaCommentIdSchema,
    }),
    outputSchema: deleteCommentOutputSchema,
  },
  {
    name: "list_comment_reactions",
    description: "List emoji reactions on a Figma file comment.",
    requiredScopes: ["file_comments:read"],
    providerPermissions: ["file_comments:read"],
    inputSchema: s.object(
      "Input parameters for listing Figma comment reactions.",
      {
        fileKey: figmaFileKeySchema,
        commentId: figmaCommentIdSchema,
        cursor: s.string("A pagination cursor returned by Figma.", { minLength: 1 }),
      },
      { required: ["fileKey", "commentId"], optional: ["cursor"] },
    ),
    outputSchema: commentReactionsOutputSchema,
  },
  {
    name: "post_comment_reaction",
    description: "Add an emoji reaction to a Figma file comment.",
    requiredScopes: ["file_comments:write"],
    providerPermissions: ["file_comments:write"],
    inputSchema: s.requiredObject("Input parameters for adding a Figma comment reaction.", {
      fileKey: figmaFileKeySchema,
      commentId: figmaCommentIdSchema,
      emoji: figmaEmojiSchema,
    }),
    outputSchema: commentReactionOutputSchema,
  },
  {
    name: "delete_comment_reaction",
    description: "Delete an emoji reaction created by the authenticated user.",
    requiredScopes: ["file_comments:write"],
    providerPermissions: ["file_comments:write"],
    inputSchema: s.requiredObject("Input parameters for deleting a Figma comment reaction.", {
      fileKey: figmaFileKeySchema,
      commentId: figmaCommentIdSchema,
      emoji: figmaEmojiSchema,
    }),
    outputSchema: deleteCommentReactionOutputSchema,
  },
  {
    name: "list_team_projects",
    description: "List projects visible to the authenticated user in a Figma team.",
    requiredScopes: ["projects:read"],
    providerPermissions: ["projects:read"],
    inputSchema: s.requiredObject("Input parameters for listing Figma team projects.", {
      teamId: figmaTeamIdSchema,
    }),
    outputSchema: projectsOutputSchema,
  },
  {
    name: "get_project_metadata",
    description: "Get metadata for a Figma project.",
    requiredScopes: ["project_metadata:read"],
    providerPermissions: ["project_metadata:read"],
    inputSchema: s.requiredObject("Input parameters for reading Figma project metadata.", {
      projectId: figmaProjectIdSchema,
    }),
    outputSchema: projectMetadataOutputSchema,
  },
  {
    name: "list_project_files",
    description: "List files in a Figma project.",
    requiredScopes: ["projects:read"],
    providerPermissions: ["projects:read"],
    inputSchema: s.object(
      "Input parameters for listing Figma project files.",
      {
        projectId: figmaProjectIdSchema,
        branchData: s.boolean("Whether Figma should include branch metadata for files."),
      },
      { required: ["projectId"], optional: ["branchData"] },
    ),
    outputSchema: projectFilesOutputSchema,
  },
  {
    name: "list_file_components",
    description: "List published components in a Figma main file library.",
    requiredScopes: ["library_content:read"],
    providerPermissions: ["library_content:read"],
    inputSchema: s.requiredObject("Input parameters for listing Figma file components.", {
      fileKey: figmaMainFileKeySchema,
    }),
    outputSchema: libraryItemsOutputSchema,
  },
  {
    name: "list_file_component_sets",
    description: "List published component sets in a Figma main file library.",
    requiredScopes: ["library_content:read"],
    providerPermissions: ["library_content:read"],
    inputSchema: s.requiredObject("Input parameters for listing Figma file component sets.", {
      fileKey: figmaMainFileKeySchema,
    }),
    outputSchema: libraryItemsOutputSchema,
  },
  {
    name: "list_file_styles",
    description: "List published styles in a Figma main file library.",
    requiredScopes: ["library_content:read"],
    providerPermissions: ["library_content:read"],
    inputSchema: s.requiredObject("Input parameters for listing Figma file styles.", {
      fileKey: figmaMainFileKeySchema,
    }),
    outputSchema: libraryItemsOutputSchema,
  },
  {
    name: "get_component",
    description: "Get metadata for a published Figma component by key.",
    requiredScopes: ["library_assets:read"],
    providerPermissions: ["library_assets:read"],
    inputSchema: s.requiredObject("Input parameters for reading a Figma component.", {
      key: figmaLibraryKeySchema,
    }),
    outputSchema: libraryItemOutputSchema,
  },
  {
    name: "get_component_set",
    description: "Get metadata for a published Figma component set by key.",
    requiredScopes: ["library_assets:read"],
    providerPermissions: ["library_assets:read"],
    inputSchema: s.requiredObject("Input parameters for reading a Figma component set.", {
      key: figmaLibraryKeySchema,
    }),
    outputSchema: libraryItemOutputSchema,
  },
  {
    name: "get_style",
    description: "Get metadata for a published Figma style by key.",
    requiredScopes: ["library_assets:read"],
    providerPermissions: ["library_assets:read"],
    inputSchema: s.requiredObject("Input parameters for reading a Figma style.", {
      key: figmaLibraryKeySchema,
    }),
    outputSchema: libraryItemOutputSchema,
  },
  {
    name: "get_dev_resources",
    description: "Get dev resources attached to a Figma main file.",
    requiredScopes: ["file_dev_resources:read"],
    providerPermissions: ["file_dev_resources:read"],
    inputSchema: s.object(
      "Input parameters for reading Figma dev resources.",
      {
        fileKey: figmaMainFileKeySchema,
        nodeIds: figmaNodeIdsSchema,
      },
      { required: ["fileKey"], optional: ["nodeIds"] },
    ),
    outputSchema: devResourcesOutputSchema,
  },
  {
    name: "create_dev_resources",
    description: "Create dev resources and attach them to Figma file nodes.",
    requiredScopes: ["file_dev_resources:write"],
    providerPermissions: ["file_dev_resources:write"],
    inputSchema: s.requiredObject("Input parameters for creating Figma dev resources.", {
      devResources: s.array("The dev resources to create.", devResourceCreateSchema, { minItems: 1 }),
    }),
    outputSchema: devResourcesMutationOutputSchema,
  },
  {
    name: "update_dev_resources",
    description: "Update existing Figma dev resources.",
    requiredScopes: ["file_dev_resources:write"],
    providerPermissions: ["file_dev_resources:write"],
    inputSchema: s.requiredObject("Input parameters for updating Figma dev resources.", {
      devResources: s.array("The dev resources to update.", devResourceUpdateSchema, { minItems: 1 }),
    }),
    outputSchema: devResourcesMutationOutputSchema,
  },
  {
    name: "delete_dev_resource",
    description: "Delete a Figma dev resource from a main file.",
    requiredScopes: ["file_dev_resources:write"],
    providerPermissions: ["file_dev_resources:write"],
    inputSchema: s.requiredObject("Input parameters for deleting a Figma dev resource.", {
      fileKey: figmaMainFileKeySchema,
      devResourceId: s.string("The Figma dev resource ID to delete.", { minLength: 1 }),
    }),
    outputSchema: deleteDevResourceOutputSchema,
  },
];

export const figmaActions: ActionDefinition[] = figmaActionSources.map((action) =>
  defineProviderAction(service, {
    name: action.name,
    description: action.description,
    requiredScopes: action.requiredScopes,
    providerPermissions: action.providerPermissions,
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
  }),
);
