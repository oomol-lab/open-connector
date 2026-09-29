import type { CatalogStore, RuntimeProviderDefinition } from "../catalog-store.ts";
import type { ISecretCodec } from "../server/secrets/secret-codec-core.ts";
import type { ManagedProject, SaasProjectStore } from "../server/storage/saas-project-store.ts";
import type { SaasProviderConfig } from "./saas-client.ts";

import { normalizeSaasBaseUrl, SaasClient, SaasError } from "./saas-client.ts";

export interface SaasProjectState {
  configured: boolean;
  managedProjectId: string | null;
  projectId: string | null;
  baseUrl: string | null;
  status: "unconfigured" | "available" | "unavailable" | "auth_error";
  cleanup: { pending: number; manual: number; paused: boolean };
}

export type OAuthSource =
  | { mode: "local" }
  | {
      mode: "saas";
      managedProjectId: string;
      projectId: string;
      providerConfigId: string;
    };

export interface SaasProjectServiceOptions {
  catalog: CatalogStore;
  store: SaasProjectStore;
  secretCodec: ISecretCodec;
  configuredOrigin?: string;
  client?: SaasClient;
}

/** Owns configuration and capability checks; account lifecycle stays in the connection request service. */
export class SaasProjectService {
  private readonly options: SaasProjectServiceOptions;
  private readonly client: SaasClient;

  constructor(options: SaasProjectServiceOptions) {
    this.options = options;
    this.client = options.client ?? new SaasClient();
  }

  requireOrigin(): string {
    try {
      const value = this.options.configuredOrigin;
      if (!value) throw new Error();
      const url = new URL(value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/"
      )
        throw new Error();
      return url.origin;
    } catch {
      throw new SaasError(
        "oauth_source_configuration_error",
        "Set OOMOL_CONNECT_ORIGIN to an explicit HTTP(S) origin before enabling SaaS OAuth.",
        400,
        undefined,
        "origin_required",
      );
    }
  }

  async externalUserId(): Promise<string> {
    return `open-connector:${await this.options.store.getInstanceId()}`;
  }

