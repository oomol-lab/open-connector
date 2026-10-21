import type { IntegrationDefinition } from "../common/integration.ts";
import type { ConnectorProxy } from "../common/proxy.ts";
import type { JsonValue } from "../common/types.ts";
import type { SourceConfiguration } from "./definition.ts";

import { z } from "zod";
import { IntegrationConnectionError, PermanentIntegrationError } from "../common/integration.ts";
import { createEventSourceSchema, updateEventSourceSchema, sourceCreateSchema } from "./configuration-schema.ts";

const jsonObject = z.record(z.string(), z.json());
const configuration = z.object({
  identity: z.string().min(1),
  eventTypes: z.array(z.string()),
  config: jsonObject,
  secrets: jsonObject,
  state: jsonObject,
});
export const sourceOperationSchema: z.ZodType<SourceOperation> = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("initialize"), input: jsonObject }),
  z.strictObject({ action: z.literal("update"), source: configuration, input: jsonObject }),
  z.strictObject({ action: z.literal("inspect"), source: configuration }),
  z.strictObject({
    action: z.literal("prepare"),
    source: configuration,
    config: jsonObject,
    endpointUrl: z.string().optional(),
  }),
  z.strictObject({
    action: z.literal("receive"),
    source: configuration,
    headers: z
      .record(z.string(), z.string().max(8192))
      .refine(
        (headers) =>
          new Set(Object.keys(headers).map((name) => name.toLowerCase())).size === Object.keys(headers).length,
        "Duplicate webhook header.",
      ),
    rawBody: z
      .string()
      .max(90000)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
    consumers: z.array(z.object({ id: z.string(), config: jsonObject })).max(10000),
  }),
]);
export type SourceOperation =
  | { readonly action: "initialize"; readonly input: Readonly<Record<string, JsonValue>> }
  | {
      readonly action: "update";
      readonly source: SourceConfiguration;
      readonly input: Readonly<Record<string, JsonValue>>;
    }
  | { readonly action: "inspect"; readonly source: SourceConfiguration }
  | {
      readonly action: "prepare";
      readonly source: SourceConfiguration;
      readonly config: Readonly<Record<string, JsonValue>>;
      readonly endpointUrl?: string;
    }
  | {
      readonly action: "receive";
      readonly source: SourceConfiguration;
      readonly headers: Readonly<Record<string, string>>;
      readonly rawBody: string;
      readonly consumers: readonly { readonly id: string; readonly config: Readonly<Record<string, JsonValue>> }[];
    };

export function sourceMetadata(definition: IntegrationDefinition):
  | {
      kind: string;
      provider: string;
      triggerId: string;
      maximumBodyBytes: number;
      applicationIngress: boolean;
      managed: boolean;
      createSchema: Record<string, unknown>;
      updateSchema: Record<string, unknown>;
    }
  | undefined {
  const source = definition.source;
  if (source == null) return undefined;
  return {
    createSchema: z.toJSONSchema(sourceCreateSchema(source.kind)),
    updateSchema: z.toJSONSchema(updateEventSourceSchema),
    kind: source.kind,
    provider: source.provider,
    triggerId: source.resources.triggerId,
    maximumBodyBytes: source.maximumBodyBytes,
    applicationIngress: source.applicationIngress === true,
    managed: source.resources.managed === true,
  };
}

export async function executeSourceOperation(
  definition: IntegrationDefinition,
  request: SourceOperation,
  connector: ConnectorProxy,
  signal: AbortSignal,
  now: number = Date.now(),
): Promise<unknown> {
  const source = definition.source;
  if (source == null) throw new PermanentIntegrationError("This Trigger has no shared event source protocol.");
  const execute = async (operation: {
    operation: "sourceIdentity" | "sourceReceive";
    config: Readonly<Record<string, JsonValue>>;
    headers?: Readonly<Record<string, string>>;
    rawBody?: string;
  }) => {
    const context = { config: operation.config, connector, now: new Date(now), signal };
    if (operation.operation === "sourceIdentity") {
      if (definition.sourceIdentity == null)
        throw new PermanentIntegrationError("Source identity verification is unavailable.");
      return definition.sourceIdentity(context);
    }
    if (definition.sourceReceive == null)
      throw new PermanentIntegrationError("Source callback verification is unavailable.");
    return definition.sourceReceive({ ...context, headers: operation.headers!, rawBody: operation.rawBody! });
  };
  const project = (configuration: SourceConfiguration): SourceConfiguration => ({
    ...configuration,
    state: {
      ...configuration.state,
      projection: JSON.parse(
        JSON.stringify({
          view: source.view(configuration, now),
          ready: source.ready(configuration, now),
          expiresAt: source.expiresAt?.(configuration),
        }),
      ) as JsonValue,
    },
  });
  switch (request.action) {
    case "initialize": {
      const parsed = createEventSourceSchema.safeParse(request.input);
      if (!parsed.success) throw new PermanentIntegrationError("Invalid event source configuration.");
      const input = parsed.data;
      let configuration = source.initialize(input, connector.providerAccountId);
      if (source.verifyIdentity != null)
        configuration = await source.verifyIdentity(configuration, (config) =>
          execute({ operation: "sourceIdentity", config }),
        );
      return { source: project(configuration) };
    }
    case "update": {
      const parsed = updateEventSourceSchema.safeParse(request.input);
      if (!parsed.success) throw new PermanentIntegrationError("Invalid event source update.");
      return { source: project(source.update(request.source, parsed.data)) };
    }
    case "inspect":
      return { source: project(request.source) };
    case "prepare": {
      if (connector.providerAccountId !== (request.source.config.accountId ?? request.source.identity))
        throw new IntegrationConnectionError("The source Connection requires reauthorization.");
      if (source.verifyIdentity != null)
        await source.verifyIdentity(request.source, (config) => execute({ operation: "sourceIdentity", config }));
      if (!source.resources.managed && !source.ready(request.source, now))
        throw new PermanentIntegrationError("Verify the event source before publishing.");
      if (
        !Array.isArray(request.config.eventTypes) ||
        !request.config.eventTypes.every((type) => typeof type === "string" && request.source.eventTypes.includes(type))
      )
        throw new PermanentIntegrationError("Configure the requested events on the event source first.");
      return {
        source: project(request.source),
        subscriptions: source.resources.requests(request.source, source.provider, request.config, request.endpointUrl),
      };
    }
    case "receive": {
      const bytes = Uint8Array.from(atob(request.rawBody), (value) => value.charCodeAt(0));
      if (bytes.byteLength > source.maximumBodyBytes) return { response: { status: 413, body: "", headers: {} } };
      let result;
      try {
        result = await source.receive(request.source, bytes, new Headers(request.headers), now, execute);
      } catch (error) {
        signal.throwIfAborted();
        if (!(error instanceof TypeError || error instanceof SyntaxError || error instanceof DOMException)) throw error;
        return { response: { status: 401, body: "", headers: {} } };
      }
      signal.throwIfAborted();
      const configuration = project({ ...request.source, state: result.state ?? request.source.state });
      if ("response" in result)
        return {
          source: configuration,
          response: {
            status: result.response.status,
            body: await result.response.text(),
            headers: Object.fromEntries(result.response.headers),
          },
        };
      return {
        source: configuration,
        event: {
          ...result.event,
          matches: request.consumers
            .filter((consumer) => source.matches(consumer.config, result.event))
            .map((consumer) => consumer.id),
        },
      };
    }
  }
}
