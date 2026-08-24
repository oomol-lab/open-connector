import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tmdb";

const languageSchema = s.nonEmptyString("ISO-639-1 language code with an optional ISO-3166-1 region, such as en-US.");
const pageSchema = s.integer("One-based TMDB results page. TMDB accepts values from 1 to 500.", {
  minimum: 1,
  maximum: 500,
});
const includeAdultSchema = s.boolean("Whether adult-rated titles should be included in search results.");
const yearSchema = s.integer("Four-digit calendar year used as a TMDB search filter.", {
  minimum: 1,
  maximum: 9999,
});
const tmdbIdSchema = (description: string) => s.positiveInteger(description);

const namedIdSchema = s.integer("TMDB numeric identifier for this result.");
const optionalStringField = (description: string) => s.string(description);
const optionalNumberField = (description: string) => s.number(description);
const nullablePathSchema = (description: string) => s.nullableString(description);

const genreIdArraySchema = s.array(
  "TMDB genre identifiers associated with this result.",
  s.integer("A TMDB genre identifier."),
);

const tmdbListItemSchema = s.looseRequiredObject(
  "A movie, TV show, or person list result returned by TMDB. Search and trending responses may return an empty results array.",
  {
    id: namedIdSchema,
    media_type: optionalStringField("Media type for mixed lists such as trending, for example movie, tv, or person."),
    title: optionalStringField("Movie title when the result is a movie."),
    name: optionalStringField("TV show or person name when the result is not a movie."),
    overview: optionalStringField("Plot summary for a movie or TV show."),
    poster_path: nullablePathSchema("Poster image path relative to the configuration image base URL."),
    profile_path: nullablePathSchema("Profile image path relative to the configuration image base URL."),
    backdrop_path: nullablePathSchema("Backdrop image path relative to the configuration image base URL."),
    release_date: optionalStringField("Movie release date in YYYY-MM-DD format when TMDB provides one."),
    first_air_date: optionalStringField("TV first air date in YYYY-MM-DD format when TMDB provides one."),
    original_language: optionalStringField("Original language code returned by TMDB."),
    original_title: optionalStringField("Original movie title."),
    original_name: optionalStringField("Original TV show or person name."),
    popularity: optionalNumberField("TMDB popularity score."),
    vote_average: optionalNumberField("Average user rating."),
    vote_count: s.integer("Number of user votes."),
    adult: s.boolean("Whether TMDB marks the result as adult content."),
    genre_ids: genreIdArraySchema,
  },
  {
    optional: [
      "media_type",
      "title",
      "name",
      "overview",
      "poster_path",
      "profile_path",
      "backdrop_path",
      "release_date",
      "first_air_date",
      "original_language",
      "original_title",
      "original_name",
      "popularity",
      "vote_average",
      "vote_count",
      "adult",
      "genre_ids",
    ],
  },
);

const pagedResultsSchema = s.looseRequiredObject(
  "A paginated TMDB list response. An empty results array is a valid response.",
  {
    page: s.integer("Current page number returned by TMDB."),
    results: s.array("Result items for this page. An empty array is valid when nothing matches.", tmdbListItemSchema),
    total_pages: s.integer("Total number of pages returned by TMDB."),
    total_results: s.integer("Total number of matching results returned by TMDB."),
  },
);

const namedValueSchema = s.looseRequiredObject("A TMDB id and display name pair.", {
  id: namedIdSchema,
  name: optionalStringField("Display name returned by TMDB."),
});

const movieDetailsSchema = s.looseRequiredObject(
  "Top-level movie details returned by TMDB.",
  {
    id: namedIdSchema,
    title: optionalStringField("Movie title."),
    original_title: optionalStringField("Original movie title."),
    overview: optionalStringField("Plot summary."),
    tagline: optionalStringField("Marketing tagline."),
    status: optionalStringField("Release status, such as Released."),
    release_date: optionalStringField("Release date in YYYY-MM-DD format."),
    runtime: s.nullableInteger("Runtime in minutes."),
    budget: s.integer("Reported production budget."),
    revenue: s.integer("Reported box office revenue."),
    popularity: optionalNumberField("TMDB popularity score."),
    vote_average: optionalNumberField("Average user rating."),
    vote_count: s.integer("Number of user votes."),
    adult: s.boolean("Whether TMDB marks the movie as adult content."),
    video: s.boolean("Whether TMDB marks the entry as a video rather than a feature film."),
    imdb_id: s.nullableString("IMDb identifier when TMDB provides one."),
    homepage: s.nullableString("Official homepage URL when TMDB provides one."),
    original_language: optionalStringField("Original language code."),
    poster_path: nullablePathSchema("Poster image path relative to the configuration image base URL."),
    backdrop_path: nullablePathSchema("Backdrop image path relative to the configuration image base URL."),
    genres: s.array("Genres associated with the movie.", namedValueSchema),
    origin_country: s.stringArray("ISO-3166-1 origin country codes."),
    production_companies: s.array(
      "Production companies associated with the movie.",
      s.looseObject("A production company returned by TMDB."),
    ),
    production_countries: s.array(
      "Production countries associated with the movie.",
      s.looseObject("A production country returned by TMDB."),
    ),
    spoken_languages: s.array(
      "Spoken languages associated with the movie.",
      s.looseObject("A spoken language returned by TMDB."),
    ),
    belongs_to_collection: s.nullable(s.looseObject("Collection this movie belongs to, when TMDB provides one.")),
  },
  {
    optional: [
      "title",
      "original_title",
      "overview",
      "tagline",
      "status",
      "release_date",
      "runtime",
      "budget",
      "revenue",
      "popularity",
      "vote_average",
      "vote_count",
      "adult",
      "video",
      "imdb_id",
      "homepage",
      "original_language",
      "poster_path",
      "backdrop_path",
      "genres",
      "origin_country",
      "production_companies",
      "production_countries",
      "spoken_languages",
      "belongs_to_collection",
    ],
  },
);

