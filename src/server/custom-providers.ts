import type { ProviderDefinition } from "../core/types.ts";
import type { ExecutorModule, ExecutorModules } from "../providers/provider-loader.ts";
import type { TriggerKeySnapshot } from "../triggers/common/types.ts";
import type { CustomMcpStore } from "./storage/custom-mcp-store.ts";

import { PromiseCache } from "../core/promise-cache.ts";
import { assertProviderId } from "../core/provider-id.ts";

/** A provider supplied by the host, for example from a separate npm package, instead of the bundled registry. */
export interface CustomProvider {
  /** Catalog entry: auth, categories and action schemas. `service` must not collide with a bundled provider. */
  definition: ProviderDefinition;
  /**
   * Loaded the first time an action, proxy, credential validator, trigger or OAuth operation of the provider runs.
   * Concurrent first uses share one call; a rejected load is retried on the next use.
   */
  load: () => Promise<ExecutorModule>;
}

export interface CustomProviderRegistration {
  /** Executor modules of the bundled providers this entry point can run. */
  bundledModules: ExecutorModules;
  /** Every service id the package bundles, including providers this entry point cannot run. */
  bundledServices: Iterable<string>;
  customProviders: readonly CustomProvider[];
}

// Ids that name `Object.prototype` members and would misbehave as keys of a provider map.
const reservedServices = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Validate host-supplied providers and return the executor registry with them added next to the bundled modules.
 * Throws when a definition is malformed or its service id is bundled or repeated.
 */
export function registerCustomProviders(registration: CustomProviderRegistration): ExecutorModules {
  const bundledServices = new Set(registration.bundledServices);
  const modules: ExecutorModules = Object.assign(Object.create(null), registration.bundledModules);
  for (const provider of registration.customProviders) {
    const service = provider.definition.service;
    assertCustomProviderDefinition(provider.definition);
    if (bundledServices.has(service) || Object.hasOwn(modules, service))
      throw new Error(`Provider service already registered: ${service}`);
    modules[service] = loadOnce(service, provider.load);
  }
  return modules;
}

/**
 * Refuse a stored custom MCP provider whose service id is also registered through `customProviders`; the MCP record
 * would otherwise take over the host provider's actions.
 */
export async function assertNoCustomMcpOverlap(store: CustomMcpStore, services: readonly string[]): Promise<void> {
  if (services.length === 0) return;
  const registered = new Set(services);
  const overlap = (await store.list()).find((record) => registered.has(record.service));
  if (overlap)
    throw new Error(
      `Custom MCP provider ${overlap.service} is stored in the runtime database with the same service id as a provider in customProviders. ` +
        `Delete it with DELETE /api/custom-mcp/${overlap.service} from a runtime started without that custom provider, or give the custom provider another service id.`,
    );
}

function assertCustomProviderDefinition(definition: ProviderDefinition): void {
  const service = definition.service;
  assertProviderId(service, "provider service");
  if (reservedServices.has(service)) throw new Error(`provider service is reserved: ${service}`);
  const actionIds = new Set<string>();
  for (const action of definition.actions) {
    if (action.service !== service || !action.id.startsWith(`${service}.`))
      throw new Error(`Action ${action.id} does not belong to provider ${service}`);
    if (actionIds.has(action.id)) throw new Error(`Duplicate action id in provider ${service}: ${action.id}`);
    actionIds.add(action.id);
  }
  assertTriggersBelong(service, definition.triggers ?? []);
  for (const permission of definition.triggerPermissions ?? []) {
    if (!permission.id.startsWith(`${service}.`))
      throw new Error(`Trigger permission ${permission.id} does not belong to provider ${service}`);
  }
}

function assertTriggersBelong(service: string, triggers: readonly TriggerKeySnapshot[]): void {
  for (const trigger of triggers) {
    if (trigger.provider !== service || !trigger.key.startsWith(`${service}.`))
      throw new Error(`Trigger ${trigger.key} does not belong to provider ${service}`);
  }
}

function loadOnce(service: string, load: () => Promise<ExecutorModule>): () => Promise<ExecutorModule> {
  const cache = new PromiseCache<ExecutorModule>();
  return () =>
    cache.get(service, async () => {
      const module = await load();
      assertTriggersBelong(
        service,
        (module.triggers ?? []).map((trigger) => trigger.snapshot),
      );
      return module;
    });
}
