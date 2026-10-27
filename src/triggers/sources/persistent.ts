import type { IntegrationDefinition } from "../common/integration.ts";
import type { ConnectorProxy } from "../common/proxy.ts";
import type { JsonValue } from "../common/types.ts";
import type { SourceConfiguration } from "./definition.ts";
import type { SourceOperation } from "./operation.ts";

import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { ExecutionError } from "../../core/execution-error.ts";
import { canonicalJsonBytes, digestBytes } from "../common/encoding.ts";
import { executeSourceOperation, sourceCallbackFields } from "./operation.ts";

const reference = z.strictObject({ applicationId: z.string().min(1).max(128), sourceId: z.string().min(1).max(128) });
export const persistentSourceRequestSchema: z.ZodType<PersistentSourceRequest> = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("route"),
    deploymentId: z.string().min(1).max(128),
    applicationId: z.string().min(1).max(128),
    headers: sourceCallbackFields.headers,
    rawBody: sourceCallbackFields.rawBody,
  }),
  z.strictObject({
    action: z.literal("create"),
    deploymentId: z.string().min(1).max(128),
    requestKey: z.string().min(1).max(512),
    input: z.record(z.string(), z.json()),
  }),
  z.strictObject({ action: z.literal("get"), deploymentId: z.string().min(1).max(128), reference }),
  z.strictObject({
    action: z.literal("delete"),
    deploymentId: z.string().min(1).max(128),
    reference: z.union([
      reference,
      z.strictObject({ appId: z.string().min(1).max(512).optional(), requestKey: z.string().min(1).max(512) }),
    ]),
  }),
  z.strictObject({
    action: z.literal("update"),
    deploymentId: z.string().min(1).max(128),
    reference,
    expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    input: z.record(z.string(), z.json()),
  }),
  z.strictObject({
    action: z.literal("receive"),
    deploymentId: z.string().min(1).max(128),
    reference,
    ...sourceCallbackFields,
  }),
  z.strictObject({
    action: z.literal("prepare"),
    deploymentId: z.string().min(1).max(128),
    reference,
    config: z.record(z.string(), z.json()),
    endpointUrl: z.url().optional(),
  }),
  z.strictObject({
    action: z.literal("resource"),
    deploymentId: z.string().min(1).max(128),
    reference,
    key: z.string().min(1).max(512),
    active: z.boolean(),
  }),
]);
type SourceReference = { applicationId: string; sourceId: string };
export type PersistentSourceRequest = { deploymentId: string } & (
  | { action: "route"; applicationId: string; headers: Record<string, string>; rawBody: string }
  | { action: "create"; requestKey: string; input: Readonly<Record<string, JsonValue>> }
  | { action: "get"; reference: SourceReference }
  | { action: "delete"; reference: SourceReference | { appId?: string; requestKey: string } }
  | {
      action: "update";
      reference: SourceReference;
      expectedRevision: number;
      input: Readonly<Record<string, JsonValue>>;
    }
  | ({ action: "receive"; reference: SourceReference } & Omit<
      Extract<SourceOperation, { action: "receive" }>,
      "action" | "source"
    >)
  | { action: "prepare"; reference: SourceReference; config: SourceConfiguration["config"]; endpointUrl?: string }
  | { action: "resource"; reference: SourceReference; key: string; active: boolean }
);

type StoredSource = { connectionId: string } & (
  | { deleted: true }
  | {
      deleted: false;
      accountId: string;
      configuration: Omit<SourceConfiguration, "secrets" | "state">;
      resources?: Record<string, { config: SourceConfiguration["config"]; active: boolean }>;
    }
);
export interface SourceApplication {
  secrets: SourceConfiguration["secrets"];
  state: SourceConfiguration["state"];
  sources: Record<string, StoredSource>;
}
export interface SourceApplicationStore {
  getSourceApplication(owner: string, id: string): Promise<{ revision: number; application: SourceApplication } | null>;
  saveSourceApplication(
    owner: string,
    id: string,
    revision: number | null,
    application: SourceApplication,
  ): Promise<boolean>;
}

