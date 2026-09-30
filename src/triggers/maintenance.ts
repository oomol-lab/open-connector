import type { ActionPolicyService } from "../core/action-policy.ts";
import type { RuntimeLogger } from "../core/types.ts";
import type { IRuntimePolicyStore } from "../server/storage/runtime-policy-store.ts";
import type { IRuntimeTokenStore } from "../server/storage/runtime-token-service.ts";
import type { TriggerStore } from "./store.ts";
import type { TriggerRunner } from "./trigger-runner.ts";

import { HttpRequestError } from "../server/api/http-utils.ts";
import { withSubscription } from "./subscriptions.ts";

export interface TriggerSubscriptionSummary {
  id: string;
  mode: "webhook" | "resource" | "resource-set";
  tokenId: string;
  connectionId: string;
  providerAccountId: string;
  triggerId: string;
  requestKey: string;
  status: "active" | "deleting" | "deleted" | "abandoned";
  reconcileAt: number;
}

interface TriggerMaintenanceOptions {
  store: TriggerStore;
  runner: TriggerRunner;
  tokens: IRuntimeTokenStore;
  runtimePolicy: IRuntimePolicyStore;
  deploymentPolicy: ActionPolicyService;
  logger?: RuntimeLogger;
}

export class TriggerMaintenance {
  private readonly options: TriggerMaintenanceOptions;
  private readonly shutdown = new AbortController();
  private pending?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(options: TriggerMaintenanceOptions) {
    this.options = options;
  }

  async list(): Promise<TriggerSubscriptionSummary[]> {
    return (await this.options.store.list())
      .filter((record) => record.mode !== "resource-set")
      .map((record) => ({
        id: record.id,
        mode: record.mode,
        tokenId: record.tokenId,
        connectionId: record.connectionId,
        providerAccountId: record.providerAccountId,
        triggerId: record.triggerId,
        requestKey: record.requestKey,
        status: record.status,
        reconcileAt: record.reconcileAt,
      }));
  }

  async cancel(id: string, signal: AbortSignal): Promise<void> {
    await withSubscription(this.options.store, id, signal, async (record, save) => {
      if (record.mode === "resource-set")
        throw new HttpRequestError("invalid_input", "Cancel the owning resource subscriptions.");
      if (record.status === "deleted" || record.status === "abandoned") return;
      record.status = "deleting";
      await save();
      await this.options.runner.cleanup(record, save, signal);
    });
  }

  async abandon(id: string, signal: AbortSignal): Promise<void> {
    await withSubscription(this.options.store, id, signal, async (record, save) => {
      if (record.mode === "resource-set")
        throw new HttpRequestError("invalid_input", "Abandon the owning resource subscriptions.");
      if (record.status === "deleted" || record.status === "abandoned") return;
      if (record.mode === "resource") await this.options.runner.abandonResource(record, signal);
      record.status = "abandoned";
      await save();
    });
  }

  run(): Promise<void> {
    if (this.shutdown.signal.aborted) return Promise.resolve();
    this.pending ??= this.runBatch()
      .catch(() => {
        this.options.logger?.warn(
          { errorCode: "trigger_cleanup_failed" },
          "Trigger cleanup batch failed; pending work is retained",
        );
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }

  start(): void {
    if (this.timer || this.pending || this.shutdown.signal.aborted) return;
    const tick = () => {
      void this.run().finally(() => {
        if (this.shutdown.signal.aborted) return;
        this.timer = setTimeout(tick, 60_000);
        this.timer.unref?.();
      });
    };
    tick();
  }

  async close(): Promise<void> {
    this.shutdown.abort();
    clearTimeout(this.timer);
    await this.pending;
  }

  private async runBatch(): Promise<void> {
    const deadline = Date.now() + 50_000;
    const records = await this.options.store.listFlowTriggersForMaintenance(Date.now(), 10);
    for (const candidate of records) {
      if (this.shutdown.signal.aborted || Date.now() >= deadline) return;
      const signal = AbortSignal.any([
        this.shutdown.signal,
        AbortSignal.timeout(Math.max(1, Math.min(45_000, deadline - Date.now()))),
      ]);
      try {
        await withSubscription(this.options.store, candidate.id, signal, async (record, save) => {
          if (record.status === "deleted" || record.status === "abandoned") return;
          const token = (await this.options.tokens.list()).find((token) => token.id === record.tokenId);
          const runtime = await this.options.runtimePolicy.get();
          const policy = this.options.deploymentPolicy.createSnapshot(runtime?.rules, token, runtime?.updatedAt);
          if (
            record.status === "active" &&
            token &&
            policy.evaluateTrigger(record.triggerId).allowed &&
            policy.evaluateConnection(record.connectionId).allowed
          ) {
            await save();
            return;
          }
          record.status = "deleting";
          await save();
          try {
            await this.options.runner.cleanup(record, save, signal);
          } catch (error) {
            if (!signal.aborted) await save();
            throw error;
          }
        });
      } catch {
        this.options.logger?.warn(
          { subscriptionId: candidate.id, errorCode: "trigger_cleanup_failed" },
          "Trigger subscription cleanup failed; pending work is retained",
        );
      }
    }
  }
}
