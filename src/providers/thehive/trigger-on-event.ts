import type { PollDefinition, PollEvent, PollResult } from "../../triggers/common/poll.ts";

import { isJsonObject } from "../../triggers/common/json.ts";
import { eventsPollOutputs } from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

const thehivePageSize = 50;
const thehiveMaxPagesPerPoll = 10;

export const thehiveEvent: PollDefinition = {
  snapshot,
  buildOutputs: eventsPollOutputs,
  async poll(context): Promise<PollResult> {
    const resourceType = String(context.config.resourceType) === "case" ? "case" : "alert";
    const checkpointObj = isJsonObject(context.checkpoint) ? context.checkpoint : undefined;
    const since =
      typeof checkpointObj?.updatedAt == "number" ? checkpointObj.updatedAt : context.now.getTime() - 60_000;
    const seenAtSince = new Set(Array.isArray(checkpointObj?.seenIds) ? checkpointObj.seenIds.map(String) : []);
    const startOffset = typeof checkpointObj?.pendingOffset == "number" ? checkpointObj.pendingOffset : 0;
    const pendingMaxUpdatedAt =
      typeof checkpointObj?.pendingMaxUpdatedAt == "number" ? checkpointObj.pendingMaxUpdatedAt : since;
    const pendingSeenIds = new Set(
      Array.isArray(checkpointObj?.pendingSeenIds) ? checkpointObj.pendingSeenIds.map(String) : seenAtSince,
    );

    const endpoint = resourceType === "case" ? "/api/case" : "/api/alert";
    let maxUpdatedAt = pendingMaxUpdatedAt;
    const nextSeenIds = new Set<string>(pendingSeenIds);
    const events: PollEvent[] = [];
    let offset = startOffset;
    let hasMore = false;

    for (let page = 0; page < thehiveMaxPagesPerPoll; page++) {
      const response = await context.connector.execute(
        { endpoint, method: "GET", query: { range: `${offset}-${offset + thehivePageSize}`, sort: "-updatedAt" } },
        context.signal,
      );
      if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) {
        throw new Error(`TheHive ${resourceType} poll failed with HTTP ${response.status}.`);
      }
      let reachedOlder = false;
      for (const item of response.data) {
        if (!isJsonObject(item)) continue;
        const id = String(item.id ?? item._id ?? "");
        const updatedAt = Number(item.updatedAt ?? item.createdAt ?? 0);
        if (!id || !Number.isFinite(updatedAt)) continue;
        if (updatedAt < since) {
          reachedOlder = true;
          continue;
        }
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
      offset += response.data.length;
      if (reachedOlder || response.data.length < thehivePageSize) {
        hasMore = false;
        break;
      }
      hasMore = true;
    }

    if (hasMore) {
      return {
        events,
        hasMore: true,
        checkpoint: {
          updatedAt: since,
          seenIds: [...seenAtSince].slice(-200),
          pendingOffset: offset,
          pendingMaxUpdatedAt: maxUpdatedAt,
          pendingSeenIds: [...nextSeenIds].slice(-200),
        },
      };
    }

    return {
      events,
      hasMore: false,
      checkpoint: {
        updatedAt: maxUpdatedAt,
        seenIds: [...nextSeenIds].slice(-200),
      },
    };
  },
};
