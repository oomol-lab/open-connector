import type { CredentialValidationResult, TransitFileWriter } from "../../core/types.ts";
import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, readBoundedResponseBytes } from "../../core/request.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const wecomMcpConfigUrl = "https://qyapi.weixin.qq.com/cgi-bin/aibot/cli/get_mcp_config";
const wecomSmartBotHelpUrl = "https://open.work.weixin.qq.com/help2/pc/cat?doc_id=21677";
const wecomSmartBotRequestTimeoutMs = 30_000;
const wecomSmartBotMediaTimeoutMs = 120_000;
const wecomMcpConfigCacheTtlMs = 10 * 60_000;
const wecomMcpConfigCacheMaxEntries = 128;
const wecomExportPollIntervalMs = 500;
const wecomExportMaxPolls = 20;
const wecomAttachmentMaxBytes = 10 * 1024 * 1024;
const wecomMediaMaxBytes = 20 * 1024 * 1024;
const wecomSmartBotCategories = ["contact", "doc", "meeting", "msg", "schedule", "todo"];
const blockedDynamicTools = new Set(["get_msg_media", "upload_doc_file", "upload_doc_image"]);
const utf8Encoder = new TextEncoder();

interface WecomSmartBotCredential {
  botId: string;
  secret: string;
}

interface WecomMcpConfig {
  endpoints: Map<string, string>;
}

interface WecomMcpConfigCacheEntry {
  expiresAt: number;
  config: WecomMcpConfig;
}

export interface WecomSmartBotRuntime {
  credential: WecomSmartBotCredential;
  fetcher: typeof fetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

interface WecomToolCall {
  category: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

interface WecomMcpToolSummary {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const wecomMcpConfigCache = new Map<string, WecomMcpConfigCacheEntry>();

export async function validateWecomSmartBotCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const credential = requireWecomSmartBotCredential(values);
  const config = await fetchWecomMcpConfig(credential, fetcher);
  const accountHash = hashWecomSmartBotCredential(credential);
  cacheWecomMcpConfig(accountHash, config);

