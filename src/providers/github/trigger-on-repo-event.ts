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
import { verifyHexHmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-repo-event.definition.ts";

interface Config {
  readonly events: readonly string[];
  readonly insecureSsl: boolean;
  readonly owner: string;
  readonly repo: string;
}

export const githubRepoEvent: IntegrationDefinition = {
  initialState: { checkpoint: null, subscription: {} },
  snapshot,
  async receive(context) {
    const signature = context.header("x-hub-signature-256");
    if (
      !signature?.startsWith("sha256=") ||
      !(await verifyHexHmac(context.callbackSecret, [context.rawBody], signature.slice(7)))
    ) {
      return { body: "", contentType: "text/plain", outcome: "respond", status: 404 };
    }
    const event = context.header("x-github-event")?.trim();
    if (!event) return { outcome: "ignored", reason: "GitHub event header is missing." };
    if (event == "ping") return { outcome: "ignored", reason: "GitHub ping handshake." };
    const config = resolveConfig(context.config);
    if (!config.events.includes("*") && !config.events.includes(event)) {
      return { outcome: "ignored", reason: "GitHub event is not subscribed." };
    }
    const deliveryId = context.header("x-github-delivery") ?? "";
    return {
      dedupeKey: deliveryId.length == 0 ? undefined : deliveryId,
      outcome: "event",
      outputs: { body: context.payload as Readonly<Record<string, JsonValue>>, deliveryId, event },
    };
  },
  async reconcile(context) {
    const state = requireState(context.state);
    const config = resolveConfig(context.config);
    let hookId = subscriptionId(state);
    if (!context.active) {
      if (hookId == null) hookId = await findByUrl(context, config);
      if (hookId != null) {
        const result = await request(context, "hook delete", {
          endpoint: `${endpoint(config)}/${hookId}`,
          method: "DELETE",
        });
        if (result.status != 404) success(result, "hook delete");
      }
      await state.saveSubscription({}, later(context.now));
      return { outcome: "ready" };
    }
    const desired = body(context.endpointUrl, context.callbackSecret, config);
    if (hookId == null) {
      const result = await request(context, "hook create", {
        body: desired,
        endpoint: endpoint(config),
        method: "POST",
      });
      if (result.status == 201) hookId = id(result.data);
      else if (result.status == 422) {
        hookId = await findByUrl(context, config);
        if (hookId == null) throw new PermanentIntegrationError("GitHub rejected the webhook configuration.");
      } else {
        success(result, "hook create");
        throw new TransientIntegrationError(`GitHub hook create returned unexpected status ${result.status}.`);
      }
    }
    await state.saveSubscription({ hookId }, context.now);
    const aligned = await request(context, "hook update", {
      body: desired,
      endpoint: `${endpoint(config)}/${hookId}`,
      method: "PATCH",
    });
    if (aligned.status == 404) {
      await state.saveSubscription({}, context.now);
      return { outcome: "pending" };
    }
    success(aligned, "hook update");
    await state.saveSubscription({ hookId }, later(context.now));
    return { outcome: "ready" };
  },
};

function resolveConfig(value: Readonly<Record<string, JsonValue>>): Config {
  return {
    events: [...new Set(value.events as readonly string[])],
    insecureSsl: value.insecureSsl as boolean,
    owner: value.owner as string,
    repo: value.repo as string,
  };
}

function endpoint(config: Config): string {
  return `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/hooks`;
}

function body(url: string, secret: string, config: Config): Readonly<Record<string, JsonValue>> {
  return {
    active: true,
    config: { content_type: "json", insecure_ssl: config.insecureSsl ? "1" : "0", secret, url },
    events: config.events,
    name: "web",
  };
}

async function findByUrl(context: IntegrationReconcileContext, config: Config): Promise<string | null> {
  for (let page = 1; page <= 10; page += 1) {
    const result = await request(context, "hook list", {
      endpoint: endpoint(config),
      method: "GET",
      query: { page, per_page: 100 },
    });
    if (result.status == 404) return null;
    success(result, "hook list");
    const hooks = Array.isArray(result.data) ? result.data : [];
    for (const hook of hooks) {
      const value = record(hook);
      if (
        record(value?.config)?.url === context.endpointUrl &&
        (typeof value?.id == "number" || typeof value?.id == "string")
      ) {
        return String(value.id);
      }
    }
    if (hooks.length < 100) return null;
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
    throw new TransientIntegrationError(`GitHub ${operation} request failed.`, { cause });
  }
}

function success(result: ConnectorProxyResult, operation: string): void {
  if (result.status >= 200 && result.status < 300) return;
  const message = record(result.data)?.message;
  if (result.status == 403 && typeof message == "string" && /rate limit/i.test(message)) {
    throw new TransientIntegrationError(`GitHub ${operation} was rate limited.`);
  }
  if ([401, 403].includes(result.status))
    throw new IntegrationConnectionError(`GitHub ${operation} rejected the Connection.`);
  if ([404, 422].includes(result.status))
    throw new PermanentIntegrationError(`GitHub ${operation} rejected the subscription.`);
  throw new TransientIntegrationError(`GitHub ${operation} failed with status ${result.status}.`);
}

function id(data: unknown): string {
  const value = record(data)?.id;
  if (typeof value != "number" && typeof value != "string")
    throw new TransientIntegrationError("GitHub hook response is missing its ID.");
  return String(value);
}

function requireState(value: IntegrationStateContext | undefined): IntegrationStateContext {
  if (value == null) throw new PermanentIntegrationError("GitHub Integration state is missing.");
  return value;
}

function subscriptionId(state: IntegrationStateContext): string | null {
  const value = state.subscription.hookId;
  return typeof value == "string" && value.length > 0 ? value : null;
}

function later(now: Date): Date {
  return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value == "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
