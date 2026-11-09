import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "buzzsprout";

const idSchema = (description: string) => s.positiveInteger(description);
const nullableStringSchema = (description: string) => s.nullable(s.string(description));
const nullableIntegerSchema = (description: string) => s.nullable(s.integer(description));

const podcastSchema = s.object("A podcast returned by Buzzsprout.", {
  id: idSchema("The numeric Buzzsprout podcast ID."),
  title: s.string("The podcast title."),
  author: nullableStringSchema("The podcast author when configured."),
  description: nullableStringSchema("The podcast description when configured."),
  websiteAddress: nullableStringSchema("The configured external website address."),
  websiteUrl: nullableStringSchema("The effective podcast website URL."),
  contactEmail: nullableStringSchema("The podcast contact email when configured."),
  keywords: nullableStringSchema("The comma-separated podcast keywords."),
  explicit: s.boolean("Whether the podcast is marked as explicit."),
  mainCategory: nullableStringSchema("The primary podcast category."),
  subCategory: nullableStringSchema("The primary podcast subcategory."),
  mainCategory2: nullableStringSchema("The second podcast category."),
  subCategory2: nullableStringSchema("The second podcast subcategory."),
  mainCategory3: nullableStringSchema("The third podcast category."),
  subCategory3: nullableStringSchema("The third podcast subcategory."),
  language: nullableStringSchema("The podcast language code."),
  timezone: nullableStringSchema("The podcast timezone."),
  artworkUrl: nullableStringSchema("The podcast artwork URL."),
  backgroundUrl: nullableStringSchema("The podcast background image URL."),
  rssUrl: nullableStringSchema("The podcast RSS feed URL."),
  raw: s.looseObject("The raw podcast object returned by Buzzsprout."),
});

const episodeSchema = s.object("An episode returned by Buzzsprout.", {
  id: idSchema("The numeric Buzzsprout episode ID."),
  title: s.string("The episode title."),
  audioUrl: nullableStringSchema("The processed episode audio URL."),
  artworkUrl: nullableStringSchema("The episode artwork URL."),
  description: nullableStringSchema("The episode description."),
  artist: nullableStringSchema("The episode artist."),
  tags: nullableStringSchema("The comma-separated episode tags."),
  publishedAt: nullableStringSchema("The episode publication timestamp."),
  duration: nullableIntegerSchema("The episode duration in seconds, or -1 while processing."),
  guid: nullableStringSchema("The episode GUID."),
  customUrl: nullableStringSchema("The episode custom URL slug."),
  episodeNumber: nullableIntegerSchema("The episode number."),
  seasonNumber: nullableIntegerSchema("The season number."),
  episodeType: nullableStringSchema("The episode type."),
  explicit: s.boolean("Whether the episode is marked as explicit."),
  private: s.boolean("Whether the episode is unpublished and private."),
  totalPlays: nullableIntegerSchema("The total episode play count."),
  raw: s.looseObject("The raw episode object returned by Buzzsprout."),
});

const podcastIdProperty = {
  podcastId: idSchema("The numeric Buzzsprout podcast ID."),
};
const episodeIdProperty = {
  episodeId: idSchema("The numeric Buzzsprout episode ID."),
};

const episodeWriteProperties = {
  title: s.nonEmptyString("The episode title."),
  description: s.string("The episode description."),
  artist: s.string("The episode artist."),
  tags: s.string("Comma-separated episode tags."),
  publishedAt: s.dateTime("The publication timestamp including a timezone offset."),
  seasonNumber: s.nonNegativeInteger("The season number."),
  episodeNumber: s.nonNegativeInteger("The episode number."),
  episodeType: s.stringEnum("The episode type.", ["full", "trailer", "bonus"]),
  explicit: s.boolean("Whether the episode contains explicit content."),
  private: s.boolean("Whether the episode is unpublished and private."),
  customUrl: s.string("The custom episode URL slug."),
  artworkUrl: s.url("A publicly accessible artwork URL that Buzzsprout should fetch."),
};

const listPodcastsAction = defineProviderAction(service, {
  name: "list_podcasts",
  description: "List podcasts available to the authenticated Buzzsprout account.",
  operationType: "read",
  inputSchema: s.object("The input payload for listing Buzzsprout podcasts.", {}),
  outputSchema: s.object("The response returned when listing Buzzsprout podcasts.", {
    podcasts: s.array("The available Buzzsprout podcasts.", podcastSchema),
  }),
});

const getPodcastAction = defineProviderAction(service, {
  name: "get_podcast",
  description: "Get one podcast available to the authenticated Buzzsprout account.",
  operationType: "read",
  inputSchema: s.object("The input payload for getting a Buzzsprout podcast.", podcastIdProperty),
  outputSchema: s.object("The response returned when getting a Buzzsprout podcast.", {
    podcast: podcastSchema,
  }),
});

const updatePodcastAction = defineProviderAction(service, {
  name: "update_podcast",
  description: "Update editable metadata for a Buzzsprout podcast.",
  operationType: "write",
  inputSchema: s.object(
    "The input payload for updating a Buzzsprout podcast.",
    {
      ...podcastIdProperty,
      title: s.nonEmptyString("The podcast title."),
      description: s.string("The podcast description."),
      keywords: s.string("Comma-separated podcast keywords."),
      author: s.string("The podcast author."),
      explicit: s.boolean("Whether the podcast contains explicit content."),
      language: s.string("The podcast language code."),
      timezone: s.string("The podcast timezone name."),
      websiteAddress: s.url("The podcast's external website URL."),
      contactEmail: s.email("The podcast contact email."),
      category: nullableStringSchema("The primary category in Main :: Sub format, or null."),
      category2: nullableStringSchema("The second category in Main :: Sub format, or null."),
      category3: nullableStringSchema("The third category in Main :: Sub format, or null."),
      artworkUrl: s.url("A publicly accessible artwork URL that Buzzsprout should fetch."),
    },
    {
      optional: [
        "title",
        "description",
        "keywords",
        "author",
        "explicit",
        "language",
        "timezone",
        "websiteAddress",
        "contactEmail",
        "category",
        "category2",
        "category3",
        "artworkUrl",
      ],
    },
  ),
  outputSchema: s.object("The response returned after updating a Buzzsprout podcast.", {
    podcast: podcastSchema,
  }),
});

