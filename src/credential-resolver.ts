import type { IConnectionStore, StoredLocalConnection } from "./connection-store.ts";
import type { ProviderHttpDispatchOptions } from "./core/provider-http-dispatch.ts";
import type { ResolvedCredential } from "./core/types.ts";
import type { IOAuthCredentialRefresher } from "./oauth/oauth-credential-refresh-service.ts";

import { ConnectionError } from "./connection-error.ts";
import { measureExecutionPhase } from "./core/execution-timing.ts";
import { oauthAuthorizationKey } from "./oauth/oauth-authorization-key.ts";
import { withProviderHttpDispatchResult } from "./providers/provider-runtime.ts";

type OAuthCredential = Extract<ResolvedCredential, { authType: "oauth2" }>;

interface CredentialResolverOptions {
  store: IConnectionStore;
  oauthCredentials?: IOAuthCredentialRefresher;
  providerHttpDispatch?: ProviderHttpDispatchOptions;
}

const OAUTH_REFRESH_PERSIST_ATTEMPTS = 3;

/**
 * Lays a refresh result onto the connection's current credential. A refresh owns the token
 * fields and the metadata keys it changed; everything else on `current` belongs to whoever
 * bumped the revision and is kept.
 */
function mergeRefreshedOAuthCredential(
  current: OAuthCredential,
  spent: OAuthCredential,
  refreshed: OAuthCredential,
): OAuthCredential {
  const metadata = { ...current.metadata };
  for (const [key, value] of Object.entries(refreshed.metadata)) {
    if (JSON.stringify(value) !== JSON.stringify(spent.metadata[key])) metadata[key] = value;
  }
  // A successful refresh proves the authorization is live, so a concurrent refusal's mark is stale.
  delete metadata.oauthReauthRequired;
  return {
    ...current,
    accessToken: refreshed.accessToken,
    tokenType: refreshed.tokenType,
    expiresAt: refreshed.expiresAt,
    refreshToken: refreshed.refreshToken,
    providerSecret: refreshed.providerSecret,
    metadata,
  };
}

/** Resolves stored credentials and owns refresh coalescing and revision-safe persistence. */
export class CredentialResolver {
  private readonly store: IConnectionStore;
  private readonly oauthCredentials?: IOAuthCredentialRefresher;
  private readonly providerHttpDispatch?: ProviderHttpDispatchOptions;
  private readonly oauthCredentialRefreshes = new Map<string, Promise<OAuthCredential>>();
  private readonly disconnectingConnections = new Set<string>();

  constructor(options: CredentialResolverOptions) {
    this.store = options.store;
    this.oauthCredentials = options.oauthCredentials;
    this.providerHttpDispatch = options.providerHttpDispatch;
  }

  async resolve(connection: StoredLocalConnection): Promise<ResolvedCredential> {
    return connection.credential.authType === "oauth2"
      ? this.resolveOAuthCredential(connection, connection.credential)
      : connection.credential;
  }

  /** Read an active refresh before deleting its connection, so revocation can use the rotated token. */
  getPendingRefresh(connection: StoredLocalConnection): Promise<OAuthCredential> | undefined {
    const credential = connection.credential;
    return credential.authType === "oauth2"
      ? this.oauthCredentialRefreshes.get(oauthRefreshKey(connection.id, credential))
      : undefined;
  }

  /** Keep new refreshes out of a disconnect while allowing an existing refresh to finish. */
  async withDisconnect<T>(connectionId: string | undefined, work: () => Promise<T>): Promise<T> {
    if (!connectionId) return work();
    if (this.disconnectingConnections.has(connectionId))
      throw new ConnectionError("connection_changed", "The connection is being disconnected.");
    this.disconnectingConnections.add(connectionId);
    try {
      return await work();
    } finally {
      this.disconnectingConnections.delete(connectionId);
    }
  }

  private async resolveOAuthCredential(
    connection: StoredLocalConnection,
    credential: OAuthCredential,
  ): Promise<OAuthCredential> {
    if (this.disconnectingConnections.has(connection.id))
      throw new ConnectionError("connection_changed", "The connection is being disconnected.");
    const service = connection.service;
    if (credential.metadata.oauthReauthRequired === true) {
      throw new ConnectionError(
        "oauth_reauth_required",
        `OAuth authorization is no longer valid. Reconnect ${service}.`,
      );
    }
    if (!isOAuthCredentialExpired(credential)) {
      return credential;
    }

    if (!credential.refreshToken) {
      throw new ConnectionError(
        "oauth_token_expired",
        `${service} OAuth access token expired and no refresh token is available. Reconnect ${service}.`,
      );
    }

    const refresher = this.oauthCredentials;
    if (!refresher) {
      throw new ConnectionError(
        "oauth_refresh_unavailable",
        `${service} OAuth access token expired and this runtime cannot refresh it.`,
      );
    }

    return measureExecutionPhase("oauthRefreshMs", async () => {
      // Single-flight on the refresh token being spent, not the row revision: a single-use
      // (rotating) refresh token must reach the provider once even when an unrelated write
      // bumps the revision mid-refresh. A new authorization must refresh independently,
      // even when the provider reuses the same refresh token across reconnects.
      const refreshKey = oauthRefreshKey(connection.id, credential);
      const currentRefresh = this.oauthCredentialRefreshes.get(refreshKey);
      if (currentRefresh) {
        return currentRefresh;
      }

      const refresh = this.refreshOAuthCredential(connection, credential, refresher);
      this.oauthCredentialRefreshes.set(refreshKey, refresh);
      try {
        return await refresh;
      } finally {
        if (this.oauthCredentialRefreshes.get(refreshKey) === refresh) {
          this.oauthCredentialRefreshes.delete(refreshKey);
        }
      }
    });
  }

