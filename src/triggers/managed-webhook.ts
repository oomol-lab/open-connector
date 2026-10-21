import type { IntegrationReconcileContext, IntegrationReconcileResult } from "./common/integration.ts";
import type { ConnectorProxyRequest, ConnectorProxyResult } from "./common/proxy.ts";
import type { JsonValue } from "./common/types.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "./common/integration.ts";

export interface ManagedWebhook {
  readonly id: string;
  readonly secret: string;
}

export async function webhookRequest(
  context: Pick<IntegrationReconcileContext, "connector" | "signal">,
  request: ConnectorProxyRequest,
): Promise<ConnectorProxyResult> {
  context.signal?.throwIfAborted();
  const result = await context.connector.execute(request, context.signal);
  context.signal?.throwIfAborted();
  if ((result.status >= 200 && result.status < 300) || (request.method == "DELETE" && result.status == 404))
    return result;
  const message = `Webhook ${request.method} request failed (HTTP ${result.status}). Check resource access and webhook permissions.`;
  if (result.status >= 400 && result.status < 500 && result.status != 429) throw new PermanentIntegrationError(message);
  throw new TransientIntegrationError(message);
}

export async function reconcileManagedWebhook(
  context: IntegrationReconcileContext,
  operations: {
    readonly find: () => Promise<readonly ManagedWebhook[]>;
    readonly create: () => Promise<ManagedWebhook>;
    readonly remove: (id: string) => Promise<void>;
    readonly align?: (id: string) => Promise<void>;
  },
): Promise<IntegrationReconcileResult> {
  const state = context.state;
  if (state == null) throw new PermanentIntegrationError("Webhook subscription state is missing.");
  const matches = await operations.find();
  if (matches.length > 1)
    throw new PermanentIntegrationError(
      "Multiple webhooks match this subscription. Remove duplicates before retrying.",
    );
  let hook = matches[0];
  if (!context.active) {
    if (hook != null) await operations.remove(hook.id);
    else if (state.subscription.creating === true)
      throw new PermanentIntegrationError(
        "Webhook creation has an uncertain outcome. Verify the remote subscription before cleanup.",
      );
    await state.saveSubscription({}, new Date(context.now.getTime() + 86_400_000));
    return { outcome: "ready" };
  }
  if (hook == null) {
    if (state.subscription.creating === true)
      throw new PermanentIntegrationError(
        "Webhook creation has an uncertain outcome. Verify the remote subscription before retrying.",
      );
    await state.saveSubscription({ creating: true }, context.now);
    try {
      hook = await operations.create();
    } catch (error) {
      // A definite rejection did not create a resource; transport and malformed-response errors remain uncertain.
      if (error instanceof PermanentIntegrationError) await state.saveSubscription({}, context.now);
      throw error;
    }
  }
  const subscription: Record<string, JsonValue> = { hookId: hook.id, secret: hook.secret };
  await state.saveSubscription(subscription, context.now);
  await operations.align?.(hook.id);
  await state.saveSubscription(subscription, new Date(context.now.getTime() + 86_400_000));
  return { outcome: "ready" };
}
