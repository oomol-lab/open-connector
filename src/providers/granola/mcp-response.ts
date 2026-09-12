import type { GranolaMeeting } from "./actions.ts";

import { XMLParser } from "fast-xml-parser";
import { SyntaxValidator } from "fast-xml-validator";
import { objectArray, optionalString, requiredRawString, requiredString } from "../../core/cast.ts";
import { parseProviderJsonBodyText, providerResponseError, requiredResponseRecord } from "../provider-runtime.ts";

interface GranolaMcpFolder {
  id: string;
  name: string;
}

const xml = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
  isArray: (name) => name === "meeting",
});

function parseGranolaXml(text: string): Record<string, unknown> {
  try {
    // Granola uses XML fragments, including access notices beside meeting data. DTDs are unnecessary.
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Unsupported XML declaration");
    const response = `<granola_response>${text}</granola_response>`;
    SyntaxValidator.validate(response);
    return requiredResponseRecord(xml.parse(response).granola_response, "Granola MCP XML");
  } catch {
    throw providerResponseError("Granola returned malformed MCP XML.");
  }
}

/** Parse meeting XML without treating access notices or incomplete lists as meeting data. */
export function parseGranolaMeetings(text: string): GranolaMeeting[] {
  const document = parseGranolaXml(text);
  const root =
    document.meetings_data === "" ? {} : requiredResponseRecord(document.meetings_data, "Granola meeting list");
  const records = objectArray(root.meeting ?? [], "Granola meeting", providerResponseError);
  const count = optionalString(root["@_count"]);
  if (
    (count !== undefined && (!/^\d+$/.test(count) || Number(count) !== records.length)) ||
    root["@_has_more"] === "true" ||
    optionalString(root["@_next_cursor"])
  ) {
    throw providerResponseError("Granola returned an incomplete meeting list.");
  }
  const meetings = records.map((meeting) => ({
    id: requiredString(meeting["@_id"], "Granola meeting ID", providerResponseError),
    title: requiredRawString(meeting["@_title"], "Granola meeting title", providerResponseError),
    date: requiredRawString(meeting["@_date"], "Granola meeting date", providerResponseError),
    attendees: requiredRawString(meeting.known_participants ?? "", "Granola participants", providerResponseError),
    summary:
      meeting.summary === undefined
        ? undefined
        : requiredRawString(meeting.summary, "Granola meeting summary", providerResponseError),
  }));
  if (new Set(meetings.map((meeting) => meeting.id)).size !== meetings.length) {
    throw providerResponseError("Granola returned duplicate meeting IDs.");
  }
  return meetings;
}

/** Map MCP folder titles to the note API's folder names, without inventing hierarchy metadata. */
export function parseGranolaFolders(text: string): GranolaMcpFolder[] {
  const root = requiredResponseRecord(
    parseProviderJsonBodyText(text, {
      emptyBody: undefined,
      invalidJsonMessage: "Granola returned malformed folder JSON.",
    }),
    "Granola folders",
  );
  const records = objectArray(root.folders, "Granola folders", providerResponseError);
  if (root.count !== records.length) throw providerResponseError("Granola returned an incomplete folder list.");
  const folders = records.map((folder) => ({
    id: requiredString(folder.id, "Granola folder ID", providerResponseError),
    name: requiredRawString(folder.title, "Granola folder title", providerResponseError),
  }));
  if (new Set(folders.map((folder) => folder.id)).size !== folders.length) {
    throw providerResponseError("Granola returned duplicate folder IDs.");
  }
  return folders;
}

/** Preserve transcript text and verify the meeting identity when Granola supplies an envelope. */
export function parseGranolaTranscript(text: string, meetingId: string): string {
  const value = text.trim();
  let transcript: string;
  if (value.startsWith("{")) {
    let payload: unknown;
    try {
      payload = JSON.parse(value);
    } catch {
      throw providerResponseError("Granola returned malformed transcript JSON.");
    }
    const data = requiredResponseRecord(payload, "Granola transcript");
    if (data.id !== meetingId) throw providerResponseError("Granola returned a different transcript identity.");
    transcript = requiredRawString(data.transcript, "Granola transcript", providerResponseError);
  } else if (value.startsWith("<")) {
    const data = requiredResponseRecord(parseGranolaXml(value).transcript, "Granola transcript");
    if (data["@_meeting_id"] !== meetingId) {
      throw providerResponseError("Granola returned a different transcript identity.");
    }
    transcript = requiredRawString(data["#text"], "Granola transcript", providerResponseError);
  } else {
    // Older MCP responses contain transcript text without an envelope.
    transcript = text;
  }
  if (!transcript.trim() || /^no transcript\b/i.test(transcript.trim())) {
    throw providerResponseError("Granola transcript is not available yet.");
  }
  return transcript;
}