  return {
    profile: {
      accountId: `wecom_bot:smart:${accountHash.slice(0, 24)}`,
      displayName: `WeCom Smart Bot · ${maskIdentifier(credential.botId)}`,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      credentialKind: "api_mode_smart_bot",
      configuredCategories: [...config.endpoints.keys()].sort(),
      helpUrl: wecomSmartBotHelpUrl,
    },
  };
}

export function createWecomSmartBotRuntime(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  transitFiles?: TransitFileWriter,
): WecomSmartBotRuntime {
  return {
    credential: requireWecomSmartBotCredential(values),
    fetcher,
    signal,
    transitFiles,
  };
}

async function executeWecomSmartBotAction(
  actionName: string,
  actionInput: Record<string, unknown>,
  runtime: WecomSmartBotRuntime,
): Promise<unknown> {
  validateWecomSmartBotInput(actionName, actionInput);

  if (actionName === "list_tools") {
    return listWecomSmartBotTools(optionalString(actionInput.category), runtime);
  }
  if (actionName === "call_tool") {
    const toolName = String(actionInput.toolName);
    if (blockedDynamicTools.has(toolName)) {
      throw new ProviderRequestError(
        400,
        `${toolName} is not available through call_tool; use the curated wecom_bot action`,
      );
    }
    return callWecomTool(String(actionInput.category), toolName, optionalRecord(actionInput.arguments) ?? {}, runtime);
  }
  if (actionName === "download_message_media") {
    return downloadWecomMessageMedia(String(actionInput.mediaId), runtime);
  }
  if (actionName === "get_doc_content") {
    return pollWecomDocumentContent(actionInput, runtime);
  }
  if (actionName === "smartpage_export") {
    return pollWecomSmartPageExport(actionInput, runtime);
  }
  if (actionName === "smartsheet_add_records" || actionName === "smartsheet_update_records") {
    const toolCall = buildWecomToolCall(actionName, actionInput);
    toolCall.arguments.records = await prepareSmartSheetRecords(toolCall.arguments.records, runtime);
    return callWecomTool(toolCall.category, toolCall.toolName, toolCall.arguments, runtime);
  }

  const toolCall = buildWecomToolCall(actionName, actionInput);
  return callWecomTool(toolCall.category, toolCall.toolName, toolCall.arguments, runtime);
}

export const wecomSmartBotActionHandlers: ProviderActionHandlerSubset<
  "wecom_bot",
  ProviderRuntimeHandler<WecomSmartBotRuntime>
> = {
  list_tools: smartBotHandler("list_tools"),
  call_tool: smartBotHandler("call_tool"),
  get_userlist: smartBotHandler("get_userlist"),
  get_msg_chat_list: smartBotHandler("get_msg_chat_list"),
  get_message: smartBotHandler("get_message"),
  download_message_media: smartBotHandler("download_message_media"),
  send_message: smartBotHandler("send_message"),
  search_todo_userid: smartBotHandler("search_todo_userid"),
  create_todo: smartBotHandler("create_todo"),
  update_todo: smartBotHandler("update_todo"),
  change_todo_user_status: smartBotHandler("change_todo_user_status"),
  get_todo_list: smartBotHandler("get_todo_list"),
  get_todo_detail: smartBotHandler("get_todo_detail"),
  delete_todo: smartBotHandler("delete_todo"),
  create_meeting: smartBotHandler("create_meeting"),
  list_user_meetings: smartBotHandler("list_user_meetings"),
  get_meeting_info: smartBotHandler("get_meeting_info"),
  cancel_meeting: smartBotHandler("cancel_meeting"),
  set_invite_meeting_members: smartBotHandler("set_invite_meeting_members"),
  get_schedule_list_by_range: smartBotHandler("get_schedule_list_by_range"),
  get_schedule_detail: smartBotHandler("get_schedule_detail"),
  create_schedule: smartBotHandler("create_schedule"),
  update_schedule: smartBotHandler("update_schedule"),
  cancel_schedule: smartBotHandler("cancel_schedule"),
  add_schedule_attendees: smartBotHandler("add_schedule_attendees"),
  del_schedule_attendees: smartBotHandler("del_schedule_attendees"),
  check_availability: smartBotHandler("check_availability"),
  create_doc: smartBotHandler("create_doc"),
  get_doc_content: smartBotHandler("get_doc_content"),
  edit_doc_content: smartBotHandler("edit_doc_content"),
  sheet_get_info: smartBotHandler("sheet_get_info"),
  sheet_update_range_data: smartBotHandler("sheet_update_range_data"),
  sheet_append_data: smartBotHandler("sheet_append_data"),
  sheet_add_sub: smartBotHandler("sheet_add_sub"),
  sheet_delete_sub: smartBotHandler("sheet_delete_sub"),
  smartsheet_get_sheet: smartBotHandler("smartsheet_get_sheet"),
  smartsheet_add_sheet: smartBotHandler("smartsheet_add_sheet"),
  smartsheet_update_sheet: smartBotHandler("smartsheet_update_sheet"),
  smartsheet_delete_sheet: smartBotHandler("smartsheet_delete_sheet"),
  smartsheet_get_fields: smartBotHandler("smartsheet_get_fields"),
  smartsheet_add_fields: smartBotHandler("smartsheet_add_fields"),
  smartsheet_update_fields: smartBotHandler("smartsheet_update_fields"),
  smartsheet_delete_fields: smartBotHandler("smartsheet_delete_fields"),
  smartsheet_get_records: smartBotHandler("smartsheet_get_records"),
  smartsheet_add_records: smartBotHandler("smartsheet_add_records"),
  smartsheet_update_records: smartBotHandler("smartsheet_update_records"),
  smartsheet_delete_records: smartBotHandler("smartsheet_delete_records"),
  smartpage_create: smartBotHandler("smartpage_create"),
  smartpage_export: smartBotHandler("smartpage_export"),
};

function smartBotHandler(actionName: string): ProviderRuntimeHandler<WecomSmartBotRuntime> {
  return (input, runtime) => executeWecomSmartBotAction(actionName, input, runtime);
}

function validateWecomSmartBotInput(actionName: string, input: Record<string, unknown>): void {
  if (actionName === "send_message") {
    assertUtf8ByteLength(input.content, "content", 2048);
  } else if (actionName === "smartpage_create" && Array.isArray(input.pages)) {
    for (const [index, value] of input.pages.entries()) {
      const page = optionalRecord(value);
      if (page?.content !== undefined) {
        assertUtf8ByteLength(page.content, `pages[${index}].content`, 10 * 1024 * 1024);
      }
    }
  } else if (
    actionName === "create_todo" &&
    Array.isArray(input.reminderTypes) &&
    input.reminderTypes.some((reminderType) => reminderType !== 0) &&
    typeof input.endTime !== "string"
  ) {
    throw new ProviderRequestError(400, "endTime is required when reminderTypes contains an active reminder");
  }
}

function assertUtf8ByteLength(value: unknown, fieldName: string, maximumBytes: number): void {
  if (typeof value !== "string" || utf8Encoder.encode(value).byteLength > maximumBytes) {
    throw new ProviderRequestError(400, `${fieldName} must be at most ${maximumBytes} UTF-8 bytes`);
  }
}

function requireWecomSmartBotCredential(values: Record<string, string>) {
  const botId = values.botId?.trim();
  const secret = values.secret?.trim();
  if (!botId) {
    throw new ProviderRequestError(400, "botId is required");
  }
  if (!secret) {
    throw new ProviderRequestError(400, "secret is required");
  }
  return { botId, secret };
}

async function getWecomMcpConfig(runtime: WecomSmartBotRuntime, forceRefresh = false) {
  const key = hashWecomSmartBotCredential(runtime.credential);
  const cached = wecomMcpConfigCache.get(key);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  const config = await fetchWecomMcpConfig(runtime.credential, runtime.fetcher);
  cacheWecomMcpConfig(key, config);
  return config;
}

function cacheWecomMcpConfig(key: string, config: WecomMcpConfig) {
  if (wecomMcpConfigCache.size >= wecomMcpConfigCacheMaxEntries) {
    const oldestKey = wecomMcpConfigCache.keys().next().value;
    if (typeof oldestKey === "string") {
      wecomMcpConfigCache.delete(oldestKey);
    }
  }
  wecomMcpConfigCache.set(key, {
    expiresAt: Date.now() + wecomMcpConfigCacheTtlMs,
    config,
  });
}

async function fetchWecomMcpConfig(
  credential: WecomSmartBotCredential,
  fetcher: typeof fetch,
): Promise<WecomMcpConfig> {
  const time = Math.floor(Date.now() / 1000);
  const nonce = `mcp_${randomUUID()}`;
  const signature = createHash("sha256").update(`${credential.secret}${credential.botId}${time}${nonce}`).digest("hex");
  const response = await fetchWecomJson(
    wecomMcpConfigUrl,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bot_id: credential.botId,
        time,
        nonce,
        signature,
        bind_source: 1,
        cli_version: providerUserAgent,
      }),
    },
    fetcher,
    wecomSmartBotRequestTimeoutMs,
  );
  const payload = requireProviderObject(response.payload, "WeCom MCP config response");
  const errcode = readInteger(payload.errcode) ?? 0;
  if (!response.ok || errcode !== 0) {
    throw normalizeWecomSmartBotError(payload, response.status, "validate");
  }

  const endpoints = new Map<string, string>();
  const items = Array.isArray(payload.list) ? payload.list : [];
  for (const item of items) {
    const record = optionalRecord(item);
    const category = optionalString(record?.biz_type);
    const endpoint = optionalString(record?.url);
    if (!category || !endpoint || !wecomSmartBotCategories.includes(category)) {
      continue;
    }
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      continue;
    }
    if (url.protocol === "https:") {
      endpoints.set(category, url.toString());
    }
  }
  if (endpoints.size === 0) {
    throw new ProviderRequestError(409, "WeCom returned no MCP business categories for this bot");
  }
  return { endpoints };
}

