import type {
  IntegrationDefinition,
  IntegrationReconcileContext,
  IntegrationStateContext,
} from "../../triggers/common/integration.ts";
import type { ConnectorProxyRequest, ConnectorProxyResult } from "../../triggers/common/proxy.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import {
  IntegrationConnectionError,
  PermanentIntegrationError,
  TransientIntegrationError,
} from "../../triggers/common/integration.ts";
import { verifyBase64Hmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-store-event.definition.ts";

interface Config {
  readonly events: readonly string[];
  readonly webhookName: string;
}

export const wooCommerceStoreEvent: IntegrationDefinition = {
  initialState: { checkpoint: null, subscription: {} },
  snapshot,
  async receive(context) {
    if (
      !(await verifyBase64Hmac(context.callbackSecret, [context.rawBody], context.header("x-wc-webhook-signature")))
    ) {
      return { body: "", contentType: "text/plain", outcome: "respond", status: 404 };
    }
    const topic = context.header("x-wc-webhook-topic")?.trim();
    if (!topic) return { outcome: "ignored", reason: "WooCommerce topic header is missing." };
    if (!resolveConfig(context.config).events.includes(topic))
      return { outcome: "ignored", reason: "WooCommerce topic is not subscribed." };
    const deliveryId = context.header("x-wc-webhook-delivery-id") ?? "";
    return {
      dedupeKey: deliveryId.length == 0 ? undefined : deliveryId,
      outcome: "event",
      outputs: {
        body: context.payload as Readonly<Record<string, JsonValue>>,
        deliveryId,
        event: context.header("x-wc-webhook-event") ?? "",
        resource: context.header("x-wc-webhook-resource") ?? "",
        source: context.header("x-wc-webhook-source") ?? "",
        topic,
        webhookId: context.header("x-wc-webhook-id") ?? "",
      },
    };
  },
  async reconcile(context) {
    const state = requireState(context.state);
    const config = resolveConfig(context.config);
    const listed = await list(context);
    if (!context.active) {
      for (const value of listed) await remove(context, value.id);
      await state.saveSubscription({}, later(context.now));
      return { outcome: "ready" };
    }
    const adopted = new Map<string, string>();
    for (const value of listed)
      if (config.events.includes(value.topic) && !adopted.has(value.topic)) adopted.set(value.topic, value.id);
    const kept = new Set(adopted.values());
    for (const value of listed) if (!kept.has(value.id)) await remove(context, value.id);
    const ids: string[] = [];
    for (const topic of config.events) {
      const existing = adopted.get(topic);
      ids.push(existing == null ? await create(context, config, topic) : await align(context, existing, topic));
    }
    await state.saveSubscription({ webhookIds: ids }, later(context.now));
    return { outcome: "ready" };
  },
};

function resolveConfig(value: Readonly<Record<string, JsonValue>>): Config {
  return {
    events: [...new Set(value.events as readonly string[])],
    webhookName: value.webhookName as string,
  };
}

async function create(context: IntegrationReconcileContext, config: Config, topic: string): Promise<string> {
  const result = await request(context, `webhook create (${topic})`, {
    body: {
      delivery_url: context.endpointUrl,
      name: `${config.webhookName} - ${topic}`,
      secret: context.callbackSecret,
      topic,
    },
    endpoint: "/webhooks",
    method: "POST",
  });
  success(result, `webhook create (${topic})`);
  return readId(result.data);
}

async function align(context: IntegrationReconcileContext, webhookId: string, topic: string): Promise<string> {
  const result = await request(context, `webhook update (${topic})`, {
    body: {
      delivery_url: context.endpointUrl,
      secret: context.callbackSecret,
      status: "active",
      topic,
    },
    endpoint: `/webhooks/${webhookId}`,
    method: "PUT",
  });
  if (invalidId(result)) return create(context, resolveConfig(context.config), topic);
  success(result, `webhook update (${topic})`);
  return webhookId;
}

async function list(
  context: IntegrationReconcileContext,
): Promise<readonly { readonly id: string; readonly topic: string }[]> {
  const matches: { id: string; topic: string }[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await request(context, "webhook list", {
      endpoint: "/webhooks",
      method: "GET",
      query: { context: "view", page, per_page: 100, status: "all" },
    });
    success(result, "webhook list");
    const hooks = Array.isArray(result.data) ? result.data : [];
    for (const hook of hooks) {
      const value = record(hook);
      if (value?.delivery_url !== context.endpointUrl || typeof value.topic != "string") continue;
      const webhookId = normalizeId(value.id);
      if (webhookId != null) matches.push({ id: webhookId, topic: value.topic });
    }
    if (hooks.length < 100) return matches;
  }
  throw new TransientIntegrationError("WooCommerce webhook list did not finish within ten pages.");
}

async function remove(context: IntegrationReconcileContext, webhookId: string): Promise<void> {
  const result = await request(context, "webhook delete", {
    endpoint: `/webhooks/${webhookId}`,
    method: "DELETE",
    query: { force: "true" },
  });
  if (result.status != 404) success(result, "webhook delete");
}

async function request(
  context: IntegrationReconcileContext,
  operation: string,
  value: ConnectorProxyRequest,
): Promise<ConnectorProxyResult> {
  try {
    return await context.connector.execute(value, context.signal);
  } catch (cause) {
    if (cause instanceof IntegrationConnectionError) throw cause;
    throw new TransientIntegrationError(`WooCommerce ${operation} request failed.`, { cause });
  }
}

function success(result: ConnectorProxyResult, operation: string): void {
  if (result.status >= 200 && result.status < 300) return;
  const code = errorCode(result.data);
  if (result.status == 401 || result.status == 403)
    throw new IntegrationConnectionError(`WooCommerce ${operation} rejected the Connection.`);
  if (
    result.status == 404 ||
    (result.status == 400 && (code.endsWith("_invalid_topic") || code.endsWith("_invalid_delivery_url"))) ||
    (result.status == 501 && code == "woocommerce_rest_trash_not_supported")
  ) {
    throw new PermanentIntegrationError(`WooCommerce ${operation} rejected the subscription.`);
  }
  throw new TransientIntegrationError(`WooCommerce ${operation} failed with status ${result.status}.`);
}

function invalidId(result: ConnectorProxyResult): boolean {
  return result.status == 400 && errorCode(result.data) == "woocommerce_rest_webhook_invalid_id";
}

function errorCode(data: unknown): string {
  const value = record(data)?.code;
  return typeof value == "string" ? value : "";
}

function readId(data: unknown): string {
  const value = normalizeId(record(data)?.id);
  if (value == null) throw new TransientIntegrationError("WooCommerce webhook response is missing its ID.");
  return value;
}

function normalizeId(value: unknown): string | null {
  if (typeof value == "string" && value.length > 0) return value;
  return typeof value == "number" && Number.isFinite(value) ? String(value) : null;
}

function requireState(value: IntegrationStateContext | undefined): IntegrationStateContext {
  if (value == null) throw new PermanentIntegrationError("WooCommerce Integration state is missing.");
  return value;
}

function later(now: Date): Date {
  return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value == "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
