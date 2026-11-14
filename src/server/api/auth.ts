import type { RuntimeGrant } from "../storage/runtime-token-service.ts";
import type { RuntimeJwtVerifier } from "./runtime-jwt.ts";
import type { Context, MiddlewareHandler } from "hono";

import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { measureExecutionPhase } from "../../core/execution-timing.ts";
import { isChannelEventVerifyRequest } from "../event-verification/registry.ts";
import { constantTimeEqual } from "./auth-utils.ts";
import { isConsoleShellRequest } from "./console-paths.ts";
import { jsonError } from "./http-utils.ts";
import { writeRuntimeFailure } from "./runtime-api.ts";

const bearerScheme = "bearer";
const authCookieName = "oomol_connect_admin_session";
const authCookieVersion = "v1";
const authCookieMaxAgeSeconds = 2_592_000;
const authCookieMaxAgeMs = authCookieMaxAgeSeconds * 1000;

/**
 * Optional API authentication for HTTP, web console, and MCP callers.
 */
export interface LocalAuthOptions {
  adminToken?: string;
  runtimeToken?: string;
  /** Keep runtime endpoints protected even when the last stored token is revoked. */
  requireRuntimeAuth?: boolean;
  hasRuntimeTokens?(): Promise<boolean>;
  resolveRuntimeToken?(token: string): Promise<RuntimeGrant | undefined>;
  verifyRuntimeJwt?: RuntimeJwtVerifier;
  /**
   * Which credentials the runtime scope (`/mcp`, `/v1`) accepts.
   * `runtime_token` (default) preserves the historical behavior exactly;
   * `oauth` accepts only OAuth access tokens; `mixed` accepts both;
   * `none` leaves runtime endpoints unauthenticated.
   */
  authMode?: "none" | "runtime_token" | "oauth" | "mixed";
  /** Resolves an OAuth access token (from the local authorization server) to its RuntimeGrant. */
  resolveOAuthToken?(token: string): Promise<RuntimeGrant | undefined>;
  /** RFC 9728 challenge emitted on runtime 401s when the OAuth AS is enabled. */
  oauthChallenge?: string;
}

export interface LocalAuthSession {
  adminAuthConfigured: boolean;
  authenticated: boolean;
}

type AuthScope = "admin" | "runtime" | "oauth";

const adminBearerRequests = new WeakSet<Request>();

export function hasAdminBearer(context: Context): boolean {
  return adminBearerRequests.has(context.req.raw);
}

const runtimeGrants = new WeakMap<Request, RuntimeGrant>();

export function readRuntimeGrant(context: Context): RuntimeGrant | undefined {
  return runtimeGrants.get(context.req.raw);
}

export function createLocalAuthMiddleware(options: LocalAuthOptions): MiddlewareHandler {
  const adminToken = normalizeToken(options.adminToken);
  const runtimeToken = normalizeToken(options.runtimeToken);
  // `oauth` mode must never fall through to unauthenticated, even when the
  // OAuth authorization server itself is disabled (fail closed).
  if (
    !adminToken &&
    !runtimeToken &&
    !options.requireRuntimeAuth &&
    !options.hasRuntimeTokens &&
    !options.resolveRuntimeToken &&
    !options.verifyRuntimeJwt &&
    !options.resolveOAuthToken &&
    options.authMode !== "oauth"
  ) {
    return async (_context, next) => {
      await next();
    };
  }

  const authenticate = async (context: Context): Promise<Response | undefined> => {
    const scope = readAuthScope(context.req.path, context.req.method);
    if (isPublicPath(context.req.path, context.req.method)) {
      return;
    }

    if (adminToken && matchesConfiguredToken(context, adminToken)) adminBearerRequests.add(context.req.raw);
    if (await hasValidToken(context, options, scope)) {
      if (scope === "admin") {
        await installAdminCookieForBearer(context, options);
      }
      return;
    }

    if (scope === "admin" && !adminToken) {
      return writeRuntimeFailure(context, {
        status: 403,
        errorCode: "forbidden",
        message: "Configure an admin token to access management endpoints.",
      });
    }

    // Keep administrator access to action runs and transit cleanup. A missing
    // administrator credential must not bypass runtime authentication.
    if (
      canUseAdminAuth(context.req.path, context.req.method) &&
      normalizeToken(options.adminToken) &&
      (await hasValidToken(context, options, "admin"))
    ) {
      await installAdminCookieForBearer(context, options);
      return;
    }

    if (isConnectionManagementPath(context.req.path)) {
      return writeRuntimeFailure(context, {
        status: 401,
        errorCode: "unauthorized",
        message: "A valid administrator bearer token is required.",
      });
    }
    if (context.req.path.startsWith("/v1/")) {
      return writeRuntimeFailure(context, {
        status: 401,
        errorCode: "unauthorized",
        message: "A valid local bearer token is required.",
      });
    }
    // RFC 9728 discovery: MCP clients learn the authorization server's
    // metadata location from this challenge on the resource's 401.
    if (options.oauthChallenge && scope === "runtime") {
      context.header("WWW-Authenticate", options.oauthChallenge);
    }
    return jsonError(context, 401, "unauthorized", "A valid local bearer token is required.");
  };

  return async (context, next) => {
    const response = await measureExecutionPhase("authMs", () => authenticate(context));
    if (response) return response;
    await next();
  };
}

