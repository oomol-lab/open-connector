import type { CatalogStore } from "../catalog-store.ts";
import type { ExecutionResult } from "../core/types.ts";
import type { ISecretCodec } from "../server/secrets/secret-codec-core.ts";

import {
  isFailureEnvelope,
  isSuccessEnvelope,
  readRemoteJson,
  RemoteHttpError,
  requestRemote,
} from "../core/remote-http.ts";
import { isAbortLikeError } from "../providers/provider-runtime.ts";
import { defaultMarketplaceDiscoveryUrl } from "./default-marketplace.ts";
const maximumDiscoveryBytes = 4 * 1024 * 1024;

export type MarketplacePricing = "free" | "metered";
export type MarketplaceStatus = "disabled" | "available" | "unavailable" | "auth_error";

export interface MarketplaceDiscovery {
  version: 1;
  id: string;
  name: string;
  pricing: MarketplacePricing;
  validate: string;
  endpoint: string;
  actions: string[];
}

export interface StoredMarketplaceConfig {
  discoveryUrl: string;
  apiKeyEncrypted: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceConfigInput {
  discoveryUrl?: string;
  apiKey?: string;
  enabled?: boolean;
}

export interface ProviderPreference {
  service: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IMarketplaceStore {
  getConfig(): Promise<StoredMarketplaceConfig | undefined>;
  setConfig(config: StoredMarketplaceConfig): Promise<void>;
  deleteConfig(): Promise<void>;
  listProviderPreferences(): Promise<ProviderPreference[]>;
  setProviderPreference(preference: ProviderPreference): Promise<void>;
}

export interface MarketplaceSnapshot {
  discoveryUrl: string;
  definition: MarketplaceDiscovery;
  apiKey: string;
  compatibleActions: ReadonlySet<string>;
  actionsByService: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface MarketplaceDiscoverySummary {
  version: 1;
  name: string;
  actions: string[];
}

export interface MarketplaceState {
  configured: boolean;
  enabled: boolean;
  discoveryUrl: string;
  status: MarketplaceStatus;
  marketplace?: Omit<MarketplaceDiscovery, "validate" | "endpoint" | "actions">;
  compatibleActionCount: number;
  compatibleProviderCount: number;
  error?: string;
}

export interface MarketplaceServiceOptions {
  catalog: CatalogStore;
  store: IMarketplaceStore;
  secretCodec: ISecretCodec;
  fetcher?: typeof fetch;
}

export class MarketplaceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Owns the validated Marketplace configuration and current process snapshot. */
export class MarketplaceService {
  private readonly options: MarketplaceServiceOptions;
  private snapshot?: MarketplaceSnapshot;
  private state: MarketplaceState = {
    configured: false,
    enabled: false,
    discoveryUrl: defaultMarketplaceDiscoveryUrl,
    status: "disabled",
    compatibleActionCount: 0,
    compatibleProviderCount: 0,
  };

  constructor(options: MarketplaceServiceOptions) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    const config = await this.options.store.getConfig();
    if (!config) return;
    if (!config.enabled) {
      this.state = { ...this.state, configured: true, discoveryUrl: config.discoveryUrl };
      return;
    }

    try {
      const apiKey = await this.options.secretCodec.decode(config.apiKeyEncrypted);
      await this.activate(config.discoveryUrl, apiKey);
      await this.ensureProviderPreferences();
    } catch (error) {
      this.snapshot = undefined;
      this.state = {
        configured: true,
        enabled: true,
        discoveryUrl: config.discoveryUrl,
        status:
          error instanceof MarketplaceError && error.code === "marketplace_auth_error" ? "auth_error" : "unavailable",
        compatibleActionCount: 0,
        compatibleProviderCount: 0,
        error: error instanceof Error ? error.message : "Marketplace startup failed.",
      };
    }
  }

  getState(): MarketplaceState {
    return this.state;
  }

  getSnapshot(): MarketplaceSnapshot | undefined {
    return this.snapshot;
  }

  async getDefaultDiscovery(signal?: AbortSignal): Promise<MarketplaceDiscoverySummary> {
    const discovery = await this.discover(defaultMarketplaceDiscoveryUrl, signal);
    return { version: 1, name: discovery.name, actions: discovery.actions };
  }

  supportsAction(actionId: string): boolean {
    return this.snapshot?.compatibleActions.has(actionId) ?? false;
  }

