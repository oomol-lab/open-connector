import type { CatalogStore } from "../../catalog-store.ts";
import type { ConnectionService } from "../../connection-service.ts";
import type { ActionPolicySnapshot } from "../../core/action-policy.ts";
import type { ExecutionFailureKind } from "../../core/execution-error.ts";
import type { RuntimeExecutionOptions } from "../../core/runtime-execution.ts";
import type { RuntimeLogger, ProxyRequestInput, ProxyResponse } from "../../core/types.ts";
import type { IProviderLoader } from "../../providers/provider-loader.ts";
import type { SaasExecutionService } from "../../saas/saas-execution-service.ts";

import { ConnectionError } from "../../connection-error.ts";
import { optionalRecord, requiredRecord, requiredString } from "../../core/cast.ts";
import { connectionExecutionError, ExecutionError } from "../../core/execution-error.ts";
import { withRuntimeExecution } from "../../core/runtime-execution.ts";
import { resolveExecutionTarget } from "../../execution-target.ts";
import {
  ProviderDispatchRequestError,
  toProviderExecutionError,
  withProviderHttpDispatchResult,
} from "../../providers/provider-runtime.ts";
import { SaasError, saasExecutionFailureKind } from "../../saas/saas-client.ts";

export interface ProxyRunnerOptions extends RuntimeExecutionOptions {
  catalog: CatalogStore;
  providerLoader: IProviderLoader;
  connections: ConnectionService;
  logger?: RuntimeLogger;
  saas?: SaasExecutionService;
}

export interface RunProxyInput {
  service: string;
  input: unknown;
  connectionName?: string;
  connectionId?: string;
  policy: ActionPolicySnapshot;
  /** Cancellation signal from the HTTP request, handed to the provider proxy executor. */
  signal?: AbortSignal;
}

export type ProxyRunResult =
  | {
      ok: true;
      response: ProxyResponse;
      meta?: Record<string, unknown>;
    }
  | ProxyRunFailure;

export interface ProxyRunFailure {
  ok: false;
  kind?: ExecutionFailureKind;
  errorCode: string;
  message: string;
  data?: unknown;
  meta?: Record<string, unknown>;
}

type ProxyRequestReadResult = { ok: true; input: ProxyRequestInput } | ProxyRunFailure;

class ProxyInputError extends Error {}

const supportedProxyMethods = new Set(["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"]);

export class ProxyRunner {
  private readonly options: ProxyRunnerOptions;

  constructor(options: ProxyRunnerOptions) {
    this.options = options;
  }

  async run(input: RunProxyInput): Promise<ProxyRunResult> {
    const provider = this.options.catalog.providers.find((candidate) => candidate.service === input.service);
    return withRuntimeExecution(this.options, { operation: "proxy", service: provider?.service }, () =>
      this.runProxy(input),
    );
  }