async function installLocalAuthCookie(context: Context, options: LocalAuthOptions): Promise<void> {
  const token = normalizeToken(options.adminToken);
  if (!token) {
    return;
  }

  setCookie(context, authCookieName, await createAuthCookieValue(token), {
    httpOnly: true,
    maxAge: authCookieMaxAgeSeconds,
    sameSite: "Strict",
    secure: context.req.url.startsWith("https://"),
    path: "/",
  });
}

function isPublicPath(path: string, method: string): boolean {
  return (
    path === "/health" ||
    (method === "GET" && path === "/oauth/saas/complete") ||
    path === "/oauth/callback" ||
    path.startsWith("/oauth/callback/") ||
    (method === "GET" && path === "/api/auth/session") ||
    (method === "POST" && path === "/api/auth/logout") ||
    (method === "GET" && path.startsWith("/api/files/")) ||
    // Channel verify routes perform their own dedicated bearer check; the global
    // admin/runtime middleware must not require a different token.
    isChannelEventVerifyRequest(path, method) ||
    isConsoleShellRequest(path, method)
  );
}

export async function readLocalAuthSession(context: Context, options: LocalAuthOptions): Promise<LocalAuthSession> {
  const adminToken = normalizeToken(options.adminToken);
  if (!adminToken) {
    return { adminAuthConfigured: false, authenticated: !(await requiresRuntimeAuthentication(options)) };
  }

  const authenticated = await hasRequestToken(context, adminToken);
  if (authenticated) {
    await installAdminCookieForBearer(context, options);
  }

  return {
    adminAuthConfigured: true,
    authenticated,
  };
}

export function clearLocalAuthCookie(context: Context): void {
  deleteCookie(context, authCookieName, {
    httpOnly: true,
    sameSite: "Strict",
    secure: context.req.url.startsWith("https://"),
    path: "/",
  });
}

async function installAdminCookieForBearer(context: Context, options: LocalAuthOptions): Promise<void> {
  const token = normalizeToken(options.adminToken);
  if (token && matchesConfiguredToken(context, token)) {
    await installLocalAuthCookie(context, options);
  }
}

async function hasValidToken(context: Context, options: LocalAuthOptions, scope: AuthScope): Promise<boolean> {
  // File deletion used to require administrator access. Do not turn an
  // administrator-only installation into anonymous deletion by inheriting the
  // runtime scope's optional-auth fallback.
  const protectedTransitDelete =
    isTransitFileDelete(context.req.path, context.req.method) && normalizeToken(options.adminToken);
  // The authorization server's own endpoints authenticate their callers
  // (admin consent, client credentials); the middleware must let them through.
  if (scope === "oauth") {
    return true;
  }
  if (scope === "runtime" && options.authMode === "none" && !protectedTransitDelete) {
    return true;
  }
  // In `oauth` mode a configured static runtime token is not accepted: OAuth-only
  // means OAuth-only, so skip straight to runtime-token resolution below.
  const skipStaticRuntimeToken = scope === "runtime" && options.authMode === "oauth";
  const token = skipStaticRuntimeToken ? undefined : tokenForScope(options, scope);
  if (!token) {
    const required = await requiresRuntimeAuthentication(options);
    if (scope === "admin") return !required;
    if (!required && !protectedTransitDelete) return true;
    return hasValidRuntimeToken(context, options);
  }

  if (await hasRequestToken(context, token)) {
    return true;
  }

  return scope === "runtime" ? await hasValidRuntimeToken(context, options) : false;
}

async function requiresRuntimeAuthentication(options: LocalAuthOptions): Promise<boolean> {
  if (options.authMode === "none") return false;
  if (
    normalizeToken(options.runtimeToken) ||
    options.requireRuntimeAuth ||
    options.verifyRuntimeJwt ||
    options.authMode === "oauth" ||
    (options.authMode === "mixed" && options.resolveOAuthToken)
  ) {
    return true;
  }
  return options.hasRuntimeTokens ? await options.hasRuntimeTokens() : options.resolveRuntimeToken !== undefined;
}

async function hasRequestToken(context: Context, token: string): Promise<boolean> {
  if (context.req.header("authorization") !== undefined) return matchesConfiguredToken(context, token);
  return await hasValidAuthCookie(context, token);
}

async function hasValidAuthCookie(context: Context, token: string): Promise<boolean> {
  const cookie = getCookie(context, authCookieName);
  if (!cookie) {
    return false;
  }

  const [version, issuedAt, nonce, signature, ...extra] = cookie.split(".");
  if (version !== authCookieVersion || !issuedAt || !nonce || !signature || extra.length > 0) {
    return false;
  }

  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs) || issuedAtMs > Date.now() || Date.now() - issuedAtMs > authCookieMaxAgeMs) {
    return false;
  }

  const payload = `${version}.${issuedAt}.${nonce}`;
  return constantTimeEqual(signature, await signAuthCookiePayload(payload, token));
}

