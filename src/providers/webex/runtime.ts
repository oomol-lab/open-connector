import { optionalRecord as asOptionalObject, optionalString as asOptionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, providerInputError } from "../provider-runtime.ts";

export const webexApiBaseUrl = "https://webexapis.com/v1";

type RequestDescriptor = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  pathFields?: string[];
  queryFields?: string[];
  commaSeparatedQueryFields?: string[];
  bodyFields?: string[];
  contentType?: string;
  response: "list" | "item" | "delete" | "text";
};

const requestDescriptors: Record<string, RequestDescriptor> = {
  list_people: {
    ...get("/people", "list", [
      "email",
      "displayName",
      "id",
      "roles",
      "callingData",
      "locationId",
      "max",
      "excludeStatus",
    ]),
    commaSeparatedQueryFields: ["id", "roles"],
  },
  get_person: get("/people/{personId}", "item", ["callingData"], ["personId"]),
  list_messages: get("/messages", "list", ["roomId", "parentId", "mentionedPeople", "before", "beforeMessage", "max"]),
  list_direct_messages: get("/messages/direct", "list", ["parentId", "personId", "personEmail"]),
  create_message: write("POST", "/messages", [
    "roomId",
    "parentId",
    "toPersonId",
    "toPersonEmail",
    "text",
    "markdown",
    "files",
    "attachments",
  ]),
  get_message: get("/messages/{messageId}", "item", [], ["messageId"]),
  update_message: write("PUT", "/messages/{messageId}", ["roomId", "text", "markdown"], ["messageId"]),
  delete_message: remove("/messages/{messageId}", ["messageId"]),
  list_rooms: get("/rooms", "list", ["teamId", "type", "orgPublicSpaces", "from", "to", "sortBy", "max"]),
  create_room: write("POST", "/rooms", [
    "title",
    "teamId",
    "classificationId",
    "isLocked",
    "isPublic",
    "description",
    "isAnnouncementOnly",
  ]),
  get_room: get("/rooms/{roomId}", "item", [], ["roomId"]),
  update_room: write(
    "PUT",
    "/rooms/{roomId}",
    ["title", "classificationId", "teamId", "isLocked", "isPublic", "description", "isAnnouncementOnly", "isReadOnly"],
    ["roomId"],
  ),
  delete_room: remove("/rooms/{roomId}", ["roomId"]),
  list_memberships: get("/memberships", "list", ["roomId", "personId", "personEmail", "max"]),
  create_membership: write("POST", "/memberships", ["roomId", "personId", "personEmail", "isModerator"]),
  get_membership: get("/memberships/{membershipId}", "item", [], ["membershipId"]),
  update_membership: write("PUT", "/memberships/{membershipId}", ["isModerator", "isRoomHidden"], ["membershipId"]),
  delete_membership: remove("/memberships/{membershipId}", ["membershipId"]),
  list_teams: get("/teams", "list", ["max"]),
  create_team: write("POST", "/teams", ["name", "description"]),
  get_team: get("/teams/{teamId}", "item", [], ["teamId"]),
  update_team: write("PUT", "/teams/{teamId}", ["name", "description"], ["teamId"]),
  delete_team: remove("/teams/{teamId}", ["teamId"]),
  list_team_memberships: get("/team/memberships", "list", ["teamId", "max"]),
  create_team_membership: write("POST", "/team/memberships", ["teamId", "personId", "personEmail", "isModerator"]),
  get_team_membership: get("/team/memberships/{membershipId}", "item", [], ["membershipId"]),
  update_team_membership: write("PUT", "/team/memberships/{membershipId}", ["isModerator"], ["membershipId"]),
  delete_team_membership: remove("/team/memberships/{membershipId}", ["membershipId"]),
  list_meetings: get("/meetings", "list", [
    "meetingNumber",
    "webLink",
    "meetingSeriesId",
    "from",
    "to",
    "meetingType",
    "state",
    "scheduledType",
    "current",
    "siteUrl",
    "integrationTag",
    "max",
  ]),
  create_meeting: write("POST", "/meetings", createMeetingBodyFields()),
  get_meeting: get("/meetings/{meetingId}", "item", ["current"], ["meetingId"]),
  update_meeting: {
    ...write("PATCH", "/meetings/{meetingId}", updateMeetingBodyFields(), ["meetingId"]),
    contentType: "application/json-patch+json",
  },
  delete_meeting: {
    ...remove("/meetings/{meetingId}", ["meetingId"]),
    queryFields: ["sendEmail"],
  },
  list_meeting_participants: get("/meetingParticipants", "list", [
    "meetingId",
    "breakoutSessionId",
    "meetingStartTimeFrom",
    "meetingStartTimeTo",
    "joinTimeFrom",
    "joinTimeTo",
    "max",
  ]),
  get_meeting_participant: get("/meetingParticipants/{participantId}", "item", [], ["participantId"]),
  list_recordings: get("/recordings", "list", [
    "from",
    "to",
    "meetingId",
    "siteUrl",
    "integrationTag",
    "topic",
    "format",
    "status",
    "max",
  ]),
  get_recording: get("/recordings/{recordingId}", "item", [], ["recordingId"]),
  list_meeting_transcripts: get("/meetingTranscripts", "list", ["from", "to", "meetingId", "siteUrl", "max"]),
  download_meeting_transcript: {
    ...get("/meetingTranscripts/{transcriptId}/download", "text", ["format"], ["transcriptId"]),
  },
  get_meeting_summary: get("/meetingSummaries", "list", ["meetingId"]),
};

