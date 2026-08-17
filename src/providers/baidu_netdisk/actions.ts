import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const baiduNetdiskConnectorScopes = {
  accountRead: "baidu_netdisk.account.read",
  rootFilesRead: "baidu_netdisk.files.root.read",
  rootFilesWrite: "baidu_netdisk.files.root.write",
};

export const baiduNetdiskProviderScopes = {
  basic: "basic",
  netdisk: "netdisk",
};

export const baiduNetdiskFileCategories: string[] = [
  "video",
  "audio",
  "image",
  "document",
  "application",
  "other",
  "torrent",
];

export const baiduNetdiskSemanticMatchSources: string[] = [
  "filename",
  "image_ocr",
  "document_text",
  "document_semantic",
  "video_semantic",
  "audio_semantic",
  "image_semantic",
  "card",
];

export function isBaiduNetdiskAbsolutePath(value: unknown, allowRoot = true): value is string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.endsWith("/")
  ) {
    return value === "/" && allowRoot;
  }
  return value
    .slice(1)
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

const absolutePath = (description: string, _allowRoot = true) => s.nonEmptyString(description);

const itemNameSchema = s.nonEmptyString("A single file or folder name without path separators.");

const publicFileUrlSchema = s.url("A public HTTP or HTTPS URL that Baidu Netdisk should fetch.");

const nullableString = (description: string) => s.nullable(s.string(description));
const nullableInteger = (description: string) => s.nullable(s.integer(description));
const pageSchema = s.withDefault(s.integer("The one-based Baidu MCP result page.", { minimum: 1 }), 1);
const conflictStrategySchema = s.withDefault(
  s.stringEnum("How Baidu Netdisk should handle a destination name conflict.", ["fail", "rename"]),
  "fail",
);

const fileSchema = s.object("A normalized Baidu Netdisk file or folder.", {
  id: s.string("The lossless Baidu Netdisk fs_id decimal string."),
  name: s.string("The file or folder name."),
  path: s.string("The absolute path below the user's Baidu Netdisk root."),
  kind: s.stringEnum("Whether this item is a file or folder.", ["file", "folder"]),
  category: s.nullable(
    s.stringEnum("The Baidu Netdisk file category, or null for folders.", [...baiduNetdiskFileCategories]),
  ),
  sizeBytes: nullableInteger("The file size in bytes, or null for folders or missing values."),
  createdAt: s.nullable(s.dateTime("The server creation time in ISO 8601 UTC format.")),
  modifiedAt: s.nullable(s.dateTime("The server modification time in ISO 8601 UTC format.")),
  cloudMd5: nullableString("The provider cloud hash, or null when unavailable."),
});

const semanticFileSchema = s.object("A normalized semantic search match.", {
  ...(fileSchema.properties as Record<string, import("../../core/types.ts").JsonSchema>),
  matchSource: s.nullable(
    s.stringEnum("The official Baidu recall source, or null when unavailable.", [...baiduNetdiskSemanticMatchSources]),
  ),
  matchedContent: nullableString("The matched document, audio, or video passage."),
  ocrText: nullableString("The matched image OCR text, or null when unavailable."),
  passageId: nullableString("The lossless semantic passage ID, or null when unavailable."),
});

const emptyInputSchema = s.object("No input is required.", {});
const managementOutputSchema = s.object("The result of one file operation.", {
  sourcePath: s.string("The absolute source path supplied by the caller."),
  path: nullableString("The resulting absolute path, or null when Baidu omits it."),
});

const downloadedFileSchema = s.requiredObject("A downloaded Baidu Netdisk file stored in local transit storage.", {
  fileId: s.nonEmptyString("The Baidu Netdisk fs_id decimal string."),
  name: s.nonEmptyString("The original Baidu Netdisk file name."),
  mimeType: s.nonEmptyString("The downloaded file MIME type."),
  sizeBytes: s.nonNegativeInteger("The downloaded file size in bytes."),
  file: s.requiredObject("The downloaded content in local transit file storage.", {
    fileId: s.nonEmptyString("The local transit file identifier."),
    downloadUrl: s.url("The local transit URL for downloading the stored file."),
    sizeBytes: s.nonNegativeInteger("The stored transit file size in bytes."),
    name: s.nonEmptyString("The stored transit file name."),
    mimeType: s.nonEmptyString("The stored transit file MIME type."),
  }),
});

