import type { PollDefinition, PollEvent, PollResult } from "../../triggers/common/poll.ts";

import { isJsonObject } from "../../triggers/common/json.ts";
import { eventsPollOutputs } from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

const thehiveStreamPageSize = 25;

interface StreamCursor {
  ts: number;
  lastId: string | null;
}

function buildStreamQuery(field: "createdAt" | "updatedAt", cursor: StreamCursor): Record<string, unknown> {
  if (cursor.lastId === null) {
    return { _gte: { _field: field, _value: cursor.ts } };
  }
  return {
    _or: [
      { _gt: { _field: field, _value: cursor.ts } },
      {
        _and: [{ _eq: { _field: field, _value: cursor.ts } }, { _gt: { _field: "_id", _value: cursor.lastId } }],
      },
    ],
  };
}

function isAfterCursor(ts: number, id: string, cursor: StreamCursor): boolean {
  if (ts > cursor.ts) return true;
  if (ts < cursor.ts) return false;
  return cursor.lastId === null || id > cursor.lastId;
}

export const thehiveEvent: PollDefinition = {
  snapshot,
  buildOutputs: eventsPollOutputs,
  async poll(context): Promise<PollResult> {
    const resourceType = String(context.config.resourceType) === "case" ? "case" : "alert";
    const checkpointObj = isJsonObject(context.checkpoint) ? context.checkpoint : undefined;
    const defaultTs = context.now.getTime() - 60_000;
    const updatedCursor: StreamCursor = {
      ts: typeof checkpointObj?.updatedAt == "number" ? checkpointObj.updatedAt : defaultTs,
      lastId: typeof checkpointObj?.lastUpdatedId == "string" ? checkpointObj.lastUpdatedId : null,
    };
    const createdCursor: StreamCursor = {
      ts: typeof checkpointObj?.createdAt == "number" ? checkpointObj.createdAt : updatedCursor.ts,
      lastId: typeof checkpointObj?.lastCreatedId == "string" ? checkpointObj.lastCreatedId : null,
    };

    const endpoint = resourceType === "case" ? "/api/case/_search" : "/api/alert/_search";
    const streams: ReadonlyArray<{ field: "createdAt" | "updatedAt"; cursor: StreamCursor }> = [
      { field: "createdAt", cursor: createdCursor },
      { field: "updatedAt", cursor: updatedCursor },
    ];

    const emittedKeys = new Set<string>();
    const events: PollEvent[] = [];
    let hasMore = false;
    const nextCursors: Record<"createdAt" | "updatedAt", StreamCursor> = {
      createdAt: { ...createdCursor },
      updatedAt: { ...updatedCursor },
    };

    for (const { field, cursor } of streams) {
      const response = await context.connector.execute(
        {
          endpoint,
          method: "POST",
          query: {
            range: `0-${thehiveStreamPageSize}`,
            sort: `+${field},+_id`,
          },
          body: {
            query: buildStreamQuery(field, cursor),
          },
        },
        context.signal,
      );
      if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) {
        throw new Error(`TheHive ${resourceType} poll failed with HTTP ${response.status}.`);
      }

      let advanced = false;
      for (const item of response.data) {
        if (!isJsonObject(item)) continue;
        const id = String(item.id ?? item._id ?? "");
        const rawTs = item[field];
        const ts = typeof rawTs === "number" ? rawTs : Number(rawTs);
        if (!id || !Number.isFinite(ts) || !isAfterCursor(ts, id, nextCursors[field])) continue;

        nextCursors[field] = { ts, lastId: id };
        advanced = true;

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

      if (response.data.length >= thehiveStreamPageSize && advanced) {
        hasMore = true;
      }
    }

    return {
      events,
      hasMore,
      checkpoint: {
        createdAt: nextCursors.createdAt.ts,
        lastCreatedId: nextCursors.createdAt.lastId,
        updatedAt: nextCursors.updatedAt.ts,
        lastUpdatedId: nextCursors.updatedAt.lastId,
      },
    };
  },
};
