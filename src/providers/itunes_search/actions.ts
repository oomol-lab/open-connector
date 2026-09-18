import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "itunes_search";
export const lookupIdentifierFields = [
  "id",
  "bundleId",
  "amgArtistId",
  "amgAlbumId",
  "amgVideoId",
  "upc",
  "isbn",
] as const;
const media = [
  "movie",
  "podcast",
  "music",
  "musicVideo",
  "audiobook",
  "shortFilm",
  "tvShow",
  "software",
  "ebook",
  "all",
];
const entity = [
  "album",
  "allArtist",
  "allTrack",
  "audiobook",
  "audiobookAuthor",
  "desktopSoftware",
  "ebook",
  "iPadSoftware",
  "mix",
  "movie",
  "movieArtist",
  "musicArtist",
  "musicTrack",
  "musicVideo",
  "podcast",
  "podcastAuthor",
  "podcastEpisode",
  "shortFilm",
  "shortFilmArtist",
  "software",
  "song",
  "tvEpisode",
  "tvSeason",
];
const common = {
  country: s.optional(
    s.string("The two-letter storefront country code.", { minLength: 2, maxLength: 2, pattern: "^[A-Z]{2}$" }),
  ),
  lang: s.optional(s.stringEnum("The response language.", ["en_us", "ja_jp"])),
};
const storeRecord = s.looseObject("One iTunes Store record, with additional media-specific fields passed through.", {
  wrapperType: s.optional(s.string("The wrapped object kind.")),
  kind: s.optional(s.string("The content kind.")),
  artistId: s.optional(s.integer("The artist, developer, or author identifier.")),
  collectionId: s.optional(s.integer("The collection identifier.")),
  trackId: s.optional(s.integer("The track, app, movie, or episode identifier.")),
  artistName: s.optional(s.string("The artist, developer, or author name.")),
  collectionName: s.optional(s.string("The collection name.")),
  trackName: s.optional(s.string("The track, app, movie, or episode name.")),
  artistViewUrl: s.optional(s.url("The artist store page.")),
  collectionViewUrl: s.optional(s.url("The collection store page.")),
  trackViewUrl: s.optional(s.url("The record store page.")),
  previewUrl: s.optional(s.url("The preview asset URL.")),
  artworkUrl30: s.optional(s.url("The 30-pixel artwork URL.")),
  artworkUrl60: s.optional(s.url("The 60-pixel artwork URL.")),
  artworkUrl100: s.optional(s.url("The 100-pixel artwork URL.")),
  collectionPrice: s.optional(s.number("The collection price.")),
  trackPrice: s.optional(s.number("The record price.")),
  currency: s.optional(s.string("The ISO 4217 storefront currency.")),
  trackTimeMillis: s.optional(s.integer("The playback duration in milliseconds.")),
  releaseDate: s.optional(s.string("The release timestamp.")),
  country: s.optional(s.string("The storefront country code.")),
  primaryGenreName: s.optional(s.string("The primary genre.")),
  bundleId: s.optional(s.string("The application bundle identifier.")),
});
const results = s.object("Normalized iTunes Search API results.", {
  resultCount: s.integer("The record count Apple reported."),
  returnedCount: s.integer("The number of records returned."),
  results: s.array("The store records, including media-specific upstream fields.", storeRecord),
});

export const itunesSearchActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_store",
    operationType: "read",
    description: "Search the iTunes Store and Apple Books Store for media and software records.",
    inputSchema: s.object("The store search query.", {
      term: s.nonWhitespaceString("Plain text to search for."),
      ...common,
      media: s.optional(s.stringEnum("The media type to search.", media)),
      entity: s.optional(s.stringEnum("The record type to return.", entity)),
      attribute: s.optional(s.string("The media attribute the term should match.")),
      limit: s.optional(s.integer("The maximum number of records.", { minimum: 1, maximum: 200 })),
      explicit: s.optional(s.boolean("Whether explicit content may appear.")),
      version: s.optional(s.integer("The result schema version.", { minimum: 1, maximum: 2 })),
    }),
    outputSchema: results,
  }),
  defineProviderAction(service, {
    name: "lookup_store",
    operationType: "read",
    description: "Look up iTunes Store and Apple Books Store records by one kind of identifier.",
    inputSchema: s.requireAnyProperty(
      s.object("Identifiers and optional related-content settings.", {
        id: s.optional(
          s.array("iTunes identifiers.", s.nonWhitespaceString("One iTunes identifier."), { minItems: 1 }),
        ),
        bundleId: s.optional(
          s.array("App bundle identifiers.", s.nonWhitespaceString("One bundle identifier."), { minItems: 1 }),
        ),
        amgArtistId: s.optional(
          s.array("All Music Guide artist identifiers.", s.nonWhitespaceString("One artist identifier."), {
            minItems: 1,
          }),
        ),
        amgAlbumId: s.optional(
          s.array("All Music Guide album identifiers.", s.nonWhitespaceString("One album identifier."), {
            minItems: 1,
          }),
        ),
        amgVideoId: s.optional(
          s.array("All Music Guide video identifiers.", s.nonWhitespaceString("One video identifier."), {
            minItems: 1,
          }),
        ),
        upc: s.optional(s.array("UPC or EAN barcodes.", s.nonWhitespaceString("One barcode."), { minItems: 1 })),
        isbn: s.optional(s.array("Thirteen-digit ISBNs.", s.nonWhitespaceString("One ISBN."), { minItems: 1 })),
        entity: s.optional(s.stringEnum("Related content to return.", entity)),
        limit: s.optional(s.integer("The maximum number of related records.", { minimum: 1, maximum: 200 })),
        sort: s.optional(s.stringEnum("The related-record order.", ["recent"])),
        ...common,
      }),
      lookupIdentifierFields,
    ),
    outputSchema: results,
  }),
];
