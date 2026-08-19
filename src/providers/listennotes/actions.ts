import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "listennotes";

const rawObjectSchema = s.looseObject("A raw Listen Notes object returned by the upstream API.");
const genreIdSchema = s.positiveInteger("One Listen Notes genre identifier.");
const searchTypeSchema = s.stringEnum("The supported Listen Notes search result type.", ["episode", "podcast"]);
const searchFieldSchema = s.stringEnum("One Listen Notes searchable field.", [
  "title",
  "description",
  "author",
  "audio",
]);
const podcastSortSchema = s.stringEnum("The episode sort order for podcast detail results.", [
  "oldest_first",
  "recent_first",
]);
const bestPodcastSortSchema = s.stringEnum("The ranking sort applied to best podcasts results.", [
  "listen_score",
  "oldest_added_first",
  "oldest_published_first",
  "recent_added_first",
  "recent_published_first",
]);
const podcastTypeSchema = s.stringEnum("The podcast release format returned by Listen Notes.", ["episodic", "serial"]);
const optionalPodcastFields = [
  "publisher",
  "description",
  "image",
  "thumbnail",
  "listennotesUrl",
  "language",
  "country",
  "genreIds",
  "totalEpisodes",
  "latestPubDateMs",
  "explicitContent",
  "rss",
  "type",
  "website",
];
const optionalEpisodeFields = [
  "description",
  "audio",
  "image",
  "thumbnail",
  "listennotesUrl",
  "explicitContent",
  "audioLengthSec",
  "pubDateMs",
];

const podcastReferenceSchema = s.object(
  "A compact podcast reference returned by Listen Notes.",
  {
    id: s.nonEmptyString("The Listen Notes podcast identifier."),
    title: s.string("The podcast title."),
    publisher: s.string("The podcast publisher name."),
    image: s.string("The podcast artwork image URL."),
    thumbnail: s.string("The podcast artwork thumbnail URL."),
    listennotesUrl: s.string("The Listen Notes public podcast URL."),
  },
  { optional: ["title", "publisher", "image", "thumbnail", "listennotesUrl"] },
);

const podcastProperties = {
  id: s.nonEmptyString("The Listen Notes podcast identifier."),
  title: s.nonEmptyString("The podcast title."),
  publisher: s.string("The podcast publisher name."),
  description: s.string("The podcast description text."),
  image: s.string("The podcast artwork image URL."),
  thumbnail: s.string("The podcast artwork thumbnail URL."),
  listennotesUrl: s.string("The Listen Notes public podcast URL."),
  language: s.string("The podcast language label."),
  country: s.string("The podcast country label."),
  genreIds: s.array("The Listen Notes genre identifiers attached to the podcast.", genreIdSchema),
  totalEpisodes: s.integer("The total number of podcast episodes."),
  latestPubDateMs: s.integer("The latest episode publication timestamp in milliseconds."),
  explicitContent: s.boolean("Whether the podcast contains explicit content."),
  rss: s.string("The podcast RSS feed URL."),
  type: podcastTypeSchema,
  website: s.string("The canonical podcast website URL."),
  raw: rawObjectSchema,
};

const podcastCoreSchema = s.object("A normalized Listen Notes podcast object.", podcastProperties, {
  optional: optionalPodcastFields,
});

const podcastListItemSchema = s.object(
  "A normalized podcast result item.",
  {
    kind: s.literal("podcast", { description: "The fixed result kind for podcast items." }),
    ...podcastProperties,
  },
  { optional: optionalPodcastFields },
);

const episodeProperties = {
  id: s.nonEmptyString("The Listen Notes episode identifier."),
  title: s.nonEmptyString("The episode title."),
  description: s.string("The episode description text."),
  audio: s.string("The direct episode audio URL."),
  image: s.string("The episode artwork image URL."),
  thumbnail: s.string("The episode artwork thumbnail URL."),
  listennotesUrl: s.string("The Listen Notes public episode URL."),
  explicitContent: s.boolean("Whether the episode contains explicit content."),
  audioLengthSec: s.integer("The audio duration in seconds."),
  pubDateMs: s.integer("The episode publication timestamp in milliseconds."),
  podcast: s.nullable(podcastReferenceSchema),
  raw: rawObjectSchema,
};

const episodeCoreSchema = s.object("A normalized Listen Notes episode object.", episodeProperties, {
  optional: optionalEpisodeFields,
});

const episodeListItemSchema = s.object(
  "A normalized episode result item.",
  {
    kind: s.literal("episode", { description: "The fixed result kind for episode items." }),
    ...episodeProperties,
  },
  { optional: optionalEpisodeFields },
);

