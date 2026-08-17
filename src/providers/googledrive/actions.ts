import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { googleDriveFullScope, googleDriveMetadataReadonlyScope, googleDriveReadonlyScope } from "./scopes.ts";

const service = "googledrive";

interface GoogledriveActionSource {
  name: string;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const actionSources: GoogledriveActionSource[] = [
  {
    name: "about.get",
    description: "Get Drive account information such as user details, quota, and supported capabilities.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fields: {
          type: "string",
          description: "The fields to include in the response.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {},
      additionalProperties: {},
    },
  },
  {
    name: "apps.get",
    description: "Get metadata for a specific Google Drive app by app ID.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        appId: {
          type: "string",
          minLength: 1,
          description: "The ID of the Google Drive app to retrieve.",
        },
      },
      required: ["appId"],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {},
      additionalProperties: {},
    },
  },
  {
    name: "changes.getStartPageToken",
    description: "Get the page token for monitoring future Drive changes.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        driveId: {
          type: "string",
          minLength: 1,
          description: "The ID of the shared drive for which the starting page token is requested.",
        },
        supportsAllDrives: {
          type: "boolean",
          description: "Whether the request supports both My Drives and shared drives.",
        },
        includeItemsFromAllDrives: {
          type: "boolean",
          description: "Whether both My Drive and shared drive items should be included in results.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        startPageToken: {
          type: "string",
          description: "The starting page token for listing future changes.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
      },
      required: ["startPageToken", "kind"],
      additionalProperties: false,
    },
  },
  {
    name: "changes.list",
    description: "List file and drive changes for incremental sync workflows.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        pageToken: {
          type: "string",
          minLength: 1,
          description: "The token for continuing a previous list request on the next page.",
        },
        pageSize: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "The maximum number of changes to return per page (1–1000).",
        },
        driveId: {
          type: "string",
          minLength: 1,
          description: "The shared drive from which changes are returned.",
        },
        spaces: {
          type: "string",
          minLength: 1,
          description: "A comma-separated list of spaces to query within the corpora (e.g. drive or appDataFolder).",
        },
        includeLabels: {
          type: "string",
          minLength: 1,
          description: "A comma-separated list of IDs of labels to include in the labelInfo part of the response.",
        },
        includeRemoved: {
          type: "boolean",
          description: "Whether to include changes indicating that items have been removed from the list of changes.",
        },
        restrictToMyDrive: {
          type: "boolean",
          description: "Whether to restrict the results to changes inside the My Drive hierarchy.",
        },
        supportsAllDrives: {
          type: "boolean",
          description: "Whether the request supports both My Drives and shared drives.",
        },
        includeCorpusRemovals: {
          type: "boolean",
          description:
            "Whether changes should include the file resource if the file is still accessible by the user at the time of the request, even when a file was removed from the list of changes.",
        },
        includeItemsFromAllDrives: {
          type: "boolean",
          description: "Whether both My Drive and shared drive items should be included in results.",
        },
        includePermissionsForView: {
          type: "string",
          minLength: 1,
          description: "Specifies which additional view's permissions to include in the response.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the change.",
              },
              kind: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The type of the resource.",
              },
              changeType: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The type of the change (file or drive).",
              },
              removed: {
                type: "boolean",
                description: "Whether the file or shared drive has been removed from this list of changes.",
              },
              time: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The time of this change (RFC 3339 date-time).",
              },
              fileId: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The ID of the file which changed.",
              },
              driveId: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The ID of the shared drive associated with this change.",
              },
              file: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "The unique identifier of the file.",
                  },
                  name: {
                    type: "string",
                    description: "The name of the file.",
                  },
                  mimeType: {
                    type: "string",
                    description: "The MIME type of the file.",
                  },
                  webViewLink: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "A link for opening the file in a relevant Google editor or viewer in a browser.",
                  },
                  createdTime: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The time at which the file was created (RFC 3339 date-time).",
                  },
                  modifiedTime: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The last time the file was modified by anyone (RFC 3339 date-time).",
                  },
                  sizeBytes: {
                    anyOf: [
                      {
                        type: "integer",
                        minimum: -9007199254740991,
                        maximum: 9007199254740991,
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The size of the file's content in bytes.",
                  },
                  driveId: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The ID of the shared drive the file belongs to.",
                  },
                  parents: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                    description: "The IDs of the parent folders containing the file.",
                  },
                  owners: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        displayName: {
                          anyOf: [
                            {
                              type: "string",
                            },
                            {
                              type: "null",
                            },
                          ],
                          description: "The display name of the owner.",
                        },
                        emailAddress: {
                          anyOf: [
                            {
                              type: "string",
                            },
                            {
                              type: "null",
                            },
                          ],
                          description: "The email address of the owner.",
                        },
                        permissionId: {
                          anyOf: [
                            {
                              type: "string",
                            },
                            {
                              type: "null",
                            },
                          ],
                          description: "The permission ID of the owner.",
                        },
                        photoLink: {
                          anyOf: [
                            {
                              type: "string",
                            },
                            {
                              type: "null",
                            },
                          ],
                          description: "A link to the owner's profile photo.",
                        },
                      },
                      required: ["displayName", "emailAddress", "permissionId", "photoLink"],
                      additionalProperties: false,
                    },
                    description: "The owners of the file.",
                  },
                  shared: {
                    type: "boolean",
                    description: "Whether the file has been shared.",
                  },
                  starred: {
                    type: "boolean",
                    description: "Whether the user has starred the file.",
                  },
                  trashed: {
                    type: "boolean",
                    description: "Whether the file has been trashed.",
                  },
                },
                required: [
                  "id",
                  "name",
                  "mimeType",
                  "webViewLink",
                  "createdTime",
                  "modifiedTime",
                  "sizeBytes",
                  "driveId",
                ],
                additionalProperties: false,
                description: "The updated state of the file, if the change is for a file and the file still exists.",
              },
            },
            required: ["id", "kind", "changeType", "time", "fileId", "driveId"],
            additionalProperties: false,
          },
          description: "The list of changes.",
        },
        nextPageToken: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The page token for the next page of changes.",
        },
        newStartPageToken: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The starting page token for future changes, present only if this is the last page of changes.",
        },
      },
      required: ["changes", "nextPageToken", "newStartPageToken"],
      additionalProperties: false,
    },
  },
  {
    name: "comments.get",
    description: "Get a specific comment on a Drive file by comment ID.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        commentId: {
          type: "string",
          minLength: 1,
          description: "The ID of the comment.",
        },
        includeDeleted: {
          type: "boolean",
          description: "Whether to return deleted comments.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the comment.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        anchor: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A region of the document represented as a JSON string.",
        },
        author: {
          type: "object",
          properties: {
            me: {
              type: "boolean",
              description: "Whether this user is the current authenticated user.",
            },
            kind: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The type of the resource.",
            },
            displayName: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The display name of the user.",
            },
            emailAddress: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The email address of the user.",
            },
            permissionId: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The permission ID of the user.",
            },
            photoLink: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "A link to the user's profile photo.",
            },
          },
          required: ["displayName", "emailAddress", "permissionId", "photoLink"],
          additionalProperties: false,
          description: "The author of the comment.",
        },
        content: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The plain text content of the comment.",
        },
        deleted: {
          type: "boolean",
          description: "Whether the comment has been deleted.",
        },
        resolved: {
          type: "boolean",
          description: "Whether the comment has been resolved by one of its replies.",
        },
        createdTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which the comment was created (RFC 3339 date-time).",
        },
        htmlContent: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The content of the comment with HTML formatting.",
        },
        modifiedTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The last time the comment or any of its replies was modified (RFC 3339 date-time).",
        },
        quotedFileContent: {
          type: "object",
          properties: {},
          additionalProperties: {},
          description: "The file content to which the comment refers.",
        },
        replies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the reply.",
              },
              kind: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The type of the resource.",
              },
              action: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The action this reply performed on the parent comment.",
              },
              author: {
                type: "object",
                properties: {
                  me: {
                    type: "boolean",
                    description: "Whether this user is the current authenticated user.",
                  },
                  kind: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The type of the resource.",
                  },
                  displayName: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The display name of the user.",
                  },
                  emailAddress: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The email address of the user.",
                  },
                  permissionId: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The permission ID of the user.",
                  },
                  photoLink: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "A link to the user's profile photo.",
                  },
                },
                required: ["displayName", "emailAddress", "permissionId", "photoLink"],
                additionalProperties: false,
                description: "The author of the reply.",
              },
              content: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The plain text content of the reply.",
              },
              deleted: {
                type: "boolean",
                description: "Whether the reply has been deleted.",
              },
              createdTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The time at which the reply was created (RFC 3339 date-time).",
              },
              htmlContent: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The content of the reply with HTML formatting.",
              },
              modifiedTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The last time the reply was modified (RFC 3339 date-time).",
              },
            },
            required: ["id", "kind", "content", "createdTime", "htmlContent", "modifiedTime"],
            additionalProperties: false,
          },
          description: "The full list of replies to the comment in order.",
        },
      },
      required: ["id", "kind", "anchor", "content", "createdTime", "htmlContent", "modifiedTime"],
      additionalProperties: false,
    },
  },
  {
    name: "comments.list",
    description: "List comments on a Drive file with pagination.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        fields: {
          type: "string",
          description: "The fields to include in the response.",
        },
        pageSize: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "The maximum number of comments to return per page (1–100).",
        },
        pageToken: {
          type: "string",
          minLength: 1,
          description: "The token for continuing a previous list request on the next page.",
        },
        includeDeleted: {
          type: "boolean",
          description: "Whether to include deleted comments in the results.",
        },
        startModifiedTime: {
          type: "string",
          minLength: 1,
          description: "Restricts results to comments modified after this RFC 3339 date-time.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        comments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the comment.",
              },
              kind: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The type of the resource.",
              },
              anchor: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "A region of the document represented as a JSON string.",
              },
              author: {
                type: "object",
                properties: {
                  me: {
                    type: "boolean",
                    description: "Whether this user is the current authenticated user.",
                  },
                  kind: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The type of the resource.",
                  },
                  displayName: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The display name of the user.",
                  },
                  emailAddress: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The email address of the user.",
                  },
                  permissionId: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The permission ID of the user.",
                  },
                  photoLink: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "A link to the user's profile photo.",
                  },
                },
                required: ["displayName", "emailAddress", "permissionId", "photoLink"],
                additionalProperties: false,
                description: "The author of the comment.",
              },
              content: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The plain text content of the comment.",
              },
              deleted: {
                type: "boolean",
                description: "Whether the comment has been deleted.",
              },
              resolved: {
                type: "boolean",
                description: "Whether the comment has been resolved by one of its replies.",
              },
              createdTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The time at which the comment was created (RFC 3339 date-time).",
              },
              htmlContent: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The content of the comment with HTML formatting.",
              },
              modifiedTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The last time the comment or any of its replies was modified (RFC 3339 date-time).",
              },
              quotedFileContent: {
                type: "object",
                properties: {},
                additionalProperties: {},
                description: "The file content to which the comment refers.",
              },
              replies: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      description: "The unique identifier of the reply.",
                    },
                    kind: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "The type of the resource.",
                    },
                    action: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "The action this reply performed on the parent comment.",
                    },
                    author: {
                      type: "object",
                      properties: {
                        me: {
                          type: "boolean",
                          description: "Whether this user is the current authenticated user.",
                        },
                        kind: {
                          anyOf: [
                            {
                              type: "string",
                            },
                            {
                              type: "null",
                            },
                          ],
                          description: "The type of the resource.",
                        },
                        displayName: {
                          anyOf: [
                            {
                              type: "string",
                            },
                            {
                              type: "null",
                            },
                          ],
                          description: "The display name of the user.",
                        },
                        emailAddress: {
                          anyOf: [
                            {
                              type: "string",
                            },
                            {
                              type: "null",
                            },
                          ],
                          description: "The email address of the user.",
                        },
                        permissionId: {
                          anyOf: [
                            {
                              type: "string",
                            },
                            {
                              type: "null",
                            },
                          ],
                          description: "The permission ID of the user.",
                        },
                        photoLink: {
                          anyOf: [
                            {
                              type: "string",
                            },
                            {
                              type: "null",
                            },
                          ],
                          description: "A link to the user's profile photo.",
                        },
                      },
                      required: ["displayName", "emailAddress", "permissionId", "photoLink"],
                      additionalProperties: false,
                      description: "The author of the reply.",
                    },
                    content: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "The plain text content of the reply.",
                    },
                    deleted: {
                      type: "boolean",
                      description: "Whether the reply has been deleted.",
                    },
                    createdTime: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "The time at which the reply was created (RFC 3339 date-time).",
                    },
                    htmlContent: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "The content of the reply with HTML formatting.",
                    },
                    modifiedTime: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "The last time the reply was modified (RFC 3339 date-time).",
                    },
                  },
                  required: ["id", "kind", "content", "createdTime", "htmlContent", "modifiedTime"],
                  additionalProperties: false,
                },
                description: "The full list of replies to the comment in order.",
              },
            },
            required: ["id", "kind", "anchor", "content", "createdTime", "htmlContent", "modifiedTime"],
            additionalProperties: false,
          },
          description: "The list of comments on the file.",
        },
        nextPageToken: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The page token for the next page of results, if any.",
        },
      },
      required: ["comments", "nextPageToken"],
      additionalProperties: false,
    },
  },
  {
    name: "drives.get",
    description: "Get a shared drive by drive ID.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        driveId: {
          type: "string",
          minLength: 1,
          description: "The ID of the shared drive.",
        },
        useDomainAdminAccess: {
          type: "boolean",
          description: "Issue the request as a domain administrator.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the shared drive.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        name: {
          type: "string",
          description: "The name of the shared drive.",
        },
        hidden: {
          type: "boolean",
          description: "Whether the shared drive is hidden from the default view.",
        },
        colorRgb: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The color of the shared drive as an RGB hex string.",
        },
        createdTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which the shared drive was created (RFC 3339 date-time).",
        },
        orgUnitId: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The organizational unit ID of the shared drive.",
        },
        themeId: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The ID of the theme from which the background image and color are set.",
        },
        backgroundImageLink: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A short-lived link to this shared drive's background image.",
        },
        capabilities: {
          type: "object",
          properties: {},
          additionalProperties: {},
          description: "Capabilities the current user has on this shared drive.",
        },
        restrictions: {
          type: "object",
          properties: {},
          additionalProperties: {},
          description: "A set of restrictions that apply to this shared drive or items inside this shared drive.",
        },
      },
      required: ["id", "kind", "name", "colorRgb", "createdTime", "orgUnitId", "themeId", "backgroundImageLink"],
      additionalProperties: false,
    },
  },
  {
    name: "drives.list",
    description: "List shared drives accessible to the connected account.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "A query string to filter the shared drives.",
        },
        pageSize: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "The maximum number of shared drives to return per page (1–100).",
        },
        pageToken: {
          type: "string",
          minLength: 1,
          description: "The token for continuing a previous list request on the next page.",
        },
        useDomainAdminAccess: {
          type: "boolean",
          description: "Issue the request as a domain administrator.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        drives: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the shared drive.",
              },
              kind: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The type of the resource.",
              },
              name: {
                type: "string",
                description: "The name of the shared drive.",
              },
              hidden: {
                type: "boolean",
                description: "Whether the shared drive is hidden from the default view.",
              },
              colorRgb: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The color of the shared drive as an RGB hex string.",
              },
              createdTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The time at which the shared drive was created (RFC 3339 date-time).",
              },
              orgUnitId: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The organizational unit ID of the shared drive.",
              },
              themeId: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The ID of the theme from which the background image and color are set.",
              },
              backgroundImageLink: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "A short-lived link to this shared drive's background image.",
              },
              capabilities: {
                type: "object",
                properties: {},
                additionalProperties: {},
                description: "Capabilities the current user has on this shared drive.",
              },
              restrictions: {
                type: "object",
                properties: {},
                additionalProperties: {},
                description: "A set of restrictions that apply to this shared drive or items inside this shared drive.",
              },
            },
            required: ["id", "kind", "name", "colorRgb", "createdTime", "orgUnitId", "themeId", "backgroundImageLink"],
            additionalProperties: false,
          },
          description: "The list of shared drives.",
        },
        nextPageToken: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The page token for the next page of results, if any.",
        },
      },
      required: ["drives", "nextPageToken"],
      additionalProperties: false,
    },
  },
  {
    name: "files.export",
    description:
      "Export a Google Workspace file to the requested MIME type and return a transit URL for the exported content.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        includeSharedDrives: {
          type: "boolean",
          description: "When true, includes files from shared drives.",
        },
        mimeType: {
          type: "string",
          minLength: 1,
          description: "The MIME type to export the file to (required for Google Workspace files).",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          description: "The unique identifier of the downloaded file.",
        },
        name: {
          type: "string",
          description: "The name of the downloaded file.",
        },
        mimeType: {
          type: "string",
          description: "The MIME type of the downloaded file content.",
        },
        sizeBytes: {
          anyOf: [
            {
              type: "integer",
              minimum: -9007199254740991,
              maximum: 9007199254740991,
            },
            {
              type: "null",
            },
          ],
          description: "The size of the downloaded file content in bytes.",
        },
        file: {
          type: "object",
          properties: {
            fileId: {
              type: "string",
              description: "The local transit file identifier.",
            },
            downloadUrl: {
              type: "string",
              description: "A local transit URL from which the exported file content can be retrieved.",
            },
            sizeBytes: {
              type: "integer",
              minimum: 0,
              description: "The exported file size in bytes.",
            },
            name: {
              type: "string",
              description: "The exported transit file name.",
            },
            mimeType: {
              type: "string",
              description: "The exported transit file MIME type.",
            },
          },
          required: ["fileId", "downloadUrl", "sizeBytes", "name", "mimeType"],
          additionalProperties: false,
          description: "The exported file stored in local transit storage.",
        },
      },
      required: ["fileId", "name", "mimeType", "sizeBytes", "file"],
      additionalProperties: false,
    },
  },
  {
    name: "files.get",
    description: "Get metadata for a Drive file by ID, or download stored file content with alt=media.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: s.object("Input parameters for getting Drive file metadata or content.", {
      fileId: s.nonEmptyString("The ID of the Google Drive file to retrieve."),
      includeSharedDrives: s.optional(s.boolean("Whether the request supports files in shared drives.")),
      alt: s.optional(
        s.literal("media", {
          description: "Return stored file content instead of metadata.",
        }),
      ),
      acknowledgeAbuse: s.optional(
        s.boolean("Whether the caller acknowledges the risk of downloading known malware or other abusive files."),
      ),
    }),
    outputSchema: s.anyOf("Drive file metadata or downloaded file content.", [
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the file.",
          },
          name: {
            type: "string",
            description: "The name of the file.",
          },
          mimeType: {
            type: "string",
            description: "The MIME type of the file.",
          },
          webViewLink: {
            anyOf: [
              {
                type: "string",
              },
              {
                type: "null",
              },
            ],
            description: "A link for opening the file in a relevant Google editor or viewer in a browser.",
          },
          createdTime: {
            anyOf: [
              {
                type: "string",
              },
              {
                type: "null",
              },
            ],
            description: "The time at which the file was created (RFC 3339 date-time).",
          },
          modifiedTime: {
            anyOf: [
              {
                type: "string",
              },
              {
                type: "null",
              },
            ],
            description: "The last time the file was modified by anyone (RFC 3339 date-time).",
          },
          sizeBytes: {
            anyOf: [
              {
                type: "integer",
                minimum: -9007199254740991,
                maximum: 9007199254740991,
              },
              {
                type: "null",
              },
            ],
            description: "The size of the file's content in bytes.",
          },
          driveId: {
            anyOf: [
              {
                type: "string",
              },
              {
                type: "null",
              },
            ],
            description: "The ID of the shared drive the file belongs to.",
          },
          parents: {
            type: "array",
            items: {
              type: "string",
            },
            description: "The IDs of the parent folders containing the file.",
          },
          owners: {
            type: "array",
            items: {
              type: "object",
              properties: {
                displayName: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  description: "The display name of the owner.",
                },
                emailAddress: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  description: "The email address of the owner.",
                },
                permissionId: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  description: "The permission ID of the owner.",
                },
                photoLink: {
                  anyOf: [
                    {
                      type: "string",
                    },
                    {
                      type: "null",
                    },
                  ],
                  description: "A link to the owner's profile photo.",
                },
              },
              required: ["displayName", "emailAddress", "permissionId", "photoLink"],
              additionalProperties: false,
            },
            description: "The owners of the file.",
          },
          shared: {
            type: "boolean",
            description: "Whether the file has been shared.",
          },
          starred: {
            type: "boolean",
            description: "Whether the user has starred the file.",
          },
          trashed: {
            type: "boolean",
            description: "Whether the file has been trashed.",
          },
        },
        required: ["id", "name", "mimeType", "webViewLink", "createdTime", "modifiedTime", "sizeBytes", "driveId"],
        additionalProperties: false,
      },
      s.object("The downloaded Google Drive file stored in local transit storage.", {
        fileId: s.nonEmptyString("The Google Drive file ID returned by the metadata request."),
        name: s.nonEmptyString("The original Google Drive file name."),
        mimeType: s.nonEmptyString("The Google Drive file MIME type."),
        sizeBytes: s.nonNegativeInteger("The downloaded file size in bytes."),
        file: s.object("The downloaded content in local transit file storage.", {
          fileId: s.nonEmptyString("The local transit file identifier."),
          downloadUrl: s.url("The local transit URL for downloading the stored file."),
          sizeBytes: s.nonNegativeInteger("The stored transit file size in bytes."),
          name: s.nonEmptyString("The stored transit file name."),
          mimeType: s.nonEmptyString("The stored transit file MIME type."),
        }),
      }),
    ]),
  },
  {
    name: "files.list",
    description: "List Google Drive files using the official Drive query and pagination parameters.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        corpora: {
          type: "string",
          description: "Bodies of items to which the query applies.",
        },
        corpus: {
          type: "string",
          description: "The source of files to list.",
        },
        driveId: {
          type: "string",
          minLength: 1,
          description: "ID of the shared drive to search.",
        },
        includeItemsFromAllDrives: {
          type: "boolean",
          description: "Whether both My Drive and shared drive items should be included in results.",
        },
        includeLabels: {
          type: "string",
          description: "A comma-separated list of label IDs to include in labelInfo.",
        },
        includePermissionsForView: {
          type: "string",
          description: "Specifies which additional view's permissions to include in the response.",
        },
        orderBy: {
          type: "string",
          description: "A comma-separated list of sort keys.",
        },
        pageSize: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "The maximum number of files to return per page.",
        },
        pageToken: {
          type: "string",
          minLength: 1,
          description: "The token for continuing a previous list request.",
        },
        q: {
          type: "string",
          description: "A Google Drive query string for filtering files.",
        },
        spaces: {
          type: "string",
          description: "A comma-separated list of spaces to query.",
        },
        supportsAllDrives: {
          type: "boolean",
          description: "Whether the request supports both My Drives and shared drives.",
        },
        teamDriveId: {
          type: "string",
          minLength: 1,
          description: "Deprecated Team Drive ID.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the file.",
              },
              name: {
                type: "string",
                description: "The name of the file.",
              },
              mimeType: {
                type: "string",
                description: "The MIME type of the file.",
              },
              webViewLink: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "A link for opening the file in a relevant Google editor or viewer in a browser.",
              },
              createdTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The time at which the file was created (RFC 3339 date-time).",
              },
              modifiedTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The last time the file was modified by anyone (RFC 3339 date-time).",
              },
              sizeBytes: {
                anyOf: [
                  {
                    type: "integer",
                    minimum: -9007199254740991,
                    maximum: 9007199254740991,
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The size of the file's content in bytes.",
              },
              driveId: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The ID of the shared drive the file belongs to.",
              },
              parents: {
                type: "array",
                items: {
                  type: "string",
                },
                description: "The IDs of the parent folders containing the file.",
              },
              owners: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    displayName: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "The display name of the owner.",
                    },
                    emailAddress: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "The email address of the owner.",
                    },
                    permissionId: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "The permission ID of the owner.",
                    },
                    photoLink: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "A link to the owner's profile photo.",
                    },
                  },
                  required: ["displayName", "emailAddress", "permissionId", "photoLink"],
                  additionalProperties: false,
                },
                description: "The owners of the file.",
              },
              shared: {
                type: "boolean",
                description: "Whether the file has been shared.",
              },
              starred: {
                type: "boolean",
                description: "Whether the user has starred the file.",
              },
              trashed: {
                type: "boolean",
                description: "Whether the file has been trashed.",
              },
            },
            required: ["id", "name", "mimeType", "webViewLink", "createdTime", "modifiedTime", "sizeBytes", "driveId"],
            additionalProperties: false,
          },
          description: "The list of files matching the search query.",
        },
        nextPageToken: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The page token for the next page of results, if any.",
        },
      },
      required: ["files", "nextPageToken"],
      additionalProperties: false,
    },
  },
  {
    name: "files.listLabels",
    description: "List the Drive labels currently applied to a file.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        pageToken: {
          type: "string",
          minLength: 1,
          description: "The token for continuing a previous list request on the next page.",
        },
        maxResults: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "The maximum number of labels to return per page (1–100).",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        labels: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the label.",
              },
              kind: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The type of the resource.",
              },
              revisionId: {
                type: "string",
                description: "The revision ID of the label.",
              },
              fields: {
                type: "object",
                propertyNames: {
                  type: "string",
                },
                additionalProperties: {
                  type: "object",
                  properties: {
                    valueType: {
                      type: "string",
                      description: "The type of the label field value.",
                    },
                    text: {
                      type: "array",
                      items: {
                        type: "string",
                      },
                      description: "The text values of the field.",
                    },
                    integer: {
                      type: "array",
                      items: {
                        type: "integer",
                        minimum: -9007199254740991,
                        maximum: 9007199254740991,
                      },
                      description: "The integer values of the field.",
                    },
                    selection: {
                      type: "array",
                      items: {
                        type: "string",
                      },
                      description: "The selection option IDs of the field.",
                    },
                    dateString: {
                      type: "array",
                      items: {
                        type: "string",
                      },
                      description: "The date values of the field as RFC 3339 date strings.",
                    },
                    user: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          me: {
                            type: "boolean",
                            description: "Whether this user is the current authenticated user.",
                          },
                          kind: {
                            anyOf: [
                              {
                                type: "string",
                              },
                              {
                                type: "null",
                              },
                            ],
                            description: "The type of the resource.",
                          },
                          displayName: {
                            anyOf: [
                              {
                                type: "string",
                              },
                              {
                                type: "null",
                              },
                            ],
                            description: "The display name of the user.",
                          },
                          emailAddress: {
                            anyOf: [
                              {
                                type: "string",
                              },
                              {
                                type: "null",
                              },
                            ],
                            description: "The email address of the user.",
                          },
                          permissionId: {
                            anyOf: [
                              {
                                type: "string",
                              },
                              {
                                type: "null",
                              },
                            ],
                            description: "The permission ID of the user.",
                          },
                          photoLink: {
                            anyOf: [
                              {
                                type: "string",
                              },
                              {
                                type: "null",
                              },
                            ],
                            description: "A link to the user's profile photo.",
                          },
                        },
                        required: ["displayName", "emailAddress", "permissionId", "photoLink"],
                        additionalProperties: false,
                      },
                      description: "The user values of the field.",
                    },
                  },
                  required: ["valueType"],
                  additionalProperties: false,
                },
                description: "A map of the label's fields, keyed by field ID.",
              },
            },
            required: ["id", "kind", "revisionId", "fields"],
            additionalProperties: false,
          },
          description: "The list of labels applied to the file.",
        },
        nextPageToken: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The page token for the next page of results, if any.",
        },
      },
      required: ["labels", "nextPageToken"],
      additionalProperties: false,
    },
  },
  {
    name: "permissions.get",
    description: "Get a specific permission on a Drive file or shared drive by permission ID.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        permissionId: {
          type: "string",
          minLength: 1,
          description: "The ID of the permission.",
        },
        fields: {
          type: "string",
          description: "The fields to include in the response.",
        },
        supportsAllDrives: {
          type: "boolean",
          description: "Whether the request supports both My Drives and shared drives.",
        },
        useDomainAdminAccess: {
          type: "boolean",
          description: "Issue the request as a domain administrator.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the permission.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        role: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The role granted by this permission (e.g. owner, writer, reader).",
        },
        type: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of grantee (user, group, domain, or anyone).",
        },
        domain: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The domain to which this permission refers.",
        },
        deleted: {
          type: "boolean",
          description: "Whether the account associated with this permission has been deleted.",
        },
        photoLink: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A link to the user's profile photo.",
        },
        displayName: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The display name of the user or group granted this permission.",
        },
        emailAddress: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The email address of the user or group granted this permission.",
        },
        pendingOwner: {
          type: "boolean",
          description: "Whether the account associated with this permission is a pending owner.",
        },
        expirationTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which this permission will expire (RFC 3339 date-time).",
        },
        allowFileDiscovery: {
          type: "boolean",
          description: "Whether the permission allows the file to be discovered through search.",
        },
        permissionDetails: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The primary role for this user.",
              },
              inherited: {
                type: "boolean",
                description: "Whether this permission is inherited from a parent folder.",
              },
              inheritedFrom: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The ID of the item from which this permission is inherited.",
              },
              permissionType: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The permission type for this user.",
              },
            },
            required: ["role", "inheritedFrom", "permissionType"],
            additionalProperties: false,
          },
          description: "Details of whether the permission on the shared drive item is inherited or directly set.",
        },
      },
      required: ["id", "kind", "role", "type", "domain", "photoLink", "displayName", "emailAddress", "expirationTime"],
      additionalProperties: false,
    },
  },
  {
    name: "permissions.list",
    description: "List permissions on a Drive file or shared drive.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        fields: {
          type: "string",
          description: "The fields to include in the response.",
        },
        pageSize: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "The maximum number of permissions to return per page (1–100).",
        },
        pageToken: {
          type: "string",
          minLength: 1,
          description: "The token for continuing a previous list request on the next page.",
        },
        supportsAllDrives: {
          type: "boolean",
          description: "Whether the request supports both My Drives and shared drives.",
        },
        useDomainAdminAccess: {
          type: "boolean",
          description: "Issue the request as a domain administrator.",
        },
        includePermissionsForView: {
          type: "string",
          const: "published",
          description: "Specifies which additional view's permissions to include in the response.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        permissions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the permission.",
              },
              kind: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The type of the resource.",
              },
              role: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The role granted by this permission (e.g. owner, writer, reader).",
              },
              type: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The type of grantee (user, group, domain, or anyone).",
              },
              domain: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The domain to which this permission refers.",
              },
              deleted: {
                type: "boolean",
                description: "Whether the account associated with this permission has been deleted.",
              },
              photoLink: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "A link to the user's profile photo.",
              },
              displayName: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The display name of the user or group granted this permission.",
              },
              emailAddress: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The email address of the user or group granted this permission.",
              },
              pendingOwner: {
                type: "boolean",
                description: "Whether the account associated with this permission is a pending owner.",
              },
              expirationTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The time at which this permission will expire (RFC 3339 date-time).",
              },
              allowFileDiscovery: {
                type: "boolean",
                description: "Whether the permission allows the file to be discovered through search.",
              },
              permissionDetails: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    role: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "The primary role for this user.",
                    },
                    inherited: {
                      type: "boolean",
                      description: "Whether this permission is inherited from a parent folder.",
                    },
                    inheritedFrom: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "The ID of the item from which this permission is inherited.",
                    },
                    permissionType: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "The permission type for this user.",
                    },
                  },
                  required: ["role", "inheritedFrom", "permissionType"],
                  additionalProperties: false,
                },
                description: "Details of whether the permission on the shared drive item is inherited or directly set.",
              },
            },
            required: [
              "id",
              "kind",
              "role",
              "type",
              "domain",
              "photoLink",
              "displayName",
              "emailAddress",
              "expirationTime",
            ],
            additionalProperties: false,
          },
          description: "The list of permissions for the file or shared drive.",
        },
        nextPageToken: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The page token for the next page of results, if any.",
        },
      },
      required: ["permissions", "nextPageToken"],
      additionalProperties: false,
    },
  },
  {
    name: "replies.get",
    description: "Get a specific reply under a Drive file comment.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        commentId: {
          type: "string",
          minLength: 1,
          description: "The ID of the comment.",
        },
        replyId: {
          type: "string",
          minLength: 1,
          description: "The ID of the reply.",
        },
        includeDeleted: {
          type: "boolean",
          description: "Whether to return deleted replies.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the reply.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        action: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The action this reply performed on the parent comment.",
        },
        author: {
          type: "object",
          properties: {
            me: {
              type: "boolean",
              description: "Whether this user is the current authenticated user.",
            },
            kind: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The type of the resource.",
            },
            displayName: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The display name of the user.",
            },
            emailAddress: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The email address of the user.",
            },
            permissionId: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The permission ID of the user.",
            },
            photoLink: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "A link to the user's profile photo.",
            },
          },
          required: ["displayName", "emailAddress", "permissionId", "photoLink"],
          additionalProperties: false,
          description: "The author of the reply.",
        },
        content: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The plain text content of the reply.",
        },
        deleted: {
          type: "boolean",
          description: "Whether the reply has been deleted.",
        },
        createdTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which the reply was created (RFC 3339 date-time).",
        },
        htmlContent: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The content of the reply with HTML formatting.",
        },
        modifiedTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The last time the reply was modified (RFC 3339 date-time).",
        },
      },
      required: ["id", "kind", "content", "createdTime", "htmlContent", "modifiedTime"],
      additionalProperties: false,
    },
  },
  {
    name: "replies.list",
    description: "List replies under a Drive file comment with pagination.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        commentId: {
          type: "string",
          minLength: 1,
          description: "The ID of the comment.",
        },
        fields: {
          type: "string",
          description: "The fields to include in the response.",
        },
        pageSize: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "The maximum number of replies to return per page (1–100).",
        },
        pageToken: {
          type: "string",
          minLength: 1,
          description: "The token for continuing a previous list request on the next page.",
        },
        includeDeleted: {
          type: "boolean",
          description: "Whether to include deleted replies in the results.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        replies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the reply.",
              },
              kind: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The type of the resource.",
              },
              action: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The action this reply performed on the parent comment.",
              },
              author: {
                type: "object",
                properties: {
                  me: {
                    type: "boolean",
                    description: "Whether this user is the current authenticated user.",
                  },
                  kind: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The type of the resource.",
                  },
                  displayName: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The display name of the user.",
                  },
                  emailAddress: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The email address of the user.",
                  },
                  permissionId: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The permission ID of the user.",
                  },
                  photoLink: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "A link to the user's profile photo.",
                  },
                },
                required: ["displayName", "emailAddress", "permissionId", "photoLink"],
                additionalProperties: false,
                description: "The author of the reply.",
              },
              content: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The plain text content of the reply.",
              },
              deleted: {
                type: "boolean",
                description: "Whether the reply has been deleted.",
              },
              createdTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The time at which the reply was created (RFC 3339 date-time).",
              },
              htmlContent: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The content of the reply with HTML formatting.",
              },
              modifiedTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The last time the reply was modified (RFC 3339 date-time).",
              },
            },
            required: ["id", "kind", "content", "createdTime", "htmlContent", "modifiedTime"],
            additionalProperties: false,
          },
          description: "The list of replies to the comment.",
        },
        nextPageToken: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The page token for the next page of results, if any.",
        },
      },
      required: ["replies", "nextPageToken"],
      additionalProperties: false,
    },
  },
  {
    name: "revisions.get",
    description: "Get metadata for a specific Drive file revision.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        revisionId: {
          type: "string",
          minLength: 1,
          description: "The ID of the revision.",
        },
        acknowledgeAbuse: {
          type: "boolean",
          description: "Whether to acknowledge the risk of downloading known malware or other abusive files.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the revision.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        mimeType: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The MIME type of the revision.",
        },
        modifiedTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The last time the revision was modified (RFC 3339 date-time).",
        },
        sizeBytes: {
          anyOf: [
            {
              type: "integer",
              minimum: -9007199254740991,
              maximum: 9007199254740991,
            },
            {
              type: "null",
            },
          ],
          description: "The size of the revision's content in bytes.",
        },
        published: {
          type: "boolean",
          description: "Whether this revision is published.",
        },
        keepForever: {
          type: "boolean",
          description: "Whether to keep this revision forever, even if it is no longer the head revision.",
        },
        publishAuto: {
          type: "boolean",
          description: "Whether subsequent revisions will be automatically republished.",
        },
        publishedOutsideDomain: {
          type: "boolean",
          description: "Whether this revision is published outside the domain.",
        },
        publishedLink: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A link to the published revision.",
        },
        originalFilename: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The original filename used to create this revision.",
        },
        md5Checksum: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The MD5 checksum of the revision's content.",
        },
        lastModifyingUser: {
          type: "object",
          properties: {
            me: {
              type: "boolean",
              description: "Whether this user is the current authenticated user.",
            },
            kind: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The type of the resource.",
            },
            displayName: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The display name of the user.",
            },
            emailAddress: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The email address of the user.",
            },
            permissionId: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The permission ID of the user.",
            },
            photoLink: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "A link to the user's profile photo.",
            },
          },
          required: ["displayName", "emailAddress", "permissionId", "photoLink"],
          additionalProperties: false,
          description: "The last user to modify this revision.",
        },
        exportLinks: {
          type: "object",
          propertyNames: {
            type: "string",
          },
          additionalProperties: {
            type: "string",
          },
          description: "Links for exporting Docs Editors files to specific formats.",
        },
      },
      required: [
        "id",
        "kind",
        "mimeType",
        "modifiedTime",
        "sizeBytes",
        "publishedLink",
        "originalFilename",
        "md5Checksum",
      ],
      additionalProperties: false,
    },
  },
  {
    name: "revisions.list",
    description: "List revision metadata for a Drive file.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        pageSize: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "The maximum number of revisions to return per page (1–1000).",
        },
        pageToken: {
          type: "string",
          minLength: 1,
          description: "The token for continuing a previous list request on the next page.",
        },
        supportsAllDrives: {
          type: "boolean",
          description: "Whether the request supports both My Drives and shared drives.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        revisions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the revision.",
              },
              kind: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The type of the resource.",
              },
              mimeType: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The MIME type of the revision.",
              },
              modifiedTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The last time the revision was modified (RFC 3339 date-time).",
              },
              sizeBytes: {
                anyOf: [
                  {
                    type: "integer",
                    minimum: -9007199254740991,
                    maximum: 9007199254740991,
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The size of the revision's content in bytes.",
              },
              published: {
                type: "boolean",
                description: "Whether this revision is published.",
              },
              keepForever: {
                type: "boolean",
                description: "Whether to keep this revision forever, even if it is no longer the head revision.",
              },
              publishAuto: {
                type: "boolean",
                description: "Whether subsequent revisions will be automatically republished.",
              },
              publishedOutsideDomain: {
                type: "boolean",
                description: "Whether this revision is published outside the domain.",
              },
              publishedLink: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "A link to the published revision.",
              },
              originalFilename: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The original filename used to create this revision.",
              },
              md5Checksum: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The MD5 checksum of the revision's content.",
              },
              lastModifyingUser: {
                type: "object",
                properties: {
                  me: {
                    type: "boolean",
                    description: "Whether this user is the current authenticated user.",
                  },
                  kind: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The type of the resource.",
                  },
                  displayName: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The display name of the user.",
                  },
                  emailAddress: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The email address of the user.",
                  },
                  permissionId: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The permission ID of the user.",
                  },
                  photoLink: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "A link to the user's profile photo.",
                  },
                },
                required: ["displayName", "emailAddress", "permissionId", "photoLink"],
                additionalProperties: false,
                description: "The last user to modify this revision.",
              },
              exportLinks: {
                type: "object",
                propertyNames: {
                  type: "string",
                },
                additionalProperties: {
                  type: "string",
                },
                description: "Links for exporting Docs Editors files to specific formats.",
              },
            },
            required: [
              "id",
              "kind",
              "mimeType",
              "modifiedTime",
              "sizeBytes",
              "publishedLink",
              "originalFilename",
              "md5Checksum",
            ],
            additionalProperties: false,
          },
          description: "The list of revisions for the file.",
        },
        nextPageToken: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The page token for the next page of results, if any.",
        },
      },
      required: ["revisions", "nextPageToken"],
      additionalProperties: false,
    },
  },
  {
    name: "accessproposals.list",
    description: "List pending access proposals for a specific Drive file.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        includeSharedDrives: {
          type: "boolean",
          description: "When true, includes files from shared drives.",
        },
        pageSize: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "The maximum number of items to return per page (1–100).",
        },
        pageToken: {
          type: "string",
          minLength: 1,
          description: "The token for continuing a previous list request on the next page.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        accessProposals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fileId: {
                type: "string",
                description: "The ID of the file to which this access proposal applies.",
              },
              proposalId: {
                type: "string",
                description: "The unique identifier of the access proposal.",
              },
              createTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The time when the access proposal was created (RFC 3339 date-time).",
              },
              requestMessage: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The message included with the access request.",
              },
              recipientEmailAddress: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The email address of the user who received the access proposal.",
              },
              requesterEmailAddress: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The email address of the user who requested access.",
              },
              rolesAndViews: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    role: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "The role of the access proposal.",
                    },
                    view: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                      description: "The view of the access proposal.",
                    },
                  },
                  required: ["role", "view"],
                  additionalProperties: false,
                },
                description: "The roles and views requested in the access proposal.",
              },
            },
            required: [
              "fileId",
              "proposalId",
              "createTime",
              "requestMessage",
              "recipientEmailAddress",
              "requesterEmailAddress",
            ],
            additionalProperties: false,
          },
          description: "The list of access proposals for the file.",
        },
        nextPageToken: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The page token for the next page of results, if any.",
        },
      },
      required: ["accessProposals", "nextPageToken"],
      additionalProperties: false,
    },
  },
  {
    name: "approvals.list",
    description: "List approvals associated with a specific Drive file.",
    requiredScopes: [googleDriveReadonlyScope, googleDriveMetadataReadonlyScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        includeSharedDrives: {
          type: "boolean",
          description: "When true, includes files from shared drives.",
        },
        pageSize: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "The maximum number of items to return per page (1–100).",
        },
        pageToken: {
          type: "string",
          minLength: 1,
          description: "The token for continuing a previous list request on the next page.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        approvals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fileId: {
                type: "string",
                description: "The ID of the file to which this approval applies.",
              },
              approvalId: {
                type: "string",
                description: "The unique identifier of the approval.",
              },
              status: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The current status of the approval.",
              },
              createTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The time when the approval was created (RFC 3339 date-time).",
              },
              requestMessage: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The message included with the approval request.",
              },
              requesterEmailAddress: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The email address of the user who requested the approval.",
              },
            },
            required: ["fileId", "approvalId", "status", "createTime", "requestMessage", "requesterEmailAddress"],
            additionalProperties: false,
          },
          description: "The list of approvals for the file.",
        },
        nextPageToken: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The page token for the next page of results, if any.",
        },
      },
      required: ["approvals", "nextPageToken"],
      additionalProperties: false,
    },
  },
  {
    name: "comments.create",
    description: "Create a comment on a Drive file, optionally with anchor or quoted file content.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        content: {
          type: "string",
          minLength: 1,
          description: "The plain text content of the comment.",
        },
        anchor: {
          type: "string",
          description: "A region of the document to anchor the comment to, as a JSON string.",
        },
        quoted_file_content_value: {
          type: "string",
          description: "The value of the quoted file content to include in the comment.",
        },
        quoted_file_content_mime_type: {
          type: "string",
          minLength: 1,
          description: "The MIME type of the quoted file content.",
        },
      },
      required: ["content"],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the comment.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        anchor: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A region of the document represented as a JSON string.",
        },
        author: {
          type: "object",
          properties: {
            me: {
              type: "boolean",
              description: "Whether this user is the current authenticated user.",
            },
            kind: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The type of the resource.",
            },
            displayName: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The display name of the user.",
            },
            emailAddress: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The email address of the user.",
            },
            permissionId: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The permission ID of the user.",
            },
            photoLink: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "A link to the user's profile photo.",
            },
          },
          required: ["displayName", "emailAddress", "permissionId", "photoLink"],
          additionalProperties: false,
          description: "The author of the comment.",
        },
        content: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The plain text content of the comment.",
        },
        deleted: {
          type: "boolean",
          description: "Whether the comment has been deleted.",
        },
        resolved: {
          type: "boolean",
          description: "Whether the comment has been resolved by one of its replies.",
        },
        createdTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which the comment was created (RFC 3339 date-time).",
        },
        htmlContent: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The content of the comment with HTML formatting.",
        },
        modifiedTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The last time the comment or any of its replies was modified (RFC 3339 date-time).",
        },
        quotedFileContent: {
          type: "object",
          properties: {},
          additionalProperties: {},
          description: "The file content to which the comment refers.",
        },
        replies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the reply.",
              },
              kind: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The type of the resource.",
              },
              action: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The action this reply performed on the parent comment.",
              },
              author: {
                type: "object",
                properties: {
                  me: {
                    type: "boolean",
                    description: "Whether this user is the current authenticated user.",
                  },
                  kind: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The type of the resource.",
                  },
                  displayName: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The display name of the user.",
                  },
                  emailAddress: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The email address of the user.",
                  },
                  permissionId: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The permission ID of the user.",
                  },
                  photoLink: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "A link to the user's profile photo.",
                  },
                },
                required: ["displayName", "emailAddress", "permissionId", "photoLink"],
                additionalProperties: false,
                description: "The author of the reply.",
              },
              content: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The plain text content of the reply.",
              },
              deleted: {
                type: "boolean",
                description: "Whether the reply has been deleted.",
              },
              createdTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The time at which the reply was created (RFC 3339 date-time).",
              },
              htmlContent: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The content of the reply with HTML formatting.",
              },
              modifiedTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The last time the reply was modified (RFC 3339 date-time).",
              },
            },
            required: ["id", "kind", "content", "createdTime", "htmlContent", "modifiedTime"],
            additionalProperties: false,
          },
          description: "The full list of replies to the comment in order.",
        },
      },
      required: ["id", "kind", "anchor", "content", "createdTime", "htmlContent", "modifiedTime"],
      additionalProperties: false,
    },
  },
  {
    name: "comments.delete",
    description: "Permanently delete a comment thread from a Drive file.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        commentId: {
          type: "string",
          minLength: 1,
          description: "The ID of the comment.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          description: "The ID of the file from which the comment was deleted.",
        },
        commentId: {
          type: "string",
          description: "The ID of the deleted comment.",
        },
        deleted: {
          type: "boolean",
          const: true,
          description: "Indicates that the comment was successfully deleted.",
        },
      },
      required: ["fileId", "commentId", "deleted"],
      additionalProperties: false,
    },
  },
  {
    name: "comments.update",
    description: "Update the content of an existing Drive file comment.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        commentId: {
          type: "string",
          minLength: 1,
          description: "The ID of the comment.",
        },
        fields: {
          type: "string",
          description: "The fields to include in the response.",
        },
        content: {
          type: "string",
          minLength: 1,
          description: "The new plain text content of the comment.",
        },
        resolved: {
          type: "boolean",
          description: "Whether the comment should be marked as resolved.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the comment.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        anchor: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A region of the document represented as a JSON string.",
        },
        author: {
          type: "object",
          properties: {
            me: {
              type: "boolean",
              description: "Whether this user is the current authenticated user.",
            },
            kind: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The type of the resource.",
            },
            displayName: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The display name of the user.",
            },
            emailAddress: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The email address of the user.",
            },
            permissionId: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The permission ID of the user.",
            },
            photoLink: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "A link to the user's profile photo.",
            },
          },
          required: ["displayName", "emailAddress", "permissionId", "photoLink"],
          additionalProperties: false,
          description: "The author of the comment.",
        },
        content: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The plain text content of the comment.",
        },
        deleted: {
          type: "boolean",
          description: "Whether the comment has been deleted.",
        },
        resolved: {
          type: "boolean",
          description: "Whether the comment has been resolved by one of its replies.",
        },
        createdTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which the comment was created (RFC 3339 date-time).",
        },
        htmlContent: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The content of the comment with HTML formatting.",
        },
        modifiedTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The last time the comment or any of its replies was modified (RFC 3339 date-time).",
        },
        quotedFileContent: {
          type: "object",
          properties: {},
          additionalProperties: {},
          description: "The file content to which the comment refers.",
        },
        replies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the reply.",
              },
              kind: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The type of the resource.",
              },
              action: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The action this reply performed on the parent comment.",
              },
              author: {
                type: "object",
                properties: {
                  me: {
                    type: "boolean",
                    description: "Whether this user is the current authenticated user.",
                  },
                  kind: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The type of the resource.",
                  },
                  displayName: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The display name of the user.",
                  },
                  emailAddress: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The email address of the user.",
                  },
                  permissionId: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "The permission ID of the user.",
                  },
                  photoLink: {
                    anyOf: [
                      {
                        type: "string",
                      },
                      {
                        type: "null",
                      },
                    ],
                    description: "A link to the user's profile photo.",
                  },
                },
                required: ["displayName", "emailAddress", "permissionId", "photoLink"],
                additionalProperties: false,
                description: "The author of the reply.",
              },
              content: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The plain text content of the reply.",
              },
              deleted: {
                type: "boolean",
                description: "Whether the reply has been deleted.",
              },
              createdTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The time at which the reply was created (RFC 3339 date-time).",
              },
              htmlContent: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The content of the reply with HTML formatting.",
              },
              modifiedTime: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The last time the reply was modified (RFC 3339 date-time).",
              },
            },
            required: ["id", "kind", "content", "createdTime", "htmlContent", "modifiedTime"],
            additionalProperties: false,
          },
          description: "The full list of replies to the comment in order.",
        },
      },
      required: ["id", "kind", "anchor", "content", "createdTime", "htmlContent", "modifiedTime"],
      additionalProperties: false,
    },
  },
  {
    name: "drives.create",
    description: "Create a new shared drive.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
          description: "The name of the shared drive to create.",
        },
        requestId: {
          type: "string",
          minLength: 1,
          description: "A unique ID for this request, generated by the client.",
        },
        hidden: {
          type: "boolean",
          description: "Whether to hide the shared drive from the default view.",
        },
        themeId: {
          type: "string",
          minLength: 1,
          description: "The ID of the theme to use for the shared drive.",
        },
        colorRgb: {
          type: "string",
          minLength: 1,
          description: "The color of the shared drive as an RGB hex string.",
        },
        backgroundImageFile: {
          type: "object",
          properties: {
            id: {
              type: "string",
              minLength: 1,
              description: "The ID of an image file in Google Drive to use for the background image.",
            },
            width: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "The width of the cropped image in the closed range [0, 1].",
            },
            xCoordinate: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "The X coordinate of the upper left corner of the cropping area in the closed range [0, 1].",
            },
            yCoordinate: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "The Y coordinate of the upper left corner of the cropping area in the closed range [0, 1].",
            },
          },
          required: ["id", "width", "xCoordinate", "yCoordinate"],
          additionalProperties: false,
          description: "An image file and cropping parameters for the background image of the shared drive.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the shared drive.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        name: {
          type: "string",
          description: "The name of the shared drive.",
        },
        hidden: {
          type: "boolean",
          description: "Whether the shared drive is hidden from the default view.",
        },
        colorRgb: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The color of the shared drive as an RGB hex string.",
        },
        createdTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which the shared drive was created (RFC 3339 date-time).",
        },
        orgUnitId: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The organizational unit ID of the shared drive.",
        },
        themeId: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The ID of the theme from which the background image and color are set.",
        },
        backgroundImageLink: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A short-lived link to this shared drive's background image.",
        },
        capabilities: {
          type: "object",
          properties: {},
          additionalProperties: {},
          description: "Capabilities the current user has on this shared drive.",
        },
        restrictions: {
          type: "object",
          properties: {},
          additionalProperties: {},
          description: "A set of restrictions that apply to this shared drive or items inside this shared drive.",
        },
      },
      required: ["id", "kind", "name", "colorRgb", "createdTime", "orgUnitId", "themeId", "backgroundImageLink"],
      additionalProperties: false,
    },
  },
  {
    name: "drives.delete",
    description: "Permanently delete a shared drive.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        driveId: {
          type: "string",
          minLength: 1,
          description: "The ID of the shared drive.",
        },
        useDomainAdminAccess: {
          type: "boolean",
          description: "Issue the request as a domain administrator.",
        },
        allowItemDeletion: {
          type: "boolean",
          description:
            "Whether any items inside the shared drive should also be deleted. Only supported when useDomainAdminAccess is true.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        driveId: {
          type: "string",
          description: "The unique identifier of the deleted shared drive.",
        },
        deleted: {
          type: "boolean",
          const: true,
          description: "Indicates that the shared drive was successfully deleted.",
        },
      },
      required: ["driveId", "deleted"],
      additionalProperties: false,
    },
  },
  {
    name: "drives.hide",
    description: "Hide a shared drive from the default Drive view.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        driveId: {
          type: "string",
          minLength: 1,
          description: "The ID of the shared drive.",
        },
        useDomainAdminAccess: {
          type: "boolean",
          description: "Issue the request as a domain administrator.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the shared drive.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        name: {
          type: "string",
          description: "The name of the shared drive.",
        },
        hidden: {
          type: "boolean",
          description: "Whether the shared drive is hidden from the default view.",
        },
        colorRgb: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The color of the shared drive as an RGB hex string.",
        },
        createdTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which the shared drive was created (RFC 3339 date-time).",
        },
        orgUnitId: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The organizational unit ID of the shared drive.",
        },
        themeId: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The ID of the theme from which the background image and color are set.",
        },
        backgroundImageLink: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A short-lived link to this shared drive's background image.",
        },
        capabilities: {
          type: "object",
          properties: {},
          additionalProperties: {},
          description: "Capabilities the current user has on this shared drive.",
        },
        restrictions: {
          type: "object",
          properties: {},
          additionalProperties: {},
          description: "A set of restrictions that apply to this shared drive or items inside this shared drive.",
        },
      },
      required: ["id", "kind", "name", "colorRgb", "createdTime", "orgUnitId", "themeId", "backgroundImageLink"],
      additionalProperties: false,
    },
  },
  {
    name: "drives.unhide",
    description: "Unhide a shared drive and restore it to the default Drive view.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        driveId: {
          type: "string",
          minLength: 1,
          description: "The ID of the shared drive.",
        },
        useDomainAdminAccess: {
          type: "boolean",
          description: "Issue the request as a domain administrator.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the shared drive.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        name: {
          type: "string",
          description: "The name of the shared drive.",
        },
        hidden: {
          type: "boolean",
          description: "Whether the shared drive is hidden from the default view.",
        },
        colorRgb: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The color of the shared drive as an RGB hex string.",
        },
        createdTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which the shared drive was created (RFC 3339 date-time).",
        },
        orgUnitId: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The organizational unit ID of the shared drive.",
        },
        themeId: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The ID of the theme from which the background image and color are set.",
        },
        backgroundImageLink: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A short-lived link to this shared drive's background image.",
        },
        capabilities: {
          type: "object",
          properties: {},
          additionalProperties: {},
          description: "Capabilities the current user has on this shared drive.",
        },
        restrictions: {
          type: "object",
          properties: {},
          additionalProperties: {},
          description: "A set of restrictions that apply to this shared drive or items inside this shared drive.",
        },
      },
      required: ["id", "kind", "name", "colorRgb", "createdTime", "orgUnitId", "themeId", "backgroundImageLink"],
      additionalProperties: false,
    },
  },
  {
    name: "drives.update",
    description: "Update metadata or restrictions on a shared drive.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        driveId: {
          type: "string",
          minLength: 1,
          description: "The ID of the shared drive.",
        },
        useDomainAdminAccess: {
          type: "boolean",
          description: "Issue the request as a domain administrator.",
        },
        name: {
          type: "string",
          minLength: 1,
          description: "The new name for the shared drive.",
        },
        hidden: {
          type: "boolean",
          description: "Whether to hide the shared drive from the default view.",
        },
        themeId: {
          type: "string",
          minLength: 1,
          description: "The ID of the theme to apply to the shared drive.",
        },
        colorRgb: {
          type: "string",
          minLength: 1,
          description: "The new color of the shared drive as an RGB hex string.",
        },
        restrictions: {
          type: "object",
          properties: {
            domainUsersOnly: {
              type: "boolean",
              description:
                "Whether access to this shared drive and items inside this shared drive is restricted to users of the domain to which this shared drive belongs.",
            },
            driveMembersOnly: {
              type: "boolean",
              description: "Whether access to items inside this shared drive is restricted to its members.",
            },
            adminManagedRestrictions: {
              type: "boolean",
              description:
                "Whether administrative privileges on this shared drive are required to modify restrictions.",
            },
            copyRequiresWriterPermission: {
              type: "boolean",
              description:
                "Whether the options to copy, print, or download files inside this shared drive, should be disabled for readers and commenters.",
            },
            sharingFoldersRequiresOrganizerPermission: {
              type: "boolean",
              description:
                "Whether the ability to share files, folders, or a shared drive is restricted to users with the organizer role.",
            },
          },
          additionalProperties: false,
          description: "A set of restrictions to apply to this shared drive.",
        },
        backgroundImageFile: {
          type: "object",
          properties: {
            id: {
              type: "string",
              minLength: 1,
              description: "The ID of an image file in Google Drive to use for the background image.",
            },
            width: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "The width of the cropped image in the closed range [0, 1].",
            },
            xCoordinate: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "The X coordinate of the upper left corner of the cropping area in the closed range [0, 1].",
            },
            yCoordinate: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "The Y coordinate of the upper left corner of the cropping area in the closed range [0, 1].",
            },
          },
          required: ["id", "width", "xCoordinate", "yCoordinate"],
          additionalProperties: false,
          description: "An image file and cropping parameters for the background image of the shared drive.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the shared drive.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        name: {
          type: "string",
          description: "The name of the shared drive.",
        },
        hidden: {
          type: "boolean",
          description: "Whether the shared drive is hidden from the default view.",
        },
        colorRgb: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The color of the shared drive as an RGB hex string.",
        },
        createdTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which the shared drive was created (RFC 3339 date-time).",
        },
        orgUnitId: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The organizational unit ID of the shared drive.",
        },
        themeId: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The ID of the theme from which the background image and color are set.",
        },
        backgroundImageLink: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A short-lived link to this shared drive's background image.",
        },
        capabilities: {
          type: "object",
          properties: {},
          additionalProperties: {},
          description: "Capabilities the current user has on this shared drive.",
        },
        restrictions: {
          type: "object",
          properties: {},
          additionalProperties: {},
          description: "A set of restrictions that apply to this shared drive or items inside this shared drive.",
        },
      },
      required: ["id", "kind", "name", "colorRgb", "createdTime", "orgUnitId", "themeId", "backgroundImageLink"],
      additionalProperties: false,
    },
  },
  {
    name: "files.copy",
    description: "Copy a Drive file and optionally override official File metadata.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        name: {
          type: "string",
          minLength: 1,
          description: "The name for the copied file.",
        },
        parents: {
          minItems: 1,
          type: "array",
          items: {
            type: "string",
            minLength: 1,
          },
          description: "A list of parent folder IDs for the copied file.",
        },
        description: {
          description: "A short description for the copied file.",
          type: "string",
          minLength: 1,
        },
        mimeType: {
          type: "string",
          minLength: 1,
          description: "The MIME type of the copied file.",
        },
        starred: {
          type: "boolean",
          description: "Whether to star the copied file.",
        },
        appProperties: {
          type: "object",
          propertyNames: {
            type: "string",
          },
          additionalProperties: {
            type: "string",
          },
          description: "A collection of arbitrary key-value pairs private to the requesting app.",
        },
        properties: {
          type: "object",
          propertyNames: {
            type: "string",
          },
          additionalProperties: {
            type: "string",
          },
          description: "A collection of arbitrary key-value pairs visible to all apps.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the file.",
        },
        name: {
          type: "string",
          description: "The name of the file.",
        },
        mimeType: {
          type: "string",
          description: "The MIME type of the file.",
        },
        webViewLink: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A link for opening the file in a relevant Google editor or viewer in a browser.",
        },
        createdTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which the file was created (RFC 3339 date-time).",
        },
        modifiedTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The last time the file was modified by anyone (RFC 3339 date-time).",
        },
        sizeBytes: {
          anyOf: [
            {
              type: "integer",
              minimum: -9007199254740991,
              maximum: 9007199254740991,
            },
            {
              type: "null",
            },
          ],
          description: "The size of the file's content in bytes.",
        },
        driveId: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The ID of the shared drive the file belongs to.",
        },
        parents: {
          type: "array",
          items: {
            type: "string",
          },
          description: "The IDs of the parent folders containing the file.",
        },
        owners: {
          type: "array",
          items: {
            type: "object",
            properties: {
              displayName: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The display name of the owner.",
              },
              emailAddress: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The email address of the owner.",
              },
              permissionId: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The permission ID of the owner.",
              },
              photoLink: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "A link to the owner's profile photo.",
              },
            },
            required: ["displayName", "emailAddress", "permissionId", "photoLink"],
            additionalProperties: false,
          },
          description: "The owners of the file.",
        },
        shared: {
          type: "boolean",
          description: "Whether the file has been shared.",
        },
        starred: {
          type: "boolean",
          description: "Whether the user has starred the file.",
        },
        trashed: {
          type: "boolean",
          description: "Whether the file has been trashed.",
        },
      },
      required: ["id", "name", "mimeType", "webViewLink", "createdTime", "modifiedTime", "sizeBytes", "driveId"],
      additionalProperties: false,
    },
  },
  {
    name: "files.create",
    description: "Create a Drive file with official File metadata and optional connector media upload content.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
          description: "The name of the file.",
        },
        mimeType: {
          type: "string",
          minLength: 1,
          description: "The MIME type of the file.",
        },
        description: {
          description: "A short description of the file.",
          type: "string",
          minLength: 1,
        },
        parents: {
          minItems: 1,
          type: "array",
          items: {
            type: "string",
            minLength: 1,
          },
          description: "A list of parent folder IDs to place the file in.",
        },
        starred: {
          type: "boolean",
          description: "Whether the user has starred the file.",
        },
        trashed: {
          type: "boolean",
          description: "Whether to move the file to the trash.",
        },
        appProperties: {
          type: "object",
          propertyNames: {
            type: "string",
          },
          additionalProperties: {
            type: "string",
          },
          description: "A collection of arbitrary key-value pairs which are private to the requesting app.",
        },
        properties: {
          type: "object",
          propertyNames: {
            type: "string",
          },
          additionalProperties: {
            type: "string",
          },
          description: "A collection of arbitrary key-value pairs which are visible to all apps.",
        },
        contentBase64: {
          type: "string",
          minLength: 1,
          description: "Connector media upload content encoded as a Base64 string.",
        },
        text: {
          type: "string",
          description: "Connector text media upload content.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the file.",
        },
        name: {
          type: "string",
          description: "The name of the file.",
        },
        mimeType: {
          type: "string",
          description: "The MIME type of the file.",
        },
        webViewLink: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A link for opening the file in a relevant Google editor or viewer in a browser.",
        },
        createdTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which the file was created (RFC 3339 date-time).",
        },
        modifiedTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The last time the file was modified by anyone (RFC 3339 date-time).",
        },
        sizeBytes: {
          anyOf: [
            {
              type: "integer",
              minimum: -9007199254740991,
              maximum: 9007199254740991,
            },
            {
              type: "null",
            },
          ],
          description: "The size of the file's content in bytes.",
        },
        driveId: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The ID of the shared drive the file belongs to.",
        },
        parents: {
          type: "array",
          items: {
            type: "string",
          },
          description: "The IDs of the parent folders containing the file.",
        },
        owners: {
          type: "array",
          items: {
            type: "object",
            properties: {
              displayName: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The display name of the owner.",
              },
              emailAddress: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The email address of the owner.",
              },
              permissionId: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The permission ID of the owner.",
              },
              photoLink: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "A link to the owner's profile photo.",
              },
            },
            required: ["displayName", "emailAddress", "permissionId", "photoLink"],
            additionalProperties: false,
          },
          description: "The owners of the file.",
        },
        shared: {
          type: "boolean",
          description: "Whether the file has been shared.",
        },
        starred: {
          type: "boolean",
          description: "Whether the user has starred the file.",
        },
        trashed: {
          type: "boolean",
          description: "Whether the file has been trashed.",
        },
      },
      required: ["id", "name", "mimeType", "webViewLink", "createdTime", "modifiedTime", "sizeBytes", "driveId"],
      additionalProperties: false,
    },
  },
  {
    name: "files.delete",
    description: "Permanently delete a Drive file or folder by ID.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        includeSharedDrives: {
          type: "boolean",
          description: "When true, includes files from shared drives.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          description: "The unique identifier of the deleted file.",
        },
        deleted: {
          type: "boolean",
          const: true,
          description: "Indicates that the file was successfully deleted.",
        },
      },
      required: ["fileId", "deleted"],
      additionalProperties: false,
    },
  },
  {
    name: "files.emptyTrash",
    description: "Permanently empty the user's trash or a shared drive's trash.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        driveId: {
          type: "string",
          minLength: 1,
          description: "The ID of the shared drive whose trash to empty.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        success: {
          type: "boolean",
          const: true,
          description: "Indicates that the trash was successfully emptied.",
        },
      },
      required: ["success"],
      additionalProperties: false,
    },
  },
  {
    name: "files.generateIds",
    description: "Generate one or more Drive file IDs for later create or copy requests.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        count: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "The number of IDs to generate (1–1000).",
        },
        space: {
          type: "string",
          enum: ["drive", "appDataFolder"],
          description: "The space in which the IDs can be used to create new files (drive or appDataFolder).",
        },
        type: {
          type: "string",
          minLength: 1,
          description: "The type of items which the IDs can be used for.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: {
            type: "string",
          },
          description: "The list of generated file IDs.",
        },
        space: {
          type: "string",
          description: "The type of space for which the IDs can be used.",
        },
        kind: {
          type: "string",
          description: "The type of resource that the IDs can be used to create.",
        },
      },
      required: ["ids", "space", "kind"],
      additionalProperties: false,
    },
  },
  {
    name: "files.modifyLabels",
    description: "Add, update, or remove Drive labels on a file.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        kind: {
          type: "string",
          minLength: 1,
          description: "The type of the resource for this labels modification request.",
        },
        labelModifications: {
          minItems: 1,
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                minLength: 1,
                description: "The type of the resource for this label modification.",
              },
              labelId: {
                type: "string",
                minLength: 1,
                description: "The ID of the label to modify.",
              },
              removeLabel: {
                type: "boolean",
                description: "When true, removes this label from the file.",
              },
              fieldModifications: {
                minItems: 1,
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    kind: {
                      type: "string",
                      minLength: 1,
                      description: "The type of the resource for this field modification.",
                    },
                    fieldId: {
                      type: "string",
                      minLength: 1,
                      description: "The ID of the label field to modify.",
                    },
                    unsetValues: {
                      type: "boolean",
                      description: "When true, clears all values from the label field.",
                    },
                    setDateValues: {
                      minItems: 1,
                      type: "array",
                      items: {
                        type: "string",
                        minLength: 1,
                      },
                      description: "The date values to set on the label field (RFC 3339 date strings).",
                    },
                    setTextValues: {
                      minItems: 1,
                      type: "array",
                      items: {
                        type: "string",
                      },
                      description: "The text values to set on the label field.",
                    },
                    setUserValues: {
                      minItems: 1,
                      type: "array",
                      items: {
                        type: "string",
                        minLength: 1,
                      },
                      description: "The user email addresses to set as user values on the label field.",
                    },
                    setIntegerValues: {
                      minItems: 1,
                      type: "array",
                      items: {
                        type: "string",
                        minLength: 1,
                      },
                      description: "The integer values to set on the label field.",
                    },
                    setSelectionValues: {
                      minItems: 1,
                      type: "array",
                      items: {
                        type: "string",
                        minLength: 1,
                      },
                      description: "The selection option IDs to set on the label field.",
                    },
                  },
                  required: ["fieldId"],
                  additionalProperties: false,
                },
                description: "The list of field modifications to apply to this label.",
              },
            },
            required: ["labelId"],
            additionalProperties: false,
          },
          description: "The list of label modifications to apply to the file.",
        },
      },
      required: ["labelModifications"],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        modifiedLabels: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the label.",
              },
              kind: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The type of the resource.",
              },
              revisionId: {
                type: "string",
                description: "The revision ID of the label.",
              },
              fields: {
                type: "object",
                propertyNames: {
                  type: "string",
                },
                additionalProperties: {
                  type: "object",
                  properties: {
                    valueType: {
                      type: "string",
                      description: "The type of the label field value.",
                    },
                    text: {
                      type: "array",
                      items: {
                        type: "string",
                      },
                      description: "The text values of the field.",
                    },
                    integer: {
                      type: "array",
                      items: {
                        type: "integer",
                        minimum: -9007199254740991,
                        maximum: 9007199254740991,
                      },
                      description: "The integer values of the field.",
                    },
                    selection: {
                      type: "array",
                      items: {
                        type: "string",
                      },
                      description: "The selection option IDs of the field.",
                    },
                    dateString: {
                      type: "array",
                      items: {
                        type: "string",
                      },
                      description: "The date values of the field as RFC 3339 date strings.",
                    },
                    user: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          me: {
                            type: "boolean",
                            description: "Whether this user is the current authenticated user.",
                          },
                          kind: {
                            anyOf: [
                              {
                                type: "string",
                              },
                              {
                                type: "null",
                              },
                            ],
                            description: "The type of the resource.",
                          },
                          displayName: {
                            anyOf: [
                              {
                                type: "string",
                              },
                              {
                                type: "null",
                              },
                            ],
                            description: "The display name of the user.",
                          },
                          emailAddress: {
                            anyOf: [
                              {
                                type: "string",
                              },
                              {
                                type: "null",
                              },
                            ],
                            description: "The email address of the user.",
                          },
                          permissionId: {
                            anyOf: [
                              {
                                type: "string",
                              },
                              {
                                type: "null",
                              },
                            ],
                            description: "The permission ID of the user.",
                          },
                          photoLink: {
                            anyOf: [
                              {
                                type: "string",
                              },
                              {
                                type: "null",
                              },
                            ],
                            description: "A link to the user's profile photo.",
                          },
                        },
                        required: ["displayName", "emailAddress", "permissionId", "photoLink"],
                        additionalProperties: false,
                      },
                      description: "The user values of the field.",
                    },
                  },
                  required: ["valueType"],
                  additionalProperties: false,
                },
                description: "A map of the label's fields, keyed by field ID.",
              },
            },
            required: ["id", "kind", "revisionId", "fields"],
            additionalProperties: false,
          },
          description: "The list of labels that were modified on the file.",
        },
      },
      required: ["modifiedLabels"],
      additionalProperties: false,
    },
  },
  {
    name: "files.update",
    description:
      "Patch a Drive file with official metadata, parent query parameters, and optional connector media upload content.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        name: {
          type: "string",
          minLength: 1,
          description: "The new name for the file.",
        },
        mimeType: {
          type: "string",
          minLength: 1,
          description: "The new MIME type of the file.",
        },
        description: {
          description: "A new short description of the file.",
          type: "string",
          minLength: 1,
        },
        addParents: {
          type: "string",
          minLength: 1,
          description: "A comma-separated list of parent folder IDs to add.",
        },
        removeParents: {
          type: "string",
          minLength: 1,
          description: "A comma-separated list of parent folder IDs to remove.",
        },
        starred: {
          type: "boolean",
          description: "Whether the user has starred the file.",
        },
        trashed: {
          type: "boolean",
          description: "Whether the file is in the trash.",
        },
        appProperties: {
          type: "object",
          propertyNames: {
            type: "string",
          },
          additionalProperties: {
            type: "string",
          },
          description: "A collection of arbitrary key-value pairs private to the requesting app.",
        },
        properties: {
          type: "object",
          propertyNames: {
            type: "string",
          },
          additionalProperties: {
            type: "string",
          },
          description: "A collection of arbitrary key-value pairs visible to all apps.",
        },
        contentBase64: {
          type: "string",
          minLength: 1,
          description: "The new file content encoded as a Base64 string.",
        },
        text: {
          type: "string",
          description: "The new text content to replace the file body.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the file.",
        },
        name: {
          type: "string",
          description: "The name of the file.",
        },
        mimeType: {
          type: "string",
          description: "The MIME type of the file.",
        },
        webViewLink: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A link for opening the file in a relevant Google editor or viewer in a browser.",
        },
        createdTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which the file was created (RFC 3339 date-time).",
        },
        modifiedTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The last time the file was modified by anyone (RFC 3339 date-time).",
        },
        sizeBytes: {
          anyOf: [
            {
              type: "integer",
              minimum: -9007199254740991,
              maximum: 9007199254740991,
            },
            {
              type: "null",
            },
          ],
          description: "The size of the file's content in bytes.",
        },
        driveId: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The ID of the shared drive the file belongs to.",
        },
        parents: {
          type: "array",
          items: {
            type: "string",
          },
          description: "The IDs of the parent folders containing the file.",
        },
        owners: {
          type: "array",
          items: {
            type: "object",
            properties: {
              displayName: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The display name of the owner.",
              },
              emailAddress: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The email address of the owner.",
              },
              permissionId: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The permission ID of the owner.",
              },
              photoLink: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "A link to the owner's profile photo.",
              },
            },
            required: ["displayName", "emailAddress", "permissionId", "photoLink"],
            additionalProperties: false,
          },
          description: "The owners of the file.",
        },
        shared: {
          type: "boolean",
          description: "Whether the file has been shared.",
        },
        starred: {
          type: "boolean",
          description: "Whether the user has starred the file.",
        },
        trashed: {
          type: "boolean",
          description: "Whether the file has been trashed.",
        },
      },
      required: ["id", "name", "mimeType", "webViewLink", "createdTime", "modifiedTime", "sizeBytes", "driveId"],
      additionalProperties: false,
    },
  },
  {
    name: "permissions.create",
    description: "Create a permission on a Drive file or shared drive.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        role: {
          type: "string",
          enum: ["owner", "organizer", "fileOrganizer", "writer", "commenter", "reader"],
          description: "The role granted by this permission.",
        },
        type: {
          type: "string",
          enum: ["user", "group", "domain", "anyone"],
          description: "The type of the grantee (user, group, domain, or anyone).",
        },
        domain: {
          type: "string",
          minLength: 1,
          description: "The domain to which this permission refers (required for domain type).",
        },
        emailAddress: {
          type: "string",
          minLength: 1,
          description: "The email address of the user or group (required for user or group type).",
        },
        email_message: {
          type: "string",
          description: "A custom message to include in the notification email.",
        },
        expiration_time: {
          type: "string",
          minLength: 1,
          description: "The time at which this permission will expire (RFC 3339 date-time).",
        },
        transfer_ownership: {
          type: "boolean",
          description: "Whether to transfer ownership to the specified user (for owner role only).",
        },
        supportsAllDrives: {
          type: "boolean",
          description: "Whether the request supports both My Drives and shared drives.",
        },
        allow_file_discovery: {
          type: "boolean",
          description: "Whether the permission allows the file to be discovered through search.",
        },
        move_to_new_owners_root: {
          type: "boolean",
          description: "Whether to move the file to the new owner's My Drive root folder.",
        },
        send_notification_email: {
          type: "boolean",
          description: "Whether to send a notification email when sharing to users or groups.",
        },
        useDomainAdminAccess: {
          type: "boolean",
          description: "Issue the request as a domain administrator.",
        },
      },
      required: ["role", "type"],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the permission.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        role: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The role granted by this permission (e.g. owner, writer, reader).",
        },
        type: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of grantee (user, group, domain, or anyone).",
        },
        domain: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The domain to which this permission refers.",
        },
        deleted: {
          type: "boolean",
          description: "Whether the account associated with this permission has been deleted.",
        },
        photoLink: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A link to the user's profile photo.",
        },
        displayName: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The display name of the user or group granted this permission.",
        },
        emailAddress: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The email address of the user or group granted this permission.",
        },
        pendingOwner: {
          type: "boolean",
          description: "Whether the account associated with this permission is a pending owner.",
        },
        expirationTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which this permission will expire (RFC 3339 date-time).",
        },
        allowFileDiscovery: {
          type: "boolean",
          description: "Whether the permission allows the file to be discovered through search.",
        },
        permissionDetails: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The primary role for this user.",
              },
              inherited: {
                type: "boolean",
                description: "Whether this permission is inherited from a parent folder.",
              },
              inheritedFrom: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The ID of the item from which this permission is inherited.",
              },
              permissionType: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The permission type for this user.",
              },
            },
            required: ["role", "inheritedFrom", "permissionType"],
            additionalProperties: false,
          },
          description: "Details of whether the permission on the shared drive item is inherited or directly set.",
        },
      },
      required: ["id", "kind", "role", "type", "domain", "photoLink", "displayName", "emailAddress", "expirationTime"],
      additionalProperties: false,
    },
  },
  {
    name: "permissions.delete",
    description: "Delete a permission from a Drive file or shared drive.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        permissionId: {
          type: "string",
          minLength: 1,
          description: "The ID of the permission.",
        },
        supportsAllDrives: {
          type: "boolean",
          description: "Whether the request supports both My Drives and shared drives.",
        },
        useDomainAdminAccess: {
          type: "boolean",
          description: "Issue the request as a domain administrator.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          description: "The ID of the file from which the permission was deleted.",
        },
        permissionId: {
          type: "string",
          description: "The ID of the deleted permission.",
        },
        deleted: {
          type: "boolean",
          const: true,
          description: "Indicates that the permission was successfully deleted.",
        },
      },
      required: ["fileId", "permissionId", "deleted"],
      additionalProperties: false,
    },
  },
  {
    name: "permissions.update",
    description: "Update an existing Drive permission using Google Drive v3 patch semantics.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        permissionId: {
          type: "string",
          minLength: 1,
          description: "The ID of the permission.",
        },
        permission: {
          type: "object",
          properties: {
            role: {
              type: "string",
              enum: ["owner", "organizer", "fileOrganizer", "writer", "commenter", "reader"],
              description: "The new role to grant with this permission.",
            },
            expirationTime: {
              type: "string",
              minLength: 1,
              description: "The new expiration time for this permission (RFC 3339 date-time).",
            },
          },
          additionalProperties: false,
          description: "The updated permission fields to apply.",
        },
        removeExpiration: {
          type: "boolean",
          description: "When true, removes the expiration date from the permission.",
        },
        transferOwnership: {
          type: "boolean",
          description: "Whether to transfer ownership to the specified user (for owner role only).",
        },
        supportsAllDrives: {
          type: "boolean",
          description: "Whether the request supports both My Drives and shared drives.",
        },
        useDomainAdminAccess: {
          type: "boolean",
          description: "Issue the request as a domain administrator.",
        },
        enforceExpansiveAccess: {
          type: "boolean",
          description: "Whether to enforce expansive access requirements.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the permission.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        role: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The role granted by this permission (e.g. owner, writer, reader).",
        },
        type: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of grantee (user, group, domain, or anyone).",
        },
        domain: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The domain to which this permission refers.",
        },
        deleted: {
          type: "boolean",
          description: "Whether the account associated with this permission has been deleted.",
        },
        photoLink: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A link to the user's profile photo.",
        },
        displayName: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The display name of the user or group granted this permission.",
        },
        emailAddress: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The email address of the user or group granted this permission.",
        },
        pendingOwner: {
          type: "boolean",
          description: "Whether the account associated with this permission is a pending owner.",
        },
        expirationTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which this permission will expire (RFC 3339 date-time).",
        },
        allowFileDiscovery: {
          type: "boolean",
          description: "Whether the permission allows the file to be discovered through search.",
        },
        permissionDetails: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The primary role for this user.",
              },
              inherited: {
                type: "boolean",
                description: "Whether this permission is inherited from a parent folder.",
              },
              inheritedFrom: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The ID of the item from which this permission is inherited.",
              },
              permissionType: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
                description: "The permission type for this user.",
              },
            },
            required: ["role", "inheritedFrom", "permissionType"],
            additionalProperties: false,
          },
          description: "Details of whether the permission on the shared drive item is inherited or directly set.",
        },
      },
      required: ["id", "kind", "role", "type", "domain", "photoLink", "displayName", "emailAddress", "expirationTime"],
      additionalProperties: false,
    },
  },
  {
    name: "replies.create",
    description: "Create a reply under an existing Drive file comment.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        commentId: {
          type: "string",
          minLength: 1,
          description: "The ID of the comment.",
        },
        fields: {
          type: "string",
          description: "The fields to include in the response.",
        },
        content: {
          type: "string",
          minLength: 1,
          description: "The plain text content of the reply.",
        },
        action: {
          type: "string",
          enum: ["resolve", "reopen"],
          description: "The action to perform on the comment (resolve or reopen).",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the reply.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        action: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The action this reply performed on the parent comment.",
        },
        author: {
          type: "object",
          properties: {
            me: {
              type: "boolean",
              description: "Whether this user is the current authenticated user.",
            },
            kind: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The type of the resource.",
            },
            displayName: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The display name of the user.",
            },
            emailAddress: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The email address of the user.",
            },
            permissionId: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The permission ID of the user.",
            },
            photoLink: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "A link to the user's profile photo.",
            },
          },
          required: ["displayName", "emailAddress", "permissionId", "photoLink"],
          additionalProperties: false,
          description: "The author of the reply.",
        },
        content: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The plain text content of the reply.",
        },
        deleted: {
          type: "boolean",
          description: "Whether the reply has been deleted.",
        },
        createdTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which the reply was created (RFC 3339 date-time).",
        },
        htmlContent: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The content of the reply with HTML formatting.",
        },
        modifiedTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The last time the reply was modified (RFC 3339 date-time).",
        },
      },
      required: ["id", "kind", "content", "createdTime", "htmlContent", "modifiedTime"],
      additionalProperties: false,
    },
  },
  {
    name: "replies.delete",
    description: "Permanently delete a specific reply from a Drive file comment thread.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        commentId: {
          type: "string",
          minLength: 1,
          description: "The ID of the comment.",
        },
        replyId: {
          type: "string",
          minLength: 1,
          description: "The ID of the reply.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          description: "The ID of the file from which the reply was deleted.",
        },
        commentId: {
          type: "string",
          description: "The ID of the comment from which the reply was deleted.",
        },
        replyId: {
          type: "string",
          description: "The ID of the deleted reply.",
        },
        deleted: {
          type: "boolean",
          const: true,
          description: "Indicates that the reply was successfully deleted.",
        },
      },
      required: ["fileId", "commentId", "replyId", "deleted"],
      additionalProperties: false,
    },
  },
  {
    name: "replies.update",
    description: "Update the content of an existing reply on a Drive file comment.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        commentId: {
          type: "string",
          minLength: 1,
          description: "The ID of the comment.",
        },
        replyId: {
          type: "string",
          minLength: 1,
          description: "The ID of the reply.",
        },
        fields: {
          type: "string",
          description: "The fields to include in the response.",
        },
        content: {
          type: "string",
          minLength: 1,
          description: "The new plain text content of the reply.",
        },
      },
      required: ["content"],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the reply.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        action: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The action this reply performed on the parent comment.",
        },
        author: {
          type: "object",
          properties: {
            me: {
              type: "boolean",
              description: "Whether this user is the current authenticated user.",
            },
            kind: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The type of the resource.",
            },
            displayName: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The display name of the user.",
            },
            emailAddress: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The email address of the user.",
            },
            permissionId: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The permission ID of the user.",
            },
            photoLink: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "A link to the user's profile photo.",
            },
          },
          required: ["displayName", "emailAddress", "permissionId", "photoLink"],
          additionalProperties: false,
          description: "The author of the reply.",
        },
        content: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The plain text content of the reply.",
        },
        deleted: {
          type: "boolean",
          description: "Whether the reply has been deleted.",
        },
        createdTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The time at which the reply was created (RFC 3339 date-time).",
        },
        htmlContent: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The content of the reply with HTML formatting.",
        },
        modifiedTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The last time the reply was modified (RFC 3339 date-time).",
        },
      },
      required: ["id", "kind", "content", "createdTime", "htmlContent", "modifiedTime"],
      additionalProperties: false,
    },
  },
  {
    name: "revisions.delete",
    description: "Permanently delete a specific revision from a Drive file.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        revisionId: {
          type: "string",
          minLength: 1,
          description: "The ID of the revision.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          description: "The ID of the file from which the revision was deleted.",
        },
        revisionId: {
          type: "string",
          description: "The ID of the deleted revision.",
        },
        deleted: {
          type: "boolean",
          const: true,
          description: "Indicates that the revision was successfully deleted.",
        },
      },
      required: ["fileId", "revisionId", "deleted"],
      additionalProperties: false,
    },
  },
  {
    name: "revisions.update",
    description: "Update revision metadata flags on a specific Drive file revision.",
    requiredScopes: [googleDriveFullScope],
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        fileId: {
          type: "string",
          minLength: 1,
          description: "The ID of the file.",
        },
        revisionId: {
          type: "string",
          minLength: 1,
          description: "The ID of the revision.",
        },
        published: {
          type: "boolean",
          description: "Whether this revision is published.",
        },
        publishAuto: {
          type: "boolean",
          description: "Whether subsequent revisions will be automatically republished.",
        },
        keepForever: {
          type: "boolean",
          description: "Whether to keep this revision forever, even if it is no longer the head revision.",
        },
        publishedOutsideDomain: {
          type: "boolean",
          description: "Whether this revision is published outside the domain.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the revision.",
        },
        kind: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The type of the resource.",
        },
        mimeType: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The MIME type of the revision.",
        },
        modifiedTime: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The last time the revision was modified (RFC 3339 date-time).",
        },
        sizeBytes: {
          anyOf: [
            {
              type: "integer",
              minimum: -9007199254740991,
              maximum: 9007199254740991,
            },
            {
              type: "null",
            },
          ],
          description: "The size of the revision's content in bytes.",
        },
        published: {
          type: "boolean",
          description: "Whether this revision is published.",
        },
        keepForever: {
          type: "boolean",
          description: "Whether to keep this revision forever, even if it is no longer the head revision.",
        },
        publishAuto: {
          type: "boolean",
          description: "Whether subsequent revisions will be automatically republished.",
        },
        publishedOutsideDomain: {
          type: "boolean",
          description: "Whether this revision is published outside the domain.",
        },
        publishedLink: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "A link to the published revision.",
        },
        originalFilename: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The original filename used to create this revision.",
        },
        md5Checksum: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
          description: "The MD5 checksum of the revision's content.",
        },
        lastModifyingUser: {
          type: "object",
          properties: {
            me: {
              type: "boolean",
              description: "Whether this user is the current authenticated user.",
            },
            kind: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The type of the resource.",
            },
            displayName: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The display name of the user.",
            },
            emailAddress: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The email address of the user.",
            },
            permissionId: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "The permission ID of the user.",
            },
            photoLink: {
              anyOf: [
                {
                  type: "string",
                },
                {
                  type: "null",
                },
              ],
              description: "A link to the user's profile photo.",
            },
          },
          required: ["displayName", "emailAddress", "permissionId", "photoLink"],
          additionalProperties: false,
          description: "The last user to modify this revision.",
        },
        exportLinks: {
          type: "object",
          propertyNames: {
            type: "string",
          },
          additionalProperties: {
            type: "string",
          },
          description: "Links for exporting Docs Editors files to specific formats.",
        },
      },
      required: [
        "id",
        "kind",
        "mimeType",
        "modifiedTime",
        "sizeBytes",
        "publishedLink",
        "originalFilename",
        "md5Checksum",
      ],
      additionalProperties: false,
    },
  },
];

export const googledriveActions: ActionDefinition[] = actionSources.map((action) =>
  defineProviderAction(service, action),
);
