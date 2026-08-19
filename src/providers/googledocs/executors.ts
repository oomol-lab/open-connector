import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { integer, objectArray } from "../../core/cast.ts";
import {
  googleJsonRequest as googleJsonRequestShared,
  googleRequest as googleRequestShared,
} from "../google-runtime.ts";
import {
  asObject,
  asOptionalObject,
  asStringArray,
  compactObject,
  optionalBoolean,
} from "../googledrive/runtime-shared.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireOAuthCredential,
} from "../provider-runtime.ts";

const docsApiBaseUrl = "https://docs.googleapis.com/v1";
const driveApiBaseUrl = "https://www.googleapis.com/drive/v3";
const googleApiBaseUrl = "https://www.googleapis.com";
const sheetsApiBaseUrl = "https://sheets.googleapis.com/v4";

type ActionContext = {
  accessToken: string;
  fetcher: typeof fetch;
};

type ActionHandler = (input: Record<string, unknown>, context: ActionContext) => Promise<unknown>;

const docsProxy = defineProviderProxy({
  service: "googledocs",
  baseUrl: docsApiBaseUrl,
  auth: { type: "oauth_bearer" },
});

const driveProxy = defineProviderProxy({
  service: "googledocs",
  baseUrl: driveApiBaseUrl,
  auth: { type: "oauth_bearer" },
});

const googleApiProxy = defineProviderProxy({
  service: "googledocs",
  baseUrl: googleApiBaseUrl,
  auth: { type: "oauth_bearer" },
});

const sheetsProxy = defineProviderProxy({
  service: "googledocs",
  baseUrl: sheetsApiBaseUrl,
  auth: { type: "oauth_bearer" },
});

type GoogleDocument = Record<string, unknown> & {
  documentId?: string;
  title?: string;
  revisionId?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  footers?: Record<string, unknown>;
  footnotes?: Record<string, unknown>;
  tabs?: Array<Record<string, unknown>>;
  documentStyle?: Record<string, unknown>;
  namedRanges?: Record<string, unknown>;
  inlineObjects?: Record<string, unknown>;
  lists?: Record<string, unknown>;
};

type BatchUpdateResponse = {
  replies?: Array<Record<string, unknown>>;
  writeControl?: Record<string, unknown>;
};