async function listWecomSmartBotTools(requestedCategory: string | undefined, runtime: WecomSmartBotRuntime) {
  const config = await getWecomMcpConfig(runtime);
  const categories = requestedCategory ? [requestedCategory] : wecomSmartBotCategories;
  const result: Array<{ category: string; tools: WecomMcpToolSummary[] }> = [];
  for (const category of categories) {
    const endpoint = config.endpoints.get(category);
    if (!endpoint) {
      if (requestedCategory) {
        throw missingWecomCategoryError(category);
      }
      continue;
    }
    const payload = await sendWecomMcpRequest(endpoint, "tools/list", null, runtime.fetcher);
    const resultRecord = optionalRecord(payload.result);
    const tools = Array.isArray(resultRecord?.tools)
      ? resultRecord.tools.flatMap((item): WecomMcpToolSummary[] => {
          const record = optionalRecord(item);
          const name = optionalString(record?.name);
          if (!name) {
            return [];
          }
          return [
            {
              name,
              description: optionalString(record?.description) ?? "",
              inputSchema: optionalRecord(record?.inputSchema) ?? {},
            },
          ];
        })
      : [];
    result.push({ category, tools });
  }
  return { categories: result };
}

async function callWecomTool(
  category: string,
  toolName: string,
  argumentsValue: Record<string, unknown>,
  runtime: WecomSmartBotRuntime,
) {
  let config = await getWecomMcpConfig(runtime);
  let endpoint = config.endpoints.get(category);
  if (!endpoint) {
    throw missingWecomCategoryError(category);
  }

  try {
    return await callWecomToolAtEndpoint(endpoint, toolName, argumentsValue, runtime.fetcher);
  } catch (error) {
    if (!(error instanceof ProviderRequestError) || error.status !== 409) {
      throw error;
    }
    config = await getWecomMcpConfig(runtime, true);
    endpoint = config.endpoints.get(category);
    if (!endpoint) {
      throw missingWecomCategoryError(category);
    }
    return callWecomToolAtEndpoint(endpoint, toolName, argumentsValue, runtime.fetcher);
  }
}

