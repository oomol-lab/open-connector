import type { ProviderFetch } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { UnauthorizedError } from "@modelcontextprotocol/client";
import { SseError } from "@modelcontextprotocol/client";
import { SdkError, SdkErrorCode } from "@modelcontextprotocol/client";
import { posix } from "node:path";
import { compactObject, optionalInteger, optionalString } from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { baiduNetdiskFileCategories, baiduNetdiskSemanticMatchSources, isBaiduNetdiskAbsolutePath } from "./actions.ts";
import { normalizeBaiduNetdiskError, parseBaiduNetdiskJson } from "./runtime.ts";

const baiduNetdiskMcpEndpoint = new URL("https://mcp-pan.baidu.com/sse");
const requestTimeoutMs = 30_000;
const requiredToolNames = [
  "file_list",
  "file_keyword_search",
  "file_semantics_search",
  "file_upload_by_content",
  "file_upload_by_url",
  "make_dir",
  "file_copy",
  "file_move",
  "file_rename",
] as const;
const requiredToolInputProperties = new Map<string, Readonly<Record<string, string>>>([
  ["file_list", { dir: "string", page: "number" }],
  ["file_upload_by_content", { content: "string", dir: "string", filename: "string" }],
  ["file_upload_by_url", { url: "string", dir: "string", filename: "string" }],
  ["make_dir", { path: "string", rtype: "string" }],
]);
const semanticSourceByCode = new Map<number, (typeof baiduNetdiskSemanticMatchSources)[number]>([
  [4, "filename"],
  [5, "image_ocr"],
  [11, "document_text"],
  [7, "document_semantic"],
  [8, "video_semantic"],
  [9, "audio_semantic"],
  [14, "image_semantic"],
  [13, "card"],
]);

export type BaiduNetdiskMcpContext = {
  accessToken: string;
  fetcher: ProviderFetch;
};

export async function verifyBaiduNetdiskMcpConnection(accessToken: string, fetcher: ProviderFetch): Promise<void> {
  await withBaiduNetdiskMcpClient(accessToken, fetcher, async (client) => {
    const result = await client.listTools({}, { timeout: requestTimeoutMs });
    const toolsByName = new Map(result.tools.map((tool) => [tool.name, tool]));
    for (const toolName of requiredToolNames) {
      const tool = toolsByName.get(toolName);
      if (!tool) {
        throw new ProviderRequestError(502, `baidu_netdisk MCP server is missing required tool: ${toolName}`);
      }
      const properties = tool.inputSchema.properties;
      for (const [property, expectedType] of Object.entries(requiredToolInputProperties.get(toolName) ?? {})) {
        const schema = properties?.[property];
        if (
          !schema ||
          typeof schema !== "object" ||
          Array.isArray(schema) ||
          !("type" in schema) ||
          schema.type !== expectedType
        ) {
          throw new ProviderRequestError(502, `baidu_netdisk MCP tool ${toolName} has an incompatible input schema`);
        }
      }
    }
  });
}

