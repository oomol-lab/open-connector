import type { FeishuJsonRequest } from "./client.ts";

import { providerInputError } from "../../provider-runtime.ts";

interface FeishuVcActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

export function createFeishuVcActionHandlers(input: {
  readonly identity: "user" | "tenant";
  readonly request: FeishuJsonRequest;
}): Record<string, FeishuVcActionHandler> {
  return {
    join_vc_meeting(actionInput) {
      return joinMeeting(actionInput, input.request);
    },
    leave_vc_meeting(actionInput) {
      return leaveMeeting(actionInput, input.request);
    },
    list_active_vc_meetings(actionInput) {
      return listActiveMeetings(actionInput, input);
    },
    list_vc_meeting_events(actionInput) {
      return listMeetingEvents(actionInput, input.request);
    },
    send_vc_meeting_message(actionInput) {
      return sendMeetingMessage(actionInput, input.request);
    },
  };
}

async function joinMeeting(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const meetingNumber = requireString(input.meetingNumber, "meetingNumber");
  if (meetingNumber.length !== 9 || Array.from(meetingNumber).some((character) => character < "0" || character > "9")) {
    throw providerInputError("meetingNumber must contain exactly nine digits");
  }
  const data = await request({
    method: "POST",
    path: "/vc/v1/bots/join",
    body: {
      join_type: 1,
      join_identify: { meeting_no: meetingNumber },
      password: optionalString(input.password),
      call_id: optionalString(input.callId),
    },
  });
  return {
    meeting: recordValue(data.meeting),
  };
}

async function leaveMeeting(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const id = requireString(input.meetingId, "meetingId");
  await request({
    method: "POST",
    path: "/vc/v1/bots/leave",
    body: { meeting_id: id },
  });
  return { meetingId: id };
}

async function listActiveMeetings(
  actionInput: Record<string, unknown>,
  context: {
    readonly identity: "user" | "tenant";
    readonly request: FeishuJsonRequest;
  },
) {
  const userId = optionalString(actionInput.userId);
  if (context.identity === "tenant" && !userId) {
    throw providerInputError("userId is required for tenant identity");
  }
  const data = await context.request({
    path: "/vc/v1/bots/user_active_meeting",
    query: {
      user_id: context.identity === "tenant" ? userId : undefined,
    },
  });
  return {
    meetings: recordArray(data.meetings),
  };
}

async function listMeetingEvents(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: "/vc/v1/bots/events",
    query: {
      meeting_id: requireString(input.meetingId, "meetingId"),
      start_time: optionalString(input.startTime),
      end_time: optionalString(input.endTime),
      page_size: optionalNumber(input.pageSize) ?? 20,
      page_token: optionalString(input.pageToken),
    },
  });
  return {
    events: recordArray(data.events),
    hasMore: data.has_more === true,
    pageToken: optionalString(data.page_token) ?? null,
    meeting: recordValue(data.meeting),
  };
}

async function sendMeetingMessage(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    method: "POST",
    path: "/vc/v1/bots/message",
    body: {
      meeting_id: requireString(input.meetingId, "meetingId"),
      msg_type: requireString(input.messageType, "messageType"),
      content: requireString(input.content, "content"),
      uuid: optionalString(input.uuid),
    },
  });
  return {
    message: data,
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => item != null && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw providerInputError(`${fieldName} is required`);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}
