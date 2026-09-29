import type { RemoteHttpFailure } from "../core/remote-http.ts";
import type { ProxyRequestInput, ProxyResponse } from "../core/types.ts";
import type { ManagedProject } from "../server/storage/saas-project-store.ts";
import type { z } from "zod";

import { optionalRecord, optionalString } from "../core/cast.ts";
import {
  isFailureEnvelope,
  isSuccessEnvelope,
  readRemoteJson,
  RemoteHttpError,
  requestRemote,
} from "../core/remote-http.ts";
import { assertPublicHttpUrl, encodePathSegment } from "../core/request.ts";

export interface SaasProviderConfig {
  id: string;
  service: string;
  displayName: string;
  callbackUrl: string;
  effectiveScopes: string[];
  actionIds: string[];
  proxyAvailable: boolean;
}
export interface SaasDiscovery {
  projectId: string;
  providerConfigs: SaasProviderConfig[];
}
export interface SaasAccount extends SaasAccountSelector {
  projectId: string;
  service: string;
  alias: string | null;
  status: "active" | "reauth_required" | "error" | "disconnected";
  providerAccountId: string | null;
  accountLabel: string | null;
  scopes: string[];
}
export interface SaasConnectionRequest {
  id: string;
  status: "initiated" | "connected" | "failed" | "expired";
  projectId: string;
  providerConfigId: string;
  externalUserId: string;
  service: string;
  alias: string | null;
  authorizationUrl: string;
  connectedAccountId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  expiresAt: string;
  createdAt: number;
  updatedAt: number;
}

export class SaasError extends Error {
  readonly code: string;
  readonly status: 400 | 402 | 403 | 404 | 409 | 413 | 429 | 500 | 501 | 502 | 503 | 504;
  readonly retryAfter?: string;
  readonly reason?: string;
  connectionRequestId?: string;
  remoteExecutionId?: string;

  constructor(code: string, message: string, status: SaasError["status"] = 400, retryAfter?: string, reason?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
    this.reason = reason;
  }
}

export interface SaasAccountSelector {
  providerConfigId: string;
  externalUserId: string;
  connectedAccountId: string;
}

export interface SaasLinkInput {
  providerConfigId: string;
  externalUserId: string;
  alias: string;
  returnUri: string;
}

export interface SaasActionResult {
  executionId: string;
  actionId: string;
  output: unknown;
}

export interface SaasProxyResult {
  executionId: string;
  response: ProxyResponse;
}

const executionErrors: Record<string, { status: SaasError["status"]; message: string }> = {
  invalid_input: { status: 400, message: "SaaS rejected the action or proxy input. Check the remote schema." },
  scope_missing: { status: 403, message: "The SaaS account is missing required scopes." },
  policy_denied: { status: 403, message: "SaaS execution policy denied this request." },
  credential_expired: { status: 409, message: "The SaaS account requires reauthorization." },
  app_not_ready: { status: 409, message: "The SaaS account is not ready for execution." },
  connected_account_not_found: { status: 404, message: "The selected SaaS account was not found." },
  provider_config_not_found: { status: 404, message: "The selected SaaS provider configuration was not found." },
  provider_not_found: { status: 404, message: "The requested SaaS provider was not found." },
  provider_not_configured: { status: 503, message: "The SaaS provider is not configured." },
  proxy_not_supported: { status: 501, message: "This SaaS connection does not support proxy execution." },
  proxy_upstream_error: { status: 502, message: "The SaaS proxy upstream request failed." },
  proxy_upstream_timeout: { status: 504, message: "The SaaS proxy upstream request timed out." },
  proxy_response_too_large: { status: 502, message: "The SaaS proxy response exceeded its size limit." },
  rate_limited: { status: 429, message: "SaaS execution was rate limited." },
  insufficient_credit: { status: 402, message: "SaaS execution has insufficient credit." },
  provider_error: { status: 502, message: "The SaaS provider request failed." },
};

