import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lessonspace";

const organisationIdSchema = s.nonEmptyString("The Lessonspace organisation identifier.");
const sessionUuidSchema = s.uuid("The Lessonspace session UUID.");
const spaceUuidSchema = s.uuid("The Lessonspace space UUID.");
const isoDateTimeSchema = s.dateTime("An ISO 8601 timestamp used by the Lessonspace API.");
const userRoleSchema = s.stringEnum("The Lessonspace role assigned to the launched user.", [
  "teacher",
  "student",
  "admin",
]);

const launchUserSchema = s.object(
  "The Lessonspace user object passed to the launch endpoint.",
  {
    id: s.nonEmptyString("The external user identifier used by the caller."),
    name: s.nonEmptyString("The display name shown inside Lessonspace."),
    email: s.email("The email address used by Lessonspace to identify the user."),
    role: userRoleSchema,
    leader: s.boolean("Whether the launched user should join as a leader."),
  },
  { optional: ["id", "email", "role", "leader"] },
);

const launchFeatureValueSchema = s.anyOf("One Lessonspace feature flag value.", [
  s.boolean("A Lessonspace feature boolean value."),
  s.string("A Lessonspace feature string value.", { minLength: 1 }),
  s.integer("A Lessonspace feature integer value."),
]);

const sessionFilterTagsSchema = s.record(
  "Session tags that must match on the Lessonspace API.",
  s.string("A Lessonspace tag value. Use an empty string to match key presence only."),
);

const sessionSummarySchema = s.object("A normalized Lessonspace session summary.", {
  id: s.integer("The internal Lessonspace session identifier."),
  uuid: s.uuid("The Lessonspace session UUID."),
  name: s.nullable(s.string("The Lessonspace session name when present.")),
  startTime: s.nullable(s.dateTime("The session start timestamp when present.")),
  endTime: s.nullable(s.dateTime("The session end timestamp when present.")),
  raw: s.looseObject("The raw session payload returned by Lessonspace."),
});

const sessionSpaceSchema = s.object("A normalized Lessonspace space summary.", {
  id: s.nullable(s.string("The Lessonspace space UUID when present.")),
  slug: s.nullable(s.string("The Lessonspace space slug when present.")),
});

const sessionDetailSchema = s.object("A normalized Lessonspace session record.", {
  id: s.integer("The internal Lessonspace session identifier."),
  uuid: s.uuid("The Lessonspace session UUID."),
  name: s.nullable(s.string("The Lessonspace session name when present.")),
  startTime: s.nullable(s.dateTime("The session start timestamp when present.")),
  endTime: s.nullable(s.dateTime("The session end timestamp when present.")),
  summary: s.nullable(s.string("The Lessonspace AI lesson summary when present.")),
  recordingAvailable: s.nullable(s.boolean("Whether the Lessonspace session recording is available.")),
  playbackUrl: s.nullable(s.string("The playback URL returned on the session object when present.")),
  space: s.nullable(sessionSpaceSchema),
  raw: s.looseObject("The raw session payload returned by Lessonspace."),
});

const launchResponseSchema = s.object("A normalized Lessonspace launch response.", {
  statusCode: s.integer("The HTTP status code returned by the launch endpoint."),
  clientUrl: s.url("The URL used to open or embed the Lessonspace room."),
  apiBase: s.url("The room.sh API base URL returned by Lessonspace."),
  roomId: s.nonEmptyString("The underlying room identifier."),
  secret: s.nonEmptyString("The room secret returned by Lessonspace."),
  sessionId: s.nonEmptyString("The session identifier returned by Lessonspace."),
  userId: s.integer("The internal Lessonspace user identifier."),
  roomSettings: s.looseObject("The room settings returned by Lessonspace."),
  raw: s.looseObject("The raw launch payload returned by Lessonspace."),
});

