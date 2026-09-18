import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
interface FeishuVcActionOptions {
  readonly service: string;
  readonly identity: "user" | "tenant";
}
const meetingId = s.string("The Feishu video meeting ID.", { minLength: 1 });
const raw = s.looseObject("The raw video-conference object returned by Feishu.");
export function createFeishuVcActions(options: FeishuVcActionOptions): readonly ActionDefinition[] {
  const queryPermission = options.identity === "user" ? "vc:meeting.meetingevent:read" : "vc:meeting.bot.join:write";
  return [
    defineProviderAction(options.service, {
      name: "join_vc_meeting",
      operationType: "write",
      description: "Join a Feishu video meeting with the app's meeting bot.",
      requiredScopes: ["vc:meeting.bot.join:write"],
      providerPermissions: ["vc:meeting.bot.join:write"],
      inputSchema: s.object(
        "Identify the meeting number and optional credentials.",
        {
          meetingNumber: s.string("The nine-digit Feishu meeting number.", {
            minLength: 9,
            maxLength: 9,
          }),
          password: s.string("The meeting password, when required.", { minLength: 1 }),
          callId: s.string("The correlation ID forwarded by a meeting invite event.", {
            minLength: 1,
          }),
        },
        {
          optional: ["password", "callId"],
        },
      ),
      outputSchema: s.object(
        "The joined meeting.",
        {
          meeting: raw,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(options.service, {
      name: "leave_vc_meeting",
      operationType: "destructive",
      description: "Leave a Feishu video meeting previously joined by the app's meeting bot.",
      requiredScopes: ["vc:meeting.bot.join:write"],
      providerPermissions: ["vc:meeting.bot.join:write"],
      inputSchema: s.object(
        "Identify the meeting to leave.",
        { meetingId },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The meeting the bot left.",
        { meetingId },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(options.service, {
      name: "list_active_vc_meetings",
      operationType: "read",
      description: "List active Feishu video meetings for the current user or a tenant user.",
      requiredScopes: [queryPermission],
      providerPermissions: [queryPermission],
      inputSchema: s.object(
        "Optionally identify a tenant user when using app identity.",
        {
          userId: s.string("The target user ID required for tenant identity.", { minLength: 1 }),
        },
        {
          optional: ["userId"],
        },
      ),
      outputSchema: s.object(
        "The active video meetings.",
        {
          meetings: s.array("The active meetings.", raw),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(options.service, {
      name: "list_vc_meeting_events",
      operationType: "read",
      description: "List participant and lifecycle events from one Feishu video meeting.",
      requiredScopes: [queryPermission],
      providerPermissions: [queryPermission],
      inputSchema: s.object(
        "Identify the meeting and configure event pagination.",
        {
          meetingId,
          startTime: s.string("The inclusive Unix timestamp in seconds.", { minLength: 1 }),
          endTime: s.string("The exclusive Unix timestamp in seconds.", { minLength: 1 }),
          pageSize: s.integer("The maximum number of events on this page.", {
            minimum: 20,
            maximum: 100,
          }),
          pageToken: s.string("The page token returned by the previous request.", {
            minLength: 1,
          }),
        },
        {
          optional: ["startTime", "endTime", "pageSize", "pageToken"],
        },
      ),
      outputSchema: s.object(
        "A normalized page of meeting events.",
        {
          events: s.array("The meeting events.", raw),
          hasMore: s.boolean("Whether another page is available."),
          pageToken: s.nullable(s.string("The token for the next page.")),
          meeting: raw,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(options.service, {
      name: "send_vc_meeting_message",
      operationType: "write",
      description: "Send a text message or reaction through the app's in-meeting bot.",
      requiredScopes: ["vc:meeting.message:write"],
      providerPermissions: ["vc:meeting.message:write"],
      inputSchema: s.object(
        "Identify the meeting and provide message content.",
        {
          meetingId,
          messageType: s.stringEnum("The in-meeting message type.", ["text", "reaction"]),
          content: s.string("The text or reaction emoji key.", {
            minLength: 1,
            maxLength: 49152,
          }),
          uuid: s.string("An optional idempotency key.", { minLength: 1, maxLength: 128 }),
        },
        {
          optional: ["uuid"],
        },
      ),
      outputSchema: s.object(
        "The sent in-meeting message.",
        {
          message: raw,
        },
        {
          optional: [],
        },
      ),
    }),
  ];
}
