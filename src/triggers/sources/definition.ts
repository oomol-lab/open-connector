import { PermanentIntegrationError } from "../common/integration.ts";
type TriggerOperationRequest =
  | { operation: "sourceIdentity"; config: Readonly<Record<string, JsonValue>> }
  | {
      operation: "sourceReceive";
      config: Readonly<Record<string, JsonValue>>;
      headers: Readonly<Record<string, string>>;
      rawBody: string;
    };
import type { JsonValue } from "../common/types.ts";

export interface SourceConfiguration {
  readonly identity: string;
  readonly eventTypes: string[];
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly secrets: Readonly<Record<string, JsonValue>>;
  readonly state: Readonly<Record<string, JsonValue>>;
}

export interface SourceEvent {
  readonly ordering?: { readonly key: string; readonly version: number };
  readonly id: string;
  readonly type: string;
  readonly payload: Readonly<Record<string, JsonValue>>;
}

export interface SourceSubscription {
  readonly key: string;
  readonly config: Readonly<Record<string, JsonValue>>;
}

export interface EventSourceDefinition<Create, Update, View> {
  readonly kind: string;
  readonly provider: string;
  readonly maximumBodyBytes: number;
  readonly expiresAt?: (source: SourceConfiguration) => number | undefined;
  readonly applicationIngress?: boolean;
  readonly initialize: (input: Create, accountId: string | undefined) => SourceConfiguration;
  readonly verifyIdentity?: (
    source: SourceConfiguration,
    read: (config: Readonly<Record<string, JsonValue>>) => Promise<unknown>,
  ) => Promise<SourceConfiguration>;
  readonly update: (source: SourceConfiguration, input: Update) => SourceConfiguration;
  readonly view: (source: SourceConfiguration, now?: number) => View;
  readonly ready: (source: SourceConfiguration, now?: number) => boolean;
  readonly receive: (
    source: SourceConfiguration,
    bytes: Uint8Array,
    headers: Headers,
    now: number,
    execute?: (
      request: Extract<TriggerOperationRequest, { operation: "sourceIdentity" | "sourceReceive" }>,
    ) => Promise<unknown>,
  ) => Promise<
    | { readonly response: Response; readonly state: SourceConfiguration["state"] }
    | { readonly event: SourceEvent; readonly state?: SourceConfiguration["state"] }
  >;
  readonly matches: (config: Readonly<Record<string, JsonValue>>, event: SourceEvent) => boolean;
  readonly resources: {
    readonly managed?: boolean;
    readonly triggerId: string;
    readonly requests: (
      source: SourceConfiguration,
      provider: string,
      config: Readonly<Record<string, JsonValue>>,
      endpointUrl?: string,
    ) => readonly SourceSubscription[];
  };
}

export class SourceIdentityError extends PermanentIntegrationError {}
