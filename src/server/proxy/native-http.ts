import type { CatalogStore } from "../../catalog-store.ts";
import type { ConnectionService } from "../../connection-service.ts";
import type {
  ExecutionContext,
  NativeHttpDefinition,
  ResolvedCredential,
  RuntimeConfigReader,
} from "../../core/types.ts";
import type { IProviderLoader } from "../../providers/provider-loader.ts";
import type { Schema } from "@cfworker/json-schema";

import { Validator } from "@cfworker/json-schema";
import { ConnectionError } from "../../connection-service.ts";
import { normalizeProviderProxyEndpoint, providerFetch } from "../../providers/provider-runtime.ts";

export interface NativeHttpOptions {
  catalog: CatalogStore;
  connections: ConnectionService;
  providerLoader: IProviderLoader;
  runtimeConfig?: RuntimeConfigReader;
  fetcher?: typeof fetch;
}

export interface NativeHttpRequest {
  service: string;
  connectionName: string;
  endpoint: string;
  request: Request;
}

/** Selected-account, read-only HTTP transport. Callers must authenticate and authorize the connection first. */
export class NativeHttpRunner {
  private readonly options: NativeHttpOptions;
  constructor(options: NativeHttpOptions) {
    this.options = options;
  }

  async describe(service: string, connectionName: string): Promise<unknown> {
    const provider = this.options.catalog.providers.find((entry) => entry.service === service);
    if (!provider) throw new ConnectionError("unknown_service", "The service is unavailable.");
    const connection = await this.options.connections.getConnectionSummary(service, connectionName);
    return { service, connection, nativeHttp: provider.nativeHttp ?? null };
  }

