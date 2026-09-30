import type { TriggerConfigOption, TriggerConfigOptionsContext } from "./configOptions.ts";
import type { ConnectorProxy } from "./proxy.ts";
import type { JsonValue, TriggerKeySnapshot } from "./types.ts";

export const maximumPollCheckpointBytes: number = 64 * 1024;
export const maximumPollDedupeKeyBytes = 1024;
export const maximumPollEventsPerPage = 100;

export interface PollEvent {
  readonly dedupeKey: string;
  readonly payload: Readonly<Record<string, JsonValue>>;
}

export interface PollResult {
  readonly checkpoint: JsonValue;
  readonly events: readonly PollEvent[];
  readonly filtered?: number;
  readonly hasMore?: boolean;
}

export interface PollContext {
  readonly checkpoint: JsonValue;

  readonly config: Readonly<Record<string, JsonValue>>;
  readonly connector: ConnectorProxy;
  readonly now: Date;
  readonly signal?: AbortSignal;
}

export function eventsPollOutputs(events: readonly PollEvent[]): Readonly<Record<string, JsonValue>> {
  return { events: events.map((event) => event.payload) };
}

export interface PollDefinition {
  readonly buildOutputs: (events: readonly PollEvent[]) => Readonly<Record<string, JsonValue>>;
  readonly configOptions?: (context: TriggerConfigOptionsContext) => Promise<readonly TriggerConfigOption[]>;
  readonly poll: (context: PollContext) => Promise<PollResult>;
  readonly snapshot: TriggerKeySnapshot & { readonly type: "poll" };
}

export class PollConnectionError extends Error {
  override readonly name = "PollConnectionError";
}

export class PermanentPollError extends Error {
  override readonly name = "PermanentPollError";
}

export class TransientPollError extends Error {
  override readonly name = "TransientPollError";
}