export async function executePersistentSource(
  store: SourceApplicationStore,
  definition: IntegrationDefinition,
  owner: { scope: string; connectionId: string },
  request: PersistentSourceRequest,
  connector: ConnectorProxy,
  signal: AbortSignal,
  resource?: (
    config: SourceConfiguration["config"],
    requestKey: string,
    active: boolean,
  ) => Promise<{ outcome: "ready" | "pending"; subscription?: SourceConfiguration["state"] }>,
): Promise<unknown> {
  const source = definition.source;
  if (source == null) throw new ExecutionError("invalid_input", "This Trigger has no persistent Source support.");
  if (request.action === "route")
    return routeSourceApplication(
      store,
      definition,
      owner.scope,
      request,
      (connectionId) => {
        if (connectionId !== owner.connectionId)
          throw new ExecutionError("trigger_not_found", "Source not found.", "not_found");
      },
      signal,
    );
  if (request.action === "delete")
    return deleteSourceReference(
      store,
      definition,
      owner.scope,
      owner.connectionId,
      request,
      (connectionId) => {
        if (connectionId !== owner.connectionId)
          throw new ExecutionError("trigger_not_found", "Source not found.", "not_found");
      },
      signal,
    );
  if (
    (request.action === "create" || request.action === "update") &&
    ["kind", "version", "name", "connectionId", "teamId", "enabled", "expectedRevision"].some(
      (key) => key in request.input,
    )
  )
    throw new ExecutionError("invalid_input", "Source input must only contain provider configuration.");
  const initialized =
    request.action === "create"
      ? (
          await executeSourceOperation(
            definition,
            {
              action: "initialize",
              input: {
                ...request.input,
                kind: source.kind,
                version: 1,
                name: "Source",
                connectionId: owner.connectionId,
                teamId: owner.scope,
              },
            },
            connector,
            signal,
          )
        ).source!
      : undefined;
  const scope = JSON.stringify([owner.scope, request.deploymentId, definition.snapshot.key]);
  const applicationId =
    request.action === "create"
      ? await digestBytes(
          canonicalJsonBytes([scope, source.applicationIngress ? initialized!.config.appId! : request.requestKey]),
        )
      : request.reference.applicationId;
  const sourceId =
    request.action === "create"
      ? await digestBytes(canonicalJsonBytes([applicationId, request.requestKey]))
      : request.reference.sourceId;
  const ref = { applicationId, sourceId };
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    const stored = await store.getSourceApplication(scope, applicationId);
    signal.throwIfAborted();
    let revision = stored?.revision ?? 0;
    const application: SourceApplication = stored?.application ?? { secrets: {}, state: {}, sources: {} };
    let current = application.sources[sourceId];
    if (request.action === "create") {
      if (current?.deleted)
        throw new ExecutionError(
          "invalid_input",
          "This Source creation was already deleted. Use a new request key.",
          "conflict",
        );
      if (
        current &&
        (current.connectionId !== owner.connectionId ||
          current.accountId !== connector.providerAccountId ||
          !isDeepStrictEqual(current.configuration, {
            identity: initialized!.identity,
            eventTypes: initialized!.eventTypes,
            config: initialized!.config,
          }))
      )
        throw new ExecutionError(
          "invalid_input",
          "The Source request key already has different configuration.",
          "conflict",
        );
      const active = Object.values(application.sources).filter((item) => !item.deleted);
      if (active.length && !isDeepStrictEqual(application.secrets, initialized!.secrets))
        throw new ExecutionError(
          "invalid_input",
          "The application already has a different signing secret.",
          "conflict",
        );
      if (!current) {
        if (active.some((item) => item.configuration.identity === initialized!.identity))
          throw new ExecutionError("invalid_input", "This connection and workspace already have a Source.", "conflict");
        if (active.length >= 100)
          throw new ExecutionError(
            "trigger_quota_exceeded",
            "The application Source limit has been reached.",
            "conflict",
          );
        if (!active.length) {
          application.secrets = initialized!.secrets;
          const { projection: _projection, ...state } = initialized!.state;
          application.state = state;
        }
        current = {
          connectionId: owner.connectionId,
          accountId: connector.providerAccountId!,
          configuration: {
            identity: initialized!.identity,
            eventTypes: initialized!.eventTypes,
            config: initialized!.config,
          },
          deleted: false,
        };
        application.sources[sourceId] = current;
        signal.throwIfAborted();
        if (!(await store.saveSourceApplication(scope, applicationId, stored?.revision ?? null, application))) continue;
        revision++;
      }
    } else {
      if (!current || current.connectionId !== owner.connectionId)
        throw new ExecutionError("trigger_not_found", "Source not found.", "not_found");
      if (current.deleted) throw new ExecutionError("trigger_not_found", "Source not found.", "not_found");
      if (current.accountId !== connector.providerAccountId)
        throw new ExecutionError(
          "trigger_connection_error",
          "The Source connection requires reauthorization.",
          "conflict",
        );
      if (request.action === "update") {
        const updated = (
          await executeSourceOperation(
            definition,
            {
              action: "update",
              source: { ...current.configuration, secrets: application.secrets, state: application.state },
              input: {
                ...request.input,
                version: 1,
                expectedRevision: request.expectedRevision,
                name: "Source",
                enabled: true,
              },
            },
            connector,
            signal,
          )
        ).source!;
        const changed =
          !isDeepStrictEqual(updated.eventTypes, current.configuration.eventTypes) ||
          !isDeepStrictEqual(updated.secrets, application.secrets);
        if (changed) {
          if (request.expectedRevision !== revision)
            throw new ExecutionError(
              "invalid_input",
              "The Source application changed. Read it again before updating.",
              "conflict",
            );
          current.configuration = {
            identity: updated.identity,
            config: updated.config,
            eventTypes: updated.eventTypes,
          };
          application.secrets = updated.secrets;
          const { projection: _projection, ...state } = updated.state;
          application.state = state;
          signal.throwIfAborted();
          if (!(await store.saveSourceApplication(scope, applicationId, revision, application))) continue;
          revision++;
        }
      }
    }
    let configuration: SourceConfiguration = {
      ...current!.configuration,
      secrets: application.secrets,
      state: application.state,
    };

    let outcome: "ready" | "pending" | undefined;
    if (request.action === "resource") {
      const demand = current!.resources?.[request.key];
      if (!demand || !resource)
        throw new ExecutionError("invalid_input", "Prepare the Source resource before using it.");
      demand.active = true;
      if (source.resources.managed)
        application.state = { ...application.state, resourceStatus: "pending", lastError: "" };
      signal.throwIfAborted();
      if (!(await store.saveSourceApplication(scope, applicationId, revision, application))) continue;
      revision++;
      let result;
      try {
        result = await resource(
          demand.config,
          JSON.stringify([scope, applicationId, sourceId, request.key]),
          request.active,
        );
      } catch (error) {
        if (source.resources.managed) {
          application.state = {
            ...application.state,
            resourceStatus: "error",
            lastError: "Source subscription could not be confirmed. Retry the operation.",
          };
          await store.saveSourceApplication(scope, applicationId, revision, application);
        }
        throw error;
      }
      outcome = result.outcome;
      if (source.resources.managed) {
        application.state = {
          ...application.state,
          resource: result.subscription ?? {},
          resourceStatus: outcome === "ready" ? (request.active ? "ready" : "idle") : "pending",
          lastError: "",
          verifiedAt: request.active && outcome === "ready" ? Date.now() : null,
        };
      }
      if (!request.active && outcome === "ready") demand.active = false;
      signal.throwIfAborted();
      if (!(await store.saveSourceApplication(scope, applicationId, revision, application))) continue;
      revision++;
      configuration = { ...configuration, state: application.state };
    }
    if (request.action === "receive" || request.action === "prepare") {
      const operation: SourceOperation =
        request.action === "receive"
          ? {
              action: "receive",
              source: configuration,
              headers: request.headers,
              rawBody: request.rawBody,
              consumers: request.consumers,
            }
          : { action: "prepare", source: configuration, config: request.config, endpointUrl: request.endpointUrl };
      const result = await executeSourceOperation(definition, operation, connector, signal);
      if (result.event && !configuration.eventTypes.includes(result.event.type))
        return { response: { status: 200, body: "{}", headers: { "content-type": "application/json" } } };
      if ("source" in result && result.source) {
        const { projection: _projection, ...state } = result.source.state;
        signal.throwIfAborted();
        const resources = !result.subscriptions?.length
          ? current!.resources
          : {
              ...current!.resources,
              ...Object.fromEntries(
                result.subscriptions.map((item) => [
                  item.key,
                  { config: item.config, active: current!.resources?.[item.key]?.active ?? false },
                ]),
              ),
            };
        const resourcesChanged = !isDeepStrictEqual(current!.resources, resources);
        current!.resources = resources;
        if (isDeepStrictEqual(application.state, state) && !resourcesChanged) {
          if ((await store.getSourceApplication(scope, applicationId))?.revision !== stored!.revision) continue;
        } else {
          application.state = state;
          if (!(await store.saveSourceApplication(scope, applicationId, stored!.revision, application))) continue;
          revision++;
        }
        const { source: _source, ...receipt } = result;
        return {
          ...receipt,
          ...(result.subscriptions ? { subscriptions: result.subscriptions.map(({ key }) => ({ key })) } : {}),
          source: {
            reference: ref,
            revision,
            eventTypes: configuration.eventTypes,
            view: source.view({ ...configuration, state }),
            ready: source.ready({ ...configuration, state }, Date.now()),
            expiresAt: source.expiresAt?.({ ...configuration, state }),
          },
        };
      }
      return result;
    }
    return {
      outcome,
      source: {
        reference: ref,
        revision,
        eventTypes: configuration.eventTypes,
        view: source.view(configuration),
        ready: source.ready(configuration, Date.now()),
        expiresAt: source.expiresAt?.(configuration),
      },
    };
  }
  throw new ExecutionError("invalid_input", "The Source changed concurrently. Retry the operation.", "conflict");
}

