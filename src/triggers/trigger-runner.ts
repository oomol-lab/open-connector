import type { CatalogStore } from "../catalog-store.ts";
import type { ConnectionService } from "../connection-service.ts";
import type { ActionPolicySnapshot } from "../core/action-policy.ts";
import type { RuntimeExecutionOptions } from "../core/runtime-execution.ts";
import type { OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { RuntimeGrant } from "../server/storage/runtime-token-service.ts";
import type { IntegrationDefinition } from "./common/integration.ts";
import type { PollDefinition } from "./common/poll.ts";
import type { ConnectorProxy } from "./common/proxy.ts";
import type { TriggerRequest } from "./request.ts";
import type { TriggerSubscription, TriggerStore } from "./store.ts";

import { ConnectionError } from "../connection-error.ts";
import { optionalInteger, optionalRecord } from "../core/cast.ts";
import { ExecutionError } from "../core/execution-error.ts";
import { connectionExecutionError } from "../core/execution-error.ts";
import { withProviderHttpDispatch } from "../core/provider-http-dispatch.ts";
import { withRuntimeExecution } from "../core/runtime-execution.ts";
import { resolveExecutionTarget } from "../execution-target.ts";
import { readOAuthClientConfigMetadata } from "../oauth/oauth-client-config-service.ts";
import { withProviderHttpDispatchResult } from "../providers/provider-runtime.ts";
import { resolveTriggerConfig } from "./common/config.ts";
import { PermanentIntegrationError } from "./common/integration.ts";
import { validateListenerPage } from "./common/integration.ts";
import {
  executeResourceSubscription,
  executeResourceSubscriptionOperation,
  abandonResourceSubscription,
} from "./resources.ts";
import { executeSubscription, executeSubscriptionOperation } from "./subscriptions.ts";

interface TriggerRunnerOptions extends RuntimeExecutionOptions {
  oauthClientConfigs?: Pick<OAuthClientConfigService, "getConfig">;
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
    return withRuntimeExecution(this.options, { operation: "trigger", service: provider?.service }, () =>
      this.runTrigger(input),
    );
  }

  private async runTrigger(input: RunTriggerInput): Promise<unknown> {
    const decision = input.policy.evaluateTrigger(input.triggerId);
    if (!decision.allowed) throw new ExecutionError(decision.code, decision.message, "forbidden");
    const stateful = !["read", "options", "source"].includes(input.request.operation);
    if (
      (stateful || (input.request.operation === "source" && input.request.request.action === "receive")) &&
      !input.grant
    )
      throw new ExecutionError(
        "trigger_owner_required",
        "Stateful Trigger operations require a persistent runtime token.",
        "forbidden",
      );
    const definition = await this.definition(input.service, input.triggerId);
    const target = await this.target(
      input.service,
      input.connectionName,
      input.connectionId,
      input.signal,
      input.policy,
    );
    const permission = this.options.catalog.providers
      .find((provider) => provider.service === input.service)
      ?.triggerPermissions?.find((permission) => permission.id === input.triggerId);
    const alternatives = permission?.providerScopeAlternatives;
    const cleanup =
      (input.request.operation === "reconcile" || input.request.operation === "resource") && !input.request.active;
    if (!cleanup && alternatives && !alternatives.some((scope) => target.scopes.includes(scope)))
      throw new ExecutionError("scope_missing", "The Trigger requires additional provider permissions.", "forbidden");
    const request = input.request;
    if (request.operation === "source") {
      const { executeSourceOperation } = await import("./sources/operation.ts");
      if (!("source" in definition) || !definition.source)
        throw new ExecutionError("invalid_input", "This Trigger has no shared source protocol.");
      return this.providerOperation(input.service, () =>
        executeSourceOperation(definition, request.request, target.proxy, input.signal),
      );
    }
    if (request.operation === "receive") {
      if (!("receive" in definition) || definition.eventSource)
        throw new ExecutionError("invalid_input", "This Trigger has no remote webhook.");
      return this.providerOperation(input.service, () =>
        executeSubscription(
          this.options.store,
          definition,
          { ...target.owner, tokenId: input.grant!.tokenId, triggerId: input.triggerId },
          request,
          target.proxy,
          input.signal,
        ),
      );
    }
    if (request.operation === "resource") {
      if (!("resources" in definition) || !definition.resources)
        throw new ExecutionError("invalid_input", "This Trigger has no shared resource.");
      const resources = definition.resources;
      const config =
        "reconcile" in resources
          ? request.config
          : resolveTriggerConfig(definition.snapshot.configInputs, request.config);
      return this.providerOperation(input.service, () =>
        executeResourceSubscription(
          this.options.store,
          resources,
          { ...target.owner, tokenId: input.grant!.tokenId, triggerId: input.triggerId },
          { ...request, config },
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
            throw new ExecutionError("invalid_input", "This Trigger has no options for the selected field.");
          return definition.configOptions({ ...context, field: request.field });
        }
        case "read": {
          if ("poll" in definition) return definition.poll({ ...context, checkpoint: request.checkpoint });
          const listener = definition.listener;
          if (!listener) throw new ExecutionError("invalid_input", "This Trigger cannot be read.");
          const page = await listener.read({ ...context, checkpoint: request.checkpoint });
          validateListenerPage(page);
          return page;
        }
        case "reconcile":
          if (!("reconcile" in definition) || definition.eventSource)
            throw new ExecutionError("invalid_input", "This Trigger has no remote webhook.");
          return executeSubscription(
            this.options.store,
            definition,
            { ...target.owner, tokenId: input.grant!.tokenId, triggerId: input.triggerId },
            { ...request, config },
            target.proxy,
            input.signal,
          );
      }
    });
  }

  async cleanup(record: TriggerSubscription, save: () => Promise<void>, signal: AbortSignal): Promise<void> {
    return withRuntimeExecution(this.options, { operation: "trigger", service: record.service }, async () => {
      const target = await this.target(record.service, undefined, record.connectionId, signal);
      if (target.owner.providerAccountId !== record.providerAccountId)
        throw new ExecutionError(
          "trigger_connection_error",
          "The subscription's original provider account is unavailable.",
          "conflict",
        );
      record.connectionRevision = target.owner.connectionRevision;
      const definition = await this.definition(record.service, record.triggerId);
      if (record.mode === "resource") {
        if (!("resources" in definition) || !definition.resources)
          throw new ExecutionError("trigger_not_supported", "Resource subscriptions are unavailable.", "unsupported");
        const resources = definition.resources;
        await this.providerOperation(record.service, () =>
          executeResourceSubscriptionOperation(
            this.options.store,
            resources,
            record,
            save,
            { operation: "resource", config: record.config, active: false, requestKey: record.requestKey },
            target.proxy,
            signal,
          ),
        );
      } else {
        if (!("reconcile" in definition))
          throw new ExecutionError("trigger_not_found", "The remote Trigger definition is unavailable.", "not_found");
        await this.providerOperation(record.service, () =>
          executeSubscriptionOperation(
            record,
            save,
            definition,
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
    });
  }

  async abandonResource(record: TriggerSubscription, signal: AbortSignal): Promise<void> {
    return withRuntimeExecution(this.options, { operation: "trigger", service: record.service }, async () => {
      const definition = await this.definition(record.service, record.triggerId);
      if (!("resources" in definition) || !definition.resources)
        throw new ExecutionError("trigger_not_supported", "Resource subscriptions are unavailable.", "unsupported");
      await abandonResourceSubscription(this.options.store, definition.resources, record, signal);
    });
  }

  private async definition(service: string, triggerId: string): Promise<IntegrationDefinition | PollDefinition> {
    if (!this.options.catalog.providers.some((provider) => provider.service === service))
      throw new ExecutionError("provider_not_found", "Provider not found.", "not_found");
    const definitions = await this.options.providerLoader.loadTriggerDefinitions?.(service);
    const definition = definitions?.find(
      (candidate) => candidate.snapshot.key === triggerId && candidate.snapshot.provider === service,
    );
    if (!definition) throw new ExecutionError("trigger_not_found", "Trigger not found.", "not_found");
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
      const target = await resolveExecutionTarget({
        connections: this.options.connections,
        service,
        connectionName,
        connectionId,
        operation: "trigger",
        policy,
        signal,
      });
      const credential = await target.getCredential(service);
      if (!credential || credential.authType === "no_auth" || !target.summary)
        throw new ExecutionError("connection_not_found", "Trigger connection not found.", "not_found");
      const stored = await this.options.connections.getStoredConnection(target.summary.id);
      if (
        !stored ||
        stored.source === "saas" ||
        stored.credential.authType === "no_auth" ||
        stored.credential.profile.accountId !== credential.profile.accountId
      )
        throw new ExecutionError(
          "trigger_connection_error",
          "The selected connection changed during Trigger execution.",
          "conflict",
        );
      const executor = await this.options.providerLoader.loadProxyExecutor(service);
      if (!executor)
        throw new ExecutionError("trigger_not_supported", "The provider has no Trigger transport.", "unsupported");
      let oauthClientConfig: ConnectorProxy["oauthClientConfig"];
      if (service === "jira" && credential.authType === "oauth2") {
        oauthClientConfig = readOAuthClientConfigMetadata(service, credential.metadata);
        if (!oauthClientConfig?.clientSecret) {
          const configured = await this.options.oauthClientConfigs?.getConfig(service);
          if (oauthClientConfig == null) oauthClientConfig = configured;
          else if (configured?.clientId === oauthClientConfig.clientId)
            oauthClientConfig = { ...oauthClientConfig, clientSecret: configured.clientSecret };
        }
      }
      const proxy: ConnectorProxy = {
        authType: credential.authType,
        oauthClientConfig,
        providerAccountId: credential.profile.accountId,
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
        scopes: credential.profile.grantedScopes,
        owner: {
          service,
          connectionId: stored.id,
          connectionRevision: stored.revision,
          providerAccountId: credential.profile.accountId,
        },
      };
    } catch (error) {
      if (error instanceof ConnectionError) throw connectionExecutionError(error);
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
          throw new ExecutionError("trigger_connection_error", "The Trigger connection could not be used.", "conflict");
        if (error.name === "TransientIntegrationError" || error.name === "TransientPollError")
          throw new ExecutionError(
            "proxy_upstream_error",
            "The Trigger provider is temporarily unavailable.",
            "unavailable",
          );
        if (error.name === "PermanentIntegrationError" || error.name === "PermanentPollError")
          throw new ExecutionError(
            error instanceof PermanentIntegrationError ? (error.reason ?? "invalid_input") : "invalid_input",
            error.message,
          );
      }
      throw error;
    }
  }
}
