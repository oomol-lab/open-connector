import type {
  IntegrationDefinition,
  IntegrationReconcileContext,
  IntegrationStateContext,
} from "../../triggers/common/integration.ts";
import type { ConnectorProxyRequest, ConnectorProxyResult } from "../../triggers/common/proxy.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import { optionalString } from "../../core/cast.ts";
import { randomUUIDv7 } from "../../core/uuid-v7.ts";
import {
  IntegrationConnectionError,
  PermanentIntegrationError,
  TransientIntegrationError,
} from "../../triggers/common/integration.ts";
import { bytes, verifyHexHmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

const signatureToleranceSeconds = 5 * 60;

interface Config {
  readonly apiVersion: string;
  readonly events: readonly string[];
  readonly includeConnectedAccounts: boolean;
}

const endpoints = "/v1/webhook_endpoints";
const formHeaders = { "Content-Type": "application/x-www-form-urlencoded" };

export const stripeEvent: IntegrationDefinition = {
  initialState: { checkpoint: null, subscription: {} },
  snapshot,
  async receive(context) {
    const signingSecret = subscriptionSecret(context.state);
    if (
      signingSecret == null ||
      !(await validSignature(context.header("stripe-signature"), signingSecret, context.rawBody, context.now))
    ) {
      return { body: "", contentType: "text/plain", outcome: "respond", status: 404 };
    }
    if (context.payload == null || typeof context.payload != "object" || Array.isArray(context.payload)) {
      return { outcome: "ignored", reason: "Stripe event body is missing." };
    }
    const payload = context.payload as Readonly<Record<string, JsonValue>>;
    const event = payload.type;
    const eventId = payload.id;
    if (typeof event != "string" || typeof eventId != "string")
      return { outcome: "ignored", reason: "Stripe event identity is missing." };
    const config = resolveConfig(context.config);
    if (!config.events.includes("*") && !config.events.includes(event))
      return { outcome: "ignored", reason: "Stripe event is not subscribed." };
    return {
      dedupeKey: eventId,
      outcome: "event",
      outputs: { body: payload, event, eventId, livemode: payload.livemode === true },
    };
  },
  async reconcile(context) {
    const state = requireState(context.state);
    const config = resolveConfig(context.config);
    let endpointId = subscriptionId(state);
    let signingSecret = subscriptionSecret(state);
    let createKey = optionalString(state.subscription.createKey);
    if (!context.active) {
      endpointId ??= await findByUrl(context);
      if (endpointId != null) {
        const result = await request(context, "endpoint delete", {
          endpoint: `${endpoints}/${endpointId}`,
          method: "DELETE",
        });
        if (result.status != 404) success(result, "endpoint delete");
      }
      await state.saveSubscription({}, later(context.now));
      return { outcome: "ready" };
    }
    if (endpointId == null && createKey == null) endpointId = await findByUrl(context);
    if (endpointId != null && signingSecret == null) {
      createKey = randomUUIDv7();
      await state.saveSubscription({ endpointId, createKey }, context.now);
      const removed = await request(context, "endpoint delete", {
        endpoint: `${endpoints}/${endpointId}`,
        method: "DELETE",
      });
      if (removed.status != 404) success(removed, "endpoint delete");
      endpointId = null;
    }
    if (endpointId == null) {
      createKey ??= context.idempotencyKey;
      await state.saveSubscription({ createKey }, context.now);
      const created = await request(context, "endpoint create", {
        body: createForm(context.endpointUrl, config),
        endpoint: endpoints,
        headers: { ...formHeaders, "Idempotency-Key": createKey },
        method: "POST",
      });
      success(created, "endpoint create");
      const endpoint = createdEndpoint(created.data);
      endpointId = endpoint.id;
      signingSecret = endpoint.secret;
    }
    await state.saveSubscription({ endpointId, signingSecret }, context.now);
    const aligned = await request(context, "endpoint update", {
      body: form([
        ...config.events.map((event, index): [string, string] => [`enabled_events[${index}]`, event]),
        ["disabled", "false"],
        ["description", "Managed by Open Flow."],
      ]),
      endpoint: `${endpoints}/${endpointId}`,
      headers: formHeaders,
      method: "POST",
    });
    if (aligned.status == 404) {
      await state.saveSubscription({ createKey: randomUUIDv7() }, context.now);
      return { outcome: "pending" };
    }
    success(aligned, "endpoint update");
    await state.saveSubscription({ endpointId, signingSecret }, later(context.now));
    return { outcome: "ready" };
  },
};

function resolveConfig(value: Readonly<Record<string, JsonValue>>): Config {
  return {
    apiVersion: value.apiVersion as string,
    events: [...new Set(value.events as readonly string[])],
    includeConnectedAccounts: value.includeConnectedAccounts as boolean,
  };
}

function createForm(url: string, config: Config): string {
  const fields: [string, string][] = [
    ["url", url],
    ...config.events.map((event, index): [string, string] => [`enabled_events[${index}]`, event]),
    ["description", "Managed by Open Flow."],
  ];
  if (config.includeConnectedAccounts) fields.push(["connect", "true"]);
  if (config.apiVersion.length > 0) fields.push(["api_version", config.apiVersion]);
  return form(fields);
}

function form(fields: readonly [string, string][]): string {
  const parameters = new URLSearchParams();
  for (const [name, value] of fields) parameters.append(name, value);
  return parameters.toString();
}

async function findByUrl(context: IntegrationReconcileContext): Promise<string | null> {
  let startingAfter: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const result = await request(context, "endpoint list", {
      endpoint: endpoints,
      method: "GET",
      query: { limit: 100, ...(startingAfter == null ? {} : { starting_after: startingAfter }) },
    });
    success(result, "endpoint list");
    const listing = record(result.data);
    const values = Array.isArray(listing?.data) ? listing.data : [];
    for (const value of values) {
      const endpoint = record(value);
      if (endpoint?.url === context.endpointUrl && typeof endpoint.id == "string") return endpoint.id;
    }
    const last = record(values.at(-1))?.id;
    if (listing?.has_more !== true || typeof last != "string") return null;
    startingAfter = last;
  }
  return null;
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
    throw new TransientIntegrationError(`Stripe ${operation} request failed.`, { cause });
  }
}

