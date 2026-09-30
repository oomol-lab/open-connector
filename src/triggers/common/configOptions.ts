import type { ConnectorProxy } from "./proxy.ts";
import type { JsonValue } from "./types.ts";

export interface TriggerConfigOption {
  readonly value: string;
  readonly label: string;
  readonly color?: string;
}

export interface TriggerConfigOptionsContext {
  readonly field: string;
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly connector: ConnectorProxy;
  readonly signal?: AbortSignal;
}
