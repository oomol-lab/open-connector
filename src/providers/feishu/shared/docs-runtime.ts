import type { FeishuJsonRequest } from "./client.ts";

import { optionalNumber, optionalRecord, optionalStringArray } from "../../../core/cast.ts";
import { providerInputError } from "../../provider-runtime.ts";

interface FeishuDocsActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

const docsExtraParam = '{"enable_user_cite_reference_map":true,"return_html5_block_data":true}';

export function createFeishuDocsActionHandlers(request: FeishuJsonRequest): Record<string, FeishuDocsActionHandler> {
  return {
    create_document(input) {
      return createDocument(input, request);
    },
    fetch_document(input) {
      return fetchDocument(input, request);
    },
    update_document(input) {
      return updateDocument(input, request);
    },
    search_documents(input) {
      return searchDocuments(input, request);
    },
    list_document_history(input) {
      return listDocumentHistory(input, request);
    },
    revert_document(input) {
      return revertDocument(input, request);
    },
    get_document_revert_status(input) {
      return getDocumentRevertStatus(input, request);
    },
  };
}

async function createDocument(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const format = optionalString(input.format) ?? "xml";
  const content = requireString(input.content, "content");
  const title = optionalString(input.title);
  const parentToken = optionalString(input.parentToken);
  const parentPosition = optionalString(input.parentPosition);
  if (parentToken && parentPosition) {
    throw providerInputError("parentToken and parentPosition cannot be used together");
  }

  const data = await request({
    method: "POST",
    path: "/docs_ai/v1/documents",
    body: {
      format,
      content: title ? `${createTitle(format, title)}\n${content}` : content,
      parent_token: parentToken,
      parent_position: parentPosition,
      reference_map: optionalRecord(input.referenceMap),
    },
  });
  return { document: optionalRecord(data.document) ?? data };
}

async function fetchDocument(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const documentId = requireString(input.documentId, "documentId");
  const format = optionalString(input.format) ?? "xml";
  const detail = optionalString(input.detail) ?? "simple";
  const scope = optionalString(input.scope) ?? "full";
  validateFetchSelection(input, scope);

  const exportOption =
    format !== "xml" || detail === "simple"
      ? {
          export_block_id: false,
          export_style_attrs: false,
          export_cite_extra_data: false,
        }
      : detail === "with_ids"
        ? { export_block_id: true }
        : {
            export_block_id: true,
            export_style_attrs: true,
            export_cite_extra_data: true,
          };
  const readOption =
    scope === "full"
      ? undefined
      : {
          read_mode: scope,
          start_block_id: optionalString(input.startBlockId),
          end_block_id: optionalString(input.endBlockId),
          keyword: optionalString(input.keyword),
          context_before: optionalIntegerString(input.contextBefore),
          context_after: optionalIntegerString(input.contextAfter),
          max_depth: optionalIntegerString(input.maxDepth),
        };
  const data = await request({
    method: "POST",
    path: `/docs_ai/v1/documents/${encodeURIComponent(documentId)}/fetch`,
    body: {
      format,
      extra_param: docsExtraParam,
      revision_id: optionalNumber(input.revisionId),
      lang: optionalString(input.lang),
      export_option: exportOption,
      read_option: readOption,
    },
  });
  return { document: optionalRecord(data.document) ?? data };
}

async function updateDocument(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const documentId = requireString(input.documentId, "documentId");
  const command = requireString(input.command, "command");
  const content = optionalString(input.content);
  const pattern = optionalString(input.pattern);
  const blockId = optionalString(input.blockId);
  const sourceBlockIds = optionalStringArray(input.sourceBlockIds);
  validateUpdateInput({ command, content, pattern, blockId, sourceBlockIds });

  const apiCommand = {
    replace_text: "str_replace",
    delete_blocks: "block_delete",
    insert_after: "block_insert_after",
    copy_after: "block_copy_insert_after",
    replace_block: "block_replace",
    move_after: "block_move_after",
    overwrite: "overwrite",
    append: "block_insert_after",
  }[command];
  const data = await request({
    method: "PUT",
    path: `/docs_ai/v1/documents/${encodeURIComponent(documentId)}`,
    body: {
      format: optionalString(input.format) ?? "xml",
      command: apiCommand,
      content,
      pattern,
      block_id: command === "append" ? "-1" : blockId,
      src_block_ids: sourceBlockIds?.join(","),
      revision_id: optionalNumber(input.revisionId),
      reference_map: optionalRecord(input.referenceMap),
    },
  });
  return { document: optionalRecord(data.document) ?? data };
}

