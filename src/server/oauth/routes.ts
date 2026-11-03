import type {
  IOAuthClientStore,
  IOAuthCodeStore,
  IOAuthTokenStore,
  IOAuthSigningKeyStore,
} from "../storage/oauth-as-stores.ts";
import type { RuntimeTokenService, IRuntimeTokenStore } from "../storage/runtime-token-service.ts";
import type { AuthorizeDependencies } from "./authorize-endpoint.ts";
import type { CimdClient } from "./cimd-client.ts";
import type { OAuthServerConfig } from "./config.ts";
import type { RegisterDependencies } from "./register-endpoint.ts";
import type { TokenDependencies } from "./token-endpoint.ts";
import type { Context } from "hono";

import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";
import { applyWellKnownRoutes } from "./as-metadata.ts";
import { handleAuthorizeGet, handleAuthorizePost } from "./authorize-endpoint.ts";
import { handleRegisterPost, RegistrationError } from "./register-endpoint.ts";
import { handleRevokePost, handleTokenPost, TokenError } from "./token-endpoint.ts";

/**
 * Mount point for the Node authorization server. All endpoints under
 * `/oauth/mcp/*` and the well-known discovery paths self-enforce their own
 * authentication (admin consent, client credentials, or none by design); the
 * global auth middleware treats the `oauth` scope as public for exactly this
 * reason. `/mcp` and `/v1` are untouched.
 */

export interface OAuthRoutesOptions {
  config: OAuthServerConfig;
  adminToken?: string;
  clients: IOAuthClientStore;
  codes: IOAuthCodeStore;
  tokens: IOAuthTokenStore;
  keys: IOAuthSigningKeyStore;
  runtimeTokens: RuntimeTokenService;
  runtimeTokenStore: IRuntimeTokenStore;
  cimd?: CimdClient;
  /**
   * Opt-in trust for reverse-proxy forwarding headers when keying rate-limit
   * buckets. Default `false`: only the socket peer address is used, so a
   * caller cannot rotate its bucket by sending `x-forwarded-for`. Enable only
   * behind a proxy that overwrites these headers; otherwise callers can spoof
   * the key (and, worse, share one bucket behind a TLS-terminating proxy when
   * left disabled).
   */
  trustProxyHeaders?: boolean;
  /** Test seam; defaults to an in-memory fixed-window limiter. */
  rateLimiter?: RateLimiter;
}

/** Fixed-window in-memory limiter, keyed by bucket + client identity. */
export interface RateLimiter {
  take(bucket: string, key: string, limit: number, windowMs: number): boolean;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private nextSweepAt: number = 0;
  private static readonly sweepIntervalMs: number = 60_000;

