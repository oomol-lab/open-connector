import type { PollDefinition, PollEvent } from "../../triggers/common/poll.ts";

import { isJsonObject } from "../../triggers/common/json.ts";
import { eventsPollOutputs } from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

export const chargebeeEvent: PollDefinition = {
  snapshot,
  buildOutputs: eventsPollOutputs,
  async poll(context) {
    const checkpointObj = isJsonObject(context.checkpoint) ? context.checkpoint : undefined;
    const since =
      typeof checkpointObj?.occurredAt == "number"
        ? checkpointObj.occurredAt
        : Math.floor(context.now.getTime() / 1000) - 60;
    const query: Record<string, string> = {
      "limit": "50",
      "sort_by[asc]": "occurred_at",
      "occurred_at[after]": String(since),
    };
    const response = await context.connector.execute({ endpoint: "/events", method: "GET", query }, context.signal);
    if (
      response.status < 200 ||
      response.status >= 300 ||
      !isJsonObject(response.data) ||
      !Array.isArray(response.data.list)
    ) {
      throw new Error(`Chargebee events poll failed with HTTP ${response.status}.`);
    }
    const filter = Array.isArray(context.config.eventTypes) ? context.config.eventTypes.map(String) : [];
    let maxOccurredAt = since;
    const events: PollEvent[] = [];
    for (const entry of response.data.list) {
      if (!isJsonObject(entry) || !isJsonObject(entry.event)) continue;
      const evt = entry.event;
      const id = typeof evt.id == "string" ? evt.id : undefined;
      const eventType = typeof evt.event_type == "string" ? evt.event_type : undefined;
      const occurredAt = typeof evt.occurred_at == "number" ? evt.occurred_at : since;
      if (occurredAt > maxOccurredAt) maxOccurredAt = occurredAt;
      if (!id || !eventType) continue;
      if (filter.length > 0 && !filter.includes(eventType)) continue;
      events.push({
        dedupeKey: id,
        payload: { eventType, eventId: id, occurredAt, body: evt },
      });
    }
    return {
      events,
      checkpoint: { occurredAt: maxOccurredAt },
    };
  },
};
