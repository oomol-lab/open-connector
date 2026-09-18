import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { feishuProviderScopes } from "./scopes.ts";
import { createFeishuApplicationActions } from "./shared/application-actions.ts";
import { createFeishuApprovalActions } from "./shared/approval-actions.ts";
import { createFeishuAttendanceActions } from "./shared/attendance-actions.ts";
import { createFeishuBaseActions } from "./shared/base-actions.ts";
import { createFeishuBaseAdvancedActions } from "./shared/base-advanced-actions.ts";
import { createFeishuCalendarActions } from "./shared/calendar-actions.ts";
import { createFeishuContactActions } from "./shared/contact-actions.ts";
import { createFeishuDocsActions } from "./shared/docs-actions.ts";
import { createFeishuDomainMediaActions } from "./shared/domain-media-actions.ts";
import { createFeishuDriveActions } from "./shared/drive-actions.ts";
import { createFeishuDriveAdvancedActions } from "./shared/drive-advanced-actions.ts";
import { createFeishuFileActions } from "./shared/file-actions.ts";
import { createFeishuImActions } from "./shared/im-actions.ts";
import { createFeishuImOrganizeActions } from "./shared/im-organize-actions.ts";
import { createFeishuImUserActions } from "./shared/im-user-actions.ts";
import { createFeishuMailActions } from "./shared/mail-actions.ts";
import { createFeishuMailAdvancedActions } from "./shared/mail-advanced-actions.ts";
import { createFeishuMarkdownActions } from "./shared/markdown-actions.ts";
import { createFeishuMinutesActions } from "./shared/minutes-actions.ts";
import { createFeishuNoteActions } from "./shared/note-actions.ts";
import { createFeishuOkrActions } from "./shared/okr-actions.ts";
import { createFeishuSheetsActions } from "./shared/sheets-actions.ts";
import { createFeishuSheetsAdvancedActions } from "./shared/sheets-advanced-actions.ts";
import { createFeishuSlidesActions } from "./shared/slides-actions.ts";
import { createFeishuTaskActions } from "./shared/task-actions.ts";
import { createFeishuVcActions } from "./shared/vc-actions.ts";
import { createFeishuWhiteboardActions } from "./shared/whiteboard-actions.ts";
import { createFeishuWikiActions } from "./shared/wiki-actions.ts";

const service = "feishu";

function feishuPageSchema(description: string, itemDescription: string): JsonSchema {
  return s.object(description, {
    items: s.array("The items on this page.", s.looseObject(itemDescription)),
    pageToken: s.nullableString("The token to fetch the next page, when hasMore is true."),
    hasMore: s.nullableBoolean("Whether more pages are available."),
    total: s.nullableInteger("The total number of items, when the API reports it."),
  });
}

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

const docxIdField = s.nonEmptyString("The docx document id, from the document URL (.../docx/<document_id>).");
const baseAppTokenField = s.nonEmptyString("The Bitable app token, from the Base URL (.../base/<app_token>).");
const baseTableIdField = s.nonEmptyString("The Bitable table id (starts with tbl), from the URL (?table=<table_id>).");

/**
 * Feishu actions backed by the user_access_token: the authorized user's own
 * identity, docx documents, and Bitable data. All reads are read-only.
 */
