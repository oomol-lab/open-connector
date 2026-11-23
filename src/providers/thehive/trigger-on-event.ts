import type { PollContext, PollDefinition, PollEvent, PollResult } from "../../triggers/common/poll.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import { isJsonObject } from "../../triggers/common/json.ts";
import { eventsPollOutputs, PermanentPollError } from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

// Independent creation/update cursors avoid skipping records without updatedAt.
// Re-read boundary IDs instead of persisting offsets that drift as records change.
const thehivePageSize = 50;
const thehiveSeenIdLimit = 500;

type StreamField = "createdAt" | "updatedAt";

interface StreamCursor {
  readonly since: number;
  readonly seenIds: readonly string[];
}

function readCursor(value: JsonValue | undefined): StreamCursor | undefined {
  if (!isJsonObject(value) || typeof value.since != "number") return undefined;
  return {
    since: value.since,
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
  const rangeSize = seenAtSince.size + thehivePageSize;
  const response = await context.connector.execute(
    {
      endpoint: input.endpoint,
      method: "POST",
      query: { range: `0-${rangeSize}`, sort: `+${field}` },
      body: { query: { _gte: { _field: field, _value: cursor.since } } },
    },
    context.signal,
  );
  if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) {
    throw new Error(`TheHive ${resourceType} poll failed with HTTP ${response.status}.`);
  }
  let since = cursor.since;
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
      seenIds = new Set();
    }
    seenIds.add(id);
    const change = field === "createdAt" ? "created" : "updated";
    events.push({
      dedupeKey: `${resourceType}:${id}:${change}:${at}`,
      payload: { resourceType, change, objectId: id, body: item },
    });
  }
  if (seenIds.size > thehiveSeenIdLimit) {
    throw new PermanentPollError(
      `TheHive returned more than ${thehiveSeenIdLimit} ${resourceType} records with the same ${field}; recreate the subscription to rebuild the baseline.`,
    );
  }
  return {
    events,
    cursor: { since, seenIds: [...seenIds] },
    hasMore: budgetReached || response.data.length >= rangeSize,
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
      const baseline: StreamCursor = { since: context.now.getTime(), seenIds: [] };
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
        created: { since: createdPage.cursor.since, seenIds: [...createdPage.cursor.seenIds] },
        updated: { since: updatedPage.cursor.since, seenIds: [...updatedPage.cursor.seenIds] },
      },
    };
  },
};