  take(bucket: string, key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    // Expired windows are dead weight: without a sweep the map grows by one
    // entry per bucket:key pair forever. Sweep at most once per interval so a
    // burst of distinct keys cannot turn sweeping itself into the hot path.
    if (now >= this.nextSweepAt) {
      this.nextSweepAt = now + MemoryRateLimiter.sweepIntervalMs;
      for (const [id, window] of this.windows) {
        if (window.resetAt <= now) {
          this.windows.delete(id);
        }
      }
    }
    const id = `${bucket}:${key}`;
    const window = this.windows.get(id);
    if (window === undefined || window.resetAt <= now) {
      this.windows.set(id, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (window.count >= limit) {
      return false;
    }
    window.count += 1;
    return true;
  }
}

const registerRate = { limit: 10, windowMs: 60_000 };
const tokenRate = { limit: 60, windowMs: 60_000 };

export function createOAuthRoutes(options: OAuthRoutesOptions): Hono {
  const app = new Hono();
  const limiter = options.rateLimiter ?? new MemoryRateLimiter();
  const trustProxyHeaders = options.trustProxyHeaders ?? false;
  const authorizeDeps: AuthorizeDependencies = { ...options };
  const tokenDeps: TokenDependencies = { ...options };
  const registerDeps: RegisterDependencies = {
    config: options.config,
    clients: options.clients,
    tokens: options.tokens,
  };

  applyWellKnownRoutes(app, options.config);

  app.get("/oauth/mcp/authorize", (context: Context) => handleAuthorizeGet(context, authorizeDeps));
  app.post("/oauth/mcp/authorize", (context: Context) => handleAuthorizePost(context, authorizeDeps));

  app.post("/oauth/mcp/token", async (context: Context) => {
    const form = await readForm(context);
    if (!form) {
      return formError(
        context,
        new TokenError("invalid_request", "Expected an application/x-www-form-urlencoded token request."),
      );
    }
    if (
      !limiter.take(
        "token",
        form.get("client_id") ?? clientKey(context, trustProxyHeaders),
        tokenRate.limit,
        tokenRate.windowMs,
      )
    ) {
      return rateLimitResponse(tokenRate.windowMs);
    }
    return jsonResult(context, async () =>
      context.json(await handleTokenPost(form, tokenDeps, context.req.header("authorization") ?? undefined)),
    );
  });

  app.post("/oauth/mcp/revoke", async (context: Context) => {
    const form = await readForm(context);
    if (!form) {
      return formError(
        context,
        new TokenError("invalid_request", "Expected an application/x-www-form-urlencoded revocation request."),
      );
    }
    if (
      !limiter.take(
        "revoke",
        form.get("client_id") ?? clientKey(context, trustProxyHeaders),
        tokenRate.limit,
        tokenRate.windowMs,
      )
    ) {
      return rateLimitResponse(tokenRate.windowMs);
    }
    return jsonResult(context, async () => {
      await handleRevokePost(form, tokenDeps, context.req.header("authorization") ?? undefined);
      return new Response(null, { status: 200 });
    });
  });

  app.post("/oauth/mcp/register", async (context: Context) => {
    if (!limiter.take("register", clientKey(context, trustProxyHeaders), registerRate.limit, registerRate.windowMs)) {
      return rateLimitResponse(registerRate.windowMs);
    }
    return jsonResult(context, () => handleRegisterPost(context, registerDeps));
  });

  app.get("/oauth/jwks", async (context: Context) =>
    context.json({
      keys: (await options.keys.all()).map((key) => ({ ...key.publicKeyJwk, kid: key.kid, alg: "ES256", use: "sig" })),
    }),
  );

  return app;
}

async function readForm(context: Context): Promise<URLSearchParams | undefined> {
  const contentType = context.req.header("content-type") ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return undefined;
  }
  return new URLSearchParams(await context.req.text());
}

function clientKey(context: Context, trustProxyHeaders: boolean): string {
  if (trustProxyHeaders) {
    // Behind a trusted reverse proxy every socket connection comes from the
    // proxy, so the socket address would collapse all callers into one shared
    // rate-limit bucket. The rightmost non-empty x-forwarded-for entry is the
    // hop appended by the trusted proxy itself, making it the caller address
    // a spoofing client cannot influence (a client-sent header is shifted
    // left by the proxy's append). The dedicated proxy IP headers follow.
    const forwarded = context.req.header("x-forwarded-for");
    if (forwarded) {
      const entries = forwarded
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      const rightmost = entries[entries.length - 1];
      if (rightmost) {
        return rightmost;
      }
    }
    const proxyAddress = context.req.header("x-real-ip") ?? context.req.header("cf-connecting-ip");
    if (proxyAddress) {
      return proxyAddress;
    }
  }
  try {
    const info = getConnInfo(context);
    if (info.remote?.address) {
      return info.remote.address;
    }
  } catch {
    // No node-server env on this context (in-process requests such as tests,
    // or a handler detached from the node-server env).
  }
  return "local";
}

function rateLimitResponse(windowMs: number): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  return new Response(
    JSON.stringify({ error: "rate_limited", error_description: "Too many requests. Try again later." }),
    {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(retryAfterSeconds) },
    },
  );
}

function formError(context: Context, error: TokenError): Response {
  return context.json({ error: error.code, error_description: error.message }, error.status as 400);
}

/** Runs a handler and maps OAuth errors onto RFC 6749 section 5.2 error responses. */
async function jsonResult(context: Context, handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof TokenError) {
      return context.json({ error: error.code, error_description: error.message }, error.status as 400);
    }
    if (error instanceof RegistrationError) {
      return context.json({ error: error.code, error_description: error.message }, 400);
    }
    throw error;
  }
}
