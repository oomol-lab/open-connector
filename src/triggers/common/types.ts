export type { JsonValue } from "./json.ts";
import type { JsonValue } from "./json.ts";
export interface Port {
  readonly handle: string;
  readonly jsonSchema: boolean | Readonly<Record<string, unknown>>;
  readonly nullable: boolean;
  readonly description?: string;
}
export interface InputPort extends Port {
  readonly value?: JsonValue;
}
export interface Group {
  readonly group: string;
  readonly collapsed?: boolean;
}
interface TriggerKeySnapshotBase {
  readonly configInputs: readonly (InputPort | Group)[];
  readonly definitionVersion: number;
  readonly description: string;
  readonly displayName: string;
  readonly key: string;
  readonly name: string;
  readonly outputs: readonly Port[];
  readonly provider: string;
}

export type IntegrationEndpointMethod = "DELETE" | "GET" | "HEAD" | "PATCH" | "POST" | "PUT";

export type IntegrationBodyFormat = "form" | "json" | "multipart" | "text";

export interface IntegrationEndpointDeclaration {
  readonly body: {
    readonly allowArray: boolean;
    readonly allowEmpty: boolean;
    readonly formats: readonly IntegrationBodyFormat[];
  };
  readonly methods: readonly IntegrationEndpointMethod[];
  readonly successStatus: number;
}

export type TriggerKeySnapshot =
  | (TriggerKeySnapshotBase & { readonly type: "poll" })
  | (TriggerKeySnapshotBase & {
      readonly endpoint: IntegrationEndpointDeclaration;
      readonly type: "integration";
    });
