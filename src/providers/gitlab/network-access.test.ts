import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { executors, gitlabActionHandlers, normalizeGitlabApiBaseUrl, proxy } from "./executors.ts";

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

const apiKey = "glpat-test";

// Tests mutate the deployment-level private-network flag; reset it to the secure
// default after each case so state never leaks between tests.
afterEach(() => {
  vi.unstubAllGlobals();
  setPrivateNetworkAccessAllowed(false);
});

describe("normalizeGitlabApiBaseUrl", () => {
  it("defaults to GitLab.com when no instance URL is provided", () => {
    for (const value of [undefined, null, "", "   "]) {
      expect(normalizeGitlabApiBaseUrl(value)).toBe("https://gitlab.com/api/v4");
    }
  });

  it("appends /api/v4 to a self-hosted instance URL", () => {
    expect(normalizeGitlabApiBaseUrl("https://gitlab.example.com")).toBe("https://gitlab.example.com/api/v4");
    expect(normalizeGitlabApiBaseUrl("https://gitlab.example.com/")).toBe("https://gitlab.example.com/api/v4");
    expect(normalizeGitlabApiBaseUrl("https://example.com/gitlab")).toBe("https://example.com/gitlab/api/v4");
    expect(normalizeGitlabApiBaseUrl("https://gitlab.example.com/api/v4")).toBe("https://gitlab.example.com/api/v4");
  });

  it("drops query and hash components", () => {
    expect(normalizeGitlabApiBaseUrl("https://gitlab.example.com/?a=1#b")).toBe("https://gitlab.example.com/api/v4");
  });

  it("rejects embedded credentials and invalid URLs", () => {
    expect(() => normalizeGitlabApiBaseUrl("https://user:pass@gitlab.example.com")).toThrow();
    expect(() => normalizeGitlabApiBaseUrl("ftp://gitlab.example.com")).toThrow();
    expect(() => normalizeGitlabApiBaseUrl("not a url")).toThrow();
  });

  it("rejects private and overlay targets by default (public-only guard)", () => {
    for (const value of ["http://10.0.0.2", "http://192.168.1.2", "http://100.64.0.2", "http://gitlab.internal"]) {
      expect(() => normalizeGitlabApiBaseUrl(value)).toThrow();
    }
  });

  it("allows private targets when the deployment enables private networks", () => {
    setPrivateNetworkAccessAllowed(true);
    for (const value of ["http://10.0.0.2", "http://192.168.1.2", "http://100.64.0.2", "http://gitlab.internal"]) {
      expect(normalizeGitlabApiBaseUrl(value)).toBe(`${value}/api/v4`);
    }
  });

  it("keeps unsafe local, link-local, and metadata targets blocked even when private networks are enabled", () => {
    setPrivateNetworkAccessAllowed(true);
    for (const value of ["http://localhost", "http://127.0.0.1", "http://169.254.169.254"]) {
      expect(() => normalizeGitlabApiBaseUrl(value)).toThrow();
    }
  });

  it("honors an explicit allowPrivateNetwork override regardless of the deployment default", () => {
    expect(normalizeGitlabApiBaseUrl("http://10.0.0.2", true)).toBe("http://10.0.0.2/api/v4");
    setPrivateNetworkAccessAllowed(true);
    expect(() => normalizeGitlabApiBaseUrl("http://10.0.0.2", false)).toThrow();
  });
});

describe("GitLab self-hosted requests", () => {
  it("sends requests to the configured instance base URL", async () => {
    const requests: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      requests.push(input instanceof Request ? input.url : String(input));
      return new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await gitlabActionHandlers.get_current_user(
      {},
      {
        apiKey,
        apiBaseUrl: "https://gitlab.example.com/api/v4",
        fetcher,
      },
    );
    expect(requests).toEqual(["https://gitlab.example.com/api/v4/user"]);
  });
});