const tvDetailsSchema = s.looseRequiredObject(
  "Top-level TV series details returned by TMDB.",
  {
    id: namedIdSchema,
    name: optionalStringField("TV series name."),
    original_name: optionalStringField("Original TV series name."),
    overview: optionalStringField("Series summary."),
    tagline: optionalStringField("Marketing tagline."),
    status: optionalStringField("Series status, such as Ended or Returning Series."),
    type: optionalStringField("Series type returned by TMDB."),
    first_air_date: optionalStringField("First air date in YYYY-MM-DD format."),
    last_air_date: s.nullableString("Most recent air date in YYYY-MM-DD format."),
    number_of_seasons: s.integer("Number of seasons."),
    number_of_episodes: s.integer("Number of episodes."),
    popularity: optionalNumberField("TMDB popularity score."),
    vote_average: optionalNumberField("Average user rating."),
    vote_count: s.integer("Number of user votes."),
    adult: s.boolean("Whether TMDB marks the series as adult content."),
    in_production: s.boolean("Whether TMDB marks the series as still in production."),
    homepage: s.nullableString("Official homepage URL when TMDB provides one."),
    original_language: optionalStringField("Original language code."),
    poster_path: nullablePathSchema("Poster image path relative to the configuration image base URL."),
    backdrop_path: nullablePathSchema("Backdrop image path relative to the configuration image base URL."),
    genres: s.array("Genres associated with the series.", namedValueSchema),
    origin_country: s.stringArray("ISO-3166-1 origin country codes."),
    languages: s.stringArray("Language codes associated with the series."),
    episode_run_time: s.array("Episode runtimes in minutes.", s.integer("One episode runtime in minutes.")),
    created_by: s.array("Creators associated with the series.", s.looseObject("A creator returned by TMDB.")),
    networks: s.array("Networks associated with the series.", s.looseObject("A network returned by TMDB.")),
    production_companies: s.array(
      "Production companies associated with the series.",
      s.looseObject("A production company returned by TMDB."),
    ),
    seasons: s.array("Season summaries returned with the series.", s.looseObject("A season summary returned by TMDB.")),
  },
  {
    optional: [
      "name",
      "original_name",
      "overview",
      "tagline",
      "status",
      "type",
      "first_air_date",
      "last_air_date",
      "number_of_seasons",
      "number_of_episodes",
      "popularity",
      "vote_average",
      "vote_count",
      "adult",
      "in_production",
      "homepage",
      "original_language",
      "poster_path",
      "backdrop_path",
      "genres",
      "origin_country",
      "languages",
      "episode_run_time",
      "created_by",
      "networks",
      "production_companies",
      "seasons",
    ],
  },
);

const personDetailsSchema = s.looseRequiredObject(
  "Top-level person details returned by TMDB.",
  {
    id: namedIdSchema,
    name: optionalStringField("Person name."),
    biography: optionalStringField("Biography text returned by TMDB."),
    birthday: s.nullableString("Birth date in YYYY-MM-DD format."),
    deathday: s.nullableString("Death date in YYYY-MM-DD format when applicable."),
    place_of_birth: s.nullableString("Place of birth returned by TMDB."),
    gender: s.integer("TMDB gender code: 0 unspecified, 1 female, 2 male, 3 non-binary."),
    homepage: s.nullableString("Official homepage URL when TMDB provides one."),
    imdb_id: s.nullableString("IMDb identifier when TMDB provides one."),
    known_for_department: optionalStringField("Primary department, such as Acting."),
    popularity: optionalNumberField("TMDB popularity score."),
    adult: s.boolean("Whether TMDB marks the person as adult content."),
    profile_path: nullablePathSchema("Profile image path relative to the configuration image base URL."),
    also_known_as: s.stringArray("Alternate names returned by TMDB."),
  },
  {
    optional: [
      "name",
      "biography",
      "birthday",
      "deathday",
      "place_of_birth",
      "gender",
      "homepage",
      "imdb_id",
      "known_for_department",
      "popularity",
      "adult",
      "profile_path",
      "also_known_as",
    ],
  },
);