const listEpisodesAction = defineProviderAction(service, {
  name: "list_episodes",
  description: "List episodes for a Buzzsprout podcast.",
  operationType: "read",
  inputSchema: s.object("The input payload for listing Buzzsprout episodes.", podcastIdProperty),
  outputSchema: s.object("The response returned when listing Buzzsprout episodes.", {
    episodes: s.array("The episodes returned by Buzzsprout.", episodeSchema),
  }),
});

const getEpisodeAction = defineProviderAction(service, {
  name: "get_episode",
  description: "Get one episode from a Buzzsprout podcast.",
  operationType: "read",
  inputSchema: s.object("The input payload for getting a Buzzsprout episode.", {
    ...podcastIdProperty,
    ...episodeIdProperty,
  }),
  outputSchema: s.object("The response returned when getting a Buzzsprout episode.", {
    episode: episodeSchema,
  }),
});

const createEpisodeAction = defineProviderAction(service, {
  name: "create_episode",
  description: "Create a Buzzsprout episode without uploading media.",
  operationType: "write",
  inputSchema: s.object(
    "The input payload for creating a Buzzsprout episode.",
    {
      ...podcastIdProperty,
      ...episodeWriteProperties,
    },
    {
      optional: [
        "description",
        "artist",
        "tags",
        "publishedAt",
        "seasonNumber",
        "episodeNumber",
        "episodeType",
        "explicit",
        "private",
        "customUrl",
        "artworkUrl",
      ],
    },
  ),
  outputSchema: s.object("The response returned after creating a Buzzsprout episode.", {
    episode: episodeSchema,
  }),
});

const updateEpisodeAction = defineProviderAction(service, {
  name: "update_episode",
  description: "Update, publish, schedule, or unpublish a Buzzsprout episode.",
  operationType: "destructive",
  inputSchema: s.object(
    "The input payload for updating a Buzzsprout episode.",
    {
      ...podcastIdProperty,
      ...episodeIdProperty,
      ...episodeWriteProperties,
    },
    {
      optional: [
        "title",
        "description",
        "artist",
        "tags",
        "publishedAt",
        "seasonNumber",
        "episodeNumber",
        "episodeType",
        "explicit",
        "private",
        "customUrl",
        "artworkUrl",
      ],
    },
  ),
  outputSchema: s.object("The response returned after updating a Buzzsprout episode.", {
    episode: episodeSchema,
  }),
});

const podcastDownloadSchema = s.object("One episode's download total for a date.", {
  episodeId: idSchema("The numeric Buzzsprout episode ID."),
  total: s.nonNegativeInteger("The number of downloads on the requested date."),
});

const downloadSchema = s.object("One normalized Buzzsprout download event.", {
  app: s.string("The podcast application name."),
  device: s.string("The device name."),
  deviceType: s.string("The device category."),
  countryCode: nullableStringSchema("The ISO country code when available."),
  region: nullableStringSchema("The region when available."),
  city: nullableStringSchema("The city when available."),
  continent: nullableStringSchema("The continent when available."),
  mediaType: s.stringEnum("The media type downloaded.", ["audio", "video"]),
});

const listPodcastDownloadsAction = defineProviderAction(service, {
  name: "list_podcast_downloads",
  description: "List per-episode download totals for one podcast-local date.",
  operationType: "read",
  inputSchema: s.object("The input payload for listing podcast download totals.", {
    ...podcastIdProperty,
    date: s.date("The podcast-local date to query."),
  }),
  outputSchema: s.object("The response returned for podcast download totals.", {
    downloads: s.array("The per-episode download totals.", podcastDownloadSchema),
  }),
});

const listEpisodeDownloadsAction = defineProviderAction(service, {
  name: "list_episode_downloads",
  description: "List paginated download details for one episode and podcast-local date.",
  operationType: "read",
  inputSchema: s.object(
    "The input payload for listing episode download details.",
    {
      ...podcastIdProperty,
      ...episodeIdProperty,
      date: s.date("The podcast-local date to query."),
      page: s.positiveInteger("The page number to request."),
      perPage: s.positiveInteger("The maximum download records per page.", { maximum: 1000 }),
    },
    { optional: ["page", "perPage"] },
  ),
  outputSchema: s.object("The response returned for episode download details.", {
    episodeId: idSchema("The numeric Buzzsprout episode ID."),
    downloads: s.array("The normalized download details.", downloadSchema),
    page: s.positiveInteger("The current page number."),
    perPage: s.positiveInteger("The requested page size."),
    hasMore: s.boolean("Whether another page is available."),
    nextPage: nullableIntegerSchema("The next page number, or null when this is the last page."),
  }),
});

export const buzzsproutActions: readonly ActionDefinition[] = [
  listPodcastsAction,
  getPodcastAction,
  updatePodcastAction,
  listEpisodesAction,
  getEpisodeAction,
  createEpisodeAction,
  updateEpisodeAction,
  listPodcastDownloadsAction,
  listEpisodeDownloadsAction,
];
