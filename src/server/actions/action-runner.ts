import type { CatalogStore } from "../../catalog-store.ts";
import type { ConnectionService, ConnectionSummary } from "../../connection-service.ts";
import type { ActionPolicyDecision, ActionPolicySnapshot } from "../../core/action-policy.ts";
import type { ExecutionFailureKind } from "../../core/execution-error.ts";
import type { RuntimeExecutionOptions } from "../../core/runtime-execution.ts";
import type { RuntimeLogger, ExecutionContext, ExecutionResult, TransitFileWriter } from "../../core/types.ts";
import type { ExecutionTarget } from "../../execution-target.ts";
import type { MarketplaceService } from "../../marketplace/marketplace-service.ts";
import type { IProviderLoader } from "../../providers/provider-loader.ts";
import type { SaasExecutionService } from "../../saas/saas-execution-service.ts";
import type { IRunLogStore, RunLog, RunLogCaller, RunLogListInput, RunLogPage } from "../storage/runtime-store.ts";

import { ConnectionError } from "../../connection-error.ts";
import { ExecutionError, ExecutionPolicyError } from "../../core/execution-error.ts";
import { executeAction as executeProviderAction } from "../../core/execution.ts";
import { withRuntimeExecution } from "../../core/runtime-execution.ts";
import { resolveExecutionTarget } from "../../execution-target.ts";
import {
  ProviderDispatchRequestError,
  toProviderExecutionError,
  withProviderHttpDispatchResult,
} from "../../providers/provider-runtime.ts";
import { SaasError, saasExecutionFailureKind } from "../../saas/saas-client.ts";
import { safeRunLogError, summarizeForRunLog } from "./run-log-summary.ts";

export interface ActionRunnerOptions extends RuntimeExecutionOptions {
  catalog: CatalogStore;
  providerLoader: IProviderLoader;
  connections: ConnectionService;
  runs: IRunLogStore;
  transitFiles?: TransitFileWriter;
  logger?: RuntimeLogger;
  marketplace?: MarketplaceService;
  saas?: SaasExecutionService;
}

export interface RunActionInput {
  actionId: string;
  input: unknown;
  caller: RunLogCaller;
  connectionName?: string;
  connectionId?: string;
  policy: ActionPolicySnapshot;
  runtimeTokenId?: string;
  signal?: AbortSignal;
}

