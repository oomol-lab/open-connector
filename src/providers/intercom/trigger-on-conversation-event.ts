import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { PermanentIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { intercomApplication } from "../../triggers/sources/intercom.ts";
import { snapshot } from "./trigger-on-conversation-event.definition.ts";

export const intercomConversationEvents: IntegrationDefinition = {
  snapshot,
  eventSource: "intercom",
  source: intercomApplication,
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
      throw new PermanentIntegrationError("Invalid shared Intercom event.");
    return { outcome: "event", dedupeKey: payload.deliveryId, outputs: payload };
  },
  async reconcile() {
    throw new PermanentIntegrationError("This deployment does not support shared Intercom event sources.");
  },
};