export async function executeBaiduNetdiskMcpAction(
  actionName: string,
  input: Record<string, unknown>,
  context: BaiduNetdiskMcpContext,
): Promise<unknown> {
  validateBaiduNetdiskMcpInput(actionName, input);
  switch (actionName) {
    case "list_files": {
      const page = requireSafeInteger(input.page, "page");
      const payload = await callBaiduNetdiskMcpTool(
        "file_list",
        { dir: encodeURIComponent(String(input.path)), page },
        "read",
        context,
      );
      return { items: normalizeFileList(payload), page };
    }
    case "search_files": {
      const page = requireSafeInteger(input.page, "page");
      const payload = await callBaiduNetdiskMcpTool(
        "file_keyword_search",
        {
          dir: String(input.path),
          key: String(input.query),
          num: String(requireSafeInteger(input.pageSize, "pageSize")),
          page: String(page),
        },
        "read",
        context,
      );
      return { items: normalizeFileList(payload), page };
    }
    case "semantic_search_files": {
      const payload = await callBaiduNetdiskMcpTool(
        "file_semantics_search",
        {
          dir: String(input.path),
          query: String(input.query),
          num: requireSafeInteger(input.limit, "limit"),
          stream: 0,
        },
        "read",
        context,
      );
      return normalizeSemanticSearch(payload);
    }
    case "upload_file_from_url": {
      const destinationPath = String(input.destinationPath);
      const payload = await callBaiduNetdiskMcpTool(
        "file_upload_by_url",
        {
          dir: posix.dirname(destinationPath),
          filename: posix.basename(destinationPath),
          url: String(input.fileUrl),
        },
        "write",
        context,
      );
      return normalizeBaiduNetdiskFile(unwrapDataObject(payload), "file");
    }
    case "create_text_file": {
      const destinationPath = String(input.path);
      const payload = await callBaiduNetdiskMcpTool(
        "file_upload_by_content",
        {
          content: String(input.content),
          dir: posix.dirname(destinationPath),
          filename: posix.basename(destinationPath),
        },
        "write",
        context,
      );
      return normalizeBaiduNetdiskFile(unwrapDataObject(payload), "file");
    }
    case "create_folder": {
      const payload = await callBaiduNetdiskMcpTool(
        "make_dir",
        {
          path: encodeURIComponent(String(input.path)),
          rtype: toMcpRtype(input.conflictStrategy),
        },
        "write",
        context,
      );
      return normalizeBaiduNetdiskFile(unwrapDataObject(payload), "folder");
    }
    case "copy":
    case "move":
      return executeRelocate(actionName, input, context);
    case "rename":
      return executeRename(input, context);
  }
}

function validateBaiduNetdiskMcpInput(actionName: string, input: Record<string, unknown>): void {
  for (const fieldName of ["path", "sourcePath", "destinationPath", "destinationDirectoryPath"]) {
    const value = input[fieldName];
    if (
      value !== undefined &&
      !isBaiduNetdiskAbsolutePath(value, fieldName === "path" && actionName !== "create_text_file")
    ) {
      throw new ProviderRequestError(400, `${fieldName} must be an absolute Baidu Netdisk path without traversal`);
    }
  }
  for (const fieldName of ["newName"]) {
    const value = input[fieldName];
    if (
      value !== undefined &&
      (typeof value !== "string" ||
        value.length === 0 ||
        value === "." ||
        value === ".." ||
        value.includes("/") ||
        value.includes("\\") ||
        value.includes("\0"))
    ) {
      throw new ProviderRequestError(400, `${fieldName} must be one non-empty name without path separators`);
    }
  }
  if (actionName === "upload_file_from_url") {
    try {
      const protocol = new URL(String(input.fileUrl)).protocol;
      if (protocol === "http:" || protocol === "https:") return;
    } catch {
      // Fall through to the stable input error.
    }
    throw new ProviderRequestError(400, "fileUrl must use HTTP or HTTPS");
  }
}

export async function withBaiduNetdiskMcpClient<T>(
  accessToken: string,
  fetcher: ProviderFetch,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  return withMcpClient(
    {
      endpoint: baiduNetdiskMcpEndpoint,
      transport: "sse",
      headers: { authorization: `Bearer ${accessToken}` },
      fetcher,
      mapError: normalizeBaiduNetdiskMcpTransportError,
    },
    run,
  );
}

async function callBaiduNetdiskMcpTool(
  name: string,
  args: Record<string, unknown>,
  phase: "read" | "write",
  context: BaiduNetdiskMcpContext,
) {
  return withBaiduNetdiskMcpClient(context.accessToken, context.fetcher, async (client) => {
    const result = await client.callTool({ name, arguments: args }, { timeout: requestTimeoutMs });
    const payload =
      result.structuredContent && !hasUnsafeBaiduId(result.structuredContent)
        ? requireObject(result.structuredContent)
        : parseMcpTextResult(result.content);
    const errno = readOptionalInteger(payload.errno ?? payload.error_no ?? payload.error_code);
    if (errno != null && errno !== 0) {
      throw normalizeBaiduNetdiskError(errno, 200, payload.request_id, phase);
    }
    if (result.isError) {
      throw new ProviderRequestError(502, "baidu_netdisk MCP tool call failed");
    }
    return payload;
  });
}

