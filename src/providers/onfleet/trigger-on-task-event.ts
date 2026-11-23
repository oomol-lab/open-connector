import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret, verifyHexHmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-task-event.definition.ts";

const triggerNameToId: Record<string, number> = {
  taskStarted: 0,
  taskEta: 1,
  taskArrival: 2,
  taskCompleted: 3,
  taskFailed: 4,
  workerDuty: 5,
  taskCreated: 6,
  taskUpdated: 7,
  taskDeleted: 8,
  taskAssigned: 9,
  taskUnassigned: 10,
  taskDelayed: 12,
  taskCloned: 13,
};

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("of_token", token);
  return url.toString();
}

async function verifyOnfleetSignature(
  secret: string,
  rawBody: Uint8Array,
  signature: string | undefined,
): Promise<boolean> {
  if (!signature) return false;
  const key = Buffer.from(secret, "hex");
  if (key.length === 0) return false;
  return verifyHexHmac(key, [rawBody], signature, "SHA-512");
}

export const onfleetTaskEvent: IntegrationDefinition = {
  callback: { headers: ["x-onfleet-signature"], query: ["check", "of_token"] },
  handshake(input) {
    if (input.method.toUpperCase() !== "GET") return undefined;
    if (input.callbackSecret && !sameSecret(input.query?.of_token, input.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    return {
      outcome: "respond",
      status: 200,
      body: input.query?.check ?? "",
      contentType: "text/plain",
    };
  },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const triggerName = String(context.config.trigger);
    const triggerId = triggerNameToId[triggerName];
    if (triggerId === undefined) {
      throw new PermanentIntegrationError(`Unsupported Onfleet trigger: ${triggerName}`);
    }
    const webhookUrl = withCallbackToken(context.endpointUrl, context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, { endpoint: "/webhooks", method: "GET" });
        if (!Array.isArray(response.data)) {
          throw new TransientIntegrationError("Onfleet returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data) {
          if (!isJsonObject(item) || typeof item.url != "string") continue;
          if (item.url !== webhookUrl) continue;
          if (typeof item.id != "string") {
            throw new PermanentIntegrationError("Onfleet webhook entry is missing an ID.");
          }
          if (context.active && (item.trigger !== triggerId || item.isEnabled === false)) {
            throw new PermanentIntegrationError(
              "Onfleet webhook settings differ from this subscription or the webhook is disabled.",
            );
          }
          found.push({ id: item.id, secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: "/webhooks",
          method: "POST",
          body: {
            url: webhookUrl,
            trigger: triggerId,
            name: "OOMOL Open Flow webhook",
          },
        });
        if (!isJsonObject(response.data) || typeof response.data.id != "string") {
          throw new TransientIntegrationError("Onfleet webhook creation returned no identity.");
        }
        return { id: response.data.id, secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, {
          endpoint: `/webhooks/${encodeURIComponent(id)}`,
          method: "DELETE",
        });
      },
    });
  },
  async receive(context) {
    if (!sameSecret(context.query("of_token"), context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    if (context.method.toUpperCase() === "GET") {
      const check = context.query("check") ?? "";
      return { outcome: "respond", status: 200, body: check, contentType: "text/plain" };
    }
    const webhookSecret = context.connector.credentialValues?.webhookSecret;
    if (
      webhookSecret &&
      !(await verifyOnfleetSignature(webhookSecret, context.rawBody, context.header("x-onfleet-signature")))
    ) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const body = context.payload;
    if (!isJsonObject(body) || typeof body.triggerName != "string") {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    if (body.triggerName != String(context.config.trigger)) {
      return { outcome: "ignored", reason: "Onfleet trigger name does not match." };
    }
    const taskId = typeof body.taskId == "string" ? body.taskId : "";
    const entityId = body.triggerName === "workerDuty" ? String(body.workerId ?? "") : taskId;
    const deliveryId = `${body.triggerName}:${entityId}:${String(body.time ?? "")}`;
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: { triggerName: body.triggerName, deliveryId, taskId, body },
    };
  },
};