async function callWecomToolAtEndpoint(
  endpoint: string,
  toolName: string,
  argumentsValue: Record<string, unknown>,
  fetcher: typeof fetch,
) {
  const payload = await sendWecomMcpRequest(
    endpoint,
    "tools/call",
    { name: toolName, arguments: argumentsValue },
    fetcher,
    toolName === "get_msg_media" ? wecomSmartBotMediaTimeoutMs : wecomSmartBotRequestTimeoutMs,
  );
  const result = requireProviderObject(payload.result, `WeCom ${toolName} MCP result`);
  if (result.isError === true) {
    throw new ProviderRequestError(502, readMcpContentMessage(result.content) ?? `WeCom ${toolName} failed`);
  }
  if (result.structuredContent !== undefined) {
    return normalizeWecomBusinessResult(result.structuredContent, toolName);
  }

  const content = Array.isArray(result.content) ? result.content : [];
  const textItem = content.find((item) => optionalRecord(item)?.type === "text");
  const text = optionalString(optionalRecord(textItem)?.text);
  if (!text) {
    throw new ProviderRequestError(502, `WeCom ${toolName} returned no JSON text content`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, `WeCom ${toolName} returned invalid JSON content`);
  }
  return normalizeWecomBusinessResult(parsed, toolName);
}

async function sendWecomMcpRequest(
  endpoint: string,
  method: string,
  params: unknown,
  fetcher: typeof fetch,
  timeoutMs = wecomSmartBotRequestTimeoutMs,
) {
  const response = await fetchWecomJson(
    endpoint,
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `mcp_rpc_${randomUUID()}`,
        method,
        params,
      }),
    },
    fetcher,
    timeoutMs,
  );
  if (!response.ok) {
    const payload = optionalRecord(response.payload) ?? {};
    const error = normalizeWecomSmartBotError(payload, response.status, "execute");
    if (response.status === 401 || response.status === 403) {
      throw new ProviderRequestError(409, error.message, error.details);
    }
    throw error;
  }
  const payload = requireProviderObject(response.payload, "WeCom MCP response");
  const rpcError = optionalRecord(payload.error);
  const code = readInteger(rpcError?.code);
  if (code != null && code !== 0) {
    const message = optionalString(rpcError?.message) ?? `WeCom MCP JSON-RPC error ${code}`;
    if (code === -32001) {
      throw new ProviderRequestError(403, message, rpcError);
    }
    throw new ProviderRequestError(502, message, rpcError);
  }
  return payload;
}

async function fetchWecomJson(url: string, init: RequestInit, fetcher: typeof fetch, timeoutMs: number) {
  const timeout = createProviderTimeout(undefined, timeoutMs);
  try {
    const headers = new Headers(init.headers);
    headers.set("user-agent", providerUserAgent);
    const response = await fetcher(url, { ...init, headers, signal: timeout.signal });
    const text = await response.text();
    let payload: unknown = {};
    if (text.trim()) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new ProviderRequestError(502, "WeCom returned invalid JSON");
      }
    }
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      timeout.didTimeout() ? 504 : 502,
      timeout.didTimeout()
        ? "WeCom smart bot request timed out"
        : error instanceof Error
          ? `WeCom smart bot request failed: ${error.message}`
          : "WeCom smart bot request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function normalizeWecomBusinessResult(value: unknown, toolName: string) {
  const result = requireProviderObject(value, `WeCom ${toolName} result`);
  const errcode = readInteger(result.errcode);
  if (errcode != null && errcode !== 0) {
    throw normalizeWecomSmartBotError(result, 200, "execute");
  }
  return result;
}

