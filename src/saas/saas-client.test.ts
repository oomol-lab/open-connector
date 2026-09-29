import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../core/guarded-fetch.ts";
import { normalizeSaasBaseUrl, SaasClient } from "./saas-client.ts";

afterEach(() => setDefaultGuardedFetchDnsLookup(null));

const project = { id: "managed", projectId: "project", baseUrl: "https://saas.example", apiKey: "project-secret" };
const selector = { providerConfigId: "config", externalUserId: "user", connectedAccountId: "account" };
const account = {
  ...selector,
  projectId: "project",
  service: "example",
  alias: "alias",
  status: "active",
  providerAccountId: "provider-user",
  accountLabel: "User",
  scopes: ["read"],
};
const request = {
  id: "request",
  status: "connected",
  projectId: "project",
  providerConfigId: "config",
  externalUserId: "user",
  service: "example",
  alias: "alias",
  authorizationUrl: "https://saas.example/v1/saas/connection-requests/request/authorize",
  connectedAccountId: "account",
  errorCode: null,
  errorMessage: null,
  expiresAt: "2026-09-29T00:00:00.000Z",
  createdAt: 1,
  updatedAt: 2,
};
const envelope = (data: unknown) => Response.json({ success: true, message: "OK", data });

describe("SaasClient", () => {
  it("uses the project bearer key and exact account selectors without requesting a profile", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(envelope(account))
      .mockResolvedValueOnce(envelope({ connectedAccountId: "account", deleted: true }));
    const client = new SaasClient(fetcher);
    expect(await client.getAccount(project, selector, "example")).toEqual(account);
    await client.deleteAccount(project, selector);
    expect(String(fetcher.mock.calls[0][0])).toBe("https://saas.example/v1/saas/connected-accounts/account");
    const [url, init] = fetcher.mock.calls[1];
    expect(String(url)).toBe(
      "https://saas.example/v1/saas/connected-accounts/account?providerConfigId=config&userId=user",
    );
    expect(init?.method).toBe("DELETE");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer project-secret");
  });

  it.each(["accessToken", "credential", "oauthClientConfig", "providerSecret", "metadata"])(
    "rejects a summary containing %s",
    async (field) => {
      const client = new SaasClient(async () => envelope({ ...account, [field]: "sensitive-value" }));
      await expect(client.getAccount(project, selector, "example")).rejects.toMatchObject({
        code: "oauth_source_protocol_error",
      });
    },
  );

  it.each(["projectId", "providerConfigId", "externalUserId", "connectedAccountId", "service"])(
    "checks account %s",
    async (field) => {
      const client = new SaasClient(async () => envelope({ ...account, [field]: "other" }));
      await expect(client.getAccount(project, selector, "example")).rejects.toMatchObject({
        code: "oauth_source_mismatch",
      });
    },
  );

  it("parses retained results and rejects connected results without an account", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(envelope(request))
      .mockResolvedValueOnce(envelope({ ...request, connectedAccountId: null }));
    const client = new SaasClient(fetcher);
    expect(await client.getRequest(project, "request")).toEqual(request);
    await expect(client.getRequest(project, "request")).rejects.toMatchObject({ code: "oauth_source_protocol_error" });
  });

  it("creates an ordinary link with explicit selectors and checks its browser URL", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(envelope(request))
      .mockResolvedValueOnce(envelope({ ...request, authorizationUrl: "https://other.example/authorize" }));
    const client = new SaasClient(fetcher);
    const input = {
      providerConfigId: "config",
      externalUserId: "user",
      alias: "alias",
      returnUri: "https://connect.example/oauth/saas/complete?request=local",
    };
    await client.createLink(project, input);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      providerConfigId: "config",
      userId: "user",
      alias: "alias",
      returnUri: input.returnUri,
    });
    await expect(client.createLink(project, input)).rejects.toMatchObject({ code: "oauth_source_protocol_error" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])("maps plain %s responses without exposing upstream messages", async (status) => {
    const client = new SaasClient(async () => new Response("project-secret diagnostic", { status }));
    await expect(client.discover(project)).rejects.toMatchObject({ code: "oauth_source_unauthorized", status: 503 });
    await expect(client.discover(project)).rejects.not.toThrow("project-secret");
  });

  it("preserves a valid Retry-After and never retries", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("limited", { status: 429, headers: { "retry-after": "7" } }));
    await expect(new SaasClient(fetcher).discover(project)).rejects.toMatchObject({
      code: "oauth_source_rate_limited",
      retryAfter: "7",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects redirects, malformed envelopes, and oversized error bodies", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://other.example" } }))
      .mockResolvedValueOnce(Response.json({ success: false, data: {} }))
      .mockResolvedValueOnce(new Response("x".repeat(4 * 1024 * 1024 + 1), { status: 401 }));
    const client = new SaasClient(fetcher);
    await expect(client.discover(project)).rejects.toMatchObject({ code: "oauth_source_unavailable" });
    await expect(client.discover(project)).rejects.toMatchObject({ code: "oauth_source_protocol_error" });
    await expect(client.discover(project)).rejects.toMatchObject({ code: "oauth_source_unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("propagates cancellation without turning it into a protocol failure", async () => {
    const abort = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      abort.abort();
      throw new Error("private diagnostic");
    });
    await expect(new SaasClient(fetcher).discover(project, abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    "http://saas.example",
    "https://127.0.0.1",
    "https://user:secret@saas.example",
    "https://saas.example/path",
    "https://saas.example?key=secret",
  ])("rejects unsafe base URL %s", (value) => {
    expect(() => normalizeSaasBaseUrl(value)).toThrow();
  });
});

