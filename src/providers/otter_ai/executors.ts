import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "otter_ai";
const otterAiApiBaseUrl = "https://api.otter.ai";
const otterAiValidationPath = "/v1/workspace";

type OtterAiRequestPhase = "validate" | "execute";
type OtterAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const otterAiActionHandlers: ProviderActionHandlers<"otter_ai", OtterAiActionHandler> = {
  async get_workspace(_input, context): Promise<unknown> {
    const payload = await requestOtterAi(context, otterAiUrl("/v1/workspace"), "execute");
    const wrapper = asOtterWrapper(payload, "Otter.ai workspace response");
    return {
      workspace: wrapper.data,
      meta: wrapper.meta,
    };
  },
  async list_channels(_input, context): Promise<unknown> {
    const payload = await requestOtterAi(context, otterAiUrl("/v1/channels"), "execute");
    const wrapper = asOtterWrapper(payload, "Otter.ai channels response");
    return {
      channels: requireOtterArray(wrapper.data, "Otter.ai channels data"),
      meta: wrapper.meta,
    };
  },
  async list_channel_members(input, context): Promise<unknown> {
    const channelId = requiredString(input.channelId, "channelId");
    const payload = await requestOtterAi(
      context,
      otterAiUrl(`/v1/channels/${encodeURIComponent(channelId)}/members`),
      "execute",
    );
    const wrapper = asOtterWrapper(payload, "Otter.ai channel members response");
    return {
      members: requireOtterArray(wrapper.data, "Otter.ai channel members data"),
      meta: wrapper.meta,
    };
  },
  async list_conversations(input, context): Promise<unknown> {
    const payload = await requestOtterAi(context, buildListConversationsUrl(input), "execute");
    const wrapper = asOtterWrapper(payload, "Otter.ai conversations response");
    const hasMore = wrapper.meta.has_more === true;
    const nextCursor = optionalString(wrapper.meta.next_cursor) ?? null;
    return {
      conversations: requireOtterArray(wrapper.data, "Otter.ai conversations data"),
      hasMore,
      nextCursor,
      meta: wrapper.meta,
    };
  },
  async get_conversation(input, context): Promise<unknown> {
    const payload = await requestOtterAi(context, buildGetConversationUrl(input), "execute");
    const wrapper = asOtterWrapper(payload, "Otter.ai conversation response");
    const conversation = requireOtterObject(wrapper.data, "Otter.ai conversation data");
    return {
      conversation,
      relationships: optionalRecord(conversation.relationships) ?? wrapper.relationships ?? {},
      meta: wrapper.meta,
    };
  },
  async get_conversation_audio(input, context): Promise<unknown> {
    const conversationId = requiredString(input.conversationId, "conversationId");
    const payload = await requestOtterAi(
      context,
      otterAiUrl(`/v1/conversations/${encodeURIComponent(conversationId)}/audio`),
      "execute",
    );
    const wrapper = asOtterWrapper(payload, "Otter.ai conversation audio response");
    const audio = requireOtterObject(wrapper.data, "Otter.ai conversation audio data");
    return {
      audioUrl: requireOtterString(audio.url, "Otter.ai conversation audio URL"),
      audio,
      meta: wrapper.meta,
      raw: payload,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, otterAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateOtterAiApiKey(input.apiKey, fetcher, signal);
  },
};

/**
 * Validate an Otter.ai API key and return the workspace identity represented by it.
 */
export async function validateOtterAiApiKey(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestOtterAi({ apiKey, fetcher, signal }, otterAiUrl(otterAiValidationPath), "validate");
  const wrapper = asOtterWrapper(payload, "Otter.ai workspace response");
  const workspace = optionalRecord(wrapper.data);
  const owner = optionalRecord(workspace?.owner);
  const workspaceName = optionalString(workspace?.name);
  const workspaceId = idToString(workspace?.id);
  const ownerEmail = optionalString(owner?.email);
  const displayName = workspaceName ?? ownerEmail ?? workspaceId ?? "Otter.ai API Key";

  return {
    profile: {
      accountId: workspaceId ?? ownerEmail ?? "api_key",
      displayName,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: otterAiApiBaseUrl,
      validationEndpoint: otterAiValidationPath,
      workspaceId,
      workspaceName,
      ownerEmail,
    }),
  };
}

function buildListConversationsUrl(input: Record<string, unknown>): URL {
  return otterAiUrl(
    "/v1/conversations",
    compactObject({
      include_shared: optionalBoolean(input.includeShared),
      channel_id: optionalString(input.channelId),
      limit: optionalInteger(input.limit),
      cursor: optionalString(input.cursor),
    }),
  );
}

function buildGetConversationUrl(input: Record<string, unknown>): URL {
  const conversationId = requiredString(input.conversationId, "conversationId");
  if (!Array.isArray(input.include)) {
    throw new ProviderRequestError(400, "include must be an array");
  }
  return otterAiUrl(`/v1/conversations/${encodeURIComponent(conversationId)}`, {
    include: input.include.map((value) => String(value)).join(","),
  });
}

function otterAiUrl(path: string, query?: Record<string, unknown>): URL {
  const url = new URL(path, otterAiApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function requestOtterAi(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  url: URL,
  phase: OtterAiRequestPhase,
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: otterAiHeaders(context.apiKey),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Otter.ai request failed: ${error.message}` : "Otter.ai request failed",
    );
  }

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw otterAiError(response.status, errorMessageFromText(text, response.status), phase);
  }

  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "invalid Otter.ai response");
  }
}

function otterAiHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

function otterAiError(status: number, message: string, phase: OtterAiRequestPhase): ProviderRequestError {
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status, message);
}

function errorMessageFromText(text: string, status: number): string {
  const fallbackMessage = `Otter.ai request failed with status ${status}`;
  if (!text) {
    return fallbackMessage;
  }

  try {
    const payload = JSON.parse(text) as unknown;
    const record = optionalRecord(payload);
    return (
      optionalString(record?.detail) ??
      optionalString(record?.message) ??
      optionalString(record?.error) ??
      fallbackMessage
    );
  } catch {
    return fallbackMessage;
  }
}

function asOtterWrapper(
  payload: unknown,
  label: string,
): { data: unknown; meta: Record<string, unknown>; relationships?: Record<string, unknown> } {
  const record = optionalRecord(payload);
  const meta = optionalRecord(record?.meta);
  if (!record || !meta || !("data" in record)) {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }

  return {
    data: record.data,
    meta,
    relationships: optionalRecord(record.relationships),
  };
}

function idToString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return undefined;
}

function requireOtterArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  return value;
}

function requireOtterObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  return record;
}

function requireOtterString(value: unknown, label: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  return text;
}
