import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { FlowiseaiActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "flowiseai";
const flowiseaiRequestTimeoutMs = 30_000;

type FlowiseaiRequestPhase = "validate" | "execute";
type FlowiseaiActionHandler = (input: Record<string, unknown>, context: FlowiseaiActionContext) => Promise<unknown>;
type FlowiseaiChatflowType = "CHATFLOW" | "MULTIAGENT";

interface FlowiseaiActionContext {
  apiKey: string;
  baseUrl: string;
  chatflowId?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface FlowiseaiChatflowResponse {
  id: string;
  name: string;
  flowData: string;
  deployed: boolean;
  isPublic: boolean;
  apiKeyId: string | null;
  chatbotConfig: string;
  apiConfig: string;
  analytic: string;
  speechToText: string;
  category: string | null;
  type: FlowiseaiChatflowType;
  createdDate: string;
  updatedDate: string;
}

interface FlowiseaiRequestInput {
  baseUrl: string;
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: FlowiseaiRequestPhase;
  signal?: AbortSignal;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}

export const flowiseaiActionHandlers: Record<FlowiseaiActionName, FlowiseaiActionHandler> = {
  async get_chatflow(_input, context) {
    const chatflow = normalizeChatflow(
      await requestFlowiseJson({
        baseUrl: context.baseUrl,
        apiKey: context.apiKey,
        path: `/chatflows/apikey/${encodeURIComponent(context.apiKey)}`,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );

    return { chatflow };
  },
  async send_message(input, context) {
    assertSendMessageInput(input);
    const payload = await requestFlowiseJson({
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
      path: `/prediction/${encodeURIComponent(requireActionChatflowId(context.chatflowId))}`,
      method: "POST",
      body: compactObject({
        question: optionalString(input.question),
        form: optionalRecord(input.form),
        overrideConfig: optionalRecord(input.overrideConfig),
        history: normalizeHistory(input.history),
        humanInput: normalizeHumanInput(input.humanInput),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return normalizePrediction(payload);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<FlowiseaiActionContext>({
  service,
  handlers: flowiseaiActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FlowiseaiActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeBaseUrl(credential.metadata.baseUrl ?? credential.values.baseUrl),
      chatflowId: optionalString(credential.metadata.chatflowId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const baseUrl = normalizeBaseUrl(input.values.baseUrl);
    const chatflow = normalizeChatflow(
      await requestFlowiseJson({
        baseUrl,
        apiKey: input.apiKey,
        path: `/chatflows/apikey/${encodeURIComponent(input.apiKey)}`,
        fetcher,
        signal,
        phase: "validate",
      }),
    );

    return {
      profile: {
        accountId: chatflow.id,
        displayName: chatflow.name || "FlowiseAI Chatflow API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        baseUrl,
        chatflowId: chatflow.id,
        chatflowName: chatflow.name,
        chatflowType: chatflow.type,
        deployed: chatflow.deployed,
        isPublic: chatflow.isPublic,
        apiKeyId: chatflow.apiKeyId ?? undefined,
        category: chatflow.category ?? undefined,
        validationEndpoint: "/chatflows/apikey/{apikey}",
      }),
    };
  },
};

async function requestFlowiseJson(input: FlowiseaiRequestInput): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(flowiseaiRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.fetcher(buildFlowiseUrl(input.baseUrl, input.path), {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal,
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw buildFlowiseError(response.status, payload, input.phase, input.path);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new ProviderRequestError(504, "FlowiseAI request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `FlowiseAI request failed: ${error.message}` : "FlowiseAI request failed",
      error,
    );
  }
}

function buildFlowiseUrl(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  const currentPath = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  const nextPath = path.startsWith("/") ? path : `/${path}`;
  url.pathname = `${currentPath}${nextPath}`;
  return url.toString();
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "FlowiseAI returned invalid JSON");
  }
}

function buildFlowiseError(
  status: number,
  payload: unknown,
  phase: FlowiseaiRequestPhase,
  path: string,
): ProviderRequestError {
  const message = readFlowiseErrorMessage(payload) ?? defaultFlowiseErrorMessage(status, path);

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 404) {
    return new ProviderRequestError(
      phase === "validate" ? 404 : 502,
      path.startsWith("/prediction/") ? "Configured FlowiseAI chatflow was not found" : message,
      payload,
    );
  }
  if (status === 400 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function defaultFlowiseErrorMessage(status: number, path: string): string {
  if (status === 404 && path.startsWith("/prediction/")) {
    return "Configured FlowiseAI chatflow was not found";
  }

  return `FlowiseAI request failed with status ${status}`;
}

function readFlowiseErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.errorMessage);
}

function normalizeChatflow(payload: unknown): FlowiseaiChatflowResponse {
  const record = readObject(payload, "chatflow response");
  const id = requireProviderString(record.id, "id");

  return {
    id,
    name: readProviderString(record.name, "name"),
    flowData: readProviderString(record.flowData, "flowData"),
    deployed: readProviderBoolean(record.deployed, "deployed"),
    isPublic: readProviderBoolean(record.isPublic, "isPublic"),
    apiKeyId: readNullableTrimmedString(record.apikeyid),
    chatbotConfig: readProviderString(record.chatbotConfig, "chatbotConfig"),
    apiConfig: readProviderString(record.apiConfig, "apiConfig"),
    analytic: readProviderString(record.analytic, "analytic"),
    speechToText: readProviderString(record.speechToText, "speechToText"),
    category: readNullableTrimmedString(record.category),
    type: readChatflowType(record.type),
    createdDate: readDateTime(record.createdDate, "createdDate"),
    updatedDate: readDateTime(record.updatedDate, "updatedDate"),
  };
}

function normalizePrediction(payload: unknown): Record<string, unknown> {
  const record = readObject(payload, "prediction response");

  return {
    text: readProviderString(record.text, "text"),
    json: readNullableObject(record.json),
    question: readNullableString(record.question),
    chatId: readNullableString(record.chatId),
    chatMessageId: readNullableString(record.chatMessageId),
    sessionId: readNullableString(record.sessionId),
    memoryType: readNullableString(record.memoryType),
    sourceDocuments:
      readNullableArray(record.sourceDocuments)?.map((entry, index) => normalizeSourceDocument(entry, index)) ?? null,
    usedTools: readNullableArray(record.usedTools)?.map((entry, index) => normalizeUsedTool(entry, index)) ?? null,
  };
}

function normalizeSourceDocument(value: unknown, index: number): Record<string, unknown> {
  const record = readObject(value, `sourceDocuments[${index}]`);
  const metadata = optionalRecord(record.metadata);

  return {
    pageContent: readProviderString(record.pageContent, `sourceDocuments[${index}].pageContent`),
    metadata: metadata ? stringifyRecordValues(metadata) : {},
  };
}

function normalizeUsedTool(value: unknown, index: number): Record<string, unknown> {
  const record = readObject(value, `usedTools[${index}]`);

  return {
    tool: readProviderString(record.tool, `usedTools[${index}].tool`),
    toolInput: optionalRecord(record.toolInput) ?? {},
    toolOutput: readProviderString(record.toolOutput, `usedTools[${index}].toolOutput`),
  };
}

function normalizeHistory(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((entry, index) => {
    const record = readObject(entry, `history[${index}]`);
    const role = requireProviderString(record.role, `history[${index}].role`, 400);
    if (role !== "apiMessage" && role !== "userMessage") {
      throw new ProviderRequestError(400, `history[${index}].role must be apiMessage or userMessage`);
    }

    return {
      role,
      content: readProviderString(record.content, `history[${index}].content`, 400),
    };
  });
}

function normalizeHumanInput(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const type = requireProviderString(record.type, "humanInput.type", 400);
  if (type !== "proceed" && type !== "reject") {
    throw new ProviderRequestError(400, "humanInput.type must be proceed or reject");
  }

  return compactObject({
    type,
    feedback: optionalString(record.feedback),
  });
}

function normalizeBaseUrl(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderRequestError(400, "baseUrl must be a valid http(s) URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must be a valid http(s) URL");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ProviderRequestError(400, "baseUrl must be a clean API root URL");
  }

  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.pathname === "/" ? url.origin : `${url.origin}${url.pathname}`;
}

function requireActionChatflowId(chatflowId: string | undefined): string {
  if (!chatflowId) {
    throw new ProviderRequestError(400, "chatflowId is required");
  }

  return chatflowId;
}

function assertSendMessageInput(input: Record<string, unknown>): void {
  if (input.question === undefined && input.form === undefined && input.humanInput === undefined) {
    throw new ProviderRequestError(400, "Provide at least one of question, form, or humanInput.");
  }
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return record;
}

function readProviderBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `${fieldName} must be a boolean`);
  }

  return value;
}

function requireProviderString(value: unknown, fieldName: string, status = 502): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(status, `${fieldName} must be a non-empty string`);
  }

  return parsed;
}

function readProviderString(value: unknown, fieldName: string, status = 502): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(status, `${fieldName} must be a string`);
  }

  return value;
}

function readNullableArray(value: unknown): unknown[] | null {
  if (value == null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "FlowiseAI array field must be an array");
  }

  return value;
}

function readNullableObject(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }

  return readObject(value, "FlowiseAI object field");
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function readNullableTrimmedString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function readDateTime(value: unknown, fieldName: string): string {
  const parsed = requireProviderString(value, fieldName);
  if (Number.isNaN(Date.parse(parsed))) {
    throw new ProviderRequestError(502, `${fieldName} must be an ISO date-time string`);
  }

  return parsed;
}

function readChatflowType(value: unknown): FlowiseaiChatflowType {
  const parsed = requireProviderString(value, "type");
  if (parsed !== "CHATFLOW" && parsed !== "MULTIAGENT") {
    throw new ProviderRequestError(502, "type must be CHATFLOW or MULTIAGENT");
  }

  return parsed;
}

function stringifyRecordValues(input: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value == null ? "" : String(value)]));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
