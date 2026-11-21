import type { ScopeFilter } from "./core/scope.ts";
import type { CredentialProfile, ResolvedCredential } from "./core/types.ts";

export interface SaasConnectionReference {
  managedProjectId: string;
  providerConfigId: string;
  externalUserId: string;
  connectedAccountId: string;
  localRequestId: string;
}

export interface StoredSaasConnection {
  source: "saas";
  credential?: never;
  scope?: never;
  id: string;
  revision: string;
  service: string;
  connectionName: string;
  reference: SaasConnectionReference;
  profile: CredentialProfile;
  status: "active" | "reauth_required";
  comment: string | null;
}

export type StoredConnection = StoredLocalConnection | StoredSaasConnection;

export interface StoredLocalConnection {
  source?: "local";
  id: string;
  revision: string;
  service: string;
  connectionName: string;
  credential: ResolvedCredential;
  /** Opaque isolation scope; absent for an unscoped connection. */
  scope?: string;
}

/**
 * Storage contract for local and SaaS provider connections.
 */
export interface IConnectionStore {
  get(service: string, connectionName: string, within?: ScopeFilter): Promise<StoredConnection | undefined>;
  getById(id: string, within?: ScopeFilter): Promise<StoredConnection | undefined>;
  getRetirementGeneration(service: string, connectionName: string): Promise<string>;
  setIfCurrentGeneration(
    service: string,
    connectionName: string,
    credential: ResolvedCredential,
    retirementGeneration: string,
    scope?: string,
  ): Promise<StoredLocalConnection | undefined>;
  set(
    service: string,
    connectionName: string,
    credential: ResolvedCredential,
    scope?: string,
  ): Promise<StoredLocalConnection>;
  updateCredential(input: StoredLocalConnection, refresh?: boolean): Promise<boolean>;
  /** When a target is supplied, reject changes to its identity or revision without retiring the replacement. */
  delete(service: string, connectionName: string, target?: Pick<StoredConnection, "id" | "revision">): Promise<void>;
  list(within?: ScopeFilter): Promise<StoredConnection[]>;
}
