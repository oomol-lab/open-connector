import type { ActionPolicyService, ActionPolicySnapshot } from "../../core/action-policy.ts";
import type { RuntimeLogger } from "../../core/types.ts";
import type { IRuntimePolicyStore } from "../storage/runtime-policy-store.ts";
import type { Context } from "hono";

import { emptyPolicyRules } from "../../core/action-policy.ts";
import { readRuntimeGrant } from "./auth.ts";

export interface PolicySnapshotProviderOptions {
  actionPolicy: ActionPolicyService;
  runtimePolicyStore: IRuntimePolicyStore;
  logger?: RuntimeLogger;
}

export type PolicySnapshotProvider = (context: Context) => Promise<ActionPolicySnapshot>;

/**
 * Creates a request-scoped cached ActionPolicySnapshot provider backed by a WeakMap.
 */
export function createPolicySnapshotProvider({
  actionPolicy,
  runtimePolicyStore,
  logger,
}: PolicySnapshotProviderOptions): PolicySnapshotProvider {
  const policySnapshots = new WeakMap<Request, Promise<ActionPolicySnapshot>>();

  async function loadPolicySnapshot(context: Context): Promise<ActionPolicySnapshot> {
    try {
      const record = await runtimePolicyStore.get();
      return actionPolicy.createSnapshot(
        record?.rules ?? emptyPolicyRules(),
        readRuntimeGrant(context),
        record?.updatedAt,
      );
    } catch {
      logger?.error(
        {
          method: context.req.method,
          path: context.req.path,
        },
        "runtime policy load failed",
      );
      throw new Error("Runtime policy is unavailable.");
    }
  }

  return (context: Context): Promise<ActionPolicySnapshot> => {
    const request = context.req.raw;
    let snapshot = policySnapshots.get(request);
    if (!snapshot) {
      snapshot = loadPolicySnapshot(context);
      policySnapshots.set(request, snapshot);
    }
    return snapshot;
  };
}
