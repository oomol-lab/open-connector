import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
export const streamwishEndpoints: {
  path: string;
  action: ActionDefinition;
}[] = [
  {
    path: "/account/info",
    action: defineProviderAction("streamwish", {
      name: "get_account",
      operationType: "read",
      description: "Get account details and storage usage.",
      requiredScopes: [],
      inputSchema: s.object(
        "Get account details and storage usage. Input.",
        {},
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "StreamWish response envelope.",
        {
          msg: s.string("Response message."),
          status: s.integer("Upstream status code; 200 indicates success."),
          server_time: s.string("Server timestamp."),
          result: s.object(
            "Account details.",
            {
              login: s.string("Account login name."),
              email: s.string("Account email address."),
              files_total: s.string("Total number of files."),
              storage_used: s.string("Used storage in bytes."),
              balance: s.string("Account balance."),
              storage_left: s.integer("Remaining storage in bytes."),
            },
            {
              optional: [],
              additionalProperties: true,
              required: [],
            },
          ),
        },
        {
          optional: [],
          additionalProperties: true,
          required: ["status", "result"],
        },
      ),
    }),
  },
  {
    path: "/account/stats",
    action: defineProviderAction("streamwish", {
      name: "get_account_stats",
      operationType: "read",
      description: "Get daily account statistics.",
      requiredScopes: [],
      inputSchema: s.object(
        "Get daily account statistics. Input.",
        { last: s.integer("Number of days to return; upstream defaults to 7.") },
        {
          optional: ["last"],
        },
      ),
      outputSchema: s.object(
        "StreamWish response envelope.",
        {
          msg: s.string("Response message."),
          status: s.integer("Upstream status code; 200 indicates success."),
          server_time: s.string("Server timestamp."),
          result: s.array(
            "Daily statistics.",
            s.object(
              "Daily views, earnings and referral statistics.",
              {},
              {
                optional: [],
                additionalProperties: true,
                required: [],
              },
            ),
          ),
        },
        {
          optional: [],
          additionalProperties: true,
          required: ["status", "result"],
        },
      ),
    }),
  },
  {
    path: "/file/list",
    action: defineProviderAction("streamwish", {
      name: "list_files",
      operationType: "read",
      description: "List files with filters and page-based pagination.",
      requiredScopes: [],
      inputSchema: s.object(
        "List files with filters and page-based pagination. Input.",
        {
          fld_id: s.integer("Folder ID; 0 is the root folder."),
          title: s.string("Filter by video title."),
          created: s.string("Return videos uploaded after this timestamp, or a number of minutes ago."),
          public: s.integer("Filter by public (1) or private (0) videos; omit for all.", {
            minimum: 0,
            maximum: 1,
          }),
          adult: s.integer("Filter by adult (1) or safe (0) videos; omit for all.", {
            minimum: 0,
            maximum: 1,
          }),
          per_page: s.integer("Results per page.", { minimum: 1 }),
          page: s.integer("Page number, starting at 1.", { minimum: 1 }),
        },
        {
          optional: ["fld_id", "title", "created", "public", "adult", "per_page", "page"],
        },
      ),
      outputSchema: s.object(
        "StreamWish response envelope.",
        {
          msg: s.string("Response message."),
          status: s.integer("Upstream status code; 200 indicates success."),
          server_time: s.string("Server timestamp."),
          result: s.object(
            "File list and pagination metadata.",
            {
              files: s.array(
                "Files in this result.",
                s.object(
                  "File metadata returned by StreamWish.",
                  {},
                  {
                    optional: [],
                    additionalProperties: true,
                    required: [],
                  },
                ),
              ),
              results_total: s.integer("Total matching files."),
              pages: s.integer("Total pages."),
              results: s.integer("Files returned on this page."),
            },
            {
              optional: [],
              additionalProperties: true,
              required: ["files"],
            },
          ),
        },
        {
          optional: [],
          additionalProperties: true,
          required: ["status", "result"],
        },
      ),
    }),
  },
  {
    path: "/file/info",
    action: defineProviderAction("streamwish", {
      name: "get_file_info",
      operationType: "read",
      description: "Get metadata for one or more files, including per-file status.",
      requiredScopes: [],
      inputSchema: s.object(
        "Get metadata for one or more files, including per-file status. Input.",
        { file_code: s.nonEmptyString("File code or comma-separated file codes.") },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "StreamWish response envelope.",
        {
          msg: s.string("Response message."),
          status: s.integer("Upstream status code; 200 indicates success."),
          server_time: s.string("Server timestamp."),
          result: s.array(
            "Files in this result.",
            s.object(
              "File metadata returned by StreamWish.",
              {},
              {
                optional: [],
                additionalProperties: true,
                required: [],
              },
            ),
          ),
        },
        {
          optional: [],
          additionalProperties: true,
          required: ["status", "result"],
        },
      ),
    }),
  },
  {
    path: "/file/edit",
    action: defineProviderAction("streamwish", {
      name: "edit_file",
      operationType: "write",
      description: "Update file metadata; omitted fields are not changed.",
      requiredScopes: [],
      inputSchema: s.object(
        "Update file metadata; omitted fields are not changed. Input.",
        {
          file_code: s.nonEmptyString("File code or comma-separated file codes."),
          file_title: s.string("New file title."),
          file_descr: s.string("New file description."),
          cat_id: s.integer("Category ID."),
          file_fld_id: s.integer("Folder ID; 0 is the root folder."),
          file_public: s.integer("Public flag: 1 for public, 0 for private.", {
            minimum: 0,
            maximum: 1,
          }),
          file_adult: s.integer("Adult flag: 1 for adult, 0 for safe.", { minimum: 0, maximum: 1 }),
          tags: s.string("Comma-separated file tags."),
        },
        {
          optional: ["file_title", "file_descr", "cat_id", "file_fld_id", "file_public", "file_adult", "tags"],
        },
      ),
      outputSchema: s.object(
        "StreamWish response envelope.",
        {
          msg: s.string("Response message."),
          status: s.integer("Upstream status code; 200 indicates success."),
          server_time: s.string("Server timestamp."),
          result: s.string('Upstream confirmation string, normally "true".'),
        },
        {
          optional: [],
          additionalProperties: true,
          required: ["status", "result"],
        },
      ),
    }),
  },
  {
    path: "/file/clone",
    action: defineProviderAction("streamwish", {
      name: "clone_file",
      operationType: "write",
      description: "Clone a file into the account.",
      requiredScopes: [],
      inputSchema: s.object(
        "Clone a file into the account. Input.",
        {
          file_code: s.nonEmptyString("File code."),
          file_title: s.string("Optional title for the new file."),
          fld_id: s.integer("Folder ID; 0 is the root folder."),
        },
        {
          optional: ["file_title", "fld_id"],
        },
      ),
      outputSchema: s.object(
        "StreamWish response envelope.",
        {
          msg: s.string("Response message."),
          status: s.integer("Upstream status code; 200 indicates success."),
          server_time: s.string("Server timestamp."),
          result: s.object(
            "Cloned file details.",
            {
              url: s.string("Public URL of the cloned file."),
              filecode: s.string("Code of the cloned file."),
            },
            {
              optional: [],
              additionalProperties: true,
              required: [],
            },
          ),
        },
        {
          optional: [],
          additionalProperties: true,
          required: ["status", "result"],
        },
      ),
    }),
  },
  {
    path: "/file/delete",
    action: defineProviderAction("streamwish", {
      name: "delete_file",
      operationType: "destructive",
      description: "Delete a file from the account.",
      requiredScopes: [],
      inputSchema: s.object(
        "Delete a file from the account. Input.",
        { file_code: s.nonEmptyString("File code.") },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "StreamWish response envelope.",
        {
          msg: s.string("Response message."),
          status: s.integer("Upstream status code; 200 indicates success."),
          server_time: s.string("Server timestamp."),
        },
        {
          optional: [],
          additionalProperties: true,
          required: ["status"],
        },
      ),
    }),
  },
  {
    path: "/file/direct_link",
    action: defineProviderAction("streamwish", {
      name: "get_direct_link",
      operationType: "read",
      description: "Get direct video URLs and optional HLS manifest URL.",
      requiredScopes: [],
      inputSchema: s.object(
        "Get direct video URLs and optional HLS manifest URL. Input.",
        {
          file_code: s.nonEmptyString("File code."),
          q: s.stringEnum("Video quality: n, h, l or o.", ["n", "h", "l", "o"]),
          hls: s.integer("Request HLS manifest URL; requires the HLS module.", {
            minimum: 0,
            maximum: 1,
          }),
        },
        {
          optional: ["q", "hls"],
        },
      ),
      outputSchema: s.object(
        "StreamWish response envelope.",
        {
          msg: s.string("Response message."),
          status: s.integer("Upstream status code; 200 indicates success."),
          server_time: s.string("Server timestamp."),
          result: s.object(
            "Video playback links.",
            {
              versions: s.array(
                "Available video versions.",
                s.object(
                  "Video version.",
                  {
                    url: s.string("Direct video URL."),
                    name: s.string("Video quality name."),
                    size: s.string("Video size in bytes."),
                  },
                  {
                    optional: [],
                    additionalProperties: true,
                    required: [],
                  },
                ),
              ),
              file_length: s.string("Video duration in seconds."),
              player_img: s.string("Player image URL."),
              hls_direct: s.string("HLS manifest URL when requested and available."),
            },
            {
              optional: [],
              additionalProperties: true,
              required: [],
            },
          ),
        },
        {
          optional: [],
          additionalProperties: true,
          required: ["status", "result"],
        },
      ),
    }),
  },
  {
    path: "/folder/list",
    action: defineProviderAction("streamwish", {
      name: "list_folders",
      operationType: "read",
      description: "List child folders and optionally their files.",
      requiredScopes: [],
      inputSchema: s.object(
        "List child folders and optionally their files. Input.",
        {
          fld_id: s.integer("Parent folder ID; defaults to 0 (root)."),
          files: s.integer("Include files in the folder when set to 1.", {
            minimum: 0,
            maximum: 1,
          }),
        },
        {
          optional: ["fld_id", "files"],
        },
      ),
      outputSchema: s.object(
        "StreamWish response envelope.",
        {
          msg: s.string("Response message."),
          status: s.integer("Upstream status code; 200 indicates success."),
          server_time: s.string("Server timestamp."),
          result: s.object(
            "Child folders and optional files.",
            {
              folders: s.array(
                "Child folders.",
                s.object(
                  "Folder metadata.",
                  {
                    fld_id: s.string("Folder ID."),
                    name: s.string("Folder name."),
                    code: s.string("Folder public code."),
                  },
                  {
                    optional: [],
                    additionalProperties: true,
                    required: [],
                  },
                ),
              ),
              files: s.array(
                "Files in this result.",
                s.object(
                  "File metadata returned by StreamWish.",
                  {},
                  {
                    optional: [],
                    additionalProperties: true,
                    required: [],
                  },
                ),
              ),
            },
            {
              optional: [],
              additionalProperties: true,
              required: ["folders"],
            },
          ),
        },
        {
          optional: [],
          additionalProperties: true,
          required: ["status", "result"],
        },
      ),
    }),
  },
  {
    path: "/folder/create",
    action: defineProviderAction("streamwish", {
      name: "create_folder",
      operationType: "write",
      description: "Create a folder.",
      requiredScopes: [],
      inputSchema: s.object(
        "Create a folder. Input.",
        {
          name: s.nonEmptyString("New folder name."),
          parent_id: s.integer("Folder ID; 0 is the root folder."),
          descr: s.string("Folder description."),
        },
        {
          optional: ["parent_id", "descr"],
        },
      ),
      outputSchema: s.object(
        "StreamWish response envelope.",
        {
          msg: s.string("Response message."),
          status: s.integer("Upstream status code; 200 indicates success."),
          server_time: s.string("Server timestamp."),
          result: s.object(
            "Created folder.",
            { fld_id: s.string("Created folder ID.") },
            {
              optional: [],
              additionalProperties: true,
              required: ["fld_id"],
            },
          ),
        },
        {
          optional: [],
          additionalProperties: true,
          required: ["status", "result"],
        },
      ),
    }),
  },
  {
    path: "/folder/edit",
    action: defineProviderAction("streamwish", {
      name: "edit_folder",
      operationType: "write",
      description: "Update a folder; omitted fields are not changed.",
      requiredScopes: [],
      inputSchema: s.object(
        "Update a folder; omitted fields are not changed. Input.",
        {
          fld_id: s.integer("Folder ID; 0 is the root folder."),
          name: s.string("New folder name."),
          parent_id: s.integer("Folder ID; 0 is the root folder."),
          descr: s.string("Folder description."),
        },
        {
          optional: ["name", "parent_id", "descr"],
        },
      ),
      outputSchema: s.object(
        "StreamWish response envelope.",
        {
          msg: s.string("Response message."),
          status: s.integer("Upstream status code; 200 indicates success."),
          server_time: s.string("Server timestamp."),
          result: s.string('Upstream confirmation string, normally "true".'),
        },
        {
          optional: [],
          additionalProperties: true,
          required: ["status", "result"],
        },
      ),
    }),
  },
];
export const streamwishActions: ActionDefinition[] = streamwishEndpoints.map(({ action }) => action);
