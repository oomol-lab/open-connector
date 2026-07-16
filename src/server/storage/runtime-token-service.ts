import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export interface RuntimeTokenRecord {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface RuntimeTokenSummary {
  id: string;
  name: string;
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
  revoke(id: string): Promise<boolean>;
  markUsed(id: string, usedAt: string): Promise<void>;
}

const tokenPrefix = "oct_";

export class RuntimeTokenService {
  private readonly store: IRuntimeTokenStore;

  constructor(store: IRuntimeTokenStore) {
    this.store = store;
  }

  async createToken(name: string): Promise<RuntimeTokenCreation> {
    const token = `${tokenPrefix}${randomBytes(32).toString("base64url")}`;
    const now = new Date().toISOString();
    const record: RuntimeTokenRecord = {
      id: randomUUID(),
      name: name.trim(),
      tokenHash: hashRuntimeToken(token),
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

  async verifyToken(token: string): Promise<boolean> {
    if (!token.startsWith(tokenPrefix)) {
      return false;
    }
    const tokenHash = hashRuntimeToken(token);
    const matched = (await this.store.list()).find((record) => equalHashes(record.tokenHash, tokenHash));
    if (!matched) {
      return false;
    }

    await this.store.markUsed(matched.id, new Date().toISOString());
    return true;
  }
}

export function hashRuntimeToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function summarizeRuntimeToken(record: RuntimeTokenRecord): RuntimeTokenSummary {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
  };
}

function equalHashes(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