function normalizeWecomSmartBotError(payload: Record<string, unknown>, status: number, phase: "validate" | "execute") {
  const errcode = readInteger(payload.errcode);
  const message =
    optionalString(payload.help_message) ??
    optionalString(payload.errmsg) ??
    optionalString(payload.message) ??
    `WeCom smart bot request failed${errcode == null ? "" : ` (${errcode})`}`;
  if (status === 429 || errcode === 45009) {
    return new ProviderRequestError(429, message, payload);
  }
  if (errcode === 850002) {
    return new ProviderRequestError(403, message, payload);
  }
  if (errcode === 860046) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403 || errcode === 853000)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403 || errcode === 853000)) {
    return new ProviderRequestError(409, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function missingWecomCategoryError(category: string) {
  return new ProviderRequestError(409, `WeCom bot does not have the ${category} business category enabled`);
}

async function pollWecomDocumentContent(input: Record<string, unknown>, runtime: WecomSmartBotRuntime) {
  const identifier = buildDocumentIdentifier(input);
  let taskId: string | undefined;
  for (let pollCount = 1; pollCount <= wecomExportMaxPolls; pollCount++) {
    const result = await callWecomTool(
      "doc",
      "get_doc_content",
      compactObject({ ...identifier, type: 2, task_id: taskId }),
      runtime,
    );
    const record = requireProviderObject(result, "WeCom get_doc_content result");
    if (record.task_done === true) {
      const content = optionalString(record.content);
      if (content == null) {
        throw new ProviderRequestError(502, "WeCom document export returned no content");
      }
      return {
        errcode: 0,
        errmsg: optionalString(record.errmsg) ?? "ok",
        content,
        poll_count: pollCount,
      };
    }
    taskId = optionalString(record.task_id);
    if (!taskId) {
      throw new ProviderRequestError(502, "WeCom document export returned no task_id");
    }
    if (pollCount < wecomExportMaxPolls) {
      await delay(wecomExportPollIntervalMs);
    }
  }
  throw new ProviderRequestError(504, "WeCom document export did not finish in time");
}

async function pollWecomSmartPageExport(input: Record<string, unknown>, runtime: WecomSmartBotRuntime) {
  const task = await callWecomTool(
    "doc",
    "smartpage_export_task",
    { ...buildDocumentIdentifier(input), content_type: 1 },
    runtime,
  );
  const taskId = optionalString(requireProviderObject(task, "WeCom smart-page export task").task_id);
  if (!taskId) {
    throw new ProviderRequestError(502, "WeCom smart-page export returned no task_id");
  }

  for (let pollCount = 1; pollCount <= wecomExportMaxPolls; pollCount++) {
    const result = await callWecomTool("doc", "smartpage_get_export_result", { task_id: taskId }, runtime);
    const record = requireProviderObject(result, "WeCom smart-page export result");
    if (record.task_done === true) {
      const content = optionalString(record.content);
      if (content == null) {
        throw new ProviderRequestError(502, "WeCom smart-page export returned no content");
      }
      return {
        errcode: 0,
        errmsg: optionalString(record.errmsg) ?? "ok",
        content,
        poll_count: pollCount,
      };
    }
    if (pollCount < wecomExportMaxPolls) {
      await delay(wecomExportPollIntervalMs);
    }
  }
  throw new ProviderRequestError(504, "WeCom smart-page export did not finish in time");
}

async function downloadWecomMessageMedia(mediaId: string, runtime: WecomSmartBotRuntime) {
  if (!runtime.transitFiles) {
    throw new ProviderRequestError(503, "Local transit file storage is not enabled");
  }
  const result = await callWecomTool("msg", "get_msg_media", { media_id: mediaId }, runtime);
  const mediaItem = requireProviderObject(
    requireProviderObject(result, "WeCom get_msg_media result").media_item,
    "WeCom message media item",
  );
  const base64 = optionalString(mediaItem.base64_data);
  if (!base64) {
    throw new ProviderRequestError(502, "WeCom message media returned no base64_data");
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > wecomMediaMaxBytes) {
    throw new ProviderRequestError(502, `WeCom message media must be between 1 and ${wecomMediaMaxBytes} bytes`);
  }
  const mediaName = optionalString(mediaItem.name) ?? `${mediaId}.bin`;
  const mediaType = optionalString(mediaItem.type) ?? "file";
  const contentType = inferMediaContentType(mediaName, mediaType);
  if (bytes.byteLength > runtime.transitFiles.maxBytes) {
    throw new ProviderRequestError(413, `WeCom message media exceeds the local transit file limit`);
  }
  const name = sanitizeFileName(mediaName);
  const upload = await runtime.transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: contentType }));
  return {
    errcode: 0,
    errmsg: "ok",
    file: {
      fileId: upload.fileId,
      downloadUrl: upload.downloadUrl,
      sizeBytes: upload.sizeBytes,
      name: upload.name,
      mimeType: upload.mimeType,
      mediaId,
      mediaType,
    },
  };
}

async function prepareSmartSheetRecords(value: unknown, runtime: WecomSmartBotRuntime) {
  if (!Array.isArray(value)) {
    return value;
  }
  const uploadedFiles = new Map<string, string>();
  const records: unknown[] = [];
  for (const recordValue of value) {
    const record = optionalRecord(recordValue);
    const values = optionalRecord(record?.values);
    if (!record || !values) {
      records.push(recordValue);
      continue;
    }
    const transformedValues: Record<string, unknown> = {};
    for (const [field, cell] of Object.entries(values)) {
      transformedValues[field] = await prepareSmartSheetCell(cell, runtime, uploadedFiles);
    }
    records.push({ ...record, values: transformedValues });
  }
  return records;
}

async function prepareSmartSheetCell(
  value: unknown,
  runtime: WecomSmartBotRuntime,
  uploadedFiles: Map<string, string>,
) {
  if (!Array.isArray(value)) {
    return value;
  }
  const result: unknown[] = [];
  for (const itemValue of value) {
    const item = optionalRecord(itemValue);
    if (!item) {
      result.push(itemValue);
      continue;
    }
    const fileUrl = optionalString(item.fileUrl);
    const imageUrl = optionalString(item.imageUrl);
    const fileId = optionalString(item.fileId);
    if (fileUrl) {
      let uploadedFileId = uploadedFiles.get(fileUrl);
      if (!uploadedFileId) {
        uploadedFileId = await uploadSmartSheetFile(fileUrl, optionalString(item.name), runtime);
        uploadedFiles.set(fileUrl, uploadedFileId);
      }
      const nextItem: Record<string, unknown> = { ...item, file_id: uploadedFileId };
      delete nextItem.fileUrl;
      delete nextItem.fileId;
      result.push(nextItem);
    } else if (imageUrl) {
      const nextItem: Record<string, unknown> = { ...item, image_url: imageUrl };
      delete nextItem.imageUrl;
      result.push(nextItem);
    } else if (fileId) {
      const nextItem: Record<string, unknown> = { ...item, file_id: fileId };
      delete nextItem.fileId;
      result.push(nextItem);
    } else {
      result.push(item);
    }
  }
  return result;
}

