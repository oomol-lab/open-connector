import type { PollDefinition, PollEvent, PollResult } from "../../triggers/common/poll.ts";

import { isJsonObject } from "../../triggers/common/json.ts";
import { eventsPollOutputs } from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

const thehivePageSize = 50;

export const thehiveEvent: PollDefinition = {
  snapshot,
  buildOutputs: eventsPollOutputs,
  async poll(context): Promise<PollResult> {
    const resourceType = String(context.config.resourceType) === "case" ? "case" : "alert";
    const checkpointObj = isJsonObject(context.checkpoint) ? context.checkpoint : undefined;
    const since =
      typeof checkpointObj?.updatedAt == "number" ? checkpointObj.updatedAt : context.now.getTime() - 60_000;
    const seenAtSince = new Set(Array.isArray(checkpointObj?.seenIds) ? checkpointObj.seenIds.map(String) : []);

    // Use ascending updatedAt cursor search so deletions never shift offsets and skip unread records.
    const endpoint = resourceType === "case" ? "/api/case/_search" : "/api/alert/_search";
    const response = await context.connector.execute(
      {
        endpoint,
        method: "POST",
        query: { range: `0-${thehivePageSize}`, sort: "+updatedAt" },
        body: {
          query: {
            _gte: { _field: "updatedAt", _value: since },
          },
        },
      },
      context.signal,
    );
    if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) {
      throw new Error(`TheHive ${resourceType} poll failed with HTTP ${response.status}.`);
    }

    let maxUpdatedAt = since;
    const nextSeenIds = new Set<string>(seenAtSince);
    const events: PollEvent[] = [];
    for (const item of response.data) {
      if (!isJsonObject(item)) continue;
      const id = String(item.id ?? item._id ?? "");
      const updatedAt = Number(item.updatedAt ?? item.createdAt ?? 0);
      if (!id || !Number.isFinite(updatedAt) || updatedAt < since) continue;
      if (updatedAt === since && seenAtSince.has(id)) continue;
      if (updatedAt > maxUpdatedAt) {
        maxUpdatedAt = updatedAt;
        nextSeenIds.clear();
      }
      if (updatedAt === maxUpdatedAt) nextSeenIds.add(id);
      events.push({
        dedupeKey: `${resourceType}:${id}:${updatedAt}`,
        payload: { resourceType, objectId: id, body: item },
      });
    }

    const hasMore = response.data.length >= thehivePageSize && events.length > 0;
    return {
      events,
      hasMore,
      checkpoint: {
        updatedAt: maxUpdatedAt,
        seenIds: [...nextSeenIds].slice(-200),
      },
    };
  },
};
