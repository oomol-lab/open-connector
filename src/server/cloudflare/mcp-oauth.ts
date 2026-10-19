import type { CloudflareEnv } from "./cloudflare-env.ts";
import type { OAuthProviderOptions, OAuthResourceAuth } from "@cloudflare/workers-oauth-provider";

import OAuthProvider, {
  AuthorizationError,
  CimdFetchError,
  getOAuthApi,
  insufficientScope,
  OAuthError,
} from "@cloudflare/workers-oauth-provider";
import { timingSafeEqual } from "node:crypto";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { D1RuntimeDatabase } from "../storage/d1/runtime-store.ts";
import { RuntimeTokenService } from "../storage/runtime-token-service.ts";
import { renderMcpConsentPage } from "./mcp-consent-page.ts";

interface McpOAuthProps {
  runtimeToken: string;
  legacy?: boolean;
}

interface McpExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface McpAuthorizedContext extends McpExecutionContext {
  props: McpOAuthProps;
  auth: OAuthResourceAuth;
}

export interface McpOAuthHandler {
  fetch(request: Request, env: CloudflareEnv, context: McpExecutionContext): Promise<Response>;
}

type RuntimeHandler = (request: Request, env: CloudflareEnv) => Promise<Response>;

const accessScope = "mcp:access";
const authorizePath = "/oauth/mcp/authorize";

