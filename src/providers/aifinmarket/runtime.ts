import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { AifinMarketServerType } from "./actions.ts";
import type { Client } from "@modelcontextprotocol/client";

import { withMcpClient } from "../mcp-client.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const origin = "https://mcp.wind.com.cn";
const actionTimeoutMs = 28_000;
const validationTimeoutMs = 30_000;
const maxResponseBytes = 16 * 1024 * 1024;
const maxToolPages = 100;
const maxTools = 10_000;
const maxToolArgumentsBytes = 1_000_000;
const maxErrorMessageLength = 2_000;

export const serverTypes: readonly AifinMarketServerType[] = [
  "stock_data",
  "fund_data",
  "index_data",
  "bond_data",
  "financial_docs",
  "economic_data",
  "analytics_data",
];

const endpointByServerType: Record<AifinMarketServerType, string> = {
  stock_data: `${origin}/vserver_stock_data/mcp/`,
  fund_data: `${origin}/vserver_fund_data/mcp/`,
  index_data: `${origin}/vserver_index_data/mcp/`,
  bond_data: `${origin}/vserver_bond_data/mcp/`,
  financial_docs: `${origin}/vserver_financial_docs/mcp/`,
  economic_data: `${origin}/vserver_economic_data/mcp/`,
  analytics_data: `${origin}/vserver_analytics_data/mcp/`,
};

const serverTypeByAction: Record<string, AifinMarketServerType> = {
  get_stock_price_indicators: "stock_data",
  get_stock_kline: "stock_data",
  search_stocks: "stock_data",
  get_stock_fundamentals: "stock_data",
  get_fund_price_indicators: "fund_data",
  get_fund_kline: "fund_data",
  search_funds: "fund_data",
  get_fund_performance: "fund_data",
  get_index_price_indicators: "index_data",
  get_index_kline: "index_data",
  get_company_announcements: "financial_docs",
  get_financial_news: "financial_docs",
  natural_language_get_edb_data: "economic_data",
};

const backendKlinePeriod: Record<string, string> = {
  "1min": "1",
  "5min": "3",
  "10min": "4",
  "15min": "5",
  "30min": "6",
  "60min": "7",
  "120min": "8",
  "240min": "9",
  "1d": "10",
  "1w": "11",
  "1mo": "12",
  "1y": "13",
  "1q": "14",
  "6mo": "15",
};

export interface DiscoveredTools {
  serverType: AifinMarketServerType;
  tools: unknown[];
}

export async function listTools(
  serverType: AifinMarketServerType,
  context: ApiKeyProviderContext,
): Promise<DiscoveredTools> {
  const tools = await runWindRequest("execute", context.apiKey, () =>
    withClient(context, serverType, actionTimeoutMs, async (client) => {
      const output: unknown[] = [];
      const seenCursors = new Set<string>();
      let totalBytes = 0;
      let cursor: string | undefined;
      for (let page = 0; page < maxToolPages; page += 1) {
        const response = await client.listTools(cursor ? { cursor } : {}, { timeout: actionTimeoutMs });
        totalBytes += new TextEncoder().encode(JSON.stringify(response.tools)).byteLength;
        if (totalBytes > maxResponseBytes) {
          throw new ProviderRequestError(502, `Wind AIFin Market tool listing exceeds ${maxResponseBytes} bytes`);
        }
        output.push(...response.tools);
        if (output.length > maxTools) {
          throw new ProviderRequestError(502, `Wind AIFin Market exposed more than ${maxTools} tools`);
        }
        cursor = response.nextCursor;
        if (!cursor) return output;
        if (seenCursors.has(cursor)) {
          throw new ProviderRequestError(502, "Wind AIFin Market tool listing returned a repeated cursor");
        }
        seenCursors.add(cursor);
      }
      throw new ProviderRequestError(502, `Wind AIFin Market tool listing exceeded ${maxToolPages} pages`);
    }),
  );
  return { serverType, tools };
}