const genreSchema = s.object("A normalized Listen Notes genre.", {
  id: s.integer("The Listen Notes genre identifier."),
  name: s.string("The genre display name."),
  parentId: s.nullableInteger("The parent genre identifier, or null when this genre has no parent."),
});

const regionSchema = s.object("A normalized Listen Notes region.", {
  code: s.string("The Listen Notes region code."),
  name: s.string("The human-readable region name."),
});

const typeaheadPodcastSchema = s.object(
  "A normalized podcast suggestion returned by Listen Notes typeahead.",
  {
    id: s.nonEmptyString("The Listen Notes podcast identifier."),
    title: s.nonEmptyString("The suggested podcast title."),
    publisher: s.string("The suggested podcast publisher name."),
    image: s.string("The suggested podcast artwork image URL."),
    thumbnail: s.string("The suggested podcast artwork thumbnail URL."),
    explicitContent: s.boolean("Whether the suggested podcast contains explicit content."),
    raw: rawObjectSchema,
  },
  { optional: ["publisher", "image", "thumbnail", "explicitContent"] },
);

const searchInputSchema = s.object(
  "Input for Listen Notes full-text search.",
  {
    q: s.nonEmptyString("The search keywords to send to Listen Notes."),
    type: searchTypeSchema,
    offset: s.nonNegativeInteger("The search offset for pagination."),
    region: s.nonEmptyString("The region code used to limit search results."),
    language: s.nonEmptyString("The language label used to limit search results."),
    genreIds: s.array("The Listen Notes genre identifiers used to filter results.", genreIdSchema, { minItems: 1 }),
    pageSize: s.integer("The number of search results to return per page.", { minimum: 1, maximum: 10 }),
    safeMode: s.boolean("Whether to exclude explicit podcasts or episodes."),
    sortByDate: s.boolean("Whether to sort search results by publication date instead of relevance."),
    onlyIn: s.array("The specific upstream fields to search within.", searchFieldSchema, { minItems: 1 }),
    uniquePodcasts: s.boolean("Whether to keep only one episode per podcast for episode searches."),
  },
  {
    required: ["q"],
    optional: [
      "type",
      "offset",
      "region",
      "language",
      "genreIds",
      "pageSize",
      "safeMode",
      "sortByDate",
      "onlyIn",
      "uniquePodcasts",
    ],
  },
);

const searchOutputSchema = s.object(
  "Normalized output payload for Listen Notes search.",
  {
    resultType: searchTypeSchema,
    took: s.number("The upstream response time in seconds."),
    count: s.integer("The number of results returned in this page."),
    total: s.integer("The total number of matching results."),
    nextOffset: s.nullableInteger("The offset to use for the next search page, or null when unavailable."),
    results: s.array("The normalized search result items.", s.union([podcastListItemSchema, episodeListItemSchema])),
  },
  { optional: ["took", "nextOffset"] },
);

const typeaheadInputSchema = s.object(
  "Input for Listen Notes typeahead suggestions.",
  {
    q: s.nonEmptyString("The typeahead keywords to send to Listen Notes."),
    safeMode: s.boolean("Whether to exclude explicit podcast suggestions."),
    showGenres: s.boolean("Whether to include genre suggestions."),
    showPodcasts: s.boolean("Whether to include podcast suggestions."),
  },
  { required: ["q"], optional: ["safeMode", "showGenres", "showPodcasts"] },
);

const typeaheadOutputSchema = s.object("Normalized output payload for Listen Notes typeahead suggestions.", {
  terms: s.stringArray("The suggested search terms."),
  genres: s.array("The suggested genres.", genreSchema),
  podcasts: s.array("The suggested podcasts.", typeaheadPodcastSchema),
});

const getPodcastInputSchema = s.object(
  "Input for Listen Notes podcast details.",
  {
    id: s.nonEmptyString("The Listen Notes podcast identifier."),
    sort: podcastSortSchema,
    nextEpisodePubDate: s.positiveInteger("The episode pagination cursor returned by Listen Notes."),
  },
  { required: ["id"], optional: ["sort", "nextEpisodePubDate"] },
);

const getPodcastOutputSchema = s.object("Normalized output payload for Listen Notes podcast details.", {
  podcast: podcastCoreSchema,
  episodes: s.array("The normalized episode page for the podcast.", episodeCoreSchema),
  nextEpisodePubDate: s.nullableInteger("The next episode pagination cursor, or null when unavailable."),
});