async function uploadSmartSheetFile(fileUrl: string, suppliedName: string | undefined, runtime: WecomSmartBotRuntime) {
  const validated = assertPublicHttpUrl(fileUrl, {
    fieldName: "fileUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (validated.protocol !== "https:") {
    throw new ProviderRequestError(400, "fileUrl must use https");
  }
  const response = await runtime.fetcher(validated, { headers: { accept: "*/*" }, signal: runtime.signal });
  if (!response.ok) {
    throw new ProviderRequestError(502, `fileUrl download failed with HTTP ${response.status}`);
  }
  const contentLength = readInteger(response.headers.get("content-length"));
  if (contentLength != null && contentLength > wecomAttachmentMaxBytes) {
    throw new ProviderRequestError(400, `fileUrl must be no larger than ${wecomAttachmentMaxBytes} bytes`);
  }
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: wecomAttachmentMaxBytes,
    fieldName: "fileUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (bytes.byteLength === 0 || bytes.byteLength > wecomAttachmentMaxBytes) {
    throw new ProviderRequestError(400, `fileUrl must contain between 1 and ${wecomAttachmentMaxBytes} bytes`);
  }
  const fileName = sanitizeFileName(suppliedName ?? inferFileName(new URL(validated)));
  const result = await callWecomTool(
    "doc",
    "upload_doc_file",
    {
      file_name: fileName,
      file_base64_content: Buffer.from(bytes).toString("base64"),
    },
    runtime,
  );
  const fileId = optionalString(requireProviderObject(result, "WeCom file upload result").fileid);
  if (!fileId) {
    throw new ProviderRequestError(502, "WeCom file upload returned no fileid");
  }
  return fileId;
}

