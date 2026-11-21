import type { PollDefinition, PollEvent, PollResult } from "../../triggers/common/poll.ts";

import { isJsonObject } from "../../triggers/common/json.ts";
import { eventsPollOutputs } from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

const thehiveStreamPageSize = 25;
// Records at a timestamp older than this are assumed fully indexed, so the cursor can step past it.
const thehiveSettleMs = 60_000;

interface StreamCursor {
  ts: number;
  offset: number;
  seenIds: string[];
}

function readStreamCursor(
  checkpoint: Record<string, unknown> | undefined,
  tsKey: "createdAt" | "updatedAt",
  offsetKey: "createdOffset" | "updatedOffset",
  seenKey: "createdSeenIds" | "updatedSeenIds",
  fallbackTs: number,
): StreamCursor {
  const ts = typeof checkpoint?.[tsKey] == "number" ? checkpoint[tsKey] : fallbackTs;
  const offset = typeof checkpoint?.[offsetKey] == "number" && checkpoint[offsetKey] > 0 ? checkpoint[offsetKey] : 0;
  const seenIds = Array.isArray(checkpoint?.[seenKey]) ? checkpoint[seenKey].map(String) : [];
  return { ts, offset, seenIds };
}

export const thehiveEvent: PollDefinition = {
  snapshot,
  buildOutputs: eventsPollOutputs,
  async poll(context): Promise<PollResult> {
    const resourceType = String(context.config.resourceType) === "case" ? "case" : "alert";
    const checkpointObj = isJsonObject(context.checkpoint) ? context.checkpoint : undefined;
    const settledBefore = context.now.getTime() - thehiveSettleMs;
    const defaultTs = settledBefore;
    const updatedCursor = readStreamCursor(checkpointObj, "updatedAt", "updatedOffset", "updatedSeenIds", defaultTs);
    const createdCursor = readStreamCursor(
      checkpointObj,
      "createdAt",
      "createdOffset",
      "createdSeenIds",
      updatedCursor.ts,
    );

    const endpoint = resourceType === "case" ? "/api/case/_search" : "/api/alert/_search";
    const streams: ReadonlyArray<{ field: "createdAt" | "updatedAt"; cursor: StreamCursor }> = [
      { field: "createdAt", cursor: createdCursor },
      { field: "updatedAt", cursor: updatedCursor },
    ];

    const emittedKeys = new Set<string>();
    const events: PollEvent[] = [];
    let hasMore = false;
    const nextCursors: Record<"createdAt" | "updatedAt", StreamCursor> = {
      createdAt: { ts: createdCursor.ts, offset: createdCursor.offset, seenIds: [...createdCursor.seenIds] },
      updatedAt: { ts: updatedCursor.ts, offset: updatedCursor.offset, seenIds: [...updatedCursor.seenIds] },
    };

    for (const { field, cursor } of streams) {
      // Only use v0-registered fields (`createdAt` / `updatedAt`) in filter and sort.
      const response = await context.connector.execute(
        {
          endpoint,
          method: "POST",
          query: {
            range: `${cursor.offset}-${cursor.offset + thehiveStreamPageSize}`,
            sort: `+${field}`,
          },
          body: {
            query: { _gte: { _field: field, _value: cursor.ts } },
          },
        },
        context.signal,
      );
      if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) {
        throw new Error(`TheHive ${resourceType} poll failed with HTTP ${response.status}.`);
      }

      const seenSet = new Set(cursor.seenIds);
      let maxTs = cursor.ts;
      // IDs observed in this page at the highest timestamp, including already-seen ones.
      let boundaryIds = new Set<string>();

      for (const item of response.data) {
        if (!isJsonObject(item)) continue;
        const id = String(item.id ?? item._id ?? "");
        const rawTs = item[field];
        const ts = typeof rawTs === "number" ? rawTs : Number(rawTs);
        if (!id || !Number.isFinite(ts) || ts < cursor.ts) continue;

        if (ts > maxTs) {
          maxTs = ts;
          boundaryIds = new Set();
        }
        if (ts === maxTs) boundaryIds.add(id);
        if (ts === cursor.ts && seenSet.has(id)) continue;

        const effectiveTs = Number(item.updatedAt ?? item.createdAt ?? ts);
        const dedupeKey = `${resourceType}:${id}:${effectiveTs}`;
        if (!emittedKeys.has(dedupeKey)) {
          emittedKeys.add(dedupeKey);
          events.push({
            dedupeKey,
            payload: { resourceType, objectId: id, body: item },
          });
        }
      }

      // The v0 search API cannot sort or filter by `_id`, so records sharing the boundary
      // timestamp are paged by offset, and the offset only advances past a full page that sits
      // entirely on the boundary. A persisted offset would drift if a tied record is updated or
      // deleted, so once a page is not full and the boundary timestamp has settled, the cursor
      // steps to `ts + 1` and drops the offset and `seenIds`. A non-zero offset therefore only
      // survives an active `hasMore` drain or a boundary younger than `thehiveSettleMs`, where
      // `seenIds` (bounded by one page) still catch late arrivals at the same timestamp.
      const fullPage = response.data.length >= thehiveStreamPageSize;
      if (!fullPage && maxTs < settledBefore) {
        nextCursors[field] = { ts: maxTs + 1, offset: 0, seenIds: [] };
      } else if (maxTs !== cursor.ts) {
        nextCursors[field] = { ts: maxTs, offset: 0, seenIds: [...boundaryIds] };
      } else if (fullPage) {
        nextCursors[field] = { ts: maxTs, offset: cursor.offset + response.data.length, seenIds: [...boundaryIds] };
      } else {
        nextCursors[field] = {
          ts: maxTs,
          offset: cursor.offset,
          seenIds: [...new Set([...cursor.seenIds, ...boundaryIds])],
        };
      }
      if (fullPage) hasMore = true;
    }

    return {
      events,
      hasMore,
      checkpoint: {
        createdAt: nextCursors.createdAt.ts,
        createdOffset: nextCursors.createdAt.offset,
        createdSeenIds: nextCursors.createdAt.seenIds,
        updatedAt: nextCursors.updatedAt.ts,
        updatedOffset: nextCursors.updatedAt.offset,
        updatedSeenIds: nextCursors.updatedAt.seenIds,
      },
    };
  },
};