export const feishuActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Get the profile of the Feishu user who authorized this connection, using their user_access_token.",
    inputSchema: s.object("No input is required.", {}),
    outputSchema: feishuUserSchema,
  }),
  defineProviderAction(service, {
    name: "get_document",
    operationType: "read",
    description: "Get a Feishu docx document's basic metadata (title and revision) that the authorized user can read.",
    requiredScopes: [feishuProviderScopes.docxReadonly],
    providerPermissions: [feishuProviderScopes.docxReadonly],
    inputSchema: s.object("Identify the document to read.", { documentId: docxIdField }),
    outputSchema: feishuDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "get_document_content",
    operationType: "read",
    description: "Read the full plain-text content of a Feishu docx document the authorized user can access.",
    requiredScopes: [feishuProviderScopes.docxReadonly],
    providerPermissions: [feishuProviderScopes.docxReadonly],
    inputSchema: s.object(
      "Identify the document to read.",
      {
        documentId: docxIdField,
        lang: s.integer("Language for @user mentions in the text: 0 = default name, 1 = English name.", {
          minimum: 0,
          maximum: 1,
        }),
      },
      { optional: ["lang"] },
    ),
    outputSchema: feishuDocumentContentSchema,
  }),
  defineProviderAction(service, {
    name: "list_document_blocks",
    operationType: "read",
    description:
      "List a Feishu docx document's structured blocks (one page), for reading document structure and rich content.",
    requiredScopes: [feishuProviderScopes.docxReadonly],
    providerPermissions: [feishuProviderScopes.docxReadonly],
    inputSchema: s.object(
      "Identify the document and page through its blocks.",
      {
        documentId: docxIdField,
        pageSize: s.positiveInteger("Number of blocks per page (max 500, default 500).", { maximum: 500 }),
        pageToken: s.string("The page token returned by a previous call; omit for the first page."),
        documentRevisionId: s.integer("Document revision to read; -1 (default) reads the latest version.", {
          minimum: -1,
        }),
        userIdType: s.stringEnum("The user id format for user fields in blocks.", ["open_id", "union_id", "user_id"]),
      },
      { optional: ["pageSize", "pageToken", "documentRevisionId", "userIdType"] },
    ),
    outputSchema: feishuPageSchema("A page of a Feishu docx document's structured blocks.", "A raw docx block object."),
  }),
  defineProviderAction(service, {
    name: "list_bitable_tables",
    operationType: "read",
    description: "List the data tables in a Feishu Bitable (多维表格) the authorized user can access.",
    requiredScopes: [feishuProviderScopes.bitableAppReadonly],
    providerPermissions: [feishuProviderScopes.bitableAppReadonly],
    inputSchema: s.object(
      "Identify the Bitable app and page through its tables.",
      {
        appToken: baseAppTokenField,
        pageSize: s.positiveInteger("Number of tables per page (max 100, default 20).", { maximum: 100 }),
        pageToken: s.string("The page token returned by a previous call; omit for the first page."),
      },
      { optional: ["pageSize", "pageToken"] },
    ),
    outputSchema: feishuPageSchema("A page of Bitable tables.", "A Bitable table {table_id, name, revision}."),
  }),
  defineProviderAction(service, {
    name: "list_bitable_fields",
    operationType: "read",
    description: "List the fields (columns) of a Feishu Bitable table, to understand its schema before reading rows.",
    requiredScopes: [feishuProviderScopes.bitableAppReadonly],
    providerPermissions: [feishuProviderScopes.bitableAppReadonly],
    inputSchema: s.object(
      "Identify the Bitable table and page through its fields.",
      {
        appToken: baseAppTokenField,
        tableId: baseTableIdField,
        viewId: s.string("Restrict fields to a specific view id (optional)."),
        pageSize: s.positiveInteger("Number of fields per page (max 100, default 20).", { maximum: 100 }),
        pageToken: s.string("The page token returned by a previous call; omit for the first page."),
      },
      { optional: ["viewId", "pageSize", "pageToken"] },
    ),
    outputSchema: feishuPageSchema(
      "A page of Bitable fields.",
      "A Bitable field {field_id, field_name, type, property, ui_type}.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_bitable_records",
    operationType: "read",
    description: "Read rows (records) from a Feishu Bitable table, with optional field selection, filter, and sort.",
    requiredScopes: [feishuProviderScopes.bitableAppReadonly],
    providerPermissions: [feishuProviderScopes.bitableAppReadonly],
    inputSchema: s.object(
      "Identify the Bitable table and query its records.",
      {
        appToken: baseAppTokenField,
        tableId: baseTableIdField,
        viewId: s.string("Query records visible in a specific view id (optional)."),
        fieldNames: s.array(
          "Restrict returned fields to these field names (optional, max 200).",
          s.string("A Bitable field name."),
          { maxItems: 200 },
        ),
        filter: s.looseObject("A Feishu Bitable filter condition group (optional)."),
        sort: s.array(
          "Sort conditions, each { field_name, desc } (optional, max 100).",
          s.looseObject("A sort condition."),
          {
            maxItems: 100,
          },
        ),
        pageSize: s.positiveInteger("Number of records per page (max 500, default 20).", { maximum: 500 }),
        pageToken: s.string("The page token returned by a previous call; omit for the first page."),
        userIdType: s.stringEnum("The user id format for user fields in records.", ["open_id", "union_id", "user_id"]),
      },
      { optional: ["viewId", "fieldNames", "filter", "sort", "pageSize", "pageToken", "userIdType"] },
    ),
    outputSchema: feishuPageSchema("A page of Bitable records.", "A Bitable record {record_id, fields}."),
  }),
  ...createFeishuContactActions({
    service,
    identity: "user",
  }),
  ...createFeishuImActions({
    service,
    identity: "user",
  }),
  ...createFeishuImUserActions(service),
  ...createFeishuImOrganizeActions(service),
  ...createFeishuBaseActions(service),
  ...createFeishuBaseAdvancedActions(service),
  ...createFeishuCalendarActions(service),
  ...createFeishuTaskActions(service),
  ...createFeishuWikiActions(service),
  ...createFeishuDocsActions(service),
  ...createFeishuDriveActions(service),
  ...createFeishuDriveAdvancedActions({
    service,
    identity: "user",
  }),
  ...createFeishuSlidesActions(service),
  ...createFeishuWhiteboardActions(service),
  ...createFeishuAttendanceActions(service),
  ...createFeishuSheetsActions(service),
  ...createFeishuSheetsAdvancedActions(service),
  ...createFeishuApprovalActions(service),
  ...createFeishuMailActions(service),
  ...createFeishuMailAdvancedActions(service),
  ...createFeishuMinutesActions(service),
  ...createFeishuNoteActions(service),
  ...createFeishuOkrActions(service),
  ...createFeishuFileActions(service),
  ...createFeishuVcActions({
    service,
    identity: "user",
  }),
  ...createFeishuApplicationActions(service),
  ...createFeishuMarkdownActions(service),
  ...createFeishuDomainMediaActions(service),
];
