import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "vimeo";

const vimeoConnectorScopes = {
  read: "vimeo.read",
  write: "vimeo.write",
  delete: "vimeo.delete",
  upload: "vimeo.upload",
  file: "vimeo.file",
};

const vimeoProviderPermissions = {
  public: "public",
  private: "private",
  create: "create",
  edit: "edit",
  interact: "interact",
  upload: "upload",
  delete: "delete",
  videoFiles: "video_files",
};

const paginationInputFields = {
  page: s.integer("The page number of the results to show.", { minimum: 1 }),
  perPage: s.integer("The number of items to show on each page of results, up to a maximum of 100.", {
    minimum: 1,
    maximum: 100,
  }),
};
const paginationOutputFields = {
  page: s.nullableInteger("The current page number returned by Vimeo."),
  perPage: s.nullableInteger("The number of items returned per page by Vimeo."),
  total: s.nullableInteger("The total number of items reported by Vimeo."),
  paging: s.looseObject("The upstream Vimeo paging object, including next and previous page links."),
};

const videoIdSchema = s.integer("The Vimeo video ID.", { minimum: 1 });
const userIdSchema = s.integer("The Vimeo user ID. Omit this field to use the authenticated user.");
const showcaseIdSchema = s.integer("The Vimeo showcase ID.", { minimum: 1 });
const folderIdSchema = s.integer("The Vimeo folder ID.", { minimum: 1 });
const folderUriSchema = s.string("The Vimeo folder URI, for example `/users/12345/folders/6789`.", { minLength: 1 });

const vimeoUserSchema = s.looseObject("A Vimeo user object returned by the API.", {
  uri: s.string("The Vimeo API URI for the user."),
  name: s.string("The display name of the Vimeo user."),
  link: s.string("The public Vimeo profile URL."),
});
const vimeoVideoSchema = s.looseObject("A Vimeo video object returned by the API.", {
  uri: s.string("The Vimeo API URI for the video."),
  name: s.string("The video title."),
  link: s.string("The public Vimeo video URL."),
  description: s.nullableString("The video description returned by Vimeo."),
  duration: s.nullableInteger("The video duration in seconds."),
});
const vimeoTagSchema = s.looseObject("A Vimeo tag object returned by the API.", {
  name: s.string("The tag name."),
  tag: s.string("The tag value returned by Vimeo when present."),
  canonical: s.string("The canonical tag value returned by Vimeo when present."),
});
const vimeoShowcaseSchema = s.looseObject("A Vimeo showcase object returned by the API.", {
  uri: s.string("The Vimeo API URI for the showcase."),
  name: s.string("The showcase name."),
  link: s.string("The public Vimeo showcase URL."),
  description: s.nullableString("The showcase description returned by Vimeo."),
});
const vimeoFolderSchema = s.looseObject("A Vimeo folder object returned by the API.", {
  uri: s.string("The Vimeo API URI for the folder."),
  name: s.string("The folder name."),
});
const vimeoDownloadLinkSchema = s.looseObject("A Vimeo downloadable file link.", {
  link: s.string("The temporary Vimeo file download URL."),
  quality: s.string("The Vimeo quality label for the downloadable file."),
  type: s.string("The MIME type or file type returned by Vimeo."),
  size: s.integer("The file size in bytes reported by Vimeo."),
  expires: s.string("When the temporary download URL expires."),
});

const pagedVideosOutputSchema = s.object("A paginated Vimeo video list response.", {
  data: s.array("The videos returned by Vimeo.", vimeoVideoSchema),
  ...paginationOutputFields,
});
const pagedTagsOutputSchema = s.object("A paginated Vimeo tag list response.", {
  data: s.array("The tags returned by Vimeo.", vimeoTagSchema),
  ...paginationOutputFields,
});
const tagsOutputSchema = s.object("A Vimeo tag list response.", {
  tags: s.array("The tags returned by Vimeo.", vimeoTagSchema),
});
const pagedShowcasesOutputSchema = s.object("A paginated Vimeo showcase list response.", {
  data: s.array("The showcases returned by Vimeo.", vimeoShowcaseSchema),
  ...paginationOutputFields,
});
const pagedFoldersOutputSchema = s.object("A paginated Vimeo folder list response.", {
  data: s.array("The folders returned by Vimeo.", vimeoFolderSchema),
  ...paginationOutputFields,
});

