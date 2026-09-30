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
import { bytes, verifyBase64Hmac } from "../../triggers/signature.ts";
import { snapshot, endpoint } from "./trigger-on-event.definition.ts";

const signatureToleranceMs = 5 * 60 * 1_000;

export const zendeskEvent: IntegrationDefinition = {
  initialState: { checkpoint: null, subscription: {} },
  snapshot,
  async receive(context) {
    const signingSecret = subscriptionSecret(context.state);
    const timestamp = context.header("x-zendesk-webhook-signature-timestamp");
    const signedAt = timestamp == null ? Number.NaN : Date.parse(timestamp);
    if (
      signingSecret == null ||
      timestamp == null ||
      !Number.isFinite(signedAt) ||
      Math.abs(context.now.getTime() - signedAt) > signatureToleranceMs ||
      !(await verifyBase64Hmac(
        signingSecret,
        [bytes(timestamp), context.rawBody],
        context.header("x-zendesk-webhook-signature"),
      ))
    ) {
      return { body: "", contentType: "text/plain", outcome: "respond", status: 404 };
    }
    if (context.payload == null || typeof context.payload != "object" || Array.isArray(context.payload)) {
      return { outcome: "ignored", reason: "Zendesk event body is missing." };
    }
    const payload = context.payload as Readonly<Record<string, JsonValue>>;
    const event = payload.type;
    if (typeof event != "string" || event.length == 0)
      return { outcome: "ignored", reason: "Zendesk event type is missing." };
    if (!(context.config.events as readonly string[]).includes(event))
      return { outcome: "ignored", reason: "Zendesk event is not subscribed." };
    const deliveryId = typeof payload.id == "string" ? payload.id : "";
    const subject = payload.subject;
    return {
      dedupeKey: deliveryId.length == 0 ? undefined : deliveryId,
      outcome: "event",
      outputs: {
        body: payload,
        deliveryId,
        event,
        ...(typeof subject == "string" ? { subject } : {}),
      },
    };
  },
  async reconcile(context) {
    const state = requireState(context.state);
    const listed = await findByEndpoint(context);
    const known = subscriptionId(state);
    if (!context.active) {
      for (const webhookId of known == null ? listed : [...new Set([known, ...listed])])
        await remove(context, webhookId);
      await state.saveSubscription({}, later(context.now));
      return { outcome: "ready" };
    }
    let webhookId = known ?? listed[0];
    if (webhookId == null) {
      const created = await request(context, "webhook create", {
        body: desired(context),
        endpoint,
        method: "POST",
      });
      success(created, "webhook create");
      webhookId = readId(record(created.data)?.webhook);
    } else {
      const aligned = await request(context, "webhook update", {
        body: desired(context),
        endpoint: `${endpoint}/${webhookId}`,
        method: "PUT",
      });
      if (aligned.status == 404) {
        await state.saveSubscription({}, context.now);
        return { outcome: "pending" };
      }
      success(aligned, "webhook update");
    }
    await state.saveSubscription({ ...state.subscription, webhookId }, context.now);
    for (const duplicate of listed.filter((value) => value != webhookId)) await remove(context, duplicate);
    await state.saveSubscription(
      { signingSecret: await readSigningSecret(context, webhookId), webhookId },
      later(context.now),
    );
    return { outcome: "ready" };
  },
};

function desired(context: IntegrationReconcileContext): Readonly<Record<string, JsonValue>> {
  return {
    webhook: {
      description: "Managed by Open Flow. Do not edit.",
      endpoint: context.endpointUrl,
      http_method: "POST",
      name: name(context.endpointUrl),
      request_format: "json",
      status: "active",
      subscriptions: [...new Set(context.config.events as readonly string[])],
    },
  };
}

async function findByEndpoint(context: IntegrationReconcileContext): Promise<readonly string[]> {
  const matches: string[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const result = await request(context, "webhook list", {
      endpoint,
      method: "GET",
      query: {
        "filter[name_contains]": name(context.endpointUrl),
        "page[size]": "100",
        ...(after == null ? {} : { "page[after]": after }),
      },
    });
    success(result, "webhook list");
    const listing = record(result.data);
    const webhooks = Array.isArray(listing?.webhooks) ? listing.webhooks : [];
    for (const item of webhooks) {
      const value = record(item);
      if (value?.endpoint === context.endpointUrl && typeof value.id == "string") matches.push(value.id);
    }
    const meta = record(listing?.meta);
    if (meta?.has_more !== true || typeof meta.after_cursor != "string") return matches;
    after = meta.after_cursor;
  }
  return matches;
}

async function remove(context: IntegrationReconcileContext, webhookId: string): Promise<void> {
  const result = await request(context, "webhook delete", {
    endpoint: `${endpoint}/${webhookId}`,
    method: "DELETE",
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
    throw new TransientIntegrationError(`Zendesk ${operation} request failed.`, { cause });
  }
}

function success(result: ConnectorProxyResult, operation: string): void {
  if (result.status >= 200 && result.status < 300) return;
  if (result.status == 401 || result.status == 403)
    throw new IntegrationConnectionError(`Zendesk ${operation} rejected the Connection.`);
  if ([400, 404, 422].includes(result.status))
    throw new PermanentIntegrationError(`Zendesk ${operation} rejected the subscription.`);
  throw new TransientIntegrationError(`Zendesk ${operation} failed with status ${result.status}.`);
}

function name(url: string): string {
  return `open-flow-${url.slice(url.lastIndexOf("/") + 1)}`;
}

function readId(value: unknown): string {
  const webhookId = record(value)?.id;
  if (typeof webhookId != "string") throw new TransientIntegrationError("Zendesk webhook response is missing its ID.");
  return webhookId;
}

function requireState(value: IntegrationStateContext | undefined): IntegrationStateContext {
  if (value == null) throw new PermanentIntegrationError("Zendesk Integration state is missing.");
  return value;
}

function subscriptionId(state: IntegrationStateContext): string | null {
  const value = state.subscription.webhookId;
  return typeof value == "string" && value.length > 0 ? value : null;
}

function subscriptionSecret(state: IntegrationStateContext | undefined): string | null {
  const value = state?.subscription.signingSecret;
  return typeof value == "string" && value.length > 0 ? value : null;
}

async function readSigningSecret(context: IntegrationReconcileContext, webhookId: string): Promise<string> {
  const result = await request(context, "webhook signing secret", {
    endpoint: `${endpoint}/${webhookId}/signing_secret`,
    method: "GET",
  });
  success(result, "webhook signing secret");
  const secret = record(record(result.data)?.signing_secret)?.secret;
  if (typeof secret != "string" || secret.length == 0)
    throw new TransientIntegrationError("Zendesk webhook signing secret response is invalid.");
  return secret;
}

function later(now: Date): Date {
  return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value == "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
