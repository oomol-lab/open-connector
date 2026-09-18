import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "signaturely";
const uuid = s.uuid("The Signaturely folder UUID.");
const folderId = s.string("The folder UUID returned by Signaturely.");
const folder = s.object("A Signaturely folder.", {
  id: folderId,
  title: s.string("The folder title."),
  parentId: s.nullableString("The parent folder UUID, or null for a root folder."),
  documentsCount: s.integer("The number of documents directly contained in the folder."),
  foldersCount: s.integer("The number of folders directly contained in the folder."),
});
const folderItem = s.object("A folder list entry.", {
  id: folderId,
  title: s.string("The folder title."),
  documentsCount: s.integer("The number of documents."),
  foldersCount: s.integer("The number of folders."),
});
export const signaturelyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_folders",
    operationType: "read",
    description: "List Signaturely folders from the root or from a selected parent folder.",
    inputSchema: s.actionInput(
      {
        page: s.positiveInteger("The one-based page number."),
        limit: s.positiveInteger("The number of folders per page."),
        folderId: uuid,
        orderingKey: s.stringEnum("The folder field used to order results.", [
          "title",
          "id",
          "foldersCount",
          "documentsCount",
        ]),
        orderingDirection: s.stringEnum("The ordering direction.", ["ASC", "DESC"]),
      },
      ["page", "limit"],
      "Folder list input.",
    ),
    outputSchema: s.actionOutput(
      {
        items: s.array("The folders on the current page.", folderItem),
        itemCount: s.integer("The number of folders on this page."),
        totalItems: s.integer("The total matching folders."),
        itemsPerPage: s.integer("The requested page size."),
        totalPages: s.integer("The total pages."),
        currentPage: s.integer("The current page."),
      },
      "The paginated folder list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_folder",
    operationType: "read",
    description: "Get one Signaturely folder or the virtual root folder.",
    inputSchema: s.actionInput({ id: s.nullable(uuid) }, ["id"], "Folder lookup input."),
    outputSchema: folder,
  }),
  defineProviderAction(service, {
    name: "create_folder",
    operationType: "write",
    description: "Create a Signaturely folder at the root or inside another folder.",
    inputSchema: s.actionInput(
      { title: s.string("The title for the new folder.", { minLength: 1, pattern: "\\S" }), parentId: uuid },
      ["title"],
      "Folder creation input.",
    ),
    outputSchema: folder,
  }),
  defineProviderAction(service, {
    name: "rename_folder",
    operationType: "write",
    description: "Rename an existing Signaturely folder.",
    inputSchema: s.actionInput(
      { id: uuid, title: s.string("The new title.", { minLength: 1, pattern: "\\S" }) },
      ["id", "title"],
      "Folder rename input.",
    ),
    outputSchema: folder,
  }),
];
