import type { CatalogStore, RuntimeProviderDefinition } from "../catalog-store.ts";
import type { ISecretCodec } from "../server/secrets/secret-codec-core.ts";
import type { ManagedProject, SaasProjectStore } from "../server/storage/saas-project-store.ts";
import type { SaasDiscovery, SaasProviderConfig } from "./saas-client.ts";

import { measureExecutionPhase } from "../core/execution-timing.ts";
import { normalizeSaasBaseUrl, SaasClient, SaasError } from "./saas-client.ts";

const executionDiscoveryTtlMs = 30_000;

interface DiscoveryEntry {
  key: string;
  value: Promise<SaasDiscovery>;
  controller: AbortController;
  waiters: number;
  expiresAt: number | undefined;
}

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
  private discovery: DiscoveryEntry | undefined;

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
    this.discovery = undefined;
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
    this.discovery = undefined;
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
    this.getProvider(service);
    this.requireOrigin();
    const project = await this.requireProject(managedProjectId);
    const discovery = await this.discover(project, signal);
    const config = this.findConfig(discovery, service, configId);
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
    signal?.throwIfAborted();
    const project = await this.requireProject(managedProjectId);
    const key = this.discoveryKey(project);
    const cached = this.discovery;
    const discovery =
      cached?.key === key && (cached.expiresAt === undefined || cached.expiresAt > performance.now())
        ? await this.waitForDiscovery(cached, signal)
        : await this.discover(project, signal);
    return { project, config: this.findConfig(discovery, service, configId) };
  }

  /** Invalidate rejected capabilities without evicting a replacement project's snapshot. */
  invalidateDiscovery(project: ManagedProject): void {
    if (this.discovery?.key === this.discoveryKey(project)) this.discovery = undefined;
  }

  private findConfig(discovery: SaasDiscovery, service: string, configId: string): SaasProviderConfig {
    const config = discovery.providerConfigs.find((config) => config.id === configId && config.service === service);
    if (!config)
      throw new SaasError("oauth_source_mismatch", "Select an available OAuth configuration for this service.", 409);
    return config;
  }

  async requireProject(managedProjectId?: string): Promise<ManagedProject> {
    const project = await this.options.store.getProject();
    if (!project) throw new SaasError("oauth_source_not_configured", "Configure a SaaS project first.");
    if (managedProjectId && managedProjectId !== project.id)
      throw new SaasError("oauth_source_mismatch", "The OAuth project binding no longer matches.", 409);
    return project;
  }

  private discoveryKey(project: ManagedProject): string {
    return JSON.stringify([project.id, project.projectId, project.baseUrl, project.apiKey]);
  }

  private discover(project: ManagedProject, signal?: AbortSignal): Promise<SaasDiscovery> {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const entry: DiscoveryEntry = {
      key: this.discoveryKey(project),
      controller,
      waiters: 0,
      expiresAt: undefined,
      value: this.client
        .discover(project, controller.signal)
        .then((discovery) => {
          if (discovery.projectId !== project.projectId)
            throw new SaasError(
              "oauth_source_mismatch",
              "SaaS project identity does not match the saved configuration.",
              409,
            );
          entry.expiresAt = performance.now() + executionDiscoveryTtlMs;
          return discovery;
        })
        .catch((error: unknown) => {
          if (this.discovery === entry) this.discovery = undefined;
          throw error;
        }),
    };
    this.discovery = entry;
    return this.waitForDiscovery(entry, signal);
  }

  private waitForDiscovery(entry: DiscoveryEntry, signal?: AbortSignal): Promise<SaasDiscovery> {
    return measureExecutionPhase("saasDiscoveryMs", async () => {
      signal?.throwIfAborted();
      entry.waiters++;
      let abort: (() => void) | undefined;
      try {
        if (!signal) return await entry.value;
        const cancelled = new Promise<never>((_resolve, reject) => {
          abort = () => reject(signal.reason);
          signal.addEventListener("abort", abort, { once: true });
        });
        return await Promise.race([entry.value, cancelled]);
      } finally {
        if (signal && abort) signal.removeEventListener("abort", abort);
        entry.waiters--;
        if (entry.waiters === 0 && entry.expiresAt === undefined) {
          if (this.discovery === entry) this.discovery = undefined;
          entry.controller.abort();
        }
      }
    });
  }

  private getProvider(service: string): RuntimeProviderDefinition {
    const provider = this.options.catalog.providers.find((provider) => provider.service === service);
    if (!provider) throw new SaasError("unknown_service", "Provider was not found.", 404);
    if (!provider.auth.some((auth) => auth.type === "oauth2"))
      throw new SaasError("unsupported_auth_type", "This provider does not support OAuth.");
    return provider;
  }
}
