import type { ActionExecutor, CredentialValidators, ProviderProxyExecutor } from "../core/types.ts";
import type { ProviderOAuthRuntime } from "../oauth/oauth-token.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { IntegrationDefinition } from "../triggers/common/integration.ts";
import type { PollDefinition } from "../triggers/common/poll.ts";
import type { CustomMcpCatalog } from "./catalog.ts";

/** Resolve database-backed actions without adding entries to the generated provider registry. */
export class CustomMcpLoader implements IProviderLoader {
  private readonly base: IProviderLoader;
  private readonly catalog: CustomMcpCatalog;

  constructor(base: IProviderLoader, catalog: CustomMcpCatalog) {
    this.base = base;
    this.catalog = catalog;
  }

  async loadActionExecutor(
    service: string,
    actionId: string,
    displayName?: string,
  ): Promise<ActionExecutor | undefined> {
    const record = this.catalog.getRecord(service);
    if (!record) return this.base.loadActionExecutor(service, actionId, displayName);
    const action = record.enabled ? record.actions.find((action) => action.id === actionId) : undefined;
    if (!action) return undefined;
    const { createMcpActionExecutor } = await import("./runtime.ts");
    return createMcpActionExecutor(record, action);
  }

  async loadCredentialValidators(service: string): Promise<CredentialValidators | undefined> {
    // Discovery happens after saving the connection, so a temporary tools/list failure does not discard OAuth consent.
    return this.catalog.getRecord(service) ? undefined : this.base.loadCredentialValidators(service);
  }
  async loadProxyExecutor(service: string, displayName?: string): Promise<ProviderProxyExecutor | undefined> {
    return this.catalog.getRecord(service) ? undefined : this.base.loadProxyExecutor(service, displayName);
  }
  async loadProviderOAuthRuntime(service: string): Promise<ProviderOAuthRuntime | undefined> {
    return this.catalog.getRecord(service) ? undefined : this.base.loadProviderOAuthRuntime?.(service);
  }
  async loadTriggerDefinitions(service: string): Promise<readonly (IntegrationDefinition | PollDefinition)[]> {
    return this.catalog.getRecord(service) ? [] : ((await this.base.loadTriggerDefinitions?.(service)) ?? []);
  }
}
