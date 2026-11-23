import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-form-entry.definition.ts";

export const wufooFormEntry: IntegrationDefinition = {
  callback: { headers: [], query: [] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const formHash = encodeURIComponent(String(context.config.formHash));
    const putWebhook = async () => {
      const formBody = new URLSearchParams({
        url: context.endpointUrl,
        handshakeKey: context.callbackSecret,
        metadata: "true",
      }).toString();
      const response = await webhookRequest(context, {
        endpoint: `/forms/${formHash}/webhooks.json`,
        method: "PUT",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: formBody,
      });
      const webhookResult =
        isJsonObject(response.data) && isJsonObject(response.data.WebHookPutResult)
          ? response.data.WebHookPutResult
          : undefined;
      const hash = typeof webhookResult?.Hash == "string" ? webhookResult.Hash : undefined;
      if (!hash) {
        throw new TransientIntegrationError("Wufoo webhook creation returned no hash.");
      }
      return { id: hash, secret: context.callbackSecret };
    };
    return reconcileManagedWebhook(context, {
      async find() {
        const existingId = context.state?.subscription.hookId;
        if (context.state?.subscription.creating === true || (context.active && typeof existingId == "string")) {
          return [await putWebhook()];
        }
        return typeof existingId == "string" ? [{ id: existingId, secret: context.callbackSecret }] : [];
      },
      async create() {
        return putWebhook();
      },
      async remove(id) {
        await webhookRequest(context, {
          endpoint: `/forms/${formHash}/webhooks/${encodeURIComponent(id)}.json`,
          method: "DELETE",
        });
      },
    });
  },
  receive(context) {
    const body = context.payload;
    if (!isJsonObject(body)) {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const handshakeKey = typeof body.HandshakeKey == "string" ? body.HandshakeKey : undefined;
    if (!sameSecret(handshakeKey, context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const entryId = String(body.EntryId ?? body.entryId ?? "");
    if (!entryId) {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const { HandshakeKey: _redacted, ...sanitizedBody } = body;
    return {
      outcome: "event",
      dedupeKey: entryId,
      outputs: {
        entryId,
        formHash: String(context.config.formHash ?? ""),
        body: sanitizedBody,
      },
    };
  },
};
