import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "bot_star";
const botStarApiBaseUrl = "https://apis.botstar.com/v1";
const botStarRequestBaseUrl = "https://apis.botstar.com/v1/";
const botStarValidationPath = "/bots/";

type BotStarPhase = "validate" | "execute";
type BotStarQueryValue = boolean | number | string | undefined;
type BotStarActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface BotStarRequestInput {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  path: string;
  method?: string;
  query?: Record<string, BotStarQueryValue>;
  body?: Record<string, unknown>;
  phase?: BotStarPhase;
}

export const botStarActionHandlers: ProviderActionHandlers<"bot_star", BotStarActionHandler> = {
  async list_bots(_input, context) {
    return { bots: await botStarRequest({ ...context, path: "/bots/" }) };
  },
  async create_bot(input, context) {
    return {
      bot: await botStarRequest({
        ...context,
        path: "/bots/",
        method: "POST",
        body: pickBody(input, ["name"]),
      }),
    };
  },
  async get_bot(input, context) {
    return {
      bot: await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}`,
      }),
    };
  },
  async list_bot_attributes(input, context) {
    return {
      attributes: await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/attributes`,
        query: pickQuery(input, ["env"]),
      }),
    };
  },
  async create_bot_attribute(input, context) {
    return {
      attribute: await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/attributes`,
        method: "POST",
        query: pickQuery(input, ["env"]),
        body: buildBotAttributeBody(input, ["name", "data_type", "desc", "value"]),
      }),
    };
  },
  async update_bot_attribute(input, context) {
    return {
      attribute: await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/attributes/${encodeURIComponent(readRequiredString(input, "attributeId"))}`,
        method: "PATCH",
        query: pickQuery(input, ["env"]),
        body: buildBotAttributeBody(input, ["desc", "value"]),
      }),
    };
  },
  async delete_bot_attribute(input, context) {
    await botStarRequest({
      ...context,
      path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/attributes/${encodeURIComponent(readRequiredString(input, "attributeId"))}`,
      method: "DELETE",
      query: pickQuery(input, ["env"]),
    });
    return { success: true, status: "success" };
  },
  async publish_bot(input, context) {
    return normalizeSuccess(
      await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/publish`,
        method: "POST",
      }),
    );
  },
  async get_user(input, context) {
    return {
      user: await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/users/${encodeURIComponent(readRequiredString(input, "userId"))}`,
      }),
    };
  },
  async update_user_attributes(input, context) {
    return {
      attributes: await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/users/${encodeURIComponent(readRequiredString(input, "userId"))}`,
        method: "PATCH",
        body: readRequiredObject(input, "attributes"),
      }),
    };
  },
  async create_user_attribute(input, context) {
    return {
      attribute: await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/users/attributes`,
        method: "POST",
        body: pickBody(input, ["field_name", "field_type"]),
      }),
    };
  },
  async list_cms_entities(input, context) {
    return {
      entities: await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/cms_entities`,
        query: pickQuery(input, ["env"]),
      }),
    };
  },
  async create_cms_entity(input, context) {
    return {
      entity: await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/cms_entities`,
        method: "POST",
        query: pickQuery(input, ["env"]),
        body: pickBody(input, ["name", "fields"]),
      }),
    };
  },
  async get_cms_entity(input, context) {
    return {
      entity: await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/cms_entities/${encodeURIComponent(readRequiredString(input, "entityId"))}`,
        query: pickQuery(input, ["env"]),
      }),
    };
  },
  async update_cms_entity(input, context) {
    return normalizeSuccess(
      await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/cms_entities/${encodeURIComponent(readRequiredString(input, "entityId"))}`,
        method: "PATCH",
        query: pickQuery(input, ["env"]),
        body: pickBody(input, ["name"]),
      }),
    );
  },
  async delete_cms_entity(input, context) {
    return normalizeSuccess(
      await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/cms_entities/${encodeURIComponent(readRequiredString(input, "entityId"))}`,
        method: "DELETE",
        query: pickQuery(input, ["env"]),
      }),
    );
  },
  async list_cms_entity_items(input, context) {
    return {
      items: await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/cms_entities/${encodeURIComponent(readRequiredString(input, "entityId"))}/items`,
        query: pickQuery(input, ["env", "page", "limit", "name", "status"]),
      }),
    };
  },
  async create_cms_entity_item(input, context) {
    return {
      item: await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/cms_entities/${encodeURIComponent(readRequiredString(input, "entityId"))}/items`,
        method: "POST",
        query: pickQuery(input, ["env"]),
        body: buildEntityItemBody(input, ["name", "status"]),
      }),
    };
  },
  async get_cms_entity_item(input, context) {
    return {
      item: await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/cms_entities/${encodeURIComponent(readRequiredString(input, "entityId"))}/items/${encodeURIComponent(readRequiredString(input, "entityItemId"))}`,
        query: pickQuery(input, ["env"]),
      }),
    };
  },
  async update_cms_entity_item(input, context) {
    return normalizeSuccess(
      await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/cms_entities/${encodeURIComponent(readRequiredString(input, "entityId"))}/items/${encodeURIComponent(readRequiredString(input, "entityItemId"))}`,
        method: "PATCH",
        query: pickQuery(input, ["env"]),
        body: buildEntityItemBody(input, ["name", "status"]),
      }),
    );
  },
  async delete_cms_entity_item(input, context) {
    return normalizeSuccess(
      await botStarRequest({
        ...context,
        path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}/cms_entities/${encodeURIComponent(readRequiredString(input, "entityId"))}/items/${encodeURIComponent(readRequiredString(input, "entityItemId"))}`,
        method: "DELETE",
        query: pickQuery(input, ["env"]),
      }),
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, botStarActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiKey = input.apiKey.trim();
    if (!apiKey) {
      throw new ProviderRequestError(400, "bot_star api token is required");
    }

    const bots = await botStarRequest({
      path: botStarValidationPath,
      apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    const firstBot = Array.isArray(bots) ? optionalRecord(bots[0]) : undefined;
    const firstBotId = readOptionalString(firstBot?.id);
    const firstBotName = readOptionalString(firstBot?.name);
    const firstTeamName = readOptionalString(firstBot?.team_name);

    return {
      profile: {
        accountId: firstBotId ?? "bot_star",
        displayName: firstTeamName ?? firstBotName ?? firstBotId ?? "BotStar API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: botStarApiBaseUrl,
        validationEndpoint: botStarValidationPath,
        firstBotId,
        firstBotName,
        firstTeamName,
      }),
    };
  },
};

async function botStarRequest(input: BotStarRequestInput): Promise<unknown> {
  const url = new URL(input.path.replace(/^\//, ""), botStarRequestBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.signal);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: botStarHeaders(input.apiKey),
      signal: timeout.signal,
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
    payload = await readBotStarPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      timeout.didTimeout() && isAbortLikeError(error) ? 504 : 502,
      timeout.didTimeout()
        ? "BotStar request timed out"
        : error instanceof Error
          ? `BotStar request failed: ${error.message}`
          : "BotStar request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createBotStarError(response, payload, input.phase ?? "execute");
  }

  return payload;
}

function botStarHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readBotStarPayload(response: Response): Promise<unknown> {
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

function createBotStarError(response: Response, payload: unknown, phase: BotStarPhase): ProviderRequestError {
  const message = extractBotStarErrorMessage(payload) ?? response.statusText ?? "BotStar request failed";
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractBotStarErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  return (
    readOptionalString(object?.message) ??
    readOptionalString(object?.error) ??
    (typeof payload === "string" && payload.trim() ? payload : undefined)
  );
}

function pickQuery(input: Record<string, unknown>, keys: string[]): Record<string, BotStarQueryValue> {
  const query: Record<string, BotStarQueryValue> = {};
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      query[key] = value;
    }
  }
  return query;
}

function pickBody(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined) {
      body[key] = value;
    }
  }
  return body;
}

function buildBotAttributeBody(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return {
    ...readOptionalObject(input.localizedValues),
    ...pickBody(input, keys),
  };
}

function buildEntityItemBody(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const data = readOptionalObject(input.data);
  for (const key of ["name", "status"]) {
    if (Object.hasOwn(data, key)) {
      throw new ProviderRequestError(400, `data.${key} conflicts with an explicit CMS item field.`);
    }
  }
  return {
    ...data,
    ...pickBody(input, keys),
  };
}

function normalizeSuccess(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload);
  const status = readOptionalString(object?.status) ?? "success";
  return {
    success: status === "success" || status === "ok",
    status,
  };
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  return requiredString(input[key], key, providerInputError);
}

function readRequiredObject(input: Record<string, unknown>, key: string): Record<string, unknown> {
  return requiredRecord(input[key], `${key} object`, providerInputError);
}

function readOptionalObject(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function readOptionalString(value: unknown): string | undefined {
  const string = optionalString(value);
  return string && string.trim() ? string : undefined;
}
