import type { CatalogStore } from "../catalog-store.ts";
import type { ConnectionService } from "../connection-service.ts";
import type { ActionPolicySnapshot } from "../core/action-policy.ts";
import type { ProviderHttpDispatchOptions } from "../core/provider-http-dispatch.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { RuntimeGrant } from "../server/storage/runtime-token-service.ts";
import type { IntegrationDefinition } from "./common/integration.ts";
import type { PollDefinition } from "./common/poll.ts";
import type { ConnectorProxy } from "./common/proxy.ts";
import type { TriggerRequest } from "./request.ts";
import type { TriggerSubscription, TriggerStore } from "./store.ts";

import { ConnectionError } from "../connection-service.ts";
import { optionalInteger, optionalRecord } from "../core/cast.ts";
import { withProviderHttpDispatch } from "../core/provider-http-dispatch.ts";
import { withProviderHttpDispatchResult } from "../providers/provider-runtime.ts";
import { HttpRequestError } from "../server/api/http-utils.ts";
import { mapConnectionErrorStatus } from "../server/api/runtime-api.ts";
import { resolveTriggerConfig } from "./common/config.ts";
import { validateListenerPage } from "./common/integration.ts";
import {
  executeResourceSubscription,
  executeResourceSubscriptionOperation,
  abandonResourceSubscription,
} from "./resources.ts";
import { executeSubscription, executeSubscriptionOperation } from "./subscriptions.ts";

interface TriggerRunnerOptions {
  providerHttpDispatch?: ProviderHttpDispatchOptions;
  catalog: CatalogStore;
  providerLoader: IProviderLoader;
  connections: ConnectionService;
  store: TriggerStore;
}
export interface RunTriggerInput {
  service: string;
  triggerId: string;
  connectionName?: string;
  connectionId?: string;
  policy: ActionPolicySnapshot;
  grant?: RuntimeGrant;
  request: TriggerRequest;
  signal: AbortSignal;
}

export class TriggerRunner {
  private readonly options: TriggerRunnerOptions;
  constructor(options: TriggerRunnerOptions) {
    this.options = options;
  }

  async run(input: RunTriggerInput): Promise<unknown> {
    const provider = this.options.catalog.providers.find((candidate) => candidate.service === input.service);
    return withProviderHttpDispatch(
      { operation: "trigger", service: provider?.service },
      () => this.runTrigger(input),
      this.options.providerHttpDispatch,
    );
  }

  private async runTrigger(input: RunTriggerInput): Promise<unknown> {
    const decision = input.policy.evaluateTrigger(input.triggerId);
    if (!decision.allowed) throw new HttpRequestError(decision.code, decision.message, 403);
    const stateful = input.request.operation !== "read" && input.request.operation !== "options";
    if (stateful && !input.grant)
      throw new HttpRequestError(
        "trigger_owner_required",
        "Stateful Trigger operations require a persistent runtime token.",
        403,
      );
    const definition = await this.definition(input.service, input.triggerId);
    const target = await this.target(
      input.service,
      input.connectionName,
      input.connectionId,
      input.signal,
      input.policy,
    );
    const request = input.request;
    if (request.operation === "receive") {
      if (definition.snapshot.type !== "integration" || ("eventSource" in definition && definition.eventSource))
        throw new HttpRequestError("invalid_input", "This Trigger has no remote webhook.");
      return this.providerOperation(input.service, () =>
        executeSubscription(
          this.options.store,
          definition as IntegrationDefinition,
          { ...target.owner, tokenId: input.grant!.tokenId, triggerId: input.triggerId },
          request,
          target.proxy,
          input.signal,
        ),
      );
    }
    const config = resolveTriggerConfig(
      definition.snapshot.configInputs,
      request.config,
      request.operation === "options",
    );
    const context = { config, connector: target.proxy, now: new Date(), signal: input.signal };
    return this.providerOperation(input.service, async () => {
      switch (request.operation) {
        case "options": {
          if (
            !definition.configOptions ||
            !definition.snapshot.configInputs.some((field) => "handle" in field && field.handle === request.field)
          )
            throw new HttpRequestError("invalid_input", "This Trigger has no options for the selected field.");
          return definition.configOptions({ ...context, field: request.field });
        }
        case "read": {
          if (definition.snapshot.type === "poll")
            return (definition as PollDefinition).poll({ ...context, checkpoint: request.checkpoint });
          const listener = (definition as IntegrationDefinition).listener;
          if (!listener) throw new HttpRequestError("invalid_input", "This Trigger cannot be read.");
          const page = await listener.read({ ...context, checkpoint: request.checkpoint });
          validateListenerPage(page);
          return page;
        }
        case "reconcile":
          if (definition.snapshot.type !== "integration" || (definition as IntegrationDefinition).eventSource)
            throw new HttpRequestError("invalid_input", "This Trigger has no remote webhook.");
          return executeSubscription(
            this.options.store,
            definition as IntegrationDefinition,
            { ...target.owner, tokenId: input.grant!.tokenId, triggerId: input.triggerId },
            { ...request, config },
            target.proxy,
            input.signal,
          );
        case "resource":
          if (!(definition as IntegrationDefinition).resources)
            throw new HttpRequestError("invalid_input", "This Trigger has no shared resource.");
          return executeResourceSubscription(
            this.options.store,
            (definition as IntegrationDefinition).resources!,
            { ...target.owner, tokenId: input.grant!.tokenId, triggerId: input.triggerId },
            { ...request, config },
            target.proxy,
            input.signal,
          );
      }
    });
  }

