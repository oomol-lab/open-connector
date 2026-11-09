import type { OAuthConnectionRequestInput, OAuthConnectionRequestStart } from "../oauth/oauth-flow-service.ts";
import type {
  ConnectionRequest,
  ConnectionRequestStore,
  SaasRequestLease,
} from "../server/storage/connection-request-store.ts";
import type { SaasProjectService } from "./saas-project-service.ts";

import { callbackReturnUri, validateReturnUri } from "../oauth/oauth-flow-service.ts";
import { SaasClient, SaasError } from "./saas-client.ts";

export interface SaasOAuthServiceOptions {
  projects: SaasProjectService;
  requests: ConnectionRequestStore;
  client: SaasClient;
}

export interface SaasSyncResult {
  request: ConnectionRequest;
  returnUri?: string;
}

/** One owner for bearer polling and browser synchronization; no network work runs inside a database transaction. */
export class SaasOAuthService {
  private readonly options: SaasOAuthServiceOptions;
  private readonly syncing = new Map<string, Promise<void>>();

  constructor(options: SaasOAuthServiceOptions) {
    this.options = options;
  }

  async assertLocalAuthorization(service: string): Promise<void> {
    if ((await this.options.projects.getSource(service)).mode === "saas")
      throw new SaasError("invalid_input", "Use /v1/connections/:service/connect for SaaS OAuth authorization.");
  }

  async start(input: OAuthConnectionRequestInput): Promise<OAuthConnectionRequestStart | undefined> {
    const source = input.target
      ? input.target.source === "saas"
        ? { mode: "saas" as const, ...input.target.reference }
        : { mode: "local" as const }
      : await this.options.projects.getSource(input.service);
    if (source.mode === "local") return undefined;
    if (input.authorizationOptionIds !== undefined || input.extra !== undefined || input.secretExtra !== undefined)
      throw new SaasError(
        "invalid_input",
        "Configure SaaS OAuth scopes and credentials on the SaaS provider config; per-request overrides are not supported.",
      );
    validateReturnUri(input.returnUri);
    const signal = input.signal
      ? AbortSignal.any([input.signal, AbortSignal.timeout(30_000)])
      : AbortSignal.timeout(30_000);
    const { project } = await this.options.projects.resolveConfig(
      input.service,
      source.providerConfigId,
      source.managedProjectId,
      signal,
    );
    const id = crypto.randomUUID();
    const completion = new URL("/oauth/saas/complete", this.options.projects.requireOrigin());
    completion.searchParams.set("request", id);
    const pending = {
      connectionRequestId: id,
      connectionId: input.target?.id ?? crypto.randomUUID(),
      owner: input.owner,
      service: input.service,
      connectionName: input.target?.connectionName ?? input.connectionName ?? crypto.randomUUID(),
      managedProjectId: project.id,
      providerConfigId: source.providerConfigId,
      externalUserId: await this.options.projects.externalUserId(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      returnUri: input.returnUri,
      target: input.target ? { id: input.target.id, revision: input.target.revision } : undefined,
      comment: input.target?.source === "saas" ? input.target.comment : null,
    };
    signal.throwIfAborted();
    const lease = await this.options.requests.createSaas(pending);
    try {
      const remote = await this.options.client.createLink(
        project,
        {
          providerConfigId: pending.providerConfigId,
          externalUserId: pending.externalUserId,
          alias: `connect-${id}`,
          returnUri: completion.toString(),
        },
        signal,
      );
      if (remote.service !== input.service)
        throw new SaasError("oauth_source_mismatch", "SaaS authorization service does not match.", 409);
      if (!(await this.options.requests.saveSaasRequest(lease, remote.id, remote.expiresAt)))
        throw new SaasError(
          "request_superseded",
          "This authorization request was replaced or its lease was lost.",
          409,
        );
      await this.options.requests.releaseSaas(lease, Date.now() + 2_000);
      return {
        connectionRequestId: id,
        stateHandle: id,
        status: "initiated",
        expiresAt: remote.expiresAt,
        authorizationUrl: remote.authorizationUrl,
      };
    } catch {
      await this.options.requests.failSaas(
        lease,
        "oauth_source_result_unknown",
        "Authorization creation could not be confirmed. Check SaaS accounts before starting again.",
      );
      const error = new SaasError(
        "oauth_source_result_unknown",
        "Authorization creation could not be confirmed. Check SaaS accounts before starting again.",
        502,
      );
      error.connectionRequestId = id;
      throw error;
    }
  }

  async sync(id: string, owner: string, signal?: AbortSignal): Promise<ConnectionRequest | undefined> {
    signal?.throwIfAborted();
    const key = `${owner}\0${id}`;
    let promise = this.syncing.get(key);
    if (!promise) {
      promise = this.advance(id, owner).finally(() => {
        this.syncing.delete(key);
      });
      this.syncing.set(key, promise);
    }
    if (!signal) await promise;
    else {
      const onAbort = (): void => rejectAbort(signal.reason);
      let rejectAbort!: (reason: unknown) => void;
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectAbort = reject;
        signal.addEventListener("abort", onAbort, { once: true });
      });
      try {
        await Promise.race([promise, aborted]);
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    }
    signal?.throwIfAborted();
    return this.options.requests.get(id, owner);
  }