// The suite above drives handlers with a hand-built context, which cannot catch a
// createContext that reads the wrong credential field or drops the egress guard.
// These cases go through the real action executor instead.
describe("GitLab action executors", () => {
  it("resolves the instance from the connection credential", async () => {
    const requests = stubGlobalFetch([Response.json({ id: 7, username: "root" })]);

    await expect(
      executors["gitlab.get_current_user"]!({}, executionContext({ baseUrl: "https://gitlab.example.com" })),
    ).resolves.toMatchObject({ ok: true, output: { id: 7, username: "root" } });

    expect(requests.map((request) => request.url)).toEqual(["https://gitlab.example.com/api/v4/user"]);
    expect(requestHeaders(requests[0]).get("private-token")).toBe(apiKey);
  });

  it("keeps targeting GitLab.com when the connection carries no instance URL", async () => {
    const requests = stubGlobalFetch([Response.json({ id: 42 })]);

    await expect(executors["gitlab.get_current_user"]!({}, executionContext({}))).resolves.toMatchObject({ ok: true });

    expect(requests.map((request) => request.url)).toEqual(["https://gitlab.com/api/v4/user"]);
  });

  it("rejects a private instance before issuing a request unless the deployment opts in", async () => {
    const requests = stubGlobalFetch([]);

    await expect(
      executors["gitlab.get_current_user"]!({}, executionContext({ baseUrl: "http://10.0.0.5" })),
    ).resolves.toMatchObject({ ok: false, error: { code: "invalid_input" } });

    expect(requests).toEqual([]);
  });

  it("reaches a private instance once the deployment allows private networks", async () => {
    setPrivateNetworkAccessAllowed(true);
    const requests = stubGlobalFetch([Response.json({ id: 7 })]);

    await expect(
      executors["gitlab.get_current_user"]!({}, executionContext({ baseUrl: "http://10.0.0.5" })),
    ).resolves.toMatchObject({ ok: true });

    expect(requests.map((request) => request.url)).toEqual(["http://10.0.0.5/api/v4/user"]);
  });
});

// The proxy replaced a registry entry that hardcoded gitlab.com as the base URL for
// every connection, so these cases pin the routing that fix depends on.
describe("GitLab proxy", () => {
  it("sends the connection token to its own instance rather than GitLab.com", async () => {
    const requests = stubGlobalFetch([Response.json({ id: 7 })]);

    await expect(
      proxy({ method: "GET", endpoint: "/user" }, executionContext({ baseUrl: "https://gitlab.example.com" })),
    ).resolves.toMatchObject({ ok: true, response: { status: 200, data: { id: 7 } } });

    expect(requests.map((request) => request.url)).toEqual(["https://gitlab.example.com/api/v4/user"]);
    expect(requestHeaders(requests[0]).get("private-token")).toBe(apiKey);
  });

  it("prefers the apiBaseUrl resolved at validation over the raw credential value", async () => {
    const requests = stubGlobalFetch([Response.json({})]);

    await expect(
      proxy(
        { method: "GET", endpoint: "/user" },
        executionContext(
          { baseUrl: "https://ignored.example.com" },
          { apiBaseUrl: "https://gitlab.example.com/api/v4" },
        ),
      ),
    ).resolves.toMatchObject({ ok: true });

    expect(requests.map((request) => request.url)).toEqual(["https://gitlab.example.com/api/v4/user"]);
  });

  it("keeps defaulting to GitLab.com for connections without an instance URL", async () => {
    const requests = stubGlobalFetch([Response.json({})]);

    await expect(proxy({ method: "GET", endpoint: "/user" }, executionContext({}))).resolves.toMatchObject({
      ok: true,
    });

    expect(requests.map((request) => request.url)).toEqual(["https://gitlab.com/api/v4/user"]);
  });

  it("rejects a private instance before issuing a request unless the deployment opts in", async () => {
    const requests = stubGlobalFetch([]);

    await expect(
      proxy({ method: "GET", endpoint: "/user" }, executionContext({ baseUrl: "http://10.0.0.5" })),
    ).resolves.toMatchObject({ ok: false });

    expect(requests).toEqual([]);
  });

  it("reaches a private instance through the guarded fetch once private networks are enabled", async () => {
    setPrivateNetworkAccessAllowed(true);
    const requests = stubGlobalFetch([Response.json({ id: 7 })]);

    await expect(
      proxy({ method: "GET", endpoint: "/user" }, executionContext({ baseUrl: "http://10.0.0.5" })),
    ).resolves.toMatchObject({ ok: true });

    expect(requests.map((request) => request.url)).toEqual(["http://10.0.0.5/api/v4/user"]);
  });
});

function executionContext(values: Record<string, string>, metadata: Record<string, unknown> = {}): ExecutionContext {
  const credential: ResolvedCredential = {
    authType: "api_key",
    apiKey,
    values: { apiKey, ...values },
    profile: { accountId: "gitlab:test", displayName: "GitLab test", grantedScopes: [] },
    metadata,
  };
  return { getCredential: async () => credential };
}

function stubGlobalFetch(responses: Response[]): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requests.push({
      url: input instanceof Request ? input.url : String(input),
      init: init ? { ...init, headers: new Headers(init.headers) } : undefined,
    });
    const response = responses.shift();
    if (!response) {
      throw new Error("unexpected extra request");
    }
    return response;
  });
  return requests;
}

function requestHeaders(request: RecordedRequest | undefined): Headers {
  return new Headers(request?.init?.headers);
}