const getEpisodeInputSchema = s.object("Input for Listen Notes episode details.", {
  id: s.nonEmptyString("The Listen Notes episode identifier."),
});

const getEpisodeOutputSchema = s.object("Normalized output payload for Listen Notes episode details.", {
  episode: episodeCoreSchema,
});

const getBestPodcastsInputSchema = s.object(
  "Input for Listen Notes best podcasts.",
  {
    page: s.positiveInteger("The best podcasts page number to retrieve."),
    sort: bestPodcastSortSchema,
    region: s.nonEmptyString("The region code used to rank best podcasts."),
    genreId: genreIdSchema,
    language: s.nonEmptyString("The language label used to filter best podcasts."),
    safeMode: s.boolean("Whether to exclude explicit podcasts."),
    publisherRegion: s.nonEmptyString("The publisher region code used to filter best podcasts."),
  },
  { optional: ["page", "sort", "region", "genreId", "language", "safeMode", "publisherRegion"] },
);

const getBestPodcastsOutputSchema = s.object("Normalized output payload for Listen Notes best podcasts.", {
  id: s.nullableInteger("The best podcasts genre identifier."),
  name: s.nullableString("The best podcasts genre name."),
  parentId: s.nullableInteger("The parent genre identifier."),
  total: s.integer("The total number of ranked podcasts."),
  pageNumber: s.integer("The current page number."),
  hasNext: s.boolean("Whether there is a next page."),
  hasPrevious: s.boolean("Whether there is a previous page."),
  nextPageNumber: s.nullableInteger("The next page number when available."),
  previousPageNumber: s.nullableInteger("The previous page number when available."),
  podcasts: s.array("The ranked podcasts returned by Listen Notes.", podcastListItemSchema),
});

const getGenresInputSchema = s.object("Input for Listen Notes genres.", {
  topLevelOnly: s.boolean("Whether to return only top-level genres."),
});

const getGenresOutputSchema = s.object("Normalized output payload for Listen Notes genres.", {
  genres: s.array("The normalized genre list.", genreSchema),
});

const getRegionsInputSchema = s.object({}, { description: "Input for Listen Notes regions." });

const getRegionsOutputSchema = s.object("Normalized output payload for Listen Notes regions.", {
  regions: s.array("The normalized region list.", regionSchema),
});

const getLanguagesInputSchema = s.object({}, { description: "Input for Listen Notes languages." });

const getLanguagesOutputSchema = s.object("Normalized output payload for Listen Notes languages.", {
  languages: s.stringArray("The supported Listen Notes languages."),
});

const getRelatedPodcastsInputSchema = s.object(
  "Input for Listen Notes podcast recommendations.",
  {
    id: s.nonEmptyString("The Listen Notes podcast identifier."),
    safeMode: s.boolean("Whether to exclude explicit recommendations."),
  },
  { required: ["id"], optional: ["safeMode"] },
);

const getRelatedPodcastsOutputSchema = s.object("Normalized output payload for Listen Notes podcast recommendations.", {
  recommendations: s.array("The normalized related podcast recommendations.", podcastListItemSchema),
});

export const listennotesActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search",
    description: "Search Listen Notes podcasts or episodes by keyword.",
    inputSchema: searchInputSchema,
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "typeahead",
    description: "Get Listen Notes typeahead suggestions for terms, genres, and podcasts.",
    inputSchema: typeaheadInputSchema,
    outputSchema: typeaheadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_podcast",
    description: "Get Listen Notes podcast details and one page of episodes by podcast ID.",
    inputSchema: getPodcastInputSchema,
    outputSchema: getPodcastOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_episode",
    description: "Get Listen Notes episode details by episode ID.",
    inputSchema: getEpisodeInputSchema,
    outputSchema: getEpisodeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_best_podcasts",
    description: "Get ranked best podcasts from Listen Notes with optional directory filters.",
    inputSchema: getBestPodcastsInputSchema,
    outputSchema: getBestPodcastsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_genres",
    description: "Get the supported Listen Notes podcast genres.",
    inputSchema: getGenresInputSchema,
    outputSchema: getGenresOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_regions",
    description: "Get the supported Listen Notes regions used by best podcasts.",
    inputSchema: getRegionsInputSchema,
    outputSchema: getRegionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_languages",
    description: "Get the supported Listen Notes podcast languages.",
    inputSchema: getLanguagesInputSchema,
    outputSchema: getLanguagesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_related_podcasts",
    description: "Get related podcast recommendations from Listen Notes by podcast ID.",
    inputSchema: getRelatedPodcastsInputSchema,
    outputSchema: getRelatedPodcastsOutputSchema,
  }),
];
