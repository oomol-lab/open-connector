import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { verifyHexHmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-repo-event.definition.ts";

export const bitbucketRepoEvent: IntegrationDefinition = {
  callback: { headers: ["x-event-key", "x-hook-uuid", "x-request-uuid", "x-hub-signature"], query: [] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const workspace = encodeURIComponent(String(context.config.workspace));
    const repoSlug = encodeURIComponent(String(context.config.repoSlug));
    const hooksPath = `/repositories/${workspace}/${repoSlug}/hooks`;
    const configuredEvents = Array.isArray(context.config.events) ? context.config.events.map(String) : [];
    const expected = [...configuredEvents].sort();
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, { endpoint: hooksPath, method: "GET" });
        if (!isJsonObject(response.data) || !Array.isArray(response.data.values)) {
          throw new TransientIntegrationError("Bitbucket returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data.values) {
          if (!isJsonObject(item) || typeof item.url != "string") continue;
          if (item.url != context.endpointUrl) continue;
          const itemEvents = Array.isArray(item.events) ? item.events.map(String).sort() : [];
          if (
            typeof item.uuid != "string" ||
            item.active !== true ||
            JSON.stringify(itemEvents) != JSON.stringify(expected)
          ) {
            throw new PermanentIntegrationError("Bitbucket webhook settings differ from this subscription.");
          }
          found.push({ id: item.uuid, secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: hooksPath,
          method: "POST",
          body: {
            description: "OOMOL Open Flow webhook",
            url: context.endpointUrl,
            active: true,
            events: configuredEvents,
            secret: context.callbackSecret,
          },
        });
        if (!isJsonObject(response.data) || typeof response.data.uuid != "string") {
          throw new TransientIntegrationError("Bitbucket webhook creation returned no identity.");
        }
        return { id: response.data.uuid, secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `${hooksPath}/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
  },
  async receive(context) {
    const signatureHeader = context.header("x-hub-signature");
    const signature = signatureHeader?.startsWith("sha256=") ? signatureHeader.slice("sha256=".length) : undefined;
    if (!(await verifyHexHmac(context.callbackSecret, [context.rawBody], signature))) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const event = context.header("x-event-key");
    const deliveryId = context.header("x-request-uuid");
    const hookUuid = context.header("x-hook-uuid") ?? "";
    if (!event || !deliveryId || !isJsonObject(context.payload)) {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const configuredEvents = Array.isArray(context.config.events) ? context.config.events.map(String) : [];
    if (!configuredEvents.includes(event)) {
      return { outcome: "ignored", reason: "Bitbucket event is not subscribed." };
    }
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: { event, deliveryId, hookUuid, body: context.payload },
    };
  },
};
