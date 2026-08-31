import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { isAbortLikeError, providerUserAgent, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

const metasoApiBaseUrl = "https://metaso.cn/api/v1";

type MetasoActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type MetasoActionHandler = (input: Record<string, unknown>, context: MetasoActionContext) => Promise<unknown>;
type MetasoPhase = "validate" | "execute";
type MetasoChatStreamChunk = Record<string, unknown>;
type MetasoReaderFormat = "markdown" | "json";

export const metasoActionHandlers: ProviderActionHandlers<"metaso", MetasoActionHandler> = {
  search(input, context) {
    return requestMetasoJson("/search", buildSearchBody(input), context, "execute");
  },
  async read_webpage(input, context) {
    const format = readReaderFormat(input.format);
    const response = await requestMetaso(
      "/reader",
      {
        url: readRequiredUrl(input.url),
        format,
      },
      context,
      "execute",
      format === "markdown" ? "text/plain" : "application/json",
    );

    if (format === "markdown") {
      return response.text();
    }

    return readJson(response, "execute");
  },
  create_chat_completion(input, context) {
    return requestMetasoJson("/chat/completions", buildChatBody(input, false), context, "execute");
  },
  async create_chat_completion_stream(input, context) {
    const response = await requestMetaso(
      "/chat/completions",
      buildChatBody(input, true),
      context,
      "execute",
      "text/event-stream",
    );
    const chunks = await readMetasoJsonLines(response);

    return {
      chunks,
      finalChunk: chunks.at(-1) ?? null,
      combinedContent: combineStreamContent(chunks),
    };
  },
};

export async function validateMetasoCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestMetasoJson(
    "/search",
    {
      q: "metaso",
      scope: "webpage",
      size: 1,
      includeSummary: false,
      includeRawContent: false,
      conciseSnippet: false,
    },
    { apiKey: requiredInputString(apiKey, "apiKey"), fetcher, signal },
    "validate",
  );
  const searchParameters = optionalRecord(payload.searchParameters);

  return {
    profile: {
      accountId: "metaso",
      displayName: "Metaso API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/search",
      apiBaseUrl: metasoApiBaseUrl,
      credits: typeof payload.credits === "number" ? payload.credits : undefined,
      searchScope: typeof searchParameters?.scope === "string" ? searchParameters.scope : undefined,
    }),
  };
}

async function requestMetasoJson(
  path: string,
  body: Record<string, unknown>,
  context: MetasoActionContext,
  phase: MetasoPhase,
): Promise<Record<string, unknown>> {
  const response = await requestMetaso(path, body, context, phase, "application/json");
  return readJson(response, phase);
}

async function requestMetaso(
  path: string,
  body: Record<string, unknown>,
  context: MetasoActionContext,
  phase: MetasoPhase,
  accept: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await context.fetcher(`${metasoApiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${context.apiKey}`,
        accept,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(compactObject(body)),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortLikeError(error) ? 504 : 502,
      error instanceof Error ? `Metaso request failed: ${error.message}` : "Metaso request failed",
    );
  }

  await assertMetasoResponse(response, phase);
  return response;
}

async function assertMetasoResponse(response: Response, phase: MetasoPhase): Promise<void> {
  const parsed = await readMetasoErrorCandidate(response);
  if (response.ok && parsed.errCode === undefined) {
    return;
  }

  const message =
    parsed.errMsg ??
    parsed.message ??
    (response.ok ? "Metaso request failed" : `Metaso request failed with HTTP ${response.status}`);

  if (parsed.errCode === 2005) {
    throw new ProviderRequestError(phase === "validate" ? 400 : 401, message, parsed);
  }
  if (response.status === 429) {
    throw new ProviderRequestError(429, message, parsed);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, message, parsed);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(401, message, parsed);
  }
  if (response.status === 400 || response.status === 422) {
    throw new ProviderRequestError(400, message, parsed);
  }

  throw new ProviderRequestError(response.status || 502, message, parsed);
}

async function readJson(response: Response, phase: MetasoPhase): Promise<Record<string, unknown>> {
  try {
    const payload = (await response.json()) as unknown;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
  } catch {
    // Fall through to the normalized provider error below.
  }

  throw new ProviderRequestError(502, `Metaso returned a non-JSON response during ${phase}`);
}

async function readMetasoErrorCandidate(response: Response): Promise<{
  errCode?: number;
  errMsg?: string;
  message?: string;
}> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    const payload = (await response.clone().json()) as Record<string, unknown>;
    return {
      errCode: typeof payload.errCode === "number" ? payload.errCode : undefined,
      errMsg: typeof payload.errMsg === "string" ? payload.errMsg : undefined,
      message: typeof payload.message === "string" ? payload.message : undefined,
    };
  } catch {
    return {};
  }
}