describe("SaaS execution protocol", () => {
  it.each([
    ["invalid_input", 400],
    ["scope_missing", 403],
    ["credential_expired", 409],
    ["connected_account_not_found", 404],
    ["insufficient_credit", 402],
    ["rate_limited", 429],
  ])("preserves %s without exposing remote error payloads", async (code, status) => {
    const client = new SaasClient(async () =>
      Response.json(
        {
          success: false,
          errorCode: code,
          message: "secret credential and request",
          data: { accessToken: "secret" },
          meta: { executionId: "remote-error" },
        },
        { status, headers: { "retry-after": "8" } },
      ),
    );
    await expect(client.executeAction(project, selector, "example.echo", {})).rejects.toMatchObject({
      code,
      status,
      remoteExecutionId: "remote-error",
      retryAfter: "8",
    });
    try {
      await client.executeAction(project, selector, "example.echo", {});
    } catch (error) {
      expect(String(error)).not.toContain("secret");
    }
  });

  it("distinguishes rejected project keys from provider credential failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockResolvedValueOnce(
        Response.json(
          { success: false, errorCode: "credential_expired", message: "secret", meta: {} },
          { status: 401 },
        ),
      );
    const client = new SaasClient(fetcher);
    await expect(client.executeAction(project, selector, "example.echo", {})).rejects.toMatchObject({
      code: "oauth_source_unauthorized",
      status: 503,
    });
    await expect(client.executeAction(project, selector, "example.echo", {})).rejects.toMatchObject({
      code: "credential_expired",
      status: 409,
    });
  });

  it.each([
    { executionId: "remote", actionId: "other.echo", output: {} },
    { executionId: "remote", actionId: "example.echo" },
    { actionId: "example.echo", output: {} },
    { executionId: "Bearer secret", actionId: "example.echo", output: {} },
  ])("rejects malformed or mismatched action results", async (data) => {
    const client = new SaasClient(async () => envelope(data));
    await expect(client.executeAction(project, selector, "example.echo", {})).rejects.toMatchObject({
      code: "oauth_source_protocol_error",
    });
  });

  it.each([
    "image/png",
    "application/octet-stream",
    "text/plain; charset=iso-8859-1",
    'text/plain; Charset = "iso-8859-1"',
  ])("rejects unsupported proxy response content type %s", async (contentType) => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        success: true,
        data: { status: 200, headers: { "content-type": contentType }, data: "decoded" },
        meta: { executionId: "remote", service: "example" },
      }),
    );
    await expect(
      new SaasClient(fetcher).executeProxy(project, selector, "example", { endpoint: "/items", method: "GET" }),
    ).rejects.toMatchObject({ code: "oauth_source_protocol_error" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([204, 205])("preserves the upstream empty response representation for %s", async (status) => {
    const client = new SaasClient(async () =>
      Response.json({
        success: true,
        data: { status, headers: {}, data: null },
        meta: { executionId: "remote", service: "example" },
      }),
    );
    expect(await client.executeProxy(project, selector, "example", { endpoint: "/items", method: "GET" })).toEqual({
      executionId: "remote",
      response: { status, headers: {}, data: null },
    });
  });

  it("rejects proxy metadata mismatches and unexpected body encodings", async () => {
    for (const response of [
      { data: { status: 200, headers: {}, data: {} }, meta: { executionId: "remote", service: "other" } },
      {
        data: { status: 200, headers: {}, data: "AA==", bodyEncoding: "base64" },
        meta: { executionId: "remote", service: "example" },
      },
      { data: { status: 200, headers: {} }, meta: { executionId: "remote", service: "example" } },
    ]) {
      const client = new SaasClient(async () => Response.json({ success: true, ...response }));
      await expect(
        client.executeProxy(project, selector, "example", { endpoint: "/items", method: "GET" }),
      ).rejects.toMatchObject({ code: "oauth_source_protocol_error" });
    }
  });

  it("supports action output above the discovery limit and a 10 MiB proxy text payload after JSON escaping", async () => {
    const largeAction = "x".repeat(5 * 1024 * 1024);
    const escapedText = "\u0000".repeat(10 * 1024 * 1024);
    const client = new SaasClient(async (url) =>
      String(url).includes("/actions/")
        ? envelope({ executionId: "remote", actionId: "example.echo", output: largeAction })
        : Response.json({
            success: true,
            data: { status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, data: escapedText },
            meta: { executionId: "remote", service: "example" },
          }),
    );
    expect((await client.executeAction(project, selector, "example.echo", {})).output).toBe(largeAction);
    expect(
      (await client.executeProxy(project, selector, "example", { endpoint: "/items", method: "GET" })).response.data,
    ).toBe(escapedText);
  });

  it.each([200, 500])("bounds chunked execution responses including HTTP %s errors", async (status) => {
    let bytes = 0;
    const cancel = vi.fn();
    const client = new SaasClient(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              bytes += 1024 * 1024;
              controller.enqueue(new Uint8Array(1024 * 1024));
            },
            cancel,
          }),
          { status },
        ),
    );
    await expect(client.executeAction(project, selector, "example.echo", {})).rejects.toMatchObject({ status: 502 });
    expect(bytes).toBeLessThanOrEqual(66 * 1024 * 1024);
    expect(cancel).toHaveBeenCalled();
  });

  it("uses a five-minute execution budget through body consumption and does not retry on timeout", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({ start() {} })));
    const request = new SaasClient(fetcher).executeAction(project, selector, "example.echo", {});
    const assertion = expect(request).rejects.toMatchObject({ status: 504 });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort(new DOMException("Timed out", "TimeoutError"));
    await assertion;
    expect(timeout).toHaveBeenCalledWith(300_000);
    expect(fetcher).toHaveBeenCalledOnce();
    timeout.mockRestore();
  });
});

