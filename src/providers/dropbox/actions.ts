import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { dropboxProviderScopes } from "./scopes.ts";

const service = "dropbox";

const fileCategories = [
  "image",
  "document",
  "pdf",
  "spreadsheet",
  "presentation",
  "audio",
  "video",
  "folder",
  "paper",
  "others",
] as const;

const writeModes = ["add", "overwrite", "update"] as const;

const sharedLinkVisibility = ["public", "team_only", "password"] as const;

const sharedLinkAudience = ["public", "team", "no_one"] as const;

const sharedLinkAccess = ["viewer", "editor", "max"] as const;

const searchFileStatus = ["active", "deleted"] as const;

const searchOrderBy = ["relevance", "last_modified_time"] as const;

const revisionMode = ["path", "id"] as const;

const jsonObjectSchema = s.looseObject(
  {},
  {
    description: "A generic JSON object returned by Dropbox.",
  },
);

const emptyInputSchema = s.object(
  {},
  {
    description: "No input is required for this action.",
  },
);

function textSchema(description: string) {
  return s.string({ description });
}

function nonEmptyString(description: string) {
  return s.string({
    description,
    minLength: 1,
    pattern: "\\S",
  });
}

function nullableBoolean(description: string) {
  return s.nullable(s.boolean({ description }));
}

function nullableInteger(description: string) {
  return s.nullable(s.integer({ description }));
}

const pathLikeField = textSchema("A Dropbox path, file ID, revision ID, or namespace-relative path.");

const dropboxMetadataSchema = s.object(
  {
    tag: textSchema("The Dropbox metadata tag such as file, folder, or deleted."),
    name: textSchema("The Dropbox item name."),
    id: s.nullableString("The Dropbox item ID when available."),
    pathDisplay: s.nullableString("The user-facing cased path when available."),
    pathLower: s.nullableString("The lower-cased full path when available."),
    clientModified: s.nullableString("The client-provided modification timestamp in ISO 8601 format when available."),
    serverModified: s.nullableString("The server-side modification timestamp in ISO 8601 format when available."),
    rev: s.nullableString("The Dropbox file revision when available."),
    sizeBytes: nullableInteger("The file size in bytes when available."),
    isDownloadable: nullableBoolean("Whether the file can be downloaded directly."),
    contentHash: s.nullableString("The Dropbox content hash when available."),
    url: s.nullableString("The shared link URL when available."),
    expiresAt: s.nullableString("The shared link expiration timestamp in ISO 8601 format when available."),
    sharingInfo: s.nullable(jsonObjectSchema),
    linkPermissions: s.nullable(
      s.looseObject(
        {},
        {
          description: "Shared-link permission metadata when Dropbox includes it.",
        },
      ),
    ),
  },
  {
    description: "A normalized Dropbox metadata or shared-link record.",
    required: [
      "tag",
      "name",
      "id",
      "pathDisplay",
      "pathLower",
      "clientModified",
      "serverModified",
      "rev",
      "sizeBytes",
      "isDownloadable",
      "contentHash",
      "url",
      "expiresAt",
      "sharingInfo",
      "linkPermissions",
    ],
  },
);

const currentAccountOutputSchema = s.object(
  {
    accountId: textSchema("The Dropbox account ID."),
    displayName: textSchema("The full display name of the current user."),
    abbreviatedName: s.nullableString("The abbreviated display name when available."),
    givenName: s.nullableString("The given name when available."),
    surname: s.nullableString("The surname when available."),
    email: s.nullableString("The email address when available."),
    emailVerified: nullableBoolean("Whether the Dropbox account email is verified."),
    disabled: s.boolean({
      description: "Whether the Dropbox account is disabled.",
    }),
    locale: s.nullableString("The account locale when available."),
    country: s.nullableString("The account country when available."),
    accountType: s.nullableString("The Dropbox account type tag when available."),
    teamId: s.nullableString("The Dropbox team ID when available."),
    teamName: s.nullableString("The Dropbox team name when available."),
  },
  {
    description: "Normalized current-account information from Dropbox.",
    required: [
      "accountId",
      "displayName",
      "abbreviatedName",
      "givenName",
      "surname",
      "email",
      "emailVerified",
      "disabled",
      "locale",
      "country",
      "accountType",
      "teamId",
      "teamName",
    ],
  },
);

