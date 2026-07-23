import type { RuntimeGrant } from "../storage/runtime-token-service.ts";
import type { RuntimeJwtVerifier } from "./runtime-jwt.ts";
import type { Context, MiddlewareHandler } from "hono";

import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { isConsoleShellRequest } from "./console-paths.ts";
import { jsonError } from "./http-utils.ts";

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
  hasRuntimeTokens?(): Promise<boolean>;
  resolveRuntimeToken?(token: string): Promise<RuntimeGrant | undefined>;
  verifyRuntimeJwt?: RuntimeJwtVerifier;
}

export interface LocalAuthSession {
  adminAuthConfigured: boolean;
  authenticated: boolean;
}

type AuthScope = "admin" | "runtime";

const runtimeGrants = new WeakMap<Request, RuntimeGrant>();

export function readRuntimeGrant(context: Context): RuntimeGrant | undefined {
  return runtimeGrants.get(context.req.raw);
}

export function createLocalAuthMiddleware(options: LocalAuthOptions): MiddlewareHandler {
  const adminToken = normalizeToken(options.adminToken);
  const runtimeToken = normalizeToken(options.runtimeToken);
  if (
    !adminToken &&
    !runtimeToken &&
    !options.hasRuntimeTokens &&
    !options.resolveRuntimeToken &&
    !options.verifyRuntimeJwt
  ) {
    return async (_context, next) => {
      await next();
    };
  }

  return async (context, next) => {
    const scope = readAuthScope(context.req.path);
    if (isPublicPath(context.req.path, context.req.method)) {
      await next();
      return;
    }

    if (await hasValidToken(context, options, scope)) {
      if (scope === "admin") {
        await installAdminCookieForBearer(context, options);
      }
      await next();
      return;
    }

    if (canUseAdminAuth(context.req.path, context.req.method) && (await hasValidToken(context, options, "admin"))) {
      await installAdminCookieForBearer(context, options);
      await next();
      return;
    }

    return jsonError(context, 401, "unauthorized", "A valid local bearer token is required.");
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
    path === "/oauth/callback" ||
    path.startsWith("/oauth/callback/") ||
    (method === "GET" && path === "/api/auth/session") ||
    (method === "POST" && path === "/api/auth/logout") ||
    (method === "GET" && path.startsWith("/api/files/")) ||
    isConsoleShellRequest(path, method)
  );
}

export async function readLocalAuthSession(context: Context, options: LocalAuthOptions): Promise<LocalAuthSession> {
  const adminToken = normalizeToken(options.adminToken);
  if (!adminToken) {
    return { adminAuthConfigured: false, authenticated: true };
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
  if (token && context.req.header("authorization") === `Bearer ${token}`) {
    await installLocalAuthCookie(context, options);
  }
}

async function hasValidToken(context: Context, options: LocalAuthOptions, scope: AuthScope): Promise<boolean> {
  const token = tokenForScope(options, scope);
  if (!token) {
    if (scope === "admin") {
      return true;
    }
    const hasRuntimeTokens = options.hasRuntimeTokens
      ? await options.hasRuntimeTokens()
      : options.resolveRuntimeToken !== undefined;
    if (!hasRuntimeTokens && !options.verifyRuntimeJwt) {
      return true;
    }
    return hasValidRuntimeToken(context, options);
  }

  if (await hasRequestToken(context, token)) {
    return true;
  }

  return scope === "runtime" ? await hasValidRuntimeToken(context, options) : false;
}

async function hasRequestToken(context: Context, token: string): Promise<boolean> {
  const authorization = context.req.header("authorization") ?? "";
  return authorization === `Bearer ${token}` || (await hasValidAuthCookie(context, token));
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

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function normalizeToken(token: string | undefined): string | undefined {
  const value = token?.trim();
  return value ? value : undefined;
}

function readAuthScope(path: string): AuthScope {
  return path === "/mcp" || path.startsWith("/mcp/") || path === "/v1" || path.startsWith("/v1/") ? "runtime" : "admin";
}

function canUseAdminAuth(path: string, method: string): boolean {
  return method === "POST" && /^\/v1\/actions\/[^/]+$/.test(path);
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
  const grant = await options.resolveRuntimeToken?.(token);
  if (grant) {
    runtimeGrants.set(context.req.raw, grant);
    return true;
  }
  return await (options.verifyRuntimeJwt?.(token) ?? false);
}

function readBearerToken(context: Context): string | undefined {
  const authorization = context.req.header("authorization") ?? "";
  const prefix = "Bearer ";
  return authorization.startsWith(prefix) ? normalizeToken(authorization.slice(prefix.length)) : undefined;
}