function parseMcpTextResult(content: Array<{ type: string; [key: string]: unknown }>) {
  const text = content.find(
    (item): item is { type: "text"; text: string } => item.type === "text" && typeof item.text === "string",
  )?.text;
  if (!text) {
    throw new ProviderRequestError(502, "baidu_netdisk MCP returned no JSON result");
  }
  return parseBaiduNetdiskJson(text.trim(), "baidu_netdisk MCP returned invalid JSON");
}

function hasUnsafeBaiduId(value: unknown, key?: string): boolean {
  if (typeof value === "number") {
    return (
      (key === "fs_id" ||
        key === "fsid" ||
        key === "pid" ||
        key === "uk" ||
        key === "request_id" ||
        key === "cursor") &&
      !Number.isSafeInteger(value)
    );
  }
  if (Array.isArray(value)) return value.some((item) => hasUnsafeBaiduId(item));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([childKey, child]) => hasUnsafeBaiduId(child, childKey));
}

async function executeRelocate(
  operation: "copy" | "move",
  input: Record<string, unknown>,
  context: BaiduNetdiskMcpContext,
) {
  const sourcePath = String(input.sourcePath);
  const fileItem = compactObject({
    path: sourcePath,
    dest: String(input.destinationDirectoryPath),
    newname: optionalString(input.newName),
  });
  const payload = await callBaiduNetdiskMcpTool(
    operation === "copy" ? "file_copy" : "file_move",
    {
      async: 0,
      filelist: JSON.stringify([fileItem]),
      ondup: toMcpOnDuplicate(input.conflictStrategy),
    },
    "write",
    context,
  );
  return normalizeManagementResult(payload, sourcePath);
}

async function executeRename(input: Record<string, unknown>, context: BaiduNetdiskMcpContext) {
  const sourcePath = String(input.sourcePath);
  const payload = await callBaiduNetdiskMcpTool(
    "file_rename",
    {
      async: 0,
      filelist: JSON.stringify([{ path: sourcePath, newname: String(input.newName) }]),
      ondup: toMcpOnDuplicate(input.conflictStrategy),
    },
    "write",
    context,
  );
  return normalizeManagementResult(payload, sourcePath);
}

function normalizeFileList(payload: Record<string, unknown>) {
  const container = unwrapDataObject(payload);
  const value = Array.isArray(container.list) ? container.list : container.data;
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "baidu_netdisk MCP result is missing list");
  }
  return value.map((item) => normalizeBaiduNetdiskFile(requireObject(item), undefined));
}

function normalizeSemanticSearch(payload: Record<string, unknown>) {
  if (Array.isArray(payload.list)) {
    return {
      items: payload.list.map((item) => normalizeSemanticFile(requireObject(item))),
      truncated: payload.has_more === 1 || payload.is_end === false,
    };
  }
  if (!Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, "baidu_netdisk MCP result is missing data");
  }
  const items = payload.data.flatMap((groupValue) => {
    const group = requireObject(groupValue);
    const groupSource = readOptionalInteger(group.source);
    if (!Array.isArray(group.list)) {
      return [normalizeSemanticFile(group, groupSource)];
    }
    return group.list.map((item) => normalizeSemanticFile(requireObject(item), groupSource));
  });
  return { items, truncated: payload.is_end === false };
}

function normalizeSemanticFile(item: Record<string, unknown>, groupSource?: number) {
  const source = readOptionalInteger(item.source) ?? groupSource;
  return {
    ...normalizeBaiduNetdiskFile({ ...item, fs_id: item.fs_id ?? item.fsid }, undefined),
    matchSource: source == null ? null : (semanticSourceByCode.get(source) ?? null),
    matchedContent: optionalString(item.content) ?? null,
    ocrText: optionalString(item.ocr) ?? null,
    passageId: optionalLosslessId(item.pid),
  };
}

