import type { CreateEventSource, EventSource, UpdateEventSource } from "./configuration.ts";
import type { EventSourceDefinition } from "./definition.ts";

import { isJsonObject } from "../common/json.ts";
import { SourceIdentityError } from "./definition.ts";
import { verifySourceHmac } from "./signature.ts";

const events = new Set(["app_mention", "message.im"]);
const encoder = new TextEncoder();

export const slackApplication: EventSourceDefinition<
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
  kind: "slack",
  applicationIngress: true,
  provider: "slackbot",
  maximumBodyBytes: 64 * 1024,
  initialize(input, accountId) {
    if (input.kind !== "slack" || accountId == null || !/^U[A-Z0-9]+$/.test(accountId))
      throw new SourceIdentityError("Connector must provide the verified Slack bot user identity.");
    if (input.eventTypes.some((event) => !events.has(event)))
      throw new SourceIdentityError("Unsupported Slack event type.");
    return {
      identity: JSON.stringify([input.teamId, input.connectionId, input.appId, input.workspaceId, accountId]),
      eventTypes: input.eventTypes,
      config: { appId: input.appId, workspaceId: input.workspaceId, accountId },
      secrets: { signingSecret: input.signingSecret },
      state: {},
    };
  },
  update(source, input) {
    if (input.eventTypes.some((event) => !events.has(event)))
      throw new SourceIdentityError("Unsupported Slack event type.");
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
    const timestamp = headers.get("x-slack-request-timestamp") ?? "";
    const signature = headers.get("x-slack-signature") ?? "";
    if (
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(now - Number(timestamp) * 1000) > 300_000 ||
      !/^v0=[0-9a-f]{64}$/.test(signature)
    )
      throw new TypeError("Invalid Slack signature or timestamp.");
    const prefix = encoder.encode(`v0:${timestamp}:`);
    const body = new Uint8Array(prefix.length + bytes.length);
    body.set(prefix);
    body.set(bytes, prefix.length);
    if (!(await verifySourceHmac(body, signature.slice(3), String(source.secrets.signingSecret))))
      throw new TypeError("Invalid Slack signature.");
    const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!isJsonObject(payload)) throw new TypeError("Invalid Slack envelope.");
    if (payload.type === "url_verification") {
      if (typeof payload.challenge !== "string" || !payload.challenge || payload.challenge.length > 1024)
        throw new TypeError("Invalid Slack challenge.");
      return { response: Response.json({ challenge: payload.challenge }), state: { ...source.state, verifiedAt: now } };
    }
    const ignored = () => ({ response: Response.json({}), state: source.state });
    if (
      payload.type !== "event_callback" ||
      payload.api_app_id !== source.config.appId ||
      payload.team_id !== source.config.workspaceId
    )
      return ignored();
    if (
      !Array.isArray(payload.authorizations) ||
      !payload.authorizations.some(
        (authorization) =>
          isJsonObject(authorization) &&
          authorization.is_bot === true &&
          authorization.user_id === source.config.accountId &&
          authorization.team_id === source.config.workspaceId,
      )
    )
      return ignored();
    const event = payload.event;
    if (
      !isJsonObject(event) ||
      event.bot_id != null ||
      event.subtype != null ||
      event.user === source.config.accountId ||
      payload.is_ext_shared_channel === true
    )
      return ignored();
    const type =
      event.type === "app_mention"
        ? "app_mention"
        : event.type === "message" && event.channel_type === "im"
          ? "message.im"
          : undefined;
    if (type == null) return ignored();
    if (
      typeof payload.event_id !== "string" ||
      !payload.event_id ||
      typeof event.channel !== "string" ||
      typeof event.user !== "string" ||
      typeof event.text !== "string" ||
      typeof event.ts !== "string"
    )
      throw new TypeError("Incomplete Slack event.");
    return {
      event: {
        id: payload.event_id,
        type,
        payload: {
          event: type,
          deliveryId: payload.event_id,
          appId: payload.api_app_id!,
          teamId: payload.team_id!,
          channel: event.channel,
          user: event.user,
          text: event.text,
          ts: event.ts,
          threadTs: typeof event.thread_ts === "string" ? event.thread_ts : null,
          body: event,
        },
      },
    };
  },
  matches(config, event) {
    return (
      Array.isArray(config.eventTypes) &&
      config.eventTypes.includes(event.type) &&
      (!Array.isArray(config.channelIds) ||
        config.channelIds.length === 0 ||
        config.channelIds.includes(event.payload.channel!))
    );
  },
  resources: { triggerId: "slackbot.on_event", requests: () => [] },
};
