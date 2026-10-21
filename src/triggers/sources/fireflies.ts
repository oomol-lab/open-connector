import type { CreateEventSource, EventSource, UpdateEventSource } from "./configuration.ts";
import type { EventSourceDefinition } from "./definition.ts";

import { isJsonObject } from "../common/json.ts";
import { SourceIdentityError } from "./definition.ts";
import { verifySourceHmac } from "./signature.ts";

const events = new Set(["meeting.transcribed", "meeting.summarized"]);
export const firefliesAccount: EventSourceDefinition<
  CreateEventSource,
  UpdateEventSource,
  Pick<
    EventSource,
    | "appId"
    | "manageSubscriptions"
    | "verificationTokenConfigured"
    | "encryptKeyConfigured"
    | "signingSecretConfigured"
    | "verifiedAt"
  >
> = {
  kind: "fireflies",
  provider: "fireflies",
  maximumBodyBytes: 64 * 1024,
  initialize(input, accountId) {
    if (input.kind !== "fireflies" || !accountId)
      throw new SourceIdentityError("Connector must provide the verified Fireflies account identity.");
    if (input.eventTypes.some((event) => !events.has(event)))
      throw new SourceIdentityError("Unsupported Fireflies event.");
    return {
      identity: JSON.stringify([input.teamId, input.connectionId, accountId]),
      eventTypes: input.eventTypes,
      config: { appId: accountId, accountId },
      secrets: { signingSecret: input.signingSecret },
      state: {},
    };
  },
  update(source, input) {
    if (input.verificationToken != null || input.encryptKey != null)
      throw new SourceIdentityError("Fireflies uses the Webhooks V2 Signing Secret.");
    if (input.eventTypes.some((event) => !events.has(event)))
      throw new SourceIdentityError("Unsupported Fireflies event.");
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
      manageSubscriptions: false,
      verificationTokenConfigured: false,
      encryptKeyConfigured: false,
      signingSecretConfigured: true,
      verifiedAt: typeof source.state.verifiedAt === "number" ? new Date(source.state.verifiedAt).toISOString() : null,
    };
  },
  ready: (source) => typeof source.state.verifiedAt === "number",
  async receive(source, bytes, headers, now, execute) {
    const signature = headers.get("x-hub-signature") ?? "";
    if (
      !signature.startsWith("sha256=") ||
      !(await verifySourceHmac(bytes, signature.slice(7), String(source.secrets.signingSecret)))
    )
      throw new TypeError("Invalid Fireflies signature.");
    const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!isJsonObject(payload) || typeof payload.event !== "string") throw new TypeError("Invalid Fireflies envelope.");
    if (!events.has(payload.event)) return { response: Response.json({}), state: source.state };
    if (
      typeof payload.meeting_id !== "string" ||
      !payload.meeting_id ||
      payload.meeting_id.length > 256 ||
      !Number.isSafeInteger(payload.timestamp) ||
      Number(payload.timestamp) < 0 ||
      (payload.reprocessed_at != null &&
        (!Number.isSafeInteger(payload.reprocessed_at) || Number(payload.reprocessed_at) <= 0))
    )
      throw new TypeError("Incomplete Fireflies event.");
    if (execute == null) throw new SourceIdentityError("Fireflies meeting verification is unavailable.");
    const identity = await execute({ operation: "sourceIdentity", config: { meetingId: payload.meeting_id } });
    if (
      !isJsonObject(identity) ||
      identity.accountId !== source.config.accountId ||
      identity.meetingId !== payload.meeting_id ||
      typeof identity.accessible !== "boolean"
    )
      throw new SourceIdentityError("Fireflies returned an invalid meeting access result.");
    if (!identity.accessible) return { response: Response.json({}), state: source.state };
    const version = Number(payload.reprocessed_at ?? 0);
    const stream = JSON.stringify([payload.event, payload.meeting_id]);
    const deliveryId = JSON.stringify([payload.event, payload.meeting_id, version]);
    return {
      state: { ...source.state, verifiedAt: now },
      event: {
        id: deliveryId,
        type: payload.event,
        ordering: { key: stream, version },
        payload: {
          event: payload.event,
          deliveryId,
          accountId: source.config.accountId!,
          meetingId: payload.meeting_id,
          body: {
            event: payload.event,
            meeting_id: payload.meeting_id,
            reprocessed_at: payload.reprocessed_at ?? null,
            client_reference_id: typeof payload.client_reference_id === "string" ? payload.client_reference_id : null,
          },
        },
      },
    };
  },
  matches: (config, event) => Array.isArray(config.eventTypes) && config.eventTypes.includes(event.type),
  resources: { triggerId: "fireflies.on_meeting_ready", requests: () => [] },
};
