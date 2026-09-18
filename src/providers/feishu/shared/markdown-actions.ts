import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
export const feishuMarkdownProviderPermissions = {
  download: "drive:file:download",
  upload: "drive:file:upload",
  metadataRead: "drive:drive.metadata:readonly",
};
const fileTokenSchema = s.string("The Feishu Drive file token.", { minLength: 1 });
const fileNameSchema = s.string("The Markdown file name including its `.md` suffix.", {
  minLength: 4,
});
const markdownSchema = s.string("The complete Markdown content.", { minLength: 1 });
const versionSchema = s.string("The numeric Drive file version.", { minLength: 1 });
const writeOutputSchema = s.object(
  "The created or overwritten Markdown file.",
  {
    fileToken: fileTokenSchema,
    fileName: fileNameSchema,
    version: versionSchema,
    sizeBytes: s.nonNegativeInteger("The UTF-8 content size in bytes."),
    url: s.url("The Feishu URL for the Markdown file."),
  },
  {
    optional: ["version", "url"],
  },
);
const diffHunkSchema = s.object(
  "One unified diff hunk.",
  {
    header: s.string("The unified diff range header."),
    oldStart: s.nonNegativeInteger("The first old-file line covered by the hunk."),
    oldLines: s.nonNegativeInteger("The number of old-file lines covered by the hunk."),
    newStart: s.nonNegativeInteger("The first new-file line covered by the hunk."),
    newLines: s.nonNegativeInteger("The number of new-file lines covered by the hunk."),
  },
  {
    optional: [],
  },
);
export function createFeishuMarkdownActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "create_markdown_file",
      operationType: "write",
      description: "Create a Markdown file from a JSON string in Feishu Drive root, a Drive folder, or a Wiki node.",
      requiredScopes: [feishuMarkdownProviderPermissions.upload, feishuMarkdownProviderPermissions.metadataRead],
      providerPermissions: [feishuMarkdownProviderPermissions.upload, feishuMarkdownProviderPermissions.metadataRead],
      inputSchema: s.object(
        "Provide the Markdown content, file name, and optional destination.",
        {
          fileName: fileNameSchema,
          markdown: markdownSchema,
          folderToken: s.string("The destination Drive folder token; omit both destination tokens for Drive root.", {
            minLength: 1,
          }),
          wikiToken: s.string("The destination Wiki node token.", { minLength: 1 }),
        },
        {
          optional: ["folderToken", "wikiToken"],
        },
      ),
      outputSchema: writeOutputSchema,
    }),
    defineProviderAction(service, {
      name: "fetch_markdown_file",
      operationType: "read",
      description: "Fetch the latest or a specific version of a Markdown file from Feishu Drive.",
      requiredScopes: [feishuMarkdownProviderPermissions.download],
      providerPermissions: [feishuMarkdownProviderPermissions.download],
      inputSchema: s.object(
        "Identify the Markdown file and optional historical version.",
        {
          fileToken: fileTokenSchema,
          version: versionSchema,
        },
        {
          optional: ["version"],
        },
      ),
      outputSchema: s.object(
        "The downloaded Markdown content.",
        {
          fileToken: fileTokenSchema,
          fileName: fileNameSchema,
          markdown: s.string("The downloaded Markdown content."),
          version: versionSchema,
          sizeBytes: s.nonNegativeInteger("The downloaded UTF-8 content size in bytes."),
        },
        {
          optional: ["version"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "diff_markdown_file",
      operationType: "read",
      description:
        "Compute a unified line diff between Drive versions or between a Drive version and a JSON Markdown string.",
      requiredScopes: [feishuMarkdownProviderPermissions.download],
      providerPermissions: [feishuMarkdownProviderPermissions.download],
      inputSchema: s.object(
        "Choose a remote-to-remote or remote-to-input Markdown comparison.",
        {
          fileToken: fileTokenSchema,
          fromVersion: versionSchema,
          toVersion: versionSchema,
          markdown: s.string("The proposed Markdown string to compare with the selected remote version."),
          contextLines: {
            ...s.nonNegativeInteger("The number of unchanged lines to include around each diff hunk.", {
              maximum: 100,
            }),
            default: 3,
          },
        },
        {
          optional: ["fromVersion", "toVersion", "markdown", "contextLines"],
        },
      ),
      outputSchema: s.object(
        "The unified Markdown diff and summary.",
        {
          changed: s.boolean("Whether the compared content differs."),
          mode: s.stringEnum("The comparison mode.", ["remote_vs_remote", "remote_vs_input"]),
          fileToken: fileTokenSchema,
          fromVersion: s.nullable(versionSchema),
          toVersion: s.nullable(versionSchema),
          fromLabel: s.string("The old-side unified diff label."),
          toLabel: s.string("The new-side unified diff label."),
          addedLines: s.nonNegativeInteger("The number of inserted lines."),
          deletedLines: s.nonNegativeInteger("The number of deleted lines."),
          contextLines: s.nonNegativeInteger("The requested number of context lines."),
          hunks: s.array("The unified diff hunks.", diffHunkSchema),
          diff: s.string("The complete unified diff, or an empty string when unchanged."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "patch_markdown_file",
      operationType: "destructive",
      description:
        "Fetch a Markdown file, replace literal text or a JavaScript regular expression locally, and overwrite only when matches exist.",
      requiredScopes: [
        feishuMarkdownProviderPermissions.download,
        feishuMarkdownProviderPermissions.upload,
        feishuMarkdownProviderPermissions.metadataRead,
      ],
      providerPermissions: [
        feishuMarkdownProviderPermissions.download,
        feishuMarkdownProviderPermissions.upload,
        feishuMarkdownProviderPermissions.metadataRead,
      ],
      inputSchema: s.object(
        "Describe the replacement to apply to the remote Markdown file.",
        {
          fileToken: fileTokenSchema,
          pattern: s.string("The non-empty literal text or regular expression to match.", {
            minLength: 1,
          }),
          replacement: s.string("The replacement Markdown string; it may be empty."),
          regex: s.boolean("Whether pattern is a JavaScript regular expression."),
          fileName: fileNameSchema,
        },
        {
          optional: ["regex", "fileName"],
        },
      ),
      outputSchema: s.object(
        "The Markdown patch result.",
        {
          updated: s.boolean("Whether the file was overwritten."),
          mode: s.stringEnum("The replacement mode.", ["literal", "regex"]),
          matchCount: s.nonNegativeInteger("The number of matches replaced."),
          fileName: fileNameSchema,
          version: versionSchema,
          sizeBytesBefore: s.nonNegativeInteger("The UTF-8 size before replacement."),
          sizeBytesAfter: s.nonNegativeInteger("The UTF-8 size after replacement."),
        },
        {
          optional: ["version"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "overwrite_markdown_file",
      operationType: "destructive",
      description: "Overwrite an existing Feishu Drive Markdown file with a complete JSON Markdown string.",
      requiredScopes: [feishuMarkdownProviderPermissions.upload, feishuMarkdownProviderPermissions.metadataRead],
      providerPermissions: [feishuMarkdownProviderPermissions.upload, feishuMarkdownProviderPermissions.metadataRead],
      inputSchema: s.object(
        "Identify the file and provide its complete replacement content.",
        {
          fileToken: fileTokenSchema,
          markdown: markdownSchema,
          fileName: fileNameSchema,
        },
        {
          optional: ["fileName"],
        },
      ),
      outputSchema: writeOutputSchema,
    }),
  ];
}
