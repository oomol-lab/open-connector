import type { GuardedFetchDnsLookup } from "./guarded-fetch.ts";

import { assertGuardedEgressUrl } from "./guarded-fetch.ts";

/** Payload delivered by a WebSocket `message` event. */
export interface WebSocketMessageEvent {
  data: unknown;
}

/** Detail delivered by a WebSocket `close` event. */
export interface WebSocketCloseEvent {
  code?: number;
  reason?: string;
}

/**
 * Structural view of a client WebSocket, covering only what provider egress
 * uses. Declared locally because `src` builds without the DOM lib, and because
 * the Node and workerd globals differ in details this layer does not depend on.
 */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: WebSocketMessageEvent) => void): void;
  addEventListener(type: "error", listener: (event: unknown) => void): void;
  addEventListener(type: "close", listener: (event: WebSocketCloseEvent) => void): void;
}

/** Constructor shape used to open a client WebSocket. */
export type WebSocketConstructor = new (url: string) => WebSocketLike;

/**
 * Why {@link openGuardedWebSocket} failed after the URL passed the egress guard.
 *
 * - `unsupported`: the runtime has no client WebSocket constructor.
 * - `connect`: the handshake failed or the peer closed before the socket opened.
 * - `timeout`: the connection did not open within the deadline, or was aborted.
 */
export type GuardedWebSocketFailure = "unsupported" | "connect" | "timeout";

export interface GuardedWebSocketOptions {
  /**
   * Allow RFC 1918, shared-address-space, and private targets while retaining
   * reserved/loopback/link-local/metadata guards. A function is re-evaluated on
   * every call so deployment flags configured after module load are honored.
   */
  allowPrivateNetwork?: boolean | (() => boolean);
  /** Error factory for egress guard violations. Defaults to TypeError. */
  createError?: (message: string) => Error;
  /** Error factory for runtime failures. Defaults to {@link GuardedWebSocketOptions.createError}. */
  createFailure?: (kind: GuardedWebSocketFailure, message: string) => Error;
  /**
   * DNS lookup override: `null` disables resolved-address validation for this
   * connection, `undefined` uses the module default (`node:dns` when available).
   */
  lookup?: GuardedFetchDnsLookup | null;
  /**
   * Skip the DNS resolved-address check (the URL literal guard still runs).
   * Only safe when the host is a hardcoded literal fully controlled by the code,
   * never when it comes from credential or user input.
   */
  skipDnsValidation?: boolean;
  /** Deadline for the opening handshake. Defaults to 15s. */
  connectTimeoutMs?: number;
  /** Abort the pending connection. */
  signal?: AbortSignal;
  /** Field name used in guard violation messages. Defaults to `"WebSocket URL"`. */
  fieldName?: string;
  /** Constructor override, for tests. Defaults to `globalThis.WebSocket`. */
  webSocketConstructor?: WebSocketConstructor;
}

const defaultConnectTimeoutMs = 15_000;

/**
 * Open a client WebSocket to a user- or credential-supplied host under the same
 * SSRF policy as guarded provider fetches.
 *
 * The target is validated with {@link assertGuardedEgressUrl} — literal
 * hostname/IP checks plus DNS resolved-address checks — before the socket is
 * constructed, so a name that resolves into loopback, link-local, cloud
 * metadata, or (unless opted in) private ranges is rejected without a
 * connection attempt. `ws://` and `wss://` inputs are validated as their
 * `http://` / `https://` equivalents; the socket then connects to the
 * normalized `ws` form of the validated URL.
 *
 * Two limits are inherent to the transport rather than to this wrapper, and
 * match what {@link createGuardedFetch} can offer:
 *
 * - The constructor re-resolves the hostname itself, so a low-TTL rebinding
 *   record can still move the connection after validation. Pinning a resolved
 *   address is not expressible over the WebSocket API.
 * - Redirects are not part of the WebSocket handshake, so there is no
 *   per-hop revalidation to perform.
 *
 * Resolves once the socket is open. The returned socket has no listeners
 * attached beyond the ones used for the handshake, and those are inert after
 * this promise settles: the caller owns `message`/`error`/`close` handling and
 * must close the socket when finished.
 */