async function searchDocuments(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    method: "POST",
    path: "/search/v2/doc_wiki/search",
    body: {
      query: optionalString(input.query) ?? "",
      doc_filter: optionalRecord(input.docFilter) ?? {},
      wiki_filter: optionalRecord(input.wikiFilter) ?? {},
      page_size: optionalNumber(input.pageSize) ?? 15,
      page_token: optionalString(input.pageToken),
    },
  });
  return {
    results: Array.isArray(data.res_units) ? data.res_units : [],
    total: typeof data.total === "number" ? data.total : undefined,
    hasMore: data.has_more === true,
    pageToken: optionalString(data.page_token),
    notice: optionalString(data.notice),
  };
}

async function listDocumentHistory(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const documentId = requireString(input.documentId, "documentId");
  const data = await request({
    path: `/docs_ai/v1/documents/${encodeURIComponent(documentId)}/histories`,
    query: {
      page_size: optionalNumber(input.pageSize) ?? 20,
      page_token: optionalString(input.pageToken),
    },
  });
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    hasMore: data.has_more === true,
    pageToken: optionalString(data.page_token),
  };
}

async function revertDocument(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const documentId = requireString(input.documentId, "documentId");
  const data = await request({
    method: "POST",
    path: `/docs_ai/v1/documents/${encodeURIComponent(documentId)}/history/revert`,
    body: {
      history_version_id: requireString(input.historyVersionId, "historyVersionId"),
      wait_timeout_ms: optionalNumber(input.waitTimeoutMs) ?? 30_000,
    },
  });
  return normalizeTask(data);
}

async function getDocumentRevertStatus(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const documentId = requireString(input.documentId, "documentId");
  const data = await request({
    path: `/docs_ai/v1/documents/${encodeURIComponent(documentId)}/history/revert_status`,
    query: {
      task_id: requireString(input.taskId, "taskId"),
    },
  });
  return normalizeTask(data);
}

function normalizeTask(data: Record<string, unknown>) {
  return {
    taskId: optionalString(data.task_id),
    status: optionalString(data.status),
    historyVersionId: optionalString(data.history_version_id),
    pollAfterMs: optionalNumber(data.poll_after_ms),
    failedBlockTokens: optionalStringArray(data.failed_block_tokens),
  };
}

function createTitle(format: string, title: string) {
  if (format === "markdown") {
    return `# ${title}`;
  } else {
    return `<title>${escapeXml(title)}</title>`;
  }
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function validateFetchSelection(input: Record<string, unknown>, scope: string) {
  if (scope === "keyword" && !optionalString(input.keyword)) {
    throw providerInputError("keyword is required when scope is keyword");
  } else if (scope === "section" && !optionalString(input.startBlockId)) {
    throw providerInputError("startBlockId is required when scope is section");
  } else if (scope === "range" && !optionalString(input.startBlockId) && !optionalString(input.endBlockId)) {
    throw providerInputError("startBlockId or endBlockId is required when scope is range");
  }
}

interface UpdateInput {
  readonly command: string;
  readonly content: string | undefined;
  readonly pattern: string | undefined;
  readonly blockId: string | undefined;
  readonly sourceBlockIds: string[] | undefined;
}

function validateUpdateInput(input: UpdateInput) {
  if (input.command === "replace_text" && !input.pattern) {
    throw providerInputError("pattern is required for replace_text");
  } else if (input.command === "delete_blocks" && !input.blockId) {
    throw providerInputError("blockId is required for delete_blocks");
  } else if (
    (input.command === "insert_after" || input.command === "replace_block") &&
    (!input.blockId || !input.content)
  ) {
    throw providerInputError(`blockId and content are required for ${input.command}`);
  } else if (
    (input.command === "copy_after" || input.command === "move_after") &&
    (!input.blockId || !input.sourceBlockIds?.length)
  ) {
    throw providerInputError(`blockId and sourceBlockIds are required for ${input.command}`);
  } else if ((input.command === "overwrite" || input.command === "append") && !input.content) {
    throw providerInputError(`content is required for ${input.command}`);
  }
}

function requireString(value: unknown, fieldName: string) {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw providerInputError(`${fieldName} is required`);
  }
  return stringValue;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalIntegerString(value: unknown) {
  const number = optionalNumber(value);
  return number == null ? undefined : String(number);
}
