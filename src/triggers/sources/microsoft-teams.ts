import type { JsonObject, JsonValue } from "../common/json.ts";
import type { CreateEventSource, EventSource, UpdateEventSource } from "./configuration.ts";
import type { EventSourceDefinition } from "./definition.ts";

import { rawStringOrNull } from "../../core/cast.ts";
import { TransientIntegrationError } from "../common/integration.ts";
import { isJsonObject } from "../common/json.ts";
import { SourceIdentityError } from "./definition.ts";
import { BotFrameworkKeysUnavailableError, verifyBotFrameworkActivity } from "./teams-bot-token.ts";

const activityTypes = new Set(["message", "conversationUpdate", "messageReaction", "invoke"]);
const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * One Azure Bot registration delivers every activity to its messaging endpoint,
 * so a Source belongs to one Teams Bot connection and is verified with the
 * Bot Framework token on each request rather than a stored secret.
 */
export const microsoftTeamsBot: EventSourceDefinition<
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
    | "tenantId"
  >
> = {
  kind: "microsoft_teams",
  provider: "microsoft_teams_bot",
  maximumBodyBytes: 64 * 1024,
  initialize(input, accountId) {
    if (input.kind !== "microsoft_teams" || !accountId)
      throw new SourceIdentityError("Connector must provide the verified Teams bot application ID.");
    if (input.eventTypes.some((type) => !activityTypes.has(type)))
      throw new SourceIdentityError("Unsupported Teams activity type.");
    const identity: JsonValue[] = [input.teamId, input.connectionId, accountId];
    const config: Record<string, JsonValue> = { appId: accountId, accountId };
    // One multi-tenant bot serves many organizations with the same App ID, so a Source can be limited to one
    // tenant. Without a tenant the identity and config stay as before, so existing Sources keep matching.
    if (input.kind === "microsoft_teams" && input.tenantId !== undefined) {
      const tenantId = input.tenantId.toLowerCase();
      identity.push(tenantId);
      config.tenantId = tenantId;
    }
    return { identity: JSON.stringify(identity), eventTypes: input.eventTypes, config, secrets: {}, state: {} };
  },
  update(source, input) {
    if (input.signingSecret != null || input.verificationToken != null || input.encryptKey != null)
      throw new SourceIdentityError("Teams activities are verified with Bot Framework tokens, not a stored secret.");
    if (input.eventTypes.some((type) => !activityTypes.has(type)))
      throw new SourceIdentityError("Unsupported Teams activity type.");
    return { ...source, eventTypes: input.eventTypes };
  },
  view(source) {
    return {
      appId: String(source.config.appId),
      manageSubscriptions: false,
      verificationTokenConfigured: false,
      encryptKeyConfigured: false,
      signingSecretConfigured: false,
      verifiedAt: typeof source.state.verifiedAt === "number" ? new Date(source.state.verifiedAt).toISOString() : null,
      tenantId: typeof source.config.tenantId === "string" ? source.config.tenantId : null,
    };
  },
  // Bot Framework has no endpoint handshake: the connection's credentials were checked when it was
  // connected, and every activity carries its own token. verifiedAt records the first verified activity.
  ready: () => true,
  async receive(source, bytes, headers, now) {
    let verified;
    try {
      verified = await verifyBotFrameworkActivity({
        authorization: headers.get("authorization") ?? "",
        rawBody: bytes,
        appId: String(source.config.appId),
        now,
      });
    } catch (error) {
      if (error instanceof BotFrameworkKeysUnavailableError)
        throw new TransientIntegrationError("Bot Framework signing keys are unavailable.");
      throw error;
    }
    if (!verified.valid) throw new TypeError("Invalid Bot Framework activity token.");
    const activity: unknown = JSON.parse(decoder.decode(bytes));
    if (!isJsonObject(activity)) throw new TypeError("Invalid Teams activity.");
    const state = typeof source.state.verifiedAt === "number" ? source.state : { ...source.state, verifiedAt: now };
    // Bot Framework only needs a 200 for activities nothing consumes.
    const acknowledged = () => ({ response: new Response(null, { status: 200 }), state });
    const type = typeof activity.type === "string" && activityTypes.has(activity.type) ? activity.type : undefined;
    const from = isJsonObject(activity.from) ? activity.from : undefined;
    const recipient = isJsonObject(activity.recipient) ? activity.recipient : undefined;
    if (type == null || activity.channelId !== "msteams" || (from?.id != null && from.id === recipient?.id))
      return acknowledged();
    const conversation = isJsonObject(activity.conversation) ? activity.conversation : undefined;
    const channelData = isJsonObject(activity.channelData) ? activity.channelData : null;
    const tenantId =
      rawStringOrNull(conversation?.tenantId) ??
      (isJsonObject(channelData?.tenant) ? rawStringOrNull(channelData.tenant.id) : null);
    // A tenant-limited Source acknowledges other tenants' activities, and activities naming no tenant.
    if (typeof source.config.tenantId === "string" && tenantId?.toLowerCase() !== source.config.tenantId)
      return acknowledged();
    if (
      typeof activity.id !== "string" ||
      !activity.id ||
      typeof conversation?.id !== "string" ||
      !conversation.id ||
      typeof from?.id !== "string"
    )
      throw new TypeError("Incomplete Teams activity.");
    const botIds = new Set([rawStringOrNull(recipient?.id), `28:${String(source.config.appId)}`]);
    const mentions = (Array.isArray(activity.entities) ? activity.entities : [])
      .filter(isJsonObject)
      .filter((entity) => entity.type === "mention" && isJsonObject(entity.mentioned))
      .map((entity) => {
        const mentioned = entity.mentioned as JsonObject;
        return {
          id: rawStringOrNull(mentioned.id),
          name: rawStringOrNull(mentioned.name),
          isBot: typeof mentioned.id === "string" && botIds.has(mentioned.id),
          text: rawStringOrNull(entity.text),
        };
      });
    const rawText = rawStringOrNull(activity.text);
    // The activity id is unique within its conversation, so the pair identifies a delivery and its retries.
    const deliveryId = JSON.stringify([conversation.id, activity.id]);
    return {
      state,
      event: {
        id: deliveryId,
        type,
        payload: {
          event: type,
          deliveryId,
          activityId: activity.id,
          text: rawText == null ? null : mentionFreeText(rawText, mentions),
          rawText,
          mentions: mentions.map(({ id, name, isBot }) => ({ id, name, isBot })),
          from: { id: from.id, aadObjectId: rawStringOrNull(from.aadObjectId), name: rawStringOrNull(from.name) },
          conversation: {
            id: conversation.id,
            conversationType: rawStringOrNull(conversation.conversationType),
            tenantId,
          },
          channelData,
          replyToId: rawStringOrNull(activity.replyToId),
          // An invoke's name, such as adaptiveCard/action, and the card data an Adaptive Card action submits.
          name: rawStringOrNull(activity.name),
          value: isJsonObject(activity.value) ? activity.value : null,
          serviceUrl: verified.serviceUrl,
          timestamp: rawStringOrNull(activity.timestamp),
          body: activity,
        },
      },
    };
  },
  matches(config, event) {
    const conversation = isJsonObject(event.payload.conversation) ? event.payload.conversation : undefined;
    const conversationId = rawStringOrNull(conversation?.id) ?? "";
    const tenantId = rawStringOrNull(conversation?.tenantId)?.toLowerCase();
    return (
      Array.isArray(config.eventTypes) &&
      config.eventTypes.includes(event.type) &&
      (typeof config.tenantId !== "string" || config.tenantId.toLowerCase() === tenantId) &&
      (!Array.isArray(config.conversationIds) ||
        config.conversationIds.length === 0 ||
        // A channel thread's conversation id is the channel id plus ";messageid=<root>".
        config.conversationIds.includes(conversationId) ||
        config.conversationIds.includes(conversationId.split(";", 1)[0]!))
    );
  },
  resources: { triggerId: "microsoft_teams_bot.on_activity", requests: () => [] },
};

/**
 * Removes the bot's own mentions and unwraps the remaining <at> markup, so the text reads as the user
 * addressed the bot. Teams examples write a mention as <at>Name</at> or <at>@Name</at>, in the message
 * and in the entity, so a bot mention is recognized by name rather than by exact markup.
 */
function mentionFreeText(
  text: string,
  mentions: { isBot: boolean; name: string | null; text: string | null }[],
): string {
  const mentionName = (value: string) =>
    value
      .replace(/<\/?at(?:\s[^>]*)?>/gi, "")
      .replace(/^@/, "")
      .trim();
  const botNames = new Set(
    mentions
      .filter((mention) => mention.isBot)
      .flatMap((mention) => [mention.name, mention.text])
      .filter((value): value is string => !!value)
      .map(mentionName)
      .filter(Boolean),
  );
  return text
    .replace(/<at(?:\s[^>]*)?>([\s\S]*?)<\/at>/gi, (_markup, inner: string) =>
      botNames.has(mentionName(inner)) ? "" : inner,
    )
    .trim();
}