  async syncForBrowser(id: string, owner: string, signal?: AbortSignal): Promise<SaasSyncResult | undefined> {
    const request = await this.sync(id, owner, signal);
    if (!request) return undefined;
    const uri = await this.options.requests.getSaasReturnUri(id, owner);
    const returnUri =
      uri && (request.status === "connected" || request.status === "failed")
        ? callbackReturnUri(
            { returnUri: uri, service: request.service },
            request.status === "connected" ? "success" : "error",
            request.errorCode ?? undefined,
            request.errorMessage ?? undefined,
          )
        : undefined;
    return { request, returnUri };
  }

  private async advance(id: string, owner: string): Promise<void> {
    const signal = AbortSignal.timeout(30_000);
    signal.throwIfAborted();
    const lease = await this.options.requests.claimSaas(id, owner);
    if (!lease) return;
    try {
      signal.throwIfAborted();
      if (lease.phase === "creating") {
        await this.options.requests.failSaas(
          lease,
          "oauth_source_result_unknown",
          "Authorization creation could not be confirmed. Check SaaS accounts before starting again.",
        );
        return;
      }
      if (lease.candidate) {
        signal.throwIfAborted();
        await this.options.requests.completeSaas(lease);
        return;
      }
      const pending = lease.pending;
      const project = await this.options.projects.requireProject(pending.managedProjectId);
      const remote = await this.options.client.getRequest(project, lease.remoteRequestId!, signal);
      if (
        remote.providerConfigId !== pending.providerConfigId ||
        remote.externalUserId !== pending.externalUserId ||
        remote.service !== pending.service ||
        remote.alias !== `connect-${pending.connectionRequestId}`
      )
        throw new SaasError(
          "oauth_source_mismatch",
          "SaaS authorization result does not match the saved request.",
          409,
        );
      if (remote.status === "initiated") {
        await this.options.requests.releaseSaas(lease, Date.now() + 2_000);
        return;
      }
      if (remote.status !== "connected") {
        await this.options.requests.failSaas(
          lease,
          "oauth_authorization_failed",
          "SaaS authorization failed or expired.",
        );
        return;
      }
      const account = await this.options.client.getAccount(
        project,
        {
          providerConfigId: pending.providerConfigId,
          externalUserId: pending.externalUserId,
          connectedAccountId: remote.connectedAccountId!,
        },
        pending.service,
        signal,
      );
      if (account.alias !== remote.alias)
        throw new SaasError(
          "oauth_source_mismatch",
          "SaaS account alias does not match this authorization attempt.",
          409,
        );
      if (account.status !== "active" && account.status !== "reauth_required") {
        await this.options.requests.failSaas(lease, "oauth_authorization_failed", "The SaaS account is not available.");
        return;
      }
      signal.throwIfAborted();
      if (
        !(await this.options.requests.saveSaasCandidate(lease, {
          connectedAccountId: account.connectedAccountId,
          profile: {
            accountId: account.providerAccountId ?? account.connectedAccountId,
            displayName: account.accountLabel ?? account.service,
            grantedScopes: account.scopes,
          },
          status: account.status,
          comment: pending.comment ?? null,
        }))
      )
        return;
      signal.throwIfAborted();
      await this.options.requests.completeSaas(lease);
    } catch (error) {
      if (
        error instanceof SaasError &&
        (error.code === "oauth_source_mismatch" || error.code === "oauth_source_protocol_error")
      ) {
        await this.options.requests.failSaas(lease, error.code, error.message);
      } else {
        await this.options.requests.releaseSaas(lease, this.nextPollAt(lease, error), true);
      }
      if (signal.aborted)
        throw new SaasError("oauth_source_unavailable", "SaaS authorization synchronization timed out.", 504);
      throw error;
    }
  }

  private nextPollAt(lease: SaasRequestLease, error: unknown): number {
    let delay = Math.min(30_000, 2_000 * 2 ** Math.min(lease.pollAttempts, 4));
    if (error instanceof SaasError && error.retryAfter) {
      const seconds = Number(error.retryAfter);
      const retryAt = Number.isFinite(seconds) ? Date.now() + seconds * 1_000 : Date.parse(error.retryAfter);
      if (Number.isFinite(retryAt)) delay = Math.max(delay, retryAt - Date.now());
    }
    return Date.now() + delay;
  }
}