const remoteFailureMessages: Record<RemoteHttpFailure, string> = {
  invalid_url:
    "Connect blocked the SaaS address because the URL or its DNS result is not allowed. Check proxy Fake-IP and DNS settings: the SaaS hostname must resolve to a public IP address. Trusted-host overrides are not supported for SaaS requests.",
  dns: "Connect could not resolve the SaaS hostname. Check DNS and network settings on the machine running Connect.",
  network:
    "Connect could not complete the SaaS network request. Check connectivity, proxy settings and TLS certificates on the machine running Connect.",
  redirect: "SaaS returned an HTTP redirect. Redirects are blocked to protect the project key. Check the SaaS address.",
  invalid_json:
    "SaaS returned a response that is not valid UTF-8 JSON. Check the SaaS endpoint and any intervening proxy or login page.",
  too_large: "SaaS returned a response exceeding the 4 MiB limit for project and account requests.",
};

/** Reject values that the project proxy protocol cannot represent before any remote request. */
export async function parseSaasProxyRequest(input: unknown): Promise<ProxyRequestInput> {
  const { proxyInputSchema } = await getSchemas();
  try {
    const result = proxyInputSchema.safeParse(input);
    if (result.success) {
      const headers = new Headers(result.data.headers);
      if (
        ["authorization", "proxy-authorization", "cookie", "set-cookie", "host", "x-api-key"].some((name) =>
          headers.has(name),
        )
      )
        throw new Error("Authentication headers are not supported.");
      const contentType = headers.get("content-type");
      if (contentType && !supportsProxyContentType(contentType))
        throw new Error("Only JSON and text bodies are supported.");
      return result.data;
    }
  } catch {
    // Cyclic or excessively nested non-HTTP inputs cannot be serialized as JSON.
  }
  throw new SaasError(
    "invalid_input",
    "SaaS proxy supports only GET/POST/PUT/PATCH/DELETE, primitive query values, non-authentication string headers and UTF-8 JSON or text bodies; unknown fields are not allowed.",
  );
}

/** The project API never supplies credentials to the local provider runtime. */
export class SaasClient {
  private readonly fetcher?: typeof fetch;

  constructor(fetcher?: typeof fetch) {
    this.fetcher = fetcher;
  }

  async discover(project: Pick<ManagedProject, "baseUrl" | "apiKey">, signal?: AbortSignal): Promise<SaasDiscovery> {
    const { discoverySchema } = await getSchemas();
    const discovery = await this.request(project, "/oauth/provider-configs", discoverySchema, { signal });
    if (new Set(discovery.providerConfigs.map((config) => config.id)).size !== discovery.providerConfigs.length)
      throw new SaasError("oauth_source_protocol_error", "SaaS discovery contains duplicate configuration IDs.", 502);
    return discovery;
  }

  async getAccount(
    project: ManagedProject,
    selector: SaasAccountSelector,
    service: string,
    signal?: AbortSignal,
  ): Promise<SaasAccount> {
    const { accountSchema } = await getSchemas();
    const account = await this.request(
      project,
      `/connected-accounts/${encodePathSegment(selector.connectedAccountId)}`,
      accountSchema,
      { signal },
    );
    if (
      account.projectId !== project.projectId ||
      account.providerConfigId !== selector.providerConfigId ||
      account.externalUserId !== selector.externalUserId ||
      account.connectedAccountId !== selector.connectedAccountId ||
      account.service !== service
    )
      throw new SaasError("oauth_source_mismatch", "SaaS account does not match the requested identity.", 409);
    return account;
  }

  async getRequest(project: ManagedProject, id: string, signal?: AbortSignal): Promise<SaasConnectionRequest> {
    const { requestSchema } = await getSchemas();
    const request = await this.request(project, `/connection-requests/${encodePathSegment(id)}`, requestSchema, {
      signal,
    });
    if (request.projectId !== project.projectId || request.id !== id)
      throw new SaasError("oauth_source_mismatch", "SaaS authorization request identity does not match.", 409);
    return request;
  }

