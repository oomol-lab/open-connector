import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { DiscordbotActionHandler, DiscordbotContext } from "./runtime.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import {
  combineProviderActionHandlers,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerResponseError,
} from "../provider-runtime.ts";
import { guildActionHandlers } from "./runtime-guilds.ts";
import {
  discordApiBaseUrl,
  discordbotRequest,
  discordbotRequestJson,
  discordbotRequestNoContent,
  requiredPath,
} from "./runtime.ts";

const service = "discordbot";

const coreActionHandlers: ProviderActionHandlerSubset<"discordbot", DiscordbotActionHandler> = {
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
  delete_message(input, context) {
    return discordbotRequestNoContent({
      method: "DELETE",
      path: `/channels/${requiredPath(input.channel_id, "channel_id")}/messages/${requiredPath(input.message_id, "message_id")}`,
      context,
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  combineProviderActionHandlers<"discordbot", DiscordbotActionHandler>(
    service,
    coreActionHandlers,
    guildActionHandlers,
  ),
);

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

function assertSingleCursor(input: Record<string, unknown>): void {
  const count = [input.around, input.before, input.after].filter((value) => optionalString(value)).length;
  if (count > 1) {
    throw new ProviderRequestError(400, "list_messages accepts only one of around, before, or after");
  }
}
