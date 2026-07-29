import type { GuardedFetchDnsLookup, ResolvedAddress } from "./guarded-fetch.ts";
import type { GuardedWebSocketFailure, WebSocketConstructor } from "./guarded-websocket.ts";

import { describe, expect, it, vi } from "vitest";
import { openGuardedWebSocket } from "./guarded-websocket.ts";

type Listener = (event: unknown) => void;

class FakeSocket {
  static opened: FakeSocket[] = [];

  readonly url: string;
  closed = false;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    FakeSocket.opened.push(this);
  }

  send(): void {}

  close(): void {
    this.closed = true;
  }

  addEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type);
    if (existing) {
      existing.push(listener);
      return;
    }
    this.listeners.set(type, [listener]);
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

/** Constructor that reports the socket back so the test can drive its events. */
function fakeConstructor(onCreate?: (socket: FakeSocket) => void): WebSocketConstructor {
  return function FakeWebSocket(url: string) {
    const socket = new FakeSocket(url);
    // Open on the next tick so the caller has attached its handshake listeners.
    globalThis.setTimeout(() => onCreate?.(socket), 0);
    return socket;
  } as unknown as WebSocketConstructor;
}

/** Constructor whose sockets open immediately after listeners are attached. */
function openingConstructor(): WebSocketConstructor {
  return fakeConstructor((socket) => socket.emit("open"));
}

function lookupTable(entries: Record<string, ResolvedAddress[]>): GuardedFetchDnsLookup {
  return async (hostname: string) => {
    const result = entries[hostname];
    if (!result) {
      throw new Error(`no lookup entry for ${hostname}`);
    }
    return result;
  };
}

/** Records which failure kind the guard reported, so tests assert on the kind and not only the message. */
interface FailureRecorder {
  createFailure: (kind: GuardedWebSocketFailure, message: string) => Error;
  kinds: GuardedWebSocketFailure[];
}

function failureKinds(): FailureRecorder {
  const kinds: GuardedWebSocketFailure[] = [];
  return {
    createFailure: (kind, message) => {
      kinds.push(kind);
      return new Error(message);
    },
    kinds,
  };
}

describe("openGuardedWebSocket URL guard", () => {
  it("rejects a literal loopback target before constructing a socket", async () => {
    FakeSocket.opened = [];
    await expect(
      openGuardedWebSocket("ws://127.0.0.1:8123/api/websocket", { webSocketConstructor: openingConstructor() }),
    ).rejects.toThrow(/private or reserved IP addresses/);
    expect(FakeSocket.opened).toHaveLength(0);
  });

  it("rejects a cloud metadata target", async () => {
    await expect(
      openGuardedWebSocket("ws://169.254.169.254/api/websocket", { webSocketConstructor: openingConstructor() }),
    ).rejects.toThrow(/private or reserved IP addresses/);
  });

  it("rejects a hostname that resolves into a private range", async () => {
    FakeSocket.opened = [];
    await expect(
      openGuardedWebSocket("ws://homeassistant.example.com/api/websocket", {
        webSocketConstructor: openingConstructor(),
        lookup: lookupTable({ "homeassistant.example.com": [{ address: "192.168.1.10", family: 4 }] }),
      }),
    ).rejects.toThrow(/must not resolve to private or reserved IP addresses/);
    expect(FakeSocket.opened).toHaveLength(0);
  });

  it("allows a private-resolving hostname when private network access is opted in", async () => {
    const socket = await openGuardedWebSocket("ws://homeassistant.example.com/api/websocket", {
      webSocketConstructor: openingConstructor(),
      allowPrivateNetwork: true,
      lookup: lookupTable({ "homeassistant.example.com": [{ address: "192.168.1.10", family: 4 }] }),
    });
    expect(socket).toBeInstanceOf(FakeSocket);
  });

  it("re-evaluates a function-valued private network flag on every call", async () => {
    let allowed = false;
    const options = {
      webSocketConstructor: openingConstructor(),
      allowPrivateNetwork: (): boolean => allowed,
      lookup: lookupTable({ "ha.example.com": [{ address: "10.0.0.5", family: 4 }] }),
    };
    await expect(openGuardedWebSocket("ws://ha.example.com/api/websocket", options)).rejects.toThrow(
      /must not resolve to private/,
    );
    allowed = true;
    await expect(openGuardedWebSocket("ws://ha.example.com/api/websocket", options)).resolves.toBeInstanceOf(
      FakeSocket,
    );
  });

  it("fails closed when the lookup cannot resolve the hostname", async () => {
    await expect(
      openGuardedWebSocket("wss://ha.example.com/api/websocket", {
        webSocketConstructor: openingConstructor(),
        lookup: lookupTable({}),
      }),
    ).rejects.toThrow(/could not be resolved for validation/);
  });

  it("skips resolved-address validation when skipDnsValidation is set", async () => {
    await expect(
      openGuardedWebSocket("wss://ha.example.com/api/websocket", {
        webSocketConstructor: openingConstructor(),
        skipDnsValidation: true,
        lookup: lookupTable({}),
      }),
    ).resolves.toBeInstanceOf(FakeSocket);
  });

  it("rejects a non-http scheme", async () => {
    await expect(
      openGuardedWebSocket("ftp://ha.example.com/api/websocket", { webSocketConstructor: openingConstructor() }),
    ).rejects.toThrow(/must use http or https/);
  });

  it("uses the caller's guard error factory and field name", async () => {
    class GuardError extends Error {}
    await expect(
      openGuardedWebSocket("ws://127.0.0.1/api/websocket", {
        webSocketConstructor: openingConstructor(),
        createError: (message) => new GuardError(message),
        fieldName: "Home Assistant base URL",
      }),
    ).rejects.toThrow(/^Home Assistant base URL/);
  });
});