function normalizeManagementResult(payload: Record<string, unknown>, sourcePath: string) {
  const item = Array.isArray(payload.info) ? requireObject(payload.info[0]) : unwrapDataObject(payload);
  const errno = readOptionalInteger(item.errno);
  if (errno != null && errno !== 0) {
    throw normalizeBaiduNetdiskError(errno, 200, payload.request_id, "write");
  }
  return {
    sourcePath,
    path: item.path == null ? null : normalizeMcpPath(item.path),
  };
}

function normalizeBaiduNetdiskFile(item: Record<string, unknown>, forcedKind?: "file" | "folder") {
  const path = normalizeMcpPath(item.path);
  const kind = forcedKind ?? (readOptionalInteger(item.isdir) === 1 ? "folder" : "file");
  const name = optionalString(item.server_filename) || optionalString(item.filename) || posix.basename(path);
  return {
    id: requireLosslessId(item.fs_id ?? item.fsid, "fs_id"),
    name,
    path,
    kind,
    category: kind === "folder" ? null : normalizeCategory(item.category),
    sizeBytes: kind === "folder" ? null : (readOptionalInteger(item.size) ?? null),
    createdAt: normalizeTimestamp(item.server_ctime ?? item.ctime),
    modifiedAt: normalizeTimestamp(item.server_mtime ?? item.mtime),
    cloudMd5: optionalString(item.md5) ?? null,
  };
}

function unwrapDataObject(payload: Record<string, unknown>) {
  return payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? requireObject(payload.data)
    : payload;
}

function requireObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, "baidu_netdisk MCP returned an invalid item");
  }
  return value as Record<string, unknown>;
}

function normalizeMcpPath(value: unknown) {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, "baidu_netdisk MCP result is missing path");
  }
  let path = value;
  try {
    if (path.slice(0, 3).toLowerCase() === "%2f") path = decodeURIComponent(path);
  } catch {
    throw new ProviderRequestError(502, "baidu_netdisk MCP returned invalid path encoding");
  }
  if (!isBaiduNetdiskAbsolutePath(path)) {
    throw new ProviderRequestError(502, "baidu_netdisk MCP returned invalid path");
  }
  return path;
}

function normalizeCategory(value: unknown) {
  const category = readOptionalInteger(value);
  return category && category >= 1 && category <= baiduNetdiskFileCategories.length
    ? baiduNetdiskFileCategories[category - 1]!
    : "other";
}

function normalizeTimestamp(value: unknown) {
  const seconds = readOptionalInteger(value);
  if (seconds == null || seconds < 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function requireLosslessId(value: unknown, fieldName: string) {
  const id = optionalLosslessId(value);
  if (id) return id;
  throw new ProviderRequestError(502, `baidu_netdisk MCP result is missing ${fieldName}`);
}

function optionalLosslessId(value: unknown) {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return null;
}

function readOptionalInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return undefined;
}

function requireSafeInteger(value: unknown, fieldName: string) {
  const integer = optionalInteger(value);
  if (integer != null) return integer;
  throw new ProviderRequestError(400, `${fieldName} must be an integer`);
}

function toMcpRtype(value: unknown) {
  return value === "rename" ? "1" : "0";
}

function toMcpOnDuplicate(value: unknown) {
  return value === "rename" ? "newcopy" : "fail";
}

function normalizeBaiduNetdiskMcpTransportError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "baidu_netdisk MCP credential is invalid or expired");
  }
  if (error instanceof SseError) {
    if (error.code === 400 || error.code === 401 || error.code === 403) {
      return new ProviderRequestError(401, "baidu_netdisk MCP credential is invalid or expired");
    }
    if (error.code === 429) {
      return new ProviderRequestError(429, "baidu_netdisk MCP rate limit exceeded");
    }
    return new ProviderRequestError(502, "baidu_netdisk MCP connection failed");
  }
  if (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout) {
    return new ProviderRequestError(504, "baidu_netdisk MCP request timed out");
  }
  return new ProviderRequestError(502, "baidu_netdisk MCP request failed");
}
