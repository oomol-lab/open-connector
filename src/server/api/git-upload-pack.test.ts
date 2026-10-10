import type { ConnectionService } from "../../connection-service.ts";
import type { ActionPolicySnapshot } from "../../core/action-policy.ts";
import type { RuntimeConfigReader } from "../../core/types.ts";

import { Hono } from "hono";
import { exportPKCS8, generateKeyPair } from "jose";
import { gzipSync, gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { ActionPolicyService } from "../../core/action-policy.ts";
import { GitHubAppInstallationService } from "../../providers/github/installation-service.ts";
import { createLocalAuthMiddleware } from "./auth.ts";
import { handleGitUploadPack } from "./git-upload-pack.ts";

const runtimeToken = "test-runtime-only";
const credentialProfile = { accountId: "42", displayName: "Test account", grantedScopes: ["repo"] };
const memberCredential = {
  authType: "oauth2" as const,
  accessToken: "test-github-only",
  tokenType: "Bearer",
  profile: credentialProfile,
  metadata: {},
};
const requesterHeaders = {
  authorization: `Bearer ${runtimeToken}`,
  "x-openmeld-organization-id": "org_test",
  "x-openmeld-requester-user-id": "user_one",
  "x-openmeld-operation-id": "checkout_1",
  "x-openmeld-repository": "amplifthq/openmeld",
};

function createApp(
  fetcher: typeof fetch,
  getCredential = vi.fn<ConnectionService["getCredential"]>(async () => memberCredential),
  policy = new ActionPolicyService().createSnapshot(),
  getPolicy: () => Promise<ActionPolicySnapshot> = async () => policy,
  runtimeConfig?: RuntimeConfigReader,
) {
  const app = new Hono();
  const auth = { adminToken: "admin-token", runtimeToken };
  const connections = { getCredential } as unknown as ConnectionService;
  const githubAppInstallations = new GitHubAppInstallationService({ connections, fetcher, runtimeConfig });
  app.use("*", createLocalAuthMiddleware(auth));
  app.get("/v1/openmeld/git/:owner/:repo/info/refs", (context) =>
    handleGitUploadPack(context, {
      auth,
      connections,
      getPolicy,
      fetcher,
      operation: "advertise",
      owner: context.req.param("owner"),
      repo: context.req.param("repo"),
    }),
  );
  app.post("/v1/openmeld/git/:owner/:repo/git-upload-pack", (context) =>
    handleGitUploadPack(context, {
      auth,
      connections,
      getPolicy,
      fetcher,
      operation: "upload",
      owner: context.req.param("owner"),
      repo: context.req.param("repo"),
    }),
  );
  for (const operation of ["advertise", "upload"] as const) {
    app.on(
      operation === "advertise" ? "GET" : "POST",
      `/v1/openmeld/git-connections/:owner/:repo/${operation === "advertise" ? "info/refs" : "git-upload-pack"}`,
      (context) =>
        handleGitUploadPack(context, {
          auth,
          connections,
          getPolicy,
          fetcher,
          resolveInstallationToken: githubAppInstallations.resolveInstallationToken.bind(githubAppInstallations),
          selectedConnection: true,
          operation,
          owner: context.req.param("owner"),
          repo: context.req.param("repo"),
        }),
    );
  }
  return { app, getCredential };
}

describe("OpenMeld Git upload-pack streaming", () => {
  const selectedUrl = "/v1/openmeld/git-connections/amplifthq/openmeld/info/refs?service=git-upload-pack";
  const memberAlias = "org_jDP24TXqHDw4QFPNXJ__user_6FQDVzWXOz5qutcJ8L__github";
  const sharedAlias = "org_jDP24TXqHDw4QFPNXJ__shared__github";
  const memberHeaders = {
    ...requesterHeaders,
    "x-openmeld-connection-scope": "member",
    "x-oo-connector-alias": memberAlias,
  };

  it("rejects missing, cross-member and cross-organization selectors before credential lookup", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const { app, getCredential } = createApp(fetcher);
    for (const headers of [
      requesterHeaders,
      { ...memberHeaders, "x-oo-connector-alias": sharedAlias },
      { ...memberHeaders, "x-openmeld-requester-user-id": "user_two" },
      { ...memberHeaders, "x-openmeld-organization-id": "org_other" },
      { ...memberHeaders, "x-openmeld-connection-scope": "unknown" },
    ]) {
      expect((await app.request(selectedUrl, { headers })).status).toBe(400);
    }
    expect(
      (await app.request(selectedUrl, { headers: { ...memberHeaders, authorization: "Bearer admin-token" } })).status,
    ).toBe(401);
    expect(getCredential).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps concurrent member credentials separate and rechecks a revoked connection", async () => {
    const getCredential = vi.fn<ConnectionService["getCredential"]>(async (_service, name) => ({
      authType: "api_key",
      apiKey: name ?? "",
      values: {},
      profile: credentialProfile,
      metadata: {},
    }));
    const seen = new Set<string>();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      seen.add(new Headers(init?.headers).get("authorization") ?? "");
      return new Response("0000", { headers: { "content-type": "application/x-git-upload-pack-advertisement" } });
    });
    const { app } = createApp(fetcher, getCredential);
    const secondAlias = "org_jDP24TXqHDw4QFPNXJ__user_Vy799UEqotuhb5Xalk__github";
    const responses = await Promise.all([
      app.request(selectedUrl, { headers: memberHeaders }),
      app.request(selectedUrl, {
        headers: { ...memberHeaders, "x-openmeld-requester-user-id": "user_two", "x-oo-connector-alias": secondAlias },
      }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(seen).toEqual(
      new Set(
        [memberAlias, secondAlias].map((alias) => `Basic ${Buffer.from(`x-access-token:${alias}`).toString("base64")}`),
      ),
    );
    getCredential.mockResolvedValueOnce(undefined);
    expect((await app.request(selectedUrl, { headers: memberHeaders })).status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(getCredential).toHaveBeenCalledTimes(3);
  });

  it("uses the selected GitHub App installation without returning its token", async () => {
    const keys = await generateKeyPair("RS256", { extractable: true });
    const pem = await exportPKCS8(keys.privateKey);
    const runtimeConfig: RuntimeConfigReader = (name) =>
      name === "OOMOL_CONNECT_GITHUB_APP_ID"
        ? "12345"
        : name === "OOMOL_CONNECT_GITHUB_APP_PRIVATE_KEY"
          ? pem
          : undefined;
    const getCredential = vi.fn<ConnectionService["getCredential"]>(async () => ({
      authType: "custom_credential",
      values: { installationId: "987" },
      profile: credentialProfile,
      metadata: {},
    }));
    // GitHub REST installation and access-token response fields, shared with
    // the provider's app-auth contract tests. No executor mock replaces auth.
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          id: 987,
          app_id: 12345,
          account: {
            id: 42,
            login: "amplifthq",
            type: "Organization",
            avatar_url: "https://avatars.githubusercontent.com/u/42",
            html_url: "https://github.com/amplifthq",
          },
          permissions: { contents: "read" },
          repository_selection: "selected",
          suspended_at: null,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          token: "installation-secret",
          expires_at: "2099-01-01T00:00:00Z",
          permissions: { contents: "read" },
          repository_selection: "selected",
        }),
      )
      .mockResolvedValueOnce(
        new Response("0000", { headers: { "content-type": "application/x-git-upload-pack-advertisement" } }),
      );
    const { app } = createApp(fetcher, getCredential, undefined, undefined, runtimeConfig);
    const headers = { ...memberHeaders, "x-openmeld-connection-scope": "shared", "x-oo-connector-alias": sharedAlias };
    const response = await app.request(selectedUrl, { headers });
    expect(response.status).toBe(200);
    expect(getCredential).toHaveBeenCalledWith("github", sharedAlias);
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://api.github.com/app/installations/987/access_tokens");
    expect(new Headers(fetcher.mock.calls[2]?.[1]?.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("x-access-token:installation-secret").toString("base64")}`,
    );
    expect(await response.text()).toBe("0000");
    expect([...response.headers.values()].join(" ")).not.toContain("installation-secret");
    // A removed installation must not reuse the previous installation token.
    fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await app.request(selectedUrl, { headers })).status).toBe(503);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("requires the configured runtime bearer and derives a member connection on every request", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Response("0000", {
          headers: {
            "content-type":
              init?.method === "GET"
                ? "application/x-git-upload-pack-advertisement"
                : "application/x-git-upload-pack-result",
          },
        }),
    );
    const { app, getCredential } = createApp(fetchMock as unknown as typeof fetch);
    const url = "/v1/openmeld/git/amplifthq/openmeld/info/refs?service=git-upload-pack";

    expect((await app.request(url)).status).toBe(401);
    expect(
      (await app.request(url, { headers: { ...requesterHeaders, authorization: "Bearer admin-token" } })).status,
    ).toBe(401);
    expect((await app.request(url, { headers: requesterHeaders })).status).toBe(200);
    expect(
      (await app.request(url, { headers: { ...requesterHeaders, "x-openmeld-requester-user-id": "user_two" } })).status,
    ).toBe(200);
    expect(getCredential).toHaveBeenCalledTimes(2);
    expect(getCredential.mock.calls[0]?.[1]).toMatch(/^org_[A-Za-z0-9_-]{18}__user_[A-Za-z0-9_-]{18}__github$/u);
    expect(getCredential.mock.calls[0]?.[1]).not.toBe(getCredential.mock.calls[1]?.[1]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://github.com/amplifthq/openmeld.git/info/refs?service=git-upload-pack",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it.each([false, true])(
    "streams the upload body and pack response without buffering (gzip=%s)",
    async (compressed) => {
      let pushResponseChunk: ((value: Uint8Array) => void) | undefined;
      const upstream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("first"));
          pushResponseChunk = (value) => {
            controller.enqueue(value);
            controller.close();
          };
        },
      });
      const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        expect(init?.body).toBeInstanceOf(ReadableStream);
        expect(init?.method).toBe("POST");
        expect(init?.headers).toBeInstanceOf(Headers);
        expect(new Headers(init?.headers).get("content-encoding")).toBe(compressed ? "gzip" : null);
        const received = Buffer.from(await new Response(init?.body).arrayBuffer());
        expect((compressed ? gunzipSync(received) : received).toString()).toBe("0000");
        return new Response(upstream, { headers: { "content-type": "application/x-git-upload-pack-result" } });
      }) as unknown as typeof fetch;
      const { app } = createApp(fetcher);
      const response = await app.request("/v1/openmeld/git/amplifthq/openmeld/git-upload-pack", {
        method: "POST",
        headers: {
          ...requesterHeaders,
          "content-type": "application/x-git-upload-pack-request",
          ...(compressed ? { "content-encoding": "gzip" } : {}),
        },
        body: compressed ? gzipSync("0000") : "0000",
      });
      expect(response.status).toBe(200);
      const reader = response.body?.getReader();
      expect(reader).toBeDefined();
      expect(new TextDecoder().decode((await reader!.read()).value)).toBe("first");
      pushResponseChunk?.(new TextEncoder().encode("second"));
      expect(new TextDecoder().decode((await reader!.read()).value)).toBe("second");
    },
  );

  it("rejects receive-pack, malformed selectors, redirects and unavailable member credentials", async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: "https://other.example/" } }),
    );
    const getCredential = vi.fn<ConnectionService["getCredential"]>(async () => memberCredential);
    const { app } = createApp(fetchMock as unknown as typeof fetch, getCredential);
    const scopedHeaders = { ...requesterHeaders, "x-openmeld-repository": "a/b" };
    expect(
      (await app.request("/v1/openmeld/git/a/b/git-receive-pack", { method: "POST", headers: requesterHeaders }))
        .status,
    ).toBe(404);
    expect(
      (await app.request("/v1/openmeld/git/a/b/info/refs?service=git-upload-pack", { headers: requesterHeaders }))
        .status,
    ).toBe(400);
    expect(
      (await app.request("/v1/openmeld/git/a/b/info/refs?service=git-receive-pack", { headers: scopedHeaders })).status,
    ).toBe(400);
    expect(
      (
        await app.request("/v1/openmeld/git/a/b/info/refs?service=git-upload-pack&extra=1", {
          headers: scopedHeaders,
        })
      ).status,
    ).toBe(400);
    expect(
      (await app.request("/v1/openmeld/git/a/b/info/refs?service=git-upload-pack", { headers: scopedHeaders })).status,
    ).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    getCredential.mockRejectedValueOnce(new Error("disconnected"));
    expect(
      (await app.request("/v1/openmeld/git/a/b/info/refs?service=git-upload-pack", { headers: scopedHeaders })).status,
    ).toBe(503);
  });

  it("honors a GitHub proxy block before touching the connection", async () => {
    const fetcher = vi.fn(async () => new Response("unexpected")) as unknown as typeof fetch;
    const getCredential = vi.fn<ConnectionService["getCredential"]>(async () => memberCredential);
    const policy = new ActionPolicyService({ blockedProxies: ["github"] }).createSnapshot();
    const { app } = createApp(fetcher, getCredential, policy);
    const response = await app.request("/v1/openmeld/git/amplifthq/openmeld/info/refs?service=git-upload-pack", {
      headers: requesterHeaders,
    });
    expect(response.status).toBe(403);
    expect(getCredential).not.toHaveBeenCalled();
  });

  it("returns a controlled failure when runtime policy cannot be loaded", async () => {
    const fetcher = vi.fn(async () => new Response("unexpected")) as unknown as typeof fetch;
    const getCredential = vi.fn<ConnectionService["getCredential"]>(async () => memberCredential);
    const policy = new ActionPolicyService().createSnapshot();
    const getPolicy = vi.fn(() => Promise.reject(new Error("policy store unavailable")));
    const { app } = createApp(fetcher, getCredential, policy, getPolicy);
    const response = await app.request("/v1/openmeld/git/amplifthq/openmeld/info/refs?service=git-upload-pack", {
      headers: requesterHeaders,
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "git_policy_unavailable" } });
    expect(getCredential).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
