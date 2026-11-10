import type { ConnectionSummary } from "../connection-service.ts";
import type { ResolvedCredential } from "../core/types.ts";
import type { OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import type { CustomMcpStore } from "../server/storage/custom-mcp-store.ts";
import type { CustomMcpCatalog } from "./catalog.ts";
import type { CustomMcpRecord, CustomMcpRegistration } from "./definition.ts";

import { isProviderId } from "../core/provider-id.ts";
import { HttpRequestError } from "../server/api/http-utils.ts";
import { customMcpNameKey, suggestMcpService } from "./definition.ts";
import { prepareMcpRegistration } from "./registration.ts";

export interface CustomMcpServiceOptions {
  catalog: CustomMcpCatalog;
  store: CustomMcpStore;
  oauthClientConfigs: OAuthClientConfigService;
}

/** Owns registration and publication of complete MCP tool snapshots. */
export class CustomMcpService {
  readonly catalog: CustomMcpCatalog;
  private readonly store: CustomMcpStore;
  private readonly oauthClientConfigs: OAuthClientConfigService;

  constructor(options: CustomMcpServiceOptions) {
    this.catalog = options.catalog;
    this.store = options.store;
    this.oauthClientConfigs = options.oauthClientConfigs;
  }

  get(service: string): CustomMcpRecord {
    const record = this.catalog.getRecord(service);
    if (!record) throw new HttpRequestError("unknown_service", "Unknown custom MCP service.", 404);
    return record;
  }

  async create(input: CustomMcpRegistration, redirectUri: string, signal?: AbortSignal): Promise<CustomMcpRecord> {
    const service = input.service ?? suggestMcpService(input.displayName);
    this.assertServiceAvailable(service);
    this.assertNameAvailable(input.displayName);
    const { config, oauthClient } = await prepareMcpRegistration(input, service, redirectUri, signal);
    const record: CustomMcpRecord = { ...config, revision: crypto.randomUUID(), actions: [] };
    await this.store.create(record);
    return this.catalog.withSnapshot(async () => {
      if (oauthClient) await this.oauthClientConfigs.upsertConfig({ service, ...oauthClient });
      if (record.auth.type === "none") return this.sync(service, undefined, undefined, signal);
      return record;
    });
  }

  private assertServiceAvailable(service: string): void {
    if (!isProviderId(service) || service.length > 100)
      throw new HttpRequestError(
        "invalid_input",
        "Service must contain 1–100 lowercase letters, digits, underscores or hyphens.",
      );
    if (this.catalog.providers.some((provider) => provider.service === service))
      throw new HttpRequestError(
        "provider_service_exists",
        "A provider with this service identifier already exists.",
        409,
      );
  }

  async update(service: string, displayName: string, enabled: boolean): Promise<CustomMcpRecord> {
    this.assertNameAvailable(displayName, service);
    const previous = this.get(service);
    const record = { ...previous, displayName, enabled, revision: crypto.randomUUID() };
    await this.store.updateSettings(record, previous.revision);
    await this.catalog.refresh();
    return record;
  }

  private assertNameAvailable(name: string, service?: string): void {
    const key = customMcpNameKey(name);
    if (
      this.catalog.providers.some(
        (provider) => provider.service !== service && customMcpNameKey(provider.displayName) === key,
      )
    ) {
      throw new HttpRequestError("provider_name_exists", "A provider with this name already exists.", 409);
    }
  }

  async delete(service: string): Promise<void> {
    const record = this.get(service);
    await this.store.delete(service, record.revision);
    if (record.auth.type === "oauth2") await this.oauthClientConfigs.deleteConfig(service);
    await this.catalog.refresh();
  }

  async sync(
    service: string,
    credential?: ResolvedCredential,
    connectionId?: string,
    signal?: AbortSignal,
  ): Promise<CustomMcpRecord> {
    const previous = this.get(service);
    let actions: CustomMcpRecord["actions"];
    try {
      const { discoverMcpActions } = await import("./runtime.ts");
      actions = await discoverMcpActions(previous, credential, signal);
    } catch {
      // Upstream errors can contain credential headers; persist only a local diagnostic.
      await this.store.recordSyncFailure(
        {
          service,
          revision: crypto.randomUUID(),
          syncError: "Tool discovery failed. Check the connection and MCP endpoint, then retry.",
        },
        previous.revision,
      );
      return this.catalog.withSnapshot(async () => this.get(service));
    }
    await this.store.publishTools(
      {
        service,
        actions,
        syncConnectionId: connectionId,
        syncedAt: new Date().toISOString(),
        revision: crypto.randomUUID(),
      },
      previous.revision,
    );
    return this.catalog.withSnapshot(async () => this.get(service));
  }

  async connectionSaved(summary: ConnectionSummary, credential: ResolvedCredential): Promise<void> {
    const record = this.catalog.getRecord(summary.service);
    if (!record || record.syncedAt || !record.enabled) return;
    // Consent and credentials have already been saved; synchronization failures must not undo them.
    try {
      await this.sync(record.service, credential, summary.id);
    } catch (error) {
      if (!(error instanceof HttpRequestError && error.status === 409)) throw error;
    }
  }
}
