import type { CatalogStore } from "../catalog-store.ts";
import type { ConnectionService } from "../connection-service.ts";
import type { ActionPolicyService } from "../core/action-policy.ts";
import type { ExecutionContext, ExecutionResult, TransitFileWriter } from "../core/types.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { IRunLogStore, RunLog, RunLogCaller } from "./runtime-store.ts";

import { executeAction as executeProviderAction } from "../core/execution.ts";
import { summarizeForRunLog } from "./run-log-summary.ts";

export interface ActionRunnerOptions {
  catalog: CatalogStore;
  providerLoader: IProviderLoader;
  connections: ConnectionService;
  runs: IRunLogStore;
  transitFiles?: TransitFileWriter;
  actionPolicy?: ActionPolicyService;
}

export interface RunActionInput {
  actionId: string;
  input: unknown;
  caller: RunLogCaller;
  connectionName?: string;
}

export interface ActionRunResult {
  executionId: string;
  result: ExecutionResult;
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
      return undefined;
    }

    const connection = await this.options.connections.getConnectionSummary(action.service, input.connectionName);
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const executor = action.execution.locallyExecutable
      ? await this.options.providerLoader.loadActionExecutor(
          action.service,
          action.id,
          this.options.catalog.providers.find((provider) => provider.service === action.service)?.displayName,
        )
      : undefined;
    const result = await executeProviderAction(
      action,
      executor,
      input.input,
      this.createExecutionContext(input.connectionName),
      this.options.actionPolicy,
    );
    const completedAtMs = Date.now();
    const executionId = crypto.randomUUID();

    this.options.runs.add({
      id: executionId,
      actionId: input.actionId,
      caller: input.caller,
      startedAt,
      completedAt: new Date(completedAtMs).toISOString(),
      durationMs: completedAtMs - startedAtMs,
      ok: result.ok,
      connectionProfile: connection?.profile,
      inputSummary: summarizeForRunLog(input.input),
      errorCode: result.error?.code,
      errorMessage: result.error?.message,
    });

    return { executionId, result };
  }

  listRuns(): RunLog[] {
    return this.options.runs.list();
  }

  private createExecutionContext(connectionName: string | undefined): ExecutionContext {
    const context: ExecutionContext = {
      ...this.options.connections.forConnection(connectionName),
    };
    if (this.options.transitFiles) {
      context.transitFiles = this.options.transitFiles;
    }
    return context;
  }
}
