import type { PollContext, PollDefinition, PollEvent } from "../../triggers/common/poll.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import { createHash } from "node:crypto";
import { isJsonObject } from "../../triggers/common/json.ts";
import {
  eventsPollOutputs,
  maximumPollCheckpointBytes,
  PermanentPollError,
  TransientPollError,
} from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

// Chargebee recommends a five-minute overlap for eventually consistent event indexing.
// Keep the lower bound fixed throughout a paginated scan and bound dedupe state by serialized bytes.
const chargebeeOverlapWindowSeconds = 300;
const chargebeePageSize = 50;
const chargebeeBaselinePageLimit = 6;

const chargebeeCheckpointMarginBytes = 2048;

const chargebeeDigestLength = 11;

type ChargebeeSeen = Map<number, Set<string>>;

interface ChargebeeScan {
  readonly lowerBound: number;
  readonly startedAt: number;
  readonly offset: string;
}

interface ChargebeeCheckpoint {
  readonly baseline: number;

  readonly baselineIds: ReadonlySet<string>;
  readonly scannedAt: number;
  readonly seen: ChargebeeSeen;
  readonly scan: ChargebeeScan | null;
}

interface ChargebeeEventEntry {
  readonly id: string;
  readonly eventType: string;
  readonly occurredAt: number;
  readonly body: Record<string, JsonValue>;
}

function eventDigest(id: string): string {
  return createHash("sha256").update(id).digest("base64url").slice(0, chargebeeDigestLength);
}

function splitDigests(value: string): string[] {
  const digests: string[] = [];
  for (let i = 0; i + chargebeeDigestLength <= value.length; i += chargebeeDigestLength)
    digests.push(value.slice(i, i + chargebeeDigestLength));
  return digests;
}

async function listEvents(
  context: PollContext,
  query: Record<string, string>,
): Promise<{ entries: ChargebeeEventEntry[]; nextOffset?: string }> {
  const response = await context.connector.execute({ endpoint: "/events", method: "GET", query }, context.signal);
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !isJsonObject(response.data) ||
    !Array.isArray(response.data.list)
  ) {
    throw new Error(`Chargebee events poll failed with HTTP ${response.status}.`);
  }
  const entries: ChargebeeEventEntry[] = [];
  for (const entry of response.data.list) {
    if (!isJsonObject(entry) || !isJsonObject(entry.event)) continue;
    const evt = entry.event;
    if (typeof evt.id != "string" || typeof evt.event_type != "string" || typeof evt.occurred_at != "number") continue;
    entries.push({ id: evt.id, eventType: evt.event_type, occurredAt: evt.occurred_at, body: evt });
  }
  const nextOffset =
    typeof response.data.next_offset == "string" && response.data.next_offset.length > 0
      ? response.data.next_offset
      : undefined;
  return { entries, nextOffset };
}

function readCheckpoint(value: JsonValue): ChargebeeCheckpoint | undefined {
  if (!isJsonObject(value)) return undefined;
  if (typeof value.baseline != "number" || typeof value.scannedAt != "number") return undefined;
  if (!isJsonObject(value.seen) || typeof value.baselineIds != "string") return undefined;
  const seen: ChargebeeSeen = new Map();
  for (const [at, digests] of Object.entries(value.seen)) {
    const second = Number(at);
    if (Number.isInteger(second) && typeof digests == "string") seen.set(second, new Set(splitDigests(digests)));
  }
  const scan =
    isJsonObject(value.scan) &&
    typeof value.scan.lowerBound == "number" &&
    typeof value.scan.startedAt == "number" &&
    typeof value.scan.offset == "string"
      ? {
          lowerBound: value.scan.lowerBound,
          startedAt: value.scan.startedAt,
          offset: value.scan.offset,
        }
      : null;
  return {
    baseline: value.baseline,
    baselineIds: new Set(splitDigests(value.baselineIds)),
    scannedAt: value.scannedAt,
    seen,
    scan,
  };
}

function serializeCheckpoint(checkpoint: ChargebeeCheckpoint): JsonValue {
  const fixed = {
    baseline: checkpoint.baseline,
    baselineIds: [...checkpoint.baselineIds].join(""),
    scannedAt: checkpoint.scannedAt,
    seen: {} as Record<string, string>,
    scan: checkpoint.scan ? { ...checkpoint.scan } : null,
  };
  let remaining =
    maximumPollCheckpointBytes - chargebeeCheckpointMarginBytes - Buffer.byteLength(JSON.stringify(fixed));
  const seconds = [...checkpoint.seen.keys()].sort((a, b) => b - a);
  for (const second of seconds) {
    const digests = [...checkpoint.seen.get(second)!];

    const keyCost = String(second).length + 6;
    const fit = Math.min(digests.length, Math.floor((remaining - keyCost) / chargebeeDigestLength));
    if (fit <= 0) break;
    fixed.seen[String(second)] = digests.slice(0, fit).join("");
    remaining -= keyCost + fit * chargebeeDigestLength;
    if (fit < digests.length) break;
  }
  return fixed;
}

