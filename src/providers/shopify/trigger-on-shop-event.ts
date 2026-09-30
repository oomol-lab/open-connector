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
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-shop-event.definition.ts";

export const shopifyShopEvent: IntegrationDefinition = {
  initialState: { checkpoint: null, subscription: {} },
  snapshot,
  receive(context) {
    if (!sameSecret(context.query("open_flow_callback"), context.callbackSecret)) {
      return { body: "", contentType: "text/plain", outcome: "respond", status: 404 };
    }
    const topic = context.header("x-shopify-topic")?.trim();
    if (!topic) return { outcome: "ignored", reason: "Shopify topic header is missing." };
    if (!configuredTopics(context.config).includes(topic))
      return { outcome: "ignored", reason: "Shopify topic is not subscribed." };
    const webhookId = context.header("x-shopify-webhook-id") ?? "";
    return {
      dedupeKey: webhookId.length == 0 ? undefined : webhookId,
      outcome: "event",
      outputs: {
        apiVersion: context.header("x-shopify-api-version") ?? "",
        body: context.payload as Readonly<Record<string, JsonValue>>,
        eventId: context.header("x-shopify-event-id") ?? "",
        shopDomain: context.header("x-shopify-shop-domain") ?? "",
        topic,
        triggeredAt: context.header("x-shopify-triggered-at") ?? "",
        webhookId,
      },
    };
  },
  async reconcile(context) {
    const state = requireState(context.state);
    const subscriptions = await list(context);
    if (subscriptions == null) {
      if (!context.active) return { outcome: "ready" };
      throw new PermanentIntegrationError("The Shopify store or webhook resource is unavailable.");
    }
    if (!context.active) {
      for (const id of subscriptions.values()) await remove(context, id);
      await state.saveSubscription({}, later(context.now));
      return { outcome: "ready" };
    }
    const wanted = configuredTopics(context.config);
    const ids: string[] = [];
    const created: string[] = [];
    try {
      for (const topic of wanted) {
        const existing = subscriptions.get(topic);
        if (existing != null) ids.push(existing);
        else {
          const subscription = await create(context, topic);
          ids.push(subscription.id);
          if (subscription.created) created.push(subscription.id);
        }
      }
    } catch (cause) {
      await Promise.allSettled(created.map((id) => remove(context, id)));
      throw cause;
    }
    for (const [topic, id] of subscriptions) if (!wanted.includes(topic)) await remove(context, id);
    await state.saveSubscription({ webhookIds: ids }, later(context.now));
    return { outcome: "ready" };
  },
};

function configuredTopics(value: Readonly<Record<string, JsonValue>>): readonly string[] {
  return [...new Set(value.topics as readonly string[])];
}

async function create(
  context: IntegrationReconcileContext,
  topic: string,
): Promise<{ readonly created: boolean; readonly id: string }> {
  const address = callbackUrl(context);
  const result = await request(context, "subscription create", {
    body: { webhook: { address, format: "json", topic } },
    endpoint: "/webhooks.json",
    method: "POST",
  });
  if (result.status == 422) {
    const subscriptions = await list(context);
    const winner = subscriptions?.get(topic);
    if (winner != null) return { created: false, id: winner };
  }
  success(result, "subscription create");
  const id = normalizeId(record(record(result.data)?.webhook)?.id);
  if (id == null) throw new TransientIntegrationError("Shopify subscription response is missing its ID.");
  return { created: true, id };
}

async function list(context: IntegrationReconcileContext): Promise<Map<string, string> | null> {
  const address = callbackUrl(context);
  const result = await request(context, "subscription list", {
    endpoint: "/webhooks.json",
    method: "GET",
    query: { address, limit: 250 },
  });
  if (result.status == 404) return null;
  success(result, "subscription list");
  const raw = record(result.data)?.webhooks;
  const subscriptions = new Map<string, string>();
  if (!Array.isArray(raw)) return subscriptions;
  for (const item of raw) {
    const value = record(item);
    const id = normalizeId(value?.id);
    if (value?.address === address && typeof value.topic == "string" && id != null) subscriptions.set(value.topic, id);
  }
  return subscriptions;
}

function callbackUrl(context: IntegrationReconcileContext): string {
  const url = new URL(context.endpointUrl);
  url.searchParams.set("open_flow_callback", context.callbackSecret);
  return url.href;
}

async function remove(context: IntegrationReconcileContext, id: string): Promise<void> {
  const result = await request(context, "subscription delete", {
    endpoint: `/webhooks/${encodeURIComponent(id)}.json`,
    method: "DELETE",
  });
  if (result.status != 404) success(result, "subscription delete");
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
    throw new TransientIntegrationError(`Shopify ${operation} request failed.`, { cause });
  }
}

function success(result: ConnectorProxyResult, operation: string): void {
  if (result.status >= 200 && result.status < 300) return;
  if (result.status == 401 || result.status == 403)
    throw new IntegrationConnectionError(`Shopify ${operation} rejected the Connection.`);
  if ([402, 404, 422, 423, 501].includes(result.status))
    throw new PermanentIntegrationError(`Shopify ${operation} rejected the subscription.`);
  throw new TransientIntegrationError(`Shopify ${operation} failed with status ${result.status}.`);
}

function normalizeId(value: unknown): string | null {
  if (typeof value == "string") return value.trim().length == 0 ? null : value;
  return typeof value == "number" && Number.isFinite(value) ? String(value) : null;
}

function requireState(value: IntegrationStateContext | undefined): IntegrationStateContext {
  if (value == null) throw new PermanentIntegrationError("Shopify Integration state is missing.");
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
