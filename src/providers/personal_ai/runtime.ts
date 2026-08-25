import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  nullableString,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const personalAiApiBaseUrl = "https://api.personal.ai";

type PersonalAiMode = "validate" | "execute";
type PersonalAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const personalAiActionHandlers: ProviderActionHandlers<"personal_ai", PersonalAiActionHandler> = {
  async send_message(input, context) {
    const payload = await requestPersonalAiJson(
      "/v1/message",
      context,
      {
        method: "POST",
        body: buildMessageBody(input),
      },
      "execute",
    );

    return normalizeMessageResponse(payload);
  },
  async send_instruction(input, context) {
    const command = readRequiredString(input.command, "command");
    const payload = await requestPersonalAiJson(
      `/v1/instruction?cmd=${encodeURIComponent(command)}`,
      context,
      {
        method: "POST",
        body: buildInstructionBody(input),
      },
      "execute",
    );

    return normalizeMessageResponse(payload);
  },
  async upload_memory(input, context) {
    const payload = await requestPersonalAiJson(
      "/v1/memory",
      context,
      {
        method: "POST",
        body: buildMemoryBody(input),
      },
      "execute",
    );

    return normalizeMemoryResponse(payload);
  },
  async upload_text_document(input, context) {
    const payload = await requestPersonalAiJson(
      "/v1/upload-text",
      context,
      {
        method: "POST",
        body: buildUploadTextBody(input),
      },
      "execute",
    );

    return normalizeUploadStatusResponse(payload);
  },
  async upload_url(input, context) {
    const payload = await requestPersonalAiJson(
      "/v1/upload-url",
      context,
      {
        method: "POST",
        body: buildUploadUrlBody(input),
      },
      "execute",
    );

    return normalizeUploadStatusResponse(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("personal_ai", personalAiActionHandlers);

export async function validatePersonalAiCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = readRequiredString(input.apiKey, "apiKey");
  const domainName = readRequiredString(input.domainName, "domainName");
  await requestPersonalAiJson(
    "/v1/message",
    { apiKey, fetcher },
    {
      method: "POST",
      body: {
        Text: "Hello",
        DomainName: domainName,
        SourceName: "oomol-connect",
        is_draft: true,
      },
    },
    "validate",
  );

  return {
    profile: {
      accountId: domainName,
      displayName: domainName,
      grantedScopes: [],
    },
    metadata: {
      domainName,
      apiBaseUrl: personalAiApiBaseUrl,
      validationEndpoint: "/v1/message",
    },
  };
}

async function requestPersonalAiJson(
  pathAndQuery: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  request: {
    method: "POST";
    body: Record<string, unknown>;
  },
  mode: PersonalAiMode,
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(buildPersonalAiUrl(pathAndQuery), {
      method: request.method,
      headers: personalAiHeaders(context.apiKey),
      body: JSON.stringify(request.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `personal_ai request failed: ${error.message}` : "personal_ai request failed",
    );
  }

  const payload = await readPersonalAiPayload(response);
  if (!response.ok) {
    throw mapPersonalAiError(response, payload, mode);
  }
  if (payload === undefined || typeof payload === "string") {
    throw new ProviderRequestError(502, "personal_ai returned invalid JSON");
  }

  return payload;
}

function buildPersonalAiUrl(pathAndQuery: string): string {
  const normalizedPath = pathAndQuery.startsWith("/") ? pathAndQuery.slice(1) : pathAndQuery;
  return new URL(normalizedPath, `${personalAiApiBaseUrl}/`).toString();
}

function personalAiHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

function mapPersonalAiError(response: Response, payload: unknown, mode: PersonalAiMode): ProviderRequestError {
  const message = readPersonalAiErrorMessage(payload) ?? `personal_ai request failed with ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if ((response.status === 401 || response.status === 403) && mode === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if ((response.status === 401 || response.status === 403) && mode === "execute") {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function buildMessageBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    Text: readRequiredString(input.text, "text"),
    Context: optionalString(input.context),
    DomainName: readRequiredString(input.domainName, "domainName"),
    UserName: optionalString(input.userName),
    SessionId: optionalString(input.sessionId),
    Events: optionalString(input.events),
    SourceName: optionalString(input.sourceName),
    is_stack: optionalBoolean(input.isStack),
    is_draft: optionalBoolean(input.isDraft),
    Metadata: optionalRecord(input.metadata),
  });
}

function buildInstructionBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    Text: readRequiredString(input.text, "text"),
    Context: optionalString(input.context),
    DomainName: readRequiredString(input.domainName, "domainName"),
    UserName: optionalString(input.userName),
    SessionId: optionalString(input.sessionId),
    SourceName: optionalString(input.sourceName),
    is_message: optionalBoolean(input.isMessage),
  });
}

function buildMemoryBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    Text: readRequiredString(input.text, "text"),
    CreatedTime: optionalString(input.createdTime),
    SourceName: readRequiredString(input.sourceName, "sourceName"),
    RawFeedText: optionalString(input.rawFeedText),
    DomainName: readRequiredString(input.domainName, "domainName"),
    Tags: optionalString(input.tags),
  });
}

function buildUploadTextBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    Text: readRequiredString(input.text, "text"),
    Title: optionalString(input.title),
    StartTime: optionalString(input.startTime),
    EndTime: optionalString(input.endTime),
    DomainName: readRequiredString(input.domainName, "domainName"),
    Tags: optionalString(input.tags),
    is_stack: optionalBoolean(input.isStack),
  });
}

function buildUploadUrlBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    Url: readRequiredString(input.url, "url"),
    Title: optionalString(input.title),
    DomainName: readRequiredString(input.domainName, "domainName"),
    Tags: optionalString(input.tags),
    is_stack: optionalBoolean(input.isStack),
    StartTime: optionalString(input.startTime),
    EndTime: optionalString(input.endTime),
  });
}

function normalizeMessageResponse(payload: unknown): Record<string, unknown> {
  const root = readPersonalAiObject(payload, "message response");
  return {
    aiMessage: String(root.ai_message ?? ""),
    aiScore: optionalNumber(root.ai_score) ?? null,
    aiName: nullableString(root.ai_name) ?? null,
    aiPicture: nullableString(root.ai_picture) ?? null,
    sessionId: nullableString(root.SessionId) ?? null,
    sourceApp: nullableString(root.source_app) ?? null,
    raw: root,
  };
}

function normalizeUploadStatusResponse(payload: unknown): Record<string, unknown> {
  const root = readPersonalAiObject(payload, "upload response");
  return {
    message: String(root.message ?? ""),
    raw: root,
  };
}

function normalizeMemoryResponse(payload: unknown): Record<string, unknown> {
  const root = readPersonalAiObject(payload, "memory response");
  return {
    type: nullableString(root.type) ?? null,
    memories: readMemoryItems(root),
    raw: root,
  };
}

function readMemoryItems(root: Record<string, unknown>): Array<Record<string, unknown>> {
  const items: unknown[] = [];
  for (const payloadItem of Array.isArray(root.payload) ? root.payload : []) {
    const payloadRecord = optionalRecord(payloadItem);
    if (!payloadRecord || !Array.isArray(payloadRecord.data)) {
      continue;
    }
    items.push(...payloadRecord.data);
  }

  return items.map((item) => {
    const memory = optionalRecord(item) ?? {};
    const { start_time_utc: startTimeUtcValue, ...memoryWithoutUpstreamTime } = memory;
    return {
      ...memoryWithoutUpstreamTime,
      startTimeUtc: nullableString(startTimeUtcValue) ?? null,
    };
  });
}

async function readPersonalAiPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (text.trim() === "") {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readPersonalAiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const root = optionalRecord(payload);
  return optionalString(root?.detail);
}

function readPersonalAiObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `personal_ai returned invalid ${label}`);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}