const listFolderInputSchema = s.object(
  {
    path: textSchema("The folder path to list. Leave empty or omit it to list the root folder."),
    recursive: s.boolean({
      description: "Whether to list subfolders recursively.",
    }),
    includeDeleted: s.boolean({
      description: "Whether deleted entries should be included.",
    }),
    includeMountedFolders: s.boolean({
      description: "Whether mounted folders should be included in the response.",
    }),
    includeHasExplicitSharedMembers: s.boolean({
      description: "Whether Dropbox should include explicit shared-member flags when available.",
    }),
    limit: s.integer({
      description: "The maximum number of entries to return per page.",
      minimum: 1,
      maximum: 2000,
    }),
  },
  {
    description: "Input payload for listing a Dropbox folder.",
  },
);

const listFolderContinueInputSchema = s.object(
  {
    cursor: nonEmptyString("The cursor returned by a previous Dropbox folder listing."),
  },
  {
    description: "Input payload for continuing a Dropbox folder listing.",
    required: ["cursor"],
  },
);

const listFolderOutputSchema = s.object(
  {
    entries: s.array(dropboxMetadataSchema, {
      description: "The Dropbox entries returned in this page.",
    }),
    cursor: textSchema("The cursor for continuing the listing."),
    hasMore: s.boolean({
      description: "Whether more entries are available.",
    }),
  },
  {
    description: "A Dropbox folder listing page.",
    required: ["entries", "cursor", "hasMore"],
  },
);

const getMetadataInputSchema = s.object(
  {
    path: pathLikeField,
    includeDeleted: s.boolean({
      description: "Whether deleted metadata is allowed.",
    }),
    includeHasExplicitSharedMembers: s.boolean({
      description: "Whether Dropbox should include explicit shared-member flags when available.",
    }),
  },
  {
    description: "Input payload for retrieving Dropbox metadata.",
    required: ["path"],
  },
);

const metadataResultSchema = s.object(
  {
    metadata: dropboxMetadataSchema,
  },
  {
    description: "A normalized Dropbox metadata wrapper.",
    required: ["metadata"],
  },
);

const downloadFileInputSchema = s.object(
  {
    path: textSchema("The Dropbox file path, file ID, or revision ID to download."),
    fileName: nonEmptyString("Optional file name to use for the local transit file."),
  },
  {
    description: "Input payload for downloading a Dropbox file into transit storage.",
    required: ["path"],
  },
);

const downloadFileOutputSchema = s.requiredObject("A Dropbox file downloaded into local transit storage.", {
  fileId: nonEmptyString("The unique identifier of the downloaded Dropbox file."),
  name: nonEmptyString("The name of the downloaded Dropbox file."),
  mimeType: nonEmptyString("The MIME type of the downloaded file."),
  sizeBytes: s.nonNegativeInteger("The downloaded file size in bytes."),
  file: s.requiredObject("The downloaded file in local transit storage.", {
    fileId: nonEmptyString("The local transit file identifier."),
    downloadUrl: s.url("The local transit URL for downloading the stored file."),
    sizeBytes: s.nonNegativeInteger("The stored transit file size in bytes."),
    name: nonEmptyString("The stored transit file name."),
    mimeType: nonEmptyString("The stored transit file MIME type."),
  }),
});

const uploadFileInputSchema = s.object(
  {
    path: pathLikeField,
    text: textSchema("Inline UTF-8 text content to upload."),
    contentBase64: textSchema("Base64-encoded binary content to upload."),
    mimeType: textSchema("Optional MIME type override for inline text or base64 content."),
    mode: s.stringEnum([...writeModes], {
      description: "How Dropbox should handle conflicts at the destination path.",
    }),
    updateRev: textSchema("The required file revision when mode is update."),
    autorename: s.boolean({
      description: "Whether Dropbox should autorename on conflict when supported by the mode.",
    }),
    clientModified: s.dateTime("Optional client-side modification timestamp in ISO 8601 format."),
    mute: s.boolean({
      description: "Whether the upload should avoid client-side user notifications.",
    }),
    strictConflict: s.boolean({
      description: "Whether Dropbox should use stricter conflict detection.",
    }),
    contentHash: textSchema("Optional Dropbox content hash for integrity verification."),
  },
  {
    description: "Input payload for uploading a file to Dropbox.",
    required: ["path"],
  },
);

