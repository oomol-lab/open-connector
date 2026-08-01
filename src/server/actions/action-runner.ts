import type { CatalogStore } from "../../catalog-store.ts";
import type { ConnectionService, ConnectionSummary, ExecutionConnection, Tenant } from "../../connection-service.ts";
import type { ActionPolicyDecision, ActionPolicyService, ActionPolicySnapshot } from "../../core/action-policy.ts";
import type { ExecutionContext, ExecutionResult, TransitFileWriter } from "../../core/types.ts";
import type { IProviderLoader } from "../../providers/provider-loader.ts";
import type { Logger } from "../logger.ts";
import type { IRunLogStore, RunLog, RunLogCaller, RunLogListInput, RunLogPage } from "../storage/runtime-store.ts";

import { ConnectionError, normalizeConnectionName } from "../../connection-service.ts";
import { executeAction as executeProviderAction } from "../../core/execution.ts";
import { safeRunLogError, summarizeForRunLog } from "./run-log-summary.ts";

export interface ActionRunnerOptions {
  catalog: CatalogStore;
  providerLoader: IProviderLoader;
  connections: ConnectionService;
  runs: IRunLogStore;
  transitFiles?: TransitFileWriter;
  actionPolicy?: ActionPolicyService;
  logger?: Logger;
}

export interface RunActionInput {
  actionId: string;
  input: unknown;
  caller: RunLogCaller;
  /** Tenant whose connections this run may reach. Required: an action always runs as someone. */
  tenant: Tenant;
  connectionName?: string;
  policy?: ActionPolicySnapshot;
  runtimeTokenId?: string;
  /** Connection names the calling runtime token may act against, within its own tenant.
   * `undefined` (admin/HTTP callers with no runtime token, or a token minted before this
   * field existed) means unrestricted. See RuntimeGrant.allowedConnections. */
  allowedConnections?: string[];
}

export interface ActionRunResult {
  executionId: string;
  auditPersisted: boolean;
  result: ExecutionResult;
  connection?: ConnectionSummary;
}

/**
 * Shared execution boundary for HTTP, MCP, and future local callers.
 */
export class ActionRunner {
  private readonly options: ActionRunnerOptions;

  constructor(options: ActionRunnerOptions) {
    this.options = options;
  }

  async run(input: RunActionInput): Promise<ActionRunResult | undefined> {
    const action = this.options.catalog.actionsById.get(input.actionId);
    if (!action) {
      this.options.logger?.warn(
        {
          actionId: input.actionId,
          caller: input.caller,
          errorCode: "invalid_input",
        },
        "action run rejected",
      );
      return undefined;
    }

    const executionId = crypto.randomUUID();
    const logContext = {
      actionId: action.id,
      service: action.service,
      caller: input.caller,
      executionId,
    };
    this.options.logger?.info(logContext, "action run started");
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const policy: ActionPolicyDecision = (input.policy ?? this.options.actionPolicy?.createSnapshot())?.evaluate(
      action,
    ) ?? { allowed: true, checks: [] };
    let connection: ExecutionConnection | undefined;
    let result: ExecutionResult;
    if (!policy.allowed) {
      result = { ok: false, error: { code: policy.code, message: policy.message } };
    } else {
      try {
        // Checked here, inside the try block, so an invalid connectionName is reported
        // the same way resolveForExecution's own normalization would (via the catch
        // below) rather than throwing before we even get there.
        const requestedConnectionName = normalizeConnectionName(input.connectionName);
        if (input.allowedConnections !== undefined && !input.allowedConnections.includes(requestedConnectionName)) {
          throw new ConnectionError(
            "connection_not_allowed",
            `This runtime token is not allowed to use connection "${requestedConnectionName}".`,
          );
        }
        connection = await this.options.connections.resolveForExecution(
          input.tenant,
          action.service,
          input.connectionName,
        );
        const executor = action.execution.locallyExecutable
          ? await this.options.providerLoader.loadActionExecutor(
              action.service,
              action.id,
              this.options.catalog.providers.find((provider) => provider.service === action.service)?.displayName,
            )
          : undefined;
        result = await executeProviderAction(
          action,
          executor,
          input.input,
          this.createExecutionContext(connection.getCredential),
        );
      } catch (error) {
        result =
          error instanceof ConnectionError
            ? { ok: false, error: { code: error.code, message: error.message } }
            : {
                ok: false,
                error: { code: "internal_error", message: "Action execution failed unexpectedly." },
              };
      }
    }
    const completedAtMs = Date.now();
    const durationMs = completedAtMs - startedAtMs;
    const auditError = safeRunLogError(result.error);
    const runLog: RunLog = {
      id: executionId,
      service: action.service,
      actionId: input.actionId,
      caller: input.caller,
      startedAt,
      completedAt: new Date(completedAtMs).toISOString(),
      durationMs,
      ok: result.ok,
      connectionId: connection?.summary?.id,
      connectionProfile: connection?.summary?.profile,
      runtimeTokenId: input.runtimeTokenId,
      policy,
      inputSummary: this.summarizeAuditValue(input.input, logContext),
      outputSummary: result.ok ? this.summarizeAuditValue(result.output, logContext) : undefined,
      ...auditError,
    };

    let auditPersisted = false;
    try {
      const write = await this.options.runs.add(runLog);
      auditPersisted = true;
      if (!write.retentionApplied) {
        this.options.logger?.warn({ ...logContext, auditPersisted }, "run audit retention failed");
      }
    } catch {
      this.options.logger?.warn({ ...logContext, auditPersisted }, "run audit persistence failed");
    }

    const completedLogContext = {
      ...logContext,
      connectionId: connection?.summary?.id,
      durationMs,
      ok: result.ok,
      errorCode: result.error?.code,
      auditPersisted,
    };
    if (result.ok) {
      this.options.logger?.info(completedLogContext, "action run completed");
    } else {
      this.options.logger?.warn(completedLogContext, "action run failed");
    }

    return { executionId, auditPersisted, result, connection: connection?.summary };
  }

  /**
   * Record a non-action event in the run log.
   *
   * Credential read-out is not an action run, but it is exactly the kind of event an
   * operator goes to the run log to find, so it is written to the same place rather than
   * to a separate audit sink they would have to know about. A failure to persist is
   * swallowed: the audit trail must never be the reason a request fails, and the caller
   * already logs through `logger`.
   */
  async recordAuditEvent(entry: Omit<RunLog, "durationMs">): Promise<boolean> {
    try {
      await this.options.runs.add({
        ...entry,
        durationMs: Math.max(0, Date.parse(entry.completedAt) - Date.parse(entry.startedAt)),
      });
      return true;
    } catch (error) {
      this.options.logger?.warn({ id: entry.id, actionId: entry.actionId, err: error }, "audit event not persisted");
      return false;
    }
  }

  listRuns(input?: RunLogListInput): Promise<RunLogPage> {
    return this.options.runs.list(input);
  }

  getRun(id: string): Promise<RunLog | undefined> {
    return this.options.runs.get(id);
  }

  private createExecutionContext(getCredential: ExecutionConnection["getCredential"]): ExecutionContext {
    const context: ExecutionContext = {
      getCredential,
    };
    if (this.options.transitFiles) {
      context.transitFiles = this.options.transitFiles;
    }
    return context;
  }

  private summarizeAuditValue(value: unknown, logContext: Record<string, unknown>): unknown {
    try {
      return summarizeForRunLog(value);
    } catch {
      this.options.logger?.warn(logContext, "run audit summary unavailable");
      return "[unavailable]";
    }
  }
}
