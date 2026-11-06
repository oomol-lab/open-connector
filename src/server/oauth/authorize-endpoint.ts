import type {
  OAuthClientRecord,
  IOAuthClientStore,
  IOAuthCodeStore,
  IOAuthSigningKeyStore,
} from "../storage/oauth-as-stores.ts";
import type { RuntimeTokenService } from "../storage/runtime-token-service.ts";
import type { CimdClient } from "./cimd-client.ts";
import type { OAuthServerConfig } from "./config.ts";
import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";
import type { Context } from "hono";

import { withClientLock } from "./client-lock.ts";

// `jose` is a lazy-only package (see eager-imports.test.ts): dynamic import only.
async function jose(): Promise<typeof import("jose")> {
  return import("jose");
}
import { constantTimeEqual } from "../api/auth-utils.ts";
import { renderMcpConsentPage } from "../cloudflare/mcp-consent-page.ts";
import { CimdError } from "./cimd-client.ts";
import { redirectUriMatches } from "./client-metadata.ts";
import { accessScope, parseScope } from "./config.ts";
import { hashToken, randomToken } from "./jwks.ts";
import { isValidCodeChallenge } from "./pkce.ts";

/**
 * The authorization endpoint (RFC 6749 section 3.1) with an admin-gated consent
 * page, mirroring the Workers AS: the administrator approves a client by
 * submitting the deployment admin token, and approval mints a backing runtime
 * token plus a single-use authorization code bound to that token.
 */

const consentTtlSeconds = 600;
const consentAudience = "consent";

export interface AuthorizeDependencies {
  config: OAuthServerConfig;
  adminToken?: string;
  clients: IOAuthClientStore;
  codes: IOAuthCodeStore;
  keys: IOAuthSigningKeyStore;
  runtimeTokens: RuntimeTokenService;
  cimd?: CimdClient;
}

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  scope: string[];
  state?: string;
  codeChallenge?: string;
  resource?: string;
}

export class AuthorizeError extends Error {
  readonly code: string;
  readonly redirectTo?: URL;

  constructor(code: string, message: string, redirectTo?: URL) {
    super(message);
    this.code = code;
    this.redirectTo = redirectTo;
  }
}

/** Validates an authorization request, resolving CIMD clients on first sight. */
export async function parseAuthorizeRequest(
  query: URLSearchParams,
  deps: Pick<AuthorizeDependencies, "config" | "clients" | "cimd">,
): Promise<{ request: AuthorizeRequest; client: OAuthClientRecord }> {
  const clientId = query.get("client_id") ?? "";
  const redirectUri = query.get("redirect_uri") ?? "";
  if (!clientId || !redirectUri) {
    throw new AuthorizeError("invalid_request", "client_id and redirect_uri are required.");
  }
  let client: OAuthClientRecord | undefined;
  try {
    client = await resolveClient(clientId, deps);
  } catch (error) {
    if (error instanceof CimdError) {
      throw new AuthorizeError(error.code, error.message);
    }
    throw error;
  }
  if (!client) {
    throw new AuthorizeError("invalid_client", "Unknown client.");
  }
  if (!redirectUriMatches(client.redirectUris, redirectUri)) {
    // Redirect URI mismatch must never redirect: the endpoint cannot know
    // whether the caller is the legitimate client yet.
    throw new AuthorizeError("invalid_request", "redirect_uri is not registered for this client.");
  }
  const state = query.get("state") ?? undefined;
  if (query.get("response_type") !== "code") {
    throw redirectError("unsupported_response_type", "Only response_type=code is supported.", redirectUri, state);
  }
  const scope = parseScope(query.get("scope"));
  if (!scope.includes(accessScope)) {
    throw redirectError("invalid_scope", `Request must include the ${accessScope} scope.`, redirectUri, state);
  }
  if (scope.some((requested) => !client.scopes.includes(requested))) {
    throw redirectError(
      "invalid_scope",
      "Requested scope exceeds this client's registered scopes.",
      redirectUri,
      state,
    );
  }
  const codeChallenge = query.get("code_challenge") ?? undefined;
  const challengeMethod = query.get("code_challenge_method");
  if (codeChallenge !== undefined || client.tokenEndpointAuthMethod === "none") {
    if (challengeMethod !== "S256") {
      throw redirectError("invalid_request", "PKCE with code_challenge_method=S256 is required.", redirectUri, state);
    }
    if (!isValidCodeChallenge(codeChallenge)) {
      throw redirectError("invalid_request", "Invalid code_challenge.", redirectUri, state);
    }
  }
  const resource = query.get("resource") ?? undefined;
  if (resource !== undefined && !/^https?:\/\//.test(resource)) {
    throw redirectError("invalid_target", "resource must be an absolute URI.", redirectUri, state);
  }
  // RFC 8707: this AS serves exactly one protected resource; minting a token
  // for any other audience would let the code reach a different API.
  const servedResource = `${deps.config.issuer}/mcp`;
  if (resource !== undefined && resource !== servedResource) {
    throw redirectError(
      "invalid_target",
      `This authorization server only serves ${servedResource}.`,
      redirectUri,
      state,
    );
  }
  return { request: { clientId, redirectUri, scope, state, codeChallenge, resource }, client };
}

