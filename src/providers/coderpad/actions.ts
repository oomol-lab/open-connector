import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "coderpad";

const sortSchema = s.string(
  "The pad or question field and direction to sort by, such as created_at,desc or updated_at,asc.",
);

const paginationFields = {
  sort: sortSchema,
  page: s.integer("The one-based result page to retrieve.", { minimum: 1 }),
};

const padSchema = s.object(
  "A CoderPad interview pad returned by the API.",
  {
    id: s.string("The unique pad identifier."),
    title: s.string("The user-assigned pad title."),
    state: s.string("The current pad state."),
    owner_email: s.string("The email address of the pad owner."),
    language: s.nullable(s.string("The active programming language, or null before selection.")),
    private: s.boolean("Whether guests need authorization to view the pad."),
    execution_enabled: s.boolean("Whether code execution is enabled."),
    created_at: s.string("The pad creation timestamp."),
    updated_at: s.string("The most recent pad update timestamp."),
    ended_at: s.nullable(s.string("The timestamp when the interview ended, or null while active.")),
    url: s.string("The URL of the pad editing interface."),
    playback: s.string("The URL of the pad playback interface."),
  },
  {
    optional: [
      "state",
      "owner_email",
      "language",
      "private",
      "execution_enabled",
      "created_at",
      "updated_at",
      "ended_at",
      "url",
      "playback",
    ],
    additionalProperties: true,
  },
);

const questionSchema = s.object(
  "A CoderPad interview question returned by the API.",
  {
    id: s.integer("The unique question identifier."),
    title: s.string("The question title."),
    owner_email: s.string("The email address of the question owner."),
    language: s.nullable(s.string("The programming language used by the question.")),
    description: s.nullable(s.string("The question description.")),
    shared: s.boolean("Whether the question is shared with the organization."),
    used: s.integer("The number of times the question has been used."),
    created_at: s.string("The question creation timestamp."),
    updated_at: s.string("The most recent question update timestamp."),
  },
  {
    optional: ["owner_email", "language", "description", "shared", "used", "created_at", "updated_at"],
    additionalProperties: true,
  },
);

const statusOutputFields = {
  status: s.string("The status string returned by CoderPad."),
};

export const coderpadActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_pads",
    description: "List interview pads owned by the authenticated CoderPad user.",
    requiredScopes: [],
    inputSchema: s.object("Pagination and sorting options for listing pads.", paginationFields, {
      optional: ["sort", "page"],
    }),
    outputSchema: s.object(
      "A paginated list of CoderPad interview pads.",
      {
        ...statusOutputFields,
        pads: s.array("The pads on this result page.", padSchema),
        total: s.integer("The total number of matching pads."),
        next_page: s.string("The URL of the next result page."),
        prev_page: s.string("The URL of the previous result page."),
      },
      { optional: ["next_page", "prev_page"], additionalProperties: true },
    ),
  }),
  defineProviderAction(service, {
    name: "get_pad",
    description: "Retrieve current details for one CoderPad interview pad.",
    requiredScopes: [],
    inputSchema: s.object("The pad to retrieve.", {
      padId: s.string("The unique CoderPad pad identifier.", { minLength: 1 }),
    }),
    outputSchema: padSchema,
  }),
  defineProviderAction(service, {
    name: "create_pad",
    description: "Create a CoderPad interview pad with optional initial content and notes.",
    requiredScopes: [],
    inputSchema: s.object(
      "Initial settings for a new CoderPad interview pad.",
      {
        title: s.string("The title displayed for the new pad."),
        language: s.string("The CoderPad language identifier for the new pad."),
        contents: s.string("The initial source code placed in the pad editor."),
        notes: s.string("Private interviewer notes stored with the pad."),
      },
      { optional: ["title", "language", "contents", "notes"] },
    ),
    outputSchema: padSchema,
  }),
  defineProviderAction(service, {
    name: "list_pad_events",
    description: "List recorded participant and execution events for a CoderPad interview pad.",
    requiredScopes: [],
    inputSchema: s.object(
      "The pad and pagination options for retrieving events.",
      {
        padId: s.string("The unique CoderPad pad identifier.", { minLength: 1 }),
        ...paginationFields,
      },
      { optional: ["sort", "page"] },
    ),
    outputSchema: s.object(
      "A paginated list of events recorded for a pad.",
      {
        ...statusOutputFields,
        events: s.array(
          "The events on this result page.",
          s.object(
            "A recorded pad event.",
            {
              message: s.string("The human-readable event message."),
              kind: s.string("The event kind."),
              metadata: s.nullable(s.string("Additional information associated with the event.")),
              user_name: s.nullable(s.string("The name of the user associated with the event.")),
              user_email: s.nullable(s.string("The email address of the user associated with the event.")),
              created_at: s.string("The event timestamp."),
            },
            {
              optional: ["metadata", "user_name", "user_email"],
              additionalProperties: true,
            },
          ),
        ),
        total: s.integer("The total number of recorded events."),
        next_page: s.string("The URL of the next result page."),
        prev_page: s.string("The URL of the previous result page."),
      },
      { optional: ["next_page", "prev_page"], additionalProperties: true },
    ),
  }),
  defineProviderAction(service, {
    name: "list_questions",
    description: "List interview questions owned by the authenticated CoderPad user.",
    requiredScopes: [],
    inputSchema: s.object("Pagination and sorting options for listing questions.", paginationFields, {
      optional: ["sort", "page"],
    }),
    outputSchema: s.object(
      "A paginated list of CoderPad interview questions.",
      {
        ...statusOutputFields,
        questions: s.array("The questions on this result page.", questionSchema),
        total: s.integer("The total number of matching questions."),
        next_page: s.string("The URL of the next result page."),
        prev_page: s.string("The URL of the previous result page."),
      },
      { optional: ["next_page", "prev_page"], additionalProperties: true },
    ),
  }),
  defineProviderAction(service, {
    name: "get_question",
    description: "Retrieve one CoderPad interview question by its numeric identifier.",
    requiredScopes: [],
    inputSchema: s.object("The question to retrieve.", {
      questionId: s.integer("The unique CoderPad question identifier.", { minimum: 1 }),
    }),
    outputSchema: questionSchema,
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Retrieve profile, users, teams, and sign-on settings for the CoderPad organization.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to retrieve the organization.", {}),
    outputSchema: s.object(
      "The authenticated CoderPad organization.",
      {
        ...statusOutputFields,
        organization_name: s.string("The organization display name."),
        user_count: s.integer("The number of users in the organization."),
        organization_default_language: s.string("The default language for organization users."),
        single_sign_on_supported: s.boolean("Whether the organization supports single sign-on."),
        single_sign_in_url: s.string("The organization single sign-on URL."),
      },
      {
        optional: ["user_count", "organization_default_language", "single_sign_on_supported", "single_sign_in_url"],
        additionalProperties: true,
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_organization_stats",
    description: "Retrieve CoderPad pad usage statistics for an optional time range.",
    requiredScopes: [],
    inputSchema: s.object(
      "The optional inclusive usage-statistics time range.",
      {
        startTime: s.string("The ISO 8601 start timestamp; endTime is required with it."),
        endTime: s.string("The ISO 8601 end timestamp; startTime is required with it."),
      },
      { optional: ["startTime", "endTime"] },
    ),
    outputSchema: s.object(
      "CoderPad organization pad usage statistics.",
      {
        ...statusOutputFields,
        start_time: s.string("The start timestamp used for the statistics window."),
        end_time: s.string("The end timestamp used for the statistics window."),
        pads_created: s.integer("The number of pads created in the statistics window."),
      },
      { additionalProperties: true },
    ),
  }),
];