it("explains Fake-IP rejection before sending the project key", async () => {
  setDefaultGuardedFetchDnsLookup(async () => [{ address: "198.18.0.81", family: 4 }]);
  const fetcher = vi.fn<typeof fetch>();
  await expect(new SaasClient(fetcher).discover(project)).rejects.toThrow("Check proxy Fake-IP and DNS settings");
  expect(fetcher).not.toHaveBeenCalled();
});

it("distinguishes DNS resolution failures from blocked addresses", async () => {
  setDefaultGuardedFetchDnsLookup(async () => {
    throw new Error("private DNS diagnostic");
  });
  const fetcher = vi.fn<typeof fetch>();
  await expect(new SaasClient(fetcher).discover(project)).rejects.toThrow("could not resolve the SaaS hostname");
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  {
    response: () => new Response(null, { status: 302, headers: { location: "https://other.example" } }),
    message: "HTTP redirect",
  },
  { response: () => new Response("<html>secret login</html>"), message: "not valid UTF-8 JSON" },
  { response: () => Response.json({ success: true, data: {} }), message: "expected API contract" },
  { response: () => new Response("secret diagnostic", { status: 503 }), message: "HTTP 503" },
])("explains upstream failures: $message", async ({ response, message }) => {
  await expect(new SaasClient(async () => response()).discover(project)).rejects.toThrow(message);
});