export async function callTool(
  actionName: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<{ result: unknown }> {
  const dynamic = actionName === "call_tool";
  const serverType = dynamic ? readServerType(input.serverType) : serverTypeByAction[actionName];
  if (!serverType) throw new ProviderRequestError(400, `Unknown Wind action: ${actionName}`);
  const toolName = dynamic ? requireString(input.toolName, "toolName") : actionName;
  const args = dynamic ? readArguments(input.arguments) : normalizeNamedArguments(actionName, input);
  assertArgumentBudget(args);

  const result = await runWindRequest("execute", context.apiKey, () =>
    withClient(context, serverType, actionTimeoutMs, async (client) => {
      const response = await client.callTool(
        { name: toolName, arguments: args },
        {
          timeout: actionTimeoutMs,
        },
      );
      if (response.isError) {
        const message = readToolErrorMessage(response) ?? `Wind AIFin Market tool ${toolName} returned an error`;
        throw new ProviderRequestError(502, message, response);
      }
      return transformWindToolResult(response, context.apiKey);
    }),
  );
  return { result };
}

export async function discoverAccessibleTools(context: ApiKeyProviderContext): Promise<DiscoveredTools> {
  const deadline = Date.now() + validationTimeoutMs;
  let lastError: unknown;
  for (const serverType of serverTypes) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ProviderRequestError(504, "Wind AIFin Market credential validation timed out");
    try {
      const tools = await runWindRequest("validate", context.apiKey, () =>
        withClient(context, serverType, Math.max(1, Math.floor(remaining / 2)), async (client) => {
          const tools: unknown[] = [];
          const seenCursors = new Set<string>();
          let totalBytes = 0;
          let cursor: string | undefined;
          for (let page = 0; page < maxToolPages; page += 1) {
            const response = await client.listTools(cursor ? { cursor } : {}, {
              timeout: Math.max(1, Math.floor(remaining / 2)),
            });
            totalBytes += new TextEncoder().encode(JSON.stringify(response.tools)).byteLength;
            if (totalBytes > maxResponseBytes) {
              throw new ProviderRequestError(502, `Wind AIFin Market tool listing exceeds ${maxResponseBytes} bytes`);
            }
            tools.push(...response.tools);
            if (tools.length > maxTools) {
              throw new ProviderRequestError(502, `Wind AIFin Market exposed more than ${maxTools} tools`);
            }
            cursor = response.nextCursor;
            if (!cursor) return tools;
            if (seenCursors.has(cursor)) {
              throw new ProviderRequestError(502, "Wind AIFin Market tool listing returned a repeated cursor");
            }
            seenCursors.add(cursor);
          }
          throw new ProviderRequestError(502, `Wind AIFin Market tool listing exceeded ${maxToolPages} pages`);
        }),
      );
      return { serverType, tools };
    } catch (error) {
      if (error instanceof ProviderRequestError && error.status === 403) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw (
    lastError ?? new ProviderRequestError(403, "Wind AIFin Market credential validation found no accessible service")
  );
}

async function withClient<T>(
  context: ApiKeyProviderContext,
  serverType: AifinMarketServerType,
  timeoutMs: number,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  return withMcpClient(
    {
      endpoint: new URL(endpointByServerType[serverType]),
      transport: "streamable_http",
      fetcher: createLimitedFetch(context.fetcher),
      headers: { authorization: `Bearer ${context.apiKey}`, "user-agent": providerUserAgent },
      signal: context.signal,
      mapError: mapAifinMarketMcpError,
    },
    run,
  );
}

function mapAifinMarketMcpError(error: unknown): unknown {
  if (error instanceof ProviderRequestError) return error;
  const status = readErrorStatus(error);
  return new ProviderRequestError(
    status ?? 502,
    error instanceof Error
      ? `Wind AIFin Market MCP request failed: ${error.message}`
      : "Wind AIFin Market MCP request failed",
    error,
  );
}

function createLimitedFetch(fetcher: typeof fetch): typeof fetch {
  return async (request, init) => {
    const response = await fetcher(request, { ...init, redirect: "error" });
    if (response.status === 403) {
      await response.body?.cancel().catch(() => undefined);
      throw new ProviderRequestError(403, "Wind AIFin Market denied access to this service or tool");
    }
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maxResponseBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new ProviderRequestError(502, `Wind AIFin Market MCP response exceeds ${maxResponseBytes} bytes`);
    }
    if (!response.body) return response;
    let received = 0;
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.byteLength;
          if (received > maxResponseBytes) {
            throw new ProviderRequestError(502, `Wind AIFin Market MCP response exceeds ${maxResponseBytes} bytes`);
          }
          controller.enqueue(chunk);
        },
      }),
    );
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}

function normalizeNamedArguments(actionName: string, input: Record<string, unknown>): Record<string, unknown> {
  validateNamedInput(actionName, input);
  const normalized: Record<string, unknown> =
    typeof input.windcode === "string" ? { ...input, windcode: normalizeWindcode(input.windcode) } : { ...input };
  if (actionName === "natural_language_get_edb_data") {
    const modes: Record<string, string> = { 仅搜索: "search", 仅提数: "fetch", 搜索并提数: "searchFetch" };
    normalized.executionMode = modes[String(normalized.executionMode)] ?? normalized.executionMode;
  }
  if (actionName.endsWith("_kline")) normalized.period = backendKlinePeriod[String(normalized.period ?? "1d")];
  return normalized;
}

