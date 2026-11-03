import { describe, expect, it } from "vitest";
import { CimdClient, CimdError } from "./cimd-client.ts";

const DOCUMENT_URL = "https://client.example/mcp-client.json";

function documentResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function client(options: { body?: unknown; status?: number; url?: string }) {
  const requests: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    requests.push(String(input));
    if (options.url !== undefined) {
      return new Response(null, { status: 302, headers: { location: options.url } });
    }
    return documentResponse(options.body, options.status);
  }) as typeof fetch;
  return { client: new CimdClient({ fetch: fetcher }), requests };
}

const validDocument = {
  client_id: DOCUMENT_URL,
  client_name: "ChatGPT",
  redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
  token_endpoint_auth_method: "none",
};

describe("CimdClient.resolve", () => {
  it("fetches and normalizes a valid document", async () => {
    const { client: c, requests } = client({ body: validDocument });
    const metadata = await c.resolve(DOCUMENT_URL);
    expect(metadata.clientName).toBe("ChatGPT");
    expect(metadata.tokenEndpointAuthMethod).toBe("none");
    expect(requests).toEqual([DOCUMENT_URL]);
  });

  it("rejects non-https client ids without fetching", async () => {
    const { client: c } = client({ body: validDocument });
    await expect(c.resolve("http://client.example/mcp.json")).rejects.toThrow(CimdError);
  });

  it("rejects a document whose client_id does not match its URL", async () => {
    const { client: c } = client({ body: { ...validDocument, client_id: "https://other.example/doc.json" } });
    await expect(c.resolve(DOCUMENT_URL)).rejects.toThrow(/does not match/);
  });

  it("caches documents for one hour", async () => {
    let now = 1_000_000;
    let fetches = 0;
    const cached = new CimdClient({
      fetch: (async () => {
        fetches += 1;
        return documentResponse(validDocument);
      }) as typeof fetch,
      now: () => now,
    });
    await cached.resolve(DOCUMENT_URL);
    await cached.resolve(DOCUMENT_URL);
    expect(fetches).toBe(1);
    now += 3_600_001;
    await cached.resolve(DOCUMENT_URL);
    expect(fetches).toBe(2);
  });

  it("serves the last good document when a refetch fails after expiry", async () => {
    let failing = false;
    let now = 0;
    const fetcher = (async () => {
      if (failing) {
        throw new Error("host down");
      }
      return documentResponse(validDocument);
    }) as typeof fetch;
    const cached = new CimdClient({ fetch: fetcher, now: () => now });
    await cached.resolve(DOCUMENT_URL);
    failing = true;
    now = 3_600_001; // entry expired: refetch hits the failing network
    const metadata = await cached.resolve(DOCUMENT_URL);
    expect(metadata.clientName).toBe("ChatGPT");
  });

  it("rejects documents larger than 1 MiB", async () => {
    const big = { ...validDocument, client_name: "x".repeat(1024 * 1024 + 10) };
    const { client: c } = client({ body: big });
    await expect(c.resolve(DOCUMENT_URL)).rejects.toThrow(CimdError);
  });

  it("rejects error responses", async () => {
    const { client: c } = client({ status: 404, body: { message: "not found" } });
    await expect(c.resolve(DOCUMENT_URL)).rejects.toThrow(/404/);
  });
});
