import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const chatpdfApiBaseUrl = "https://api.chatpdf.com/v1";

type ChatpdfActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface ChatpdfRequestInput {
  path: string;
  body: Record<string, unknown>;
  context: ApiKeyProviderContext;
}

export const chatpdfActionHandlers: ProviderActionHandlers<"chatpdf", ChatpdfActionHandler> = {
  async add_source_url(input, context): Promise<unknown> {
    const payload = await requestChatpdf({
      path: "/sources/add-url",
      body: { url: input.url },
      context,
    });
    const record = requireObject(payload, "ChatPDF add source response must be an object");
    return {
      sourceId: requireString(record.sourceId, "ChatPDF add source response requires sourceId"),
    };
  },

  async chat(input, context): Promise<unknown> {
    const payload = await requestChatpdf({
      path: "/chats/message",
      body: {
        sourceId: input.sourceId,
        messages: input.messages,
        referenceSources: input.referenceSources,
      },
      context,
    });
    const record = requireObject(payload, "ChatPDF chat response must be an object");
    return {
      content: requireString(record.content, "ChatPDF chat response requires content"),
      references: record.references,
    };
  },

  async delete_sources(input, context): Promise<unknown> {
    await requestChatpdf({
      path: "/sources/delete",
      body: { sources: input.sources },
      context,
    });
    return {
      deletedSources: input.sources,
    };
  },
};

export function validateChatpdfCredential(_apiKey: string): CredentialValidationResult {
  return {
    profile: {
      accountId: "api_key",
      displayName: "ChatPDF API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: chatpdfApiBaseUrl,
      validationMode: "format_only",
    },
  };
}

async function requestChatpdf(input: ChatpdfRequestInput): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(new URL(`${chatpdfApiBaseUrl}${input.path}`), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.context.apiKey,
      },
      body: JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ChatPDF request failed: ${error.message}` : "ChatPDF request failed",
    );
  }

  const payload = await readChatpdfPayload(response);
  if (response.ok) {
    return payload;
  }
  throw createChatpdfError(response, payload);
}

async function readChatpdfPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createChatpdfError(response: Response, payload: unknown): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? (response.statusText || "ChatPDF request failed");
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.message) ?? optionalString(record.error);
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, message);
  }
  return value;
}
