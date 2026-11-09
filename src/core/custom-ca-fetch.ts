import type { Agent, RequestInit as UndiciRequestInit } from "undici";

import { providerInputError } from "../providers/provider-runtime.ts";
import { isCloudflareWorkerRuntime } from "./runtime-execution.ts";

/** Connections sharing one CA reuse one TLS connection pool; the oldest pool closes once this many exist. */
const maxCachedAgents = 32;
const agents = new Map<string, Promise<Agent>>();

/**
 * Create a base fetch transport that verifies servers against `caPem` instead
 * of the platform trust store, for self-hosted services such as Kubernetes API
 * servers whose certificates come from a private certificate authority.
 *
 * This is a raw transport: wrap it with `createProviderFetch` so the shared
 * SSRF guard still checks every hop. It accepts URL or string input only.
 * Node uses an undici Agent, loaded on first use; Bun uses its native `tls`
 * fetch option. Cloudflare Workers cannot supply a custom trust store, so a
 * request there fails with a 400 instead of falling back to the default one.
 */
export function createCustomCaFetch(caPem: string): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (input instanceof Request) {
      throw new TypeError("custom CA fetch accepts only URL or string input");
    }
    if (isCloudflareWorkerRuntime()) {
      throw providerInputError(
        "A custom certificate authority requires a Node.js or Bun runtime; Cloudflare Workers cannot trust connection-supplied CA certificates.",
      );
    }
    if ("Bun" in globalThis) {
      return globalThis.fetch(input, { ...init, tls: { ca: caPem } } as RequestInit);
    }
    const [{ fetch: undiciFetch }, dispatcher] = await Promise.all([import("undici"), customCaAgent(caPem)]);
    const response = await undiciFetch(input, { ...init, dispatcher } as UndiciRequestInit);
    return response as unknown as Response;
  }) as typeof fetch;
}

function customCaAgent(caPem: string): Promise<Agent> {
  const cached = agents.get(caPem);
  if (cached) {
    agents.delete(caPem);
    agents.set(caPem, cached);
    return cached;
  }
  const agent = import("undici").then(({ Agent }) => new Agent({ connect: { ca: caPem } }));
  agents.set(caPem, agent);
  if (agents.size > maxCachedAgents) {
    const [oldestKey, oldest] = agents.entries().next().value!;
    agents.delete(oldestKey);
    // close() lets requests already using the evicted pool finish.
    void oldest.then((evicted) => evicted.close()).catch(() => undefined);
  }
  return agent;
}
