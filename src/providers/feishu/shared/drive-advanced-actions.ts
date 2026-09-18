import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
interface FeishuDriveAdvancedActionOptions {
  readonly service: string;
  readonly identity: "user" | "bot";
}
export const feishuDriveAdvancedProviderPermissions = {
  shortcut: "space:document:shortcut",
  fileDownload: "drive:file:download",
  fileUpload: "drive:file:upload",
  permissionApply: "docs:permission.member:apply",
  secureLabelRead: "docs:secure_label:readonly",
  secureLabelWrite: "docs:secure_label:write_only",
};
const tokenSchema = s.string("A Feishu Drive resource token.", { minLength: 1 });
const driveFileTypeSchema = s.stringEnum("The referenced Drive file type.", [
  "file",
  "docx",
  "bitable",
  "doc",
  "sheet",
  "mindnote",
  "slides",
]);
const permissionTargetTypeSchema = s.stringEnum("The target type used by Drive permission and secure-label APIs.", [
  "doc",
  "sheet",
  "file",
  "wiki",
  "bitable",
  "docx",
  "mindnote",
  "slides",
]);
const versionSchema = s.string("The numeric Drive file version string.", {
  minLength: 1,
  maxLength: 19,
});
const versionItemSchema = s.object(
  "One normalized Drive file version.",
  {
    version: versionSchema,
    name: s.string("The file name stored for this version."),
    editedAt: s.string("The version edit timestamp."),
    editedBy: s.string("The user ID that created this version."),
    sizeBytes: s.nonNegativeInteger("The version size in bytes."),
    actionType: s.string("The normalized version action such as `upload`, `rename`, `delete_version`, or `revert`."),
    isDeleted: s.boolean("Whether this version is deleted."),
    tag: s.integer("The version tag returned by Feishu."),
    raw: s.looseObject("The raw version object returned by Feishu."),
  },
  {
    optional: ["name", "editedAt", "editedBy", "sizeBytes", "actionType", "isDeleted", "tag"],
  },
);
const transitFileSchema = s.object(
  "A downloaded Drive artifact stored in local transit storage.",
  {
    name: s.string("The downloaded file name."),
    mimeType: s.string("The downloaded file MIME type."),
    fileId: s.nonEmptyString("The local transit file identifier."),
    downloadUrl: s.url("The local transit file download URL."),
    sizeBytes: s.nonNegativeInteger("The downloaded file size in bytes."),
  },
  {
    optional: ["sizeBytes"],
  },
);
const previewCandidateSchema = s.object(
  "One Drive preview candidate.",
  {
    type: s.string("The normalized preview type."),
    typeCode: s.string("The Feishu preview type code."),
    status: s.string("The normalized preview generation status."),
    statusCode: s.string("The Feishu preview status code."),
    downloadable: s.boolean("Whether the preview can currently be downloaded."),
    reason: s.string("Why the preview cannot currently be downloaded."),
    raw: s.looseObject("The raw preview candidate."),
  },
  {
    optional: ["reason"],
  },
);
const targetInputFields = {
  token: s.string("A bare Drive token or a Feishu document URL from which the token and type can be inferred.", {
    minLength: 1,
  }),
  type: permissionTargetTypeSchema,
};
export function createFeishuDriveAdvancedActions(
  options: FeishuDriveAdvancedActionOptions,
): readonly ActionDefinition[] {
  const actions: ActionDefinition[] = [
    defineProviderAction(options.service, {
      name: "create_drive_shortcut",
      operationType: "write",
      description: "Create a Feishu Drive shortcut to an existing file in another folder.",
      requiredScopes: [feishuDriveAdvancedProviderPermissions.shortcut],
      providerPermissions: [feishuDriveAdvancedProviderPermissions.shortcut],
      inputSchema: s.object(
        "Identify the source file and target folder.",
        {
          fileToken: tokenSchema,
          type: driveFileTypeSchema,
          folderToken: s.string("The target folder token for the new shortcut.", {
            minLength: 1,
          }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The created Drive shortcut.",
        {
          created: s.literal(true, { description: "Whether the shortcut was created." }),
          sourceFileToken: tokenSchema,
          sourceType: driveFileTypeSchema,
          folderToken: tokenSchema,
          shortcutToken: tokenSchema,
          url: s.url("The created shortcut URL."),
          title: s.string("The created shortcut title."),
          raw: s.looseObject("The raw shortcut response."),
        },
        {
          optional: ["shortcutToken", "url", "title"],
        },
      ),
    }),
    defineProviderAction(options.service, {
      name: "list_drive_versions",
      operationType: "read",
      description: "List one page of tagged version history for a Feishu Drive file.",
      requiredScopes: [feishuDriveAdvancedProviderPermissions.fileDownload],
      providerPermissions: [feishuDriveAdvancedProviderPermissions.fileDownload],
      inputSchema: s.object(
        "Identify the file and version-history page.",
        {
          fileToken: tokenSchema,
          pageSize: s.positiveInteger("The maximum number of versions to return.", {
            maximum: 200,
          }),
          cursor: s.string("The numeric edit-time cursor returned as nextCursor by the previous page.", {
            minLength: 1,
            maxLength: 19,
          }),
        },
        {
          optional: ["pageSize", "cursor"],
        },
      ),
      outputSchema: s.object(
        "A page of Drive file versions.",
        {
          versions: s.array("The normalized versions on this page.", versionItemSchema),
          hasMore: s.boolean("Whether another history page is available."),
          nextCursor: s.string("The cursor for the next page."),
        },
        {
          optional: ["nextCursor"],
        },
      ),
    }),
    defineProviderAction(options.service, {
      name: "get_drive_version",
      operationType: "read",
      description: "Download one specific Feishu Drive file version into local transit storage.",
      requiredScopes: [feishuDriveAdvancedProviderPermissions.fileDownload],
      providerPermissions: [feishuDriveAdvancedProviderPermissions.fileDownload],
      inputSchema: s.object(
        "Identify the file and numeric version.",
        {
          fileToken: tokenSchema,
          version: versionSchema,
          fileName: s.string("An optional downloaded file name override.", { minLength: 1 }),
        },
        {
          optional: ["fileName"],
        },
      ),
      outputSchema: s.object(
        "The downloaded Drive file version.",
        {
          fileToken: tokenSchema,
          version: versionSchema,
          file: s.object(
            "The historical file stored in local transit storage.",
            {
              name: s.string("The downloaded file name."),
              mimeType: s.string("The downloaded file MIME type."),
              fileId: s.nonEmptyString("The local transit file identifier."),
              downloadUrl: s.url("The local transit file download URL."),
              sizeBytes: s.nonNegativeInteger("The downloaded file size in bytes."),
            },
            {
              optional: ["sizeBytes"],
            },
          ),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(options.service, {
      name: "list_drive_previews",
      operationType: "read",
      description: "List available preview artifacts and generation states for a Feishu Drive file.",
      requiredScopes: [feishuDriveAdvancedProviderPermissions.fileDownload],
      providerPermissions: [feishuDriveAdvancedProviderPermissions.fileDownload],
      inputSchema: s.object(
        "Identify the Drive file and optional version.",
        {
          fileToken: tokenSchema,
          version: versionSchema,
        },
        {
          optional: ["version"],
        },
      ),
      outputSchema: s.object(
        "The available Drive preview artifacts.",
        {
          fileToken: tokenSchema,
          version: s.string("The resolved file version."),
          candidates: s.array("The available preview candidates.", previewCandidateSchema),
        },
        {
          optional: ["version"],
        },
      ),
    }),
    defineProviderAction(options.service, {
      name: "download_drive_preview",
      operationType: "read",
      description: "Resolve a requested Drive preview type and download the ready artifact into local transit storage.",
      requiredScopes: [feishuDriveAdvancedProviderPermissions.fileDownload],
      providerPermissions: [feishuDriveAdvancedProviderPermissions.fileDownload],
      inputSchema: s.object(
        "Identify the Drive file and requested preview.",
        {
          fileToken: tokenSchema,
          previewType: s.string(
            "A preview name, alias, or type code such as `pdf`, `html`, `text`, `image`, `source`, or `0`.",
            { minLength: 1 },
          ),
          version: versionSchema,
          fileName: s.string("An optional downloaded file name override.", { minLength: 1 }),
        },
        {
          optional: ["version", "fileName"],
        },
      ),
      outputSchema: s.object(
        "The downloaded Drive preview.",
        {
          fileToken: tokenSchema,
          previewType: s.string("The resolved preview type."),
          previewTypeCode: s.string("The resolved Feishu preview type code."),
          version: s.string("The resolved file version."),
          file: transitFileSchema,
        },
        {
          optional: ["version"],
        },
      ),
    }),
    defineProviderAction(options.service, {
      name: "download_drive_cover",
      operationType: "read",
      description: "Download a stable Drive cover preset into local transit storage.",
      requiredScopes: [feishuDriveAdvancedProviderPermissions.fileDownload],
      providerPermissions: [feishuDriveAdvancedProviderPermissions.fileDownload],
      inputSchema: s.object(
        "Identify the Drive file and cover preset.",
        {
          fileToken: tokenSchema,
          spec: s.stringEnum("The stable cover preset.", [
            "default",
            "icon",
            "grid",
            "small",
            "middle",
            "big",
            "square",
          ]),
          version: versionSchema,
          fileName: s.string("An optional downloaded file name override.", { minLength: 1 }),
        },
        {
          optional: ["version", "fileName"],
        },
      ),
      outputSchema: s.object(
        "The downloaded Drive cover.",
        {
          fileToken: tokenSchema,
          spec: s.string("The selected cover preset."),
          file: transitFileSchema,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(options.service, {
      name: "revert_drive_version",
      operationType: "destructive",
      description: "Revert a Feishu Drive file to a specific historical version.",
      requiredScopes: [feishuDriveAdvancedProviderPermissions.fileUpload],
      providerPermissions: [feishuDriveAdvancedProviderPermissions.fileUpload],
      inputSchema: versionMutationInput("Identify the file version to restore."),
      outputSchema: s.object(
        "The Drive version revert result.",
        {
          fileToken: tokenSchema,
          version: versionSchema,
          reverted: s.literal(true, { description: "Whether the historical version was restored." }),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(options.service, {
      name: "delete_drive_version",
      operationType: "destructive",
      description: "Permanently delete a specific historical version of a Feishu Drive file.",
      requiredScopes: [feishuDriveAdvancedProviderPermissions.fileUpload],
      providerPermissions: [feishuDriveAdvancedProviderPermissions.fileUpload],
      inputSchema: versionMutationInput("Identify the historical file version to delete."),
      outputSchema: s.object(
        "The Drive version deletion result.",
        {
          fileToken: tokenSchema,
          version: versionSchema,
          deleted: s.literal(true, { description: "Whether the historical version was deleted." }),
        },
        {
          optional: [],
        },
      ),
    }),
  ];
  if (options.identity === "user") {
    actions.push(
      defineProviderAction(options.service, {
        name: "apply_drive_permission",
        operationType: "write",
        description: "Apply to a Feishu document owner for view or edit permission on behalf of the current user.",
        requiredScopes: [feishuDriveAdvancedProviderPermissions.permissionApply],
        providerPermissions: [feishuDriveAdvancedProviderPermissions.permissionApply],
        inputSchema: s.object(
          "Identify the target and permission to request.",
          {
            ...targetInputFields,
            permission: s.stringEnum("The permission to request.", ["view", "edit"]),
            remark: s.string("An optional note shown to the document owner."),
          },
          {
            optional: ["type", "remark"],
          },
        ),
        outputSchema: s.object(
          "The Drive permission application result.",
          {
            targetToken: tokenSchema,
            targetType: permissionTargetTypeSchema,
            permission: s.stringEnum("The requested permission.", ["view", "edit"]),
            raw: s.looseObject("The raw permission application response."),
          },
          {
            optional: [],
          },
        ),
      }),
      defineProviderAction(options.service, {
        name: "list_drive_secure_labels",
        operationType: "read",
        description: "List secure labels available to the current Feishu user.",
        requiredScopes: [feishuDriveAdvancedProviderPermissions.secureLabelRead],
        providerPermissions: [feishuDriveAdvancedProviderPermissions.secureLabelRead],
        inputSchema: s.object(
          "Choose the secure-label result page and language.",
          {
            pageSize: s.positiveInteger("The number of labels to return.", { maximum: 10 }),
            pageToken: s.string("The pagination token returned by the previous page.", {
              minLength: 1,
            }),
            language: s.stringEnum("The secure-label display language.", ["zh", "en", "ja"]),
          },
          {
            optional: ["pageSize", "pageToken", "language"],
          },
        ),
        outputSchema: s.object(
          "A page of secure labels.",
          {
            items: s.array("The secure labels available to the user.", s.looseObject("One Feishu secure label.")),
            hasMore: s.boolean("Whether another label page is available."),
            pageToken: s.string("The token for the next page."),
            raw: s.looseObject("The raw secure-label list response."),
          },
          {
            optional: ["pageToken"],
          },
        ),
      }),
      defineProviderAction(options.service, {
        name: "update_drive_secure_label",
        operationType: "write",
        description: "Set the secure label of a Feishu Drive file or document.",
        requiredScopes: [feishuDriveAdvancedProviderPermissions.secureLabelWrite],
        providerPermissions: [feishuDriveAdvancedProviderPermissions.secureLabelWrite],
        inputSchema: s.object(
          "Identify the target and numeric secure-label ID.",
          {
            ...targetInputFields,
            labelId: s.string("The numeric secure-label ID returned by list_drive_secure_labels.", {
              minLength: 1,
            }),
          },
          {
            optional: ["type"],
          },
        ),
        outputSchema: s.object(
          "The secure-label update result.",
          {
            targetToken: tokenSchema,
            targetType: permissionTargetTypeSchema,
            labelId: s.string("The applied secure-label ID."),
            updated: s.literal(true, { description: "Whether the secure label was updated." }),
            raw: s.looseObject("The raw secure-label update response."),
          },
          {
            optional: [],
          },
        ),
      }),
    );
  }
  return actions;
}
function versionMutationInput(description: string) {
  return s.object(
    description,
    {
      fileToken: tokenSchema,
      version: versionSchema,
    },
    {
      optional: [],
    },
  );
}
