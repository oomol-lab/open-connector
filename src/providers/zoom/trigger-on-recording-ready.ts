import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { PermanentIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { webhookRequest } from "../../triggers/managed-webhook.ts";
import { zoomApplication } from "../../triggers/sources/zoom.ts";
import { snapshot } from "./trigger-on-recording-ready.definition.ts";

export const zoomRecordingReady: IntegrationDefinition = {
  snapshot,
  eventSource: "zoom",
  source: zoomApplication,
  async sourceIdentity(context) {
    const result = await webhookRequest(context, { method: "GET", endpoint: "/users/me" });
    if (
      !context.connector.providerAccountId ||
      !isJsonObject(result.data) ||
      typeof result.data.id !== "string" ||
      !result.data.id ||
      typeof result.data.account_id !== "string" ||
      !result.data.account_id
    )
      throw new PermanentIntegrationError("Zoom did not return a verified user and account identity.");
    return {
      accountId: context.connector.providerAccountId,
      userId: result.data.id,
      zoomAccountId: result.data.account_id,
    };
  },
  receive(context) {
    if (context.eventSourceId !== context.config.sourceId)
      return { outcome: "respond", status: 404, body: "", contentType: "text/plain" };
    const payload = context.payload;
    if (
      !isJsonObject(payload) ||
      typeof payload.deliveryId !== "string" ||
      !payload.deliveryId ||
      !isJsonObject(payload.body)
    )
      throw new PermanentIntegrationError("Invalid shared Zoom event.");
    return { outcome: "event", dedupeKey: payload.deliveryId, outputs: payload };
  },
  async reconcile() {
    throw new PermanentIntegrationError("This deployment does not support shared Zoom event sources.");
  },
};
