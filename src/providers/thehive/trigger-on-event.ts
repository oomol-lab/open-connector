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
    const pageOffset =
      typeof checkpointObj?.pageOffset == "number" && checkpointObj.pageOffset > 0 ? checkpointObj.pageOffset : 0;

    // Query both updatedAt and createdAt so newly created alerts/cases without updatedAt are never filtered out.
    const endpoint = resourceType === "case" ? "/api/case/_search" : "/api/alert/_search";
    const response = await context.connector.execute(
      {
        endpoint,
        method: "POST",
        query: {
          range: `${pageOffset}-${pageOffset + thehivePageSize}`,
          sort: "+updatedAt,+createdAt,+_id",
        },
        body: {
          query: {
            _or: [{ _gte: { _field: "updatedAt", _value: since } }, { _gte: { _field: "createdAt", _value: since } }],
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

    const fullPage = response.data.length >= thehivePageSize;
    const sameTimestampFullPage = fullPage && maxUpdatedAt === since;
    const nextPageOffset = sameTimestampFullPage ? pageOffset + response.data.length : 0;
    const hasMore = fullPage && (sameTimestampFullPage || events.length > 0);
    return {
      events,
      hasMore,
      checkpoint: {
        updatedAt: maxUpdatedAt,
        seenIds: [...nextSeenIds].slice(-500),
        pageOffset: nextPageOffset,
      },
    };
  },
};
