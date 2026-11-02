import type { BotFrameworkActivityInput, BotFrameworkActivityResult } from "../../triggers/sources/teams-bot-token.ts";
import type { ChannelEventVerifier } from "./contract.ts";

import { optionalString } from "../../core/cast.ts";
import {
  BotFrameworkKeysUnavailableError,
  verifyBotFrameworkActivity,
} from "../../triggers/sources/teams-bot-token.ts";
import { eventRequestMaximumBodyBytes } from "./request-body.ts";

export type TeamsBotEventVerificationResult = BotFrameworkActivityResult | { valid: false; reason: "body_too_large" };

// Authorization carries the dedicated verify token, so the activity's own bearer token is forwarded here.
const botFrameworkAuthorizationHeader = "x-botframework-authorization";

const rejectionMessages = {
  body_too_large: "Teams request body exceeds 64 KiB.",
  payload: "Invalid Teams activity.",
  app: "The token audience does not match the selected bot.",
  timestamp: "The Bot Framework token is expired or not yet valid.",
  signature: "Invalid Bot Framework token.",
  unavailable: "Bot Framework signing keys are unavailable.",
};

/**
 * Bot Framework authenticates the sender with a bearer token whose audience is
 * the bot's Application (client) ID on the selected connection. The token does
 * not sign the activity body; only its serviceUrl is bound to the token.
 */
export const microsoftTeamsBotEventVerifier: ChannelEventVerifier<string> = {
  credentialScope: "connection",
  messages: {
    notConfigured: "Connect a Microsoft Teams Bot account with its Application (client) ID first.",
    bodyTooLarge: rejectionMessages.body_too_large,
  },
  readCredential: ({ connectionValues }) => optionalString(connectionValues?.appId),
  async verify(request, appId) {
    let result: TeamsBotEventVerificationResult;
    try {
      result = await verifyTeamsBotEventRequest({
        authorization: request.headers.get(botFrameworkAuthorizationHeader) ?? "",
        rawBody: request.rawBody,
        appId,
        now: request.now,
      });
    } catch (error) {
      if (!(error instanceof BotFrameworkKeysUnavailableError)) throw error;
      return { verified: false, reason: "unavailable", message: rejectionMessages.unavailable };
    }
    if (result.valid) return { verified: true, result };
    const reason =
      result.reason === "token" || result.reason === "service_url" || result.reason === "channel"
        ? "signature"
        : result.reason;
    return { verified: false, reason, message: rejectionMessages[reason] };
  },
};

/** Verifies an inbound Teams activity request within the shared event body limit. */
export async function verifyTeamsBotEventRequest(
  input: BotFrameworkActivityInput,
): Promise<TeamsBotEventVerificationResult> {
  if (input.rawBody.byteLength > eventRequestMaximumBodyBytes) return { valid: false, reason: "body_too_large" };
  return verifyBotFrameworkActivity(input);
}
