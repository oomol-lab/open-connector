import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { PermanentIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { slackApplication } from "../../triggers/sources/slack.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

export const slackBotEvents: IntegrationDefinition = {
  snapshot,
  eventSource: "slack",
  source: slackApplication,
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
      throw new PermanentIntegrationError("Invalid shared Slack event.");
    return { outcome: "event", dedupeKey: payload.deliveryId, outputs: payload };
  },
  async reconcile() {
    throw new PermanentIntegrationError("This deployment does not support shared Slack event sources.");
  },
};
