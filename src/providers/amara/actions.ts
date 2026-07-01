import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "amara";

const looseObjectSchema = s.unknownObject("Provider-specific Amara object payload.");
const stringMapSchema = s.record(s.string("Metadata value."), {
  description: "A string-to-string map.",
});
const paginationSchema = s.object("Pagination metadata returned by Amara.", {
  totalCount: s.integer("The total number of results."),
  offset: s.integer("The current pagination offset."),
  limit: s.integer("The current page size."),
  next: s.nullable(s.string("The URL for the next page, or null.")),
  previous: s.nullable(s.string("The URL for the previous page, or null.")),
});
const languageSchema = s.object("An Amara language.", {
  code: s.string("The Amara language code."),
  name: s.string("The display name of the language."),
});
const videoSummarySchema = s.object(
  "An Amara video summary.",
  {
    id: s.string("The Amara video identifier."),
    title: s.string("The video title."),
    description: s.nullable(s.string("The video description, if present.")),
    team: s.nullable(s.string("The owning team slug, if present.")),
    project: s.nullable(s.string("The owning project slug, if present.")),
    primaryAudioLanguageCode: s.nullable(s.string("The primary audio language code.")),
    duration: s.integer("The video duration in seconds.", { minimum: 0 }),
    created: s.string("The ISO timestamp when the video was created."),
    allUrls: s.array("All source URLs attached to the video.", s.string("A source URL.")),
  },
  {
    optional: [
      "title",
      "description",
      "team",
      "project",
      "primaryAudioLanguageCode",
      "duration",
      "created",
      "allUrls",
    ],
  },
);
const userSchema = s.object(
  "An Amara user profile.",
  {
    id: s.string("The Amara user identifier."),
    username: s.string("The Amara username."),
    fullName: s.nullable(s.string("The user's full name, if present.")),
    displayName: s.nullable(s.string("The user's display name, if present.")),
    isActive: s.boolean("Whether the user is currently active."),
  },
  { optional: ["fullName", "displayName", "isActive"] },
);
const teamSchema = s.object(
  "An Amara team summary.",
  {
    slug: s.string("The team slug."),
    name: s.string("The team display name."),
    description: s.nullable(s.string("The team description, if present.")),
    teamVisibility: s.nullable(s.string("The team visibility setting.")),
    videoVisibility: s.nullable(s.string("The video visibility setting.")),
  },
  { optional: ["name", "description", "teamVisibility", "videoVisibility"] },
);
const activitySchema = s.object(
  "An Amara activity item.",
  {
    id: s.integer("The activity identifier.", { minimum: 0 }),
    created: s.string("The ISO timestamp when the activity happened."),
    date: s.string("The ISO timestamp when the activity happened."),
    type: s.anyOf("The activity type code or name.", [
      s.integer("The activity type code."),
      s.string("The activity type name."),
    ]),
    typeName: s.nullable(s.string("The activity type display name.")),
    video: s.nullable(s.string("The related video title or identifier.")),
    language: s.nullable(s.string("The related language code, if present.")),
  },
  { optional: ["id", "created", "date", "typeName", "video", "language"] },
);
const subtitleLanguageSchema = s.object(
  "An Amara subtitle language summary.",
  {
    languageCode: s.string("The subtitle language code."),
    name: s.string("The subtitle language display name."),
    subtitleCount: s.integer("The subtitle count.", { minimum: 0 }),
    published: s.boolean("Whether the subtitle language is published."),
    subtitlesComplete: s.boolean("Whether the subtitle language is marked complete."),
    isPrimaryAudioLanguage: s.boolean("Whether this is the primary audio language."),
  },
  { optional: ["subtitleCount", "published", "subtitlesComplete", "isPrimaryAudioLanguage"] },
);
const subtitleSegmentSchema = s.object("An Amara subtitle segment.", {
  start: s.number("The subtitle start time in seconds."),
  end: s.number("The subtitle end time in seconds."),
  text: s.string("The subtitle text."),
});
const subtitleActionSchema = s.object(
  "An available Amara subtitle action.",
  {
    action: s.string("The machine-readable subtitle action."),
    label: s.string("The display label for the action."),
    completed: s.nullable(s.boolean("Whether the action is completed.")),
  },
  { optional: ["completed"] },
);
const subtitleNoteSchema = s.object("An Amara subtitle note.", {
  body: s.string("The note body."),
  created: s.string("The ISO timestamp when the note was created."),
  user: looseObjectSchema,
});
const videoUrlSchema = s.object(
  "An Amara video URL entry.",
  {
    id: s.integer("The internal video URL identifier.", { minimum: 0 }),
    url: s.string("The video URL."),
    primary: s.boolean("Whether this URL is the primary URL."),
    original: s.boolean("Whether this URL is the original URL."),
    type: s.string("The source URL type."),
    resourceUri: s.string("The resource URI for the video URL."),
  },
  { optional: ["original", "type", "resourceUri"] },
);

