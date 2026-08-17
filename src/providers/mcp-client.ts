import { Client } from "@modelcontextprotocol/client";
import { SSEClientTransport } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/client/validators/cf-worker";

const mcpConnectTimeoutMs = 60_000;
const mcpJsonSchemaValidator = new CfWorkerJsonSchemaValidator();

export type McpHttpTransport = "streamable_http" | "sse";

export interface McpClientOptions {
  endpoint: URL;
  transport: McpHttpTransport;
  fetcher?: typeof fetch;
  headers?: HeadersInit;
  redirect?: RequestRedirect;
  signal?: AbortSignal;
  mapError?: (error: unknown) => unknown;
}

export async function withMcpClient<T>(options: McpClientOptions, run: (client: Client) => Promise<T>): Promise<T> {
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
      versionNegotiation: { mode: options.transport === "streamable_http" ? "auto" : "legacy" },
    },
  );

  try {
    await client.connect(transport, { timeout: mcpConnectTimeoutMs, signal: options.signal });
    return await run(client);
  } catch (error) {
    throw options.mapError ? options.mapError(error) : error;
  } finally {
    await client.close().catch(() => undefined);
  }
}