  private async runProxy(input: RunProxyInput): Promise<ProxyRunResult> {
    const provider = this.options.catalog.providers.find((candidate) => candidate.service === input.service);
    if (!provider) {
      return {
        ok: false,
        kind: "not_found",
        errorCode: "invalid_input",
        message: `unknown service: ${input.service}`,
        meta: { service: input.service },
      };
    }

    const decision = input.policy.evaluateProxy(provider.service);
    if (!decision.allowed) {
      return {
        ok: false,
        kind: "forbidden",
        errorCode: decision.code,
        message: decision.message,
        meta: { service: provider.service },
      };
    }
    const request = this.readProxyRequestInput(input.input);
    if (!request.ok) {
      return request;
    }

    const logContext = {
      service: provider.service,
      method: request.input.method,
      endpoint: loggableProxyEndpoint(request.input.endpoint),
      connectionName: input.connectionName,
    };
    const startedAtMs = Date.now();
    let executionId: string | undefined;
    try {
      const target = await resolveExecutionTarget({
        connections: this.options.connections,
        service: provider.service,
        connectionName: input.connectionName,
        connectionId: input.connectionId,
        operation: "proxy",
        policy: input.policy,
      });
      this.options.logger?.info(logContext, "proxy request started");
      if (target.kind === "saas") {
        executionId = crypto.randomUUID();
        input.signal?.throwIfAborted();
        if (!this.options.saas) throw new SaasError("oauth_source_unavailable", "SaaS execution is unavailable.", 503);
        const { alias: _alias, connectionName: _connectionName, ...remoteRequest } = optionalRecord(input.input)!;
        remoteRequest.method = request.input.method;
        const remote = await this.options.saas.executeProxy(
          target.reference,
          provider.service,
          remoteRequest,
          input.signal,
        );
        input.signal?.throwIfAborted();
        this.options.logger?.info(
          {
            ...logContext,
            executionId,
            remoteExecutionId: remote.executionId,
            durationMs: Date.now() - startedAtMs,
            status: remote.response.status,
          },
          "proxy request completed",
        );
        return {
          ok: true,
          response: remote.response,
          meta: { service: provider.service, executionId, remoteExecutionId: remote.executionId },
        };
      }
      const executor = await this.options.providerLoader.loadProxyExecutor(provider.service, provider.displayName);
      if (!executor)
        return {
          ok: false,
          kind: "unsupported",
          errorCode: "proxy_not_supported",
          message: `Proxy execution is not supported for ${provider.service}.`,
          meta: { service: provider.service },
        };
      const result = await withProviderHttpDispatchResult(
        {
          operation: "proxy",
          service: provider.service,
          connectionId: target.summary?.id,
          connectionName: target.summary?.connectionName,
        },
        () =>
          executor(request.input, {
            getCredential: target.getCredential,
            signal: input.signal,
          }),
        this.options.providerHttpDispatch,
      );
      const durationMs = Date.now() - startedAtMs;
      if (result.ok) {
        this.options.logger?.info(
          { ...logContext, durationMs, status: result.response.status },
          "proxy request completed",
        );
        return {
          ok: true,
          response: result.response,
        };
      }

      const failure = {
        ok: false as const,
        errorCode: result.error.code,
        message: result.error.message,
        data: result.error.details ?? null,
        meta: { service: provider.service },
      };
      this.options.logger?.warn({ ...logContext, durationMs, errorCode: failure.errorCode }, "proxy request failed");
      return failure;
    } catch (error) {
      const durationMs = Date.now() - startedAtMs;
      if (executionId && input.signal?.aborted)
        return {
          ok: false,
          kind: "invalid_input",
          errorCode: "execution_cancelled",
          message: "Proxy execution was cancelled.",
          meta: { service: provider.service, executionId },
        };
      if (error instanceof SaasError) {
        this.options.logger?.warn(
          { ...logContext, durationMs, executionId, errorCode: error.code, remoteExecutionId: error.remoteExecutionId },
          "proxy request failed",
        );
        return {
          ok: false,
          kind: saasExecutionFailureKind(error),
          errorCode: error.code,
          message: error.message,
          data: error.retryAfter ? { details: { retryAfter: error.retryAfter } } : undefined,
          meta: { service: provider.service, executionId, remoteExecutionId: error.remoteExecutionId },
        };
      }
      if (error instanceof ProviderDispatchRequestError) {
        return {
          ok: false,
          kind: "rate_limited",
          errorCode: "rate_limited",
          message: error.message,
          data: toProviderExecutionError(error, error.message).error?.details,
          meta: { service: provider.service },
        };
      }
      if (error instanceof ExecutionError) {
        return {
          ok: false,
          kind: error.kind,
          errorCode: error.code,
          message: error.message,
          meta: { service: provider.service },
        };
      }
      if (error instanceof ConnectionError) {
        const failure: ProxyRunFailure = {
          ok: false,
          kind: connectionExecutionError(error).kind,
          errorCode: error.code,
          message: error.message,
          meta: { service: provider.service },
        };
        this.options.logger?.warn({ ...logContext, durationMs, errorCode: failure.errorCode }, "proxy request failed");
        return failure;
      }

      this.options.logger?.warn({ ...logContext, durationMs, errorCode: "internal_error" }, "proxy request failed");
      return {
        ok: false,
        kind: "internal",
        errorCode: "internal_error",
        message: "Proxy request failed unexpectedly.",
        meta: { service: provider.service },
      };
    }
  }

  private readProxyRequestInput(input: unknown): ProxyRequestReadResult {
    try {
      const body = optionalRecord(input);
      if (!body) {
        throw new ProxyInputError("Proxy request body must be a JSON object.");
      }

      const endpoint = requiredString(body.endpoint, "endpoint", (message) => new ProxyInputError(message));
      this.assertRelativeEndpoint(endpoint);
      const method = requiredString(body.method, "method", (message) => new ProxyInputError(message)).toUpperCase();
      if (!supportedProxyMethods.has(method)) {
        throw new ProxyInputError("method must be one of DELETE, GET, HEAD, PATCH, POST, or PUT.");
      }
      if ((method === "GET" || method === "HEAD") && "body" in body) {
        throw new ProxyInputError("GET and HEAD proxy requests must not include a body.");
      }

      const request: ProxyRequestInput = {
        endpoint,
        method,
      };
      if ("query" in body) {
        request.query = requiredRecord(body.query, "query", (message) => new ProxyInputError(message));
      }
      if ("headers" in body) {
        request.headers = requiredRecord(body.headers, "headers", (message) => new ProxyInputError(message));
      }
      if ("body" in body) {
        request.body = body.body;
      }
      return { ok: true, input: request };
    } catch (error) {
      if (error instanceof ProxyInputError) {
        return {
          ok: false,
          kind: "invalid_input",
          errorCode: "invalid_input",
          message: error.message,
        };
      }

      throw error;
    }
  }

  private assertRelativeEndpoint(endpoint: string): void {
    if (!endpoint.startsWith("/") || endpoint.startsWith("//")) {
      throw new ProxyInputError("endpoint must be a relative path starting with /");
    }
    try {
      const url = new URL(endpoint.slice(1));
      if (url.protocol === "http:" || url.protocol === "https:") {
        throw new ProxyInputError("endpoint must be a relative path");
      }
    } catch (error) {
      if (error instanceof ProxyInputError) {
        throw error;
      }
    }
    if (endpoint.includes("\\") || this.hasPathTraversalSegment(endpoint)) {
      throw new ProxyInputError("endpoint must not contain path traversal segments");
    }
  }

  private hasPathTraversalSegment(endpoint: string): boolean {
    const path = endpoint.split(/[?#]/u)[0]!;
    for (const segment of path.split("/")) {
      try {
        if (decodeURIComponent(segment) === "..") {
          return true;
        }
      } catch {
        return true;
      }
    }
    return false;
  }
}

function loggableProxyEndpoint(endpoint: string): string {
  return endpoint.split(/[?#]/u, 1)[0] || "/";
}