function validateNamedInput(actionName: string, input: Record<string, unknown>): void {
  if (typeof input.windcode === "string") {
    const securities = input.windcode
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (securities.length === 0 || securities.length > 50) {
      throw new ProviderRequestError(400, "windcode supports at most 50 comma-separated securities");
    }
  }
  if (actionName.endsWith("_kline") && String(input.begin_date) > String(input.end_date)) {
    throw new ProviderRequestError(400, "begin_date must be on or before end_date");
  }
  if (actionName === "natural_language_get_edb_data") {
    const hasStart = input.beginDate !== undefined;
    const hasEnd = input.endDate !== undefined;
    const hasRange = hasStart && hasEnd;
    if (hasStart !== hasEnd) throw new ProviderRequestError(400, "Provide both beginDate and endDate");
    if (input.observation !== undefined && (hasStart || hasEnd)) {
      throw new ProviderRequestError(400, "observation cannot be combined with beginDate or endDate");
    }
    if (hasRange && String(input.beginDate) > String(input.endDate)) {
      throw new ProviderRequestError(400, "beginDate must be on or before endDate");
    }
    if (!["search", "仅搜索"].includes(String(input.executionMode)) && input.observation === undefined && !hasRange) {
      throw new ProviderRequestError(400, "fetch and searchFetch require observation or a complete date range");
    }
  }
}

function normalizeWindcode(value: string): string {
  return value
    .split(",")
    .map((item) => {
      const raw = item.trim();
      const upper = raw.toUpperCase();
      if (/^0\d{4}\.HK$/u.test(upper)) return upper.slice(1);
      if (
        /^\d{4}\.HK$/u.test(upper) ||
        /^\d{6}\.(SH|SZ|BJ|OF)$/u.test(upper) ||
        /^[A-Z]{1,5}\.(O|N|A|HK|SH|SZ|BJ)$/u.test(upper)
      )
        return upper;
      return raw;
    })
    .join(",");
}

async function runWindRequest<T>(phase: "validate" | "execute", apiKey: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const source = error instanceof ProviderRequestError ? error : new ProviderRequestError(502, String(error), error);
    if (source.status === 401) {
      throw new ProviderRequestError(
        phase === "validate" ? 400 : 401,
        "Wind AIFin Market API Key is invalid or expired",
        error,
      );
    }
    const safeMessage = redactSecrets(source.message, apiKey).slice(0, maxErrorMessageLength);
    const classified = classifyWindError(safeMessage, phase);
    if (classified) throw classified;
    if (source.status === 429)
      throw new ProviderRequestError(429, safeMessage, { reason: "qps_limit", retryAfterSeconds: 5 });
    throw new ProviderRequestError(source.status, safeMessage, source.details);
  }
}

function classifyWindError(message: string, phase: "validate" | "execute"): ProviderRequestError | undefined {
  const normalized = message.toLowerCase();
  if (includesAny(normalized, ["密钥无效", "认证失败", "unauthorized", "key invalid", "auth fail"])) {
    return new ProviderRequestError(
      phase === "validate" ? 400 : 401,
      "Wind AIFin Market API Key is invalid or expired",
    );
  }
  if (
    includesAny(normalized, [
      "单日请求次数超限",
      "daily limit",
      "daily quota",
      "并发请求数量超限",
      "concurrency",
      "请求过于频繁",
      "qps",
      "rate limit",
      "too frequent",
    ])
  )
    return new ProviderRequestError(429, message);
  if (includesAny(normalized, ["余额不足", "请先充值", "insufficient balance"]))
    return new ProviderRequestError(402, message);
  if (
    includesAny(normalized, [
      "未找到匹配的经济指标",
      "未识别实体",
      "未识别到有效的金融标的",
      "no_results",
      "no results",
      "indicator_not_found",
      "market_target_not_found",
    ])
  )
    return new ProviderRequestError(400, message);
  const namesParameter = includesAny(normalized, ["参数", "字段", "param", "argument", "field"]);
  const invalid = includesAny(normalized, [
    "错误",
    "非法",
    "无效",
    "不存在",
    "不识别",
    "不支持",
    "缺少",
    "invalid",
    "missing",
    "required",
  ]);
  if (namesParameter && invalid) return new ProviderRequestError(400, message);
  if (includesAny(normalized, ["route_error", "unknown server_type", "未知 server_type"]))
    return new ProviderRequestError(400, message);
  return undefined;
}

function transformWindToolResult(result: unknown, apiKey: string): unknown {
  const cloned = structuredClone(result);
  const error = readEmbeddedWindError(cloned, apiKey);
  if (error) throw new ProviderRequestError(502, error);
  return asRecord(cloned)?.structuredContent ?? cloned;
}

