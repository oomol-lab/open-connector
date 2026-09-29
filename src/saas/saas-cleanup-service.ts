import type { RuntimeLogger } from "../core/types.ts";
import type { ConnectionRequestStore } from "../server/storage/connection-request-store.ts";
import type { SaasCleanup, SaasProjectStore } from "../server/storage/saas-project-store.ts";

import { SaasClient, SaasError } from "./saas-client.ts";

export interface SaasCleanupServiceOptions {
  store: SaasProjectStore;
  requests: ConnectionRequestStore;
  client?: SaasClient;
  logger?: RuntimeLogger;
}

/** Resumable deletion of ordinary SaaS accounts; never creates or reconnects an account. */
export class SaasCleanupService {
  private readonly options: SaasCleanupServiceOptions;
  private readonly client: SaasClient;
  private readonly shutdown = new AbortController();
  private pending?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private started = false;

  constructor(options: SaasCleanupServiceOptions) {
    this.options = options;
    this.client = options.client ?? new SaasClient();
  }

  run(): Promise<void> {
    if (this.shutdown.signal.aborted) return Promise.resolve();
    this.pending ??= this.runBatch()
      .catch(() => {
        this.options.logger?.warn(
          { errorCode: "saas_cleanup_failed" },
          "SaaS cleanup batch failed; pending work is retained",
        );
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }

  /** Node owns this timer; Workers invoke run from their scheduled entry point instead. */
  start(): void {
    if (this.started || this.shutdown.signal.aborted) return;
    this.started = true;
    const tick = (): void => {
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
    await this.options.requests.expireSaas();
    const deadline = Date.now() + 50_000;
    for (let count = 0; count < 10 && Date.now() < deadline && !this.shutdown.signal.aborted; count++) {
      const project = await this.options.store.getProject();
      if (!project) return;
      const task = await this.options.store.claimCleanup(Date.now());
      if (!task) return;
      const signal = AbortSignal.any([
        this.shutdown.signal,
        AbortSignal.timeout(Math.max(1, Math.min(30_000, deadline - Date.now()))),
      ]);
      try {
        if (project.id !== task.managedProjectId)
          throw new SaasError("oauth_source_mismatch", "Cleanup project identity does not match.", 409);
        let accountId = task.connectedAccountId;
        if (!accountId) {
          if (!task.remoteRequestId) {
            await this.options.store.retryCleanup(task, Date.now(), "oauth_source_result_unknown", true);
            continue;
          }
          const result = await this.client.getRequest(project, task.remoteRequestId, signal);
          if (
            result.providerConfigId !== task.providerConfigId ||
            result.externalUserId !== task.externalUserId ||
            result.service !== task.service ||
            result.alias !== `connect-${task.id.slice("request:".length)}`
          )
            throw new SaasError("oauth_source_mismatch", "Cleanup request identity does not match.", 409);
          if (result.status === "initiated") {
            const expired = Date.now() >= Date.parse(task.requestExpiresAt ?? result.expiresAt) + 86_400_000;
            await this.options.store.retryCleanup(
              task,
              Date.now() + 60_000,
              expired ? "oauth_source_result_unknown" : "authorization_pending",
              expired,
            );
            continue;
          }
          if (result.status !== "connected") {
            await this.options.store.finishCleanup(task);
            continue;
          }
          accountId = result.connectedAccountId!;
          if (!(await this.options.store.saveCleanupAccount(task, accountId))) continue;
          task.connectedAccountId = accountId;
        }
        signal.throwIfAborted();
        await this.client.deleteAccount(
          project,
          {
            providerConfigId: task.providerConfigId,
            externalUserId: task.externalUserId,
            connectedAccountId: accountId,
          },
          signal,
        );
        await this.options.store.finishCleanup(task);
      } catch (error) {
        const code = error instanceof SaasError ? error.code : "saas_cleanup_failed";
        if (code === "oauth_source_unauthorized") await this.options.store.pauseCleanup(task, project.apiKey);
        const manual =
          code === "oauth_source_mismatch" ||
          code === "oauth_source_protocol_error" ||
          (code === "oauth_source_not_found" && !task.connectedAccountId);
        await this.options.store.retryCleanup(
          task,
          this.nextAttempt(task, error),
          code === "oauth_source_not_found" && !task.connectedAccountId ? "oauth_source_result_unknown" : code,
          manual,
        );
        if (!this.shutdown.signal.aborted)
          this.options.logger?.warn(
            { taskId: task.id, errorCode: code, manual },
            code === "oauth_source_unauthorized"
              ? "SaaS cleanup paused; update the project key to resume"
              : "SaaS cleanup deferred",
          );
        if (code === "oauth_source_unauthorized" || this.shutdown.signal.aborted) return;
      }
    }
  }

  private nextAttempt(task: SaasCleanup, error: unknown): number {
    let delay = Math.min(300_000, 60_000 * 2 ** Math.min(task.attempts, 3));
    if (error instanceof SaasError && error.retryAfter) {
      const seconds = Number(error.retryAfter);
      const until = Number.isFinite(seconds) ? Date.now() + seconds * 1_000 : Date.parse(error.retryAfter);
      if (Number.isFinite(until)) delay = Math.max(delay, until - Date.now());
    }
    return Date.now() + delay;
  }
}
