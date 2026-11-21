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
    const seenAtSince = new Set(Array.isArray(checkpointObj?.seenIds) ? checkpointObj.seenIds.map(String) : []);
    const offset = typeof checkpointObj?.nextOffset == "string" ? checkpointObj.nextOffset : undefined;
    const query: Record<string, string> = {
      "limit": "50",
      "sort_by[asc]": "occurred_at",
      "occurred_at[after]": String(Math.max(0, since - 1)),
    };
    if (offset) query.offset = offset;
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
    const nextSeenIds = new Set<string>(seenAtSince);
    const events: PollEvent[] = [];
    for (const entry of response.data.list) {
      if (!isJsonObject(entry) || !isJsonObject(entry.event)) continue;
      const evt = entry.event;
      const id = typeof evt.id == "string" ? evt.id : undefined;
      const eventType = typeof evt.event_type == "string" ? evt.event_type : undefined;
      const occurredAt = typeof evt.occurred_at == "number" ? evt.occurred_at : since;
      if (!id || !eventType) continue;
      if (occurredAt < since || (occurredAt === since && seenAtSince.has(id))) continue;
      if (occurredAt > maxOccurredAt) {
        maxOccurredAt = occurredAt;
        nextSeenIds.clear();
      }
      if (occurredAt === maxOccurredAt) nextSeenIds.add(id);
      if (filter.length > 0 && !filter.includes(eventType)) continue;
      events.push({
        dedupeKey: id,
        payload: { eventType, eventId: id, occurredAt, body: evt },
      });
    }
    const nextOffset =
      typeof response.data.next_offset == "string" && response.data.next_offset.length > 0
        ? response.data.next_offset
        : undefined;
    return {
      events,
      hasMore: nextOffset != null,
      checkpoint: {
        occurredAt: maxOccurredAt,
        seenIds: [...nextSeenIds].slice(-100),
        nextOffset: nextOffset ?? null,
      },
    };
  },
};
