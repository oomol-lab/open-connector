import type { FeishuJsonRequest } from "./client.ts";

import {
  optionalNumber,
  optionalRecord,
  optionalRawString,
  optionalStringArray,
  requiredString,
} from "../../../core/cast.ts";
import { providerInputError, ProviderRequestError, requiredResponseRecord } from "../../provider-runtime.ts";
import { readFeishuResponsePage } from "./response.ts";

interface FeishuDocsActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

const docsExtraParam = '{"enable_user_cite_reference_map":true,"return_html5_block_data":true}';

export function createFeishuDocsActionHandlers(request: FeishuJsonRequest): Record<string, FeishuDocsActionHandler> {
  return {
    create_document(input) {
      return createDocument(input, request);
    },
    async get_document_creation(input) {
      const taskId = requireString(input.taskId, "taskId");
      const data = await request({ path: `/docs_ai/v1/async_tasks/${encodeURIComponent(taskId)}` });
      return normalizeCreation(data, taskId);
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
      extra_param: '{"open_create_async":true}',
      content: title ? `${createTitle(format, title)}\n${content}` : content,
      parent_token: parentToken,
      parent_position: parentPosition,
      reference_map: optionalRecord(input.referenceMap),
    },
  });
  return normalizeCreation(data);
}

function normalizeCreation(data: Record<string, unknown>, expectedTaskId?: string) {
  if (data.task == null && !expectedTaskId) {
    return {
      taskId: null,
      status: "succeeded",
      document: requireCreatedDocument(data.document),
      pollAfterMs: null,
      failure: null,
    };
  }
  const task = requiredResponseRecord(data.task, "Feishu document creation task");
  const taskId = optionalRawString(task.task_id) || expectedTaskId;
  if (!taskId || (expectedTaskId && taskId !== expectedTaskId)) {
    throw new ProviderRequestError(502, "Feishu document creation task ID is missing or mismatched");
  }
  const status = optionalRawString(task.status)?.trim().toLowerCase() || "processing";
  if (!["processing", "succeeded", "failed", "expired"].includes(status)) {
    throw new ProviderRequestError(502, `Unsupported Feishu document creation status: ${status}`);
  }
  let document: Record<string, unknown> | null = null;
  if (status === "succeeded") {
    const result = optionalRecord(task.result);
    const serialized = optionalRawString(result?.create_document);
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized ?? "");
    } catch {
      throw new ProviderRequestError(502, "Invalid Feishu document creation result JSON");
    }
    document = requireCreatedDocument(optionalRecord(parsed)?.document);
  }
  return {
    taskId,
    status,
    document,
    pollAfterMs: optionalNumber(task.poll_after_ms) ?? null,
    failure: optionalRecord(task.failure) ?? null,
  };
}

function requireCreatedDocument(value: unknown) {
  const document = requiredResponseRecord(value, "Feishu created document");
  requiredString(
    document.document_id,
    "Feishu created document.document_id",
    (message) => new ProviderRequestError(502, message),
  );
  return document;
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
  const startBlockId = optionalRawString(input.startBlockId)?.trim() || undefined;
  const endBlockId = optionalRawString(input.endBlockId)?.trim() || undefined;
  const sourceBlockIds = optionalStringArray(input.sourceBlockIds);
  validateUpdateInput({
    command,
    content,
    pattern,
    blockId,
    startBlockId,
    endBlockId,
    sourceBlockIds,
  });
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
      start_block_id: startBlockId,
      end_block_id: endBlockId,
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
  const page = readFeishuResponsePage(data, "res_units");
  return {
    results: page.items,
    total: typeof data.total === "number" ? data.total : undefined,
    hasMore: page.hasMore,
    pageToken: page.pageToken,
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
  readonly startBlockId: string | undefined;
  readonly endBlockId: string | undefined;
  readonly sourceBlockIds: string[] | undefined;
}

function validateUpdateInput(input: UpdateInput) {
  const hasRange = input.startBlockId != null || input.endBlockId != null;
  const isBlockMutation = input.command === "replace_block" || input.command === "delete_blocks";
  if (hasRange) {
    if (!isBlockMutation) {
      throw providerInputError("startBlockId and endBlockId are only supported for replace_block or delete_blocks");
    }
    if (input.blockId) {
      throw providerInputError("blockId cannot be combined with startBlockId or endBlockId");
    }
    if (!input.startBlockId || !input.endBlockId) {
      throw providerInputError("startBlockId and endBlockId must be provided together");
    }
    if (input.startBlockId === "-1" || input.endBlockId === "0") {
      throw providerInputError("startBlockId cannot be -1 and endBlockId cannot be 0");
    }
  }
  if (isBlockMutation && !input.blockId && !hasRange) {
    throw providerInputError("blockId or both startBlockId and endBlockId are required");
  }
  if (input.command === "replace_text" && !input.pattern) {
    throw providerInputError("pattern is required for replace_text");
  } else if (input.command === "replace_block" && !input.content) {
    throw providerInputError("content is required for replace_block");
  } else if (input.command === "insert_after" && (!input.blockId || !input.content)) {
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
