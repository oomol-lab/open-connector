import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment, queryParams } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "dixa";
const dixaApiBaseUrl = "https://dev.dixa.io";

type DixaActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const dixaActionHandlers: ProviderActionHandlers<"dixa", DixaActionHandler> = {
  list_agents(input, context) {
    return dixaGetWrappedList("/v1/agents", buildUserListQuery(input), context);
  },
  get_agent(input, context) {
    return dixaGetWrappedSingle(`/v1/agents/${encodePathSegment(requiredInputString(input.id, "id"))}`, context);
  },
  list_presence(_input, context) {
    return dixaGetUnwrappedList("/v1/agents/presence", context);
  },
  list_end_users(input, context) {
    return dixaGetWrappedList("/v1/endusers", buildEndUserListQuery(input), context);
  },
  get_end_user(input, context) {
    return dixaGetWrappedSingle(`/v1/endusers/${encodePathSegment(requiredInputString(input.id, "id"))}`, context);
  },
  get_conversation(input, context) {
    return dixaGetWrappedSingle(
      `/v1/conversations/${encodePathSegment(requiredConversationId(input.conversationId))}`,
      context,
    );
  },
  list_conversation_messages(input, context) {
    return dixaGetWrappedList(
      `/v1/conversations/${encodePathSegment(requiredConversationId(input.conversationId))}/messages`,
      {},
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, dixaActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await dixaGetJson(
      "/v1/agents",
      { pageLimit: "1" },
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
    );
    const response = requiredObject(payload, "Dixa validation response");
    const firstAgent = readFirstObject(response.data);
    const agentId = optionalString(firstAgent?.id);
    const displayName =
      optionalString(firstAgent?.displayName) ?? optionalString(firstAgent?.email) ?? "Dixa API Token";

    return {
      profile: {
        accountId: agentId ? `dixa:${agentId}` : "dixa:api-key",
        displayName,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: dixaApiBaseUrl,
        validationEndpoint: "/v1/agents",
        validationAgentId: agentId,
        validationAgentEmail: optionalString(firstAgent?.email),
        validationAgentDisplayName: optionalString(firstAgent?.displayName),
      },
    };
  },
};

async function dixaGetWrappedList(
  path: string,
  query: Record<string, string>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await dixaGetJson(path, query, context, "execute");
  const object = requiredObject(payload, "Dixa list response");
  if (!Array.isArray(object.data)) {
    throw new ProviderRequestError(502, "Dixa list response did not include data array", payload);
  }

  return {
    data: object.data,
    meta: optionalRecord(object.meta),
    raw: object,
  };
}

async function dixaGetUnwrappedList(path: string, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await dixaGetJson(path, {}, context, "execute");
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Dixa response did not include an array", payload);
  }

  return {
    data: payload,
    raw: { data: payload },
  };
}

async function dixaGetWrappedSingle(path: string, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await dixaGetJson(path, {}, context, "execute");
  const object = requiredObject(payload, "Dixa response");
  if (object.data == null || typeof object.data !== "object" || Array.isArray(object.data)) {
    throw new ProviderRequestError(502, "Dixa response did not include data object", payload);
  }

  return {
    data: object.data,
    raw: object,
  };
}

async function dixaGetJson(
  path: string,
  query: Record<string, string>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "validate" | "execute",
): Promise<unknown> {
  const url = new URL(path, dixaApiBaseUrl);
  for (const [name, value] of Object.entries(query)) {
    url.searchParams.set(name, value);
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: dixaHeaders(context.apiKey),
      signal: context.signal,
    });
    payload = await readDixaPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Dixa API request failed before receiving a response: ${error.message}`
        : "Dixa API request failed before receiving a response",
    );
  }

  if (!response.ok) {
    throw createDixaError(response, payload, phase);
  }
  return payload;
}

function dixaHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

function buildUserListQuery(input: Record<string, unknown>): Record<string, string> {
  return queryParams({
    pageLimit: optionalInteger(input.pageLimit),
    pageKey: optionalString(input.pageKey),
    email: optionalString(input.email),
    phone: optionalString(input.phone),
  });
}

function buildEndUserListQuery(input: Record<string, unknown>): Record<string, string> {
  return queryParams({
    pageLimit: optionalInteger(input.pageLimit),
    pageKey: optionalString(input.pageKey),
    email: optionalString(input.email),
    phone: optionalString(input.phone),
    externalId: optionalString(input.externalId),
  });
}

function requiredConversationId(value: unknown): string {
  const conversationId = optionalInteger(value);
  if (conversationId === undefined) {
    throw new ProviderRequestError(400, "conversationId must be an integer");
  }
  return String(conversationId);
}

function requiredObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${label} was not an object`, value);
  }
  return object;
}

function readFirstObject(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return optionalRecord(value[0]);
}

async function readDixaPayload(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Dixa API returned invalid JSON: ${error.message}` : "Dixa API returned invalid JSON",
    );
  }
}

function createDixaError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readDixaError(payload) ?? `Dixa API request failed with HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? response.status : 502, message, payload);
}

function readDixaError(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  return object ? optionalString(object.message) : undefined;
}