async function executeWebexAction(
  actionName: string,
  actionInput: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const descriptor = requestDescriptors[actionName];
  if (!descriptor) {
    throw new ProviderRequestError(400, `unknown webex action: ${actionName}`);
  }

  const path = interpolatePath(descriptor.path, descriptor.pathFields ?? [], actionInput);
  const url = new URL(`${webexApiBaseUrl}${path}`);
  appendQuery(url, descriptor.queryFields ?? [], descriptor.commaSeparatedQueryFields ?? [], actionInput);
  const body = pickFields(actionInput, descriptor.bodyFields ?? []);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: descriptor.method,
      headers: {
        accept: descriptor.response === "text" ? "text/vtt, text/plain" : "application/json",
        authorization: `Bearer ${accessToken}`,
        ...(descriptor.bodyFields ? { "content-type": descriptor.contentType ?? "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      ...(descriptor.bodyFields ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Webex request failed: ${error.message}` : "Webex request failed",
    );
  }

  if (!response.ok) {
    throw await mapWebexError(response);
  }
  if (descriptor.response === "delete") {
    return { success: true };
  }
  if (descriptor.response === "text") {
    return {
      content: await response.text(),
      contentType: response.headers.get("content-type"),
    };
  }

  const payload = await parseWebexJson(response);
  if (descriptor.response === "list") {
    return {
      items: Array.isArray(payload.items) ? payload.items : [],
      nextPageUrl: readNextPageUrl(response.headers.get("link")),
      raw: payload,
    };
  }
  return { item: payload, raw: payload };
}

export const webexActionHandlers: Record<
  string,
  (input: Record<string, unknown>, context: { accessToken: string; fetcher: typeof fetch }) => Promise<unknown>
> = Object.fromEntries(
  Object.keys(requestDescriptors).map((actionName) => [
    actionName,
    (input: Record<string, unknown>, context: { accessToken: string; fetcher: typeof fetch }) =>
      executeWebexAction(actionName, input, context.accessToken, context.fetcher),
  ]),
);

function get(
  path: string,
  response: RequestDescriptor["response"],
  queryFields: string[] = [],
  pathFields: string[] = [],
): RequestDescriptor {
  return { method: "GET", path, pathFields, queryFields, response };
}

function write(
  method: "POST" | "PUT" | "PATCH",
  path: string,
  bodyFields: string[],
  pathFields: string[] = [],
): RequestDescriptor {
  return { method, path, pathFields, bodyFields, response: "item" };
}

function remove(path: string, pathFields: string[]): RequestDescriptor {
  return { method: "DELETE", path, pathFields, response: "delete" };
}

function sharedMeetingBodyFields() {
  return [
    "title",
    "agenda",
    "password",
    "start",
    "end",
    "timezone",
    "recurrence",
    "enabledAutoRecordMeeting",
    "enabledJoinBeforeHost",
    "joinBeforeHostMinutes",
    "sendEmail",
    "integrationTags",
  ];
}

function createMeetingBodyFields() {
  return [...sharedMeetingBodyFields(), "invitees", "siteUrl"];
}

function updateMeetingBodyFields() {
  return sharedMeetingBodyFields();
}

function interpolatePath(template: string, fields: string[], input: Record<string, unknown>) {
  let path = template;
  for (const field of fields) {
    const value = requireString(input[field], field);
    path = path.replace(`{${field}}`, encodeURIComponent(value));
  }
  return path;
}

function appendQuery(url: URL, fields: string[], commaSeparatedFields: string[], input: Record<string, unknown>) {
  for (const field of fields) {
    const value = input[field];
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      if (commaSeparatedFields.includes(field)) {
        url.searchParams.set(field, value.map(String).join(","));
        continue;
      }
      for (const item of value) {
        url.searchParams.append(field, String(item));
      }
      continue;
    }
    url.searchParams.set(field, String(value));
  }
}

function pickFields(input: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.filter((field) => input[field] !== undefined).map((field) => [field, input[field]]));
}

async function parseWebexJson(response: Response) {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderRequestError(502, "Webex returned an invalid JSON response");
  }
  const record = asOptionalObject(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Webex returned an invalid response object");
  }
  return record;
}

async function mapWebexError(response: Response) {
  let payload: Record<string, unknown> = {};
  try {
    payload = asOptionalObject(await response.json()) ?? {};
  } catch {
    // Some Webex error responses have no JSON body, so preserve the HTTP status mapping.
  }
  const message =
    asOptionalString(payload.message) ??
    asOptionalString(payload.error) ??
    `Webex request failed with HTTP ${response.status}`;
  if (response.status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 403) {
    return new ProviderRequestError(403, message);
  }
  if (response.status === 404) {
    return providerInputError(message);
  }
  if (response.status === 423 || response.status === 429 || response.status >= 500) {
    return new ProviderRequestError(response.status === 429 ? 429 : 502, message);
  }
  return providerInputError(message);
}

function readNextPageUrl(link: string | null) {
  if (!link) {
    return null;
  }
  let cursor = 0;
  while (cursor < link.length) {
    const start = link.indexOf("<", cursor);
    const end = start >= 0 ? link.indexOf(">", start + 1) : -1;
    if (start < 0 || end < 0) {
      return null;
    }
    const nextStart = link.indexOf("<", end + 1);
    const parameters = link.slice(end + 1, nextStart < 0 ? link.length : nextStart);
    if (parameters.includes('rel="next"')) {
      return link.slice(start + 1, end);
    }
    cursor = end + 1;
  }
  return null;
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${field} is required`);
  }
  return value;
}