async function createAuthCookieValue(token: string): Promise<string> {
  const payload = `${authCookieVersion}.${Date.now()}.${base64Url(crypto.getRandomValues(new Uint8Array(16)))}`;
  return `${payload}.${await signAuthCookiePayload(payload, token)}`;
}

async function signAuthCookiePayload(payload: string, token: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", utf8(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(await crypto.subtle.sign("HMAC", key, utf8(payload)));
}

function utf8(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer as ArrayBuffer;
}

function base64Url(value: ArrayBuffer | ArrayBufferView): string {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return Buffer.from(bytes).toString("base64url");
}

// Deployment secrets (`OOMOL_CONNECT_ADMIN_TOKEN` / `OOMOL_CONNECT_RUNTIME_TOKEN`) are long-lived,
// so the credential is compared in constant time instead of with `===`, which short-circuits on
// the first differing character and leaks how much of the token an attacker already guessed. Stored
// runtime tokens already get the same treatment through `timingSafeEqual` on their hashes.
function matchesConfiguredToken(context: Context, token: string): boolean {
  return constantTimeEqual(readBearerCredential(context), token);
}

function normalizeToken(token: string | undefined): string | undefined {
  const value = token?.trim();
  return value ? value : undefined;
}

function isTransitFileDelete(path: string, method: string): boolean {
  return method === "DELETE" && /^\/api\/files\/[^/]+$/.test(path);
}

function readAuthScope(path: string, method: string): AuthScope {
  if (isConnectionManagementPath(path)) return "admin";
  if (isOAuthServerPath(path)) return "oauth";
  if (isTransitFileDelete(path, method)) return "runtime";
  return path === "/mcp" || path.startsWith("/mcp/") || path === "/v1" || path.startsWith("/v1/") ? "runtime" : "admin";
}

/**
 * Paths served by the local authorization server (`src/server/oauth/`). They
 * self-enforce their own authentication — admin consent, client credentials,
 * or none by design — so the global middleware must not demand an admin or
 * runtime token for them.
 */
function isOAuthServerPath(path: string): boolean {
  return (
    path === "/oauth/mcp" ||
    path.startsWith("/oauth/mcp/") ||
    path === "/oauth/jwks" ||
    path.startsWith("/.well-known/oauth-")
  );
}

function canUseAdminAuth(path: string, method: string): boolean {
  return isTransitFileDelete(path, method) || (method === "POST" && /^\/v1\/actions\/[^/]+$/.test(path));
}

function tokenForScope(options: LocalAuthOptions, scope: AuthScope): string | undefined {
  const adminToken = normalizeToken(options.adminToken);
  const runtimeToken = normalizeToken(options.runtimeToken);
  return scope === "runtime" ? runtimeToken : adminToken;
}

async function hasValidRuntimeToken(context: Context, options: LocalAuthOptions): Promise<boolean> {
  const token = readBearerToken(context);
  if (!token) {
    return false;
  }
  // `oauth` mode accepts only OAuth access tokens; `runtime_token` (the
  // default) preserves the historical oct_/JWT behavior; `mixed` accepts both.
  if (options.authMode !== "oauth") {
    const grant = await options.resolveRuntimeToken?.(token);
    if (grant) {
      runtimeGrants.set(context.req.raw, grant);
      return true;
    }
    if (await (options.verifyRuntimeJwt?.(token) ?? false)) {
      return true;
    }
  }
  if (options.authMode === "oauth" || options.authMode === "mixed") {
    const grant = await options.resolveOAuthToken?.(token);
    if (grant) {
      runtimeGrants.set(context.req.raw, grant);
      return true;
    }
  }
  return false;
}

function readBearerToken(context: Context): string | undefined {
  return normalizeToken(readBearerCredential(context));
}

/**
 * Bearer credential exactly as sent, so configured tokens still require a byte-for-byte match.
 *
 * Authentication schemes are case-insensitive (RFC 9110), so `bearer` and `BEARER` are accepted;
 * only the credentials stay case-sensitive.
 */
function readBearerCredential(context: Context): string {
  const authorization = context.req.header("authorization") ?? "";
  const separator = authorization.indexOf(" ");
  if (separator < 0 || authorization.slice(0, separator).toLowerCase() !== bearerScheme) {
    return "";
  }

  return authorization.slice(separator + 1);
}

function isConnectionManagementPath(path: string): boolean {
  return (
    path === "/api/custom-mcp" ||
    path.startsWith("/api/custom-mcp/") ||
    /^\/v1\/providers\/[^/]+\/setup$/.test(path) ||
    path === "/v1/connections" ||
    path.startsWith("/v1/connections/") ||
    path.startsWith("/v1/connection-requests/") ||
    path === "/api/oauth/connection-requests" ||
    path.startsWith("/api/oauth/connection-requests/")
  );
}
