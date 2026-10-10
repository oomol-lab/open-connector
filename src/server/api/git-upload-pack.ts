import type { ConnectionService } from "../../connection-service.ts";
import type { ActionPolicySnapshot } from "../../core/action-policy.ts";
import type { RuntimeLogger } from "../../core/types.ts";
import type { LocalAuthOptions } from "./auth.ts";
import type { Context } from "hono";

import { ConnectionError } from "../../connection-service.ts";
import { providerFetch } from "../../providers/provider-runtime.ts";
import { hasConfiguredRuntimeBearer } from "./auth.ts";
import { jsonError } from "./http-utils.ts";

type GitOperation = "advertise" | "upload";

export interface GitUploadPackDependencies {
  auth: LocalAuthOptions;
  connections: ConnectionService;
  getPolicy: () => Promise<ActionPolicySnapshot>;
  logger?: RuntimeLogger;
  fetcher?: typeof fetch;
  resolveInstallationToken?: (installationId: string, signal?: AbortSignal) => Promise<string>;
  /** The git-connections route accepts a Core-authorized connection. */
  selectedConnection?: boolean;
}

const repositoryPart = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;
const identifier = /^[A-Za-z0-9_-]{1,128}$/u;
const operationIdentifier = /^[A-Za-z0-9_-]{1,128}$/u;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/**
 * The configured runtime bearer belongs to the trusted OpenMeld Remote Agent.
 * It verifies the requester and selected repository through Core on every exchange.
 * The legacy route derives the member connection. git-connections requires the scope and alias
 * selected by Core. Neither endpoint accepts credentials from the Computer.
 */
