import type { ProviderHttpAttempt, ProviderHttpPermit } from "./provider-http-dispatch.ts";

import { once } from "node:events";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lacunaActionHandlers, skipRetryDelay } from "../providers/lacuna/runtime.ts";
import {
  createProviderFetch,
  providerFetch,
  toProviderExecutionError,
  withProviderHttpDispatchResult,
} from "../providers/provider-runtime.ts";
import { createGuardedFetch } from "./guarded-fetch.ts";
import { dispatchProviderHttpAttempt, withProviderHttpDispatch } from "./provider-http-dispatch.ts";

afterEach(() => vi.unstubAllGlobals());

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const context = {
  operation: "action",
  service: "example",
  actionId: "example.read",
  connectionId: "connection-1",
  connectionName: "binding-1",
} as const;

describe("provider HTTP dispatch", () => {
  it("returns the exact response without reading or wrapping its body", async () => {
    const original = Response.json({ fixture: true });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(original);
    const onResult = vi.fn();
    const response = await withProviderHttpDispatch(
      context,
      () => createProviderFetch({ fetch: transport })("https://example.com"),
      { beforeAttempt: () => ({ allow: true, onResult }) },
    );
    expect(response).toBe(original);
    expect(response.bodyUsed).toBe(false);
    expect(onResult).toHaveBeenCalledExactlyOnceWith({ kind: "response", status: 200, retryAfter: undefined });
    expect(await response.json()).toEqual({ fixture: true });
  });

  it("delivers a native response body before pending feedback can consume its deadline", async () => {
    const server = createServer((_request, response) => response.end("completed provider result"));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const controller = new AbortController();
    const feedback = deferred<void>();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let completeFeedback: ReturnType<typeof setTimeout> | undefined;
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing test listener");
      const fetcher = createProviderFetch({
        fetch: async (_url, init) => fetch(`http://127.0.0.1:${address.port}`, init),
      });
      const response = await withProviderHttpDispatch(
        context,
        () => fetcher("https://example.com", { method: "POST", signal: controller.signal }),
        {
          beforeAttempt: () => ({
            allow: true,
            onResult: () => {
              deadline = setTimeout(() => controller.abort(), 500);
              completeFeedback = setTimeout(() => feedback.resolve(), 600);
              return feedback.promise;
            },
          }),
        },
      );
      expect(await response.text()).toBe("completed provider result");
    } finally {
      clearTimeout(deadline);
      clearTimeout(completeFeedback);
      feedback.resolve();
      controller.abort();
      server.close();
      server.closeAllConnections();
    }
  });

  it("accounts for a permit when admission resolution and cancellation share a microtask turn", async () => {
    const controller = new AbortController();
    const ready = deferred<void>();
    const gate = deferred<ProviderHttpPermit>();
    const transport = vi.fn(async () => new Response("ok"));
    const onResult = vi.fn();
    const target = { requestId: "queued", redirectHop: 0, method: "POST", origin: "https://example.com" };
    const pending = withProviderHttpDispatch(
      context,
      () => dispatchProviderHttpAttempt(target, controller.signal, transport, async () => {}),
      {
        beforeAttempt: () => {
          ready.resolve();
          return gate.promise;
        },
      },
    );
    await ready.promise;
    gate.resolve({ allow: true, onResult });
    queueMicrotask(() => controller.abort());
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(transport).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledExactlyOnceWith({ kind: "not_dispatched", reason: "cancelled" });
  });

  it.each(["dispatch", "revalidation"])("makes a %s failure terminal before its feedback settles", async (phase) => {
    const enteredFeedback = deferred<void>();
    const feedback = deferred<void>();
    const transport = vi.fn(async () => new Response("side effect completed"));
    const target = { requestId: "failed", redirectHop: 0, method: "POST", origin: "https://example.com" };
    const fail = (): never => {
      throw new Error("Commit or guard failure");
    };
    let admissions = 0;
    const pending = withProviderHttpDispatchResult(
      context,
      async () => {
        const first = dispatchProviderHttpAttempt(target, undefined, transport, async () => {
          if (phase === "revalidation") fail();
        }).catch(() => undefined);
        await enteredFeedback.promise;
        await dispatchProviderHttpAttempt(
          { ...target, requestId: "sibling" },
          undefined,
          transport,
          async () => {},
        ).catch(() => undefined);
        feedback.resolve();
        await first;
      },
      {
        beforeAttempt: () => {
          admissions++;
          return {
            allow: true,
            onDispatch: admissions === 1 && phase === "dispatch" ? fail : undefined,
            onResult: () => {
              enteredFeedback.resolve();
              return feedback.promise;
            },
          };
        },
      },
    );
    await expect(pending).rejects.toMatchObject({ status: 429, code: "rate_limited" });
    expect(admissions).toBe(1);
    expect(transport).not.toHaveBeenCalled();
  });

  it("does not wait for transport-error feedback or its failure observer", async () => {
    const original = new Error("Original transport failure");
    const feedback = deferred<void>();
    const observer = deferred<void>();
    const onFeedbackError = vi.fn(() => observer.promise);
    const pending = withProviderHttpDispatch(
      context,
      () =>
        createProviderFetch({
          fetch: async () => {
            throw original;
          },
        })("https://example.com"),
      {
        beforeAttempt: () => ({
          allow: true,
          onResult: async () => {
            await feedback.promise;
            throw new Error("Bookkeeping failure");
          },
        }),
        onFeedbackError,
      },
    );
    await expect(pending).rejects.toBe(original);
    expect(onFeedbackError).not.toHaveBeenCalled();
    feedback.resolve();
    await vi.waitFor(() => expect(onFeedbackError).toHaveBeenCalledOnce());
    observer.resolve();
  });

  it("returns cancellation before feedback for an admitted request has settled", async () => {
    const controller = new AbortController();
    const commit = deferred<void>();
    const enteredCommit = deferred<void>();
    const feedback = deferred<void>();
    const onResult = vi.fn(() => feedback.promise);
    const transport = vi.fn<typeof fetch>();
    const pending = withProviderHttpDispatch(
      context,
      () => createProviderFetch({ fetch: transport })("https://example.com", { signal: controller.signal }),
      {
        beforeAttempt: () => ({
          allow: true,
          onDispatch: () => {
            enteredCommit.resolve();
            return commit.promise;
          },
          onResult,
        }),
      },
    );
    await enteredCommit.promise;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(onResult).toHaveBeenCalledExactlyOnceWith({ kind: "not_dispatched", reason: "cancelled" });
    expect(transport).not.toHaveBeenCalled();
    feedback.resolve();
    commit.resolve();
  });

  it("retains sanitized denial when provider code returns a remapped result", async () => {
    const transport = vi.fn<typeof fetch>();
    const pending = withProviderHttpDispatchResult(
      context,
      async () => {
        try {
          await createProviderFetch({ fetch: transport })("https://example.com");
          return { ok: true };
        } catch {
          return { ok: false, error: { code: "credential_verification_failed", status: 400 } };
        }
      },
      { beforeAttempt: () => ({ allow: false, retryAfterSeconds: 28 }) },
    );
    await expect(pending).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      details: { retryAfterSeconds: 28 },
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("does not taint an explicit successful retry in an independent nested invocation", async () => {
    const response = new Response("ok");
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    const fetcher = createProviderFetch({ fetch: transport });
    let denied = false;
    const result = await withProviderHttpDispatchResult(
      context,
      async () => {
        await withProviderHttpDispatchResult(context, () => fetcher("https://example.com")).catch(() => undefined);
        return withProviderHttpDispatchResult(context, () => fetcher("https://example.com"));
      },
      {
        beforeAttempt: () => {
          if (denied) return { allow: true };
          denied = true;
          return { allow: false, retryAfterSeconds: 28 };
        },
      },
    );
    expect(result).toBe(response);
    expect(transport).toHaveBeenCalledOnce();
  });

  it("does not permit later side effects after a caught terminal denial in the same invocation", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("side effect completed"));
    const fetcher = createProviderFetch({ fetch: transport });
    const beforeAttempt = vi
      .fn()
      .mockReturnValueOnce({ allow: false, retryAfterSeconds: 28 })
      .mockReturnValue({ allow: true });
    const pending = withProviderHttpDispatchResult(
      context,
      async () => {
        await fetcher("https://example.com/first").catch(() => undefined);
        return fetcher("https://example.com/fallback", { method: "POST" }).catch(() => ({ ok: true }));
      },
      { beforeAttempt },
    );
    await expect(pending).rejects.toMatchObject({ status: 429, details: { retryAfterSeconds: 28 } });
    expect(beforeAttempt).toHaveBeenCalledOnce();
    expect(transport).not.toHaveBeenCalled();
  });

  it.each(["admission", "dispatch", "revalidation"])(
    "fences a concurrent sibling denied while another attempt waits for %s",
    async (phase) => {
      const waiting = deferred<void>();
      const gate = deferred<void>();
      const transport = vi.fn(async () => new Response("side effect completed"));
      const onResult = vi.fn();
      const onDispatch = vi.fn(async () => {
        if (phase === "dispatch") {
          waiting.resolve();
          await gate.promise;
        }
      });
      const target = { requestId: "waiting", redirectHop: 0, method: "POST", origin: "https://example.com" };
      const pending = withProviderHttpDispatchResult(
        context,
        async () => {
          const first = dispatchProviderHttpAttempt(target, undefined, transport, async () => {
            if (phase === "revalidation") {
              waiting.resolve();
              await gate.promise;
            }
          }).catch(() => undefined);
          await waiting.promise;
          await dispatchProviderHttpAttempt(
            { ...target, requestId: "denied" },
            undefined,
            transport,
            async () => {},
          ).catch(() => undefined);
          gate.resolve();
          await first;
          return { ok: true };
        },
        {
          beforeAttempt: async (attempt) => {
            if (attempt.requestId === "denied") return { allow: false, retryAfterSeconds: 28 };
            if (phase === "admission") {
              waiting.resolve();
              await gate.promise;
            }
            return { allow: true, onDispatch, onResult };
          },
        },
      );
      await expect(pending).rejects.toMatchObject({ status: 429, details: { retryAfterSeconds: 28 } });
      expect(transport).not.toHaveBeenCalled();
      expect(onDispatch).toHaveBeenCalledTimes(phase === "admission" ? 0 : 1);
      expect(onResult).toHaveBeenCalledExactlyOnceWith({ kind: "not_dispatched", reason: "dispatch_failed" });
    },
  );

  it("preserves unset behavior and passes the original transport response through", async () => {
    const response = new Response("ok");
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    const fetcher = createProviderFetch({ fetch: transport });
    expect(await fetcher("https://example.com")).toBe(response);
    expect(transport).toHaveBeenCalledOnce();
  });

  it("awaits admission before sending and reports the response without consuming it", async () => {
    const gate = deferred<ProviderHttpPermit>();
    const response = new Response("private response", {
      status: 429,
      headers: { "Retry-After": "37", "Set-Cookie": "secret" },
    });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    const onDispatch = vi.fn();
    const onResult = vi.fn();
    const beforeAttempt = vi.fn(() => gate.promise);
    const pending = withProviderHttpDispatch(
      context,
      () => createProviderFetch({ fetch: transport })("https://example.com"),
      { beforeAttempt },
    );
    await vi.waitFor(() => expect(beforeAttempt).toHaveBeenCalledOnce());
    expect(transport).not.toHaveBeenCalled();
    gate.resolve({ allow: true, onDispatch, onResult });
    expect(await pending).toBe(response);
    expect(onDispatch).toHaveBeenCalledOnce();
    expect(onResult).toHaveBeenCalledExactlyOnceWith({ kind: "response", status: 429, retryAfter: "37" });
    expect(response.bodyUsed).toBe(false);
  });

  it("maps denial to rate_limited with a Retry-After hint and sends no request", async () => {
    const transport = vi.fn<typeof fetch>();
    const failure = await withProviderHttpDispatch(
      context,
      () => createProviderFetch({ fetch: transport })("https://example.com"),
      {
        beforeAttempt: () => ({ allow: false, retryAfterSeconds: 91 }),
      },
    ).catch((error: unknown) => toProviderExecutionError(error, "failed"));
    expect(failure).toMatchObject({
      ok: false,
      error: { code: "rate_limited", details: { status: 429, details: { retryAfterSeconds: 91 } } },
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it.each(["bind", "admission", "dispatch"])("fails closed when the %s hook throws", async (phase) => {
    const transport = vi.fn<typeof fetch>();
    const onResult = vi.fn();
    const fail = (): never => {
      throw new Error("credential-secret");
    };
    const pending = withProviderHttpDispatch(
      context,
      () => createProviderFetch({ fetch: transport })("https://example.com"),
      {
        bindAuthority: phase === "bind" ? fail : undefined,
        beforeAttempt:
          phase === "admission"
            ? fail
            : () => ({ allow: true, onDispatch: phase === "dispatch" ? fail : undefined, onResult }),
      },
    );
    await expect(pending).rejects.toMatchObject({ status: 429, code: "rate_limited" });
    await expect(pending).rejects.not.toThrow("credential-secret");
    expect(transport).not.toHaveBeenCalled();
    if (phase === "dispatch")
      expect(onResult).toHaveBeenCalledExactlyOnceWith({ kind: "not_dispatched", reason: "dispatch_failed" });
  });

  it("admits every redirect hop with its actual origin and rewritten method", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 303, headers: { location: "https://other.example/new?token=secret" } }),
      )
      .mockResolvedValueOnce(new Response("ok"));
    const attempts: ProviderHttpAttempt[] = [];
    const onResult = vi.fn();
    await withProviderHttpDispatch(
      context,
      () =>
        createProviderFetch({ fetch: transport })("https://example.com/private", { method: "POST", body: "secret" }),
      {
        beforeAttempt: (attempt) => {
          attempts.push(attempt);
          return { allow: true, onResult };
        },
      },
    );
    expect(attempts.map(({ origin, method, redirectHop }) => ({ origin, method, redirectHop }))).toEqual([
      { origin: "https://example.com", method: "POST", redirectHop: 0 },
      { origin: "https://other.example", method: "GET", redirectHop: 1 },
    ]);
    expect(attempts[0]?.requestId).toBe(attempts[1]?.requestId);
    expect(attempts[0]?.attemptId).not.toBe(attempts[1]?.attemptId);
    expect(onResult).toHaveBeenCalledTimes(2);
  });

  it("can deny a redirect hop after the first response", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://other.example" } }));
    await expect(
      withProviderHttpDispatch(context, () => createProviderFetch({ fetch: transport })("https://example.com"), {
        beforeAttempt: (attempt) => ({ allow: attempt.redirectHop === 0 }),
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(transport).toHaveBeenCalledOnce();
  });

  it("snapshots a manual request target and method before delayed admission", async () => {
    const url = new URL("https://example.com/private");
    const init: RequestInit = { method: "GET", redirect: "manual" };
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    await withProviderHttpDispatch(context, () => createProviderFetch({ fetch: transport })(url, init), {
      beforeAttempt: async () => {
        url.href = "http://127.0.0.1/private";
        init.method = "DELETE";
        return { allow: true };
      },
    });
    expect(transport).toHaveBeenCalledExactlyOnceWith(
      new URL("https://example.com/private"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("admits every real provider-internal retry", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ results: [] }));
    const beforeAttempt = vi.fn((_attempt: ProviderHttpAttempt) => ({ allow: true as const }));
    await withProviderHttpDispatch(
      { ...context, service: "lacuna", actionId: "lacuna.search" },
      () =>
        lacunaActionHandlers.search(
          { query: "test" },
          { fetcher: createProviderFetch({ fetch: transport }), sleep: skipRetryDelay },
        ),
      { beforeAttempt },
    );
    expect(beforeAttempt).toHaveBeenCalledTimes(3);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(new Set(beforeAttempt.mock.calls.map(([attempt]) => attempt.requestId)).size).toBe(3);
  });

  it("retains scope through module-level and rewrapped fetchers", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", transport);
    const rewrapped = createProviderFetch({ fetch: providerFetch, skipDnsValidation: true });
    const customPolicy = createGuardedFetch({ fetch: providerFetch, skipDnsValidation: true });
    const beforeAttempt = vi.fn((_attempt: ProviderHttpAttempt) => ({ allow: true as const }));
    await withProviderHttpDispatch(
      context,
      async () => {
        await providerFetch("https://example.com");
        await rewrapped("https://example.com");
        await customPolicy("https://example.com");
      },
      { beforeAttempt },
    );
    expect(beforeAttempt).toHaveBeenCalledTimes(3);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(beforeAttempt.mock.calls.map(([attempt]) => attempt.context.connectionName)).toEqual([
      "binding-1",
      "binding-1",
      "binding-1",
    ]);
  });

  it("rejects blocked initial and redirect URLs before admission", async () => {
    const beforeAttempt = vi.fn(() => ({ allow: true as const }));
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }));
    await withProviderHttpDispatch(
      context,
      async () => {
        await expect(createProviderFetch({ fetch: transport })("http://127.0.0.1")).rejects.toThrow();
        expect(beforeAttempt).not.toHaveBeenCalled();
        await expect(createProviderFetch({ fetch: transport })("https://example.com")).rejects.toThrow();
      },
      { beforeAttempt },
    );
    expect(beforeAttempt).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledOnce();
  });

  it("revalidates DNS after delayed admission", async () => {
    let address = "93.184.216.34";
    const transport = vi.fn<typeof fetch>();
    const onResult = vi.fn();
    const fetcher = createGuardedFetch({
      fetch: transport,
      lookup: async () => [{ address, family: 4 }],
      dispatchAttempt: async (...args) => {
        const { dispatchProviderHttpAttempt } = await import("./provider-http-dispatch.ts");
        return dispatchProviderHttpAttempt(...args);
      },
    });
    await expect(
      withProviderHttpDispatch(context, () => fetcher("https://example.com"), {
        beforeAttempt: () => {
          address = "127.0.0.1";
          return { allow: true, onResult };
        },
      }),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledExactlyOnceWith({ kind: "not_dispatched", reason: "dispatch_failed" });
  });

  it("cancels a queued attempt promptly and accounts for a late permit", async () => {
    const controller = new AbortController();
    const gate = deferred<ProviderHttpPermit>();
    const transport = vi.fn<typeof fetch>();
    const onResult = vi.fn();
    const beforeAttempt = vi.fn(() => gate.promise);
    const pending = withProviderHttpDispatch(
      context,
      () => createProviderFetch({ fetch: transport })("https://example.com", { signal: controller.signal }),
      { beforeAttempt },
    );
    await vi.waitFor(() => expect(beforeAttempt).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    gate.resolve({ allow: true, onResult });
    await vi.waitFor(() =>
      expect(onResult).toHaveBeenCalledExactlyOnceWith({ kind: "not_dispatched", reason: "cancelled" }),
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it("reports an uncertain transport failure without leaking its raw error", async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret-url-and-headers"));
    const onResult = vi.fn();
    await expect(
      withProviderHttpDispatch(context, () => createProviderFetch({ fetch: transport })("https://example.com"), {
        beforeAttempt: () => ({ allow: true, onResult }),
      }),
    ).rejects.toThrow();
    expect(onResult).toHaveBeenCalledExactlyOnceWith({ kind: "transport_error" });
  });

  it("preserves a successful response when feedback fails", async () => {
    const response = new Response("ok");
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    const onFeedbackError = vi.fn(() => {
      throw new Error("observer failed");
    });
    expect(
      await withProviderHttpDispatch(context, () => createProviderFetch({ fetch: transport })("https://example.com"), {
        beforeAttempt: () => ({
          allow: true,
          onResult: () => {
            throw new Error("durability failed");
          },
        }),
        onFeedbackError,
      }),
    ).toBe(response);
    expect(onFeedbackError).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledOnce();
  });

  it("freezes allowlisted context and authority without exposing credential-bearing request data", async () => {
    const attempts: ProviderHttpAttempt[] = [];
    const inputContext = { ...context, connectionName: "binding-1", secret: "context-secret" };
    const authority = { workspaceId: "workspace-1", connectionLineageId: "lineage-1", token: "authority-secret" };
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    await withProviderHttpDispatch(
      inputContext,
      () =>
        createProviderFetch({ fetch: transport })(
          "https://example.com/private-secret?token=query-secret#fragment-secret",
          { headers: { authorization: "header-secret" }, method: "POST", body: "body-secret" },
        ),
      {
        bindAuthority: () => authority,
        beforeAttempt: (attempt) => {
          attempts.push(attempt);
          return { allow: true };
        },
      },
    );
    const attempt = attempts[0]!;
    expect(JSON.stringify(attempt)).not.toContain("secret");
    expect(Object.isFrozen(attempt)).toBe(true);
    expect(Object.isFrozen(attempt.context)).toBe(true);
    expect(Object.isFrozen(attempt.authority)).toBe(true);
    inputContext.connectionName = "replaced-binding";
    expect(attempt.context.connectionName).toBe("binding-1");
    expect(Reflect.set(attempt.context, "connectionName", "forged-binding")).toBe(false);
    authority.workspaceId = "changed";
    expect(attempt.authority.workspaceId).toBe("workspace-1");
  });

  it("isolates concurrent work and restores its parent scope", async () => {
    const gate = deferred<void>();
    const attempts: ProviderHttpAttempt[] = [];
    const fetcher = createProviderFetch({
      fetch: vi.fn<typeof fetch>().mockImplementation(async () => new Response("ok")),
    });
    const options = {
      beforeAttempt: (attempt: ProviderHttpAttempt) => {
        attempts.push(attempt);
        return { allow: true as const };
      },
    };
    await withProviderHttpDispatch(
      context,
      async () => {
        await Promise.all([
          withProviderHttpDispatch({ ...context, connectionId: "first" }, async () => {
            await gate.promise;
            await fetcher("https://example.com");
          }),
          withProviderHttpDispatch({ ...context, connectionId: "second" }, async () => {
            await fetcher("https://example.com");
            gate.resolve();
          }),
        ]);
        await fetcher("https://example.com");
      },
      options,
    );
    expect(attempts.map((attempt) => attempt.context.connectionId)).toEqual(["second", "first", "connection-1"]);
    await fetcher("https://example.com");
    expect(attempts).toHaveLength(3);
  });
});