export interface ActionRunResult {
  executionId: string;
  auditPersisted: boolean;
  remoteExecutionId?: string;
  failureKind?: ExecutionFailureKind;
  retryAfter?: string;
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
    return withRuntimeExecution(
      this.options,
      { operation: "action", service: action?.service, actionId: action?.id },
      () => this.runAction(input),
    );
  }

  private async runAction(input: RunActionInput): Promise<ActionRunResult | undefined> {
    const action = this.options.catalog.actionsById.get(input.actionId);
    if (!action) {
      this.options.logger?.warn(
        {
          actionId: input.actionId,
          caller: input.caller,
          errorCode: "unknown_action",
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
    let policy: ActionPolicyDecision = input.policy.evaluate(action);
    let connection: ExecutionTarget | undefined;
    let result: ExecutionResult;
    let remoteExecutionId: string | undefined;
    let failureKind: ExecutionFailureKind | undefined;
    let retryAfter: string | undefined;
    if (!policy.allowed) {
      result = { ok: false, error: { code: policy.code, message: policy.message } };
    } else if (input.signal?.aborted) {
      result = cancelledExecutionResult();
    } else {
      try {
        connection = await resolveExecutionTarget({
          connections: this.options.connections,
          service: action.service,
          connectionName: input.connectionName,
          connectionId: input.connectionId,
          operation: "action",
          actionId: action.id,
          marketplace: this.options.marketplace,
          policy: input.policy,
          signal: input.signal,
        });
        const executor =
          action.execution.locallyExecutable && connection.kind === "local"
            ? await this.options.providerLoader.loadActionExecutor(
                action.service,
                action.id,
                this.options.catalog.providers.find((provider) => provider.service === action.service)?.displayName,
              )
            : undefined;
        input.signal?.throwIfAborted();
        const saasReference = connection.kind === "saas" ? connection.reference : undefined;
        const resolvedConnection = connection;
        result = await withProviderHttpDispatchResult(
          {
            operation: "action",
            service: action.service,
            actionId: action.id,
            executionId,
            connectionId: connection.summary?.id,
            connectionName: connection.summary?.connectionName,
          },
          async () => {
            const definition = (await this.options.catalog.getAction(action.id))!;
            input.signal?.throwIfAborted();
            return executeProviderAction(
              definition,
              saasReference
                ? async (actionInput) => {
                    if (!this.options.saas)
                      throw new SaasError("oauth_source_unavailable", "SaaS execution is unavailable.", 503);
                    const remote = await this.options.saas.executeAction(
                      saasReference,
                      action.service,
                      action.id,
                      actionInput,
                      input.signal,
                    );
                    remoteExecutionId = remote.executionId;
                    return { ok: true, output: remote.output };
                  }
                : resolvedConnection.kind === "marketplace"
                  ? (actionInput) => this.options.marketplace!.execute(action.id, actionInput, input.signal)
                  : executor,
              input.input,
              this.createExecutionContext(
                resolvedConnection.kind === "local" ? resolvedConnection.getCredential : async () => undefined,
                input.signal,
              ),
            );
          },
          this.options.providerHttpDispatch,
        );
        if (input.signal?.aborted) {
          result = cancelledExecutionResult();
        }
      } catch (error) {
        if (input.signal?.aborted) {
          result = cancelledExecutionResult();
        } else if (error instanceof ExecutionError) {
          if (error instanceof ExecutionPolicyError) policy = error.decision;
          result = { ok: false, error: { code: error.code, message: error.message } };
        } else if (error instanceof SaasError) {
          remoteExecutionId = error.remoteExecutionId;
          failureKind = saasExecutionFailureKind(error);
          retryAfter = error.retryAfter;
          result = { ok: false, error: { code: error.code, message: error.message } };
        } else if (error instanceof ProviderDispatchRequestError) {
          result = toProviderExecutionError(error, error.message);
        } else {
          result =
            error instanceof ConnectionError
              ? { ok: false, error: { code: error.code, message: error.message } }
              : {
                  ok: false,
                  error: { code: "internal_error", message: "Action execution failed unexpectedly." },
                };
        }
      }
    }
    const completedAtMs = Date.now();
    const durationMs = completedAtMs - startedAtMs;
    const auditError = safeRunLogError(result.error);
    const runLog: RunLog = {
      id: executionId,
      remoteExecutionId,
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
      inputSummary: summarizeForRunLog(input.input),
      outputSummary: result.ok ? summarizeForRunLog(result.output) : undefined,
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
      remoteExecutionId,
      connectionId: connection?.summary?.id,
      durationMs,
      ok: result.ok,
      errorCode: result.error?.code,
      auditPersisted,
    };
    if (result.ok) {
      this.options.logger?.info(completedLogContext, "action run completed");
    } else if (result.error?.code === "execution_cancelled") {
      this.options.logger?.info(completedLogContext, "action run cancelled");
    } else {
      this.options.logger?.warn(completedLogContext, "action run failed");
    }

    return {
      executionId,
      remoteExecutionId,
      failureKind,
      retryAfter,
      auditPersisted,
      result,
      connection: connection?.summary,
    };
  }

  listRuns(input?: RunLogListInput): Promise<RunLogPage> {
    return this.options.runs.list(input);
  }

  getRun(id: string): Promise<RunLog | undefined> {
    return this.options.runs.get(id);
  }

  private createExecutionContext(
    getCredential: ExecutionContext["getCredential"],
    signal: AbortSignal | undefined,
  ): ExecutionContext {
    const context: ExecutionContext = {
      getCredential,
      signal,
      logger: this.options.logger,
    };
    if (this.options.transitFiles) {
      context.transitFiles = this.options.transitFiles;
    }
    return context;
  }
}

function cancelledExecutionResult(): ExecutionResult {
  return {
    ok: false,
    error: {
      code: "execution_cancelled",
      message: "Action execution was cancelled.",
    },
  };
}
