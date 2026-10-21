import type { CreateEventSource, EventSource, UpdateEventSource } from "./configuration.ts";
import type { EventSourceDefinition } from "./definition.ts";

import { isJsonObject } from "../common/json.ts";
import { SourceIdentityError } from "./definition.ts";
import { verifySourceHmac } from "./signature.ts";

const encoder = new TextEncoder();
export const zoomApplication: EventSourceDefinition<
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
  kind: "zoom",
  provider: "zoom",
  applicationIngress: true,
  maximumBodyBytes: 64 * 1024,
  initialize(input, accountId) {
    if (input.kind !== "zoom" || !accountId)
      throw new SourceIdentityError("Connector must provide the verified Zoom connection identity.");
    if (input.eventTypes.length !== 1 || input.eventTypes[0] !== "recording.completed")
      throw new SourceIdentityError("Only completed Zoom cloud recordings are supported.");
    return {
      identity: JSON.stringify([input.teamId, input.connectionId, input.appId, accountId]),
      eventTypes: input.eventTypes,
      config: { appId: input.appId, accountId },
      secrets: { signingSecret: input.signingSecret },
      state: {},
    };
  },
  async verifyIdentity(source, read) {
    const identity = await read(source.config);
    if (
      !isJsonObject(identity) ||
      identity.accountId !== source.config.accountId ||
      typeof identity.userId !== "string" ||
      !identity.userId ||
      typeof identity.zoomAccountId !== "string" ||
      !identity.zoomAccountId
    )
      throw new SourceIdentityError("Zoom did not return the connected user and account identity.");
    if (
      source.config.userId != null &&
      (source.config.userId !== identity.userId || source.config.zoomAccountId !== identity.zoomAccountId)
    )
      throw new SourceIdentityError("The Zoom user or account changed. Recreate the event source.");
    return { ...source, config: { ...source.config, userId: identity.userId, zoomAccountId: identity.zoomAccountId } };
  },
  update(source, input) {
    if (input.verificationToken != null || input.encryptKey != null)
      throw new SourceIdentityError("Zoom uses the Webhook Secret Token.");
    if (input.eventTypes.length !== 1 || input.eventTypes[0] !== "recording.completed")
      throw new SourceIdentityError("Only completed Zoom cloud recordings are supported.");
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
  async receive(source, bytes, headers, now) {
    const timestamp = headers.get("x-zm-request-timestamp") ?? "";
    const signature = headers.get("x-zm-signature") ?? "";
    if (
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(now - Number(timestamp) * 1000) > 300000 ||
      !signature.startsWith("v0=")
    )
      throw new TypeError("Invalid Zoom signature or timestamp.");
    const prefix = encoder.encode(`v0:${timestamp}:`);
    const signed = new Uint8Array(prefix.length + bytes.length);
    signed.set(prefix);
    signed.set(bytes, prefix.length);
    if (!(await verifySourceHmac(signed, signature.slice(3), String(source.secrets.signingSecret))))
      throw new TypeError("Invalid Zoom signature.");
    const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!isJsonObject(payload) || !isJsonObject(payload.payload)) throw new TypeError("Invalid Zoom envelope.");
    if (payload.event === "endpoint.url_validation") {
      const plainToken = payload.payload.plainToken;
      if (typeof plainToken !== "string" || !plainToken || plainToken.length > 1024)
        throw new TypeError("Invalid Zoom challenge.");
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(String(source.secrets.signingSecret)),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(plainToken));
      const encryptedToken = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
        "",
      );
      return { response: Response.json({ plainToken, encryptedToken }), state: { ...source.state, verifiedAt: now } };
    }
    const object = payload.payload.object;
    if (
      payload.event !== "recording.completed" ||
      payload.payload.account_id !== source.config.zoomAccountId ||
      !isJsonObject(object) ||
      object.host_id !== source.config.userId
    )
      return { response: Response.json({}), state: source.state };
    if (typeof object.uuid !== "string" || !object.uuid || !Array.isArray(object.recording_files))
      throw new TypeError("Incomplete Zoom recording.");
    const files = object.recording_files.filter((file) => isJsonObject(file) && file.status === "completed");
    if (!files.length) return { response: Response.json({}), state: source.state };
    return {
      event: {
        id: object.uuid,
        type: "recording.completed",
        payload: {
          event: "recording.completed",
          deliveryId: object.uuid,
          accountId: payload.payload.account_id!,
          meetingUuid: object.uuid,
          body: { ...object, recording_files: files },
        },
      },
    };
  },
  matches: (config, event) => Array.isArray(config.eventTypes) && config.eventTypes.includes(event.type),
  resources: { triggerId: "zoom.on_recording_ready", requests: () => [] },
};
