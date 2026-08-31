import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const sitespeakaiApiBaseUrl = "https://api.sitespeak.ai";
const sitespeakaiApiVersion = "v1";

type SitespeakaiRequestPhase = "validate" | "execute";
type SitespeakaiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const sitespeakaiActionHandlers: ProviderActionHandlers<"sitespeakai", SitespeakaiActionHandler> = {
  async get_current_user(_input, context) {
    const payload = await requestSitespeakai("/me", { method: "GET" }, context, "execute");
    const response = requireObjectRecord(payload, "SiteSpeakAI /me response");
    return {
      user: requireObjectRecord(response.user, "SiteSpeakAI user"),
    };
  },
  async list_chatbots(_input, context) {
    const payload = await requestSitespeakai("/me/chatbots", { method: "GET" }, context, "execute");
    return {
      chatbots: requireArray(payload, "SiteSpeakAI chatbots response"),
    };
  },
  async get_chatbot(input, context) {
    const chatbotId = requireTrimmedString(input.chatbot_id, "chatbot_id");
    const payload = await requestSitespeakai(
      `/${encodeURIComponent(chatbotId)}`,
      { method: "GET" },
      context,
      "execute",
    );
    return {
      chatbot: requireObjectRecord(payload, "SiteSpeakAI chatbot"),
    };
  },
  async list_sources(input, context) {
    return requestChatbotArrayFamily(input, context, "sources", "sources");
  },
  async list_suggested_messages(input, context) {
    return requestChatbotArrayFamily(input, context, "prompts", "prompts");
  },
  async list_conversations(input, context) {
    const chatbotId = requireTrimmedString(input.chatbot_id, "chatbot_id");
    const payload = await requestSitespeakai(
      buildSitespeakaiUrl(`/${encodeURIComponent(chatbotId)}/conversations`, {
        conversation_id: optionalString(input.conversation_id),
        include_deleted: optionalBoolean(input.include_deleted),
        include_sources: optionalBoolean(input.include_sources),
        limit: optionalInteger(input.limit),
        order: optionalString(input.order),
      }),
      { method: "GET" },
      context,
      "execute",
    );
    return {
      conversations: requireArray(payload, "SiteSpeakAI conversations response"),
    };
  },
  async list_leads(input, context) {
    return requestChatbotArrayFamily(input, context, "leads", "leads");
  },
  async query_chatbot(input, context) {
    const chatbotId = requireTrimmedString(input.chatbot_id, "chatbot_id");
    return requestSitespeakai(
      `/${encodeURIComponent(chatbotId)}/query`,
      {
        method: "POST",
        body: compactObject({
          prompt: requireTrimmedString(input.prompt, "prompt"),
          conversation_id: optionalString(input.conversation_id),
          format: optionalString(input.format),
        }),
      },
      context,
      "execute",
    );
  },
  async list_updated_answers(input, context) {
    return requestChatbotArrayFamily(input, context, "finetunes", "finetunes");
  },
  async upsert_updated_answer(input, context) {
    const chatbotId = requireTrimmedString(input.chatbot_id, "chatbot_id");
    return requestSitespeakai(
      `/${encodeURIComponent(chatbotId)}/finetunes`,
      {
        method: "POST",
        body: {
          question: requireTrimmedString(input.question, "question"),
          suggested_answer: requireTrimmedString(input.suggested_answer, "suggested_answer"),
        },
      },
      context,
      "execute",
    );
  },
  async delete_updated_answer(input, context) {
    const chatbotId = requireTrimmedString(input.chatbot_id, "chatbot_id");
    const finetuneId = requireTrimmedString(input.finetune_id, "finetune_id");
    return requestSitespeakai(
      `/${encodeURIComponent(chatbotId)}/finetunes/${encodeURIComponent(finetuneId)}`,
      { method: "DELETE" },
      context,
      "execute",
    );
  },
};

export async function validateSitespeakaiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestSitespeakai(
    "/me",
    { method: "GET" },
    {
      apiKey,
      fetcher,
      signal,
    },
    "validate",
  );
  const response = requireObjectRecord(payload, "SiteSpeakAI /me response");
  const user = requireObjectRecord(response.user, "SiteSpeakAI user");
  const userId = optionalString(user.id);
  const email = optionalString(user.email);
  const name = optionalString(user.name);
  const currentTeamId = optionalString(user.current_team_id);

  return {
    profile: {
      accountId: userId ?? email ?? "sitespeakai",
      displayName: email ?? name ?? "SiteSpeakAI API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: `${sitespeakaiApiBaseUrl}/${sitespeakaiApiVersion}`,
      validationEndpoint: "/me",
      userId,
      email,
      name,
      currentTeamId,
    }),
  };
}

async function requestChatbotArrayFamily(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  suffix: string,
  outputKey: string,
): Promise<Record<string, unknown>> {
  const chatbotId = requireTrimmedString(input.chatbot_id, "chatbot_id");
  const payload = await requestSitespeakai(
    `/${encodeURIComponent(chatbotId)}/${suffix}`,
    { method: "GET" },
    context,
    "execute",
  );
  return {
    [outputKey]: requireArray(payload, `SiteSpeakAI ${suffix} response`),
  };
}

function buildSitespeakaiUrl(path: string, query: Record<string, string | number | boolean | undefined>): URL {
  const url = new URL(`/${sitespeakaiApiVersion}${path}`, sitespeakaiApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function requestSitespeakai(
  pathOrUrl: string | URL,
  init: {
    method: "GET" | "POST" | "DELETE";
    body?: Record<string, unknown>;
  },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: SitespeakaiRequestPhase,
): Promise<unknown> {
  const url =
    pathOrUrl instanceof URL ? pathOrUrl : new URL(`/${sitespeakaiApiVersion}${pathOrUrl}`, sitespeakaiApiBaseUrl);

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: init.method,
      headers: sitespeakaiHeaders(context.apiKey, init.body ? { "content-type": "application/json" } : {}),
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: context.signal,
    });
    payload = await readSitespeakaiPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `SiteSpeakAI request failed: ${error.message}` : "SiteSpeakAI request failed",
    );
  }

  if (!response.ok) {
    throw createSitespeakaiError(response, payload, phase);
  }

  return payload;
}

function sitespeakaiHeaders(apiKey: string, extraHeaders: Record<string, string>): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function readSitespeakaiPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createSitespeakaiError(
  response: Response,
  payload: unknown,
  phase: SitespeakaiRequestPhase,
): ProviderRequestError {
  const message = extractSitespeakaiErrorMessage(payload) ?? response.statusText ?? "SiteSpeakAI request failed";

  if (response.status === 429 || response.status === 503) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function extractSitespeakaiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage = optionalString(record.message) ?? optionalString(record.error);
  if (directMessage) {
    return directMessage;
  }

  if (Array.isArray(record.errors) && record.errors.length > 0) {
    const firstError = record.errors[0];
    if (typeof firstError === "string" && firstError.trim()) {
      return firstError.trim();
    }
    const firstErrorRecord = optionalRecord(firstError);
    if (firstErrorRecord) {
      return optionalString(firstErrorRecord.message);
    }
  }

  return undefined;
}

function requireObjectRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }
  return value;
}

function requireTrimmedString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}