/** Looks up a registered client, auto-registering CIMD clients on first sight. */
export async function resolveClient(
  clientId: string,
  deps: Pick<AuthorizeDependencies, "config" | "clients" | "cimd">,
): Promise<OAuthClientRecord | undefined> {
  const known = await deps.clients.get(clientId);
  if (known) {
    return known;
  }
  if (!deps.config.allowClientIdMetadataDocuments || !deps.cimd || !clientId.startsWith("https://")) {
    return undefined;
  }
  const metadata = await deps.cimd.resolve(clientId);
  const record: OAuthClientRecord = {
    clientId,
    clientName: metadata.clientName,
    registrationType: "cimd",
    redirectUris: metadata.redirectUris,
    scopes: metadata.scopes,
    tokenEndpointAuthMethod: "none",
    metadataDocumentUrl: clientId,
    createdAt: new Date().toISOString(),
  };
  await deps.clients.add(record);
  return record;
}

function redirectError(code: string, description: string, redirectUri: string, state?: string): AuthorizeError {
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("error", code);
  redirect.searchParams.set("error_description", description);
  if (state) {
    redirect.searchParams.set("state", state);
  }
  return new AuthorizeError(code, description, redirect);
}

function consentDescription(request: AuthorizeRequest, client: OAuthClientRecord): ConsentDescription {
  let redirectHost: string;
  try {
    redirectHost = new URL(request.redirectUri).host || request.redirectUri;
  } catch {
    redirectHost = request.redirectUri;
  }
  return {
    clientId: client.clientId,
    clientName: client.clientName,
    clientDomain:
      client.registrationType === "cimd" ? hostOf(client.metadataDocumentUrl ?? client.clientId) : undefined,
    redirectUri: request.redirectUri,
    redirectHost,
    redirectIsLoopback: isLoopbackRedirect(request.redirectUri),
    scope: request.scope,
  };
}

function hostOf(value: string): string | undefined {
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

function isLoopbackRedirect(value: string): boolean {
  try {
    const { protocol, hostname } = new URL(value);
    return protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(hostname);
  } catch {
    return false;
  }
}

export async function createConsentHandle(request: AuthorizeRequest, deps: AuthorizeDependencies): Promise<string> {
  const key = await deps.keys.active();
  const { importJWK, SignJWT } = await jose();
  return new SignJWT({
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    scope: request.scope,
    state: request.state,
    codeChallenge: request.codeChallenge,
    resource: request.resource,
  })
    .setProtectedHeader({ alg: "ES256", kid: key.kid, typ: "JWT" })
    .setAudience(consentAudience)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + consentTtlSeconds)
    .sign(await importJWK(key.privateKeyJwk, "ES256"));
}

export async function readConsentHandle(handle: string, deps: AuthorizeDependencies): Promise<AuthorizeRequest> {
  let kid: string | undefined;
  try {
    const parsed = JSON.parse(Buffer.from(handle.split(".")[0], "base64url").toString("utf8")) as { kid?: unknown };
    if (typeof parsed.kid === "string") {
      kid = parsed.kid;
    }
  } catch {
    // Fall through to the shared rejection below.
  }
  const key = kid === undefined ? undefined : (await deps.keys.all()).find((candidate) => candidate.kid === kid);
  if (!key) {
    throw new AuthorizeError("invalid_request", "Unknown or expired consent handle.");
  }
  try {
    const { importJWK, jwtVerify } = await jose();
    const { payload } = await jwtVerify(handle, await importJWK(key.publicKeyJwk, "ES256"), {
      audience: consentAudience,
      algorithms: ["ES256"],
    });
    if (typeof payload.clientId !== "string" || typeof payload.redirectUri !== "string") {
      throw new Error("incomplete consent claims");
    }
    return {
      clientId: payload.clientId,
      redirectUri: payload.redirectUri,
      scope: Array.isArray(payload.scope) ? (payload.scope as string[]) : [],
      state: typeof payload.state === "string" ? payload.state : undefined,
      codeChallenge: typeof payload.codeChallenge === "string" ? payload.codeChallenge : undefined,
      resource: typeof payload.resource === "string" ? payload.resource : undefined,
    };
  } catch {
    throw new AuthorizeError("invalid_request", "Unknown or expired consent handle.");
  }
}

