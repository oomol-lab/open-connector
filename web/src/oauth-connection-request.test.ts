import { afterEach, expect, it, vi } from "vitest";
import { usesSaasOAuth, watchOAuthRequest } from "./oauth-connection-request";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("keeps reconnect sources independent of service defaults", () => {
  const config = {
    service: "example",
    configured: false,
    clientId: null,
    oauthSource: {
      mode: "saas" as const,
      managedProjectId: "project",
      projectId: "remote",
      providerConfigId: "config",
    },
  };
  expect(usesSaasOAuth(undefined, config)).toBe(true);
  expect(usesSaasOAuth({ service: "example", authType: "oauth2", metadata: {} }, config)).toBe(false);
  expect(
    usesSaasOAuth(
      {
        service: "example",
        authType: "oauth2",
        metadata: {},
        saas: { managedProjectId: "project", providerConfigId: "config" },
      },
      undefined,
    ),
  ).toBe(true);
});

it("synchronizes SaaS with protected POST and stops after completion", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ request: { status: "initiated" } }))
    .mockResolvedValueOnce(Response.json({ request: { status: "connected" } }));
  vi.stubGlobal("fetch", fetcher);
  const onUpdate = vi.fn();
  watchOAuthRequest({
    id: "request",
    remote: true,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    onUpdate,
    onError: vi.fn(),
  });
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/oauth/connection-requests/request/sync",
    expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      headers: { "X-OpenConnector-Request": "sync", "content-type": "application/json" },
    }),
  );
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(onUpdate).toHaveBeenLastCalledWith({ status: "connected" });
});

it("honors Retry-After and cancellation without replaying link creation", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ message: "Try later" }, { status: 429, headers: { "Retry-After": "12" } }))
    .mockResolvedValueOnce(Response.json({ request: { status: "initiated" } }));
  vi.stubGlobal("fetch", fetcher);
  const stop = watchOAuthRequest({
    id: "request",
    remote: true,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    onUpdate: vi.fn(),
    onError: vi.fn(),
  });
  await vi.advanceTimersByTimeAsync(13999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  stop();
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("reads local requests without synchronization and stops on terminal failures", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { status: "failed", errorMessage: "Denied" } }));
  vi.stubGlobal("fetch", fetcher);
  const onUpdate = vi.fn();
  watchOAuthRequest({
    id: "local",
    remote: false,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    onUpdate,
    onError: vi.fn(),
  });
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    "/v1/connection-requests/local",
    expect.objectContaining({ credentials: "same-origin" }),
  );
  expect(onUpdate).toHaveBeenCalledWith({ status: "failed", errorMessage: "Denied" });
});

it("ignores in-flight results after leaving the connection form", async () => {
  vi.useFakeTimers();
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  const onUpdate = vi.fn();
  const stop = watchOAuthRequest({
    id: "request",
    remote: true,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    onUpdate,
    onError: vi.fn(),
  });
  await vi.advanceTimersByTimeAsync(2000);
  stop();
  resolve(Response.json({ request: { status: "connected" } }));
  await vi.advanceTimersByTimeAsync(60000);
  expect(onUpdate).not.toHaveBeenCalled();
});

it("reports an expired cloud request once and stops polling", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValue(Response.json({ request: { status: "expired" } }));
  vi.stubGlobal("fetch", fetcher);
  const onUpdate = vi.fn();
  watchOAuthRequest({
    id: "expired",
    remote: true,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    onUpdate,
    onError: vi.fn(),
  });
  await vi.advanceTimersByTimeAsync(60000);
  expect(onUpdate).toHaveBeenCalledExactlyOnceWith({ status: "expired" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