async function readMetasoJsonLines(response: Response): Promise<MetasoChatStreamChunk[]> {
  const normalizedText = (await response.text()).replaceAll("\r\n", "\n");
  const chunks: MetasoChatStreamChunk[] = [];
  let dataLines: string[] = [];

  const flushEvent = (): void => {
    if (dataLines.length === 0) {
      return;
    }

    const jsonText = dataLines.join("\n");
    dataLines = [];
    parseMetasoStreamChunk(jsonText, chunks);
  };

  for (const line of normalizedText.split("\n")) {
    if (line === "") {
      flushEvent();
      continue;
    }
    if (line.startsWith(":")) {
      continue;
    }
    if (line === "[DONE]" || line.startsWith("{")) {
      parseMetasoStreamChunk(line, chunks);
      continue;
    }

    const separatorIndex = line.indexOf(":");
    const fieldName = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1);
    const fieldValue = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (fieldName === "data") {
      dataLines.push(fieldValue);
    }
  }

  flushEvent();
  return chunks;
}

function parseMetasoStreamChunk(jsonText: string, chunks: MetasoChatStreamChunk[]): void {
  if (!jsonText || jsonText === "[DONE]") {
    return;
  }

  try {
    const payload = JSON.parse(jsonText) as unknown;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      chunks.push(payload as MetasoChatStreamChunk);
    }
  } catch {
    throw new ProviderRequestError(502, "Metaso stream returned invalid JSON");
  }
}

function combineStreamContent(chunks: MetasoChatStreamChunk[]): string {
  let combinedContent = "";
  for (const chunk of chunks) {
    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    for (const choice of choices) {
      const record = optionalRecord(choice);
      const delta = optionalRecord(record?.delta);
      const content = typeof delta?.content === "string" ? delta.content : undefined;
      if (content) {
        combinedContent += content;
      }
    }
  }
  return combinedContent;
}

function buildSearchBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    q: requiredInputString(input.q, "q"),
    scope: normalizeScope(input.scope),
    includeSummary: optionalBoolean(input.includeSummary),
    includeRawContent: optionalBoolean(input.includeRawContent),
    size: readPositiveInteger(input.size, "size"),
    page: readPositiveInteger(input.page, "page"),
    conciseSnippet: optionalBoolean(input.conciseSnippet),
  });
}

function buildChatBody(input: Record<string, unknown>, stream: boolean): Record<string, unknown> {
  const requestedStream = optionalBoolean(input.stream);
  if (requestedStream !== undefined && requestedStream !== stream) {
    throw new ProviderRequestError(
      400,
      stream ? "stream=false is not supported by this action" : "stream=true is not supported by this action",
    );
  }

  return compactObject({
    model: optionalString(input.model),
    scope: normalizeScope(input.scope),
    conciseSnippet: optionalBoolean(input.conciseSnippet),
    stream,
    messages: normalizeMessages(input),
  });
}

function normalizeMessages(input: Record<string, unknown>): Array<{ role: string; content: string }> {
  if (Array.isArray(input.messages) && input.messages.length > 0) {
    return input.messages.map((message, index) => normalizeMessage(message, index));
  }

  const singleMessage = optionalString(input.message);
  if (singleMessage) {
    return [{ role: "user", content: singleMessage }];
  }

  throw new ProviderRequestError(400, "messages or message is required");
}

function normalizeMessage(value: unknown, index: number): { role: string; content: string } {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `messages[${index}] must be an object`);
  }

  const role = requiredInputString(record.role, `messages[${index}].role`);
  if (role !== "system" && role !== "user" && role !== "assistant") {
    throw new ProviderRequestError(400, `messages[${index}].role is invalid`);
  }

  return {
    role,
    content: requiredInputString(record.content, `messages[${index}].content`),
  };
}

function normalizeScope(value: unknown): string | undefined {
  const scope = optionalString(value);
  if (!scope) {
    return undefined;
  }
  if (
    scope === "webpage" ||
    scope === "document" ||
    scope === "paper" ||
    scope === "scholar" ||
    scope === "image" ||
    scope === "video" ||
    scope === "podcast"
  ) {
    return scope;
  }

  throw new ProviderRequestError(400, "scope is invalid");
}

function readReaderFormat(value: unknown): MetasoReaderFormat {
  const format = requiredInputString(value, "format");
  if (format === "markdown" || format === "json") {
    return format;
  }

  throw new ProviderRequestError(400, "format must be markdown or json");
}

function readRequiredUrl(value: unknown): string {
  const url = requiredInputString(value, "url");
  return assertPublicHttpUrl(url, {
    fieldName: "url",
    createError: (message) => new ProviderRequestError(400, message),
  }).toString();
}

function readPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }

  throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
}
