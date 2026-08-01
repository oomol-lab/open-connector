import type { Tenant } from "../../connection-service.ts";
import type { TokenPolicy } from "../../core/action-policy.ts";
import type { RuntimeLogger } from "../../core/types.ts";

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { defaultTenant } from "../../connection-service.ts";

export interface RuntimeTokenRecord {
  id: string;
  name: string;
  tokenHash: string;
  /**
   * Tenant this token acts as.
   *
   * Deliberately NOT part of `TokenPolicy`: policy answers "which actions may this token
   * run", while the tenant answers "whose data does it run against". Keeping them
   * separate means updating a token's action rules can never silently move it between
   * tenants.
   */
  tenant: Tenant;
  /**
   * Connection names (aliases) this token may act against, within its own tenant.
   *
   * Deliberately NOT part of `TokenPolicy`, same reasoning as `tenant`: policy answers
   * "which actions", tenant answers "whose data", this answers "which of that tenant's
   * OWN named connections" — e.g. a token meant for one GitHub account should not be
   * able to name a different GitHub account under the same tenant just because both
   * exist. `undefined` means unrestricted (every connection the tenant owns) — the
   * backward-compatible default for tokens minted before this field existed. `[]` means
   * no connections at all, matching the existing "empty allowlist authorizes nothing"
   * convention used by connect-session's `allowedServices`.
   */
  allowedConnections?: string[];
  allowedActions: string[];
  blockedActions: string[];
  allowedProxies: string[];
  createdAt: string;
  lastUsedAt?: string;
}

export interface RuntimeTokenSummary {
  id: string;
  name: string;
  tenant: Tenant;
  allowedConnections?: string[];
  allowedActions: string[];
  blockedActions: string[];
  allowedProxies: string[];
  createdAt: string;
  lastUsedAt?: string;
}

export interface RuntimeTokenCreation {
  token: string;
  record: RuntimeTokenRecord;
}

export interface IRuntimeTokenStore {
  add(record: RuntimeTokenRecord): Promise<void>;
  list(): Promise<RuntimeTokenRecord[]>;
  findByHash(tokenHash: string): Promise<RuntimeTokenRecord | undefined>;
  updatePolicy(id: string, policy: TokenPolicy): Promise<RuntimeTokenRecord | undefined>;
  revoke(id: string): Promise<boolean>;
  markUsed(id: string, usedAt: string): Promise<void>;
}

const tokenPrefix = "oct_";

export interface RuntimeGrant extends TokenPolicy {
  tokenId: string;
  tenant: Tenant;
  allowedConnections?: string[];
}

export class RuntimeTokenService {
  private readonly store: IRuntimeTokenStore;
  private readonly logger?: RuntimeLogger;

  constructor(store: IRuntimeTokenStore, logger?: RuntimeLogger) {
    this.store = store;
    this.logger = logger;
  }

  async createToken(
    name: string,
    policy: TokenPolicy = { allowedActions: [], blockedActions: [], allowedProxies: [] },
    tenant: Tenant = defaultTenant,
    allowedConnections?: string[],
  ): Promise<RuntimeTokenCreation> {
    const token = `${tokenPrefix}${randomBytes(32).toString("base64url")}`;
    const now = new Date().toISOString();
    const record: RuntimeTokenRecord = {
      id: randomUUID(),
      name: name.trim(),
      tokenHash: hashRuntimeToken(token),
      tenant,
      allowedConnections,
      allowedActions: policy.allowedActions,
      blockedActions: policy.blockedActions,
      allowedProxies: policy.allowedProxies,
      createdAt: now,
    };
    await this.store.add(record);
    return { token, record };
  }

  async listTokens(): Promise<RuntimeTokenSummary[]> {
    return (await this.store.list()).map(summarizeRuntimeToken);
  }

  async revokeToken(id: string): Promise<boolean> {
    return this.store.revoke(id);
  }

  async updateTokenPolicy(id: string, policy: TokenPolicy): Promise<RuntimeTokenSummary | undefined> {
    const record = await this.store.updatePolicy(id, policy);
    return record ? summarizeRuntimeToken(record) : undefined;
  }

  async resolveToken(token: string): Promise<RuntimeGrant | undefined> {
    if (!token.startsWith(tokenPrefix)) {
      return undefined;
    }
    const tokenHash = hashRuntimeToken(token);
    const matched = await this.store.findByHash(tokenHash);
    if (!matched || !equalHashes(matched.tokenHash, tokenHash)) {
      return undefined;
    }

    await this.recordLastUsed(matched.id);
    return {
      tokenId: matched.id,
      tenant: matched.tenant,
      allowedConnections: matched.allowedConnections,
      allowedActions: matched.allowedActions,
      blockedActions: matched.blockedActions,
      allowedProxies: matched.allowedProxies,
    };
  }

  async verifyToken(token: string): Promise<boolean> {
    return Boolean(await this.resolveToken(token));
  }

  /**
   * `last_used_at` is best-effort audit metadata, so a failed write is logged
   * instead of turning an authenticated caller into a failed request.
   */
  private async recordLastUsed(tokenId: string): Promise<void> {
    try {
      await this.store.markUsed(tokenId, new Date().toISOString());
    } catch (error) {
      this.logger?.warn({ tokenId, err: error }, "runtime token last use update failed");
    }
  }
}

export function hashRuntimeToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function summarizeRuntimeToken(record: RuntimeTokenRecord): RuntimeTokenSummary {
  return {
    id: record.id,
    name: record.name,
    tenant: record.tenant,
    allowedConnections: record.allowedConnections,
    allowedActions: record.allowedActions,
    blockedActions: record.blockedActions,
    allowedProxies: record.allowedProxies,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
  };
}

function equalHashes(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