  async cleanup(record: TriggerSubscription, save: () => Promise<void>, signal: AbortSignal): Promise<void> {
    const target = await this.target(record.service, undefined, record.connectionId, signal);
    if (target.owner.providerAccountId !== record.providerAccountId)
      throw new HttpRequestError(
        "trigger_connection_error",
        "The subscription's original provider account is unavailable.",
        409,
      );
    record.connectionRevision = target.owner.connectionRevision;
    const definition = await this.definition(record.service, record.triggerId);
    if (record.mode === "resource") {
      if (!(definition as IntegrationDefinition).resources)
        throw new HttpRequestError("trigger_not_supported", "Resource subscriptions are unavailable.", 501);
      await this.providerOperation(record.service, () =>
        executeResourceSubscriptionOperation(
          this.options.store,
          (definition as IntegrationDefinition).resources!,
          record,
          save,
          { operation: "resource", config: record.config, active: false, requestKey: record.requestKey },
          target.proxy,
          signal,
        ),
      );
    } else {
      if (definition.snapshot.type !== "integration")
        throw new HttpRequestError("trigger_not_found", "The remote Trigger definition is unavailable.", 404);
      await this.providerOperation(record.service, () =>
        executeSubscriptionOperation(
          record,
          save,
          definition as IntegrationDefinition,
          {
            operation: "reconcile",
            config: record.config,
            endpointUrl: record.endpointUrl,
            requestKey: record.requestKey,
            subscriptionId: record.id,
            active: false,
          },
          target.proxy,
          signal,
        ),
      );
    }
  }

  async abandonResource(record: TriggerSubscription, signal: AbortSignal): Promise<void> {
    const definition = await this.definition(record.service, record.triggerId);
    const resources = (definition as IntegrationDefinition).resources;
    if (!resources) throw new HttpRequestError("trigger_not_supported", "Resource subscriptions are unavailable.", 501);
    await abandonResourceSubscription(this.options.store, resources, record, signal);
  }

  private async definition(service: string, triggerId: string): Promise<IntegrationDefinition | PollDefinition> {
    if (!this.options.catalog.providers.some((provider) => provider.service === service))
      throw new HttpRequestError("provider_not_found", "Provider not found.", 404);
    const definitions = await this.options.providerLoader.loadTriggerDefinitions?.(service);
    const definition = definitions?.find(
      (candidate) => candidate.snapshot.key === triggerId && candidate.snapshot.provider === service,
    );
    if (!definition) throw new HttpRequestError("trigger_not_found", "Trigger not found.", 404);
    return definition;
  }

  private async target(
    service: string,
    connectionName: string | undefined,
    connectionId: string | undefined,
    signal: AbortSignal,
    policy?: ActionPolicySnapshot,
  ) {
    try {
      const summary = await this.options.connections.getConnectionSummary(service, connectionName, connectionId);
      const permission = policy?.evaluateConnection(summary?.id);
      if (permission && !permission.allowed) throw new HttpRequestError(permission.code, permission.message, 403);
      const target = await this.options.connections.resolveForExecution(service, connectionName, connectionId);
      if (target.kind !== "local")
        throw new HttpRequestError(
          "trigger_source_not_supported",
          "Triggers require a local connection; this connection source is not supported.",
          501,
        );
      const selected = policy?.evaluateConnection(target.summary?.id);
      if (selected && !selected.allowed) throw new HttpRequestError(selected.code, selected.message, 403);
      const credential = await target.getCredential(service);
      if (!credential || credential.authType === "no_auth" || !target.summary)
        throw new HttpRequestError("connection_not_found", "Trigger connection not found.", 404);
      const stored = await this.options.connections.getStoredConnection(target.summary.id);
      if (
        !stored ||
        stored.source === "saas" ||
        stored.credential.authType === "no_auth" ||
        stored.credential.profile.accountId !== credential.profile.accountId
      )
        throw new HttpRequestError(
          "trigger_connection_error",
          "The selected connection changed during Trigger execution.",
          409,
        );
      const executor = await this.options.providerLoader.loadProxyExecutor(service);
      if (!executor) throw new HttpRequestError("trigger_not_supported", "The provider has no Trigger transport.", 501);
      const proxy: ConnectorProxy = {
        execute: async (request, requestSignal) => {
          signal.throwIfAborted();
          const result = await withProviderHttpDispatch(
            {
              operation: "trigger",
              service,
              connectionId: stored.id,
              connectionName: stored.connectionName,
            },
            () =>
              executor(request, {
                getCredential: target.getCredential,
                signal: requestSignal ?? signal,
              }),
            this.options.providerHttpDispatch,
          );
          if (result.ok) return result.response;
          const status = optionalInteger(optionalRecord(result.error.details)?.status) ?? 502;
          return { status, data: { error: result.error.message } };
        },
      };
      return {
        proxy,
        owner: {
          service,
          connectionId: stored.id,
          connectionRevision: stored.revision,
          providerAccountId: credential.profile.accountId,
        },
      };
    } catch (error) {
      if (error instanceof ConnectionError)
        throw new HttpRequestError(error.code, error.message, mapConnectionErrorStatus(error));
      throw error;
    }
  }

  private async providerOperation<T>(service: string, run: () => Promise<T>): Promise<T> {
    return withProviderHttpDispatchResult(
      { operation: "trigger", service },
      () => this.runProviderOperation(run),
      this.options.providerHttpDispatch,
    );
  }

  private async runProviderOperation<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "IntegrationConnectionError" || error.name === "PollConnectionError")
          throw new HttpRequestError("trigger_connection_error", "The Trigger connection could not be used.", 409);
        if (error.name === "TransientIntegrationError" || error.name === "TransientPollError")
          throw new HttpRequestError("proxy_upstream_error", "The Trigger provider is temporarily unavailable.", 503);
        if (error.name === "PermanentIntegrationError" || error.name === "PermanentPollError")
          throw new HttpRequestError("invalid_input", error.message);
      }
      throw error;
    }
  }
}
