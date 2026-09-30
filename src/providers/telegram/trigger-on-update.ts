import type { IntegrationDefinition, IntegrationReconcileContext } from "../../triggers/common/integration.ts";
import type { ConnectorProxyResult } from "../../triggers/common/proxy.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import {
  IntegrationConnectionError,
  PermanentIntegrationError,
  TransientIntegrationError,
} from "../../triggers/common/integration.ts";
import { snapshot, updateTypes } from "./trigger-on-update.definition.ts";

interface Config {
  readonly chatIds: readonly string[];
  readonly dropPendingUpdates: boolean;
  readonly updates: readonly string[];
  readonly userIds: readonly string[];
}

interface TelegramEnvelope {
  readonly description?: string;
  readonly ok?: boolean;
  readonly result?: { readonly url?: string } | boolean;
}

const optInUpdates = new Set(["chat_member", "message_reaction", "message_reaction_count"]);

const defaultUpdates = updateTypes.filter((value) => value != "*" && !optInUpdates.has(value));

export const telegramUpdate: IntegrationDefinition = {
  snapshot,
  receive(context) {
    if (!sameSecret(context.header("x-telegram-bot-api-secret-token"), context.callbackSecret)) {
      return { body: "", contentType: "text/plain", outcome: "respond", status: 404 };
    }
    if (!isRecord(context.payload) || !Number.isSafeInteger(context.payload.update_id)) {
      return { outcome: "ignored", reason: "Telegram update_id is missing." };
    }
    const event = Object.keys(context.payload).find((key) => key != "update_id");
    if (event == null) return { outcome: "ignored", reason: "Telegram update body is missing." };
    const config = resolveConfig(context.config);
    const subscribed = subscribedUpdates(config) ?? defaultUpdates;
    if (!subscribed.includes(event)) return { outcome: "ignored", reason: "Telegram update type is not subscribed." };
    const update = context.payload[event];
    if (config.chatIds.length > 0) {
      const chatId = resolveChatId(update);
      if (chatId == null || !config.chatIds.includes(chatId))
        return { outcome: "ignored", reason: "Telegram chat does not match." };
    }
    if (config.userIds.length > 0) {
      const userId = resolveUserId(update);
      if (userId == null || !config.userIds.includes(userId))
        return { outcome: "ignored", reason: "Telegram user does not match." };
    }
    const deliveryId = String(context.payload.update_id);
    return {
      dedupeKey: deliveryId,
      outcome: "event",
      outputs: { body: context.payload as Readonly<Record<string, JsonValue>>, deliveryId, event },
    };
  },
  async reconcile(context) {
    const current = await webhookUrl(context);
    if (!context.active) {
      if (current == context.endpointUrl) await deleteWebhook(context);
      return { outcome: "ready" };
    }
    if (current != "" && current != context.endpointUrl) {
      throw new PermanentIntegrationError(`The Telegram bot already sends updates to ${host(current)}.`);
    }
    const config = resolveConfig(context.config);
    await request(context, "setWebhook", {
      allowed_updates: subscribedUpdates(config) ?? [],
      drop_pending_updates: current == "" && config.dropPendingUpdates,
      secret_token: context.callbackSecret,
      url: context.endpointUrl,
    });
    return { outcome: "ready" };
  },
};

function resolveConfig(value: Readonly<Record<string, JsonValue>>): Config {
  return {
    chatIds: value.chatIds as readonly string[],
    dropPendingUpdates: value.dropPendingUpdates as boolean,
    updates: value.updates as readonly string[],
    userIds: value.userIds as readonly string[],
  };
}

function subscribedUpdates(config: Config): readonly string[] | null {
  if (!config.updates.includes("*")) return config.updates;
  const named = config.updates.filter((value) => value != "*");
  return named.length == 0 ? null : [...new Set([...defaultUpdates, ...named])];
}

function sameSecret(candidate: string | undefined, expected: string): boolean {
  if (candidate == null || candidate.length != expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1)
    difference |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference == 0;
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return value != null && typeof value == "object" && !Array.isArray(value);
}

function id(value: JsonValue | undefined): string | undefined {
  if (!isRecord(value)) return;
  return typeof value.id == "string" || typeof value.id == "number" ? String(value.id) : undefined;
}

function resolveChatId(value: JsonValue | undefined): string | undefined {
  if (!isRecord(value)) return;
  return id(value.chat) ?? (isRecord(value.message) ? id(value.message.chat) : undefined);
}

function resolveUserId(value: JsonValue | undefined): string | undefined {
  if (!isRecord(value)) return;
  return id(value.from) ?? id(value.user);
}

async function webhookUrl(context: IntegrationReconcileContext): Promise<string> {
  const envelope = await request(context, "getWebhookInfo");
  const url = isRecord(envelope.result) ? envelope.result.url : undefined;
  if (typeof url != "string")
    throw new TransientIntegrationError("Telegram getWebhookInfo response is missing result.url.");
  return url;
}

async function deleteWebhook(context: IntegrationReconcileContext): Promise<void> {
  await request(context, "deleteWebhook", { drop_pending_updates: false });
}

async function request(
  context: IntegrationReconcileContext,
  endpoint: string,
  body?: Readonly<Record<string, JsonValue>>,
): Promise<TelegramEnvelope> {
  let result: ConnectorProxyResult;
  try {
    result = await context.connector.execute(
      {
        ...(body == null ? {} : { body }),
        endpoint: `/${endpoint}`,
        method: body == null ? "GET" : "POST",
      },
      context.signal,
    );
  } catch (cause) {
    if (cause instanceof IntegrationConnectionError) throw cause;
    throw new TransientIntegrationError(`Telegram ${endpoint} request failed.`, { cause });
  }
  const envelope = isRecord(result.data) ? (result.data as TelegramEnvelope) : {};
  if (result.status >= 200 && result.status < 300 && envelope.ok === true) return envelope;
  const message = typeof envelope.description == "string" ? envelope.description : `HTTP ${result.status}`;
  if (result.status == 401 || result.status == 403)
    throw new IntegrationConnectionError(`Telegram ${endpoint} rejected the Connection.`);
  if (result.status >= 400 && result.status < 500 && result.status != 429) {
    throw new PermanentIntegrationError(`Telegram ${endpoint} rejected the subscription: ${message}`);
  }
  throw new TransientIntegrationError(`Telegram ${endpoint} failed: ${message}`);
}

function host(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "an invalid URL";
  }
}
