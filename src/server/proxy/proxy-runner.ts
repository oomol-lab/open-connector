import type { CatalogStore } from "../../catalog-store.ts";
import type { ConnectionService } from "../../connection-service.ts";
import type { ProxyRequestInput, ProxyResponse } from "../../core/types.ts";
import type { IProviderLoader } from "../../providers/provider-loader.ts";
import type { Logger } from "../logger.ts";

import { ConnectionError } from "../../connection-service.ts";
import { optionalRecord, requiredString } from "../../core/cast.ts";
import { mapConnectionErrorStatus } from "../api/runtime-api.ts";

export type ProxyFailureStatus = 400 | 403 | 404 | 409 | 429 | 500 | 501;

export interface ProxyRunnerOptions {
  catalog: CatalogStore;
  providerLoader: IProviderLoader;
  connections: ConnectionService;
  logger?: Logger;
}

export interface RunProxyInput {
  service: string;
  input: unknown;
  connectionName?: string;
}

export type ProxyRunResult =
  | {
      ok: true;
      response: ProxyResponse;
    }
  | ProxyRunFailure;

export interface ProxyRunFailure {
  ok: false;
  status: ProxyFailureStatus;
  errorCode: string;
  message: string;
  data?: unknown;
  meta?: Record<string, unknown>;
}

type ProxyRequestReadResult = { ok: true; input: ProxyRequestInput } | ProxyRunFailure;

class ProxyInputError extends Error {}

const supportedProxyMethods = new Set(["DELETE", "GET", "PATCH", "POST", "PUT"]);

export class ProxyRunner {
  private readonly options: ProxyRunnerOptions;

  constructor(options: ProxyRunnerOptions) {
    this.options = options;
  }

  async run(input: RunProxyInput): Promise<ProxyRunResult> {
    const provider = this.options.catalog.providers.find((candidate) => candidate.service === input.service);
    if (!provider) {
      return {
        ok: false,
        status: 404,
        errorCode: "invalid_input",
        message: `unknown service: ${input.service}`,
        meta: { service: input.service },
      };
    }

    const executor = await this.options.providerLoader.loadProxyExecutor(provider.service, provider.displayName);
    if (!executor) {
      return {
        ok: false,
        status: 501,
        errorCode: "proxy_not_supported",
        message: `Proxy execution is not supported for ${provider.service}.`,
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
      endpoint: request.input.endpoint,
      connectionName: input.connectionName,
    };
    this.options.logger?.info(logContext, "proxy request started");
    const startedAtMs = Date.now();
    try {
      await this.options.connections.getConnectionSummary(provider.service, input.connectionName);
      const result = await executor(request.input, {
        ...this.options.connections.forConnection(input.connectionName),
      });
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
        status: this.mapProxyErrorStatus(result.error.code),
        errorCode: result.error.code,
        message: result.error.message,
        data: result.error.details ?? null,
        meta: { service: provider.service },
      };
      this.options.logger?.warn({ ...logContext, durationMs, errorCode: failure.errorCode }, "proxy request failed");
      return failure;
    } catch (error) {
      if (error instanceof ConnectionError) {
        return {
          ok: false,
          status: mapConnectionErrorStatus(error),
          errorCode: error.code,
          message: error.message,
          meta: { service: provider.service },
        };
      }

      throw error;
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
        throw new ProxyInputError("method must be one of DELETE, GET, PATCH, POST, or PUT.");
      }

      const request: ProxyRequestInput = {
        endpoint,
        method,
      };
      const query = optionalRecord(body.query);
      if (query) {
        request.query = query;
      }
      const headers = optionalRecord(body.headers);
      if (headers) {
        request.headers = headers;
      }
      if ("body" in body) {
        request.body = body.body;
      }
      return { ok: true, input: request };
    } catch (error) {
      if (error instanceof ProxyInputError) {
        return {
          ok: false,
          status: 400,
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
      new URL(endpoint);
      throw new ProxyInputError("endpoint must be a relative path");
    } catch (error) {
      if (error instanceof ProxyInputError) {
        throw error;
      }
    }
    if (endpoint.includes("\\") || endpoint.split("/").includes("..")) {
      throw new ProxyInputError("endpoint must not contain path traversal segments");
    }
  }

  private mapProxyErrorStatus(code: string): ProxyFailureStatus {
    if (code === "authorization_failed") {
      return 403;
    }
    if (code === "connection_not_found") {
      return 404;
    }
    if (code === "rate_limited") {
      return 429;
    }
    if (code === "provider_error") {
      return 500;
    }
    return 400;
  }
}
