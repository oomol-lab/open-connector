import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { feishuProviderScopes } from "./scopes.ts";

const service = "feishu";

const feishuUserSchema = s.object("The authenticated Feishu user profile.", {
  openId: s.nullableString("The open_id of the authorized user, scoped to this OAuth app."),
  unionId: s.nullableString("The union_id of the authorized user, scoped to the developer account."),
  userId: s.nullableString("The tenant-scoped user_id of the authorized user."),
  name: s.nullableString("The display name of the authorized user."),
  enName: s.nullableString("The English name of the authorized user."),
  email: s.nullableString("The email of the authorized user, when the user granted it."),
  avatarUrl: s.nullableString("The avatar URL of the authorized user."),
  tenantKey: s.nullableString("The tenant key the authorized user belongs to."),
  raw: s.looseObject("The raw user_info object returned by Feishu."),
});

const feishuDocumentSchema = s.object("A Feishu docx document's basic metadata.", {
  documentId: s.string("The document id (docx document_id)."),
  revisionId: s.nullableInteger("The current document revision number."),
  title: s.nullableString("The document title."),
  raw: s.looseObject("The raw document object returned by Feishu."),
});

const feishuDocumentContentSchema = s.object("The plain-text content of a Feishu docx document.", {
  documentId: s.string("The document id whose content was read."),
  content: s.string("The full plain-text content of the document."),
});

const feishuDocumentBlocksSchema = s.object("A page of a Feishu docx document's structured blocks.", {
  items: s.array("The document blocks on this page.", s.looseObject("A raw docx block object.")),
  pageToken: s.nullableString("The token to fetch the next page, when has_more is true."),
  hasMore: s.nullableBoolean("Whether more block pages are available."),
});

/**
 * Feishu actions backed by the user_access_token (the authorized user's own
 * identity and resources). Bitable read actions are added in follow-up work.
 */
export const feishuActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the profile of the Feishu user who authorized this connection, using their user_access_token.",
    inputSchema: s.object("No input is required.", {}),
    outputSchema: feishuUserSchema,
  }),
  defineProviderAction(service, {
    name: "get_document",
    description: "Get a Feishu docx document's basic metadata (title and revision) that the authorized user can read.",
    requiredScopes: [feishuProviderScopes.docxReadonly],
    inputSchema: s.object("Identify the document to read.", {
      documentId: s.nonEmptyString("The docx document id, from the document URL (.../docx/<document_id>)."),
    }),
    outputSchema: feishuDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "get_document_content",
    description: "Read the full plain-text content of a Feishu docx document the authorized user can access.",
    requiredScopes: [feishuProviderScopes.docxReadonly],
    inputSchema: s.object(
      "Identify the document to read.",
      {
        documentId: s.nonEmptyString("The docx document id, from the document URL (.../docx/<document_id>)."),
        lang: s.integer("Language for @user mentions in the text: 0 = default name, 1 = English name."),
      },
      { optional: ["lang"] },
    ),
    outputSchema: feishuDocumentContentSchema,
  }),
  defineProviderAction(service, {
    name: "list_document_blocks",
    description:
      "List a Feishu docx document's structured blocks (one page), for reading document structure and rich content.",
    requiredScopes: [feishuProviderScopes.docxReadonly],
    inputSchema: s.object(
      "Identify the document and page through its blocks.",
      {
        documentId: s.nonEmptyString("The docx document id, from the document URL (.../docx/<document_id>)."),
        pageSize: s.integer("Number of blocks per page (max 500, default 500)."),
        pageToken: s.string("The page token returned by a previous call; omit for the first page."),
        documentRevisionId: s.integer("Document revision to read; -1 (default) reads the latest version."),
        userIdType: s.stringEnum("The user id format for user fields in blocks.", ["open_id", "union_id", "user_id"]),
      },
      { optional: ["pageSize", "pageToken", "documentRevisionId", "userIdType"] },
    ),
    outputSchema: feishuDocumentBlocksSchema,
  }),
];

export type FeishuActionName = "get_current_user" | "get_document" | "get_document_content" | "list_document_blocks";