function buildWecomToolCall(actionName: string, input: Record<string, unknown>): WecomToolCall {
  const direct = (category: string, argumentsValue: Record<string, unknown>): WecomToolCall => ({
    category,
    toolName: actionName,
    arguments: compactObject(argumentsValue),
  });
  switch (actionName) {
    case "get_userlist":
      return direct("contact", {});
    case "get_msg_chat_list":
      return direct("msg", {
        begin_time: input.beginTime,
        end_time: input.endTime,
        cursor: input.cursor,
      });
    case "get_message":
      return direct("msg", {
        chat_type: input.chatType,
        chatid: input.chatId,
        begin_time: input.beginTime,
        end_time: input.endTime,
        cursor: input.cursor,
      });
    case "send_message":
      return direct("msg", {
        chat_type: input.chatType,
        chatid: input.chatId,
        msgtype: "text",
        text: { content: input.content },
      });
    case "search_todo_userid":
      return direct("todo", { keyword: input.keyword });
    case "create_todo":
    case "update_todo":
      return direct("todo", {
        todo_id: input.todoId,
        content: input.content,
        follower_list: mapTodoFollowers(input.followers, actionName === "create_todo"),
        todo_status: input.todoStatus,
        end_time: input.endTime,
        remind_type_list: input.reminderTypes,
      });
    case "change_todo_user_status":
      return direct("todo", {
        todo_id: input.todoId,
        follower_id: input.userId,
        user_status: input.userStatus,
      });
    case "get_todo_list":
      return direct("todo", {
        follower_id: input.userId,
        create_begin_time: input.createBeginTime,
        create_end_time: input.createEndTime,
        remind_begin_time: input.remindBeginTime,
        remind_end_time: input.remindEndTime,
        deadline_begin_time: input.deadlineBeginTime,
        deadline_end_time: input.deadlineEndTime,
        todo_status: input.todoStatus,
        limit: input.limit,
        cursor: input.cursor,
      });
    case "get_todo_detail":
      return direct("todo", { todo_id_list: input.todoIds });
    case "delete_todo":
      return direct("todo", { todo_id: input.todoId });
    case "create_meeting":
      return direct("meeting", {
        title: input.title,
        meeting_start_datetime: input.startTime,
        meeting_duration: input.durationSeconds,
        description: input.description,
        location: input.location,
        invitees: mapMeetingCreateInvitees(input.inviteeUserIds),
        settings: input.settings,
      });
    case "list_user_meetings":
      return direct("meeting", {
        begin_datetime: input.beginTime,
        end_datetime: input.endTime,
        cursor: input.cursor,
        limit: input.limit,
      });
    case "get_meeting_info":
      return direct("meeting", {
        meetingid: input.meetingId,
        meeting_code: input.meetingCode,
        sub_meetingid: input.subMeetingId,
      });
    case "cancel_meeting":
      return direct("meeting", { meetingid: input.meetingId });
    case "set_invite_meeting_members":
      return direct("meeting", {
        meetingid: input.meetingId,
        invitees: mapUserIds(input.inviteeUserIds),
      });
    case "get_schedule_list_by_range":
      return direct("schedule", { start_time: input.startTime, end_time: input.endTime });
    case "get_schedule_detail":
      return direct("schedule", { schedule_id_list: input.scheduleIds });
    case "create_schedule":
      return direct("schedule", { schedule: mapSchedule(input) });
    case "update_schedule":
      return direct("schedule", {
        schedule: { schedule_id: input.scheduleId, ...mapSchedule(input) },
      });
    case "cancel_schedule":
      return direct("schedule", { schedule_id: input.scheduleId });
    case "add_schedule_attendees":
    case "del_schedule_attendees":
      return direct("schedule", {
        schedule_id: input.scheduleId,
        attendees: mapUserIds(input.userIds),
      });
    case "check_availability":
      return direct("schedule", {
        check_user_list: input.userIds,
        start_time: input.startTime,
        end_time: input.endTime,
      });
    case "create_doc":
      return direct("doc", {
        doc_type: mapDocumentType(input.documentType),
        doc_name: input.name,
      });
    case "edit_doc_content":
      return direct("doc", {
        ...buildDocumentIdentifier(input),
        content: input.content,
        content_type: 1,
      });
    case "sheet_get_info":
      return direct("doc", buildDocumentIdentifier(input));
    case "sheet_update_range_data":
      return direct("doc", {
        docid: input.docId,
        sheet_id: input.sheetId,
        grid_data: {
          start_row: input.startRow,
          start_column: input.startColumn,
          rows: mapSheetRows(input.rows),
        },
      });
    case "sheet_append_data":
      return direct("doc", {
        docid: input.docId,
        sheet_id: input.sheetId,
        row: { values: mapSheetCells(input.values) },
      });
    case "sheet_add_sub":
      return direct("doc", {
        docid: input.docId,
        sheet: compactObject({
          title: input.title,
          row_count: input.rowCount,
          column_count: input.columnCount,
        }),
        index: input.index,
      });
    case "sheet_delete_sub":
      return direct("doc", { docid: input.docId, sheet_id: input.sheetId });
    case "smartsheet_get_sheet":
      return direct("doc", buildDocumentIdentifier(input));
    case "smartsheet_add_sheet":
      return direct("doc", {
        ...buildDocumentIdentifier(input),
        properties: { title: input.title },
      });
    case "smartsheet_update_sheet":
      return direct("doc", {
        ...buildDocumentIdentifier(input),
        properties: { sheet_id: input.sheetId, title: input.title },
      });
    case "smartsheet_delete_sheet":
      return direct("doc", {
        ...buildDocumentIdentifier(input),
        sheet_id: input.sheetId,
      });
    case "smartsheet_get_fields":
      return direct("doc", {
        ...buildDocumentIdentifier(input),
        sheet_id: input.sheetId,
      });
    case "smartsheet_add_fields":
    case "smartsheet_update_fields":
      return direct("doc", {
        ...buildDocumentIdentifier(input),
        sheet_id: input.sheetId,
        fields: mapSmartSheetFields(input.fields),
      });
    case "smartsheet_delete_fields":
      return direct("doc", {
        ...buildDocumentIdentifier(input),
        sheet_id: input.sheetId,
        field_ids: input.fieldIds,
      });
    case "smartsheet_get_records":
      return direct("doc", {
        ...buildDocumentIdentifier(input),
        sheet_id: input.sheetId,
        cursor: input.cursor,
        limit: input.limit,
      });
    case "smartsheet_add_records":
      return direct("doc", {
        ...buildDocumentIdentifier(input),
        sheet_id: input.sheetId,
        records: mapSmartSheetRecords(input.records),
      });
    case "smartsheet_update_records":
      return direct("doc", {
        ...buildDocumentIdentifier(input),
        sheet_id: input.sheetId,
        key_type: input.keyType === "field_id" ? "CELL_VALUE_KEY_TYPE_FIELD_ID" : "CELL_VALUE_KEY_TYPE_FIELD_TITLE",
        records: mapSmartSheetRecords(input.records),
      });
    case "smartsheet_delete_records":
      return direct("doc", {
        ...buildDocumentIdentifier(input),
        sheet_id: input.sheetId,
        record_ids: input.recordIds,
      });
    case "smartpage_create":
      return direct("doc", {
        title: input.title,
        pages: Array.isArray(input.pages)
          ? input.pages.map((pageValue) => {
              const page = optionalRecord(pageValue) ?? {};
              return compactObject({
                page_title: page.pageTitle,
                content_type: page.contentType === "text" ? 0 : 1,
                page_content: page.content,
              });
            })
          : [],
      });
    default:
      throw new ProviderRequestError(400, `unsupported WeCom smart bot action: ${actionName}`);
  }
}

