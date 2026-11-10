import type { FetchLike, VersionNegotiationMode } from "@modelcontextprotocol/client";

import { Client, SdkHttpError } from "@modelcontextprotocol/client";
import { SSEClientTransport } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/client/validators/cf-worker";

const mcpConnectTimeoutMs = 60_000;
const modernMcpProtocolVersion = "2026-07-28";
const mcpJsonSchemaValidator = new CfWorkerJsonSchemaValidator();

export type McpHttpTransport = "streamable_http" | "sse";
export type McpProtocolVersion = "legacy" | "modern";

export interface McpClientOptions {
  endpoint: URL;
  transport: McpHttpTransport;
  fetcher?: FetchLike;
  headers?: HeadersInit;
  redirect?: RequestRedirect;
  signal?: AbortSignal;
  protocolVersion?: McpProtocolVersion;
  terminateSession?: boolean;
  retryOnSessionNotFound?: boolean;
  mapError?: (error: unknown) => unknown;
}

export async function withMcpClient<T>(options: McpClientOptions, run: (client: Client) => Promise<T>): Promise<T> {
  let retriedSession = false;
  while (true) {
    const transportOptions = {
      fetch: options.fetcher,
      requestInit: {
        headers: options.headers,
        redirect: options.redirect,
        signal: options.signal,
      },
    };
    const transport =
      options.transport === "sse"
        ? new SSEClientTransport(options.endpoint, transportOptions)
        : new StreamableHTTPClientTransport(options.endpoint, transportOptions);
    const client = new Client(
      { name: "open-connector", version: "1.0.0" },
      {
        jsonSchemaValidator: mcpJsonSchemaValidator,
        versionNegotiation: { mode: resolveVersionNegotiationMode(options.protocolVersion) },
      },
    );
    let connected = false;

    try {
      await client.connect(transport, { timeout: mcpConnectTimeoutMs, signal: options.signal });
      connected = true;
      return await run(client);
    } catch (error) {
      if (
        connected &&
        options.transport === "streamable_http" &&
        options.retryOnSessionNotFound === true &&
        !retriedSession &&
        error instanceof SdkHttpError &&
        error.status === 404
      ) {
        retriedSession = true;
        continue;
      }
      throw options.mapError ? options.mapError(error) : error;
    } finally {
      if (options.terminateSession && transport instanceof StreamableHTTPClientTransport) {
        await terminateMcpSession(transport);
      }
      await client.close().catch(() => undefined);
    }
  }
}

async function terminateMcpSession(transport: StreamableHTTPClientTransport): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const termination = Promise.resolve()
    .then(() => transport.terminateSession())
    .catch(() => undefined);
  try {
    await Promise.race([
      termination,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 2_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function resolveVersionNegotiationMode(protocolVersion: McpProtocolVersion | undefined): VersionNegotiationMode {
  return protocolVersion === "modern" ? { pin: modernMcpProtocolVersion } : "legacy";
}