  async configure(input: MarketplaceConfigInput): Promise<MarketplaceState> {
    const previous = await this.options.store.getConfig();
    const discoveryUrl = input.discoveryUrl?.trim() || previous?.discoveryUrl || defaultMarketplaceDiscoveryUrl;
    if (previous && discoveryUrl !== previous.discoveryUrl && !input.apiKey?.trim()) {
      throw new MarketplaceError("invalid_input", "A new apiKey is required when changing the discovery URL.");
    }
    const apiKey =
      input.apiKey?.trim() || (previous ? await this.options.secretCodec.decode(previous.apiKeyEncrypted) : "");
    if (!apiKey) throw new MarketplaceError("invalid_input", "apiKey is required.");
    const now = new Date().toISOString();
    const enabled = input.enabled ?? true;

    if (enabled) await this.activate(discoveryUrl, apiKey);
    else this.disable(discoveryUrl, true);

    await this.options.store.setConfig({
      discoveryUrl,
      apiKeyEncrypted: await this.options.secretCodec.encode(apiKey),
      enabled,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    });
    if (enabled) await this.ensureProviderPreferences();
    return this.state;
  }

  async remove(): Promise<void> {
    await this.options.store.deleteConfig();
    this.snapshot = undefined;
    this.state = {
      configured: false,
      enabled: false,
      discoveryUrl: defaultMarketplaceDiscoveryUrl,
      status: "disabled",
      compatibleActionCount: 0,
      compatibleProviderCount: 0,
    };
  }

  async listProviderPreferences(): Promise<ProviderPreference[]> {
    const preferences = await this.options.store.listProviderPreferences();
    return preferences.filter((preference) => this.snapshot?.actionsByService.has(preference.service));
  }

  async setProviderEnabled(service: string, enabled: boolean): Promise<ProviderPreference> {
    if (!this.snapshot?.actionsByService.has(service)) {
      throw new MarketplaceError("marketplace_provider_not_found", `Marketplace provider not found: ${service}.`, 404);
    }
    const current = (await this.options.store.listProviderPreferences()).find((item) => item.service === service);
    const now = new Date().toISOString();
    const preference = { service, enabled, createdAt: current?.createdAt ?? now, updatedAt: now };
    await this.options.store.setProviderPreference(preference);
    return preference;
  }

  async execute(actionId: string, input: unknown, signal?: AbortSignal): Promise<ExecutionResult> {
    const snapshot = this.snapshot;
    if (!snapshot || !snapshot.compatibleActions.has(actionId)) {
      return { ok: false, error: { code: "connection_not_found", message: "Marketplace connection is unavailable." } };
    }
    const url = new URL(`${snapshot.definition.endpoint}/${encodeURIComponent(actionId)}`, snapshot.discoveryUrl);
    let payload: unknown;
    try {
      payload = await requestRemote(
        {
          url,
          label: "Marketplace action",
          fetcher: this.options.fetcher,
          requireHttps: false,
          allowTrustedHosts: true,
          init: {
            method: "POST",
            headers: { authorization: `Bearer ${snapshot.apiKey}`, "content-type": "application/json" },
            body: JSON.stringify({ input }),
            signal,
          },
        },
        (response, signal) =>
          readRemoteJson(response, {
            label: "Marketplace action response",
            maxBytes: Infinity,
            signal,
          }),
      );
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "marketplace_unavailable",
          message: error instanceof RemoteHttpError ? error.message : "Marketplace request failed.",
        },
      };
    }
    if (isSuccessEnvelope(payload)) return { ok: true, output: payload.data };
    if (isFailureEnvelope(payload)) {
      return { ok: false, error: { code: payload.errorCode, message: payload.message, details: payload.data } };
    }
    return {
      ok: false,
      error: { code: "provider_error", message: "Marketplace returned an invalid action response." },
    };
  }

  private async activate(discoveryUrl: string, apiKey: string): Promise<void> {
    const discovery = await this.discover(discoveryUrl);
    await this.validateApiKey(discoveryUrl, discovery.validate, apiKey);
    const compatibleActions = new Set(
      discovery.actions.filter((actionId) => this.options.catalog.actionsById.has(actionId)),
    );
    const actionsByService = new Map<string, Set<string>>();
    for (const actionId of compatibleActions) {
      const service = this.options.catalog.actionsById.get(actionId)!.service;
      const actions = actionsByService.get(service) ?? new Set<string>();
      actions.add(actionId);
      actionsByService.set(service, actions);
    }
    this.snapshot = { discoveryUrl, definition: discovery, apiKey, compatibleActions, actionsByService };
    this.state = {
      configured: true,
      enabled: true,
      discoveryUrl,
      status: "available",
      marketplace: { version: 1, id: discovery.id, name: discovery.name, pricing: discovery.pricing },
      compatibleActionCount: compatibleActions.size,
      compatibleProviderCount: actionsByService.size,
    };
  }

  private disable(discoveryUrl: string, configured: boolean): void {
    this.snapshot = undefined;
    this.state = {
      configured,
      enabled: false,
      discoveryUrl,
      status: "disabled",
      compatibleActionCount: 0,
      compatibleProviderCount: 0,
    };
  }