  async createLink(
    project: ManagedProject,
    input: SaasLinkInput,
    signal?: AbortSignal,
  ): Promise<SaasConnectionRequest> {
    const { requestSchema } = await getSchemas();
    const result = await this.request(project, "/connected-accounts/link", requestSchema, {
      method: "POST",
      signal,
      body: JSON.stringify({
        providerConfigId: input.providerConfigId,
        userId: input.externalUserId,
        alias: input.alias,
        returnUri: input.returnUri,
      }),
    });
    if (
      result.projectId !== project.projectId ||
      result.providerConfigId !== input.providerConfigId ||
      result.externalUserId !== input.externalUserId ||
      result.alias !== input.alias
    )
      throw new SaasError("oauth_source_mismatch", "SaaS authorization request identity does not match.", 409);
    const authorizationUrl = new URL(result.authorizationUrl);
    if (
      authorizationUrl.protocol !== "https:" ||
      authorizationUrl.username ||
      authorizationUrl.password ||
      authorizationUrl.origin !== new URL(project.baseUrl).origin
    )
      throw new SaasError("oauth_source_protocol_error", "SaaS authorization URL must use the configured origin.", 502);
    return result;
  }

  async deleteAccount(project: ManagedProject, selector: SaasAccountSelector, signal?: AbortSignal): Promise<void> {
    const { z, identifier } = await getSchemas();
    const query = new URLSearchParams({ providerConfigId: selector.providerConfigId, userId: selector.externalUserId });
    const result = await this.request(
      project,
      `/connected-accounts/${encodePathSegment(selector.connectedAccountId)}?${query}`,
      z.strictObject({ connectedAccountId: identifier, deleted: z.literal(true) }),
      { method: "DELETE", signal },
    );
    if (result.connectedAccountId !== selector.connectedAccountId)
      throw new SaasError("oauth_source_mismatch", "SaaS deletion result identity does not match.", 409);
  }

