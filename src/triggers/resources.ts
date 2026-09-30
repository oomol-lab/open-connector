import type { IntegrationReconcileResult, ResourceDefinition } from "./common/integration.ts";
import type { ConnectorProxy } from "./common/proxy.ts";
import type { TriggerRequest } from "./request.ts";
import type { TriggerSubscription, TriggerStore } from "./store.ts";
import type { SubscriptionOwner } from "./subscriptions.ts";

import { isDeepStrictEqual } from "node:util";
import { HttpRequestError } from "../server/api/http-utils.ts";
import { canonicalJsonBytes, digestBytes } from "./common/encoding.ts";
import { subscriptionId, withSubscription } from "./subscriptions.ts";

async function resourceSubscriptionId(owner: SubscriptionOwner, key: string): Promise<string> {
  return digestBytes(canonicalJsonBytes(["resource-set", owner.service, owner.providerAccountId, key]));
}

export async function executeResourceSubscription(
  store: TriggerStore,
  definition: ResourceDefinition,
  owner: SubscriptionOwner,
  input: Extract<TriggerRequest, { operation: "resource" }>,
  proxy: ConnectorProxy,
  signal: AbortSignal,
): Promise<IntegrationReconcileResult> {
  const member = await subscriptionId(owner, input.requestKey);
  await store.insertFlowTrigger({
    mode: "resource",
    id: member,
    ...owner,
    requestKey: input.requestKey,
    config: input.config,
    endpointUrl: "",
    callbackNonce: "",
    callbackSecret: "",
    checkpoint: null,
    subscription: {},
    reconcileAt: 0,
    status: "active",
  });
  return withSubscription<IntegrationReconcileResult>(store, member, signal, async (consumer, saveConsumer) => {
    consumer.connectionRevision = owner.connectionRevision;
    return executeResourceSubscriptionOperation(store, definition, consumer, saveConsumer, input, proxy, signal);
  });
}

// The caller must hold the subscription lease until this operation completes.
export async function executeResourceSubscriptionOperation(
  store: TriggerStore,
  definition: ResourceDefinition,
  consumer: TriggerSubscription,
  saveConsumer: () => Promise<void>,
  input: Extract<TriggerRequest, { operation: "resource" }>,
  proxy: ConnectorProxy,
  signal: AbortSignal,
): Promise<IntegrationReconcileResult> {
  const member = consumer.id;
  const owner = {
    tokenId: consumer.tokenId,
    service: consumer.service,
    connectionId: consumer.connectionId,
    triggerId: consumer.triggerId,
    connectionRevision: consumer.connectionRevision,
    providerAccountId: consumer.providerAccountId,
  };
  if (consumer.status === "deleted") {
    if (!input.active) return { outcome: "ready" };
    consumer.status = "active";
    consumer.config = input.config;
    await saveConsumer();
  }
  if (!isDeepStrictEqual(consumer.config, input.config))
    throw new HttpRequestError("invalid_input", "Resource request key is bound to another configuration", 409);
  if (input.active && consumer.status !== "active")
    throw new HttpRequestError("invalid_input", "Resource subscription is being deleted", 409);
  if (!input.active) {
    consumer.status = "deleting";
    await saveConsumer();
  }
  for (const resource of definition.subscriptions(input.config)) {
    const shared = { ...owner, tokenId: "shared-resource" };
    const id = await resourceSubscriptionId(owner, resource.key);
    await store.insertFlowTrigger({
      mode: "resource-set",
      id,
      ...shared,
      requestKey: resource.key,
      config: input.config,
      endpointUrl: "",
      callbackNonce: "",
      callbackSecret: "",
      checkpoint: null,
      subscription: { members: [], ready: false },
      reconcileAt: 0,
      status: "active",
    });
    await withSubscription(store, id, signal, async (record, save) => {
      if (record.status === "abandoned" && input.active) {
        record.status = "active";
        record.subscription = { members: [], ready: false, attempted: true };
      }
      const members = new Set(record.subscription.members as readonly string[]);
      if (input.active) members.add(member);
      else members.delete(member);
      const ready = record.subscription.ready === true;
      let attempted = record.subscription.attempted === true || ready;
      record.subscription = { members: [...members], ready, attempted };
      await save();
      if (members.size > 0 && !ready) {
        attempted = true;
        record.subscription = { members: [...members], ready: false, attempted };
        await save();
        definition.response(await proxy.execute(resource.subscribe, signal));
        record.subscription = { members: [...members], ready: true };
        await save();
      }
      if (members.size === 0 && attempted) {
        record.subscription = { members: [], ready: false, attempted: true };
        await save();
        definition.response(await proxy.execute(resource.unsubscribe, signal));
        record.subscription = { members: [], ready: false };
        await save();
      }
    });
  }
  if (!input.active) consumer.status = "deleted";
  await saveConsumer();
  return { outcome: "ready" };
}

export async function abandonResourceSubscription(
  store: TriggerStore,
  definition: ResourceDefinition,
  consumer: TriggerSubscription,
  signal: AbortSignal,
): Promise<void> {
  for (const resource of definition.subscriptions(consumer.config)) {
    const id = await resourceSubscriptionId(consumer, resource.key);
    if (!(await store.getFlowTrigger(id))) continue;
    await withSubscription(store, id, signal, async (record, save) => {
      const members = (record.subscription.members as readonly string[]).filter((member) => member !== consumer.id);
      record.subscription = { ...record.subscription, members };
      if (members.length === 0) record.status = "abandoned";
      await save();
    });
  }
}