const createFolderInputSchema = s.object(
  {
    path: pathLikeField,
    autorename: s.boolean({
      description: "Whether Dropbox should autorename on conflict.",
    }),
  },
  {
    description: "Input payload for creating a Dropbox folder.",
    required: ["path"],
  },
);

const relocationInputSchema = s.object(
  {
    fromPath: textSchema("The Dropbox source path or ID."),
    toPath: textSchema("The Dropbox destination path or ID."),
    autorename: s.boolean({
      description: "Whether Dropbox should autorename on conflict.",
    }),
    allowOwnershipTransfer: s.boolean({
      description: "Whether ownership transfer is allowed when Dropbox supports it.",
    }),
  },
  {
    description: "Input payload for moving or copying Dropbox content.",
    required: ["fromPath", "toPath"],
  },
);

const deleteInputSchema = s.object(
  {
    path: textSchema("The Dropbox path or ID to delete."),
    parentRev: textSchema("Optional parent revision that must match when deleting a file."),
  },
  {
    description: "Input payload for deleting Dropbox content.",
    required: ["path"],
  },
);

const createSharedLinkInputSchema = s.object(
  {
    path: textSchema("The Dropbox path, file ID, or revision ID to share."),
    requestedVisibility: s.stringEnum([...sharedLinkVisibility], {
      description: "The requested visibility for the shared link.",
    }),
    audience: s.stringEnum([...sharedLinkAudience], {
      description: "The requested audience for the shared link.",
    }),
    access: s.stringEnum([...sharedLinkAccess], {
      description: "The requested access level for the shared link.",
    }),
    allowDownload: s.boolean({
      description: "Whether the shared link should allow downloads when supported.",
    }),
    password: textSchema("Optional password to apply when password visibility is used."),
    expiresAt: s.dateTime("Optional shared-link expiration timestamp in ISO 8601 format."),
  },
  {
    description: "Input payload for creating a Dropbox shared link.",
    required: ["path"],
  },
);

const createSharedLinkOutputSchema = s.object(
  {
    link: dropboxMetadataSchema,
  },
  {
    description: "A Dropbox shared-link creation result.",
    required: ["link"],
  },
);

const listSharedLinksInputSchema = s.object(
  {
    path: textSchema("Optional Dropbox path, file ID, or revision ID used to filter shared links."),
    cursor: textSchema("Optional cursor returned by a previous shared-link listing."),
    directOnly: s.boolean({
      description: "Whether parent-folder links should be excluded when path is provided.",
    }),
  },
  {
    description: "Input payload for listing Dropbox shared links.",
  },
);

const listSharedLinksOutputSchema = s.object(
  {
    links: s.array(dropboxMetadataSchema, {
      description: "The shared links returned by Dropbox.",
    }),
    cursor: s.nullableString("The cursor for continuing the listing when Dropbox provides it."),
    hasMore: s.boolean({
      description: "Whether more shared links are available.",
    }),
  },
  {
    description: "A Dropbox shared-link listing page.",
    required: ["links", "cursor", "hasMore"],
  },
);