function pruneSeen(seen: ChargebeeSeen, lowerBound: number): ChargebeeSeen {
  return new Map([...seen].filter(([second]) => second >= lowerBound));
}

async function buildBaseline(context: PollContext): Promise<ChargebeeCheckpoint> {
  const now = Math.floor(context.now.getTime() / 1000);
  const baselineIds = new Set<string>();
  let offset: string | undefined;
  for (let page = 0; page < chargebeeBaselinePageLimit; page++) {
    const query: Record<string, string> = {
      "limit": String(chargebeePageSize * 2),
      "sort_by[asc]": "occurred_at",
      "occurred_at[after]": String(now - 1),
    };
    if (offset) query.offset = offset;
    const result = await listEvents(context, query);
    let passedBaseline = false;
    for (const entry of result.entries) {
      if (entry.occurredAt > now) {
        passedBaseline = true;
        break;
      }
      if (entry.occurredAt === now) baselineIds.add(eventDigest(entry.id));
    }
    if (passedBaseline || !result.nextOffset)
      return { baseline: now, baselineIds, scannedAt: now, seen: new Map(), scan: null };
    offset = result.nextOffset;
  }
  throw new TransientPollError(
    "Chargebee returned too many events in the baseline second; retry to establish the baseline.",
  );
}

export const chargebeeEvent: PollDefinition = {
  snapshot,
  buildOutputs: eventsPollOutputs,
  async poll(context) {
    if (context.checkpoint === null) {
      return {
        events: [],
        hasMore: false,
        checkpoint: serializeCheckpoint(await buildBaseline(context)),
      };
    }
    const checkpoint = readCheckpoint(context.checkpoint);
    if (!checkpoint) {
      throw new PermanentPollError(
        "Chargebee checkpoint is invalid; recreate the subscription to rebuild the baseline.",
      );
    }

    const scan = checkpoint.scan ?? {
      lowerBound: Math.max(checkpoint.baseline, checkpoint.scannedAt - chargebeeOverlapWindowSeconds),
      startedAt: Math.floor(context.now.getTime() / 1000),
      offset: "",
    };
    const query: Record<string, string> = {
      "limit": String(chargebeePageSize),
      "sort_by[asc]": "occurred_at",
      "occurred_at[after]": String(Math.max(0, scan.lowerBound - 1)),
    };
    if (scan.offset) query.offset = scan.offset;
    const result = await listEvents(context, query);
    const filter = Array.isArray(context.config.eventTypes) ? context.config.eventTypes.map(String) : [];
    const seen: ChargebeeSeen = new Map([...checkpoint.seen].map(([second, digests]) => [second, new Set(digests)]));
    const events: PollEvent[] = [];
    for (const entry of result.entries) {
      if (entry.occurredAt < scan.lowerBound) continue;
      if (filter.length > 0 && !filter.includes(entry.eventType)) continue;
      const digest = eventDigest(entry.id);
      if (entry.occurredAt === checkpoint.baseline && checkpoint.baselineIds.has(digest)) continue;
      let second = seen.get(entry.occurredAt);
      if (second?.has(digest)) continue;
      if (!second) seen.set(entry.occurredAt, (second = new Set()));
      second.add(digest);
      events.push({
        dedupeKey: entry.id,
        payload: {
          eventType: entry.eventType,
          eventId: entry.id,
          occurredAt: entry.occurredAt,
          body: entry.body,
        },
      });
    }
    if (result.nextOffset) {
      return {
        events,
        hasMore: true,
        checkpoint: serializeCheckpoint({
          baseline: checkpoint.baseline,
          baselineIds: checkpoint.baselineIds,
          scannedAt: checkpoint.scannedAt,
          seen: pruneSeen(seen, scan.lowerBound),
          scan: {
            lowerBound: scan.lowerBound,
            startedAt: scan.startedAt,
            offset: result.nextOffset,
          },
        }),
      };
    }
    const nextLowerBound = Math.max(checkpoint.baseline, scan.startedAt - chargebeeOverlapWindowSeconds);
    return {
      events,
      hasMore: false,
      checkpoint: serializeCheckpoint({
        baseline: checkpoint.baseline,

        baselineIds: nextLowerBound > checkpoint.baseline ? new Set() : checkpoint.baselineIds,
        scannedAt: scan.startedAt,
        seen: pruneSeen(seen, nextLowerBound),
        scan: null,
      }),
    };
  },
};
