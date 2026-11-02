import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { PermanentIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { microsoftTeamsBot } from "../../triggers/sources/microsoft-teams.ts";
import { snapshot } from "./trigger-on-activity.definition.ts";

export const microsoftTeamsBotActivities: IntegrationDefinition = {
  callback: { headers: [], query: [] },
  snapshot,
  eventSource: "microsoft_teams",
  source: microsoftTeamsBot,
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
      throw new PermanentIntegrationError("Invalid shared Teams activity.");
    return { outcome: "event", dedupeKey: payload.deliveryId, outputs: payload };
  },
  async reconcile() {
    throw new PermanentIntegrationError("This deployment does not support shared Teams event sources.");
  },
};