  async run(input: NativeHttpRequest): Promise<Response> {
    const definition = this.options.catalog.providers.find((entry) => entry.service === input.service)?.nativeHttp;
    if (!definition)
      return failure(
        501,
        "connection_transport_unavailable",
        "This service has no native HTTP transport. Use its Plugin actions.",
      );
    try {
      const endpoint = normalizeProviderProxyEndpoint(input.endpoint);
      const url = new URL(definition.baseUrl);
      const target = new URL(`${definition.baseUrl.replace(/\/$/u, "")}${endpoint}`);
      if (target.origin !== url.origin || target.hash)
        return failure(400, "invalid_connection_request", "Use a relative provider API path.");
      const decodedPath = decodeURIComponent(endpoint.split("?", 1)[0]!);
      // Match the same canonical path that the provider will interpret.
      if (
        decodedPath.includes("%") ||
        decodedPath.includes("\\") ||
        decodedPath.split("/").some((part) => part === "." || part === "..")
      )
        return failure(400, "invalid_connection_request", "Use a canonical API path.");
      const rule = definition.read.find(
        (entry) => entry.method === input.request.method && new RegExp(entry.path, "u").test(decodedPath),
      );
      if (!rule)
        return failure(
          403,
          "connection_operation_not_allowed",
          "This request is not a declared read. Use a Plugin action for writes.",
        );
      let body: string | undefined;
      if (input.request.method === "POST") {
        if (!rule.bodySchema)
          return failure(403, "connection_operation_not_allowed", "This read requires a declared request schema.");
        body = await readBoundedText(input.request, 256 * 1024);
        const data: unknown = JSON.parse(body);
        if (!new Validator(rule.bodySchema as Schema, "2020-12").validate(data).valid) {
          return failure(
            400,
            "connection_input_invalid",
            "The request does not match the declared read schema. Inspect the connection description.",
          );
        }
        if (rule.timeWindow) {
          const from = readNumber(data, rule.timeWindow.from);
          const to = readNumber(data, rule.timeWindow.to);
          if (from === null || to === null || to <= from || to - from > rule.timeWindow.maxMilliseconds) {
            return failure(
              400,
              "connection_time_window_invalid",
              "Use a positive time window within the connection's declared limit.",
            );
          }
        }
      } else if (input.request.body) {
        return failure(400, "connection_input_invalid", "GET requests cannot include a body.");
      }
      const execution = await this.options.connections.resolveForExecution(input.service, input.connectionName);
      if (execution.kind !== "local")
        return failure(
          501,
          "connection_transport_unavailable",
          "Native HTTP reads require a local connection. Use this connection's Plugin actions.",
        );
      const context: ExecutionContext = {
        getCredential: execution.getCredential,
        runtimeConfig: this.options.runtimeConfig,
        signal: input.request.signal,
      };
      const headers = new Headers(definition.headers);
      const auth = await this.authentication(definition, input.service, context);
      auth.forEach((value, name) => headers.set(name, value));
      headers.set("accept", "application/json");
      if (body !== undefined) headers.set("content-type", "application/json");
      // Never forward caller cookies, authorization, or arbitrary headers. Never follow a credential-bearing redirect.
      const response = await (this.options.fetcher ?? providerFetch)(target, {
        method: input.request.method,
        headers,
        body,
        redirect: "manual",
        signal: input.request.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        return failure(
          502,
          "connection_redirect_rejected",
          "The provider redirected this request. No credentials were forwarded.",
        );
      }
      if (!response.body) return new Response(null, { status: response.status });
      if (!response.headers.get("content-type")?.includes("json")) {
        await response.body.cancel();
        return failure(
          502,
          "connection_response_type_unsupported",
          "This connection supports JSON API reads. Use Git transport for repository content.",
        );
      }
      const data: unknown = JSON.parse(await readBoundedText(response, 8 * 1024 * 1024));
      const secrets = [...auth.values()]
        .flatMap((value) => [value, value.replace(/^Bearer /u, "")])
        .filter((value) => value.length >= 8);
      return new Response(JSON.stringify(redact(data, secrets)), {
        status: response.status,
        headers: {
          "content-type": response.headers.get("content-type") ?? "application/octet-stream",
          "cache-control": "no-store",
        },
      });
    } catch (error) {
      if (error instanceof ConnectionError) return failure(409, error.code, error.message);
      return failure(
        400,
        "connection_request_failed",
        "The connection request could not complete. Check its input and current connection status.",
      );
    }
  }

  private async authentication(
    definition: NativeHttpDefinition,
    service: string,
    context: ExecutionContext,
  ): Promise<Headers> {
    if (definition.auth.type === "provider") {
      const resolve = await this.options.providerLoader.loadNativeHttpAuth?.(service);
      if (!resolve)
        throw new ConnectionError(
          "connection_transport_unavailable",
          "The provider authentication adapter is unavailable.",
        );
      return resolve(context);
    }
    const credential = await context.getCredential(service);
    const token = credentialValue(credential, definition.auth.credentialField);
    if (!token) throw new ConnectionError("connection_not_found", "Reconnect the selected Plugin account.");
    return new Headers(
      definition.auth.type === "bearer" ? { authorization: `Bearer ${token}` } : { [definition.auth.name]: token },
    );
  }
}

function credentialValue(credential: ResolvedCredential | undefined, field?: string): string | undefined {
  if (credential?.authType === "oauth2") return credential.accessToken;
  if (credential?.authType === "api_key") return field ? credential.values[field] : credential.apiKey;
  if (credential?.authType === "custom_credential" && field) return credential.values[field];
  return undefined;
}

function readNumber(value: unknown, path: string): number | null {
  for (const part of path.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) return null;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function readBoundedText(request: Request | Response, limit: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Request body required");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error("Request too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function failure(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });
}

function redact(value: unknown, secrets: string[]): unknown {
  if (typeof value === "string") {
    for (const secret of secrets) value = (value as string).replaceAll(secret, "[REDACTED]");
    return (value as string).replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu, "Bearer [REDACTED]");
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /^(authorization|cookie|set-cookie|password|secret|access[_-]?token|refresh[_-]?token|api[_-]?key)$/iu.test(key)
          ? "[REDACTED]"
          : redact(entry, secrets),
      ]),
    );
  return value;
}
