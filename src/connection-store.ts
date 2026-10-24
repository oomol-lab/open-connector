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
}

/**
 * Storage contract for local and SaaS provider connections.
 */
export interface IConnectionStore {
  get(service: string, connectionName: string): Promise<StoredConnection | undefined>;
  getRetirementGeneration(service: string, connectionName: string): Promise<string>;
  setIfCurrentGeneration(
    service: string,
    connectionName: string,
    credential: ResolvedCredential,
    retirementGeneration: string,
  ): Promise<StoredLocalConnection | undefined>;
  set(service: string, connectionName: string, credential: ResolvedCredential): Promise<StoredLocalConnection>;
  updateCredential(input: StoredLocalConnection, refresh?: boolean): Promise<boolean>;
  delete(service: string, connectionName: string): Promise<void>;
  list(): Promise<StoredConnection[]>;
}