export async function handleGitUploadPack(
  context: Context,
  input: GitUploadPackDependencies & { operation: GitOperation; owner: string; repo: string },
): Promise<Response> {
  if (!hasConfiguredRuntimeBearer(context, input.auth)) {
    return jsonError(context, 401, "unauthorized", "The OpenMeld Git transfer requires runtime authentication.");
  }
  let policy: ActionPolicySnapshot;
  try {
    policy = await input.getPolicy();
  } catch {
    return jsonError(context, 503, "git_policy_unavailable", "GitHub transfer policy is temporarily unavailable.");
  }
  if (!policy.evaluateProxy("github").allowed) {
    return jsonError(context, 403, "git_proxy_not_allowed", "GitHub transfer is blocked by connector policy.");
  }

  const organizationId = context.req.header("x-openmeld-organization-id") ?? "";
  const requesterUserId = context.req.header("x-openmeld-requester-user-id") ?? "";
  const operationId = context.req.header("x-openmeld-operation-id") ?? "";
  if (!identifier.test(organizationId) || !identifier.test(requesterUserId) || !operationIdentifier.test(operationId)) {
    return jsonError(context, 400, "invalid_git_request", "A verified requester and operation are required.");
  }
  if (
    !repositoryPart.test(input.owner) ||
    !repositoryPart.test(input.repo) ||
    input.owner === "." ||
    input.repo === "." ||
    input.repo === ".."
  ) {
    return jsonError(context, 400, "invalid_git_repository", "Select one exact GitHub repository.");
  }
  if (context.req.header("x-openmeld-repository") !== `${input.owner}/${input.repo}`) {
    return jsonError(context, 400, "git_repository_mismatch", "The Git transfer repository does not match its grant.");
  }
  if (input.operation === "advertise") {
    const query = new URL(context.req.url).searchParams;
    if (query.size !== 1 || query.get("service") !== "git-upload-pack") {
      return jsonError(context, 400, "invalid_git_service", "Only git-upload-pack is available.");
    }
  } else if (
    context.req.header("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/x-git-upload-pack-request"
  ) {
    return jsonError(context, 400, "invalid_git_content_type", "A git-upload-pack request is required.");
  }
  const gitProtocol = context.req.header("git-protocol");
  if (gitProtocol && gitProtocol !== "version=2") {
    return jsonError(context, 400, "invalid_git_protocol", "Only Git protocol version 2 is supported.");
  }

  const scope = input.selectedConnection ? context.req.header("x-openmeld-connection-scope") : "member";
  if (scope !== "member" && scope !== "shared") {
    return jsonError(context, 400, "invalid_git_connection", "Select a member or shared GitHub connection.");
  }
  const connectionName =
    scope === "member"
      ? await requesterConnectionName(organizationId, requesterUserId)
      : `org_${await stableIdentifierHash(organizationId)}__shared__github`;
  if (input.selectedConnection && context.req.header("x-oo-connector-alias") !== connectionName) {
    return jsonError(context, 400, "git_connection_mismatch", "The Git connection does not match its owner.");
  }
  let credential: Awaited<ReturnType<ConnectionService["getCredential"]>>;
  try {
    credential = await input.connections.getCredential("github", connectionName);
  } catch (error) {
    input.logger?.warn(
      {
        errorCode: error instanceof ConnectionError ? error.code : "unknown",
        errorName: error instanceof Error ? error.name : "UnknownError",
        operationId,
      },
      "OpenMeld Git connection lookup failed",
    );
    return jsonError(
      context,
      503,
      "github_connection_lookup_unavailable",
      "The selected GitHub connection could not be checked right now.",
    );
  }
  if (
    !credential ||
    (scope === "shared"
      ? credential.authType !== "custom_credential"
      : credential.authType !== "oauth2" && credential.authType !== "api_key")
  ) {
    return jsonError(context, 404, "github_connection_unavailable", "The selected GitHub connection is unavailable.");
  }

  let token: string;
  if (credential.authType === "custom_credential") {
    try {
      if (!input.resolveInstallationToken) {
        return jsonError(context, 503, "github_installation_unavailable", "The GitHub installation is unavailable.");
      }
      token = await input.resolveInstallationToken(credential.values.installationId ?? "", context.req.raw.signal);
    } catch {
      return jsonError(context, 503, "github_installation_unavailable", "The GitHub installation is unavailable.");
    }
  } else if (credential.authType === "oauth2") {
    token = credential.accessToken;
  } else if (credential.authType === "api_key") {
    token = credential.apiKey;
  } else {
    return jsonError(context, 404, "github_connection_unavailable", "The selected GitHub connection is unavailable.");
  }
  const suffix = input.operation === "advertise" ? "/info/refs?service=git-upload-pack" : "/git-upload-pack";
  const url = `https://github.com/${input.owner}/${input.repo}.git${suffix}`;
  const headers = new Headers({
    authorization: `Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
    accept:
      input.operation === "advertise"
        ? "application/x-git-upload-pack-advertisement"
        : "application/x-git-upload-pack-result",
  });
  if (gitProtocol) headers.set("git-protocol", gitProtocol);
  if (input.operation === "upload") {
    headers.set("content-type", "application/x-git-upload-pack-request");
    const contentEncoding = context.req.header("content-encoding");
    if (contentEncoding) headers.set("content-encoding", contentEncoding);
  }

  input.logger?.info(
    {
      organizationId,
      requesterUserId,
      operationId,
      repository: `${input.owner}/${input.repo}`,
      gitOperation: input.operation,
      connectionScope: scope,
    },
    "OpenMeld Git transfer started",
  );
  let upstream: Response;
  try {
    upstream = await (input.fetcher ?? providerFetch)(url, {
      method: input.operation === "advertise" ? "GET" : "POST",
      headers,
      body: input.operation === "upload" ? context.req.raw.body : undefined,
      redirect: "manual",
      signal: context.req.raw.signal,
      // Node fetch requires duplex for a streaming POST. Workers ignores it.
      ...(input.operation === "upload" ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch (error) {
    input.logger?.warn({ err: error, operationId }, "OpenMeld Git upstream request failed");
    return jsonError(context, 502, "git_upstream_unavailable", "GitHub transfer could not start.");
  }
  if (redirectStatuses.has(upstream.status)) {
    await upstream.body?.cancel();
    return jsonError(context, 502, "git_redirect_rejected", "GitHub redirected the Git transfer.");
  }
  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel();
    return jsonError(
      context,
      upstream.status === 404 ? 404 : 502,
      "git_upstream_rejected",
      "GitHub did not accept the Git transfer.",
    );
  }
  const expectedType =
    input.operation === "advertise"
      ? "application/x-git-upload-pack-advertisement"
      : "application/x-git-upload-pack-result";
  if (upstream.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== expectedType) {
    await upstream.body.cancel();
    return jsonError(context, 502, "git_upstream_protocol", "GitHub returned an unexpected Git response.");
  }
  input.logger?.info({ operationId, status: upstream.status }, "OpenMeld Git transfer accepted");
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": expectedType, "cache-control": "no-store" },
  });
}

async function requesterConnectionName(organizationId: string, requesterUserId: string): Promise<string> {
  const [organizationHash, userHash] = await Promise.all([
    stableIdentifierHash(organizationId),
    stableIdentifierHash(requesterUserId),
  ]);
  return `org_${organizationHash}__user_${userHash}__github`;
}

async function stableIdentifierHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("base64url").slice(0, 18);
}