const searchFilesInputSchema = s.object(
  {
    query: nonEmptyString("The Dropbox search query."),
    path: textSchema("Optional folder path that limits where Dropbox searches."),
    maxResults: s.integer({
      description: "The maximum number of search matches to return.",
      minimum: 1,
      maximum: 1000,
    }),
    fileStatus: s.stringEnum([...searchFileStatus], {
      description: "Whether Dropbox should search active or deleted content.",
    }),
    filenameOnly: s.boolean({
      description: "Whether Dropbox should search only file and folder names.",
    }),
    fileCategories: s.array(
      s.stringEnum([...fileCategories], {
        description: "A Dropbox file category.",
      }),
      {
        description: "Optional Dropbox file categories used to filter search results.",
      },
    ),
    fileExtensions: s.array(nonEmptyString("A file extension."), {
      description: "Optional file extensions used to filter search results.",
    }),
    orderBy: s.stringEnum([...searchOrderBy], {
      description: "How Dropbox should order search results.",
    }),
    includeHighlights: s.boolean({
      description: "Whether Dropbox should include match highlight spans when available.",
    }),
  },
  {
    description: "Input payload for searching Dropbox files and folders.",
    required: ["query"],
  },
);

const searchFilesContinueInputSchema = s.object(
  {
    cursor: nonEmptyString("The cursor returned by a previous Dropbox search."),
  },
  {
    description: "Input payload for continuing a Dropbox search.",
    required: ["cursor"],
  },
);

const searchMatchSchema = s.object(
  {
    matchType: textSchema("The Dropbox match type tag."),
    metadata: dropboxMetadataSchema,
    highlightSpans: s.nullable(
      s.array(jsonObjectSchema, {
        description: "Dropbox highlight spans when requested and returned.",
      }),
    ),
  },
  {
    description: "A normalized Dropbox search match.",
    required: ["matchType", "metadata", "highlightSpans"],
  },
);

const searchFilesOutputSchema = s.object(
  {
    matches: s.array(searchMatchSchema, {
      description: "The Dropbox search matches.",
    }),
    cursor: s.nullableString("The cursor for continuing the search when available."),
    hasMore: s.boolean({
      description: "Whether more search matches are available.",
    }),
  },
  {
    description: "A Dropbox search result page.",
    required: ["matches", "cursor", "hasMore"],
  },
);

const temporaryLinkInputSchema = s.object(
  {
    path: textSchema("The Dropbox file path or ID to create a temporary link for."),
  },
  {
    description: "Input payload for creating a Dropbox temporary file link.",
    required: ["path"],
  },
);

const temporaryLinkOutputSchema = s.object(
  {
    metadata: dropboxMetadataSchema,
    link: textSchema("The temporary Dropbox link."),
  },
  {
    description: "A Dropbox temporary link result.",
    required: ["metadata", "link"],
  },
);

const saveUrlInputSchema = s.object(
  {
    path: textSchema("The Dropbox destination path for the saved URL."),
    url: s.url("The publicly reachable URL Dropbox should save."),
  },
  {
    description: "Input payload for saving a URL into Dropbox.",
    required: ["path", "url"],
  },
);

const saveUrlJobStatusInputSchema = s.object(
  {
    asyncJobId: nonEmptyString("The Dropbox async job ID returned by save_url."),
  },
  {
    description: "Input payload for checking a Dropbox save_url job.",
    required: ["asyncJobId"],
  },
);

const saveUrlOutputSchema = s.object(
  {
    tag: textSchema("The Dropbox save_url result tag."),
    asyncJobId: s.nullableString("The async job ID when Dropbox continues in background."),
    metadata: s.nullable(dropboxMetadataSchema),
    failure: s.nullable(
      s.looseObject(
        {},
        {
          description: "Dropbox failure details when the job failed.",
        },
      ),
    ),
  },
  {
    description: "A normalized Dropbox save_url or save_url/check_job_status result.",
    required: ["tag", "asyncJobId", "metadata", "failure"],
  },
);

const listRevisionsInputSchema = s.object(
  {
    path: textSchema("The Dropbox file path or ID whose revisions should be listed."),
    mode: s.stringEnum([...revisionMode], {
      description: "Whether Dropbox should list revisions by path or by file ID.",
    }),
    beforeRev: textSchema("Optional revision used to page older revisions when mode is path."),
    limit: s.integer({
      description: "The maximum number of revisions to return.",
      minimum: 1,
      maximum: 100,
    }),
  },
  {
    description: "Input payload for listing Dropbox file revisions.",
    required: ["path"],
  },
);

