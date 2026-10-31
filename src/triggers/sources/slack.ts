import type { JsonObject, JsonValue } from "../common/json.ts";
import type { CreateEventSource, EventSource, UpdateEventSource } from "./configuration.ts";
import type { EventSourceDefinition, SourceConfiguration, SourceEvent } from "./definition.ts";

import { rawStringOrNull } from "../../core/cast.ts";
import { isJsonObject } from "../common/json.ts";
import { SourceIdentityError } from "./definition.ts";
import { verifySlackSignature } from "./slack-signature.ts";

// Interactivity payloads arrive on the app's Interactivity Request URL, which may be the
// same callback as the Events API Request URL.
const interactions = new Set(["block_actions", "view_submission", "view_closed"]);
const events = new Set(["app_mention", "message.im", ...interactions]);

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
    const failure = await verifySlackSignature({
      timestamp,
      signature,
      rawBody: bytes,
      signingSecret: String(source.secrets.signingSecret),
      now,
    });
    if (failure) throw new TypeError("Invalid Slack signature or timestamp.");
    if (headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/x-www-form-urlencoded")
      return receiveInteraction(source, bytes);
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

/**
 * Normalizes a signed Interactivity request, a form body whose `payload` field holds the JSON.
 * Interactions carry no bot authorization list, so the app and workspace identify the source.
 */
function receiveInteraction(
  source: SourceConfiguration,
  bytes: Uint8Array,
): { response: Response; state: SourceConfiguration["state"] } | { event: SourceEvent } {
  // Slack expects an empty 200 acknowledgement; for view_submission it closes the submitted view.
  const acknowledged = () => ({ response: new Response(null, { status: 200 }), state: source.state });
  const encoded = new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(bytes)).get("payload");
  if (encoded == null) return acknowledged();
  const payload: unknown = JSON.parse(encoded);
  if (!isJsonObject(payload)) throw new TypeError("Invalid Slack interaction.");
  const type = typeof payload.type === "string" && interactions.has(payload.type) ? payload.type : undefined;
  if (
    type == null ||
    payload.api_app_id !== source.config.appId ||
    !isJsonObject(payload.team) ||
    payload.team.id !== source.config.workspaceId
  )
    return acknowledged();
  const user = isJsonObject(payload.user) ? payload.user : undefined;
  const view = isJsonObject(payload.view) ? payload.view : undefined;
  const message = isJsonObject(payload.message) ? payload.message : undefined;
  // view_closed has no trigger_id; Slack closes each view once.
  const deliveryId =
    type !== "view_closed" ? payload.trigger_id : typeof view?.id === "string" ? `view_closed:${view.id}` : undefined;
  if (
    typeof user?.id !== "string" ||
    typeof deliveryId !== "string" ||
    !deliveryId ||
    (type === "block_actions" ? !Array.isArray(payload.actions) : typeof view?.id !== "string")
  )
    throw new TypeError("Incomplete Slack interaction.");
  // The legacy verification token and function-scoped bot tokens are credentials, not event data.
  const { token: _token, bot_access_token: _botAccessToken, ...body } = payload;
  return {
    event: {
      id: deliveryId,
      type,
      payload: {
        event: type,
        deliveryId,
        appId: source.config.appId!,
        teamId: source.config.workspaceId!,
        channel: isJsonObject(payload.channel) ? rawStringOrNull(payload.channel.id) : null,
        user: user.id,
        text: rawStringOrNull(message?.text),
        ts: rawStringOrNull(message?.ts),
        threadTs: rawStringOrNull(message?.thread_ts),
        responseUrl: rawStringOrNull(payload.response_url),
        actions: Array.isArray(payload.actions) ? payload.actions.filter(isJsonObject).map(interactionAction) : null,
        view:
          view == null
            ? null
            : {
                id: rawStringOrNull(view.id),
                callbackId: rawStringOrNull(view.callback_id),
                privateMetadata: rawStringOrNull(view.private_metadata),
                state: isJsonObject(view.state) && isJsonObject(view.state.values) ? view.state.values : {},
                isCleared: payload.is_cleared === true,
              },
        body,
      },
    },
  };
}

function interactionAction(action: JsonObject): JsonValue {
  const option = isJsonObject(action.selected_option) ? action.selected_option : undefined;
  return {
    actionId: rawStringOrNull(action.action_id),
    blockId: rawStringOrNull(action.block_id),
    type: rawStringOrNull(action.type),
    value: rawStringOrNull(action.value),
    selectedOption:
      option == null
        ? null
        : {
            value: rawStringOrNull(option.value),
            text: isJsonObject(option.text) ? rawStringOrNull(option.text.text) : null,
          },
    actionTs: rawStringOrNull(action.action_ts),
  };
}
