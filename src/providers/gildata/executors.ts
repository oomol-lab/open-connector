import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { McpToolSummary, McpToolOptions } from "../mcp-tools.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { listMcpTools, callMcpTool } from "../mcp-tools.ts";
import {
  defineApiKeyProviderExecutors,
  mapProviderActionHandlers,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";
import { gildataActions, gildataMcpServerTypes } from "./actions.ts";
type GildataMcpServerType = "tool" | "api";
const gildataMcpOrigin = "https://api.gildata.com";
const gildataValidationServerTimeoutMs = 15_000;
const gildataRequestTimeoutMs = 55_000;
const gildataMaxResponseBytes = 16 * 1024 * 1024;
const gildataMaxToolPages = 100;
const gildataMaxTools = 10_000;
const maxGildataErrorMessageLength = 2_000;

const endpointByServerType: Record<GildataMcpServerType, string> = {
  tool: `${gildataMcpOrigin}/mcp-servers/aidata-assistant-srv-tool`,
  api: `${gildataMcpOrigin}/mcp-servers/aidata-assistant-srv-api`,
};

const curatedToolByAction: Record<string, string> = {
  query_financial_data: "FinQuery",
  screen_stocks: "StockMultipleFactorFilter",
  screen_funds: "FundMultipleFactorFilter",
  get_macro_data: "MacroIndustryData",
  search_research_reports: "FinancialResearchReport",
  get_stock_overview: "FinQuery",
  compare_stocks: "FinQuery",
  get_company_news_and_announcements: "FinQuery",
};

interface GildataParsedActionInput {
  serverType?: GildataMcpServerType;
  toolName?: string;
  arguments?: Record<string, unknown>;
  query?: string;
  criteria?: string;
  security?: string;
  securities?: string[];
  focus?: string;
  startDate?: string;
  endDate?: string;
}

const handlers = mapProviderActionHandlers(
  "gildata",
  gildataActions,
  (_action, actionName) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const apiKey = requiredInputString(context.apiKey, "JY_API_KEY").trim();
    const fetcher = context.fetcher;
    const actionInput = parseActionInput(input);
    let output: Record<string, unknown>;
    if (actionName === "list_tools") {
      const serverType = actionInput.serverType ?? "tool";
      output = {
        serverType,
        tools: await runGildataMcp(apiKey, () => discoverGildataTools(serverType, apiKey, fetcher, context.signal)),
      };
    } else if (actionName === "call_tool") {
      output = {
        result: await callGildataTool(
          actionInput.serverType ?? "tool",
          requiredInputString(actionInput.toolName, "toolName"),
          actionInput.arguments ?? {},
          apiKey,
          fetcher,
          context.signal,
        ),
      };
    } else {
      const toolName = curatedToolByAction[actionName];
      output = {
        result: await callGildataTool(
          "tool",
          requiredInputString(toolName, "toolName"),
          { query: buildCuratedQuery(actionName, actionInput) },
          apiKey,
          fetcher,
          context.signal,
          requireCuratedQueryTool(toolName),
        ),
      };
    }

    return output;
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("gildata", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiKey = requiredInputString(input.apiKey, "JY_API_KEY").trim();
    const { serverType, tools } = await runGildataMcp(apiKey, () => discoverAccessibleTools(apiKey, fetcher, signal));
    const hash = sha256Hex(apiKey).slice(0, 16);
    return {
      profile: { accountId: `gildata:mcp:${hash}`, displayName: `Gildata Data Map · ${hash.slice(-6)}` },
      metadata: { mcpOrigin: gildataMcpOrigin, validationServerType: serverType, discoveredToolCount: tools.length },
    };
  },
};
function parseActionInput(input: Record<string, unknown>): GildataParsedActionInput {
  const securities = Array.isArray(input.securities)
    ? input.securities.map((value) => requiredInputString(value, "security").trim())
    : undefined;
  const args = optionalRecord(input.arguments);
  const startDate = optionalString(input.startDate);
  const endDate = optionalString(input.endDate);
  if (securities && new Set(securities).size !== securities.length)
    throw new ProviderRequestError(400, "securities must not contain duplicate stocks");
  if (startDate && endDate && startDate > endDate)
    throw new ProviderRequestError(400, "endDate must be greater than or equal to startDate");
  if (args && new TextEncoder().encode(JSON.stringify(args)).byteLength > 1_000_000)
    throw new ProviderRequestError(400, "arguments must not exceed 1000000 JSON bytes.");
  return {
    serverType: input.serverType === "api" ? "api" : "tool",
    toolName: optionalString(input.toolName)?.trim(),
    arguments: args,
    query: optionalString(input.query)?.trim(),
    criteria: optionalString(input.criteria)?.trim(),
    security: optionalString(input.security)?.trim(),
    securities,
    focus: optionalString(input.focus)?.trim(),
    startDate,
    endDate,
  };
}
function callGildataTool(
  serverType: GildataMcpServerType,
  toolName: string,
  arguments_: Record<string, unknown>,
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
  authorizeTool?: (tool: McpToolSummary | undefined) => void,
) {
  return runGildataMcp(apiKey, () =>
    callMcpTool({
      ...buildGildataMcpInput(serverType, apiKey, fetcher, signal),
      toolName,
      arguments: arguments_,
      authorizeTool,
    }),
  );
}

function requireCuratedQueryTool(toolName: string) {
  return (tool: McpToolSummary | undefined) => {
    if (!tool) {
      throw new ProviderRequestError(
        403,
        `This Gildata account does not currently expose the ${toolName} tool required by this action. Use list_tools to inspect the enabled tools or ask Gildata to enable the corresponding standard tool.`,
        undefined,
        "provider_error",
      );
    }

    const properties = optionalRecord(tool.inputSchema.properties);
    const querySchema = optionalRecord(properties?.query);
    if (tool.inputSchema.type !== "object" || querySchema?.type !== "string") {
      throw new ProviderRequestError(
        502,
        `Gildata changed the input schema for ${toolName}; use list_tools and call_tool with the current schema.`,
        undefined,
        "provider_error",
      );
    }
  };
}

function buildCuratedQuery(actionName: string, input: GildataParsedActionInput) {
  switch (actionName) {
    case "query_financial_data":
    case "get_macro_data":
    case "search_research_reports":
      return requiredInputString(input.query, "query");
    case "screen_stocks":
    case "screen_funds":
      return requiredInputString(input.criteria, "criteria");
    case "get_stock_overview":
      return appendFocus(
        `查询${input.security}的个股概览，包含公司基本资料、主营业务、最新行情、最近财务表现、估值、行业对比、机构一致预期，并标明数据日期。`,
        input.focus,
      );
    case "compare_stocks":
      return appendFocus(
        `对比${requireSecurities(input.securities).join("、")}的公司基本面、营收与利润增长、盈利能力、现金流、估值、行业与市场表现，并标明数据日期。`,
        input.focus,
      );
    case "get_company_news_and_announcements": {
      const dateRange = buildDateRange(input.startDate, input.endDate);
      return appendFocus(
        `查询${input.security}${dateRange}的公司新闻、交易所公告和业绩预告，按时间倒序并标明来源和发布时间。`,
        input.focus,
      );
    }
  }
}

function requireSecurities(securities: string[] | undefined): string[] {
  if (securities && securities.length > 0) return securities;
  throw new ProviderRequestError(400, "securities must contain at least one stock", undefined, "invalid_input");
}

function appendFocus(query: string, focus: string | undefined) {
  return focus ? `${query}重点关注：${focus}。` : query;
}

function buildDateRange(startDate: string | undefined, endDate: string | undefined) {
  if (startDate && endDate) {
    return `在${startDate}至${endDate}期间`;
  }
  if (startDate) {
    return `自${startDate}以来`;
  }
  if (endDate) {
    return `截至${endDate}`;
  }
  return "最近";
}

async function discoverAccessibleTools(apiKey: string, fetcher: ProviderFetch, signal?: AbortSignal) {
  let foundAccessibleServer = false;
  let firstServiceError: ProviderRequestError | undefined;
  for (const serverType of gildataMcpServerTypes) {
    try {
      const tools = await discoverGildataTools(serverType, apiKey, fetcher, signal, gildataValidationServerTimeoutMs);
      foundAccessibleServer = true;
      if (tools.length > 0) {
        return { serverType, tools };
      }
    } catch (error) {
      if (error instanceof ProviderRequestError && (error.status === 401 || error.status === 403)) {
        continue;
      }
      if (error instanceof ProviderRequestError) {
        firstServiceError ??= error;
      } else {
        firstServiceError ??= new ProviderRequestError(
          502,
          "Gildata Data Map MCP service could not be reached during credential validation",
          undefined,
          "provider_error",
        );
      }
    }
  }

  if (foundAccessibleServer) {
    throw new ProviderRequestError(
      400,
      "Gildata Data Map did not expose any tools for this JY_API_KEY",
      undefined,
      "invalid_input",
    );
  }
  if (firstServiceError) {
    throw firstServiceError;
  }
  throw new ProviderRequestError(
    401,
    "Gildata JY_API_KEY is invalid, expired, or has no enabled MCP service",
    undefined,
    "provider_error",
  );
}

function discoverGildataTools(
  serverType: GildataMcpServerType,
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
  requestTimeoutMs = gildataRequestTimeoutMs,
) {
  return listMcpTools(buildGildataMcpInput(serverType, apiKey, fetcher, signal, requestTimeoutMs), {
    includeAnnotations: true,
  });
}

function buildGildataMcpInput(
  serverType: GildataMcpServerType,
  apiKey: string,
  fetcher: ProviderFetch,
  parentSignal?: AbortSignal,
  requestTimeoutMs = gildataRequestTimeoutMs,
): McpToolOptions {
  const endpoint = new URL(endpointByServerType[serverType]);
  endpoint.searchParams.set("token", apiKey);
  return {
    endpoint: endpoint.toString(),
    service: "Gildata Data Map",
    fetcher: async (request, init) => {
      const response = await fetcher(request, init);
      if (response.status === 401) {
        await response.body?.cancel().catch(() => undefined);
        throw new ProviderRequestError(401, "Gildata JY_API_KEY is invalid or expired", undefined, "provider_error");
      }
      if (response.status === 403) {
        await response.body?.cancel().catch(() => undefined);
        throw new ProviderRequestError(
          403,
          "This Gildata JY_API_KEY is not enabled for the requested MCP service or tool",
          undefined,
          "provider_error",
        );
      }
      return response;
    },
    redirect: "manual",
    terminateSession: true,
    signal: parentSignal,
    requestTimeoutMs,
    maxResponseBytes: gildataMaxResponseBytes,
    toolListMaxBytes: gildataMaxResponseBytes,
    toolListMaxPages: gildataMaxToolPages,
    toolListMaxTools: gildataMaxTools,
    toolListTimeoutMs: requestTimeoutMs,
  };
}

async function runGildataMcp<T>(apiKey: string, run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    throwSanitizedGildataError(error, apiKey);
  }
}

function throwSanitizedGildataError(error: unknown, apiKey: string): never {
  if (error instanceof ProviderRequestError) {
    throw new ProviderRequestError(error.status, redactGildataSecret(error.message, apiKey), error.details, error.code);
  }
  const message = error instanceof Error ? error.message : "Gildata Data Map MCP request failed";
  throw new ProviderRequestError(502, redactGildataSecret(message, apiKey), undefined, "provider_error");
}

function redactGildataSecret(message: string, apiKey: string) {
  const formEncodedApiKey = new URLSearchParams({ token: apiKey }).toString().slice("token=".length);
  return message
    .replaceAll(apiKey, "[REDACTED]")
    .replaceAll(encodeURIComponent(apiKey), "[REDACTED]")
    .replaceAll(formEncodedApiKey, "[REDACTED]")
    .slice(0, maxGildataErrorMessageLength);
}