const listRevisionsOutputSchema = s.object(
  {
    entries: s.array(dropboxMetadataSchema, {
      description: "The Dropbox file revision metadata entries.",
    }),
    isDeleted: s.boolean({
      description: "Whether the latest file entry is deleted.",
    }),
    serverDeleted: s.nullableString("The deletion timestamp when Dropbox returns one."),
    hasMore: s.boolean({
      description: "Whether more older revisions are available.",
    }),
  },
  {
    description: "A Dropbox file revision listing.",
    required: ["entries", "isDeleted", "serverDeleted", "hasMore"],
  },
);

const restoreInputSchema = s.object(
  {
    path: textSchema("The Dropbox file path to restore."),
    rev: nonEmptyString("The Dropbox revision ID to restore."),
  },
  {
    description: "Input payload for restoring a Dropbox file revision.",
    required: ["path", "rev"],
  },
);

const getSharedLinkMetadataInputSchema = s.object(
  {
    url: nonEmptyString("The Dropbox shared link URL."),
    path: textSchema("Optional path inside the shared link when the link points to a folder."),
  },
  {
    description: "Input payload for reading Dropbox shared-link metadata.",
    required: ["url"],
  },
);

const getSharedLinkFileInputSchema = s.object(
  {
    url: nonEmptyString("The Dropbox shared link URL."),
    path: textSchema("Optional path inside the shared link when the link points to a folder."),
    fileName: nonEmptyString("Optional file name to use for the local transit file."),
  },
  {
    description: "Input payload for downloading a Dropbox shared-link file into transit storage.",
    required: ["url"],
  },
);

const modifySharedLinkInputSchema = s.object(
  {
    url: nonEmptyString("The Dropbox shared link URL to modify."),
    requestedVisibility: s.stringEnum([...sharedLinkVisibility], {
      description: "The requested visibility for the shared link.",
    }),
    audience: s.stringEnum([...sharedLinkAudience], {
      description: "The requested audience for the shared link.",
    }),
    access: s.stringEnum([...sharedLinkAccess], {
      description: "The requested access level for the shared link.",
    }),
    allowDownload: s.boolean({
      description: "Whether the shared link should allow downloads when supported.",
    }),
    password: textSchema("Optional password to apply when password visibility is used."),
    expiresAt: s.dateTime("Optional shared-link expiration timestamp in ISO 8601 format."),
    removeExpiration: s.boolean({
      description: "Whether Dropbox should remove the existing shared-link expiration.",
    }),
  },
  {
    description: "Input payload for modifying Dropbox shared-link settings.",
    required: ["url"],
  },
);

const revokeSharedLinkInputSchema = s.object(
  {
    url: nonEmptyString("The Dropbox shared link URL to revoke."),
  },
  {
    description: "Input payload for revoking a Dropbox shared link.",
    required: ["url"],
  },
);

const revokeSharedLinkOutputSchema = s.object(
  {
    revoked: s.boolean({
      description: "Whether the shared link revoke call completed.",
    }),
  },
  {
    description: "A Dropbox shared-link revoke result.",
    required: ["revoked"],
  },
);

const getTagsInputSchema = s.object(
  {
    paths: s.array(pathLikeField, {
      description: "Dropbox file or folder paths to inspect.",
      minItems: 1,
    }),
  },
  {
    description: "Input payload for reading Dropbox tags.",
    required: ["paths"],
  },
);

const tagSchema = s.object(
  {
    tag: textSchema("The Dropbox tag union tag."),
    tagText: s.nullableString("The user-generated tag text when available."),
  },
  {
    description: "A normalized Dropbox tag.",
    required: ["tag", "tagText"],
  },
);

const pathTagsSchema = s.object(
  {
    path: textSchema("The Dropbox path whose tags were returned."),
    tags: s.array(tagSchema, {
      description: "The tags assigned to the path.",
    }),
  },
  {
    description: "Dropbox tags attached to one path.",
    required: ["path", "tags"],
  },
);

const getTagsOutputSchema = s.object(
  {
    pathsToTags: s.array(pathTagsSchema, {
      description: "Tags grouped by Dropbox path.",
    }),
  },
  {
    description: "A normalized Dropbox tags response.",
    required: ["pathsToTags"],
  },
);

