import type { TriggerConfigOption, TriggerConfigOptionsContext } from "./configOptions.ts";
import type { ConnectorProxyRequest, ConnectorProxyResult, ConnectorProxy } from "./proxy.ts";
import type { IntegrationEndpointMethod, JsonValue, TriggerKeySnapshot } from "./types.ts";

import { isJsonObject, isJsonValue } from "./json.ts";

export const maximumIntegrationBodyBytes: number = 64 * 1024;
export const maximumIntegrationDeliveryPages = 5;

const encoder = new TextEncoder();

export interface ListenerReadContext {
  readonly checkpoint: JsonValue;
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly connector: ConnectorProxy;
  readonly now: Date;
  readonly signal?: AbortSignal;
}

export interface ListenerPage {
  readonly checkpoint: JsonValue;
  readonly dedupeKey: string;
  readonly hasMore: boolean;
  readonly outputs: Readonly<Record<string, JsonValue>> | null;
}

export interface ListenerSource {
  readonly intervalMs: number;
  readonly read: (context: ListenerReadContext) => Promise<ListenerPage>;
}

export function validateListenerPage(value: unknown): asserts value is ListenerPage {
  if (
    !isJsonObject(value) ||
    value.checkpoint == null ||
    !isJsonValue(value.checkpoint) ||
    typeof value.hasMore != "boolean"
  ) {
    throw new TypeError("Listener page must contain a JSON checkpoint and a boolean hasMore.");
  }
  if (
    typeof value.dedupeKey != "string" ||
    value.dedupeKey.length == 0 ||
    encoder.encode(value.dedupeKey).byteLength > 1024
  ) {
    throw new TypeError("Listener page identity must contain between 1 and 1024 bytes.");
  }
  if (value.outputs !== null && !isJsonObject(value.outputs))
    throw new TypeError("Listener page outputs must be an object or null.");
  if (encoder.encode(JSON.stringify(value.checkpoint)).byteLength > 64 * 1024) {
    throw new TypeError("Listener checkpoint exceeds 64 KiB.");
  }
}

export type IntegrationReceiveResult =
  | { readonly outcome: "wake" }
  | {
      readonly checkpoint?: JsonValue;
      readonly continue?: boolean;
      readonly dedupeKey?: string;
      readonly outcome: "event";
      readonly outputs: Readonly<Record<string, JsonValue>>;
    }
  | {
      readonly checkpoint?: JsonValue;
      readonly continue?: boolean;
      readonly outcome: "ignored";
      readonly reason: string;
    }
  | {
      readonly body: string;
      readonly contentType: string;
      readonly headers?: Readonly<Record<string, string>>;
      readonly outcome: "respond";
      readonly status: number;
    };

export interface IntegrationStateContext {
  readonly checkpoint: JsonValue;
  readonly subscription: Readonly<Record<string, JsonValue>>;
  readonly saveCheckpoint: (checkpoint: JsonValue) => Promise<void>;
  readonly saveSubscription: (subscription: Readonly<Record<string, JsonValue>>, reconcileAt: Date) => Promise<void>;
}

export interface IntegrationReceiveContext {
  readonly eventSourceId?: string;
  readonly signal?: AbortSignal;
  readonly admit: boolean;
  readonly allow?: () => Promise<boolean>;
  readonly bindingId: string;
  readonly callbackSecret: string;
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly connector: ConnectorProxy;
  readonly current: boolean;
  readonly header: (name: string) => string | undefined;
  readonly method: IntegrationEndpointMethod;
  readonly now: Date;
  readonly payload: JsonValue;
  readonly query: (name: string) => string | undefined;
  readonly rawBody: Uint8Array;
  readonly state?: IntegrationStateContext;
}

export interface IntegrationReconcileContext {
  readonly active: boolean;
  readonly callbackSecret: string;
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly connector: ConnectorProxy;
  readonly endpointUrl: string;
  readonly idempotencyKey: string;
  readonly now: Date;
  readonly signal?: AbortSignal;
  readonly state?: IntegrationStateContext;
}

export interface IntegrationReconcileResult {
  readonly outcome: "pending" | "ready";
}

export interface ResourceSubscription {
  readonly key: string;
  readonly subscribe: ConnectorProxyRequest;
  readonly unsubscribe: ConnectorProxyRequest;
  readonly inspect?: ConnectorProxyRequest;
}
export interface ResourceDefinition {
  readonly subscriptions: (config: Readonly<Record<string, JsonValue>>) => readonly ResourceSubscription[];
  readonly response: (result: ConnectorProxyResult) => Readonly<Record<string, JsonValue>>;
}

export interface IntegrationDefinition {
  readonly resources?: ResourceDefinition;
  readonly eventSource?: "feishu";
  readonly configOptions?: (context: TriggerConfigOptionsContext) => Promise<readonly TriggerConfigOption[]>;
  readonly listener?: ListenerSource;
  readonly initialState?: {
    readonly checkpoint: JsonValue;
    readonly subscription: Readonly<Record<string, JsonValue>>;
  };
  readonly receive: (
    context: IntegrationReceiveContext,
  ) => IntegrationReceiveResult | Promise<IntegrationReceiveResult>;
  readonly reconcile: (context: IntegrationReconcileContext) => Promise<IntegrationReconcileResult>;
  readonly snapshot: TriggerKeySnapshot & { readonly type: "integration" };
}

export class IntegrationConnectionError extends Error {
  override readonly name = "IntegrationConnectionError";
}

export class PermanentIntegrationError extends Error {
  override readonly name = "PermanentIntegrationError";
}

export class TransientIntegrationError extends Error {
  override readonly name = "TransientIntegrationError";
}