function readEmbeddedWindError(result: unknown, apiKey: string): string | undefined {
  const record = asRecord(result);
  const content = Array.isArray(record?.content) ? record.content : [];
  const text = asRecord(content[0])?.text;
  const embedded = typeof text === "string" ? parseRecord(text) : record;
  if (!embedded) return undefined;
  if (typeof embedded.mcp_tool_error_code === "number" && embedded.mcp_tool_error_code !== 0) {
    return redactSecrets(
      readMessage(embedded.mcp_tool_error_msg) ??
        `Wind AIFin Market tool failed with code ${embedded.mcp_tool_error_code}`,
      apiKey,
    );
  }
  const nested = asRecord(embedded.error);
  if (
    nested &&
    (readMessage(nested.message) || hasMeaningfulValue(nested.code)) &&
    !isExplicitNoDataResult(embedded, nested)
  ) {
    const code = hasMeaningfulValue(nested.code)
      ? redactSecrets(String(nested.code).trim(), apiKey).slice(0, 100)
      : undefined;
    const nestedMessage = readMessage(nested.message);
    const message = redactSecrets(
      code && nestedMessage ? `${code}: ${nestedMessage}` : (nestedMessage ?? code ?? "Wind AIFin Market tool failed"),
      apiKey,
    ).slice(0, maxErrorMessageLength);
    if (hasUsableBusinessData(embedded) && !classifyWindError(message, "execute")) {
      attachWindWarning(result, "BACKEND_ERROR_WITH_DATA", message);
      return undefined;
    }
    return message;
  }
  const business = asRecord(embedded.data);
  const code = Number(business?.code);
  if (business && Number.isFinite(code) && code !== 0) {
    const message = redactSecrets(
      readMessage(business.message) ?? `Wind AIFin Market request failed with code ${code}`,
      apiKey,
    ).slice(0, maxErrorMessageLength);
    const normalizedMessage = message.trim().toUpperCase();
    if (code < 200 || code >= 300 || (normalizedMessage !== "OK" && normalizedMessage !== "SUCCESS")) {
      if (hasUsableBusinessData(embedded) && !classifyWindError(message, "execute")) {
        attachWindWarning(result, "UNKNOWN_BACKEND_STATUS_WITH_DATA", message);
        return undefined;
      }
      return message;
    }
  }
  return undefined;
}

function hasMeaningfulValue(value: unknown): boolean {
  return (typeof value === "number" && value !== 0) || (typeof value === "string" && value.trim().length > 0);
}

function hasUsableBusinessData(embedded: Record<string, unknown>): boolean {
  const body = asRecord(embedded.data);
  return hasUsableValue(body && "data" in body ? body.data : embedded.data);
}

function hasUsableValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" || Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function attachWindWarning(result: unknown, code: string, message: string): void {
  const record = asRecord(result);
  const target = asRecord(record?.structuredContent) ?? record;
  if (target) target.__openConnectorWarnings = [{ code, message }];
}

function isExplicitNoDataResult(embedded: Record<string, unknown>, error: Record<string, unknown>): boolean {
  return embedded.data === null && error.code === "QUERY_FAILED" && error.message === "没找到数据";
}

function readToolErrorMessage(result: unknown): string | undefined {
  const content = asRecord(result)?.content;
  if (!Array.isArray(content)) return undefined;
  return content.map((item) => asRecord(item)?.text).find((value): value is string => typeof value === "string");
}

function readArguments(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  const record = asRecord(value);
  if (!record) throw new ProviderRequestError(400, "arguments must be a JSON object");
  return record;
}

function assertArgumentBudget(value: Record<string, unknown>): void {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maxToolArgumentsBytes) {
    throw new ProviderRequestError(400, `arguments must not exceed ${maxToolArgumentsBytes} JSON bytes`);
  }
}

function readServerType(value: unknown): AifinMarketServerType {
  if (typeof value === "string" && serverTypes.includes(value as AifinMarketServerType))
    return value as AifinMarketServerType;
  throw new ProviderRequestError(400, "serverType is invalid");
}

function requireString(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new ProviderRequestError(400, `${field} is required`);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseRecord(value: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function readMessage(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function includesAny(value: string, fragments: readonly string[]): boolean {
  return fragments.some((fragment) => value.includes(fragment));
}

function redactSecrets(message: string, apiKey: string): string {
  return message
    .replaceAll(apiKey, "[REDACTED]")
    .replace(/\bBearer\s+[^\s,;"']+/giu, "Bearer [REDACTED]")
    .replace(/\bWIND_API_KEY\s*[:=]\s*[^\s,;"']+/giu, "WIND_API_KEY=[REDACTED]");
}

function readErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = "code" in error ? error.code : "status" in error ? error.status : undefined;
  return typeof value === "number" ? value : undefined;
}