const noInputSchema = s.object("No input is required for this action.", {});
const videoIdInputSchema = s.object("Input for an Amara video action.", {
  videoId: s.nonEmptyString("The Amara video ID."),
});
const videoLanguageInputSchema = s.object("Input for an Amara video language action.", {
  videoId: s.nonEmptyString("The Amara video ID."),
  languageCode: s.nonEmptyString("The subtitle language code."),
});

export const amaraActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_languages",
    description: "List the languages supported by the Amara API.",
    requiredScopes: [],
    inputSchema: noInputSchema,
    outputSchema: s.object("Output for listing Amara languages.", {
      languages: s.array("The supported Amara languages.", languageSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_available_languages",
    description: "List the languages supported by the Amara API.",
    requiredScopes: [],
    inputSchema: noInputSchema,
    outputSchema: s.object("Output for listing Amara languages.", {
      languages: s.array("The supported Amara languages.", languageSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_videos",
    description: "List Amara videos with optional filters, sorting, and pagination controls.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Amara videos.",
      {
        sort: s.string("The sort expression, such as `-created`."),
        team: s.string("The team slug to filter by."),
        owner: s.string("The owner username to filter by."),
        project: s.string("The project slug to filter by."),
        language: s.string("The language code to filter by."),
        archive: s.boolean("Whether to return archived videos only."),
        videoId: s.string("A comma-separated list of video IDs to filter by."),
        videoUrl: s.url("A source video URL to filter by."),
        offset: s.integer("The zero-based result offset.", { minimum: 0 }),
        limit: s.integer("The page size to request.", { minimum: 1, maximum: 50 }),
      },
      {
        optional: [
          "sort",
          "team",
          "owner",
          "project",
          "language",
          "archive",
          "videoId",
          "videoUrl",
          "offset",
          "limit",
        ],
      },
    ),
    outputSchema: s.object("Output for listing Amara videos.", {
      videos: s.array("The list of matching videos.", videoSummarySchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_video",
    description: "Fetch a single Amara video by video ID.",
    requiredScopes: [],
    inputSchema: videoIdInputSchema,
    outputSchema: s.object("Output for fetching an Amara video.", {
      video: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "view_video_details",
    description: "Fetch a single Amara video by video ID.",
    requiredScopes: [],
    inputSchema: videoIdInputSchema,
    outputSchema: s.object("Output for fetching an Amara video.", {
      video: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_video",
    description: "Create a new Amara video from a source URL and title, with optional metadata.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating an Amara video.",
      {
        videoUrl: s.url("The source video URL."),
        title: s.nonEmptyString("The video title."),
        team: s.string("The team slug to assign the video to."),
        project: s.string("The project slug to assign the video to."),
        duration: s.integer("The video duration in seconds.", { minimum: 0 }),
        metadata: stringMapSchema,
        thumbnail: s.url("The thumbnail URL."),
        description: s.string("The video description."),
        primaryAudioLanguageCode: s.string("The primary audio language code."),
      },
      {
        required: ["videoUrl", "title"],
        optional: [
          "team",
          "project",
          "duration",
          "metadata",
          "thumbnail",
          "description",
          "primaryAudioLanguageCode",
        ],
      },
    ),
    outputSchema: s.object("Output for creating an Amara video.", {
      video: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_video",
    description: "Update an existing Amara video's metadata, assignment, or language settings.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for updating an Amara video.",
      {
        videoId: s.nonEmptyString("The Amara video ID."),
        team: s.string("The team slug to assign the video to."),
        title: s.string("The new video title."),
        project: s.string("The project slug to assign the video to."),
        duration: s.integer("The video duration in seconds.", { minimum: 0 }),
        metadata: stringMapSchema,
        thumbnail: s.url("The thumbnail URL."),
        description: s.string("The video description."),
        primaryAudioLanguageCode: s.string("The primary audio language code."),
      },
      {
        required: ["videoId"],
        optional: [
          "team",
          "title",
          "project",
          "duration",
          "metadata",
          "thumbnail",
          "description",
          "primaryAudioLanguageCode",
        ],
      },
    ),
    outputSchema: s.object("Output for updating an Amara video.", {
      video: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_video_activity",
    description: "List activity items for a single Amara video with pagination controls.",
    requiredScopes: [],
    inputSchema: paginatedVideoInputSchema(),
    outputSchema: activityListOutputSchema(),
  }),
  defineProviderAction(service, {
    name: "list_video_urls",
    description: "List all source URLs associated with a single Amara video.",
    requiredScopes: [],
    inputSchema: paginatedVideoInputSchema(),
    outputSchema: s.object("Output for listing Amara video URLs.", {
      urls: s.array("The list of video URL entries.", videoUrlSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_video_url",
    description: "Fetch a single Amara video URL entry by video ID and URL ID.",
    requiredScopes: [],
    inputSchema: videoUrlInputSchema(),
    outputSchema: s.object("Output for fetching an Amara video URL.", {
      videoUrl: videoUrlSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "add_video_url",
    description: "Add a new source URL to an existing Amara video.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for adding an Amara video URL.",
      {
        videoId: s.nonEmptyString("The Amara video ID."),
        url: s.url("The video URL to add."),
        primary: s.boolean("Whether to set the new URL as the primary URL."),
      },
      { required: ["videoId", "url"], optional: ["primary"] },
    ),
    outputSchema: s.object("Output for adding an Amara video URL.", {
      videoUrl: videoUrlSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_video_url",
    description: "Delete a source URL from an existing Amara video.",
    requiredScopes: [],
    inputSchema: videoUrlInputSchema(),
    outputSchema: successMessageOutputSchema("Output for deleting an Amara video URL."),
  }),
  defineProviderAction(service, {
    name: "make_video_url_primary",
    description: "Update a video URL entry and mark it as the primary URL when requested.",
    requiredScopes: [],
    inputSchema: s.object("Input for making an Amara video URL primary.", {
      videoId: s.nonEmptyString("The Amara video ID."),
      urlId: s.integer("The internal video URL ID.", { minimum: 0 }),
      primary: s.boolean("Whether the URL should become the primary URL."),
    }),
    outputSchema: s.object("Output for making an Amara video URL primary.", {
      videoUrl: videoUrlSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_video_url_details",
    description: "Look up Amara metadata for a public or embeddable video URL.",
    requiredScopes: [],
    inputSchema: s.object("Input for looking up an Amara video URL.", {
      url: s.url("The public or embeddable video URL."),
    }),
    outputSchema: s.object("Output for looking up an Amara video URL.", {
      videoUrl: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_subtitle_languages",
    description: "List all subtitle language tracks for a single Amara video.",
    requiredScopes: [],
    inputSchema: videoIdInputSchema,
    outputSchema: s.object("Output for listing Amara subtitle languages.", {
      languages: s.array("The subtitle language tracks.", subtitleLanguageSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_subtitle_language",
    description: "Create a new subtitle language track for an Amara video.",
    requiredScopes: [],
    inputSchema: s.object("Input for creating an Amara subtitle language.", {
      videoId: s.nonEmptyString("The Amara video ID."),
      language: s.nonEmptyString("The subtitle language code to add."),
    }),
    outputSchema: s.object("Output for creating an Amara subtitle language.", {
      language: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_subtitle_language_details",
    description: "Fetch a single subtitle language track for an Amara video.",
    requiredScopes: [],
    inputSchema: videoLanguageInputSchema,
    outputSchema: s.object("Output for fetching an Amara subtitle language.", {
      language: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_subtitle_language",
    description: "Update subtitle language settings such as completion flags and soft limits.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for updating an Amara subtitle language.",
      {
        videoId: s.nonEmptyString("The Amara video ID."),
        languageCode: s.nonEmptyString("The subtitle language code."),
        softLimitCpl: s.integer("The soft limit for characters per line.", { minimum: 1 }),
        softLimitCps: s.integer("The soft limit for characters per second.", { minimum: 1 }),
        softLimitLines: s.integer("The soft limit for subtitle lines.", { minimum: 1 }),
        subtitlesComplete: s.boolean("Whether the subtitles are complete."),
        softLimitMaxDuration: s.integer("The soft limit for maximum subtitle duration in milliseconds.", {
          minimum: 1,
        }),
        softLimitMinDuration: s.integer("The soft limit for minimum subtitle duration in milliseconds.", {
          minimum: 1,
        }),
        isPrimaryAudioLanguage: s.boolean("Whether this is the primary audio language."),
      },
      {
        required: ["videoId", "languageCode"],
        optional: [
          "softLimitCpl",
          "softLimitCps",
          "softLimitLines",
          "subtitlesComplete",
          "softLimitMaxDuration",
          "softLimitMinDuration",
          "isPrimaryAudioLanguage",
        ],
      },
    ),
    outputSchema: s.object("Output for updating an Amara subtitle language.", {
      language: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "fetch_subtitles_data",
    description: "Fetch subtitle data for a specific video and language in JSON, SRT, or VTT format.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for fetching Amara subtitles.",
      {
        videoId: s.nonEmptyString("The Amara video ID."),
        languageCode: s.nonEmptyString("The subtitle language code."),
        format: s.stringEnum("The subtitle format to fetch.", ["json", "srt", "vtt"]),
      },
      { required: ["videoId", "languageCode"], optional: ["format"] },
    ),
    outputSchema: s.object(
      "Output for fetching Amara subtitles.",
      {
        videoId: s.string("The Amara video ID."),
        language: s.string("The subtitle language code."),
        format: s.string("The fetched subtitle format."),
        subtitles: s.array("The parsed subtitle segments for JSON responses.", subtitleSegmentSchema),
        subtitlesText: s.nullable(s.string("The raw subtitle text for text-based responses.")),
      },
      { optional: ["subtitles", "subtitlesText"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_subtitles",
    description: "Create a new subtitle version for a specific video and language.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating Amara subtitles. Exactly one of subtitles or subtitlesUrl is required.",
      {
        videoId: s.nonEmptyString("The Amara video ID."),
        languageCode: s.nonEmptyString("The subtitle language code."),
        subFormat: s.stringEnum("The subtitle format being uploaded.", [
          "json",
          "srt",
          "dfxp",
          "vtt",
          "sbv",
          "txt",
          "ssa",
        ]),
        subtitles: s.string("The subtitle content string."),
        subtitlesUrl: s.url("The URL to a subtitle file."),
        title: s.string("The subtitle version title."),
        action: s.string("The optional subtitle creation action."),
        metadata: looseObjectSchema,
        description: s.string("The subtitle version description."),
      },
      {
        required: ["videoId", "languageCode", "subFormat"],
        optional: ["subtitles", "subtitlesUrl", "title", "action", "metadata", "description"],
      },
    ),
    outputSchema: s.object("Output for creating Amara subtitles.", {
      subtitleVersion: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_subtitle_actions",
    description: "List the subtitle workflow actions available for a specific video and language.",
    requiredScopes: [],
    inputSchema: videoLanguageInputSchema,
    outputSchema: s.object("Output for listing Amara subtitle actions.", {
      actions: s.array("The available subtitle actions.", subtitleActionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "perform_subtitle_action",
    description: "Perform a subtitle workflow action such as publish, approve, or reject.",
    requiredScopes: [],
    inputSchema: s.object("Input for performing an Amara subtitle action.", {
      videoId: s.nonEmptyString("The Amara video ID."),
      languageCode: s.nonEmptyString("The subtitle language code."),
      action: s.nonEmptyString("The subtitle workflow action to perform."),
    }),
    outputSchema: successMessageOutputSchema("Output for performing an Amara subtitle action."),
  }),
  defineProviderAction(service, {
    name: "list_subtitle_notes",
    description: "List all subtitle notes for a specific video and subtitle language.",
    requiredScopes: [],
    inputSchema: videoLanguageInputSchema,
    outputSchema: s.object("Output for listing Amara subtitle notes.", {
      notes: s.array("The subtitle notes.", subtitleNoteSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "add_subtitle_note",
    description: "Add a subtitle note for a specific video and subtitle language.",
    requiredScopes: [],
    inputSchema: s.object("Input for adding an Amara subtitle note.", {
      videoId: s.nonEmptyString("The Amara video ID."),
      languageCode: s.nonEmptyString("The subtitle language code."),
      body: s.nonEmptyString("The subtitle note body."),
    }),
    outputSchema: s.object("Output for adding an Amara subtitle note.", {
      note: subtitleNoteSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_activity",
    description: "List Amara activity items with optional team, video, language, and date filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Amara activity.",
      {
        team: s.string("The team slug to filter by."),
        type: s.integer("The activity type code.", { minimum: 1, maximum: 15 }),
        after: s.string("Only include activity after this ISO timestamp."),
        before: s.string("Only include activity before this ISO timestamp."),
        limit: s.integer("The page size to request.", { minimum: 1 }),
        video: s.string("The video ID to filter by."),
        offset: s.integer("The zero-based result offset.", { minimum: 0 }),
        language: s.string("The language code to filter by."),
        teamActivity: s.boolean("Whether to request team-level activity instead of team video activity."),
      },
      {
        optional: [
          "team",
          "type",
          "after",
          "before",
          "limit",
          "video",
          "offset",
          "language",
          "teamActivity",
        ],
      },
    ),
    outputSchema: activityListOutputSchema(),
  }),
  defineProviderAction(service, {
    name: "get_activity",
    description: "Fetch a single Amara activity item by activity ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for fetching an Amara activity.", {
      activityId: s.integer("The activity identifier.", { minimum: 0 }),
    }),
    outputSchema: s.object("Output for fetching an Amara activity.", {
      activity: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Fetch a single Amara user by username or user ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for fetching an Amara user.", {
      userIdentifier: s.nonEmptyString("The Amara username or user ID."),
    }),
    outputSchema: s.object("Output for fetching an Amara user.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_user_data",
    description: "Fetch a single Amara user by username, `me`, or user ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for fetching Amara user data.", {
      identifier: s.nonEmptyString("The Amara username, `me`, or user ID."),
    }),
    outputSchema: s.object("Output for fetching Amara user data.", {
      user: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_user_activity",
    description: "List activity items for a specific Amara user.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Amara user activity.",
      {
        identifier: s.nonEmptyString("The Amara username, `me`, or user ID."),
        offset: s.integer("The zero-based result offset.", { minimum: 0 }),
        limit: s.integer("The page size to request.", { minimum: 1 }),
      },
      { required: ["identifier"], optional: ["offset", "limit"] },
    ),
    outputSchema: activityListOutputSchema(),
  }),
  defineProviderAction(service, {
    name: "list_teams",
    description: "List the Amara teams accessible to the current API key with pagination controls.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Amara teams.",
      {
        offset: s.integer("The zero-based result offset.", { minimum: 0 }),
        limit: s.integer("The page size to request.", { minimum: 1 }),
      },
      { optional: ["offset", "limit"] },
    ),
    outputSchema: s.object("Output for listing Amara teams.", {
      teams: s.array("The list of Amara teams.", teamSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_team_details",
    description: "Fetch a single Amara team by team slug.",
    requiredScopes: [],
    inputSchema: s.object("Input for fetching an Amara team.", {
      slug: s.nonEmptyString("The team slug."),
    }),
    outputSchema: s.object("Output for fetching an Amara team.", {
      team: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_team_languages",
    description: "Fetch preferred and blacklisted language codes for a single Amara team.",
    requiredScopes: [],
    inputSchema: s.object("Input for fetching Amara team languages.", {
      slug: s.nonEmptyString("The team slug."),
    }),
    outputSchema: s.object("Output for fetching Amara team languages.", {
      preferred: s.array("The preferred language codes.", s.string("A preferred language code.")),
      blacklisted: s.array("The blacklisted language codes.", s.string("A blacklisted language code.")),
    }),
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a message to an Amara user or team recipient.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for sending an Amara message. Exactly one of user or team is required.",
      {
        subject: s.nonEmptyString("The message subject."),
        content: s.nonEmptyString("The message body."),
        user: s.string("The target username or user ID."),
        team: s.string("The target team slug."),
      },
      { required: ["subject", "content"], optional: ["user", "team"] },
    ),
    outputSchema: successMessageOutputSchema("Output for sending an Amara message."),
  }),
];

function paginatedVideoInputSchema(): ActionDefinition["inputSchema"] {
  return s.object(
    "Input for a paginated Amara video child collection.",
    {
      videoId: s.nonEmptyString("The Amara video ID."),
      offset: s.integer("The zero-based result offset.", { minimum: 0 }),
      limit: s.integer("The page size to request.", { minimum: 1 }),
    },
    { required: ["videoId"], optional: ["offset", "limit"] },
  );
}

function videoUrlInputSchema(): ActionDefinition["inputSchema"] {
  return s.object("Input for an Amara video URL action.", {
    videoId: s.nonEmptyString("The Amara video ID."),
    urlId: s.integer("The internal video URL ID.", { minimum: 0 }),
  });
}

function activityListOutputSchema(): ActionDefinition["outputSchema"] {
  return s.object("Output for listing Amara activity.", {
    activities: s.array("The list of activity items.", activitySchema),
    pagination: paginationSchema,
  });
}

function successMessageOutputSchema(description: string): ActionDefinition["outputSchema"] {
  return s.object(description, {
    success: s.boolean("Whether the operation succeeded."),
    message: s.string("The provider response message."),
  });
}
