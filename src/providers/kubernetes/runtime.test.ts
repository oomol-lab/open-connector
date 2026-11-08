import type { ExecutionContext } from "../../core/types.ts";

import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCustomCaFetch } from "../../core/custom-ca-fetch.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { withProviderNetworkPolicy } from "../../core/provider-network-policy.ts";
import { createProviderFetch, ProviderRequestError } from "../provider-runtime.ts";
import { executors, proxy } from "./executors.ts";
import {
  createKubernetesContext,
  normalizeKubernetesBaseUrl,
  normalizeKubernetesCertificateAuthority,
  readKubernetesError,
  validateKubernetesCredential,
} from "./runtime.ts";

vi.mock("../../core/custom-ca-fetch.ts", () => ({ createCustomCaFetch: vi.fn() }));

const pem = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
const baseValues = { apiKey: "token", baseUrl: "https://cluster.example.com:6443" };

function executionContext(values: Record<string, string> = baseValues): ExecutionContext {
  return {
    getCredential: async () => ({
      authType: "api_key",
      apiKey: values.apiKey!,
      values,
      profile: { accountId: "kubernetes:test", displayName: "test", grantedScopes: [] },
      metadata: {},
    }),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetch(response: Response): ReturnType<typeof vi.fn<typeof fetch>> {
  const stub = vi.fn<typeof fetch>(async () => response);
  vi.stubGlobal("fetch", stub);
  return stub;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(createCustomCaFetch).mockReset();
  setDefaultGuardedFetchDnsLookup(null);
});

describe("normalizeKubernetesBaseUrl", () => {
  it("drops query, hash and trailing slashes while keeping a management-proxy path", () => {
    expect(normalizeKubernetesBaseUrl("https://rancher.example.com/k8s/clusters/c-1/?a=1#b")).toBe(
      "https://rancher.example.com/k8s/clusters/c-1",
    );
  });

  it.each([
    ["embedded credentials", "https://user:secret@cluster.example.com", "must not include credentials"],
    ["plain http", "http://cluster.example.com", "must use https"],
    ["loopback", "https://127.0.0.1:6443", "private or reserved"],
    ["cloud metadata", "https://169.254.169.254", "private or reserved"],
  ])("rejects %s", (_name, value, message) => {
    expect(() => normalizeKubernetesBaseUrl(value)).toThrow(message);
  });

  it("accepts a private address only when the deployment allows it", () => {
    expect(() => normalizeKubernetesBaseUrl("https://10.0.0.5:6443")).toThrow("private or reserved");
    expect(normalizeKubernetesBaseUrl("https://10.0.0.5:6443", true)).toBe("https://10.0.0.5:6443");
    expect(() => normalizeKubernetesBaseUrl("https://127.0.0.1:6443", true)).toThrow("private or reserved");
  });
});

describe("normalizeKubernetesCertificateAuthority", () => {
  it("returns undefined when no CA is configured", () => {
    expect(normalizeKubernetesCertificateAuthority(undefined)).toBeUndefined();
    expect(normalizeKubernetesCertificateAuthority("  ")).toBeUndefined();
  });

  it("keeps PEM and strips anything outside the certificate blocks", () => {
    expect(normalizeKubernetesCertificateAuthority(`subject=cluster\n${pem}\ntrailing`)).toBe(`${pem}\n`);
  });

  it("decodes kubeconfig base64, including wrapped lines, to the same PEM", () => {
    const encoded = Buffer.from(pem).toString("base64");

    expect(normalizeKubernetesCertificateAuthority(encoded)).toBe(`${pem}\n`);
    expect(normalizeKubernetesCertificateAuthority(`${encoded.slice(0, 8)}\n${encoded.slice(8)}`)).toBe(`${pem}\n`);
  });

  it("keeps every certificate of a chain", () => {
    expect(normalizeKubernetesCertificateAuthority(`${pem}\n${pem}`)).toBe(`${pem}\n${pem}\n`);
  });

  it.each([
    ["undecodable text", "not a certificate!"],
    ["base64 that is not PEM", Buffer.from("plain text").toString("base64")],
    ["a private key", "-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----"],
  ])("rejects %s", (_name, value) => {
    expect(() => normalizeKubernetesCertificateAuthority(value)).toThrow(ProviderRequestError);
  });
});

describe("readKubernetesError", () => {
  const status = (code: number, message = "pods is forbidden"): Response =>
    json({ kind: "Status", status: "Failure", message, reason: "Forbidden", code }, code);

  it("reports the Status message and reason", async () => {
    const error = await readKubernetesError(status(403));

    expect(error).toMatchObject({ status: 403, message: "pods is forbidden", details: { reason: "Forbidden" } });
  });

  it.each([
    [401, "execute", 401],
    [403, "execute", 403],
    [401, "validate", 400],
    [403, "validate", 400],
    [404, "execute", 404],
    [409, "execute", 409],
    [422, "execute", 422],
    [410, "execute", 400],
    [429, "execute", 429],
    [500, "execute", 502],
    [503, "execute", 502],
  ] as const)("maps upstream %i during %s to %i", async (upstream, phase, expected) => {
    await expect(readKubernetesError(status(upstream), phase)).resolves.toMatchObject({ status: expected });
  });

  it("falls back to the status text when the body is not a Status", async () => {
    const error = await readKubernetesError(new Response("<html>", { status: 502, statusText: "Bad Gateway" }));

    expect(error).toMatchObject({ status: 502, message: "Bad Gateway", details: { reason: null } });
  });

  it("names the HTTP status when nothing else describes the failure", async () => {
    const error = await readKubernetesError(new Response("", { status: 500 }));

    expect(error.message).toBe("Kubernetes request failed with HTTP 500");
  });
});

describe("kubernetes actions", () => {
  it("reads logs up to limitBytes and reports the cut", async () => {
    const fetcher = stubFetch(new Response("abcdef"));

    const result = await executors["kubernetes.get_pod_logs"]!(
      { namespace: "default", name: "web-1", limitBytes: 5, tailLines: 10, previous: true },
      executionContext(),
    );

    expect(result).toEqual({ ok: true, output: { logs: "abcde", truncated: true } });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.pathname).toBe("/api/v1/namespaces/default/pods/web-1/log");
    expect(Object.fromEntries(url.searchParams)).toEqual({ limitBytes: "6", tailLines: "10", previous: "true" });
  });

  it("does not report a log that fits exactly as truncated", async () => {
    stubFetch(new Response("abcde"));

    const result = await executors["kubernetes.get_pod_logs"]!(
      { namespace: "default", name: "web-1", limitBytes: 5 },
      executionContext(),
    );

    expect(result).toEqual({ ok: true, output: { logs: "abcde", truncated: false } });
  });

  it("cuts a server overrun of limitBytes locally, without splitting a character", async () => {
    stubFetch(new Response("abcdé and more"));

    const result = await executors["kubernetes.get_pod_logs"]!(
      { namespace: "default", name: "web-1", limitBytes: 5 },
      executionContext(),
    );

    expect(result).toEqual({ ok: true, output: { logs: "abcd", truncated: true } });
  });

  it("fails rather than buffering when the server ignores limitBytes", async () => {
    stubFetch(new Response("x".repeat(128 * 1024)));

    const result = await executors["kubernetes.get_pod_logs"]!(
      { namespace: "default", name: "web-1", limitBytes: 2 },
      executionContext(),
    );

    expect(result).toMatchObject({ ok: false, error: { details: { status: 413 } } });
  });

  it("refuses dot segments that URL parsing would walk out of the resource path", async () => {
    const fetcher = stubFetch(json({}));

    const result = await executors["kubernetes.get_pod"]!({ namespace: "..", name: "x" }, executionContext());

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("pages through a list and surfaces the continue cursor", async () => {
    const fetcher = stubFetch(
      json({
        metadata: { continue: "next" },
        items: [
          {
            metadata: { name: "web-1", namespace: "default", labels: { app: "web", empty: "" }, managedFields: [{}] },
            spec: { nodeName: "node-1", containers: [{}, {}] },
            status: {
              phase: "Running",
              initContainerStatuses: [{ name: "setup", state: { terminated: { reason: "Completed", exitCode: 0 } } }],
              containerStatuses: [
                { name: "a", ready: true, restartCount: 2, state: { running: {} } },
                {
                  name: "b",
                  ready: false,
                  restartCount: 3,
                  state: { waiting: { reason: "CrashLoopBackOff", message: "back-off" } },
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await executors["kubernetes.list_pods"]!(
      { namespace: "default", labelSelector: "app=web", continue: "cursor" },
      executionContext(),
    );

    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.pathname).toBe("/api/v1/namespaces/default/pods");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      labelSelector: "app=web",
      limit: "100",
      continue: "cursor",
    });
    expect(result.output).toMatchObject({
      continue: "next",
      pods: [
        {
          name: "web-1",
          labels: { app: "web", empty: "" },
          readyContainers: 1,
          totalContainers: 2,
          restartCount: 5,
          containers: [{ state: "running" }, { state: "waiting", reason: "CrashLoopBackOff", message: "back-off" }],
          initContainers: [{ name: "setup", state: "terminated", reason: "Completed", exitCode: 0 }],
        },
      ],
    });
    expect(JSON.stringify(result.output)).not.toContain("managedFields");
  });

  it("restarts a deployment with a strategic merge patch of the pod template", async () => {
    const fetcher = stubFetch(json({ metadata: { name: "web" } }));

    await executors["kubernetes.restart_deployment"]!({ namespace: "default", name: "web" }, executionContext());

    const init = fetcher.mock.calls[0]![1]!;
    expect(new Headers(init.headers).get("content-type")).toBe("application/strategic-merge-patch+json");
    const annotations = JSON.parse(String(init.body)).spec.template.metadata.annotations;
    expect(annotations["kubectl.kubernetes.io/restartedAt"]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

describe("kubernetes transport", () => {
  const caValues = { ...baseValues, certificateAuthorityData: pem };

  it("sends actions through a transport trusting the connection's CA", async () => {
    const transport = vi.fn<typeof fetch>(async () => json({ items: [] }));
    vi.mocked(createCustomCaFetch).mockReturnValue(transport);
    const platformFetch = stubFetch(json({}));

    const result = await executors["kubernetes.list_nodes"]!({}, executionContext(caValues));

    expect(result.ok).toBe(true);
    expect(createCustomCaFetch).toHaveBeenCalledWith(`${pem}\n`);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(platformFetch).not.toHaveBeenCalled();
  });

  it("sends the proxy through the same transport with the guard still applied", async () => {
    const transport = vi.fn<typeof fetch>(async () => json({ ok: true }));
    vi.mocked(createCustomCaFetch).mockReturnValue(transport);

    const result = await proxy({ method: "GET", endpoint: "/api/v1/nodes" }, executionContext(caValues));

    expect(result.ok).toBe(true);
    expect(String(transport.mock.calls[0]![0])).toBe("https://cluster.example.com:6443/api/v1/nodes");
    expect(new Headers(transport.mock.calls[0]![1]!.headers).get("authorization")).toBe("Bearer token");
  });

  it("keeps an injected fetcher's bound network policy when a CA replaces the transport", async () => {
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "10.0.0.2", family: 4 }]);
    const transport = vi.fn<typeof fetch>(async () => json({ items: [] }));
    vi.mocked(createCustomCaFetch).mockReturnValue(transport);
    const bound = createProviderFetch({ network: { trustedHosts: ["cluster.example.com"] } });

    const context = createKubernetesContext(caValues, "token", bound);
    await expect(context.fetcher(`${context.apiBaseUrl}/api/v1/nodes`)).resolves.toBeInstanceOf(Response);

    const unbound = createKubernetesContext(caValues, "token", createProviderFetch());
    await expect(unbound.fetcher(`${unbound.apiBaseUrl}/api/v1/nodes`)).rejects.toThrow("private or reserved");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("reaches a private API server only when the runtime allows it", async () => {
    const values = { ...baseValues, baseUrl: "https://10.0.0.5:6443" };
    const platformFetch = stubFetch(json({ items: [] }));

    const blocked = await executors["kubernetes.list_nodes"]!({}, executionContext(values));
    expect(blocked.ok).toBe(false);
    expect(platformFetch).not.toHaveBeenCalled();

    await withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      const allowed = await executors["kubernetes.list_nodes"]!({}, executionContext(values));
      expect(allowed.ok).toBe(true);
    });
    expect(platformFetch).toHaveBeenCalledTimes(1);
  });
});

describe("validateKubernetesCredential", () => {
  const review = (username?: string): Response =>
    json({ kind: "SelfSubjectReview", status: { userInfo: { username } } }, 201);

  it("identifies the token through a SelfSubjectReview", async () => {
    const fetcher = stubFetch(review("system:serviceaccount:default:agent"));

    const result = await validateKubernetesCredential(baseValues, "token", createProviderFetch());

    expect(result.profile).toEqual({
      accountId: "kubernetes:cluster.example.com:6443:system:serviceaccount:default:agent",
      displayName: "system:serviceaccount:default:agent on cluster.example.com:6443",
    });
    expect(result.metadata).toEqual({ apiBaseUrl: "https://cluster.example.com:6443" });
    expect(String(fetcher.mock.calls[0]![0])).toBe(
      "https://cluster.example.com:6443/apis/authentication.k8s.io/v1/selfsubjectreviews",
    );
    expect(fetcher.mock.calls[0]![1]!.method).toBe("POST");
  });

  it("reports a rejected token as a field error", async () => {
    stubFetch(json({ kind: "Status", message: "Unauthorized", reason: "Unauthorized" }, 401));

    await expect(validateKubernetesCredential(baseValues, "bad", createProviderFetch())).rejects.toMatchObject({
      status: 400,
      message: "Unauthorized",
    });
  });

  it("explains a server without SelfSubjectReview", async () => {
    stubFetch(new Response("404 page not found", { status: 404 }));

    await expect(validateKubernetesCredential(baseValues, "token", createProviderFetch())).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("1.28"),
    });
  });

  it("rejects a response that names no subject", async () => {
    stubFetch(review());

    await expect(validateKubernetesCredential(baseValues, "token", createProviderFetch())).rejects.toMatchObject({
      status: 400,
    });
  });
});
