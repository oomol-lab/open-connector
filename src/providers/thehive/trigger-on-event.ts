import type { PollContext, PollDefinition, PollEvent, PollResult } from "../../triggers/common/poll.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import { isJsonObject } from "../../triggers/common/json.ts";
import { eventsPollOutputs, PermanentPollError } from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

const thehivePageSize = 50;
const thehiveSeenIdLimit = 500;

type StreamField = "createdAt" | "updatedAt";

interface StreamCursor {
  readonly since: number;
  readonly seenIds: readonly string[];
  readonly offset?: number;
}

function readCursor(value: JsonValue | undefined): StreamCursor | undefined {
  if (!isJsonObject(value) || typeof value.since != "number") return undefined;
  return {
    since: value.since,
    offset: typeof value.offset === "number" ? value.offset : 0,
    seenIds: Array.isArray(value.seenIds) ? value.seenIds.map(String) : [],
  };
}

async function pollStream(
  context: PollContext,
  input: {
    readonly endpoint: string;
    readonly resourceType: string;
    readonly field: StreamField;
    readonly cursor: StreamCursor;
  },
): Promise<{ events: PollEvent[]; cursor: StreamCursor; hasMore: boolean }> {
  const { field, cursor, resourceType } = input;
  const seenAtSince = new Set(cursor.seenIds);
  const offset = cursor.offset ?? 0;
  const rangeSize = seenAtSince.size + thehivePageSize;
  const response = await context.connector.execute(
    {
      endpoint: input.endpoint,
      method: "POST",
      query: { range: `${offset}-${offset + rangeSize}`, sort: `+${field}` },
      body: { query: { _gte: { _field: field, _value: cursor.since } } },
    },
    context.signal,
  );
  if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) {
    throw new Error(`TheHive ${resourceType} poll failed with HTTP ${response.status}.`);
  }
  let since = cursor.since;
  let nextOffset = offset;
  let seenIds = new Set(seenAtSince);
  const events: PollEvent[] = [];
  let budgetReached = false;
  for (const item of response.data) {
    if (events.length >= thehivePageSize) {
      budgetReached = true;
      break;
    }
    if (!isJsonObject(item)) continue;
    const id = String(item._id ?? item.id ?? "");
    const at = item[field];
    if (!id || typeof at != "number" || at < cursor.since) continue;
    if (at === cursor.since && seenAtSince.has(id)) continue;
    if (at > since) {
      since = at;
      nextOffset = 0;
      seenIds = new Set();
    }
    seenIds.add(id);
    const change = field === "createdAt" ? "created" : "updated";
    events.push({
      dedupeKey: `${resourceType}:${id}:${change}:${at}`,
      payload: { resourceType, change, objectId: id, body: item },
    });
  }
  if (nextOffset > 0 || seenIds.size > thehiveSeenIdLimit) {
    nextOffset += seenIds.size;
    seenIds = new Set();
  }
  const hasMore = budgetReached || response.data.length >= rangeSize;
  if (nextOffset > 0 && !hasMore) {
    since += 1;
    nextOffset = 0;
    seenIds = new Set();
  }
  return {
    events,
    cursor: { since, seenIds: [...seenIds], offset: nextOffset },
    hasMore,
  };
}

export const thehiveEvent: PollDefinition = {
  snapshot,
  buildOutputs: eventsPollOutputs,
  async poll(context): Promise<PollResult> {
    const resourceType = String(context.config.resourceType) === "case" ? "case" : "alert";
    const checkpointObj = isJsonObject(context.checkpoint) ? context.checkpoint : undefined;
    const created = readCursor(checkpointObj?.created);
    const updated = readCursor(checkpointObj?.updated);
    if (context.checkpoint === null) {
      const baseline: StreamCursor = { since: context.now.getTime(), seenIds: [], offset: 0 };
      return {
        events: [],
        hasMore: false,
        checkpoint: { created: { ...baseline }, updated: { ...baseline } },
      };
    }
    if (created == null || updated == null) {
      throw new PermanentPollError(
        "TheHive checkpoint is missing a cursor; recreate the subscription to rebuild the baseline.",
      );
    }
    const endpoint = resourceType === "case" ? "/api/case/_search" : "/api/alert/_search";
    const createdPage = await pollStream(context, {
      endpoint,
      resourceType,
      field: "createdAt",
      cursor: created,
    });
    const updatedPage = await pollStream(context, {
      endpoint,
      resourceType,
      field: "updatedAt",
      cursor: updated,
    });
    return {
      events: [...createdPage.events, ...updatedPage.events],
      hasMore: createdPage.hasMore || updatedPage.hasMore,
      checkpoint: {
        created: { ...createdPage.cursor },
        updated: { ...updatedPage.cursor },
      },
    };
  },
};