  private async refreshOAuthCredential(
    connection: StoredLocalConnection,
    credential: OAuthCredential,
    refresher: IOAuthCredentialRefresher,
  ): Promise<OAuthCredential> {
    const retirementGeneration = await this.store.getRetirementGeneration(
      connection.service,
      connection.connectionName,
    );
    const selected = await this.store.get(connection.service, connection.connectionName);
    if (this.disconnectingConnections.has(connection.id)) {
      throw new ConnectionError("connection_changed", "The connection is being disconnected.");
    }
    if (
      selected?.source === "saas" ||
      selected?.id !== connection.id ||
      selected.credential.authType !== "oauth2" ||
      selected.credential.accessToken !== credential.accessToken ||
      selected.credential.refreshToken !== credential.refreshToken ||
      selected.credential.metadata.oauthAuthorizationId !== credential.metadata.oauthAuthorizationId
    ) {
      throw new ConnectionError(
        "connection_not_found",
        `${connection.service} connection changed before its OAuth credential could refresh.`,
      );
    }
    const { id, revision, service, connectionName } = selected;
    const spent = selected.credential;
    let nextCredential: OAuthCredential;
    try {
      nextCredential = await withProviderHttpDispatchResult(
        { operation: "oauth", service, connectionId: id, connectionName },
        () => refresher.refresh(service, spent),
        this.providerHttpDispatch,
      );
    } catch (error) {
      if (error instanceof ConnectionError && error.code === "oauth_reauth_required") {
        // The revision fence prevents a late refusal from marking a replacement authorization as expired.
        await this.store.updateCredential(
          {
            id,
            revision,
            service,
            connectionName,
            credential: { ...spent, metadata: { ...spent.metadata, oauthReauthRequired: true } },
          },
          true,
        );
      }
      throw error;
    }
    // The provider has now spent the old refresh token. With rotating single-use refresh
    // tokens, discarding `nextCredential` loses the connection for good, so a lost
    // revision race re-reads the row and lands the refreshed token fields on the latest
    // revision, as long as that row still holds the credential this refresh spent.
    let target: StoredLocalConnection = { ...selected, source: "local", credential: nextCredential };
    for (let attempt = 0; attempt < OAUTH_REFRESH_PERSIST_ATTEMPTS; attempt++) {
      if (await this.store.updateCredential(target, true)) return target.credential as OAuthCredential;
      const current = await this.store.get(service, connectionName);
      if (
        current?.source === "saas" ||
        current?.id !== id ||
        current.credential.authType !== "oauth2" ||
        current.credential.refreshToken !== spent.refreshToken ||
        current.credential.metadata.oauthAuthorizationId !== spent.metadata.oauthAuthorizationId
      ) {
        break;
      }
      target = {
        ...current,
        credential: mergeRefreshedOAuthCredential(current.credential, spent, nextCredential),
      };
    }
    const current = await this.store.get(service, connectionName);
    const currentCredential =
      current?.source !== "saas" && current?.credential.authType === "oauth2" ? current.credential : undefined;
    // Never revoke a token pair held by a replacement or a refresh that did persist.
    const sharesToken =
      currentCredential !== undefined &&
      (currentCredential.accessToken === nextCredential.accessToken ||
        (nextCredential.refreshToken !== undefined && currentCredential.refreshToken === nextCredential.refreshToken));
    const stillSpent =
      current?.id === id &&
      currentCredential?.accessToken === spent.accessToken &&
      currentCredential?.refreshToken === spent.refreshToken &&
      currentCredential?.metadata.oauthAuthorizationId === spent.metadata.oauthAuthorizationId;
    if (
      !sharesToken &&
      (stillSpent || (await this.store.wasRevocationRequested(retirementGeneration, oauthAuthorizationKey(selected))))
    )
      await refresher.revokeAccessToken?.(service, nextCredential);
    throw new ConnectionError(
      "connection_not_found",
      `${service} connection changed while its OAuth credential was refreshing. Retry the action.`,
    );
  }
}

function oauthRefreshKey(connectionId: string, credential: OAuthCredential): string {
  return JSON.stringify([connectionId, credential.refreshToken, credential.metadata.oauthAuthorizationId]);
}

export function isOAuthCredentialExpired(
  credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  refreshWindowMs = 60_000,
): boolean {
  if (!credential.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(credential.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now() + refreshWindowMs;
}
