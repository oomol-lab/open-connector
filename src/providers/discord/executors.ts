import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { DiscordActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment, jsonObject } from "../../core/request.ts";
import { defineOAuthProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";

const service = "discord";
const discordApiBaseUrl = "https://discord.com/api";

interface DiscordContext {
  accessToken: string;
  tokenType?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type DiscordActionHandler = (input: Record<string, unknown>, context: DiscordContext) => Promise<unknown>;

export const discordActionHandlers: Record<DiscordActionName, DiscordActionHandler> = {
  delete_my_application_role_connection(input, context) {
    return deleteMyApplicationRoleConnection(input, context);
  },
  get_current_user_application_entitlements(input, context) {
    return getCurrentUserApplicationEntitlements(input, context);
  },
  get_my_application_role_connection(input, context) {
    return getMyApplicationRoleConnection(input, context);
  },
  get_gateway(_input, context) {
    return discordRequestJson({ path: "/gateway", context, authenticated: false });
  },
  get_guild_template(input, context) {
    return discordRequestJson({
      path: `/guilds/templates/${requiredPath(input.code, "code")}`,
      context,
      authenticated: false,
    });
  },
  get_guild_widget(input, context) {
    return discordRequestJson({
      path: `/guilds/${requiredPath(input.guild_id, "guild_id")}/widget.json`,
      context,
      authenticated: false,
    });
  },
  get_guild_widget_png(input, context) {
    return getGuildWidgetPng(input, context);
  },
  get_invite(input, context) {
    return fetchInvite(
      normalizeInviteCode(requiredString(input.invite_code, "invite_code", providerInputError)),
      input,
      context,
    );
  },
  get_my_guild_member(input, context) {
    return discordRequestJson({
      path: `/users/@me/guilds/${requiredPath(input.guild_id, "guild_id")}/member`,
      context,
    });
  },
  get_my_oauth2_authorization(_input, context) {
    return discordRequestJson({ path: "/oauth2/@me", context });
  },
  get_my_user(_input, context) {
    return discordRequestJson({ path: "/users/@me", context });
  },
  get_openid_connect_userinfo(_input, context) {
    return discordRequestJson({ path: "/oauth2/userinfo", context });
  },
  get_public_keys(_input, context) {
    return discordRequestJson({ path: "/oauth2/keys", context, authenticated: false });
  },
  get_user(input, context) {
    if (input.user_id !== "@me") {
      throw new ProviderRequestError(
        400,
        "discord oauth provider only supports user_id=@me; other user ids belong in the bot provider",
      );
    }
    return discordRequestJson({ path: "/users/@me", context });
  },
  resolve_invite(input, context) {
    return fetchInvite(requiredString(input.code, "code", providerInputError), input, context);
  },
  list_my_connections(_input, context) {
    return discordRequestJson({ path: "/users/@me/connections", context }).then((connections) => ({ connections }));
  },
  list_my_guilds(input, context) {
    return discordRequestJson({
      path: "/users/@me/guilds",
      query: jsonObject({
        after: optionalString(input.after),
        before: optionalString(input.before),
        limit: optionalInteger(input.limit),
        with_counts: optionalBoolean(input.with_counts),
      }),
      context,
    }).then((guilds) => ({ guilds }));
  },
  list_sticker_packs(_input, context) {
    return discordRequestJson({ path: "/sticker-packs", context, authenticated: false });
  },
  update_my_application_role_connection(input, context) {
    return updateMyApplicationRoleConnection(input, context);
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, discordActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: discordApiBaseUrl,
  auth: { type: "oauth_bearer" },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const context: DiscordContext = {
      accessToken: input.accessToken,
      tokenType: input.tokenType,
      fetcher,
      signal,
    };
    const payload = await discordRequestJson({ path: "/users/@me", context });
    const user = optionalRecord(payload);
    const id = requiredString(user?.id, "discord current user id", providerResponseError);
    const username = requiredString(user?.username, "discord current user username", providerResponseError);
    const globalName = optionalString(user?.global_name);
    return {
      profile: {
        accountId: id,
        displayName: globalName ?? username,
      },
      grantedScopes: readGrantedScopes(input.metadata.scope),
      metadata: compactObject({
        id,
        username,
        global_name: globalName,
        avatar: optionalString(user?.avatar),
        locale: optionalString(user?.locale),
        email: optionalString(user?.email),
      }),
    };
  },
};

async function getCurrentUserApplicationEntitlements(
  input: Record<string, unknown>,
  context: DiscordContext,
): Promise<unknown> {
  const entitlements = await discordRequestJson({
    path: `/applications/${requiredPath(input.application_id, "application_id")}/entitlements`,
    query: jsonObject({
      exclude_ended: optionalBoolean(input.exclude_ended),
      exclude_deleted: optionalBoolean(input.exclude_deleted),
    }),
    context,
  });
  return { entitlements };
}

async function getMyApplicationRoleConnection(
  input: Record<string, unknown>,
  context: DiscordContext,
): Promise<unknown> {
  const roleConnection = await discordRequestJson({
    path: `/users/@me/applications/${requiredPath(input.application_id, "application_id")}/role-connection`,
    context,
  });
  return { role_connection: roleConnection };
}

async function updateMyApplicationRoleConnection(
  input: Record<string, unknown>,
  context: DiscordContext,
): Promise<unknown> {
  const roleConnection = await discordRequestJson({
    method: "PUT",
    path: `/users/@me/applications/${requiredPath(input.application_id, "application_id")}/role-connection`,
    body: compactObject({
      platform_name: optionalString(input.platform_name),
      platform_username: optionalString(input.platform_username),
      metadata: optionalRecord(input.metadata),
    }),
    context,
  });
  return { role_connection: roleConnection };
}

async function deleteMyApplicationRoleConnection(
  input: Record<string, unknown>,
  context: DiscordContext,
): Promise<unknown> {
  await discordRequest({
    method: "DELETE",
    path: `/users/@me/applications/${requiredPath(input.application_id, "application_id")}/role-connection`,
    context,
  });
  return { success: true };
}

async function getGuildWidgetPng(input: Record<string, unknown>, context: DiscordContext): Promise<unknown> {
  const guildId = requiredString(input.guild_id, "guild_id", providerInputError);
  const response = await discordRequest({
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

function fetchInvite(inviteCode: string, input: Record<string, unknown>, context: DiscordContext): Promise<unknown> {
  return discordRequestJson({
    path: `/invites/${encodePathSegment(inviteCode)}`,
    query: jsonObject({
      with_counts: optionalBoolean(input.with_counts),
      with_expiration: optionalBoolean(input.with_expiration),
      guild_scheduled_event_id: optionalString(input.guild_scheduled_event_id),
    }),
    context,
    authenticated: false,
  });
}

async function discordRequestJson(input: {
  method?: string;
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  context: DiscordContext;
  authenticated?: boolean;
}): Promise<unknown> {
  const response = await discordRequest(input);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Discord returned invalid JSON");
  }
}

async function discordRequest(input: {
  method?: string;
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  context: DiscordContext;
  authenticated?: boolean;
}): Promise<Response> {
  const url = new URL(`${discordApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  const authenticated = input.authenticated !== false;
  const headers = new Headers();
  if (authenticated) {
    headers.set("authorization", `${input.context.tokenType ?? "Bearer"} ${input.context.accessToken}`);
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
  if (!response.ok) {
    throw await toDiscordError(response, authenticated);
  }
  return response;
}

async function toDiscordError(response: Response, authenticated: boolean): Promise<ProviderRequestError> {
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

function requiredPath(value: unknown, field: string): string {
  return encodePathSegment(requiredString(value, field, providerInputError));
}

function normalizeInviteCode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, "invite code is required");
  }
  try {
    const url = new URL(trimmed);
    if (url.username || url.password) {
      throw new ProviderRequestError(400, "invite URL must not include credentials");
    }
    if (url.hostname === "discord.gg" || url.hostname === "www.discord.gg") {
      return requiredString(url.pathname.split("/").filter(Boolean)[0], "invite_code", providerInputError);
    }
    if (url.hostname === "discord.com" || url.hostname === "www.discord.com") {
      const segments = url.pathname.split("/").filter(Boolean);
      const inviteIndex = segments.findIndex((segment) => segment === "invite");
      if (inviteIndex >= 0) {
        return requiredString(segments[inviteIndex + 1], "invite_code", providerInputError);
      }
    }
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
  }
  return trimmed;
}

function readGrantedScopes(scope: unknown): string[] {
  return optionalString(scope)?.split(/\s+/u).filter(Boolean) ?? [];
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
