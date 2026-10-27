import type {
  IntegrationDefinition,
  IntegrationStateContext,
  IntegrationReceiveResult,
  IntegrationReconcileResult,
} from "./common/integration.ts";
import type { ConnectorProxy } from "./common/proxy.ts";
import type { TriggerRequest } from "./request.ts";
import type { TriggerSubscription, TriggerStore } from "./store.ts";

import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { ExecutionError } from "../core/execution-error.ts";
import { randomUUIDv7 } from "../core/uuid-v7.ts";
import { canonicalJsonBytes, digestBytes } from "./common/encoding.ts";
export type SubscriptionOwner = Pick<
  TriggerSubscription,
  "tokenId" | "service" | "connectionId" | "triggerId" | "connectionRevision" | "providerAccountId"
>;
export async function subscriptionId(owner: SubscriptionOwner, requestKey: string): Promise<string> {
  return digestBytes(
    canonicalJsonBytes([
      owner.tokenId,
      owner.service,
      owner.connectionId,
      owner.providerAccountId,
      owner.triggerId,
      requestKey,
    ]),
  );
}
export async function withSubscription<T>(
  store: TriggerStore,
  id: string,
  signal: AbortSignal,
  run: (record: TriggerSubscription, save: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const lease = randomUUIDv7();
  if (!(await store.claimFlowTrigger(id, lease, Date.now(), Date.now() + 60_000)))
    throw new ExecutionError("invalid_input", "Trigger subscription is busy", "conflict");
  try {
    const record = await store.getFlowTrigger(id);
    if (!record) throw new ExecutionError("trigger_not_found", "Subscription not found", "not_found");
    const save = async () => {
      signal.throwIfAborted();
      if (!(await store.saveFlowTrigger(record, lease, Date.now())))
        throw new ExecutionError("invalid_input", "Trigger subscription lease expired", "conflict");
    };
    return await run(record, save);
  } finally {
    await store.releaseFlowTrigger(id, lease);
  }
}
interface SubscriptionState {
  checkpoint: import("./common/types.ts").JsonValue;
  subscription: Readonly<Record<string, import("./common/types.ts").JsonValue>>;
  reconcileAt: number;
}
export type SubscriptionResult = SubscriptionState &
  (IntegrationReconcileResult | { result: IntegrationReceiveResult });

export async function executeSubscription(
  store: TriggerStore,
  definition: IntegrationDefinition,
  owner: SubscriptionOwner,
  input: Extract<TriggerRequest, { operation: "receive" | "reconcile" }>,
  proxy: ConnectorProxy,
  signal: AbortSignal,
): Promise<SubscriptionResult> {
  const id =
    input.operation === "receive"
      ? input.subscriptionId
      : (input.subscriptionId ?? (await subscriptionId(owner, input.requestKey)));
  if (input.operation === "reconcile" && input.active && !input.subscriptionId) {
    const url = new URL(input.endpointUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      throw new ExecutionError(
        "invalid_input",
        "A HTTPS callback without credentials or fragment is required",
        "invalid_input",
      );
    await store.insertFlowTrigger({
      mode: "webhook",
      id,
      ...owner,
      requestKey: input.requestKey,
      config: input.config,
      endpointUrl: url.href,
      callbackNonce: randomUUIDv7(),
      callbackSecret: randomBytes(32).toString("base64url"),
      checkpoint: definition.initialState?.checkpoint ?? null,
      subscription: definition.initialState?.subscription ?? {},
      reconcileAt: Date.now(),
      status: "active",
    });
  }
  const existing = await store.getFlowTrigger(id);
  if (!existing) {
    if (input.operation === "reconcile" && !input.active)
      return {
        outcome: "ready",
        checkpoint: null,
        subscription: {},
        reconcileAt: Date.now() + 60_000,
      };
    throw new ExecutionError("trigger_not_found", "Subscription not found", "not_found");
  }
  if (
    existing.tokenId !== owner.tokenId ||
    existing.service !== owner.service ||
    existing.connectionId !== owner.connectionId ||
    existing.triggerId !== owner.triggerId ||
    existing.providerAccountId !== owner.providerAccountId
  )
    throw new ExecutionError("trigger_not_found", "Subscription not found", "not_found");
  if (
    input.operation === "receive" &&
    existing.status === "active" &&
    input.query.connector_subscription === existing.callbackNonce
  ) {
    const result = definition.handshake?.(input);
    if (result)
      return { result, checkpoint: existing.checkpoint, subscription: { id }, reconcileAt: existing.reconcileAt };
  }
  return withSubscription(store, id, signal, async (record, save) => {
    return executeSubscriptionOperation(record, save, definition, input, proxy, signal);
  });
}

// The caller must hold the subscription lease until this operation completes.
export async function executeSubscriptionOperation(
  record: TriggerSubscription,
  save: () => Promise<void>,
  definition: IntegrationDefinition,
  input: Extract<TriggerRequest, { operation: "receive" | "reconcile" }>,
  proxy: ConnectorProxy,
  signal: AbortSignal,
): Promise<SubscriptionResult> {
  const id = record.id;
  const state: IntegrationStateContext = {
    get checkpoint() {
      return record.checkpoint;
    },
    get subscription() {
      return record.subscription;
    },
    saveCheckpoint: async (checkpoint) => {
      record.checkpoint = checkpoint;
      await save();
    },
    saveSubscription: async (subscription, reconcileAt) => {
      record.subscription = subscription;
      record.reconcileAt = reconcileAt.getTime();
      await save();
    },
  };
  if (input.operation === "reconcile") {
    if (record.status === "deleted" && !input.active)
      return {
        outcome: "ready",
        checkpoint: record.checkpoint,
        subscription: { id },
        reconcileAt: record.reconcileAt,
      };
    const url = new URL(input.endpointUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      throw new ExecutionError(
        "invalid_input",
        "A HTTPS callback without credentials or fragment is required",
        "invalid_input",
      );
    if (record.status === "abandoned")
      throw new ExecutionError("trigger_abandoned", "Create a new request key after abandoning cleanup.", "conflict");
    if (record.status === "deleted") {
      record.config = input.config;
      record.endpointUrl = url.href;
      record.callbackNonce = randomUUIDv7();
      record.callbackSecret = randomBytes(32).toString("base64url");
      record.checkpoint = definition.initialState?.checkpoint ?? null;
      record.subscription = definition.initialState?.subscription ?? {};
      record.reconcileAt = Date.now();
      record.status = "active";
      await save();
    }
    if (!isDeepStrictEqual(record.config, input.config) || record.endpointUrl !== url.href)
      throw new ExecutionError(
        "invalid_input",
        "Subscription request key is already bound to another configuration",
        "conflict",
      );
    if (!input.active) {
      record.status = "deleting";
      await save();
    }
    if (input.active && record.status !== "active")
      throw new ExecutionError("invalid_input", "Subscription is being deleted", "conflict");
    const callback = new URL(record.endpointUrl);
    callback.searchParams.set("connector_subscription", record.callbackNonce);
    callback.searchParams.set("connector_reference", record.id);
    const result = await definition.reconcile({
      active: input.active,
      config: record.config,
      endpointUrl: callback.href,
      callbackSecret: record.callbackSecret,
      idempotencyKey: record.callbackNonce,
      connector: proxy,
      now: new Date(),
      state,
      signal,
    });
    if (!input.active && result.outcome === "ready") {
      record.status = "deleted";
      await save();
    }
    return {
      ...result,
      checkpoint: record.checkpoint,
      subscription: { id },
      reconcileAt: record.reconcileAt,
    };
  }
  if (record.status !== "active")
    return {
      result: { outcome: "ignored", reason: "Subscription is not active" },
      checkpoint: record.checkpoint,
      subscription: { id },
      reconcileAt: record.reconcileAt,
    };
  if (input.query.connector_subscription !== record.callbackNonce)
    return {
      result: { outcome: "respond", status: 404, body: "", contentType: "text/plain" },
      checkpoint: record.checkpoint,
      subscription: { id },
      reconcileAt: record.reconcileAt,
    };
  if (!definition.snapshot.endpoint.methods.includes(input.method))
    throw new ExecutionError("invalid_input", "Unsupported webhook method.");
  const rawBody = Uint8Array.from(Buffer.from(input.rawBody, "base64"));
  if (rawBody.byteLength > 64 * 1024)
    throw new ExecutionError("invalid_input", "Webhook body is too large", "invalid_input");
  if (!rawBody.byteLength && !definition.snapshot.endpoint.body.allowEmpty)
    throw new ExecutionError("invalid_input", "Webhook body is required.");
  const type = input.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (rawBody.byteLength && type !== "application/json")
    throw new ExecutionError("invalid_input", "Webhook content type must be application/json.");
  let payload: unknown = null;
  if (rawBody.byteLength > 0) {
    const text = new TextDecoder().decode(rawBody);
    try {
      payload =
        type === "application/x-www-form-urlencoded" ? Object.fromEntries(new URLSearchParams(text)) : JSON.parse(text);
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new ExecutionError("invalid_input", "Invalid webhook JSON payload", "invalid_input");
      throw error;
    }
  }
  if (Array.isArray(payload) && !definition.snapshot.endpoint.body.allowArray)
    throw new ExecutionError("invalid_input", "Webhook body must not be an array.");
  const result = await definition.receive({
    bindingId: id,
    callbackSecret: record.callbackSecret,
    config: record.config,
    connector: proxy,
    current: input.current,
    admit: input.admit,
    method: input.method,
    now: new Date(),
    payload: payload as import("./common/types.ts").JsonValue,
    rawBody,
    header: (name) => input.headers[name.toLowerCase()],
    query: (name) => input.query[name],
    state,
    signal,
  });
  if ("checkpoint" in result && result.checkpoint !== undefined) {
    record.checkpoint = result.checkpoint;
    await save();
  }
  return {
    result,
    checkpoint: record.checkpoint,
    subscription: { id },
    reconcileAt: record.reconcileAt,
  };
}
