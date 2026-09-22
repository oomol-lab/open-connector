import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "speak_ai" as const;
const rawObject = s.looseObject("A provider-defined object returned by Speak AI.");
const mediaIdInput = s.object("The Speak AI media item to retrieve.", {
  mediaId: s.nonEmptyString("The unique Speak AI media identifier."),
});

export const speakAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "upload_media",
    operationType: "write",
    description: "Submit a public audio or video URL to Speak AI for asynchronous transcription and analysis.",
    asyncLifecycle: {
      startActionId: "speak_ai.upload_media",
      statusActionId: "speak_ai.get_media_status",
    },
    inputSchema: s.object(
      "The public media URL and metadata to submit to Speak AI.",
      {
        name: s.nonEmptyString("The display name for the media item."),
        mediaUrl: s.nonEmptyString("A public audio, video, or supported social-media URL that Speak AI can fetch.", {
          format: "uri",
        }),
        mediaType: s.stringEnum("The media type when it is known; omit it to let Speak AI inspect the URL.", [
          "audio",
          "video",
        ]),
        description: s.string("A description stored with the media item."),
        sourceLanguage: s.string("The transcription language as a BCP-47 language code, such as en-US."),
        tags: s.string("Comma-separated tags stored with the media item."),
        folderId: s.string("The Speak AI folder identifier that should contain the media item."),
      },
      { optional: ["mediaType", "description", "sourceLanguage", "tags", "folderId"] },
    ),
    outputSchema: s.object("The accepted Speak AI media upload.", {
      mediaId: s.string("The media identifier used to poll processing and retrieve results."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_media",
    operationType: "read",
    description: "List and filter media items in the connected Speak AI workspace.",
    inputSchema: s.object(
      "Filters and pagination for the Speak AI media library.",
      {
        mediaType: s.stringEnum("The media type to return.", ["audio", "video", "text"]),
        page: s.integer("The one-based page number to return.", { minimum: 1 }),
        pageSize: s.integer("The number of media items to return.", { minimum: 1, maximum: 100 }),
        sortBy: s.string("The upstream sort expression, such as createdAt:desc."),
        filterMedia: s.integer("The ownership filter: 0 for uploaded, 1 for assigned, or 2 for both.", {
          minimum: 0,
          maximum: 2,
        }),
        filterName: s.string("Text matched against media names and analyzed content."),
        folderId: s.string("The folder whose media items should be returned."),
      },
      {
        optional: ["mediaType", "page", "pageSize", "sortBy", "filterMedia", "filterName", "folderId"],
      },
    ),
    outputSchema: s.object("A page of Speak AI media items.", {
      totalCount: s.integer("The total number of matching media items."),
      pages: s.integer("The number of available result pages."),
      media: s.array("The media items returned for this page.", rawObject),
    }),
  }),
  defineProviderAction(service, {
    name: "get_media_status",
    operationType: "read",
    description: "Get processing state and metadata for one Speak AI media item.",
    asyncLifecycle: {
      startActionId: "speak_ai.upload_media",
      statusActionId: "speak_ai.get_media_status",
    },
    inputSchema: mediaIdInput,
    outputSchema: s.object("The processing status returned by Speak AI.", {
      mediaId: s.string("The media identifier."),
      state: s.string("The current processing state."),
      media: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "get_transcript",
    operationType: "read",
    description: "Retrieve the transcript, speakers, and timestamps for one Speak AI media item.",
    inputSchema: mediaIdInput,
    outputSchema: s.object("The transcript response returned by Speak AI.", {
      mediaId: s.string("The media identifier."),
      transcript: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "get_media_insights",
    operationType: "read",
    description: "Retrieve AI-generated summaries, topics, sentiment, and other insights for processed Speak AI media.",
    inputSchema: mediaIdInput,
    outputSchema: s.object("The analysis response returned by Speak AI.", {
      mediaId: s.string("The media identifier."),
      insights: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "list_folders",
    operationType: "read",
    description: "List folders available in the connected Speak AI workspace.",
    inputSchema: s.object(
      "Pagination and sorting for Speak AI folders.",
      {
        page: s.integer("The one-based page number.", { minimum: 1 }),
        pageSize: s.integer("The number of folders to return.", { minimum: 1, maximum: 500 }),
        sortBy: s.string("The upstream sort expression, such as createdAt:desc."),
      },
      { optional: ["page", "pageSize", "sortBy"] },
    ),
    outputSchema: s.object("A page of Speak AI folders.", {
      totalCount: s.integer("The total number of folders."),
      folders: s.array("The folders returned for this page.", rawObject),
      pages: s.anyOf("The provider pagination value.", [
        s.integer("The page count."),
        { type: "null", description: "No page count was returned." },
      ]),
    }),
  }),
];