describe("openGuardedWebSocket scheme mapping", () => {
  it("connects over wss when the validated URL is https", async () => {
    FakeSocket.opened = [];
    await openGuardedWebSocket("https://ha.example.com/api/websocket", {
      webSocketConstructor: openingConstructor(),
    });
    expect(FakeSocket.opened[0]?.url).toBe("wss://ha.example.com/api/websocket");
  });

  it("connects over ws when the validated URL is http", async () => {
    FakeSocket.opened = [];
    await openGuardedWebSocket("http://ha.example.com:8123/api/websocket", {
      webSocketConstructor: openingConstructor(),
    });
    expect(FakeSocket.opened[0]?.url).toBe("ws://ha.example.com:8123/api/websocket");
  });

  it("preserves a wss input and its query string", async () => {
    FakeSocket.opened = [];
    await openGuardedWebSocket("wss://ha.example.com/api/websocket?v=1", {
      webSocketConstructor: openingConstructor(),
    });
    expect(FakeSocket.opened[0]?.url).toBe("wss://ha.example.com/api/websocket?v=1");
  });

  it("normalizes the hostname before connecting", async () => {
    FakeSocket.opened = [];
    await openGuardedWebSocket("wss://HA.Example.COM./api/websocket", {
      webSocketConstructor: openingConstructor(),
    });
    expect(FakeSocket.opened[0]?.url).toBe("wss://ha.example.com/api/websocket");
  });
});

describe("openGuardedWebSocket failures", () => {
  it("reports an unsupported runtime when the global constructor is missing", async () => {
    const { createFailure, kinds } = failureKinds();
    vi.stubGlobal("WebSocket", undefined);
    try {
      await expect(openGuardedWebSocket("wss://ha.example.com/api/websocket", { createFailure })).rejects.toThrow(
        /WebSocket is unavailable in this runtime/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
    expect(kinds).toEqual(["unsupported"]);
  });

  it("falls back to the global constructor when none is injected", async () => {
    const created: string[] = [];
    vi.stubGlobal(
      "WebSocket",
      fakeConstructor((socket) => {
        created.push(socket.url);
        socket.emit("open");
      }),
    );
    try {
      await expect(openGuardedWebSocket("wss://ha.example.com/api/websocket")).resolves.toBeInstanceOf(FakeSocket);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(created).toEqual(["wss://ha.example.com/api/websocket"]);
  });

  it("reports a connect failure when the socket errors before opening", async () => {
    const { createFailure, kinds } = failureKinds();
    await expect(
      openGuardedWebSocket("wss://ha.example.com/api/websocket", {
        webSocketConstructor: fakeConstructor((socket) => socket.emit("error")),
        createFailure,
      }),
    ).rejects.toThrow(/WebSocket connection failed/);
    expect(kinds).toEqual(["connect"]);
  });

  it("reports a connect failure when the peer closes before opening", async () => {
    const { createFailure, kinds } = failureKinds();
    await expect(
      openGuardedWebSocket("wss://ha.example.com/api/websocket", {
        webSocketConstructor: fakeConstructor((socket) => socket.emit("close", { code: 1006 })),
        createFailure,
      }),
    ).rejects.toThrow(/closed before the connection opened/);
    expect(kinds).toEqual(["connect"]);
  });

  it("times out and closes a socket that never opens", async () => {
    const { createFailure, kinds } = failureKinds();
    FakeSocket.opened = [];
    await expect(
      openGuardedWebSocket("wss://ha.example.com/api/websocket", {
        webSocketConstructor: fakeConstructor(),
        connectTimeoutMs: 5,
        createFailure,
      }),
    ).rejects.toThrow(/timed out/);
    expect(kinds).toEqual(["timeout"]);
    expect(FakeSocket.opened[0]?.closed).toBe(true);
  });

  it("aborts a pending connection when the signal fires", async () => {
    const controller = new AbortController();
    const pending = openGuardedWebSocket("wss://ha.example.com/api/websocket", {
      webSocketConstructor: fakeConstructor(),
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow(/aborted/);
  });

  it("ignores a late close event after the socket opened", async () => {
    let opened: FakeSocket | undefined;
    const socket = await openGuardedWebSocket("wss://ha.example.com/api/websocket", {
      webSocketConstructor: fakeConstructor((created) => {
        opened = created;
        created.emit("open");
      }),
    });
    expect(socket).toBe(opened);
    // Post-handshake events belong to the caller; they must not reject retroactively.
    expect(() => opened?.emit("close", { code: 1000 })).not.toThrow();
  });
});