const uploadVideoInputSchema = s.object(
  "Input parameters for uploading a Vimeo video by pull URL.",
  {
    userId: userIdSchema,
    sourceUrl: s.url(
      "The HTTP or HTTPS URL from which Vimeo should pull the video file. The URL must remain valid for at least 24 hours.",
    ),
    sourceSizeBytes: s.integer("The size in bytes of the source video file.", { minimum: 1 }),
    name: s.string("The title of the video.", { minLength: 1, maxLength: 128 }),
    description: s.string("The description of the video.", { maxLength: 5000 }),
    folderUri: folderUriSchema,
    privacyView: s.stringEnum("The Vimeo privacy setting for viewing the uploaded video.", [
      "anybody",
      "disable",
      "nobody",
      "password",
      "team",
      "unlisted",
    ]),
    privacyDownload: s.boolean("Whether viewers can download the uploaded video when supported."),
  },
  {
    optional: ["userId", "sourceSizeBytes", "name", "description", "folderUri", "privacyView", "privacyDownload"],
  },
);

const folderVideosInputSchema = s.object(
  "Input parameters for listing Vimeo folder videos.",
  {
    userId: userIdSchema,
    folderId: folderIdSchema,
    query: s.string("Search query used to filter videos in the folder.", { minLength: 1 }),
    sort: s.stringEnum("The way to sort the folder video results.", [
      "alphabetical",
      "date",
      "default",
      "duration",
      "last_user_action_event_date",
    ]),
    direction: s.stringEnum("The sort direction for folder video results.", ["asc", "desc"]),
    includeSubfolders: s.boolean("Whether Vimeo should include videos from subfolders."),
    ...paginationInputFields,
  },
  { optional: ["userId", "query", "sort", "direction", "includeSubfolders", "page", "perPage"] },
);

export type VimeoActionName =
  | "get_current_user"
  | "list_user_videos"
  | "get_video"
  | "update_video"
  | "delete_video"
  | "upload_video_from_url"
  | "replace_video_from_url"
  | "get_video_download_links"
  | "download_video_file"
  | "list_video_tags"
  | "add_video_tags"
  | "delete_video_tag"
  | "list_showcases"
  | "get_showcase"
  | "list_showcase_videos"
  | "add_video_to_showcase"
  | "remove_video_from_showcase"
  | "list_folders"
  | "create_folder"
  | "get_folder"
  | "update_folder"
  | "delete_folder"
  | "list_folder_videos"
  | "add_video_to_folder"
  | "remove_video_from_folder";