  async getState(signal?: AbortSignal): Promise<SaasProjectState> {
    const project = await this.options.store.getProject();
    const cleanup = await this.options.store.getCleanupStats();
    if (!project)
      return {
        configured: false,
        managedProjectId: null,
        projectId: null,
        baseUrl: null,
        status: "unconfigured",
        cleanup,
      };
    let status: SaasProjectState["status"] = "available";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.discover(project, signal);
        break;
      } catch (error) {
        signal?.throwIfAborted();
        if (!(error instanceof SaasError)) throw error;
        if (
          attempt === 0 &&
          error.code === "oauth_source_unavailable" &&
          (error.reason === undefined || ["network", "dns", "timeout"].includes(error.reason))
        )
          continue;
        status = error.code === "oauth_source_unauthorized" ? "auth_error" : "unavailable";
        break;
      }
    }
    return {
      configured: true,
      managedProjectId: project.id,
      projectId: project.projectId,
      baseUrl: project.baseUrl,
      status,
      cleanup,
    };
  }

  async configure(input: unknown, signal?: AbortSignal): Promise<SaasProjectState> {
    const { z } = await import("zod");
    const projectInput = z.strictObject({
      baseUrl: z.string().min(1),
      projectApiKey: z
        .string()
        .trim()
        .min(1)
        .regex(/^[^\r\n]+$/),
    });
    const parsed = projectInput.safeParse(input);
    if (!parsed.success) throw new SaasError("invalid_input", "Provide baseUrl and projectApiKey only.");
    if (!this.options.secretCodec.encrypted)
      throw new SaasError(
        "oauth_source_configuration_error",
        "Configure encryption before saving a SaaS project key.",
        400,
        undefined,
        "encryption_required",
      );
    this.requireOrigin();
    const baseUrl = normalizeSaasBaseUrl(parsed.data.baseUrl);
    const current = await this.options.store.getProject();
    if (current && current.baseUrl !== baseUrl)
      throw new SaasError("oauth_source_mismatch", "Remove the existing project before changing its origin.", 409);
    const discovery = await this.client.discover({ baseUrl, apiKey: parsed.data.projectApiKey }, signal);
    const project: ManagedProject = {
      id: current?.id ?? crypto.randomUUID(),
      projectId: discovery.projectId,
      baseUrl,
      apiKey: parsed.data.projectApiKey,
    };
    if (!(await this.options.store.saveProject(project)))
      throw new SaasError(
        "oauth_source_mismatch",
        "The project identity changed. Reload the configuration before retrying.",
        409,
      );
    return {
      configured: true,
      managedProjectId: project.id,
      projectId: project.projectId,
      baseUrl,
      status: "available",
      cleanup: await this.options.store.getCleanupStats(),
    };
  }

  async remove(): Promise<void> {
    const project = await this.options.store.getProject();
    if (project && !(await this.options.store.deleteProject(project.id)))
      throw new SaasError(
        "oauth_source_in_use",
        "Clear service defaults, connections, pending requests and cleanup tasks before removing this project.",
        409,
      );
  }

  async listProviderConfigs(
    signal?: AbortSignal,
  ): Promise<{ projectId: string; providerConfigs: SaasProviderConfig[] }> {
    const project = await this.requireProject();
    const discovery = await this.discover(project, signal);
    return {
      projectId: project.projectId,
      providerConfigs: discovery.providerConfigs.flatMap((config) => {
        const provider = this.options.catalog.providers.find((provider) => provider.service === config.service);
        if (!provider?.auth.some((auth) => auth.type === "oauth2")) return [];
        const actionIds = config.actionIds.filter(
          (id) => this.options.catalog.actionsById.get(id)?.service === config.service,
        );
        return [{ ...config, actionIds }];
      }),
    };
  }

  async listSources(): Promise<Map<string, OAuthSource>> {
    return new Map(
      (await this.options.store.listSources()).map(({ service, ...source }) => [service, { mode: "saas", ...source }]),
    );
  }

  async getSource(service: string): Promise<OAuthSource> {
    this.getProvider(service);
    const source = await this.options.store.getSource(service);
    if (!source) return { mode: "local" };
    const project = await this.requireProject();
    if (project.id !== source.managedProjectId)
      throw new SaasError("oauth_source_mismatch", "The configured OAuth source no longer matches the project.", 409);
    return {
      mode: "saas",
      managedProjectId: source.managedProjectId,
      projectId: project.projectId,
      providerConfigId: source.providerConfigId,
    };
  }

  async setSource(service: string, input: unknown, signal?: AbortSignal): Promise<OAuthSource> {
    this.getProvider(service);
    const { z } = await import("zod");
    const sourceInput = z.discriminatedUnion("mode", [
      z.strictObject({ mode: z.literal("local") }),
      z.strictObject({ mode: z.literal("saas"), providerConfigId: z.string().min(1) }),
    ]);

    const parsed = sourceInput.safeParse(input);
    if (!parsed.success) throw new SaasError("invalid_input", "Use mode local, or mode saas with providerConfigId.");
    if (parsed.data.mode === "local") {
      await this.options.store.setSource(service, undefined);
      return { mode: "local" };
    }
    const { project, config } = await this.resolveConfig(service, parsed.data.providerConfigId, undefined, signal);
    if (!(await this.options.store.setSource(service, { managedProjectId: project.id, providerConfigId: config.id })))
      throw new SaasError("oauth_source_mismatch", "The project was removed while selecting the OAuth source.", 409);
    return { mode: "saas", managedProjectId: project.id, projectId: project.projectId, providerConfigId: config.id };
  }

  async resolveConfig(
    service: string,
    configId: string,
    managedProjectId?: string,
    signal?: AbortSignal,
  ): Promise<{ project: ManagedProject; config: SaasProviderConfig }> {
    const provider = this.getProvider(service);
    this.requireOrigin();
    const { project, config } = await this.resolveExecutionConfig(service, configId, managedProjectId, signal);
    const auth = provider.auth.find((auth) => auth.type === "oauth2")!;
    const required = new Set(auth.authorizationOptions?.filter((option) => option.required).map((option) => option.id));
    for (const id of required)
      for (const dependency of auth.authorizationOptions?.find((option) => option.id === id)?.requires ?? [])
        required.add(dependency);
    if ([...required].some((scope) => !config.effectiveScopes.includes(scope)))
      throw new SaasError("oauth_source_scope_missing", "The SaaS configuration is missing required OAuth scopes.");
    const supportsAction = config.actionIds.some((id) => this.options.catalog.actionsById.get(id)?.service === service);
    if (!supportsAction && !config.proxyAvailable)
      throw new SaasError(
        "oauth_source_unsupported",
        "This configuration has no compatible actions or proxy capability.",
      );
    return { project, config };
  }

  async resolveExecutionConfig(
    service: string,
    configId: string,
    managedProjectId: string | undefined,
    signal?: AbortSignal,
  ): Promise<{ project: ManagedProject; config: SaasProviderConfig }> {
    const project = await this.requireProject(managedProjectId);
    const discovery = await this.discover(project, signal);
    const config = discovery.providerConfigs.find((config) => config.id === configId && config.service === service);
    if (!config)
      throw new SaasError("oauth_source_mismatch", "Select an available OAuth configuration for this service.", 409);
    return { project, config };
  }

  async requireProject(managedProjectId?: string): Promise<ManagedProject> {
    const project = await this.options.store.getProject();
    if (!project) throw new SaasError("oauth_source_not_configured", "Configure a SaaS project first.");
    if (managedProjectId && managedProjectId !== project.id)
      throw new SaasError("oauth_source_mismatch", "The OAuth project binding no longer matches.", 409);
    return project;
  }

  private async discover(project: ManagedProject, signal?: AbortSignal): ReturnType<SaasClient["discover"]> {
    const discovery = await this.client.discover(project, signal);
    if (discovery.projectId !== project.projectId)
      throw new SaasError(
        "oauth_source_mismatch",
        "SaaS project identity does not match the saved configuration.",
        409,
      );
    return discovery;
  }

  private getProvider(service: string): RuntimeProviderDefinition {
    const provider = this.options.catalog.providers.find((provider) => provider.service === service);
    if (!provider) throw new SaasError("unknown_service", "Provider was not found.", 404);
    if (!provider.auth.some((auth) => auth.type === "oauth2"))
      throw new SaasError("unsupported_auth_type", "This provider does not support OAuth.");
    return provider;
  }
}
