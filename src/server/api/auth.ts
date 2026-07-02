import type { Context, MiddlewareHandler } from "hono";

import { getCookie, setCookie } from "hono/cookie";
import { isConsoleShellRequest } from "./console-paths.ts";
import { jsonError } from "./http-utils.ts";

const authCookieName = "oomol_connect_admin_token";

/**
 * Optional local API authentication for HTTP, web console, and MCP callers.
 */
export type LocalAuthOptions = {
  adminToken?: string;
  runtimeToken?: string;
  hasRuntimeTokens?(): Promise<boolean>;
  verifyRuntimeToken?(token: string): Promise<boolean>;
};

type AuthScope = "admin" | "runtime";

export function createLocalAuthMiddleware(options: LocalAuthOptions): MiddlewareHandler {
  const adminToken = normalizeToken(options.adminToken);
  const runtimeToken = normalizeToken(options.runtimeToken);
  if (!adminToken && !runtimeToken && !options.hasRuntimeTokens && !options.verifyRuntimeToken) {
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
        installAdminCookieForBearer(context, options);
      }
      await next();
      return;
    }

    if (canUseAdminAuth(context.req.path, context.req.method) && (await hasValidToken(context, options, "admin"))) {
      installAdminCookieForBearer(context, options);
      await next();
      return;
    }

    return jsonError(context, 401, "unauthorized", "A valid local bearer token is required.");
  };
}

function installLocalAuthCookie(context: Context, options: LocalAuthOptions): void {
  const token = normalizeToken(options.adminToken);
  if (!token) {
    return;
  }

  setCookie(context, authCookieName, token, {
    httpOnly: true,
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
    (method === "GET" && path.startsWith("/api/files/")) ||
    isConsoleShellRequest(path, method)
  );
}

function installAdminCookieForBearer(context: Context, options: LocalAuthOptions): void {
  const token = normalizeToken(options.adminToken);
  if (token && context.req.header("authorization") === `Bearer ${token}`) {
    installLocalAuthCookie(context, options);
  }
}

async function hasValidToken(context: Context, options: LocalAuthOptions, scope: AuthScope): Promise<boolean> {
  const token = tokenForScope(options, scope);
  if (!token) {
    if (scope === "admin") {
      return true;
    }
    if (!(await (options.hasRuntimeTokens?.() ?? false))) {
      return true;
    }
    return hasValidStoredRuntimeToken(context, options);
  }

  const authorization = context.req.header("authorization") ?? "";
  if (authorization === `Bearer ${token}`) {
    return true;
  }

  if (getCookie(context, authCookieName) === token) {
    return true;
  }

  return scope === "runtime" ? await hasValidStoredRuntimeToken(context, options) : false;
}

function normalizeToken(token: string | undefined): string | undefined {
  const value = token?.trim();
  return value ? value : undefined;
}

function readAuthScope(path: string): AuthScope {
  return path.startsWith("/mcp") || path.startsWith("/v1/") ? "runtime" : "admin";
}

function canUseAdminAuth(path: string, method: string): boolean {
  return method === "POST" && /^\/v1\/actions\/[^/]+$/.test(path);
}

function tokenForScope(options: LocalAuthOptions, scope: AuthScope): string | undefined {
  const adminToken = normalizeToken(options.adminToken);
  const runtimeToken = normalizeToken(options.runtimeToken);
  return scope === "runtime" ? runtimeToken : adminToken;
}

async function hasValidStoredRuntimeToken(context: Context, options: LocalAuthOptions): Promise<boolean> {
  const token = readBearerToken(context);
  return token ? await (options.verifyRuntimeToken?.(token) ?? false) : false;
}

function readBearerToken(context: Context): string | undefined {
  const authorization = context.req.header("authorization") ?? "";
  const prefix = "Bearer ";
  return authorization.startsWith(prefix) ? normalizeToken(authorization.slice(prefix.length)) : undefined;
}
