import type { CreateEventSource, EventSource, UpdateEventSource } from "./configuration.ts";
import type { EventSourceDefinition } from "./definition.ts";

import { isJsonObject } from "../common/json.ts";
import { SourceIdentityError } from "./definition.ts";
import { verifySourceHmac } from "./signature.ts";

const events = new Set(["conversation.user.created", "conversation.user.replied", "ticket.created"]);

export const intercomApplication: EventSourceDefinition<
  CreateEventSource,
  UpdateEventSource,
  Pick<
    EventSource,
    | "appId"
    | "workspaceId"
    | "manageSubscriptions"
    | "verificationTokenConfigured"
    | "encryptKeyConfigured"
    | "signingSecretConfigured"
    | "verifiedAt"
  >
> = {
  kind: "intercom",
  provider: "intercom",
  applicationIngress: true,
  maximumBodyBytes: 64 * 1024,
  initialize(input, accountId) {
    if (input.kind !== "intercom" || accountId == null || !/^[^:]+:[^:]+$/.test(accountId))
      throw new SourceIdentityError(
        "Connector must provide the verified Intercom workspace and administrator identity.",
      );
    if (input.eventTypes.some((event) => !events.has(event)))
      throw new SourceIdentityError("Unsupported Intercom event type.");
    const workspaceId = accountId.split(":")[0]!;
    return {
      identity: JSON.stringify([input.teamId, input.connectionId, input.appId, accountId]),
      eventTypes: input.eventTypes,
      config: { appId: input.appId, workspaceId, accountId },
      secrets: { signingSecret: input.signingSecret },
      state: {},
    };
  },
  update(source, input) {
    if (input.verificationToken != null || input.encryptKey != null)
      throw new SourceIdentityError("Intercom uses the application Client Secret.");
    if (input.eventTypes.some((event) => !events.has(event)))
      throw new SourceIdentityError("Unsupported Intercom event type.");
    const signingSecret = input.signingSecret ?? source.secrets.signingSecret!;
    return {
      ...source,
      eventTypes: input.eventTypes,
      secrets: { signingSecret },
      state: signingSecret === source.secrets.signingSecret ? source.state : {},
    };
  },
  view(source) {
    return {
      appId: String(source.config.appId),
      workspaceId: String(source.config.workspaceId),
      manageSubscriptions: false,
      verificationTokenConfigured: false,
      encryptKeyConfigured: false,
      signingSecretConfigured: true,
      verifiedAt: typeof source.state.verifiedAt === "number" ? new Date(source.state.verifiedAt).toISOString() : null,
    };
  },
  ready: (source) => typeof source.state.verifiedAt === "number",
  async receive(source, bytes, headers, now) {
    const signature = headers.get("x-hub-signature") ?? "";
    if (!/^sha1=[0-9a-f]{40}$/.test(signature)) throw new TypeError("Invalid Intercom signature.");
    if (!(await verifySourceHmac(bytes, signature.slice(5), String(source.secrets.signingSecret), "SHA-1")))
      throw new TypeError("Invalid Intercom signature.");
    const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!isJsonObject(payload) || payload.type !== "notification_event")
      throw new TypeError("Invalid Intercom notification.");
    if (payload.app_id !== source.config.workspaceId) return { response: Response.json({}), state: source.state };
    if (payload.topic === "ping") return { response: Response.json({}), state: { ...source.state, verifiedAt: now } };
    if (typeof payload.topic !== "string" || !events.has(payload.topic))
      return { response: Response.json({}), state: source.state };
    if (
      typeof payload.id !== "string" ||
      !payload.id ||
      !isJsonObject(payload.data) ||
      !isJsonObject(payload.data.item) ||
      typeof payload.data.item.id !== "string"
    )
      throw new TypeError("Incomplete Intercom notification.");
    return {
      event: {
        id: payload.id,
        type: payload.topic,
        payload: {
          event: payload.topic,
          deliveryId: payload.id,
          workspaceId: payload.app_id!,
          objectId: payload.data.item.id,
          body: payload.data.item,
        },
      },
    };
  },
  matches: (config, event) => Array.isArray(config.eventTypes) && config.eventTypes.includes(event.type),
  resources: { triggerId: "intercom.on_conversation_event", requests: () => [] },
};