export const googledocsActionHandlers: ProviderActionHandlers<"googledocs", ActionHandler> = {
  copy_document(input, { accessToken, fetcher }) {
    return copyDocument(input, accessToken, fetcher);
  },
  create_document(input, { accessToken, fetcher }) {
    return createDocument(input, accessToken, fetcher);
  },
  create_document2(input, { accessToken, fetcher }) {
    return createBlankDocument(input, accessToken, fetcher);
  },
  create_footer(input, { accessToken, fetcher }) {
    return createFooter(input, accessToken, fetcher);
  },
  create_footnote(input, { accessToken, fetcher }) {
    return createFootnote(input, accessToken, fetcher);
  },
  create_header(input, { accessToken, fetcher }) {
    return createHeader(input, accessToken, fetcher);
  },
  create_named_range(input, { accessToken, fetcher }) {
    return createNamedRange(input, accessToken, fetcher);
  },
  create_paragraph_bullets(input, { accessToken, fetcher }) {
    return runSingleBatchRequest(
      extractDocumentId(String(input.document_id)),
      { createParagraphBullets: asObject(input.createParagraphBullets) },
      accessToken,
      fetcher,
    );
  },
  delete_content_range(input, { accessToken, fetcher }) {
    return runSingleBatchRequest(
      extractDocumentId(String(input.document_id)),
      { deleteContentRange: { range: asObject(input.range) } },
      accessToken,
      fetcher,
    );
  },
  delete_footer(input, { accessToken, fetcher }) {
    return runSingleBatchRequest(
      extractDocumentId(String(input.document_id)),
      compactObject({
        deleteFooter: compactObject({
          footerId: String(input.footer_id),
          tabId: optionalString(input.tab_id),
        }),
      }),
      accessToken,
      fetcher,
      { footerId: String(input.footer_id) },
    );
  },
  delete_header(input, { accessToken, fetcher }) {
    return runSingleBatchRequest(
      extractDocumentId(String(input.document_id)),
      compactObject({
        deleteHeader: compactObject({
          headerId: String(input.header_id),
          tabId: optionalString(input.tab_id),
        }),
      }),
      accessToken,
      fetcher,
      { headerId: String(input.header_id) },
    );
  },
  delete_named_range(input, { accessToken, fetcher }) {
    return runSingleBatchRequest(
      extractDocumentId(String(input.document_id)),
      { deleteNamedRange: asObject(input.deleteNamedRange) },
      accessToken,
      fetcher,
    );
  },
  delete_paragraph_bullets(input, { accessToken, fetcher }) {
    return runSingleBatchRequest(
      extractDocumentId(String(input.document_id)),
      compactObject({
        deleteParagraphBullets: compactObject({
          range: asObject(input.range),
          tabId: optionalString(input.tab_id),
        }),
      }),
      accessToken,
      fetcher,
    );
  },
  delete_table_column(input, { accessToken, fetcher }) {
    return runBatchRequest(
      extractDocumentId(String(input.document_id)),
      asObjectArray(input.requests),
      undefined,
      accessToken,
      fetcher,
    );
  },
  delete_table_row(input, { accessToken, fetcher }) {
    return runSingleBatchRequest(
      extractDocumentId(String(input.documentId)),
      { deleteTableRow: { tableCellLocation: asObject(input.tableCellLocation) } },
      accessToken,
      fetcher,
    );
  },
  export_document_as_pdf(input, { accessToken, fetcher }) {
    return exportDocumentAsPdf(input, accessToken, fetcher);
  },
  get_document_by_id(input, { accessToken, fetcher }) {
    return getDocumentById(input, accessToken, fetcher);
  },
  get_document_plaintext(input, { accessToken, fetcher }) {
    return getDocumentPlaintext(input, accessToken, fetcher);
  },
  insert_inline_image(input, { accessToken, fetcher }) {
    return insertInlineImage(input, accessToken, fetcher);
  },
  insert_page_break(input, { accessToken, fetcher }) {
    return runSingleBatchRequest(
      extractDocumentId(String(input.documentId)),
      { insertPageBreak: asObject(input.insertPageBreak) },
      accessToken,
      fetcher,
    );
  },
  insert_table_action(input, { accessToken, fetcher }) {
    return insertTable(input, accessToken, fetcher);
  },
  insert_table_column(input, { accessToken, fetcher }) {
    return runBatchRequest(
      extractDocumentId(String(input.document_id)),
      asObjectArray(input.requests),
      undefined,
      accessToken,
      fetcher,
    );
  },
  insert_text_action(input, { accessToken, fetcher }) {
    return insertText(input, accessToken, fetcher);
  },
  list_spreadsheet_charts(input, { accessToken, fetcher }) {
    return listSpreadsheetCharts(input, accessToken, fetcher);
  },
  replace_all_text(input, { accessToken, fetcher }) {
    return replaceAllText(input, accessToken, fetcher);
  },
  replace_image(input, { accessToken, fetcher }) {
    return runSingleBatchRequest(
      extractDocumentId(String(input.document_id)),
      { replaceImage: asObject(input.replace_image) },
      accessToken,
      fetcher,
    );
  },
  search_documents(input, { accessToken, fetcher }) {
    return searchDocuments(input, accessToken, fetcher);
  },
  unmerge_table_cells(input, { accessToken, fetcher }) {
    return runSingleBatchRequest(
      extractDocumentId(String(input.documentId)),
      { unmergeTableCells: { tableRange: asObject(input.tableRange) } },
      accessToken,
      fetcher,
    );
  },
  update_document_batch(input, { accessToken, fetcher }) {
    return runBatchRequest(
      extractDocumentId(String(input.document_id)),
      asObjectArray(input.requests),
      asOptionalObject(input.write_control),
      accessToken,
      fetcher,
    );
  },
  update_document_style(input, { accessToken, fetcher }) {
    return updateDocumentStyle(input, accessToken, fetcher);
  },
  update_existing_document(input, { accessToken, fetcher }) {
    return runBatchRequest(
      extractDocumentId(String(input.document_id)),
      asObjectArray(input.editDocs),
      undefined,
      accessToken,
      fetcher,
    );
  },
  update_table_row_style(input, { accessToken, fetcher }) {
    return runSingleBatchRequest(
      extractDocumentId(String(input.documentId)),
      { updateTableRowStyle: asObject(input.updateTableRowStyle) },
      accessToken,
      fetcher,
    );
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ActionContext>({
  service: "googledocs",
  handlers: googledocsActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ActionContext> {
    const credential = await requireOAuthCredential(context, "googledocs");
    return {
      accessToken: credential.accessToken,
      fetcher,
    };
  },
});

export const proxy: ProviderProxyExecutor = (input, context) => {
  const path = typeof input.endpoint === "string" ? input.endpoint.split(/[?#]/u)[0] : "";
  if (path === "/documents" || path.startsWith("/documents/")) {
    return docsProxy(input, context);
  }
  if (path === "/files" || path.startsWith("/files/")) {
    return driveProxy(input, context);
  }
  if (
    path === "/drive/v3" ||
    path.startsWith("/drive/v3/") ||
    path === "/upload/drive/v3" ||
    path.startsWith("/upload/drive/v3/")
  ) {
    return googleApiProxy(input, context);
  }
  if (path === "/spreadsheets" || path.startsWith("/spreadsheets/")) {
    return sheetsProxy(input, context);
  }
  return Promise.resolve({
    ok: false,
    error: {
      code: "invalid_input",
      message: "endpoint is not supported for this provider",
      details: { status: 400 },
    },
  });
};

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const profile = await googleJsonRequest<{
      email?: string;
      name?: string;
      sub?: string;
    }>("https://www.googleapis.com/oauth2/v3/userinfo", {
      accessToken: input.accessToken,
      fetcher,
    });
    return {
      profile: {
        accountId: profile.email ?? profile.sub ?? "googledocs:oauth2",
        displayName: profile.name ?? profile.email ?? "Google Docs User",
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

async function copyDocument(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const fileId = extractDocumentId(String(input.document_id));
  const payload = await googleJsonRequest<Record<string, unknown>>(`${driveApiBaseUrl}/files/${fileId}/copy`, {
    accessToken,
    fetcher,
    method: "POST",
    query: {
      supportsAllDrives: String(optionalBoolean(input.include_shared_drives) ?? true),
      fields: driveFileFields,
    },
    body: compactObject({
      name: optionalString(input.title),
    }),
  });

  return normalizeDriveFile(payload);
}

async function createDocument(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const document = await createDocumentResource(String(input.title), accessToken, fetcher);
  const text = optionalString(input.text) ?? "";
  if (!text) {
    return {
      ...normalizeDocumentSummary(document),
      insertedTextLength: 0,
    };
  }

  await runSingleBatchRequest(
    normalizeDocumentSummary(document).documentId,
    {
      insertText: {
        text,
        endOfSegmentLocation: { segmentId: "" },
      },
    },
    accessToken,
    fetcher,
  );

  return {
    ...normalizeDocumentSummary(document),
    insertedTextLength: text.length,
  };
}

async function createBlankDocument(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const document = await createDocumentResource(String(input.title), accessToken, fetcher);
  return normalizeDocumentSummary(document);
}

async function createFooter(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const documentId = extractDocumentId(String(input.document_id));
  const output = await runSingleBatchRequest(
    documentId,
    {
      createFooter: compactObject({
        type: String(input.type),
        sectionBreakLocation: asOptionalObject(input.section_break_location),
      }),
    },
    accessToken,
    fetcher,
  );

  return {
    ...output,
    footerId: optionalNestedString(output.replies[0], ["createFooter", "footerId"]),
  };
}

async function createFootnote(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const documentId = extractDocumentId(String(input.documentId));
  const output = await runSingleBatchRequest(
    documentId,
    {
      createFootnote: compactObject({
        location: asOptionalObject(input.location),
        endOfSegmentLocation: asOptionalObject(input.endOfSegmentLocation),
      }),
    },
    accessToken,
    fetcher,
  );

  return {
    ...output,
    footnoteId: optionalNestedString(output.replies[0], ["createFootnote", "footnoteId"]),
  };
}

async function createHeader(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const documentId = extractDocumentId(String(input.documentId));
  const createOutput = await runSingleBatchRequest(
    documentId,
    {
      createHeader: compactObject({
        type: optionalString(input.type),
        sectionBreakLocation: asOptionalObject(input.sectionBreakLocation),
      }),
    },
    accessToken,
    fetcher,
  );

  const headerId = optionalNestedString(createOutput.replies[0], ["createHeader", "headerId"]);
  const text = optionalString(input.text) ?? "";
  if (!headerId || !text) {
    return {
      ...createOutput,
      headerId,
    };
  }

  const textOutput = await runSingleBatchRequest(
    documentId,
    {
      insertText: {
        text,
        endOfSegmentLocation: {
          segmentId: headerId,
        },
      },
    },
    accessToken,
    fetcher,
  );

  return {
    documentId,
    headerId,
    insertedTextLength: text.length,
    replies: [...createOutput.replies, ...textOutput.replies],
    ...(textOutput.writeControl ? { writeControl: textOutput.writeControl } : {}),
  };
}

async function createNamedRange(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const documentId = extractDocumentId(String(input.documentId));
  const output = await runSingleBatchRequest(
    documentId,
    {
      createNamedRange: {
        name: String(input.name),
        range: compactObject({
          startIndex: asInteger(input.rangeStartIndex),
          endIndex: asInteger(input.rangeEndIndex),
          segmentId: optionalString(input.rangeSegmentId),
        }),
      },
    },
    accessToken,
    fetcher,
  );

  return {
    ...output,
    name: String(input.name),
    namedRangeId: optionalNestedString(output.replies[0], ["createNamedRange", "namedRangeId"]),
  };
}

async function exportDocumentAsPdf(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const fileId = extractFileId(String(input.file_id));
  const response = await googleRequestShared(`${driveApiBaseUrl}/files/${fileId}/export`, {
    accessToken,
    fetcher,
    query: {
      mimeType: "application/pdf",
    },
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    fileId,
    filename: normalizePdfFilename(optionalString(input.filename), fileId),
    mimeType: "application/pdf",
    dataBase64: Buffer.from(bytes).toString("base64"),
    sizeBytes: bytes.byteLength,
  };
}

async function getDocumentById(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const documentId = extractDocumentId(String(input.id));
  const document = await fetchDocument(
    documentId,
    optionalBoolean(input.include_tabs_content) === true,
    accessToken,
    fetcher,
  );
  return normalizeDocument(document);
}

async function getDocumentPlaintext(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const rawDocumentId = optionalString(input.document_id);
  if (!rawDocumentId) {
    throw new ProviderRequestError(400, "document_id is required");
  }
  const documentId = extractDocumentId(rawDocumentId);
  const document = await fetchDocument(
    documentId,
    optionalBoolean(input.include_tabs_content) === true,
    accessToken,
    fetcher,
  );
  const options: RenderOptions = {
    includeTables: optionalBoolean(input.include_tables) ?? true,
    includeHeaders: optionalBoolean(input.include_headers) ?? false,
    includeFooters: optionalBoolean(input.include_footers) ?? false,
    includeFootnotes: optionalBoolean(input.include_footnotes) ?? false,
    includeTabsContent: optionalBoolean(input.include_tabs_content) ?? false,
    tableCellDelimiter: optionalString(input.table_cell_delimiter) ?? "\t",
    tableRowDelimiter: optionalString(input.table_row_delimiter) ?? "\n",
  };
  return {
    documentId,
    title: optionalString(document.title) ?? null,
    text: renderDocumentPlainText(document, options),
  };
}

async function insertInlineImage(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const documentId = extractDocumentId(String(input.documentId));
  const output = await runSingleBatchRequest(
    documentId,
    {
      insertInlineImage: compactObject({
        uri: String(input.uri),
        location: asObject(input.location),
        objectSize: asOptionalObject(input.objectSize),
      }),
    },
    accessToken,
    fetcher,
  );

  return {
    ...output,
    inlineObjectId: optionalNestedString(output.replies[0], ["insertInlineImage", "objectId"]) ?? null,
  };
}

async function insertTable(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const documentId = extractDocumentId(String(input.documentId));
  const index = asOptionalIntegerValue(input.index);
  const segmentId = optionalString(input.segmentId);
  const tabId = optionalString(input.tabId);
  const insertTable = compactObject({
    rows: asInteger(input.rows),
    columns: asInteger(input.columns),
    location:
      index != null
        ? compactObject({
            index,
            segmentId,
            tabId,
          })
        : undefined,
    endOfSegmentLocation:
      index == null
        ? compactObject({
            segmentId,
            tabId,
          })
        : undefined,
  });

  return runSingleBatchRequest(documentId, { insertTable }, accessToken, fetcher);
}

async function insertText(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const documentId = extractDocumentId(String(input.document_id));
  const text = String(input.text_to_insert ?? "");
  const index = asOptionalIntegerValue(input.insertion_index);
  const segmentId = optionalString(input.segment_id);
  const mode = optionalBoolean(input.append_to_end) === true || index == null ? "append" : "index";
  const output = await runSingleBatchRequest(
    documentId,
    {
      insertText: compactObject({
        text,
        location:
          mode === "index"
            ? compactObject({
                index,
                segmentId,
              })
            : undefined,
        endOfSegmentLocation:
          mode === "append"
            ? compactObject({
                segmentId,
              })
            : undefined,
      }),
    },
    accessToken,
    fetcher,
  );

  return {
    ...output,
    insertedTextLength: text.length,
    mode,
  };
}

async function listSpreadsheetCharts(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const spreadsheetId = extractSpreadsheetId(String(input.spreadsheet_id));
  const payload = await googleJsonRequest<Record<string, unknown>>(
    `${sheetsApiBaseUrl}/spreadsheets/${spreadsheetId}`,
    {
      accessToken,
      fetcher,
      query: {
        fields: "spreadsheetId,properties(title),sheets(properties(sheetId,title),charts(chartId,spec,position))",
      },
    },
  );

  const sheets = Array.isArray(payload.sheets) ? payload.sheets : [];
  return {
    spreadsheetId,
    title: optionalNestedString(payload, ["properties", "title"]) ?? null,
    sheets: sheets.map((sheet) => ({
      sheetId: optionalNestedNumber(sheet as Record<string, unknown>, ["properties", "sheetId"]),
      title: optionalNestedString(sheet as Record<string, unknown>, ["properties", "title"]) ?? undefined,
      charts: asObjectArray((sheet as Record<string, unknown>).charts),
    })),
  };
}

async function replaceAllText(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const documentId = extractDocumentId(String(input.document_id));
  const request = {
    replaceAllText: compactObject({
      containsText: compactObject({
        text: String(input.find_text),
        matchCase: optionalBoolean(input.match_case) ?? false,
        searchByRegex: optionalBoolean(input.search_by_regex),
      }),
      replaceText: String(input.replace_text),
      tabsCriteria:
        Array.isArray(input.tab_ids) && input.tab_ids.length > 0 ? { tabIds: asStringArray(input.tab_ids) } : undefined,
    }),
  };
  const output = await runSingleBatchRequest(documentId, request, accessToken, fetcher);
  return {
    ...output,
    occurrencesChanged: optionalNestedNumber(output.replies[0], ["replaceAllText", "occurrencesChanged"]) ?? undefined,
  };
}

async function searchDocuments(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const queryParts = [
    "mimeType='application/vnd.google-apps.document'",
    (optionalBoolean(input.include_trashed) ?? false) ? undefined : "trashed=false",
    optionalBoolean(input.starred_only) ? "starred=true" : undefined,
    optionalBoolean(input.shared_with_me) ? "sharedWithMe=true" : undefined,
    optionalString(input.created_after) ? `createdTime > '${String(input.created_after)}'` : undefined,
    optionalString(input.modified_after) ? `modifiedTime > '${String(input.modified_after)}'` : undefined,
    optionalString(input.query) ? buildDriveSearchQuery(String(input.query)) : undefined,
  ].filter((value): value is string => Boolean(value));

  const payload = await googleJsonRequest<Record<string, unknown>>(`${driveApiBaseUrl}/files`, {
    accessToken,
    fetcher,
    query: compactObject({
      q: queryParts.join(" and "),
      orderBy: optionalString(input.order_by),
      pageToken: optionalString(input.page_token),
      pageSize: String(asOptionalIntegerValue(input.max_results) ?? 10),
      fields: `nextPageToken,files(${driveFileFields})`,
      includeItemsFromAllDrives: String(optionalBoolean(input.include_shared_drives) ?? true),
      supportsAllDrives: String(optionalBoolean(input.include_shared_drives) ?? true),
    }),
  });

  const files = Array.isArray(payload.files) ? payload.files : [];
  return {
    documents: files.map((file) => normalizeDriveFile(asObject(file))),
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function updateDocumentStyle(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const documentId = extractDocumentId(String(input.document_id));
  const documentStyle = asObject(input.document_style);
  const fields = optionalString(input.fields) ?? (Object.keys(documentStyle).join(",") || "*");
  const output = await runSingleBatchRequest(
    documentId,
    {
      updateDocumentStyle: compactObject({
        documentStyle,
        fields,
        tabId: optionalString(input.tab_id),
      }),
    },
    accessToken,
    fetcher,
  );

  return {
    ...output,
    fields,
  };
}

async function createDocumentResource(title: string, accessToken: string, fetcher: typeof fetch) {
  return googleJsonRequest<GoogleDocument>(`${docsApiBaseUrl}/documents`, {
    accessToken,
    fetcher,
    method: "POST",
    body: { title },
  });
}

async function fetchDocument(
  documentId: string,
  includeTabsContent: boolean,
  accessToken: string,
  fetcher: typeof fetch,
) {
  return googleJsonRequest<GoogleDocument>(`${docsApiBaseUrl}/documents/${documentId}`, {
    accessToken,
    fetcher,
    query: includeTabsContent ? { includeTabsContent: "true" } : undefined,
  });
}

async function runSingleBatchRequest(
  documentId: string,
  request: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
  extra?: Record<string, unknown>,
) {
  const output = await runBatchRequest(documentId, [request], undefined, accessToken, fetcher);
  return {
    ...output,
    ...extra,
  };
}

async function runBatchRequest(
  documentId: string,
  requests: Array<Record<string, unknown>>,
  writeControl: Record<string, unknown> | undefined,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const payload = await googleJsonRequest<BatchUpdateResponse>(
    `${docsApiBaseUrl}/documents/${documentId}:batchUpdate`,
    {
      accessToken,
      fetcher,
      method: "POST",
      body: compactObject({
        requests,
        writeControl,
      }),
    },
  );

  return {
    documentId,
    replies: Array.isArray(payload.replies) ? payload.replies : [],
    ...(payload.writeControl ? { writeControl: payload.writeControl } : {}),
  };
}

function normalizeDocument(document: GoogleDocument) {
  return {
    ...normalizeDocumentSummary(document),
    ...(document.body ? { body: document.body } : {}),
    ...(document.headers ? { headers: document.headers } : {}),
    ...(document.footers ? { footers: document.footers } : {}),
    ...(document.footnotes ? { footnotes: document.footnotes } : {}),
    ...(document.tabs ? { tabs: document.tabs } : {}),
    ...(document.documentStyle ? { documentStyle: document.documentStyle } : {}),
    ...(document.namedRanges ? { namedRanges: document.namedRanges } : {}),
    ...(document.inlineObjects ? { inlineObjects: document.inlineObjects } : {}),
    ...(document.lists ? { lists: document.lists } : {}),
  };
}

function normalizeDocumentSummary(document: GoogleDocument) {
  return {
    documentId: extractDocumentId(String(document.documentId ?? "")),
    title: String(document.title ?? ""),
    revisionId: optionalString(document.revisionId) ?? null,
  };
}

function normalizeDriveFile(payload: Record<string, unknown>) {
  return {
    id: String(payload.id ?? ""),
    name: String(payload.name ?? ""),
    mimeType: String(payload.mimeType ?? ""),
    webViewLink: optionalString(payload.webViewLink) ?? null,
    createdTime: optionalString(payload.createdTime) ?? null,
    modifiedTime: optionalString(payload.modifiedTime) ?? null,
    driveId: optionalString(payload.driveId) ?? null,
    ...(Array.isArray(payload.parents) ? { parents: asStringArray(payload.parents) } : {}),
    ...(Array.isArray(payload.owners)
      ? {
          owners: payload.owners.map((owner) => ({
            displayName: optionalNestedString(owner as Record<string, unknown>, ["displayName"]) ?? null,
            emailAddress: optionalNestedString(owner as Record<string, unknown>, ["emailAddress"]) ?? null,
            permissionId: optionalNestedString(owner as Record<string, unknown>, ["permissionId"]) ?? null,
            photoLink: optionalNestedString(owner as Record<string, unknown>, ["photoLink"]) ?? null,
          })),
        }
      : {}),
    ...(typeof payload.shared === "boolean" ? { shared: payload.shared } : {}),
    ...(typeof payload.starred === "boolean" ? { starred: payload.starred } : {}),
    ...(typeof payload.trashed === "boolean" ? { trashed: payload.trashed } : {}),
  };
}

type RenderOptions = {
  includeTables: boolean;
  includeHeaders: boolean;
  includeFooters: boolean;
  includeFootnotes: boolean;
  includeTabsContent: boolean;
  tableCellDelimiter: string;
  tableRowDelimiter: string;
};

function renderDocumentPlainText(document: GoogleDocument, options: RenderOptions) {
  const sections: string[] = [];

  const bodyText = options.includeTabsContent
    ? renderTabs(document.tabs, options) || renderStructuralElements(asContentArray(document.body), options)
    : renderStructuralElements(asContentArray(document.body), options);
  if (bodyText.trim()) {
    sections.push(bodyText.trimEnd());
  }

  if (options.includeHeaders && document.headers) {
    const headerText = renderNamedSegments(document.headers, options);
    if (headerText) {
      sections.push(`[Headers]\n${headerText}`);
    }
  }
  if (options.includeFooters && document.footers) {
    const footerText = renderNamedSegments(document.footers, options);
    if (footerText) {
      sections.push(`[Footers]\n${footerText}`);
    }
  }
  if (options.includeFootnotes && document.footnotes) {
    const footnoteText = renderFootnotes(document.footnotes, options);
    if (footnoteText) {
      sections.push(`[Footnotes]\n${footnoteText}`);
    }
  }

  return sections.join("\n\n").trim();
}

function renderTabs(tabs: Array<Record<string, unknown>> | undefined, options: RenderOptions) {
  if (!tabs || tabs.length === 0) {
    return "";
  }
  const rendered = tabs.flatMap((tab) => renderTabRecursive(tab, options)).filter((value) => value.trim().length > 0);
  return rendered.join("\n\n");
}

function renderTabRecursive(tab: Record<string, unknown>, options: RenderOptions): string[] {
  const outputs: string[] = [];
  const documentTab = asOptionalObject(tab.documentTab);
  const title = optionalNestedString(tab, ["tabProperties", "title"]);
  const bodyText = documentTab ? renderStructuralElements(asContentArray(documentTab.body), options).trim() : "";
  if (bodyText) {
    outputs.push(title ? `[Tab: ${title}]\n${bodyText}` : bodyText);
  }
  const childTabs = Array.isArray(tab.childTabs) ? (tab.childTabs as Array<Record<string, unknown>>) : [];
  for (const child of childTabs) {
    outputs.push(...renderTabRecursive(child, options));
  }
  return outputs;
}

function renderNamedSegments(segments: Record<string, unknown>, options: RenderOptions) {
  return Object.entries(segments)
    .map(([segmentId, segment]) => {
      const text = renderStructuralElements(asContentArray(segment), options).trim();
      return text ? `(${segmentId})\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function renderFootnotes(footnotes: Record<string, unknown>, options: RenderOptions) {
  return Object.entries(footnotes)
    .map(([footnoteId, footnote]) => {
      const text = renderStructuralElements(asContentArray(footnote), options).trim();
      return text ? `(${footnoteId})\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function renderStructuralElements(elements: Array<Record<string, unknown>>, options: RenderOptions): string {
  let output = "";
  for (const element of elements) {
    if (element.paragraph) {
      output += renderParagraph(asObject(element.paragraph));
      continue;
    }
    if (element.table && options.includeTables) {
      const tableText = renderTable(asObject(element.table), options);
      if (tableText) {
        output += tableText + "\n";
      }
      continue;
    }
    if (element.tableOfContents) {
      output += renderStructuralElements(asContentArray(asObject(element.tableOfContents)), options);
    }
  }
  return output;
}

function renderParagraph(paragraph: Record<string, unknown>) {
  const elements = Array.isArray(paragraph.elements) ? (paragraph.elements as Array<Record<string, unknown>>) : [];
  return elements
    .map((element) => {
      if (element.textRun) {
        return String(asObject(element.textRun).content ?? "");
      }
      if (element.autoText) {
        return String(asObject(element.autoText).content ?? "");
      }
      if (element.pageBreak) {
        return "\n";
      }
      if (element.columnBreak) {
        return "\n";
      }
      return "";
    })
    .join("");
}

function renderTable(table: Record<string, unknown>, options: RenderOptions) {
  const rows = Array.isArray(table.tableRows) ? (table.tableRows as Array<Record<string, unknown>>) : [];
  return rows
    .map((row) => {
      const cells = Array.isArray(row.tableCells) ? (row.tableCells as Array<Record<string, unknown>>) : [];
      return cells
        .map((cell) => renderStructuralElements(asContentArray(cell), options).trim())
        .join(options.tableCellDelimiter);
    })
    .join(options.tableRowDelimiter);
}

function asContentArray(container: unknown) {
  const object = asOptionalObject(container);
  if (!object) {
    return [] as Array<Record<string, unknown>>;
  }
  return Array.isArray(object.content) ? (object.content as Array<Record<string, unknown>>) : [];
}

async function googleJsonRequest<T>(
  url: string,
  input: {
    accessToken: string;
    fetcher: typeof fetch;
    method?: string;
    query?: Record<string, string | undefined>;
    body?: Record<string, unknown>;
  },
) {
  return googleJsonRequestShared<T>(url, {
    accessToken: input.accessToken,
    fetcher: input.fetcher,
    method: input.method,
    query: input.query,
    body: input.body,
  });
}

function optionalString(value: unknown) {
  if (value == null) {
    return undefined;
  }
  const string = String(value);
  return string.length === 0 ? undefined : string;
}

function optionalNestedString(value: Record<string, unknown> | undefined, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return optionalString(current);
}

function optionalNestedNumber(value: Record<string, unknown> | undefined, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "number" ? current : undefined;
}

function extractDocumentId(value: string) {
  const maybeId = extractIdFromGoogleUrl(value, /\/document\/d\/([^/?#]+)/);
  return maybeId ?? value;
}

function extractSpreadsheetId(value: string) {
  const maybeId = extractIdFromGoogleUrl(value, /\/spreadsheets\/d\/([^/?#]+)/);
  return maybeId ?? value;
}

function extractFileId(value: string) {
  const docsId = extractDocumentId(value);
  const spreadsheetId = extractSpreadsheetId(value);
  return docsId !== value ? docsId : spreadsheetId !== value ? spreadsheetId : value;
}

function extractIdFromGoogleUrl(value: string, pattern: RegExp) {
  try {
    const url = new URL(value);
    const match = url.toString().match(pattern);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function buildDriveSearchQuery(query: string) {
  if (/[=<>]/.test(query) || /\b(and|or|not)\b/i.test(query)) {
    return query;
  }
  const escaped = query.replace(/'/g, "\\'");
  return `fullText contains '${escaped}'`;
}

function normalizePdfFilename(filename: string | undefined, fileId: string) {
  if (!filename) {
    return `${fileId}.pdf`;
  }
  return filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
}

function asInteger(value: unknown): number {
  return integer(value, "integer input", (message) => new ProviderRequestError(400, message));
}

function asOptionalIntegerValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function asObjectArray(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "object array", (message) => new ProviderRequestError(400, message));
}

const driveFileFields = [
  "id",
  "name",
  "mimeType",
  "webViewLink",
  "createdTime",
  "modifiedTime",
  "driveId",
  "parents",
  "owners(displayName,emailAddress,permissionId,photoLink)",
  "shared",
  "starred",
  "trashed",
].join(",");
