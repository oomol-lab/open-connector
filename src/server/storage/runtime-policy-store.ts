import type { PolicyRules } from "../../core/action-policy.ts";

export interface RuntimePolicyRecord {
  rules: PolicyRules;
  updatedAt: string;
}

export interface IRuntimePolicyStore {
  get(): Promise<RuntimePolicyRecord | undefined>;
  set(record: RuntimePolicyRecord): Promise<void>;
}
