import type { SaasConnectionReference } from "../connection-store.ts";
import type { ManagedProject } from "../server/storage/saas-project-store.ts";
import type { SaasActionResult, SaasProxyResult } from "./saas-client.ts";
import type { SaasProjectService } from "./saas-project-service.ts";

import { parseSaasProxyRequest, SaasClient, SaasError } from "./saas-client.ts";

const discoveryRejections = new Set([
  "oauth_source_unauthorized",
  "provider_config_not_found",
  "provider_not_found",
  "provider_not_configured",
  "proxy_not_supported",
]);

export interface SaasExecutionServiceOptions {
  projects: SaasProjectService;
  client: SaasClient;
}

/** Resolves capabilities for the selected connection without fetching provider credentials or profiles. */
export class SaasExecutionService {
  private readonly options: SaasExecutionServiceOptions;

  constructor(options: SaasExecutionServiceOptions) {
    this.options = options;
  }

  async executeAction(
    reference: SaasConnectionReference,
    service: string,
    actionId: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<SaasActionResult> {
    const { project, config } = await this.options.projects.resolveExecutionConfig(
      service,
      reference.providerConfigId,
      reference.managedProjectId,
      signal,
    );
    if (!config.actionIds.includes(actionId))
      throw new SaasError("oauth_source_unsupported", "The selected SaaS connection does not support this action.");
    return this.execute(project, () => this.options.client.executeAction(project, reference, actionId, input, signal));
  }

  async executeProxy(
    reference: SaasConnectionReference,
    service: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<SaasProxyResult> {
    const request = await parseSaasProxyRequest(input);
    const { project, config } = await this.options.projects.resolveExecutionConfig(
      service,
      reference.providerConfigId,
      reference.managedProjectId,
      signal,
    );
    if (!config.proxyAvailable)
      throw new SaasError("proxy_not_supported", "The selected SaaS connection does not support proxy execution.", 501);
    return this.execute(project, () => this.options.client.executeProxy(project, reference, service, request, signal));
  }

  private async execute<T>(project: ManagedProject, request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (error instanceof SaasError && discoveryRejections.has(error.code))
        this.options.projects.invalidateDiscovery(project);
      throw error;
    }
  }
}
