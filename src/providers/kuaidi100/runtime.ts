import type { CredentialValidationResult } from "../../core/types.ts";
import type {
  ApiKeyProviderContext,
  ProviderActionHandlers,
  ProviderFetch,
  ProviderRuntimeHandler,
} from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { ProtocolError, SdkHttpError, UnauthorizedError } from "@modelcontextprotocol/client";
import { createHash } from "node:crypto";
import { optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import { providerUserAgent, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

const service = "kuaidi100";
export const kuaidi100McpEndpoint = "https://api.kuaidi100.com/mcp/streamable";
const requestTimeoutMs = 60_000;

type Kuaidi100Phase = "validate" | "execute";
type Kuaidi100ActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const kuaidi100ActionHandlers: ProviderActionHandlers<typeof service, Kuaidi100ActionHandler> = {
  query_trace: callKuaidi100Tool("query_trace"),
  auto_number: callKuaidi100Tool("auto_number"),
  estimate_time: callKuaidi100Tool("estimate_time"),
  estimate_time_with_logistic: callKuaidi100Tool("estimate_time_with_logistic"),
  estimate_price: callKuaidi100Tool("estimate_price"),
  order_price: callKuaidi100Tool("order_price"),
  create_order: callKuaidi100Tool("create_order"),
  query_order: callKuaidi100Tool("query_order"),
  cancel_order: callKuaidi100Tool("cancel_order"),
};

export async function validateKuaidi100Credential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const result = await withKuaidi100Client({ apiKey, fetcher, signal }, "validate", (client) =>
    client.listTools({}, { timeout: requestTimeoutMs, signal }),
  );
  const availableTools = new Set(result.tools.map((tool) => tool.name));
  if (!Object.keys(kuaidi100ActionHandlers).some((name) => availableTools.has(name))) {
    throw new ProviderRequestError(502, "Kuaidi100 MCP did not expose any supported tools");
  }
  const hash = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
  return {
    profile: { accountId: `kuaidi100:mcp:${hash}`, displayName: `Kuaidi100 · ${hash.slice(-6)}` },
    grantedScopes: [],
    metadata: { mcpEndpoint: kuaidi100McpEndpoint, discoveredToolCount: result.tools.length },
  };
}

function callKuaidi100Tool(toolName: string): Kuaidi100ActionHandler {
  return async (input, context) => {
    const result = await withKuaidi100Client(context, "execute", (client) =>
      client.callTool(
        { name: toolName, arguments: mapKuaidi100Input(toolName, input, context.apiKey) },
        { timeout: requestTimeoutMs, signal: context.signal },
      ),
    );
    if (!("toolResult" in result) && result.isError) {
      throw new ProviderRequestError(502, `Kuaidi100 MCP tool ${toolName} returned an error`, result);
    }
    if ("toolResult" in result) return normalizeKuaidi100Output(result.toolResult);
    if (result.structuredContent) return normalizeKuaidi100Output(result.structuredContent);
    const text = result.content.find((item) => item.type === "text");
    if (text?.type === "text") {
      try {
        return normalizeKuaidi100Output(JSON.parse(text.text));
      } catch {
        return { result: text.text };
      }
    }
    return { result: result.content };
  };
}

function mapKuaidi100Input(toolName: string, input: Record<string, unknown>, apiKey: string): Record<string, unknown> {
  const responseFormat = "json";
  if (toolName === "query_trace") {
    return {
      kuaidiNum: requiredInputString(input.trackingNumber, "trackingNumber"),
      phone: optionalString(input.phone),
      responseFormat,
    };
  }
  if (toolName === "auto_number") {
    return { kuaidiNum: requiredInputString(input.trackingNumber, "trackingNumber"), responseFormat };
  }
  if (toolName === "estimate_price") {
    return {
      kuaidicom: requiredInputString(input.carrier, "carrier"),
      sendAddr: requiredInputString(input.senderAddress, "senderAddress"),
      recAddr: requiredInputString(input.recipientAddress, "recipientAddress"),
      weight: String(input.weightKg),
      responseFormat,
    };
  }
  if (toolName === "order_price") {
    return {
      kuaidicom: optionalString(input.carrier),
      sendManPrintAddr: requiredInputString(input.senderAddress, "senderAddress"),
      recManPrintAddr: requiredInputString(input.recipientAddress, "recipientAddress"),
      weight: input.weightKg === undefined ? undefined : String(input.weightKg),
      serviceType: optionalString(input.serviceType),
      key: apiKey,
      responseFormat,
    };
  }
  if (toolName === "create_order") {
    const sender = optionalRecord(input.sender);
    const recipient = optionalRecord(input.recipient);
    return {
      kuaidicom: requiredInputString(input.carrier, "carrier"),
      sendManName: requiredInputString(sender?.name, "sender.name"),
      sendManMobile: requiredInputString(sender?.mobile, "sender.mobile"),
      sendManPrintAddr: requiredInputString(sender?.address, "sender.address"),
      recManName: requiredInputString(recipient?.name, "recipient.name"),
      recManMobile: requiredInputString(recipient?.mobile, "recipient.mobile"),
      recManPrintAddr: requiredInputString(recipient?.address, "recipient.address"),
      cargo: requiredInputString(input.itemName, "itemName"),
      weight: input.weightKg === undefined ? undefined : String(input.weightKg),
      payment: optionalString(input.payment),
      dayType: optionalString(input.pickupDay),
      pickupStartTime: optionalString(input.pickupStartTime),
      pickupEndTime: optionalString(input.pickupEndTime),
      remark: optionalString(input.remark),
      key: apiKey,
      responseFormat,
    };
  }
  if (toolName === "query_order") {
    const includeTracking = optionalBoolean(input.includeTracking);
    return {
      orderId: requiredInputString(input.orderId, "orderId"),
      includeTrace: includeTracking === undefined ? undefined : String(includeTracking),
      phone: optionalString(input.phone),
      key: apiKey,
      responseFormat,
    };
  }
  if (toolName === "cancel_order") {
    return {
      orderId: requiredInputString(input.orderId, "orderId"),
      cancelMsg: requiredInputString(input.reason, "reason"),
      key: apiKey,
      responseFormat,
    };
  }
  const mapped: Record<string, unknown> = {
    kuaidicom: requiredInputString(input.carrier, "carrier"),
    from: requiredInputString(input.origin, "origin"),
    to: requiredInputString(input.destination, "destination"),
    orderTime: optionalString(input.orderTime),
    responseFormat,
  };
  if (toolName === "estimate_time") mapped.expType = optionalString(input.productType);
  if (toolName === "estimate_time_with_logistic") mapped.logistic = JSON.stringify(input.trajectory);
  return mapped;
}

function normalizeKuaidi100Output(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { result: value };
  return value as Record<string, unknown>;
}

function withKuaidi100Client<T>(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: Kuaidi100Phase,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const endpoint = new URL(kuaidi100McpEndpoint);
  endpoint.searchParams.set("key", context.apiKey);
  return withMcpClient(
    {
      endpoint,
      transport: "streamable_http",
      fetcher: context.fetcher,
      headers: { responseFormat: "json", "user-agent": providerUserAgent },
      redirect: "manual",
      signal: context.signal,
      mapError: (error) => mapKuaidi100McpError(error, phase),
    },
    run,
  );
}

function mapKuaidi100McpError(error: unknown, phase: Kuaidi100Phase): unknown {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(502, "Kuaidi100 MCP request was unauthorized", { status: 401, phase });
  }
  if (error instanceof SdkHttpError) {
    const status = error.status;
    if (status === 401 || status === 403) {
      return new ProviderRequestError(502, `Kuaidi100 MCP request failed: ${error.message}`, { status, phase });
    }
    return new ProviderRequestError(
      400 <= status && status < 500 ? status : 502,
      `Kuaidi100 MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof ProtocolError) {
    return new ProviderRequestError(502, `Kuaidi100 MCP request failed: ${error.message}`, error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error ? `Kuaidi100 MCP request failed: ${error.message}` : "Kuaidi100 MCP request failed",
    error,
  );
}