/** Add MCP OAuth at the Worker boundary without changing administrator or runtime-token auth. */
export function createMcpOAuthHandler(origin: string, runtime: RuntimeHandler): McpOAuthHandler {
  const resource = `${origin}/mcp`;
  const options: OAuthProviderOptions<CloudflareEnv> = {
    apiRoute: "/mcp",
    authorizeEndpoint: `${origin}${authorizePath}`,
    tokenEndpoint: `${origin}/oauth/mcp/token`,
    clientRegistrationEndpoint: `${origin}/oauth/mcp/register`,
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: [accessScope, "offline_access"],
    requiredScopes: [accessScope],
    accessTokenTTL: 3600,
    refreshTokenTTL: 30 * 86400,
    resourceMetadata: { resource, authorization_servers: [origin], resource_name: "OpenConnector" },
    apiHandler: {
      async fetch(request: Request, env: CloudflareEnv, context: McpAuthorizedContext): Promise<Response> {
        const props = context.props;
        if (!props.legacy && !context.auth.scope.includes(accessScope)) {
          return insufficientScope(context.auth, [accessScope]);
        }
        // The backing token is an independently revocable runtime credential, never the admin token.
        // Revalidate it on every request, so revocation also works before the first token is created.
        if (!(await validRuntimeToken(env, props.runtimeToken))) {
          return invalidMcpToken(origin);
        }
        const headers = new Headers(request.headers);
        headers.set("authorization", `Bearer ${props.runtimeToken}`);
        headers.delete("cookie");
        return runtime(new Request(request, { headers }), env);
      },
    },
    async resolveExternalToken({ token, env }) {
      if (!(await validRuntimeToken(env, token))) return null;
      return { props: { runtimeToken: token, legacy: true }, audience: resource };
    },
    async tokenExchangeCallback({ props, env }) {
      const credential = props as McpOAuthProps;
      if (!(await validRuntimeToken(env, credential.runtimeToken))) {
        throw new OAuthError("invalid_grant", { description: "This connection was revoked. Authorize again." });
      }
    },
    defaultHandler: {
      async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
        if (new URL(request.url).pathname !== authorizePath) return runtime(request, env);
        if (!env.OOMOL_CONNECT_ADMIN_TOKEN?.trim() || !env.OOMOL_CONNECT_ENCRYPTION_KEY?.trim()) {
          return localError("Administrator authentication and encrypted storage are required.", 503);
        }
        const oauth = getOAuthApi(options, env);
        try {
          if (request.method === "GET") {
            const auth = await oauth.parseAuthRequest(request);
            const details = await oauth.describeConsent(auth);
            const consent = await oauth.beginConsent(auth);
            consent.headers.set("Content-Type", "text/html; charset=utf-8");
            // Chrome applies form-action to the POST's redirect as well as its initial target.
            // The library has already checked this callback against the client's registered URIs.
            const callbackOrigin = new URL(details.redirectUri).origin;
            consent.headers.set(
              "Content-Security-Policy",
              `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${callbackOrigin}; base-uri 'none'; frame-ancestors 'none'`,
            );
            // Browsers serialize a form POST's Origin as null under no-referrer.
            // same-origin keeps CSRF validation usable without leaking the authorization URL to the callback.
            consent.headers.set("Referrer-Policy", "same-origin");
            consent.headers.set("X-Content-Type-Options", "nosniff");
            return new Response(renderMcpConsentPage(details, consent.handle), { headers: consent.headers });
          }
          if (request.method !== "POST") return localError("Method not allowed.", 405);
          if (request.headers.get("origin") !== origin) return localError("Invalid request origin.", 403);
          if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
            return localError("Expected a form submission.", 415);
          }
          const bytes = await readBoundedResponseBytes(new Response(request.body), {
            maxBytes: 8192,
            fieldName: "consent form",
            createError: () => new AuthorizationError("invalid_request", { description: "Form is too large." }),
            signal: request.signal,
          });
          const form = new URLSearchParams(new TextDecoder().decode(bytes));
          const handle = form.get("handle") ?? "";
          if (form.get("decision") === "deny") {
            const denied = await oauth.denyConsent(request, handle);
            return new Response(null, { status: 302, headers: denied.headers });
          }
          if (form.get("decision") !== "approve") return localError("Choose Allow or Deny.", 400);
          if (!sameToken(form.get("admin_token") ?? "", env.OOMOL_CONNECT_ADMIN_TOKEN.trim())) {
            return localError("Invalid administrator token. Go back and try again.", 401);
          }
          const approved = await oauth.approveConsent(request, handle, { scope: [accessScope, "offline_access"] });
          const client = await oauth.describeConsent(approved.request);
          const tokens = runtimeTokens(env);
          const backing = await tokens.createToken(`MCP OAuth • ${client.clientName.slice(0, 120)}`, {
            allowedActions: ["*"],
            blockedActions: [],
            allowedProxies: [],
            allowedConnections: [],
            allowedTriggers: [],
          });
          try {
            const authorization = await oauth.completeAuthorization({
              request: approved.request,
              userId: "administrator",
              metadata: { runtimeTokenId: backing.record.id },
              scope: approved.request.scope,
              props: { runtimeToken: backing.token },
            });
            approved.headers.set("Location", authorization.redirectTo);
            return new Response(null, { status: 302, headers: approved.headers });
          } catch (error) {
            await tokens.revokeToken(backing.record.id);
            throw error;
          }
        } catch (error) {
          if (request.method === "GET" && error instanceof AuthorizationError && error.redirectTo) {
            return Response.redirect(error.redirectTo, 302);
          }
          if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
            // Render locally: a failed POST must never construct a redirect from submitted data.
            return localError(
              error instanceof AuthorizationError ? error.description : "Unable to verify this client.",
              400,
            );
          }
          throw error;
        }
      },
    },
  };
  const provider = new OAuthProvider(options);
  return {
    async fetch(request, env, context) {
      // Also serve the origin-level discovery fallback used by older MCP clients.
      const url = new URL(request.url);
      if (url.pathname === "/.well-known/oauth-protected-resource") {
        url.pathname = "/.well-known/oauth-protected-resource/mcp";
        request = new Request(url, request);
      }
      return provider.fetch(request, env, context);
    },
  };
}

function runtimeTokens(env: CloudflareEnv): RuntimeTokenService {
  return new RuntimeTokenService(new D1RuntimeDatabase(env.DB).runtimeTokenStore);
}

async function validRuntimeToken(env: CloudflareEnv, token: string): Promise<boolean> {
  if (!token) return false;
  if (env.OOMOL_CONNECT_RUNTIME_TOKEN?.trim() && sameToken(token, env.OOMOL_CONNECT_RUNTIME_TOKEN.trim())) return true;
  return runtimeTokens(env).verifyToken(token);
}

function sameToken(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function invalidMcpToken(origin: string): Response {
  return new Response(null, {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", error="invalid_token"`,
    },
  });
}

function localError(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