  async executeAction(
    project: ManagedProject,
    selector: SaasAccountSelector,
    actionId: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<SaasActionResult> {
    const { z, actionResultSchema } = await getSchemas();
    const envelope = await this.requestEnvelope(
      project,
      `/actions/${encodePathSegment(actionId)}`,
      z.object({ success: z.literal(true), data: actionResultSchema }),
      {
        method: "POST",
        signal,
        body: JSON.stringify({
          providerConfigId: selector.providerConfigId,
          userId: selector.externalUserId,
          connectedAccountId: selector.connectedAccountId,
          input,
        }),
      },
      true,
    );
    if (envelope.data.actionId !== actionId || !("output" in envelope.data))
      throw new SaasError("oauth_source_protocol_error", "SaaS returned an incompatible action result.", 502);
    return envelope.data;
  }

  async executeProxy(
    project: ManagedProject,
    selector: SaasAccountSelector,
    service: string,
    request: ProxyRequestInput,
    signal?: AbortSignal,
  ): Promise<SaasProxyResult> {
    const { proxyResultSchema } = await getSchemas();
    const envelope = await this.requestEnvelope(
      project,
      `/proxy/${encodePathSegment(service)}`,
      proxyResultSchema,
      {
        method: "POST",
        signal,
        body: JSON.stringify({
          providerConfigId: selector.providerConfigId,
          userId: selector.externalUserId,
          connectedAccountId: selector.connectedAccountId,
          request: {
            endpoint: request.endpoint,
            method: request.method,
            query: request.query,
            headers: request.headers,
            body: request.body,
          },
        }),
      },
      true,
    );
    if (envelope.meta.service !== service || !("data" in envelope.data))
      throw new SaasError("oauth_source_protocol_error", "SaaS returned an incompatible proxy result.", 502);
    let contentType: string | null;
    try {
      contentType = new Headers(envelope.data.headers).get("content-type");
    } catch {
      throw new SaasError("oauth_source_protocol_error", "SaaS returned invalid proxy headers.", 502);
    }
    if (contentType && !supportsProxyContentType(contentType))
      throw new SaasError(
        "oauth_source_protocol_error",
        "SaaS proxy supports only JSON and UTF-8 text responses.",
        502,
      );
    return { executionId: envelope.meta.executionId, response: envelope.data };
  }

  private async request<T>(
    project: Pick<ManagedProject, "baseUrl" | "apiKey">,
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit,
  ): Promise<T> {
    const { z } = await getSchemas();
    const envelope = await this.requestEnvelope(
      project,
      path,
      z.object({ success: z.literal(true), data: schema }),
      init,
    );
    return envelope.data;
  }

  private async requestEnvelope<T>(
    project: Pick<ManagedProject, "baseUrl" | "apiKey">,
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit,
    execution = false,
  ): Promise<T> {
    const { executionFailureSchema, executionIdentifier } = await getSchemas();
    try {
      return await requestRemote(
        {
          url: `${project.baseUrl}/v1/saas${path}`,
          label: "SaaS",
          timeoutMs: execution ? 300_000 : 30_000,
          fetcher: this.fetcher,
          init: { ...init, headers: { authorization: `Bearer ${project.apiKey}`, "content-type": "application/json" } },
        },
        async (response, signal) => {
          const json = await readRemoteJson(response, {
            label: "SaaS response",
            maxBytes: (execution ? 64 : 4) * 1024 * 1024,
            signal,
          }).catch((error: unknown) => {
            if (!response.ok && error instanceof RemoteHttpError && error.kind === "invalid_json") return undefined;
            throw error;
          });
          const failure = execution && !response.ok ? executionFailureSchema.safeParse(json) : undefined;
          if (execution && (failure?.success || isFailureEnvelope(json))) {
            const errorCode = failure?.success
              ? failure.data.errorCode
              : optionalString(optionalRecord(json)?.errorCode)!;
            const known = Object.hasOwn(executionErrors, errorCode) ? executionErrors[errorCode] : undefined;
            const error = new SaasError(
              known ? errorCode : "oauth_source_unavailable",
              known?.message ?? "SaaS execution failed.",
              known?.status ?? 502,
              readRetryAfter(response),
            );
            const remoteId = executionIdentifier.safeParse(
              failure?.success ? failure.data.executionId : optionalRecord(optionalRecord(json)?.meta)?.executionId,
            );
            if (remoteId.success) error.remoteExecutionId = remoteId.data;
            throw error;
          }
          if (!response.ok) {
            if (response.status === 401 || response.status === 403)
              throw new SaasError(
                "oauth_source_unauthorized",
                "SaaS project key was rejected. Update the project configuration.",
                503,
              );
            if (response.status === 404)
              throw new SaasError("oauth_source_not_found", "SaaS resource was not found.", 404);
            if (response.status === 429) {
              const retryAfter = readRetryAfter(response);
              throw new SaasError("oauth_source_rate_limited", "SaaS request was rate limited.", 429, retryAfter);
            }
            throw new SaasError(
              "oauth_source_unavailable",
              `SaaS returned HTTP ${response.status}. Check the SaaS service logs.`,
              502,
            );
          }
          if (!isSuccessEnvelope(json))
            throw new SaasError("oauth_source_protocol_error", "SaaS returned an invalid response envelope.", 502);
          const result = schema.safeParse(json);
          if (!result.success)
            throw new SaasError(
              "oauth_source_protocol_error",
              "SaaS returned fields that do not match the expected API contract. Check that the deployed SaaS version supports this Connect version.",
              502,
            );
          return result.data;
        },
      );
    } catch (error) {
      init.signal?.throwIfAborted();
      if (error instanceof SaasError) throw error;
      if (error instanceof Error && error.name === "TimeoutError")
        throw new SaasError("oauth_source_unavailable", "SaaS request timed out.", 504, undefined, "timeout");
      if (execution && error instanceof RemoteHttpError && error.kind === "too_large")
        throw new SaasError(
          "oauth_source_response_too_large",
          "SaaS execution response exceeds the 64 MiB JSON limit.",
          502,
        );
      if (error instanceof RemoteHttpError)
        throw new SaasError("oauth_source_unavailable", remoteFailureMessages[error.kind], 502, undefined, error.kind);
      throw error;
    }
  }
}

export function normalizeSaasBaseUrl(value: string): string {
  const url = assertPublicHttpUrl(value, {
    fieldName: "SaaS baseUrl",
    createError: () => new SaasError("invalid_input", "SaaS baseUrl must be a public HTTPS origin."),
  });
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new SaasError("invalid_input", "SaaS baseUrl must be a public HTTPS origin.");
  return url.origin;
}

function readRetryAfter(response: Response): string | undefined {
  const header = optionalString(response.headers.get("retry-after"));
  return header && (/^\d+$/.test(header) || Number.isFinite(Date.parse(header))) ? header : undefined;
}

function supportsProxyContentType(value: string): boolean {
  const [mediaType, ...parameters] = value
    .toLowerCase()
    .split(";")
    .map((part) => part.trim());
  if (!(mediaType!.startsWith("text/") || mediaType === "application/json" || mediaType!.endsWith("+json")))
    return false;
  return parameters
    .filter((part) => /^charset\s*=/.test(part))
    .every((part) => {
      const charset = part
        .slice(part.indexOf("=") + 1)
        .trim()
        .replace(/^"|"$/g, "");
      return charset === "utf-8" || charset === "utf8" || charset === "us-ascii";
    });
}

let schemasPromise: ReturnType<typeof createSchemas> | undefined;

function getSchemas(): ReturnType<typeof createSchemas> {
  return (schemasPromise ??= createSchemas());
}

async function createSchemas() {
  const { z } = await import("zod");
  const identifier = z.string().min(1);
  const providerConfigSchema: z.ZodType<SaasProviderConfig> = z.strictObject({
    id: identifier,
    service: identifier,
    displayName: z.string(),
    callbackUrl: z.url({ protocol: /^https?$/ }),
    effectiveScopes: z.array(identifier),
    actionIds: z.array(identifier),
    proxyAvailable: z.boolean(),
  });
  const discoverySchema: z.ZodType<SaasDiscovery> = z.strictObject({
    projectId: identifier,
    providerConfigs: z.array(providerConfigSchema),
  });
  const accountSchema: z.ZodType<SaasAccount> = z.strictObject({
    projectId: identifier,
    providerConfigId: identifier,
    service: identifier,
    externalUserId: identifier,
    connectedAccountId: identifier,
    alias: z.string().nullable(),
    status: z.enum(["active", "reauth_required", "error", "disconnected"]),
    providerAccountId: z.string().nullable(),
    accountLabel: z.string().nullable(),
    scopes: z.array(z.string()),
  });
  const requestSchema: z.ZodType<SaasConnectionRequest> = z
    .strictObject({
      id: identifier,
      status: z.enum(["initiated", "connected", "failed", "expired"]),
      projectId: identifier,
      providerConfigId: identifier,
      externalUserId: identifier,
      service: identifier,
      alias: z.string().nullable(),
      authorizationUrl: z.url({ protocol: /^https$/ }),
      connectedAccountId: identifier.nullable(),
      errorCode: z.string().nullable(),
      errorMessage: z.string().nullable(),
      expiresAt: z.iso.datetime(),
      createdAt: z.number().finite(),
      updatedAt: z.number().finite(),
    })
    .refine((value) => value.status !== "connected" || value.connectedAccountId !== null);

  const executionIdentifier = z
    .string()
    .min(1)
    .max(256)
    .regex(/^[a-zA-Z0-9_.:-]+$/);
  const actionResultSchema = z.strictObject({
    executionId: executionIdentifier,
    actionId: identifier,
    output: z.unknown(),
  });
  const proxyResultSchema = z.object({
    success: z.literal(true),
    data: z.strictObject({
      status: z.number().int().min(200).max(599),
      headers: z.record(z.string(), z.string()),
      data: z.unknown(),
    }),
    meta: z.object({ executionId: executionIdentifier, service: identifier }),
  });
  const proxyInputSchema = z.strictObject({
    endpoint: z.string().min(1),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    query: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.null()])).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.json().optional(),
  });
  const executionFailureSchema = z.object({
    errorCode: identifier,
    errorMessage: z.string(),
    executionId: executionIdentifier.optional(),
  });
  return {
    z,
    identifier,
    discoverySchema,
    accountSchema,
    requestSchema,
    actionResultSchema,
    proxyResultSchema,
    proxyInputSchema,
    executionFailureSchema,
    executionIdentifier,
  };
}