export const lessonspaceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organisation_sessions",
    description: "List Lessonspace sessions for one organisation with official filter parameters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Lessonspace organisation sessions.",
      {
        organisation_id: organisationIdSchema,
        search: s.nonEmptyString("A Lessonspace search term or UUID fragment used to filter sessions."),
        page: s.integer("The page number within the paginated Lessonspace result set.", {
          minimum: 1,
        }),
        include_single_user: s.boolean("Whether to include sessions with one user only."),
        duration_min: s.integer("Minimum session duration in seconds.", { minimum: 0 }),
        duration_max: s.integer("Maximum session duration in seconds.", { minimum: 0 }),
        start_time_after: isoDateTimeSchema,
        start_time_before: isoDateTimeSchema,
        end_time_after: isoDateTimeSchema,
        end_time_before: isoDateTimeSchema,
        date_after: isoDateTimeSchema,
        date_before: isoDateTimeSchema,
        user: s.array(
          "Lessonspace user identifiers used to filter sessions.",
          s.nonEmptyString("One Lessonspace user identifier."),
          { minItems: 1 },
        ),
        space: s.array("Lessonspace space UUIDs used to filter sessions.", spaceUuidSchema, {
          minItems: 1,
        }),
        launch_id: s.nonEmptyString("The Launch endpoint id used to filter linked Lessonspace sessions."),
        in_progress_only: s.boolean("Whether to return only in-progress sessions."),
        tags: sessionFilterTagsSchema,
        user_external_id: s.nonEmptyString("The external user id supplied to the Lessonspace launch payload."),
        user_name: s.nonEmptyString("The partial Lessonspace launch user name used to filter sessions."),
      },
      {
        optional: [
          "organisation_id",
          "search",
          "page",
          "include_single_user",
          "duration_min",
          "duration_max",
          "start_time_after",
          "start_time_before",
          "end_time_after",
          "end_time_before",
          "date_after",
          "date_before",
          "user",
          "space",
          "launch_id",
          "in_progress_only",
          "tags",
          "user_external_id",
          "user_name",
        ],
      },
    ),
    outputSchema: s.object("The Lessonspace organisation session list response.", {
      sessions: s.array("The normalized Lessonspace sessions returned by the request.", sessionSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_organisation_session",
    description: "Get one Lessonspace organisation session by session UUID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for reading one Lessonspace session.",
      {
        organisation_id: organisationIdSchema,
        session_uuid: sessionUuidSchema,
      },
      { optional: ["organisation_id"] },
    ),
    outputSchema: s.object("The normalized Lessonspace session response.", {
      session: sessionDetailSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_session_recording_url",
    description: "Get the Lessonspace playback URL for one recorded session.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for reading a Lessonspace session recording URL.",
      {
        organisation_id: organisationIdSchema,
        session_uuid: sessionUuidSchema,
      },
      { optional: ["organisation_id"] },
    ),
    outputSchema: s.object("The normalized Lessonspace recording URL response.", {
      recordingUrl: s.url("The recording URL returned by Lessonspace."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_unified_space",
    description:
      "Create or retrieve a Lessonspace space through the official launch endpoint and return the join URL plus room credentials.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for creating or retrieving a Lessonspace space.",
      {
        id: s.nonEmptyString("The unique Lessonspace launch identifier for the space."),
        name: s.nonEmptyString("The optional Lessonspace space name."),
        user: launchUserSchema,
        features: s.record("Lessonspace features passed directly to the launch payload.", launchFeatureValueSchema),
        invite_url: s.url("Custom invite URL used by the Lessonspace Invite Others button."),
        resource_url: s.url("Custom resource library URL."),
        tags: s.record("Key-value tags applied to the Lessonspace session.", s.nonEmptyString("One tag value.")),
        space_tags: s.record("Key-value tags applied to the Lessonspace space.", s.nonEmptyString("One tag value.")),
        holodeck_parameters: s.looseObject("Advanced Holodeck parameters passed through to Lessonspace."),
        auth_external: s.looseObject("External authentication settings passed through to Lessonspace."),
      },
      {
        optional: [
          "name",
          "user",
          "features",
          "invite_url",
          "resource_url",
          "tags",
          "space_tags",
          "holodeck_parameters",
          "auth_external",
        ],
      },
    ),
    outputSchema: launchResponseSchema,
  }),
];