export async function deleteSourceReference(
  store: SourceApplicationStore,
  definition: IntegrationDefinition,
  owner: string,
  connectionId: string | undefined,
  request: Extract<PersistentSourceRequest, { action: "delete" }>,
  authorize: (connectionId: string) => void,
  signal: AbortSignal,
): Promise<{ deleted: true }> {
  if (definition.source == null)
    throw new ExecutionError("invalid_input", "This Trigger has no persistent Source support.");
  if (!connectionId) throw new ExecutionError("trigger_not_found", "Select the Source connection by ID.", "not_found");
  if ("requestKey" in request.reference && definition.source.applicationIngress && !request.reference.appId)
    throw new ExecutionError("invalid_input", "An application ID is required to delete an unconfirmed Source.");
  const scope = JSON.stringify([owner, request.deploymentId, definition.snapshot.key]);
  const applicationId =
    "requestKey" in request.reference
      ? await digestBytes(
          canonicalJsonBytes([
            scope,
            definition.source.applicationIngress ? (request.reference.appId ?? null) : request.reference.requestKey,
          ]),
        )
      : request.reference.applicationId;
  const sourceId =
    "requestKey" in request.reference
      ? await digestBytes(canonicalJsonBytes([applicationId, request.reference.requestKey]))
      : request.reference.sourceId;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    const stored = await store.getSourceApplication(scope, applicationId);
    const application: SourceApplication = stored?.application ?? { secrets: {}, state: {}, sources: {} };
    const source = application.sources[sourceId];
    if (!source && !("requestKey" in request.reference))
      throw new ExecutionError("trigger_not_found", "Source not found.", "not_found");
    authorize(source?.connectionId ?? connectionId);
    if (source?.deleted) return { deleted: true };
    if (source && Object.values(source.resources ?? {}).some((item) => item.active))
      throw new ExecutionError("invalid_input", "Release Source resources before deletion.", "conflict");
    application.sources[sourceId] = { connectionId: source?.connectionId ?? connectionId, deleted: true };
    if (Object.values(application.sources).every((item) => item.deleted)) {
      application.secrets = {};
      application.state = {};
    }
    signal.throwIfAborted();
    if (await store.saveSourceApplication(scope, applicationId, stored?.revision ?? null, application))
      return { deleted: true };
  }
  throw new ExecutionError("invalid_input", "The Source changed concurrently. Retry the operation.", "conflict");
}

