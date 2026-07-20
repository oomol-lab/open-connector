import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "./i18n";
import {
  App,
  loadRuntimeData,
  nextAuthLoadState,
  nextLogoutState,
  subscribeToOAuthCompletions,
  UnlockView,
} from "./ui";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("does not render the console shell before the initial auth check finishes", () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(App)),
      ),
    );

    expect(markup).not.toContain("app-shell");
    expect(markup).toContain("Loading runtime data");
  });

  it("does not reserve empty error space before loading starts", () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(UnlockView, {
          loading: false,
          message: null,
          theme: "light",
          onThemeChange: () => {},
          onUnlock: () => {},
        }),
      ),
    );

    expect(markup).not.toContain("unlock-status");
    expect(markup).toContain("unlock-button-spinner idle");
  });

  it("marks the unlock button loading state separately from disabled state", () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(UnlockView, {
          loading: true,
          message: null,
          theme: "light",
          onThemeChange: () => {},
          onUnlock: () => {},
        }),
      ),
    );

    expect(markup).toContain('data-loading="true"');
    expect(markup).toContain('aria-busy="true"');
  });
});

describe("nextLogoutState", () => {
  it("keeps the current auth state when logout fails", () => {
    const state = {
      authSession: { adminAuthConfigured: true, authenticated: true },
    };

    expect(nextLogoutState(state, false)).toBe(state);
  });

  it("clears the current auth state when logout succeeds", () => {
    expect(
      nextLogoutState(
        {
          authSession: { adminAuthConfigured: true, authenticated: true },
        },
        true,
      ),
    ).toEqual({
      authSession: { adminAuthConfigured: true, authenticated: false },
    });
  });
});

describe("nextAuthLoadState", () => {
  it("clears the pending unlock token after the session is authenticated", () => {
    expect(
      nextAuthLoadState(
        {
          pendingUnlockToken: "local-token",
          authSession: { adminAuthConfigured: true, authenticated: false },
          locked: true,
        },
        { adminAuthConfigured: true, authenticated: true },
      ),
    ).toEqual({
      pendingUnlockToken: "",
      authSession: { adminAuthConfigured: true, authenticated: true },
      locked: false,
    });
  });

  it("keeps the console locked while an unlock token is rejected", () => {
    expect(
      nextAuthLoadState(
        {
          pendingUnlockToken: "wrong-token",
          authSession: { adminAuthConfigured: true, authenticated: false },
          locked: true,
        },
        { adminAuthConfigured: true, authenticated: false },
      ),
    ).toEqual({
      pendingUnlockToken: "wrong-token",
      authSession: { adminAuthConfigured: true, authenticated: false },
      locked: true,
    });
  });
});

describe("subscribeToOAuthCompletions", () => {
  it("refreshes when the OAuth callback broadcasts completion", () => {
    const addEventListener = vi.fn();
    class FakeBroadcastChannel {
      static instance: FakeBroadcastChannel | undefined;
      private listener: ((event: MessageEvent) => void) | undefined;
      closed = false;

      constructor(readonly name: string) {
        FakeBroadcastChannel.instance = this;
      }

      addEventListener(type: string, listener: (event: MessageEvent) => void): void {
        if (type === "message") {
          this.listener = listener;
        }
      }

      close(): void {
        this.closed = true;
      }

      emit(data: unknown): void {
        this.listener?.({ data } as MessageEvent);
      }
    }
    vi.stubGlobal("addEventListener", addEventListener);
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const refresh = vi.fn();

    const unsubscribe = subscribeToOAuthCompletions(refresh);
    FakeBroadcastChannel.instance?.emit({ type: "oauth.completed", service: "gmail" });

    expect(FakeBroadcastChannel.instance?.name).toBe("oomol-connect-oauth");
    expect(addEventListener).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledWith({ type: "oauth.completed", service: "gmail" });
    unsubscribe();
    expect(FakeBroadcastChannel.instance?.closed).toBe(true);
  });
});

describe("loadRuntimeData", () => {
  it("uses the unlock token only when reading the auth session", async () => {
    const calls: Array<{ path: string; headers: Headers }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ path: String(path), headers: new Headers(init?.headers) });
        if (path === "/api/auth/session") {
          return Response.json({ adminAuthConfigured: true, authenticated: true });
        }
        if (path === "/api/runs") {
          return Response.json({ items: [], nextCursor: null });
        }
        if (path === "/api/runtime-policy") {
          const rules = { allowedActions: [], blockedActions: [], allowedProxies: [], blockedProxies: [] };
          return Response.json({ deployment: rules, runtime: rules });
        }
        return Response.json([]);
      }),
    );

    await loadRuntimeData("local-token");

    expect(calls.map((call) => call.path)).toEqual([
      "/api/auth/session",
      "/api/providers",
      "/api/connections",
      "/api/oauth/configs",
      "/api/runtime-tokens",
      "/api/runtime-policy",
      "/api/runs",
    ]);
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer local-token");
    for (const call of calls.slice(1)) {
      expect(call.headers.get("authorization")).toBeNull();
    }
  });
});