function success(result: ConnectorProxyResult, operation: string): void {
  if (result.status >= 200 && result.status < 300) return;
  if (result.status == 401 || result.status == 403)
    throw new IntegrationConnectionError(`Stripe ${operation} rejected the Connection.`);
  if (result.status == 400 || result.status == 404) {
    const message = record(record(result.data)?.error)?.message;
    throw new PermanentIntegrationError(
      `Stripe ${operation} rejected the subscription${typeof message == "string" ? `: ${message}` : "."}`,
    );
  }
  throw new TransientIntegrationError(`Stripe ${operation} failed with status ${result.status}.`);
}

function createdEndpoint(data: unknown): { readonly id: string; readonly secret: string } {
  const value = record(data);
  if (typeof value?.id != "string" || typeof value.secret != "string" || value.secret.length == 0) {
    throw new TransientIntegrationError("Stripe endpoint response is missing its ID or signing secret.");
  }
  return { id: value.id, secret: value.secret };
}

function requireState(value: IntegrationStateContext | undefined): IntegrationStateContext {
  if (value == null) throw new PermanentIntegrationError("Stripe Integration state is missing.");
  return value;
}

function subscriptionId(state: IntegrationStateContext): string | null {
  const value = state.subscription.endpointId;
  return typeof value == "string" && value.length > 0 ? value : null;
}

function subscriptionSecret(state: IntegrationStateContext | undefined): string | null {
  const value = state?.subscription.signingSecret;
  return typeof value == "string" && value.length > 0 ? value : null;
}

async function validSignature(
  header: string | undefined,
  secret: string,
  body: Uint8Array,
  now: Date,
): Promise<boolean> {
  if (header == null) return false;
  const values = header.split(",").map((value) => value.trim().split("=", 2) as [string, string | undefined]);
  const timestamp = values.find(([name]) => name == "t")?.[1];
  if (timestamp == null || !/^\d+$/.test(timestamp)) return false;
  const seconds = Number(timestamp);
  if (
    !Number.isSafeInteger(seconds) ||
    Math.abs(Math.floor(now.getTime() / 1_000) - seconds) > signatureToleranceSeconds
  )
    return false;
  const signatures = values.filter(([name, value]) => name == "v1" && value != null).map(([, value]) => value!);
  const source = [bytes(`${timestamp}.`), body];
  return (await Promise.all(signatures.map((signature) => verifyHexHmac(secret, source, signature)))).some(Boolean);
}

function later(now: Date): Date {
  return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value == "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
