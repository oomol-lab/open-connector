import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { googleJsonRequest } from "../google-runtime.ts";
import {
  defineOAuthProviderExecutors,
  defineProviderProxy,
  providerProxyEndpointPrefixes,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { googleMeetApiBaseUrl, googleMeetApiOrigin, googleMeetUserInfoUrl } from "./constants.ts";

const service = "googlemeet";

const spaceNameRule: ResourceNameRule = {
  pattern: /^spaces\/[^/]+$/u,
  expected: "spaces/{space}",
  barePrefix: "spaces",
};
const strictSpaceNameRule: ResourceNameRule = {
  pattern: spaceNameRule.pattern,
  expected: spaceNameRule.expected,
};
const conferenceRecordNameRule: ResourceNameRule = {
  pattern: /^conferenceRecords\/[^/]+$/u,
  expected: "conferenceRecords/{conference_record}",
  barePrefix: "conferenceRecords",
};
const participantNameRule: ResourceNameRule = {
  pattern: /^conferenceRecords\/[^/]+\/participants\/[^/]+$/u,
  expected: "conferenceRecords/{conference_record}/participants/{participant}",
};
const participantSessionNameRule: ResourceNameRule = {
  pattern: /^conferenceRecords\/[^/]+\/participants\/[^/]+\/participantSessions\/[^/]+$/u,
  expected:
    "conferenceRecords/{conference_record}/participants/{participant}/participantSessions/{participant_session}",
};
const recordingNameRule: ResourceNameRule = {
  pattern: /^conferenceRecords\/[^/]+\/recordings\/[^/]+$/u,
  expected: "conferenceRecords/{conference_record}/recordings/{recording}",
};
const transcriptNameRule: ResourceNameRule = {
  pattern: /^conferenceRecords\/[^/]+\/transcripts\/[^/]+$/u,
  expected: "conferenceRecords/{conference_record}/transcripts/{transcript}",
};
const transcriptEntryNameRule: ResourceNameRule = {
  pattern: /^conferenceRecords\/[^/]+\/transcripts\/[^/]+\/entries\/[^/]+$/u,
  expected: "conferenceRecords/{conference_record}/transcripts/{transcript}/entries/{entry}",
};
const smartNoteNameRule: ResourceNameRule = {
  pattern: /^conferenceRecords\/[^/]+\/smartNotes\/[^/]+$/u,
  expected: "conferenceRecords/{conference_record}/smartNotes/{smart_note}",
};

type GoogleMeetRuntimeContext = OAuthProviderContext;
type GoogleMeetActionHandler = (input: Record<string, unknown>, context: GoogleMeetRuntimeContext) => Promise<unknown>;

interface GoogleMeetRequestOptions {
  context: Pick<GoogleMeetRuntimeContext, "accessToken" | "fetcher" | "signal">;
  method?: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

interface ResourceNameRule {
  pattern: RegExp;
  expected: string;
  barePrefix?: string;
}

interface GoogleMeetListPayload {
  conferenceRecords?: unknown;
  participants?: unknown;
  participantSessions?: unknown;
  recordings?: unknown;
  transcripts?: unknown;
  transcriptEntries?: unknown;
  smartNotes?: unknown;
  nextPageToken?: unknown;
  totalSize?: unknown;
}

interface GoogleMeetChildListSpec {
  parentRule: ResourceNameRule;
  collection: string;
  responseField: keyof GoogleMeetListPayload;
  supportsFilter?: boolean;
}

const participantSessionsListSpec: GoogleMeetChildListSpec = {
  parentRule: participantNameRule,
  collection: "participantSessions",
  responseField: "participantSessions",
  supportsFilter: true,
};
const recordingsListSpec: GoogleMeetChildListSpec = {
  parentRule: conferenceRecordNameRule,
  collection: "recordings",
  responseField: "recordings",
};
const transcriptsListSpec: GoogleMeetChildListSpec = {
  parentRule: conferenceRecordNameRule,
  collection: "transcripts",
  responseField: "transcripts",
};
const transcriptEntriesListSpec: GoogleMeetChildListSpec = {
  parentRule: transcriptNameRule,
  collection: "entries",
  responseField: "transcriptEntries",
};
const smartNotesListSpec: GoogleMeetChildListSpec = {
  parentRule: conferenceRecordNameRule,
  collection: "smartNotes",
  responseField: "smartNotes",
};

export const googleMeetActionHandlers: Record<string, GoogleMeetActionHandler> = {
  create_space: createSpace,
  get_space: getSpace,
  update_space: updateSpace,
  end_active_conference: endActiveConference,
  list_conference_records: listConferenceRecords,
  get_conference_record: getConferenceRecord,
  list_participants: listParticipants,
  get_participant: getParticipant,
  list_participant_sessions: listParticipantSessions,
  get_participant_session: getParticipantSession,
  list_recordings: listRecordings,
  get_recording: getRecording,
  list_transcripts: listTranscripts,
  get_transcript: getTranscript,
  list_transcript_entries: listTranscriptEntries,
  get_transcript_entry: getTranscriptEntry,
  list_smart_notes: listSmartNotes,
  get_smart_note: getSmartNote,
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, googleMeetActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: googleMeetApiOrigin,
  auth: { type: "oauth_bearer" },
  allowedEndpoint: providerProxyEndpointPrefixes("/v2"),
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const profile = await googleJsonRequest<{
      email?: string;
      name?: string;
      sub?: string;
    }>(googleMeetUserInfoUrl, {
      accessToken: input.accessToken,
      fetcher,
      signal,
      service,
    });
    return {
      profile: {
        accountId: profile.email ?? profile.sub ?? "googlemeet:oauth2",
        displayName: profile.name ?? profile.email ?? "Google Meet User",
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

async function createSpace(input: Record<string, unknown>, context: GoogleMeetRuntimeContext): Promise<unknown> {
  return googleMeetJsonRequest(`${googleMeetApiBaseUrl}/spaces`, {
    context,
    method: "POST",
    body: optionalRecord(input.space) ?? {},
  });
}

async function getSpace(input: Record<string, unknown>, context: GoogleMeetRuntimeContext): Promise<unknown> {
  return getResource(input.name, spaceNameRule, context);
}

async function updateSpace(input: Record<string, unknown>, context: GoogleMeetRuntimeContext): Promise<unknown> {
  const name = resolveResourceName(input.name, spaceNameRule);
  const space = requiredRecord(input.space, "space", (message) => new ProviderRequestError(400, message));
  return googleMeetJsonRequest(`${googleMeetApiBaseUrl}/${encodeResourceName(name)}`, {
    context,
    method: "PATCH",
    query: compactObject({
      updateMask: optionalString(input.updateMask),
    }),
    body: {
      ...space,
      name,
    },
  });
}

async function endActiveConference(
  input: Record<string, unknown>,
  context: GoogleMeetRuntimeContext,
): Promise<unknown> {
  const name = resolveResourceName(input.name, strictSpaceNameRule);
  await googleMeetJsonRequest(`${googleMeetApiBaseUrl}/${encodeResourceName(name)}:endActiveConference`, {
    context,
    method: "POST",
    body: {},
  });
  return { success: true };
}

async function listConferenceRecords(
  input: Record<string, unknown>,
  context: GoogleMeetRuntimeContext,
): Promise<unknown> {
  const payload = await googleMeetJsonRequest<GoogleMeetListPayload>(`${googleMeetApiBaseUrl}/conferenceRecords`, {
    context,
    query: listQuery(input, true),
  });
  return {
    conferenceRecords: arrayOrEmpty(payload.conferenceRecords),
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function getConferenceRecord(
  input: Record<string, unknown>,
  context: GoogleMeetRuntimeContext,
): Promise<unknown> {
  return getResource(input.name, conferenceRecordNameRule, context);
}

async function listParticipants(input: Record<string, unknown>, context: GoogleMeetRuntimeContext): Promise<unknown> {
  const parent = resolveParent(input.parent, conferenceRecordNameRule);
  const payload = await googleMeetJsonRequest<GoogleMeetListPayload>(
    `${googleMeetApiBaseUrl}/${encodeResourceName(parent)}/participants`,
    {
      context,
      query: listQuery(input, true),
    },
  );
  return compactObject({
    participants: arrayOrEmpty(payload.participants),
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
    totalSize: optionalInteger(payload.totalSize),
  });
}

async function getParticipant(input: Record<string, unknown>, context: GoogleMeetRuntimeContext): Promise<unknown> {
  return getResource(input.name, participantNameRule, context);
}

function listParticipantSessions(input: Record<string, unknown>, context: GoogleMeetRuntimeContext): Promise<unknown> {
  return listChildResources(input, context, participantSessionsListSpec);
}

async function getParticipantSession(
  input: Record<string, unknown>,
  context: GoogleMeetRuntimeContext,
): Promise<unknown> {
  return getResource(input.name, participantSessionNameRule, context);
}

function listRecordings(input: Record<string, unknown>, context: GoogleMeetRuntimeContext): Promise<unknown> {
  return listChildResources(input, context, recordingsListSpec);
}

async function getRecording(input: Record<string, unknown>, context: GoogleMeetRuntimeContext): Promise<unknown> {
  return getResource(input.name, recordingNameRule, context);
}

function listTranscripts(input: Record<string, unknown>, context: GoogleMeetRuntimeContext): Promise<unknown> {
  return listChildResources(input, context, transcriptsListSpec);
}

async function getTranscript(input: Record<string, unknown>, context: GoogleMeetRuntimeContext): Promise<unknown> {
  return getResource(input.name, transcriptNameRule, context);
}

function listTranscriptEntries(input: Record<string, unknown>, context: GoogleMeetRuntimeContext): Promise<unknown> {
  return listChildResources(input, context, transcriptEntriesListSpec);
}

async function getTranscriptEntry(input: Record<string, unknown>, context: GoogleMeetRuntimeContext): Promise<unknown> {
  return getResource(input.name, transcriptEntryNameRule, context);
}

function listSmartNotes(input: Record<string, unknown>, context: GoogleMeetRuntimeContext): Promise<unknown> {
  return listChildResources(input, context, smartNotesListSpec);
}

async function getSmartNote(input: Record<string, unknown>, context: GoogleMeetRuntimeContext): Promise<unknown> {
  return getResource(input.name, smartNoteNameRule, context);
}

function getResource(value: unknown, rule: ResourceNameRule, context: GoogleMeetRuntimeContext): Promise<unknown> {
  const name = resolveResourceName(value, rule);
  return googleMeetJsonRequest(`${googleMeetApiBaseUrl}/${encodeResourceName(name)}`, { context });
}

async function listChildResources(
  input: Record<string, unknown>,
  context: GoogleMeetRuntimeContext,
  spec: GoogleMeetChildListSpec,
): Promise<unknown> {
  const parent = resolveParent(input.parent, spec.parentRule);
  const payload = await googleMeetJsonRequest<GoogleMeetListPayload>(
    `${googleMeetApiBaseUrl}/${encodeResourceName(parent)}/${spec.collection}`,
    {
      context,
      query: listQuery(input, spec.supportsFilter),
    },
  );
  return {
    [spec.responseField]: arrayOrEmpty(payload[spec.responseField]),
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

function googleMeetJsonRequest<T = unknown>(url: string, input: GoogleMeetRequestOptions): Promise<T> {
  return googleJsonRequest<T>(url, {
    accessToken: input.context.accessToken,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    method: input.method,
    query: input.query,
    body: input.body,
    service,
  });
}

function resolveParent(value: unknown, rule: ResourceNameRule): string {
  return resolveResourceName(value, rule, "parent");
}

function resolveResourceName(value: unknown, rule: ResourceNameRule, fieldName = "name"): string {
  const raw = optionalString(value);
  if (!raw) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }

  const trimmed = raw.replace(/^\/+|\/+$/gu, "");
  const name = rule.barePrefix && !trimmed.includes("/") ? `${rule.barePrefix}/${trimmed}` : trimmed;
  if (!rule.pattern.test(name) || hasUnsafeResourceSegment(name)) {
    throw new ProviderRequestError(400, `${fieldName} must use the ${rule.expected} format`);
  }
  return name;
}

function hasUnsafeResourceSegment(name: string): boolean {
  return name.split("/").some((segment) => {
    try {
      const decoded = decodeURIComponent(segment);
      return decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\");
    } catch {
      return true;
    }
  });
}

function encodeResourceName(name: string): string {
  return name
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function listQuery(input: Record<string, unknown>, supportsFilter = false): Record<string, string | undefined> {
  return compactObject({
    filter: supportsFilter ? optionalString(input.filter) : undefined,
    pageSize: integerQuery(input.pageSize),
    pageToken: optionalString(input.pageToken),
  });
}

function integerQuery(value: unknown): string | undefined {
  const resolved = optionalInteger(value);
  return resolved === undefined ? undefined : String(resolved);
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