export const vimeoActions: ProviderActionDefinition<VimeoActionName>[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the authenticated Vimeo user profile.",
    requiredScopes: [vimeoConnectorScopes.read],
    providerPermissions: [vimeoProviderPermissions.public],
    inputSchema: s.object("Input parameters for getting the authenticated Vimeo user.", {}),
    outputSchema: s.object("The authenticated Vimeo user profile.", { user: vimeoUserSchema }),
  }),
  defineProviderAction(service, {
    name: "list_user_videos",
    description: "List videos uploaded by the authenticated user or by a specified Vimeo user.",
    requiredScopes: [vimeoConnectorScopes.read],
    providerPermissions: [vimeoProviderPermissions.public, vimeoProviderPermissions.private],
    inputSchema: s.object(
      "Input parameters for listing Vimeo user videos.",
      {
        userId: userIdSchema,
        query: s.string("Search query used to filter the user's videos.", { minLength: 1 }),
        sort: s.stringEnum("The way to sort the Vimeo video results.", [
          "alphabetical",
          "date",
          "default",
          "duration",
          "last_user_action_event_date",
          "likes",
          "modified_time",
          "plays",
        ]),
        direction: s.stringEnum("The sort direction for Vimeo video results.", ["asc", "desc"]),
        filter: s.stringEnum("The Vimeo video filter to apply.", [
          "app_only",
          "embeddable",
          "featured",
          "live",
          "no_placeholder",
          "playable",
          "screen_recorded",
        ]),
        ...paginationInputFields,
      },
      { optional: ["userId", "query", "sort", "direction", "filter", "page", "perPage"] },
    ),
    outputSchema: pagedVideosOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_video",
    description: "Get metadata for a specific Vimeo video.",
    requiredScopes: [vimeoConnectorScopes.read],
    providerPermissions: [vimeoProviderPermissions.public, vimeoProviderPermissions.private],
    inputSchema: s.object("Input parameters for getting a Vimeo video.", { videoId: videoIdSchema }),
    outputSchema: s.object("The Vimeo video metadata response.", { video: vimeoVideoSchema }),
  }),
  defineProviderAction(service, {
    name: "update_video",
    description: "Update basic metadata for a Vimeo video without uploading or replacing media.",
    requiredScopes: [vimeoConnectorScopes.write],
    providerPermissions: [vimeoProviderPermissions.edit],
    inputSchema: s.object(
      "Input parameters for updating Vimeo video metadata.",
      {
        videoId: videoIdSchema,
        name: s.string("The new video title.", { minLength: 1, maxLength: 128 }),
        description: s.string("The new video description.", { maxLength: 5000 }),
        license: s.stringEnum("The Creative Commons license code to apply to the video.", [
          "by",
          "by-nc",
          "by-nc-nd",
          "by-nc-sa",
          "by-nd",
          "by-sa",
          "cc0",
        ]),
      },
      { optional: ["name", "description", "license"] },
    ),
    outputSchema: s.object("The updated Vimeo video metadata response.", { video: vimeoVideoSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_video",
    description: "Delete a Vimeo video by ID.",
    requiredScopes: [vimeoConnectorScopes.delete],
    providerPermissions: [vimeoProviderPermissions.delete],
    inputSchema: s.object("Input parameters for deleting a Vimeo video.", { videoId: videoIdSchema }),
    outputSchema: s.object("The Vimeo video deletion result.", {
      deleted: s.boolean("Whether the connector completed the Vimeo delete request."),
      videoId: videoIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "upload_video_from_url",
    description: "Upload a new Vimeo video by asking Vimeo to pull the media from an HTTP or HTTPS URL.",
    requiredScopes: [vimeoConnectorScopes.upload],
    providerPermissions: [vimeoProviderPermissions.upload],
    inputSchema: uploadVideoInputSchema,
    outputSchema: s.object("The uploaded Vimeo video metadata response.", { video: vimeoVideoSchema }),
  }),
  defineProviderAction(service, {
    name: "replace_video_from_url",
    description:
      "Add a new version to an existing Vimeo video by asking Vimeo to pull the replacement media from a URL.",
    requiredScopes: [vimeoConnectorScopes.upload],
    providerPermissions: [vimeoProviderPermissions.upload],
    inputSchema: s.object(
      "Input parameters for replacing a Vimeo video by pull URL.",
      {
        videoId: videoIdSchema,
        sourceUrl: s.url("The HTTP or HTTPS URL from which Vimeo should pull the replacement video file."),
        fileName: s.string("The filename to assign to the new Vimeo video version.", { minLength: 1 }),
        sourceSizeBytes: s.integer("The size in bytes of the replacement video file.", { minimum: 1 }),
      },
      { optional: ["sourceSizeBytes"] },
    ),
    outputSchema: s.object("The Vimeo video version response.", {
      version: s.looseObject("A Vimeo video version object returned by the API."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_video_download_links",
    description: "Get temporary downloadable file links for a Vimeo video when Vimeo exposes them.",
    requiredScopes: [vimeoConnectorScopes.file],
    providerPermissions: [vimeoProviderPermissions.videoFiles],
    inputSchema: s.object("Input parameters for getting Vimeo video download links.", { videoId: videoIdSchema }),
    outputSchema: s.object("The Vimeo video download links response.", {
      downloadLinks: s.array("The downloadable file links returned by Vimeo.", vimeoDownloadLinkSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "download_video_file",
    description: "Download one Vimeo video file link and store it in local transit storage.",
    requiredScopes: [vimeoConnectorScopes.file],
    providerPermissions: [vimeoProviderPermissions.videoFiles],
    inputSchema: s.object(
      "Input parameters for downloading a Vimeo video file into transit storage.",
      {
        videoId: videoIdSchema,
        quality: s.string("Select a Vimeo download link with this quality label.", { minLength: 1 }),
        type: s.string("Select a Vimeo download link with this type or MIME type.", { minLength: 1 }),
        fileName: s.string("The filename to use for the transit file.", { minLength: 1 }),
      },
      { optional: ["quality", "type", "fileName"] },
    ),
    outputSchema: s.object("A Vimeo video file downloaded into local transit storage.", {
      videoId: videoIdSchema,
      sourceUrl: s.string("The Vimeo download URL that the connector fetched."),
      file: s.transitFile("The local transit file created for the downloaded video."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_video_tags",
    description: "List tags attached to a Vimeo video.",
    requiredScopes: [vimeoConnectorScopes.read],
    providerPermissions: [vimeoProviderPermissions.public, vimeoProviderPermissions.private],
    inputSchema: s.object(
      "Input parameters for listing Vimeo video tags.",
      { videoId: videoIdSchema, ...paginationInputFields },
      { optional: ["page", "perPage"] },
    ),
    outputSchema: pagedTagsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_video_tags",
    description: "Add one or more tags to a Vimeo video.",
    requiredScopes: [vimeoConnectorScopes.write],
    providerPermissions: [vimeoProviderPermissions.edit],
    inputSchema: s.object("Input parameters for adding tags to a Vimeo video.", {
      videoId: videoIdSchema,
      tags: s.array("Tag names to add to the Vimeo video.", s.string("A tag name.", { minLength: 1 }), {
        minItems: 1,
        maxItems: 20,
      }),
    }),
    outputSchema: tagsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_video_tag",
    description: "Remove a tag from a Vimeo video.",
    requiredScopes: [vimeoConnectorScopes.write],
    providerPermissions: [vimeoProviderPermissions.edit],
    inputSchema: s.object("Input parameters for deleting a Vimeo video tag.", {
      videoId: videoIdSchema,
      tag: s.string("The tag word to remove from the Vimeo video.", { minLength: 1 }),
    }),
    outputSchema: s.object("The Vimeo tag deletion result.", {
      deleted: s.boolean("Whether the connector completed the Vimeo delete request."),
      videoId: videoIdSchema,
      tag: s.string("The tag word removed from the Vimeo video."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_showcases",
    description: "List showcases that belong to the authenticated user or to a specified Vimeo user.",
    requiredScopes: [vimeoConnectorScopes.read],
    providerPermissions: [vimeoProviderPermissions.public, vimeoProviderPermissions.private],
    inputSchema: s.object(
      "Input parameters for listing Vimeo showcases.",
      {
        userId: userIdSchema,
        query: s.string("Search query used to filter Vimeo showcases.", { minLength: 1 }),
        sort: s.stringEnum("The way to sort the Vimeo showcase results.", [
          "alphabetical",
          "date",
          "default",
          "modified_time",
          "videos",
        ]),
        direction: s.stringEnum("The sort direction for Vimeo showcase results.", ["asc", "desc"]),
        ...paginationInputFields,
      },
      { optional: ["userId", "query", "sort", "direction", "page", "perPage"] },
    ),
    outputSchema: pagedShowcasesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_showcase",
    description: "Get metadata for a specific Vimeo showcase.",
    requiredScopes: [vimeoConnectorScopes.read],
    providerPermissions: [vimeoProviderPermissions.public, vimeoProviderPermissions.private],
    inputSchema: s.object(
      "Input parameters for getting a Vimeo showcase.",
      { userId: userIdSchema, showcaseId: showcaseIdSchema },
      { optional: ["userId"] },
    ),
    outputSchema: s.object("The Vimeo showcase metadata response.", { showcase: vimeoShowcaseSchema }),
  }),
  defineProviderAction(service, {
    name: "list_showcase_videos",
    description: "List videos in a Vimeo showcase.",
    requiredScopes: [vimeoConnectorScopes.read],
    providerPermissions: [vimeoProviderPermissions.public, vimeoProviderPermissions.private],
    inputSchema: s.object(
      "Input parameters for listing Vimeo showcase videos.",
      {
        userId: userIdSchema,
        showcaseId: showcaseIdSchema,
        sort: s.stringEnum("The way to sort the Vimeo showcase videos.", [
          "added_first",
          "added_last",
          "alphabetical",
          "arranged",
          "comments",
          "date",
          "default",
          "duration",
          "likes",
          "manual",
          "modified_time",
          "plays",
        ]),
        direction: s.stringEnum("The sort direction for Vimeo showcase videos.", ["asc", "desc"]),
        ...paginationInputFields,
      },
      { optional: ["userId", "sort", "direction", "page", "perPage"] },
    ),
    outputSchema: pagedVideosOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_video_to_showcase",
    description: "Add a Vimeo video to a showcase.",
    requiredScopes: [vimeoConnectorScopes.write],
    providerPermissions: [vimeoProviderPermissions.edit],
    inputSchema: s.object(
      "Input parameters for adding a Vimeo video to a showcase.",
      { userId: userIdSchema, showcaseId: showcaseIdSchema, videoId: videoIdSchema },
      { optional: ["userId"] },
    ),
    outputSchema: s.object("The Vimeo showcase video mutation result.", {
      added: s.boolean("Whether the connector completed the Vimeo add request."),
      userId: s.nullable(userIdSchema),
      showcaseId: showcaseIdSchema,
      videoId: videoIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "remove_video_from_showcase",
    description: "Remove a Vimeo video from a showcase.",
    requiredScopes: [vimeoConnectorScopes.write],
    providerPermissions: [vimeoProviderPermissions.edit],
    inputSchema: s.object(
      "Input parameters for removing a Vimeo video from a showcase.",
      { userId: userIdSchema, showcaseId: showcaseIdSchema, videoId: videoIdSchema },
      { optional: ["userId"] },
    ),
    outputSchema: s.object("The Vimeo showcase video removal result.", {
      removed: s.boolean("Whether the connector completed the Vimeo remove request."),
      userId: s.nullable(userIdSchema),
      showcaseId: showcaseIdSchema,
      videoId: videoIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_folders",
    description: "List folders that belong to the authenticated user or to a specified Vimeo user.",
    requiredScopes: [vimeoConnectorScopes.read],
    providerPermissions: [vimeoProviderPermissions.private],
    inputSchema: s.object(
      "Input parameters for listing Vimeo folders.",
      {
        userId: userIdSchema,
        query: s.string("Search query used to filter Vimeo folders.", { minLength: 1 }),
        sort: s.stringEnum("The way to sort the Vimeo folder results.", [
          "date",
          "default",
          "modified_time",
          "name",
          "pinned_on",
        ]),
        direction: s.stringEnum("The sort direction for Vimeo folder results.", ["asc", "desc"]),
        ...paginationInputFields,
      },
      { optional: ["userId", "query", "sort", "direction", "page", "perPage"] },
    ),
    outputSchema: pagedFoldersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_folder",
    description: "Create a Vimeo folder for the authenticated user or a specified Vimeo user.",
    requiredScopes: [vimeoConnectorScopes.write],
    providerPermissions: [vimeoProviderPermissions.create],
    inputSchema: s.object(
      "Input parameters for creating a Vimeo folder.",
      {
        userId: userIdSchema,
        name: s.string("The name of the folder.", { minLength: 1 }),
        parentFolderUri: folderUriSchema,
      },
      { optional: ["userId", "parentFolderUri"] },
    ),
    outputSchema: s.object("The Vimeo folder creation response.", { folder: vimeoFolderSchema }),
  }),
  defineProviderAction(service, {
    name: "get_folder",
    description: "Get metadata for a Vimeo folder.",
    requiredScopes: [vimeoConnectorScopes.read],
    providerPermissions: [vimeoProviderPermissions.private],
    inputSchema: s.object(
      "Input parameters for getting a Vimeo folder.",
      { userId: userIdSchema, folderId: folderIdSchema },
      { optional: ["userId"] },
    ),
    outputSchema: s.object("The Vimeo folder metadata response.", { folder: vimeoFolderSchema }),
  }),
  defineProviderAction(service, {
    name: "update_folder",
    description: "Update a Vimeo folder name.",
    requiredScopes: [vimeoConnectorScopes.write],
    providerPermissions: [vimeoProviderPermissions.edit],
    inputSchema: s.object(
      "Input parameters for updating a Vimeo folder.",
      {
        userId: userIdSchema,
        folderId: folderIdSchema,
        name: s.string("The new folder name.", { minLength: 1 }),
      },
      { optional: ["userId"] },
    ),
    outputSchema: s.object("The Vimeo folder update response.", { folder: vimeoFolderSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_folder",
    description: "Delete a Vimeo folder, optionally deleting the videos inside it.",
    requiredScopes: [vimeoConnectorScopes.delete],
    providerPermissions: [vimeoProviderPermissions.delete],
    inputSchema: s.object(
      "Input parameters for deleting a Vimeo folder.",
      {
        userId: userIdSchema,
        folderId: folderIdSchema,
        shouldDeleteVideos: s.boolean("Whether Vimeo should also delete videos in the folder."),
      },
      { optional: ["userId", "shouldDeleteVideos"] },
    ),
    outputSchema: s.object("The Vimeo folder deletion result.", {
      deleted: s.boolean("Whether the connector completed the Vimeo delete request."),
      userId: s.nullable(userIdSchema),
      folderId: folderIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_folder_videos",
    description: "List videos in a Vimeo folder.",
    requiredScopes: [vimeoConnectorScopes.read],
    providerPermissions: [vimeoProviderPermissions.private],
    inputSchema: folderVideosInputSchema,
    outputSchema: pagedVideosOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_video_to_folder",
    description: "Add a Vimeo video to a folder.",
    requiredScopes: [vimeoConnectorScopes.write],
    providerPermissions: [vimeoProviderPermissions.interact],
    inputSchema: s.object(
      "Input parameters for adding a Vimeo video to a folder.",
      { userId: userIdSchema, folderId: folderIdSchema, videoId: videoIdSchema },
      { optional: ["userId"] },
    ),
    outputSchema: s.object("The Vimeo folder video mutation result.", {
      added: s.boolean("Whether the connector completed the Vimeo add request."),
      userId: s.nullable(userIdSchema),
      folderId: folderIdSchema,
      videoId: videoIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "remove_video_from_folder",
    description: "Remove a Vimeo video from a folder without deleting the video.",
    requiredScopes: [vimeoConnectorScopes.delete],
    providerPermissions: [vimeoProviderPermissions.delete],
    inputSchema: s.object(
      "Input parameters for removing a Vimeo video from a folder.",
      { userId: userIdSchema, folderId: folderIdSchema, videoId: videoIdSchema },
      { optional: ["userId"] },
    ),
    outputSchema: s.object("The Vimeo folder video removal result.", {
      removed: s.boolean("Whether the connector completed the Vimeo remove request."),
      userId: s.nullable(userIdSchema),
      folderId: folderIdSchema,
      videoId: videoIdSchema,
    }),
  }),
];
