import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { DiscordbotActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment, jsonObject } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";

const service = "discordbot";
const discordApiBaseUrl = "https://discord.com/api";

interface DiscordbotContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type DiscordbotActionHandler = (input: Record<string, unknown>, context: DiscordbotContext) => Promise<unknown>;

export const discordbotActionHandlers: Record<DiscordbotActionName, DiscordbotActionHandler> = {
  test_auth(_input, context) {
    return testAuth(context);
  },
  get_my_application(_input, context) {
    return discordbotRequestJson({ path: "/applications/@me", context });
  },
  get_application(input, context) {
    return discordbotRequestJson({
      path: `/applications/${requiredPath(input.application_id, "application_id")}`,
      context,
    });
  },
  get_public_keys(_input, context) {
    return discordbotRequestJson({ path: "/oauth2/keys", context, authenticated: false });
  },
  get_gateway(_input, context) {
    return discordbotRequestJson({ path: "/gateway", context, authenticated: false });
  },
  get_bot_gateway(_input, context) {
    return discordbotRequestJson({ path: "/gateway/bot", context });
  },
  get_user(input, context) {
    return discordbotRequestJson({ path: `/users/${requiredPath(input.user_id, "user_id")}`, context });
  },
  get_guild(input, context) {
    return discordbotRequestJson({ path: `/guilds/${requiredPath(input.guild_id, "guild_id")}`, context });
  },
  list_guild_channels(input, context) {
    return discordbotRequestJson({
      path: `/guilds/${requiredPath(input.guild_id, "guild_id")}/channels`,
      context,
    }).then((channels) => ({ channels }));
  },
  list_guild_roles(input, context) {
    return discordbotRequestJson({ path: `/guilds/${requiredPath(input.guild_id, "guild_id")}/roles`, context }).then(
      (roles) => ({ roles }),
    );
  },
  get_channel(input, context) {
    return discordbotRequestJson({ path: `/channels/${requiredPath(input.channel_id, "channel_id")}`, context });
  },
  list_messages(input, context) {
    assertSingleCursor(input);
    return discordbotRequestJson({
      path: `/channels/${requiredPath(input.channel_id, "channel_id")}/messages`,
      query: jsonObject({
        around: optionalString(input.around),
        before: optionalString(input.before),
        after: optionalString(input.after),
        limit: optionalInteger(input.limit),
      }),
      context,
    }).then((messages) => ({ messages }));
  },
  create_message(input, context) {
    const body = jsonObject({
      content: optionalString(input.content),
      embeds: Array.isArray(input.embeds) ? input.embeds : undefined,
      components: Array.isArray(input.components) ? input.components : undefined,
      allowed_mentions: optionalRecord(input.allowed_mentions),
      message_reference: optionalRecord(input.message_reference),
      tts: optionalBoolean(input.tts),
      flags: optionalInteger(input.flags),
    });
    if (Object.keys(body).length === 0) {
      throw new ProviderRequestError(400, "create_message requires content, embeds, components, or message_reference");
    }
    return discordbotRequestJson({
      method: "POST",
      path: `/channels/${requiredPath(input.channel_id, "channel_id")}/messages`,
      body,
      context,
    }).then((message) => ({ message }));
  },
  async delete_message(input, context) {
    await discordbotRequest({
      method: "DELETE",
      path: `/channels/${requiredPath(input.channel_id, "channel_id")}/messages/${requiredPath(input.message_id, "message_id")}`,
      context,
    });
    return { success: true };
  },
  get_guild_widget_png(input, context) {
    return getGuildWidgetPng(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, discordbotActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: discordApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bot " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = { apiKey: input.apiKey, fetcher, signal };
    const application = optionalRecord(await discordbotRequestJson({ path: "/applications/@me", context }));
    const id = requiredString(application?.id, "application id", providerResponseError);
    const name = optionalString(application?.name) ?? "Discord Bot";
    return {
      profile: {
        accountId: id,
        displayName: name,
      },
      grantedScopes: [],
      metadata: jsonObject({
        application_id: id,
        application_name: name,
      }),
    };
  },
};

async function testAuth(context: DiscordbotContext): Promise<unknown> {
  const response = await discordbotRequest({ path: "/applications/@me", context, skipError: true });
  if (response.ok) {
    return { auth_ok: true, status_code: response.status };
  }
  return {
    auth_ok: false,
    status_code: response.status,
    error_body: await response.text().catch(() => ""),
  };
}

async function getGuildWidgetPng(input: Record<string, unknown>, context: DiscordbotContext): Promise<unknown> {
  const guildId = requiredString(input.guild_id, "guild_id", providerInputError);
  const response = await discordbotRequest({
    path: `/guilds/${encodePathSegment(guildId)}/widget.png`,
    query: jsonObject({ style: optionalString(input.style) }),
    context,
    authenticated: false,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    filename: `discord-guild-${guildId}-widget-${optionalString(input.style) ?? "shield"}.png`,
    mimeType: response.headers.get("content-type") ?? "image/png",
    sizeBytes: buffer.byteLength,
    dataBase64: buffer.toString("base64"),
  };
}

async function discordbotRequestJson(input: {
  method?: string;
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  context: DiscordbotContext;
  authenticated?: boolean;
}): Promise<unknown> {
  const response = await discordbotRequest(input);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Discord returned invalid JSON");
  }
}

async function discordbotRequest(input: {
  method?: string;
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  context: DiscordbotContext;
  authenticated?: boolean;
  skipError?: boolean;
}): Promise<Response> {
  const url = new URL(`${discordApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  const headers = new Headers();
  if (input.authenticated !== false) {
    headers.set("authorization", `Bot ${input.context.apiKey}`);
  }
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  const response = await input.context.fetcher(url, {
    method: input.method,
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.context.signal,
  });
  if (!input.skipError && !response.ok) {
    throw await toDiscordbotError(response, input.authenticated !== false);
  }
  return response;
}

async function toDiscordbotError(response: Response, authenticated: boolean): Promise<ProviderRequestError> {
  const text = await response.text().catch(() => "");
  let message = text;
  if (text) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      message =
        optionalString(parsed.message) ??
        optionalString(parsed.error_description) ??
        optionalString(parsed.error) ??
        text;
    } catch {}
  }
  const resolvedMessage = message || `Discord request failed with ${response.status}`;
  if (authenticated && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, resolvedMessage);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, resolvedMessage);
  }
  return new ProviderRequestError(response.status, resolvedMessage);
}

function assertSingleCursor(input: Record<string, unknown>): void {
  const count = [input.around, input.before, input.after].filter((value) => optionalString(value)).length;
  if (count > 1) {
    throw new ProviderRequestError(400, "list_messages accepts only one of around, before, or after");
  }
}

function requiredPath(value: unknown, field: string): string {
  return encodePathSegment(requiredString(value, field, providerInputError));
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