export const dropboxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_account",
    description: "Get basic profile information for the current Dropbox account.",
    requiredScopes: [dropboxProviderScopes.accountInfoRead],
    providerPermissions: [dropboxProviderScopes.accountInfoRead],
    inputSchema: emptyInputSchema,
    outputSchema: currentAccountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_folder",
    description: "List files and folders inside one Dropbox folder.",
    requiredScopes: [dropboxProviderScopes.filesMetadataRead],
    providerPermissions: [dropboxProviderScopes.filesMetadataRead],
    inputSchema: listFolderInputSchema,
    outputSchema: listFolderOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_folder_continue",
    description: "Continue a previous Dropbox folder listing with a cursor.",
    requiredScopes: [dropboxProviderScopes.filesMetadataRead],
    providerPermissions: [dropboxProviderScopes.filesMetadataRead],
    inputSchema: listFolderContinueInputSchema,
    outputSchema: listFolderOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_metadata",
    description: "Get Dropbox metadata for one file or folder.",
    requiredScopes: [dropboxProviderScopes.filesMetadataRead],
    providerPermissions: [dropboxProviderScopes.filesMetadataRead],
    inputSchema: getMetadataInputSchema,
    outputSchema: metadataResultSchema,
  }),
  defineProviderAction(service, {
    name: "download_file",
    description: "Download one Dropbox file into local transit file storage.",
    requiredScopes: [dropboxProviderScopes.filesContentRead],
    providerPermissions: [dropboxProviderScopes.filesContentRead],
    inputSchema: downloadFileInputSchema,
    outputSchema: downloadFileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "upload_file",
    description: "Upload one file to Dropbox from inline text or base64 content.",
    requiredScopes: [dropboxProviderScopes.filesContentWrite],
    providerPermissions: [dropboxProviderScopes.filesContentWrite],
    inputSchema: uploadFileInputSchema,
    outputSchema: metadataResultSchema,
  }),
  defineProviderAction(service, {
    name: "create_folder",
    description: "Create one folder in Dropbox.",
    requiredScopes: [dropboxProviderScopes.filesContentWrite],
    providerPermissions: [dropboxProviderScopes.filesContentWrite],
    inputSchema: createFolderInputSchema,
    outputSchema: metadataResultSchema,
  }),
  defineProviderAction(service, {
    name: "move",
    description: "Move one file or folder to another Dropbox path.",
    requiredScopes: [dropboxProviderScopes.filesContentWrite],
    providerPermissions: [dropboxProviderScopes.filesContentWrite],
    inputSchema: relocationInputSchema,
    outputSchema: metadataResultSchema,
  }),
  defineProviderAction(service, {
    name: "copy",
    description: "Copy one file or folder to another Dropbox path.",
    requiredScopes: [dropboxProviderScopes.filesContentWrite],
    providerPermissions: [dropboxProviderScopes.filesContentWrite],
    inputSchema: relocationInputSchema,
    outputSchema: metadataResultSchema,
  }),
  defineProviderAction(service, {
    name: "delete",
    description: "Delete one file or folder from Dropbox.",
    requiredScopes: [dropboxProviderScopes.filesContentWrite],
    providerPermissions: [dropboxProviderScopes.filesContentWrite],
    inputSchema: deleteInputSchema,
    outputSchema: metadataResultSchema,
  }),
  defineProviderAction(service, {
    name: "create_shared_link",
    description: "Create one Dropbox shared link with optional custom settings.",
    requiredScopes: [dropboxProviderScopes.sharingWrite],
    providerPermissions: [dropboxProviderScopes.sharingWrite],
    inputSchema: createSharedLinkInputSchema,
    outputSchema: createSharedLinkOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_shared_links",
    description: "List Dropbox shared links for the current user or a specific path.",
    requiredScopes: [dropboxProviderScopes.sharingRead],
    providerPermissions: [dropboxProviderScopes.sharingRead],
    inputSchema: listSharedLinksInputSchema,
    outputSchema: listSharedLinksOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_files",
    description: "Search Dropbox files and folders with the official search_v2 endpoint.",
    requiredScopes: [dropboxProviderScopes.filesMetadataRead],
    providerPermissions: [dropboxProviderScopes.filesMetadataRead],
    inputSchema: searchFilesInputSchema,
    outputSchema: searchFilesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_files_continue",
    description: "Continue a previous Dropbox file search with a cursor.",
    requiredScopes: [dropboxProviderScopes.filesMetadataRead],
    providerPermissions: [dropboxProviderScopes.filesMetadataRead],
    inputSchema: searchFilesContinueInputSchema,
    outputSchema: searchFilesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_temporary_link",
    description: "Create a temporary direct-download Dropbox link for one file.",
    requiredScopes: [dropboxProviderScopes.filesContentRead],
    providerPermissions: [dropboxProviderScopes.filesContentRead],
    inputSchema: temporaryLinkInputSchema,
    outputSchema: temporaryLinkOutputSchema,
  }),
  defineProviderAction(service, {
    name: "save_url",
    description: "Ask Dropbox to save a public URL into a Dropbox file path.",
    requiredScopes: [dropboxProviderScopes.filesContentWrite],
    providerPermissions: [dropboxProviderScopes.filesContentWrite],
    inputSchema: saveUrlInputSchema,
    outputSchema: saveUrlOutputSchema,
  }),
  defineProviderAction(service, {
    name: "save_url_check_job_status",
    description: "Check the status of an asynchronous Dropbox save_url job.",
    requiredScopes: [dropboxProviderScopes.filesContentWrite],
    providerPermissions: [dropboxProviderScopes.filesContentWrite],
    inputSchema: saveUrlJobStatusInputSchema,
    outputSchema: saveUrlOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_revisions",
    description: "List revisions for one Dropbox file.",
    requiredScopes: [dropboxProviderScopes.filesMetadataRead],
    providerPermissions: [dropboxProviderScopes.filesMetadataRead],
    inputSchema: listRevisionsInputSchema,
    outputSchema: listRevisionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "restore",
    description: "Restore one Dropbox file to a previous revision.",
    requiredScopes: [dropboxProviderScopes.filesContentWrite],
    providerPermissions: [dropboxProviderScopes.filesContentWrite],
    inputSchema: restoreInputSchema,
    outputSchema: metadataResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_shared_link_metadata",
    description: "Get metadata for a Dropbox shared link.",
    requiredScopes: [dropboxProviderScopes.sharingRead],
    providerPermissions: [dropboxProviderScopes.sharingRead],
    inputSchema: getSharedLinkMetadataInputSchema,
    outputSchema: createSharedLinkOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_shared_link_file",
    description: "Download a Dropbox shared-link file into local transit file storage.",
    requiredScopes: [dropboxProviderScopes.sharingRead],
    providerPermissions: [dropboxProviderScopes.sharingRead],
    inputSchema: getSharedLinkFileInputSchema,
    outputSchema: downloadFileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "modify_shared_link",
    description: "Modify settings for an existing Dropbox shared link.",
    requiredScopes: [dropboxProviderScopes.sharingWrite],
    providerPermissions: [dropboxProviderScopes.sharingWrite],
    inputSchema: modifySharedLinkInputSchema,
    outputSchema: createSharedLinkOutputSchema,
  }),
  defineProviderAction(service, {
    name: "revoke_shared_link",
    description: "Revoke an existing Dropbox shared link.",
    requiredScopes: [dropboxProviderScopes.sharingWrite],
    providerPermissions: [dropboxProviderScopes.sharingWrite],
    inputSchema: revokeSharedLinkInputSchema,
    outputSchema: revokeSharedLinkOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_tags",
    description: "Get user-generated Dropbox tags for one or more files or folders.",
    requiredScopes: [dropboxProviderScopes.filesMetadataRead],
    providerPermissions: [dropboxProviderScopes.filesMetadataRead],
    inputSchema: getTagsInputSchema,
    outputSchema: getTagsOutputSchema,
  }),
];
