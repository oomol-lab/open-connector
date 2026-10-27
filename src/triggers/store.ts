import type { JsonValue } from "./common/types.ts";
import type { SourceApplicationStore } from "./sources/persistent.ts";
export interface TriggerSubscription {
  mode: "webhook" | "resource" | "resource-set";
  id: string;
  tokenId: string;
  service: string;
  connectionId: string;
  triggerId: string;
  connectionRevision: string;
  providerAccountId: string;
  requestKey: string;
  config: Readonly<Record<string, JsonValue>>;
  endpointUrl: string;
  callbackNonce: string;
  callbackReference?: string;
  callbackSecret: string;
  checkpoint: JsonValue;
  subscription: Readonly<Record<string, JsonValue>>;
  reconcileAt: number;
  status: "active" | "deleting" | "deleted" | "abandoned";
}
export interface TriggerStore extends SourceApplicationStore {
  list(): Promise<TriggerSubscription[]>;
  listFlowTriggersForMaintenance(now: number, limit: number): Promise<TriggerSubscription[]>;
  insertFlowTrigger(record: TriggerSubscription): Promise<TriggerSubscription>;
  getFlowTrigger(id: string): Promise<TriggerSubscription | null>;
  claimFlowTrigger(id: string, owner: string, now: number, until: number): Promise<boolean>;
  saveFlowTrigger(record: TriggerSubscription, owner: string, now: number): Promise<boolean>;
  releaseFlowTrigger(id: string, owner: string): Promise<void>;
}