export async function handleAuthorizeGet(context: Context, deps: AuthorizeDependencies): Promise<Response> {
  const url = new URL(context.req.url);
  const htmlError = (status: number, message: string): Response =>
    new Response(
      `<!doctype html><html lang="en"><body><p>${message.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</p></body></html>`,
      {
        status,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );
  if (!deps.adminToken) {
    return htmlError(503, "Administrator authentication is required for MCP OAuth.");
  }
  let parsed: { request: AuthorizeRequest; client: OAuthClientRecord };
  try {
    parsed = await parseAuthorizeRequest(url.searchParams, deps);
  } catch (error) {
    if (error instanceof AuthorizeError && error.redirectTo) {
      return new Response(null, { status: 302, headers: { location: error.redirectTo.toString() } });
    }
    return htmlError(
      error instanceof AuthorizeError ? 400 : 500,
      error instanceof Error ? error.message : "Invalid request.",
    );
  }
  const handle = await createConsentHandle(parsed.request, deps);
  const grantedScopes = parsed.request.scope;
  const page = renderMcpConsentPage(consentDescription(parsed.request, parsed.client), handle, grantedScopes);
  return new Response(page, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Chrome applies form-action to the POST's redirect as well as its target.
      "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(parsed.request.redirectUri).origin}; base-uri 'none'; frame-ancestors 'none'`,
      "referrer-policy": "same-origin",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function handleAuthorizePost(context: Context, deps: AuthorizeDependencies): Promise<Response> {
  const htmlError = (status: number, message: string): Response =>
    new Response(
      `<!doctype html><html lang="en"><body><p>${message.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</p></body></html>`,
      {
        status,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );
  const origin = context.req.header("origin");
  // Compare against the issuer origin, not context.req.url: behind a
  // TLS-terminating proxy the server sees http:// while browsers send an
  // https:// Origin header.
  if (origin !== new URL(deps.config.issuer).origin) {
    return htmlError(403, "Invalid request origin.");
  }
  const contentType = context.req.header("content-type") ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return htmlError(415, "Expected a form submission.");
  }
  const form = new URLSearchParams(await context.req.text());
  const handle = form.get("handle") ?? "";
  if (!deps.adminToken) {
    return htmlError(503, "Administrator authentication is required for MCP OAuth.");
  }
  let request: AuthorizeRequest;
  try {
    request = await readConsentHandle(handle, deps);
  } catch (error) {
    return htmlError(400, error instanceof Error ? error.message : "Unknown or expired consent handle.");
  }
  // Re-validate against current state: a consent handle is a claim, never an
  // authorization decision. The client could have been deleted mid-flow.
  let client: OAuthClientRecord | undefined;
  try {
    client = await resolveClient(request.clientId, deps);
  } catch {
    client = undefined;
  }
  if (!client || !redirectUriMatches(client.redirectUris, request.redirectUri)) {
    return htmlError(400, "This client or its redirect URI is no longer registered.");
  }
  const state = request.state;
  const completeRedirect = (params: Record<string, string>): Response => {
    const redirect = new URL(request.redirectUri);
    for (const [key, value] of Object.entries(params)) {
      redirect.searchParams.set(key, value);
    }
    if (state !== undefined) {
      redirect.searchParams.set("state", state);
    }
    redirect.searchParams.set("iss", deps.config.issuer);
    return new Response(null, { status: 302, headers: { location: redirect.toString() } });
  };
  if (form.get("decision") === "deny") {
    return completeRedirect({
      error: "access_denied",
      error_description: "The administrator denied this request.",
    });
  }
  if (form.get("decision") !== "approve") {
    return htmlError(400, "Choose Allow or Deny.");
  }
  if (!constantTimeEqual(form.get("admin_token") ?? "", deps.adminToken)) {
    return htmlError(401, "Invalid administrator token. Go back and try again.");
  }
  // Serialize grant + code minting with client deletion (shared per-client
  // lock): the client was validated above, but a deletion could land between
  // that check and the code insert, leaving an exchangeable code for a
  // deleted client. Inside the lock, re-check and only then mint.
  return withClientLock(request.clientId, async () => {
    const current = await deps.clients.get(request.clientId);
    if (!current || !redirectUriMatches(current.redirectUris, request.redirectUri)) {
      return htmlError(400, "This client or its redirect URI is no longer registered.");
    }
    if (request.scope.some((scope) => !current.scopes.includes(scope))) {
      return completeRedirect({
        error: "invalid_scope",
        error_description: "Requested scope exceeds this client's registered scopes.",
      });
    }
    const backing = await deps.runtimeTokens.createToken(`MCP OAuth • ${current.clientName.slice(0, 120)}`, {
      // No additional restriction: authorization is governed by the deployment
      // and runtime policy layers, exactly like a manually created token.
      allowedActions: [],
      blockedActions: [],
      allowedProxies: [],
      allowedConnections: [],
      allowedTriggers: [],
    });
    const code = randomToken(32);
    try {
      await deps.codes.add({
        codeHash: hashToken(code),
        clientId: current.clientId,
        redirectUri: request.redirectUri,
        scope: request.scope.join(" "),
        codeChallenge: request.codeChallenge,
        resource: request.resource,
        runtimeTokenId: backing.record.id,
        issuedAt: new Date().toISOString(),
        expiresAt: Date.now() + deps.config.authorizationCodeTtlSeconds * 1000,
      });
    } catch (error) {
      await deps.runtimeTokens.revokeToken(backing.record.id);
      throw error;
    }
    return completeRedirect({ code });
  });
}
