import { afterEach, describe, expect, it, vi } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { gitlabActionHandlers, normalizeGitlabApiBaseUrl } from "./executors.ts";

// Tests mutate the deployment-level private-network flag; reset it to the secure
// default after each case so state never leaks between tests.
afterEach(() => setPrivateNetworkAccessAllowed(false));

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
        apiKey: "glpat-test",
        apiBaseUrl: "https://gitlab.example.com/api/v4",
        fetcher,
      },
    );
    expect(requests).toEqual(["https://gitlab.example.com/api/v4/user"]);
  });
});