const configurationSchema = s.looseRequiredObject(
  "TMDB API configuration used to build image URLs and interpret change keys.",
  {
    images: s.looseRequiredObject("Image configuration used to construct TMDB image URLs.", {
      base_url: optionalStringField("HTTP image base URL."),
      secure_base_url: optionalStringField("HTTPS image base URL."),
      backdrop_sizes: s.stringArray("Available backdrop size tokens."),
      logo_sizes: s.stringArray("Available logo size tokens."),
      poster_sizes: s.stringArray("Available poster size tokens."),
      profile_sizes: s.stringArray("Available profile size tokens."),
      still_sizes: s.stringArray("Available still size tokens."),
    }),
    change_keys: s.stringArray("Change-tracking keys used by TMDB change feeds."),
  },
  { optional: ["change_keys"] },
);

const searchMovieInputSchema = s.object(
  "Input parameters for searching TMDB movies.",
  {
    query: s.nonEmptyString("Movie title query sent to TMDB search."),
    language: languageSchema,
    page: pageSchema,
    includeAdult: includeAdultSchema,
    year: yearSchema,
    primaryReleaseYear: yearSchema,
    region: s.nonEmptyString("ISO-3166-1 region used to bias movie search results, such as US."),
  },
  { optional: ["language", "page", "includeAdult", "year", "primaryReleaseYear", "region"] },
);

const searchTvInputSchema = s.object(
  "Input parameters for searching TMDB TV shows.",
  {
    query: s.nonEmptyString("TV show name query sent to TMDB search."),
    language: languageSchema,
    page: pageSchema,
    includeAdult: includeAdultSchema,
    year: yearSchema,
    firstAirDateYear: yearSchema,
  },
  { optional: ["language", "page", "includeAdult", "year", "firstAirDateYear"] },
);

const getMovieInputSchema = s.object(
  "Input parameters for fetching one TMDB movie.",
  {
    movieId: tmdbIdSchema("TMDB movie identifier."),
    language: languageSchema,
  },
  { optional: ["language"] },
);

const getTvInputSchema = s.object(
  "Input parameters for fetching one TMDB TV series.",
  {
    tvId: tmdbIdSchema("TMDB TV series identifier."),
    language: languageSchema,
  },
  { optional: ["language"] },
);

const getPersonInputSchema = s.object(
  "Input parameters for fetching one TMDB person.",
  {
    personId: tmdbIdSchema("TMDB person identifier."),
    language: languageSchema,
  },
  { optional: ["language"] },
);

const listTrendingInputSchema = s.object(
  "Input parameters for listing TMDB trending titles.",
  {
    mediaType: s.withDefault(
      s.stringEnum("Media type to include in the trending list.", ["all", "movie", "tv", "person"]),
      "all",
    ),
    timeWindow: s.withDefault(s.stringEnum("Trending time window used by TMDB.", ["day", "week"]), "day"),
    language: languageSchema,
  },
  { optional: ["mediaType", "timeWindow", "language"] },
);

export const tmdbActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_movie",
    description: "Search TMDB movies by title and return a paginated list of matching results.",
    inputSchema: searchMovieInputSchema,
    outputSchema: pagedResultsSchema,
    followUpActions: ["tmdb.get_movie"],
  }),
  defineProviderAction(service, {
    name: "get_movie",
    description: "Get top-level TMDB details for one movie by its TMDB identifier.",
    inputSchema: getMovieInputSchema,
    outputSchema: movieDetailsSchema,
  }),
  defineProviderAction(service, {
    name: "search_tv",
    description: "Search TMDB TV shows by name and return a paginated list of matching results.",
    inputSchema: searchTvInputSchema,
    outputSchema: pagedResultsSchema,
    followUpActions: ["tmdb.get_tv"],
  }),
  defineProviderAction(service, {
    name: "get_tv",
    description: "Get top-level TMDB details for one TV series by its TMDB identifier.",
    inputSchema: getTvInputSchema,
    outputSchema: tvDetailsSchema,
  }),
  defineProviderAction(service, {
    name: "get_person",
    description: "Get top-level TMDB details for one person by their TMDB identifier.",
    inputSchema: getPersonInputSchema,
    outputSchema: personDetailsSchema,
  }),
  defineProviderAction(service, {
    name: "list_trending",
    description: "List movies, TV shows, and people currently trending on TMDB for a day or week window.",
    inputSchema: listTrendingInputSchema,
    outputSchema: pagedResultsSchema,
    followUpActions: ["tmdb.get_movie", "tmdb.get_tv", "tmdb.get_person"],
  }),
  defineProviderAction(service, {
    name: "get_configuration",
    description: "Get TMDB image base URLs, available image sizes, and change keys used to build media URLs.",
    inputSchema: s.object({}, { description: "No input is required for TMDB configuration." }),
    outputSchema: configurationSchema,
  }),
];
