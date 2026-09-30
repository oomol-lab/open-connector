import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { PermanentIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { additionalSnapshot0 } from "./trigger-on-event.definition.ts";
import { feishuSubscriptions, feishuResponse } from "./trigger-subscriptions.ts";

export const feishuEvents: readonly IntegrationDefinition[] = [
  {
    eventSource: "feishu",
    resources: { subscriptions: (config) => feishuSubscriptions(config, "feishu_app_bot"), response: feishuResponse },
    snapshot: additionalSnapshot0,
    receive(context) {
      if (context.eventSourceId !== context.config.sourceId)
        return { outcome: "respond", status: 404, body: "", contentType: "text/plain" };
      const payload = context.payload;
      if (
        !isJsonObject(payload) ||
        typeof payload.deliveryId !== "string" ||
        payload.deliveryId.length === 0 ||
        typeof payload.event !== "string" ||
        typeof payload.appId !== "string" ||
        typeof payload.tenantKey !== "string" ||
        (payload.occurredAt != null && typeof payload.occurredAt !== "string") ||
        !isJsonObject(payload.body)
      )
        throw new PermanentIntegrationError("Invalid Feishu shared event payload.");
      return { outcome: "event", dedupeKey: payload.deliveryId, outputs: payload };
    },
    async reconcile() {
      throw new PermanentIntegrationError("This deployment does not support shared Feishu event sources.");
    },
  },
];
