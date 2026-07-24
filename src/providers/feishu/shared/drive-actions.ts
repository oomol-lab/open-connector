import type { ActionDefinition, JsonSchema } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
export const feishuDriveProviderScopes = {
  metadataRead: "drive:drive.metadata:readonly",
  search: "search:docs:read",
  folderCreate: "space:folder:create",
  copy: "docs:document:copy",
  move: "space:document:move",
  delete: "space:document:delete",
  commentRead: "docs:document.comment:read",
  commentWrite: "docs:document.comment:write_only",
  commentCreate: "docs:document.comment:create",
  commentUpdate: "docs:document.comment:update",
  commentDelete: "docs:document.comment:delete",
  permissionRead: "docs:permission.member:readonly",
  permissionCreate: "docs:permission.member:create",
  permissionUpdate: "docs:permission.member:update",
  permissionDelete: "docs:permission.member:delete",
};
const driveItemTypeSchema = s.stringEnum("The Feishu Drive resource type.", [
  "file",
  "folder",
  "doc",
  "docx",
  "sheet",
  "bitable",
  "mindnote",
  "slides",
  "shortcut",
]);
const commentFileTypeSchema = s.stringEnum("The resource type used by the comments API.", [
  "file",
  "doc",
  "docx",
  "sheet",
  "bitable",
  "slides",
]);
const resourceTokenSchema = s.string("The Feishu Drive resource token.", { minLength: 1 });
const fileTokenSchema = s.string("The Feishu Drive file or document token.", { minLength: 1 });
const pageTokenSchema = s.string("The pagination token returned by the previous page.", {
  minLength: 1,
});
const looseFileSchema = s.looseRequiredObject(
  "A Feishu Drive file, folder, or document.",
  {
    token: s.string("The resource token."),
    name: s.string("The resource name."),
    type: s.string("The resource type."),
    url: s.string("The resource URL."),
    parent_token: s.string("The parent folder token."),
  },
  {
    optional: ["token", "name", "type", "url", "parent_token"],
  },
);
const commentSchema = s.looseObject("A Feishu Drive comment or reply.");
const permissionSchema = s.looseObject("A Feishu Drive permission member.");
const replyElementSchema = s.looseRequiredObject(
  "One rich-text comment element accepted by Feishu.",
  {
    type: s.string("The element type, such as `text` or `mention`."),
    text_run: s.looseObject("A text-run element payload."),
    docs_link: s.looseObject("A document-link element payload."),
    person: s.looseObject("A person-mention element payload."),
  },
  {
    optional: ["type", "text_run", "docs_link", "person"],
  },
);
const permissionResourceTypeSchema = s.stringEnum("The resource type used by the Drive permission API.", [
  "doc",
  "docx",
  "sheet",
  "bitable",
  "file",
  "folder",
  "wiki",
  "mindnote",
  "slides",
]);
const memberTypeSchema = s.stringEnum("How Feishu should interpret the member ID.", [
  "email",
  "openid",
  "unionid",
  "openchat",
  "opendepartmentid",
  "groupid",
  "appid",
  "wikispaceid",
]);
const permissionRoleSchema = s.stringEnum("The permission role granted to the member.", [
  "view",
  "edit",
  "full_access",
]);
export function createFeishuDriveActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "inspect_drive_item",
      description:
        "Inspect a Feishu Drive token to resolve its canonical type, title, URL, and underlying document for Wiki nodes.",
      requiredScopes: [feishuDriveProviderScopes.metadataRead, "wiki:node:retrieve"],
      providerPermissions: [feishuDriveProviderScopes.metadataRead, "wiki:node:retrieve"],
      inputSchema: s.object(
        "Identify the Drive item to inspect.",
        {
          token: resourceTokenSchema,
          type: s.stringEnum("The known or inferred resource type.", [
            "file",
            "folder",
            "doc",
            "docx",
            "sheet",
            "bitable",
            "wiki",
            "mindnote",
            "slides",
          ]),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "Resolved metadata for a Feishu Drive item.",
        {
          token: resourceTokenSchema,
          type: s.string("The resolved resource type."),
          title: s.string("The resource title."),
          url: s.string("The canonical resource URL returned by Feishu."),
          wikiNode: s.looseObject("The source Wiki node metadata when the input was a Wiki node."),
          raw: s.looseObject("The raw metadata returned by the Drive metadata API."),
        },
        {
          optional: ["title", "url", "wikiNode"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "search_drive_items",
      description: "Search Feishu Drive documents, Wiki nodes, spreadsheets, Base apps, files, folders, and slides.",
      requiredScopes: [feishuDriveProviderScopes.search],
      providerPermissions: [feishuDriveProviderScopes.search],
      inputSchema: s.object(
        "Provide Search v2 query, filters, and pagination.",
        {
          query: s.string("The search text; it may be empty when filters are provided.", {
            maxLength: 30,
          }),
          docFilter: s.looseObject("A Search v2 document filter."),
          wikiFilter: s.looseObject("A Search v2 Wiki filter."),
          pageSize: s.positiveInteger("The number of results to return, from 1 to 20.", {
            maximum: 20,
          }),
          pageToken: pageTokenSchema,
        },
        {
          optional: ["query", "docFilter", "wikiFilter", "pageSize", "pageToken"],
        },
      ),
      outputSchema: s.object(
        "A page of matching Drive resources.",
        {
          items: s.array("The matching resources.", s.looseObject("A Search v2 result.")),
          total: s.integer("The total number of matching resources."),
          hasMore: s.boolean("Whether another page is available."),
          pageToken: pageTokenSchema,
          notice: s.string("An optional search notice returned by Feishu."),
        },
        {
          optional: ["total", "pageToken", "notice"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_drive_files",
      description: "List files, folders, and online documents inside a Feishu Drive folder.",
      requiredScopes: [feishuDriveProviderScopes.metadataRead],
      providerPermissions: [feishuDriveProviderScopes.metadataRead],
      inputSchema: s.object(
        "Choose a folder, sort order, and page.",
        {
          folderToken: s.string("The folder token to list; omit it to list the caller's root folder.", {
            minLength: 1,
          }),
          pageSize: s.positiveInteger("The number of items to return, up to 200.", {
            maximum: 200,
          }),
          pageToken: pageTokenSchema,
          orderBy: s.stringEnum("The field used to order the folder contents.", ["EditedTime", "CreatedTime"]),
          direction: s.stringEnum("The result ordering direction.", ["ASC", "DESC"]),
        },
        {
          optional: ["folderToken", "pageSize", "pageToken", "orderBy", "direction"],
        },
      ),
      outputSchema: pageOutputSchema("A page of Drive files.", looseFileSchema),
    }),
    defineProviderAction(service, {
      name: "create_drive_folder",
      description: "Create a folder in Feishu Drive.",
      requiredScopes: [feishuDriveProviderScopes.folderCreate],
      providerPermissions: [feishuDriveProviderScopes.folderCreate],
      inputSchema: s.object(
        "Provide a folder name and optional parent folder.",
        {
          name: s.string("The new folder name, limited to 256 UTF-8 bytes.", {
            minLength: 1,
          }),
          folderToken: s.string("The parent folder token; omit it to use the caller's root folder.", { minLength: 1 }),
        },
        {
          optional: ["folderToken"],
        },
      ),
      outputSchema: s.object(
        "The created Drive folder.",
        {
          folder: {
            ...looseFileSchema,
            description: "The created folder metadata.",
          },
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "copy_drive_file",
      description: "Copy a Feishu Drive file or online document into another folder.",
      requiredScopes: [feishuDriveProviderScopes.copy],
      providerPermissions: [feishuDriveProviderScopes.copy],
      inputSchema: s.object(
        "Identify the source file and destination.",
        {
          fileToken: fileTokenSchema,
          type: driveItemTypeSchema,
          name: s.string("The copied file name, limited to 256 UTF-8 bytes.", {
            minLength: 1,
          }),
          folderToken: s.string("The destination folder token.", { minLength: 1 }),
          userIdType: userIdTypeSchema(),
        },
        {
          optional: ["userIdType"],
        },
      ),
      outputSchema: s.object(
        "The copied Drive file.",
        {
          file: {
            ...looseFileSchema,
            description: "The copied file metadata.",
          },
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "move_drive_item",
      description:
        "Move a Feishu Drive file or folder and return a task ID when Feishu processes the move asynchronously.",
      requiredScopes: [feishuDriveProviderScopes.move],
      providerPermissions: [feishuDriveProviderScopes.move],
      inputSchema: s.object(
        "Identify the item and destination folder.",
        {
          fileToken: fileTokenSchema,
          type: driveItemTypeSchema,
          folderToken: s.string("The destination folder token.", { minLength: 1 }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: driveMutationOutputSchema("The Drive move result."),
    }),
    defineProviderAction(service, {
      name: "delete_drive_item",
      description:
        "Delete a Feishu Drive file or folder and return a task ID when Feishu processes the deletion asynchronously.",
      requiredScopes: [feishuDriveProviderScopes.delete, feishuDriveProviderScopes.metadataRead],
      providerPermissions: [feishuDriveProviderScopes.delete, feishuDriveProviderScopes.metadataRead],
      inputSchema: s.object(
        "Identify the Drive item to delete.",
        {
          fileToken: fileTokenSchema,
          type: driveItemTypeSchema,
        },
        {
          optional: [],
        },
      ),
      outputSchema: driveMutationOutputSchema("The Drive deletion result."),
    }),
    defineProviderAction(service, {
      name: "get_drive_task_status",
      description: "Get the current state of an asynchronous Drive move, copy, or delete task.",
      requiredScopes: [feishuDriveProviderScopes.metadataRead],
      providerPermissions: [feishuDriveProviderScopes.metadataRead],
      inputSchema: s.object(
        "Identify the Drive background task.",
        {
          taskId: s.string("The task ID returned by a Drive mutation.", { minLength: 1 }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.looseRequiredObject(
        "The Drive background task state.",
        {
          taskId: s.string("The queried task ID."),
          status: s.string("The task status returned by Feishu."),
        },
        {
          optional: ["status"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_drive_comments",
      description: "List comments on a Feishu Drive document or supported file.",
      requiredScopes: [feishuDriveProviderScopes.commentRead],
      providerPermissions: [feishuDriveProviderScopes.commentRead],
      inputSchema: s.object(
        "Identify the resource and filter its comments.",
        {
          fileToken: fileTokenSchema,
          fileType: commentFileTypeSchema,
          solved: s.boolean("Filter comments by solved state; omit to include both states."),
          whole: s.boolean("Filter full-document versus local comments; omit to include both scopes."),
          needReaction: s.boolean("Include reactions on each comment."),
          needRelation: s.boolean("Include docx comment relation metadata."),
          pageSize: s.positiveInteger("The number of comments to return, up to 100.", {
            maximum: 100,
          }),
          pageToken: pageTokenSchema,
        },
        {
          optional: ["solved", "whole", "needReaction", "needRelation", "pageSize", "pageToken"],
        },
      ),
      outputSchema: pageOutputSchema("A page of Drive comments.", commentSchema),
    }),
    defineProviderAction(service, {
      name: "create_drive_comment",
      description: "Create a full-resource or anchored rich-text comment on a Feishu Drive document or supported file.",
      requiredScopes: [feishuDriveProviderScopes.commentCreate, feishuDriveProviderScopes.commentWrite],
      providerPermissions: [feishuDriveProviderScopes.commentCreate, feishuDriveProviderScopes.commentWrite],
      inputSchema: s.object(
        "Identify the resource and provide rich-text comment elements.",
        {
          fileToken: fileTokenSchema,
          fileType: commentFileTypeSchema,
          replyElements: s.array("The rich-text elements that form the initial comment reply.", replyElementSchema, {
            minItems: 1,
          }),
          anchor: s.looseObject(
            "An optional Feishu comment anchor for a block, sheet cell, slide element, or Base record.",
          ),
        },
        {
          optional: ["anchor"],
        },
      ),
      outputSchema: s.object(
        "The created Drive comment.",
        {
          comment: {
            ...commentSchema,
            description: "The created comment payload.",
          },
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "update_drive_comment",
      description: "Mark a Feishu Drive comment as solved or unresolved.",
      requiredScopes: [feishuDriveProviderScopes.commentUpdate],
      providerPermissions: [feishuDriveProviderScopes.commentUpdate],
      inputSchema: commentIdentitySchema({
        solved: s.boolean("Whether the comment should be marked as solved."),
      }),
      outputSchema: s.object(
        "The updated Drive comment.",
        {
          comment: {
            ...commentSchema,
            description: "The updated comment payload.",
          },
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "delete_drive_comment",
      description: "Delete a Feishu Drive comment.",
      requiredScopes: [feishuDriveProviderScopes.commentDelete],
      providerPermissions: [feishuDriveProviderScopes.commentDelete],
      inputSchema: commentIdentitySchema({}),
      outputSchema: deletionOutputSchema("Whether the Drive comment was deleted."),
    }),
    defineProviderAction(service, {
      name: "create_drive_comment_reply",
      description: "Add a rich-text reply to a Feishu Drive comment.",
      requiredScopes: [feishuDriveProviderScopes.commentCreate, feishuDriveProviderScopes.commentWrite],
      providerPermissions: [feishuDriveProviderScopes.commentCreate, feishuDriveProviderScopes.commentWrite],
      inputSchema: commentIdentitySchema({
        replyElements: s.array("The rich-text reply elements.", replyElementSchema, {
          minItems: 1,
        }),
      }),
      outputSchema: s.object(
        "The created Drive comment reply.",
        {
          reply: {
            ...commentSchema,
            description: "The created reply payload.",
          },
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "delete_drive_comment_reply",
      description: "Delete a reply from a Feishu Drive comment.",
      requiredScopes: [feishuDriveProviderScopes.commentDelete],
      providerPermissions: [feishuDriveProviderScopes.commentDelete],
      inputSchema: commentIdentitySchema({
        replyId: s.string("The reply ID to delete.", { minLength: 1 }),
      }),
      outputSchema: deletionOutputSchema("Whether the Drive comment reply was deleted."),
    }),
    defineProviderAction(service, {
      name: "list_drive_permissions",
      description: "List collaborators and permission roles on a Feishu Drive resource.",
      requiredScopes: [feishuDriveProviderScopes.permissionRead],
      providerPermissions: [feishuDriveProviderScopes.permissionRead],
      inputSchema: permissionResourceSchema({
        fields: s.string("A comma-separated projection of permission member fields."),
        permType: s.stringEnum("The Wiki permission scope.", ["container", "single_page"]),
      }),
      outputSchema: s.object(
        "The permission members on a Drive resource.",
        {
          members: s.array("The permission members.", permissionSchema),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "add_drive_permission",
      description: "Grant a collaborator permission on a Feishu Drive resource.",
      requiredScopes: [feishuDriveProviderScopes.permissionCreate],
      providerPermissions: [feishuDriveProviderScopes.permissionCreate],
      inputSchema: permissionResourceSchema({
        memberId: s.string("The collaborator identifier.", { minLength: 1 }),
        memberType: memberTypeSchema,
        permission: permissionRoleSchema,
        permType: s.stringEnum("The Wiki permission scope.", ["container", "single_page"]),
        memberKind: s.stringEnum("The Wiki-space member role.", [
          "wiki_space_member",
          "wiki_space_viewer",
          "wiki_space_editor",
        ]),
        needNotification: s.boolean("Whether Feishu should notify the collaborator."),
      }),
      outputSchema: s.object(
        "The granted Drive permission.",
        {
          member: {
            ...permissionSchema,
            description: "The created permission member.",
          },
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "update_drive_permission",
      description: "Change a collaborator's permission role on a Feishu Drive resource.",
      requiredScopes: [feishuDriveProviderScopes.permissionUpdate],
      providerPermissions: [feishuDriveProviderScopes.permissionUpdate],
      inputSchema: permissionResourceSchema({
        memberId: s.string("The collaborator identifier.", { minLength: 1 }),
        memberType: memberTypeSchema,
        permission: permissionRoleSchema,
        needNotification: s.boolean("Whether Feishu should notify the collaborator."),
      }),
      outputSchema: s.object(
        "The updated Drive permission.",
        {
          member: {
            ...permissionSchema,
            description: "The updated permission member.",
          },
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "remove_drive_permission",
      description: "Remove a collaborator permission from a Feishu Drive resource.",
      requiredScopes: [feishuDriveProviderScopes.permissionDelete],
      providerPermissions: [feishuDriveProviderScopes.permissionDelete],
      inputSchema: permissionResourceSchema({
        memberId: s.string("The collaborator identifier.", { minLength: 1 }),
        memberType: memberTypeSchema,
        permType: s.stringEnum("The Wiki permission scope.", ["container", "single_page"]),
      }),
      outputSchema: deletionOutputSchema("Whether the Drive permission was removed."),
    }),
  ];
}
function userIdTypeSchema() {
  return s.stringEnum("The user identifier format returned in the response.", ["open_id", "union_id", "user_id"]);
}
function pageOutputSchema(description: string, itemSchema: Record<string, unknown>) {
  return s.object(
    description,
    {
      items: s.array("The items on this page.", itemSchema),
      hasMore: s.boolean("Whether another page is available."),
      pageToken: pageTokenSchema,
    },
    {
      optional: ["pageToken"],
    },
  );
}
function driveMutationOutputSchema(description: string) {
  return s.looseRequiredObject(
    description,
    {
      fileToken: s.string("The affected Drive resource token."),
      type: s.string("The affected Drive resource type."),
      folderToken: s.string("The destination folder token for move operations."),
      taskId: s.string("The asynchronous task ID returned by Feishu."),
      deleted: s.boolean("Whether the deletion completed synchronously."),
    },
    {
      optional: ["folderToken", "taskId", "deleted"],
    },
  );
}
function deletionOutputSchema(description: string) {
  return s.object(
    description,
    {
      deleted: s.boolean("Whether the requested resource was deleted."),
    },
    {
      optional: [],
    },
  );
}
function commentIdentitySchema(extra: Record<string, JsonSchema>) {
  return s.object(
    "Identify a Feishu Drive comment.",
    {
      fileToken: fileTokenSchema,
      fileType: commentFileTypeSchema,
      commentId: s.string("The Drive comment ID.", { minLength: 1 }),
      ...extra,
    },
    {
      optional: [],
    },
  );
}
function permissionResourceSchema(extra: Record<string, JsonSchema>) {
  return s.object(
    "Identify a Feishu Drive permission resource and operation.",
    {
      token: resourceTokenSchema,
      resourceType: permissionResourceTypeSchema,
      ...extra,
    },
    {
      optional: [],
    },
  );
}