export async function openGuardedWebSocket(url: string, options: GuardedWebSocketOptions = {}): Promise<WebSocketLike> {
  const createError = options.createError ?? ((message: string): Error => new TypeError(message));
  const createFailure =
    options.createFailure ?? ((_kind: GuardedWebSocketFailure, message: string): Error => createError(message));
  const allowPrivateNetwork =
    typeof options.allowPrivateNetwork === "function"
      ? options.allowPrivateNetwork()
      : options.allowPrivateNetwork === true;

  const validated = await assertGuardedEgressUrl(toHttpEquivalent(url), {
    fieldName: options.fieldName ?? "WebSocket URL",
    createError,
    allowPrivateNetwork,
    lookup: options.skipDnsValidation ? null : options.lookup,
  });

  const constructor = options.webSocketConstructor ?? globalWebSocketConstructor();
  if (!constructor) {
    throw createFailure("unsupported", "WebSocket is unavailable in this runtime");
  }

  const target = `${validated.protocol === "https:" ? "wss:" : "ws:"}//${validated.host}${validated.pathname}${validated.search}`;
  return openSocket(constructor, target, options, createFailure);
}

function openSocket(
  constructor: WebSocketConstructor,
  target: string,
  options: GuardedWebSocketOptions,
  createFailure: (kind: GuardedWebSocketFailure, message: string) => Error,
): Promise<WebSocketLike> {
  return new Promise<WebSocketLike>((resolve, reject) => {
    let socket: WebSocketLike;
    try {
      socket = new constructor(target);
    } catch (error) {
      reject(createFailure("connect", `WebSocket connection failed: ${describeError(error)}`));
      return;
    }

    let settled = false;
    const timer = globalThis.setTimeout(() => {
      fail(createFailure("timeout", "WebSocket connection timed out"));
    }, options.connectTimeoutMs ?? defaultConnectTimeoutMs);
    const onAbort = (): void => {
      fail(createFailure("timeout", "WebSocket connection was aborted"));
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    function cleanup(): void {
      globalThis.clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }

    function fail(error: Error): void {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      closeQuietly(socket);
      reject(error);
    }

    socket.addEventListener("open", () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(socket);
    });
    socket.addEventListener("error", () => {
      fail(createFailure("connect", "WebSocket connection failed"));
    });
    socket.addEventListener("close", () => {
      fail(createFailure("connect", "WebSocket closed before the connection opened"));
    });

    if (options.signal?.aborted) {
      onAbort();
    }
  });
}

/**
 * Map a `ws`/`wss` URL onto the `http`/`https` form the shared egress guard
 * validates. Anything else is passed through so the guard reports its own
 * scheme error rather than a rewritten one.
 */
function toHttpEquivalent(value: string): string {
  if (/^wss:\/\//i.test(value)) {
    return `https://${value.slice("wss://".length)}`;
  }
  if (/^ws:\/\//i.test(value)) {
    return `http://${value.slice("ws://".length)}`;
  }
  return value;
}

function globalWebSocketConstructor(): WebSocketConstructor | undefined {
  const candidate = (globalThis as { WebSocket?: unknown }).WebSocket;
  // Node 22+ and workerd both expose a client constructor; the shapes differ in
  // details (listener overloads, close-frame handling) that WebSocketLike does
  // not depend on, so narrow structurally rather than to a lib-specific type.
  return typeof candidate === "function" ? (candidate as WebSocketConstructor) : undefined;
}

function closeQuietly(socket: WebSocketLike): void {
  try {
    socket.close();
  } catch {
    // A socket that never opened may reject close(); the failure is already reported.
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