const relocateInputSchema = (operation: string) =>
  s.object(
    `Input for ${operation}ing one Baidu Netdisk file or folder.`,
    {
      sourcePath: absolutePath("The absolute source path.", false),
      destinationDirectoryPath: absolutePath("The absolute destination directory path."),
      newName: s.optional(itemNameSchema),
      conflictStrategy: s.optional(conflictStrategySchema),
    },
    { optional: ["newName", "conflictStrategy"] },
  );

export const baiduNetdiskActions: ProviderActionDefinition[] = [
  defineProviderAction("baidu_netdisk", {
    name: "get_current_account",
    description: "Get the current Baidu Netdisk account and membership summary.",
    requiredScopes: [baiduNetdiskConnectorScopes.accountRead],
    providerPermissions: [baiduNetdiskProviderScopes.basic, baiduNetdiskProviderScopes.netdisk],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The current Baidu Netdisk account.", {
      accountId: s.string("The lossless Baidu Netdisk uk decimal string."),
      accountLabel: s.string("The best available Baidu Netdisk account name."),
      avatarUrl: nullableString("The current account avatar URL, or null when unavailable."),
      membership: s.nullable(s.stringEnum("The current Baidu Netdisk membership tier.", ["free", "vip", "svip"])),
    }),
  }),
  defineProviderAction("baidu_netdisk", {
    name: "get_quota",
    description: "Get total, used, remaining, free, and expiring Baidu Netdisk capacity.",
    requiredScopes: [baiduNetdiskConnectorScopes.accountRead],
    providerPermissions: [baiduNetdiskProviderScopes.basic, baiduNetdiskProviderScopes.netdisk],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The current Baidu Netdisk capacity summary.", {
      totalBytes: s.integer("The total storage capacity in bytes."),
      usedBytes: s.integer("The used storage capacity in bytes."),
      remainingBytes: s.integer("The non-negative remaining storage capacity in bytes."),
      freeQuotaBytes: s.integer("The free storage capacity in bytes."),
      expiresWithinSevenDays: s.boolean("Whether some capacity expires within seven days."),
    }),
  }),
  defineProviderAction("baidu_netdisk", {
    name: "list_files",
    description: "List files and folders from the user's Baidu Netdisk root.",
    requiredScopes: [baiduNetdiskConnectorScopes.rootFilesRead],
    providerPermissions: [baiduNetdiskProviderScopes.netdisk],
    inputSchema: s.object(
      "Input for listing one Baidu Netdisk directory page.",
      {
        path: s.optional(s.withDefault(absolutePath("The absolute directory path to list."), "/")),
        page: s.optional(pageSchema),
      },
      { optional: ["path", "page"] },
    ),
    outputSchema: s.object("One page of normalized Baidu Netdisk items.", {
      items: s.array("The files and folders in this page.", fileSchema),
      page: s.integer("The one-based page that was returned."),
    }),
  }),
  defineProviderAction("baidu_netdisk", {
    name: "search_files",
    description: "Search files and folders below an absolute Baidu Netdisk directory.",
    requiredScopes: [baiduNetdiskConnectorScopes.rootFilesRead],
    providerPermissions: [baiduNetdiskProviderScopes.netdisk],
    inputSchema: s.object(
      "Input for one Baidu Netdisk keyword-search page.",
      {
        query: s.nonEmptyString("The keyword to search for, up to 30 UTF-8 characters.", {
          maxLength: 30,
        }),
        path: s.optional(s.withDefault(absolutePath("The absolute directory to search."), "/")),
        page: s.optional(pageSchema),
        pageSize: s.optional(
          s.withDefault(
            s.integer("The number of matches requested from Baidu MCP.", {
              minimum: 1,
              maximum: 500,
            }),
            100,
          ),
        ),
      },
      { optional: ["path", "page", "pageSize"] },
    ),
    outputSchema: s.object("One keyword-search page.", {
      items: s.array("The normalized matching files and folders.", fileSchema),
      page: s.integer("The one-based page that was returned."),
    }),
  }),
  defineProviderAction("baidu_netdisk", {
    name: "semantic_search_files",
    description: "Search Baidu Netdisk using a natural-language description.",
    requiredScopes: [baiduNetdiskConnectorScopes.rootFilesRead],
    providerPermissions: [baiduNetdiskProviderScopes.netdisk],
    inputSchema: s.object(
      "Input for one bounded Baidu Netdisk semantic search.",
      {
        query: s.nonWhitespaceString("The natural-language description of files to find."),
        path: s.optional(s.withDefault(absolutePath("The absolute directory to search."), "/")),
        limit: s.optional(
          s.withDefault(s.integer("The maximum number of matches to return.", { minimum: 1, maximum: 500 }), 100),
        ),
      },
      { optional: ["path", "limit"] },
    ),
    outputSchema: s.object("One bounded semantic-search result.", {
      items: s.array("The normalized semantic matches.", semanticFileSchema),
      truncated: s.boolean("Whether Baidu reports that more matches may be available."),
    }),
  }),
  defineProviderAction("baidu_netdisk", {
    name: "download_file",
    description: "Download one Baidu Netdisk file by fs_id into local transit file storage.",
    requiredScopes: [baiduNetdiskConnectorScopes.rootFilesRead],
    providerPermissions: [baiduNetdiskProviderScopes.netdisk],
    inputSchema: s.requiredObject("Input for downloading one Baidu Netdisk file.", {
      fsId: s.string({
        minLength: 1,
        pattern: "^[0-9]+$",
        description: "The lossless Baidu Netdisk fs_id decimal string.",
      }),
    }),
    outputSchema: downloadedFileSchema,
  }),
  defineProviderAction("baidu_netdisk", {
    name: "upload_file_from_url",
    description: "Ask Baidu Netdisk to fetch one public URL into an absolute destination path.",
    requiredScopes: [baiduNetdiskConnectorScopes.rootFilesWrite],
    providerPermissions: [baiduNetdiskProviderScopes.netdisk],
    inputSchema: s.object("Input for uploading one public URL through Baidu MCP.", {
      fileUrl: publicFileUrlSchema,
      destinationPath: absolutePath("The absolute destination file path.", false),
    }),
    outputSchema: fileSchema,
  }),
  defineProviderAction("baidu_netdisk", {
    name: "create_text_file",
    description: "Create one UTF-8 text file through Baidu MCP.",
    requiredScopes: [baiduNetdiskConnectorScopes.rootFilesWrite],
    providerPermissions: [baiduNetdiskProviderScopes.netdisk],
    inputSchema: s.object("Input for creating one UTF-8 Baidu Netdisk text file.", {
      path: absolutePath("The absolute destination file path.", false),
      content: s.string("The UTF-8 text content accepted by Baidu MCP.", { maxLength: 20_000 }),
    }),
    outputSchema: fileSchema,
  }),
  defineProviderAction("baidu_netdisk", {
    name: "create_folder",
    description: "Create one folder at an absolute path below the user's Baidu Netdisk root.",
    requiredScopes: [baiduNetdiskConnectorScopes.rootFilesWrite],
    providerPermissions: [baiduNetdiskProviderScopes.netdisk],
    inputSchema: s.object(
      "Input for creating one Baidu Netdisk folder.",
      {
        path: absolutePath("The absolute folder path to create.", false),
        conflictStrategy: s.optional(conflictStrategySchema),
      },
      { optional: ["conflictStrategy"] },
    ),
    outputSchema: fileSchema,
  }),
  defineProviderAction("baidu_netdisk", {
    name: "copy",
    description: "Synchronously copy one Baidu Netdisk file or folder.",
    requiredScopes: [baiduNetdiskConnectorScopes.rootFilesWrite],
    providerPermissions: [baiduNetdiskProviderScopes.netdisk],
    inputSchema: relocateInputSchema("copy"),
    outputSchema: managementOutputSchema,
  }),
  defineProviderAction("baidu_netdisk", {
    name: "move",
    description: "Synchronously move one Baidu Netdisk file or folder.",
    requiredScopes: [baiduNetdiskConnectorScopes.rootFilesWrite],
    providerPermissions: [baiduNetdiskProviderScopes.netdisk],
    inputSchema: relocateInputSchema("mov"),
    outputSchema: managementOutputSchema,
  }),
  defineProviderAction("baidu_netdisk", {
    name: "rename",
    description: "Synchronously rename one Baidu Netdisk file or folder.",
    requiredScopes: [baiduNetdiskConnectorScopes.rootFilesWrite],
    providerPermissions: [baiduNetdiskProviderScopes.netdisk],
    inputSchema: s.object(
      "Input for renaming one Baidu Netdisk file or folder.",
      {
        sourcePath: absolutePath("The absolute source path.", false),
        newName: itemNameSchema,
        conflictStrategy: s.optional(conflictStrategySchema),
      },
      { optional: ["conflictStrategy"] },
    ),
    outputSchema: managementOutputSchema,
  }),
] satisfies ProviderActionDefinition[];