function mapTodoFollowers(value: unknown, includeStatus: boolean) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return {
    followers: value.map((itemValue) => {
      const item = optionalRecord(itemValue) ?? {};
      return compactObject({
        follower_id: item.userId,
        follower_status: includeStatus ? item.status : undefined,
      });
    }),
  };
}

function mapMeetingCreateInvitees(value: unknown) {
  return Array.isArray(value) ? { userid: value } : undefined;
}

function mapUserIds(value: unknown) {
  return Array.isArray(value) ? value.map((userId) => ({ userid: userId })) : undefined;
}

function mapSchedule(input: Record<string, unknown>) {
  const reminders = optionalRecord(input.reminders);
  return compactObject({
    start_time: input.startTime,
    end_time: input.endTime,
    summary: input.summary,
    description: input.description,
    location: input.location,
    is_whole_day: input.isWholeDay,
    attendees: mapUserIds(input.attendeeUserIds),
    reminders: reminders
      ? compactObject({
          is_remind: reminders.isRemind,
          remind_before_event_secs: reminders.remindBeforeEventSeconds,
          remind_time_diffs: reminders.remindTimeDiffs,
          timezone: reminders.timezone,
        })
      : undefined,
  });
}

function mapDocumentType(value: unknown) {
  if (value === "sheet") {
    return 4;
  }
  if (value === "smart_sheet") {
    return 10;
  }
  return 3;
}

function buildDocumentIdentifier(input: Record<string, unknown>) {
  return compactObject({ docid: input.docId, url: input.url });
}

function mapSheetRows(value: unknown) {
  return Array.isArray(value)
    ? value.map((rowValue) => {
        const row = optionalRecord(rowValue) ?? {};
        return { values: mapSheetCells(row.values) };
      })
    : [];
}

function mapSheetCells(value: unknown) {
  return Array.isArray(value)
    ? value.map((cellValue) => {
        const cell = optionalRecord(cellValue) ?? {};
        return compactObject({
          cell_value: cell.cellValue,
          cell_format: cell.cellFormat,
          data_type: cell.dataType,
        });
      })
    : [];
}

function mapSmartSheetFields(value: unknown) {
  return Array.isArray(value)
    ? value.map((fieldValue) => {
        const field = optionalRecord(fieldValue) ?? {};
        return compactObject({
          ...field,
          field_id: field.fieldId,
          field_title: field.fieldTitle,
          field_type: field.fieldType,
          fieldId: undefined,
          fieldTitle: undefined,
          fieldType: undefined,
        });
      })
    : [];
}

function mapSmartSheetRecords(value: unknown) {
  return Array.isArray(value)
    ? value.map((recordValue) => {
        const record = optionalRecord(recordValue) ?? {};
        return compactObject({
          ...record,
          record_id: record.recordId,
          recordId: undefined,
        });
      })
    : [];
}

function inferMediaContentType(name: string, mediaType: string) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  const byExtension: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    amr: "audio/amr",
    mp4: "video/mp4",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
  };
  if (extension && byExtension[extension]) {
    return byExtension[extension];
  }
  if (mediaType === "image") {
    return "image/jpeg";
  }
  if (mediaType === "voice") {
    return "audio/amr";
  }
  if (mediaType === "video") {
    return "video/mp4";
  }
  return "application/octet-stream";
}

function inferFileName(url: URL) {
  const segment = url.pathname.split("/").filter(Boolean).at(-1);
  if (!segment) {
    return "attachment.bin";
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function sanitizeFileName(value: string) {
  const disallowed = new Set(["/", "\\", "\0", "\n", "\r", "\t"]);
  const cleaned = [...value]
    .map((character) => (disallowed.has(character) ? "_" : character))
    .join("")
    .trim();
  return cleaned.slice(0, 255) || "attachment.bin";
}

function readMcpContentMessage(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  for (const item of value) {
    const text = optionalString(optionalRecord(item)?.text);
    if (text) {
      return text.slice(0, 500);
    }
  }
  return undefined;
}

function requireProviderObject(value: unknown, label: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}

function readInteger(value: unknown) {
  return optionalInteger(value);
}

function hashWecomSmartBotCredential(credential: WecomSmartBotCredential) {
  return createHash("sha256")
    .update(JSON.stringify([credential.botId, credential.secret]))
    .digest("hex");
}

function maskIdentifier(value: string) {
  return value.length <= 8 ? value : `${value.slice(0, 4)}…${value.slice(-4)}`;
}