  private async discover(discoveryUrl: string, signal?: AbortSignal): Promise<MarketplaceDiscovery> {
    try {
      return await requestRemote(
        {
          url: discoveryUrl,
          label: "Marketplace discovery",
          fetcher: this.options.fetcher,
          requireHttps: false,
          allowTrustedHosts: true,
          timeoutMs: 15_000,
          init: { headers: { accept: "application/json" }, signal },
        },
        async (response, signal) => {
          if (!response.ok)
            throw new MarketplaceError(
              "marketplace_unavailable",
              `Marketplace discovery failed with HTTP ${response.status}.`,
              502,
            );
          return parseDiscovery(
            await readRemoteJson(response, {
              label: "Marketplace discovery",
              maxBytes: maximumDiscoveryBytes,
              signal,
            }),
            new URL(discoveryUrl),
          );
        },
      );
    } catch (error) {
      if (error instanceof MarketplaceError) throw error;
      if (isAbortLikeError(error)) {
        throw new MarketplaceError("marketplace_unavailable", "Marketplace request timed out.", 504);
      }
      if (error instanceof RemoteHttpError) {
        if (error.kind === "too_large") {
          throw new MarketplaceError("invalid_marketplace_discovery", "Marketplace discovery exceeds 4 MiB.");
        }
        if (error.kind === "invalid_url" || error.kind === "redirect" || error.kind === "invalid_json") {
          throw new MarketplaceError("invalid_marketplace_discovery", error.message);
        }
        throw new MarketplaceError("marketplace_unavailable", error.message, 502);
      }
      throw new MarketplaceError("marketplace_unavailable", "Marketplace discovery request failed.", 502);
    }
  }

  private async validateApiKey(discoveryUrl: string, validatePath: string, apiKey: string): Promise<void> {
    try {
      await requestRemote(
        {
          url: new URL(validatePath, discoveryUrl),
          label: "Marketplace validation",
          fetcher: this.options.fetcher,
          requireHttps: false,
          allowTrustedHosts: true,
          timeoutMs: 15_000,
          init: { method: "POST", headers: { authorization: `Bearer ${apiKey}` } },
        },
        async (response) => {
          if (response.status === 204) return;
          if (response.status === 401 || response.status === 403) {
            throw new MarketplaceError(
              "marketplace_auth_error",
              "The Marketplace API key is invalid or not permitted.",
              response.status,
            );
          }
          throw new MarketplaceError(
            "marketplace_unavailable",
            `Marketplace validation failed with HTTP ${response.status}.`,
            502,
          );
        },
      );
    } catch (error) {
      if (error instanceof MarketplaceError) throw error;
      if (isAbortLikeError(error)) {
        throw new MarketplaceError("marketplace_unavailable", "Marketplace request timed out.", 504);
      }
      throw new MarketplaceError(
        "marketplace_unavailable",
        error instanceof RemoteHttpError ? error.message : "Marketplace validation request failed.",
        502,
      );
    }
  }

  private async ensureProviderPreferences(): Promise<void> {
    const existing = new Set((await this.options.store.listProviderPreferences()).map((item) => item.service));
    const now = new Date().toISOString();
    for (const service of this.snapshot?.actionsByService.keys() ?? []) {
      if (!existing.has(service))
        await this.options.store.setProviderPreference({ service, enabled: true, createdAt: now, updatedAt: now });
    }
  }
}

function parseDiscovery(value: unknown, discoveryUrl: URL): MarketplaceDiscovery {
  if (!value || typeof value !== "object")
    throw new MarketplaceError("invalid_marketplace_discovery", "Marketplace discovery must be an object.");
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.id !== "string" ||
    !record.id ||
    typeof record.name !== "string" ||
    !record.name ||
    (record.pricing !== "free" && record.pricing !== "metered") ||
    !isAbsolutePath(record.validate) ||
    !isAbsolutePath(record.endpoint) ||
    !Array.isArray(record.actions) ||
    !record.actions.every((item) => typeof item === "string" && item.includes("."))
  ) {
    throw new MarketplaceError(
      "invalid_marketplace_discovery",
      "Marketplace discovery does not match the v1 contract.",
    );
  }
  for (const path of [record.validate, record.endpoint] as string[]) {
    const resolved = new URL(path, discoveryUrl);
    if (resolved.origin !== discoveryUrl.origin)
      throw new MarketplaceError(
        "invalid_marketplace_discovery",
        "Marketplace endpoints must use the discovery origin.",
      );
  }
  const actions = [...new Set(record.actions as string[])];
  if (actions.length !== record.actions.length)
    throw new MarketplaceError("invalid_marketplace_discovery", "Marketplace action IDs must be unique.");
  return {
    version: 1,
    id: record.id,
    name: record.name,
    pricing: record.pricing,
    validate: record.validate as string,
    endpoint: record.endpoint as string,
    actions,
  };
}

function isAbsolutePath(value: unknown): boolean {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
  const url = new URL(value, "https://marketplace.invalid");
  return !url.username && !url.password && !url.search && !url.hash;
}