export async function routeSourceApplication(
  store: SourceApplicationStore,
  definition: IntegrationDefinition,
  owner: string,
  request: Extract<PersistentSourceRequest, { action: "route" }>,
  authorize: (connectionId: string) => void,
  signal: AbortSignal,
): Promise<{
  references: SourceReference[];
  response?: { status: number; body: string; headers: Record<string, string> };
}> {
  const source = definition.source;
  if (!source?.applicationIngress) throw new ExecutionError("invalid_input", "This Source has no application ingress.");
  const scope = JSON.stringify([owner, request.deploymentId, definition.snapshot.key]);
  const bytes = Uint8Array.from(Buffer.from(request.rawBody, "base64"));
  if (bytes.byteLength > source.maximumBodyBytes)
    return { references: [], response: { status: 413, body: "", headers: {} } };
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    const stored = await store.getSourceApplication(scope, request.applicationId);
    if (!stored) throw new ExecutionError("trigger_not_found", "Source application not found.", "not_found");
    const references: SourceReference[] = [];
    let response: Response | undefined;
    let state = stored.application.state;
    for (const [sourceId, current] of Object.entries(stored.application.sources)) {
      if (current.deleted) continue;
      let result;
      try {
        result = await source.receive(
          { ...current.configuration, secrets: stored.application.secrets, state: stored.application.state },
          bytes,
          new Headers(request.headers),
          Date.now(),
        );
      } catch (error) {
        signal.throwIfAborted();
        if (!(error instanceof TypeError || error instanceof SyntaxError || error instanceof DOMException)) throw error;
        return { references: [], response: { status: 401, body: "", headers: {} } };
      }
      if ("event" in result) {
        authorize(current.connectionId);
        references.push({ applicationId: request.applicationId, sourceId });
      } else {
        if (!result.response.ok)
          return {
            references: [],
            response: {
              status: result.response.status,
              body: await result.response.text(),
              headers: Object.fromEntries(result.response.headers),
            },
          };
        response ??= result.response;
      }
      if (result.state && !isDeepStrictEqual(result.state, stored.application.state)) state = result.state;
    }
    signal.throwIfAborted();
    if (!isDeepStrictEqual(state, stored.application.state)) {
      if (
        !(await store.saveSourceApplication(scope, request.applicationId, stored.revision, {
          ...stored.application,
          state,
        }))
      )
        continue;
    } else if ((await store.getSourceApplication(scope, request.applicationId))?.revision !== stored.revision) continue;
    return {
      references,
      response:
        references.length || !response
          ? undefined
          : { status: response.status, body: await response.text(), headers: Object.fromEntries(response.headers) },
    };
  }
  throw new ExecutionError("invalid_input", "The Source changed concurrently. Retry the callback.", "conflict");
}
