import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "podscribe";

const mediaTypeSchema = s.stringEnum("The media type used to filter episode search results.", [
  "all",
  "podcast",
  "youtube",
  "radio",
  "rumble",
]);
const mediaTypeInputSchema = s.oneOf(
  [
    mediaTypeSchema,
    s.array("Media type values used to filter episode search results.", mediaTypeSchema, { minItems: 1 }),
  ],
  { description: "The media type values used to filter episode search results." },
);
const integrationIssueSchema = s.looseObject("An integration issue returned by Podscribe.", {
  type: s.string("The integration issue type."),
  reported_at: s.dateTime("The timestamp when Podscribe last reported the issue."),
  actions: s.array(
    "Pixel actions associated with the issue when Podscribe includes action details.",
    s.string("A pixel action associated with the issue."),
  ),
});
const integrationPixelSchema = s.looseObject("Pixel data returned with integration health.", {
  action: s.string("The pixel action type."),
  last_url: s.string("The last URL that triggered the pixel."),
  last_seen: s.dateTime("The timestamp when Podscribe last saw the pixel."),
});
const integrationHealthItemSchema = s.looseObject("An integration health item returned by Podscribe.", {
  name: s.string("The integration name."),
  lookupName: s.string("The integration lookup name."),
  issues: s.array("Issues related to this integration.", integrationIssueSchema),
  pixels: s.array("Pixel data returned for this integration.", integrationPixelSchema),
});
const episodeHighlightSchema = s.looseObject("A highlighted transcript match returned by Podscribe.", {
  phrase: s.string("The highlighted phrase from the transcript."),
  startTime: s.number("The start time of the matched phrase in seconds."),
  term: s.string("The search term that matched."),
  ts: s.number("The timestamp of the matched phrase in seconds."),
  context: s.string("The context around the matched phrase."),
});
const episodeSchema = s.looseObject("An episode returned by Podscribe episode search.", {
  id: s.integer("The unique episode identifier in Podscribe."),
  title: s.string("The episode title."),
  description: s.string("The episode description."),
  duration: s.integer("The episode duration."),
  uploaded_at: s.dateTime("The date and time when the episode was uploaded."),
  url: s.string("The episode media URL."),
  series_id: s.integer("The Podscribe series identifier."),
  artist: s.string("The episode artist."),
  num_listens: s.integer("The number of listens for the episode."),
  num_ratings: s.integer("The number of ratings for the episode."),
  series_logo_url: s.string("The logo URL for the episode series."),
  series_title: s.string("The title of the episode series."),
  highlights: s.looseObject("Search highlights returned for the episode.", {
    transcript: s.array("Transcript highlights returned for the episode.", episodeHighlightSchema),
  }),
});
const showInfoSchema = s.looseObject("Show information returned by Podscribe.", {
  podscribeSeriesId: s.number("The unique show identifier in Podscribe."),
  title: s.string("The podcast or video series title."),
  platform: s.string("The platform associated with the show."),
  monthlyListeners: s.number("Estimated monthly listeners for the show."),
  monthlyDownloads: s.number("Estimated monthly downloads for the show."),
  avgDownloadsPerEpisode: s.number("Estimated average downloads per episode."),
  ytAvgDownloadsPerEpisode: s.number("Estimated average YouTube views per episode."),
  ytMonthlyDownloads: s.number("Estimated monthly YouTube views for the show."),
  spotifyAvgDownloadsPerEpisode: s.number("Estimated average Spotify downloads per episode."),
  spotifyMonthlyDownloads: s.number("Estimated monthly Spotify downloads for the show."),
  rumbleAvgDownloadsPerEpisode: s.number("Estimated average Rumble downloads per episode."),
  rumbleMonthlyDownloads: s.number("Estimated monthly Rumble downloads for the show."),
  podcastDownloads: s.number("Estimated monthly podcast downloads for the show."),
  podcastAvgDownloadsPerEpisode: s.number("Estimated average podcast downloads per episode."),
  directRes: s.number("The percentage of ads classified as direct response."),
  hostRead: s.number("The percentage of ads read by the host."),
  countAds: s.number("The total number of ads Podscribe has found for the show."),
  topAdvertisers: s.array("Top advertisers returned for the show.", s.string("An advertiser name.")),
  renewalRate: s.number("The advertiser renewal-rate proxy returned by Podscribe."),
  adLoad: s.number("The podcast ad load returned by Podscribe."),
  adLoadYT: s.number("The YouTube ad load returned by Podscribe."),
  isPodscribePrefixPlaced: s.boolean("Whether the Podscribe prefix is placed on the show."),
  optedIntoSpotifyVideo: s.boolean("Whether the show opted into Spotify video."),
});

export const podscribeActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_integration_health",
    operationType: "read",
    description: "Retrieve Podscribe integration health, optionally filtered by advertiser and including pixel data.",
    requiredScopes: ["integration_health:read"],
    inputSchema: s.object(
      "Input parameters for retrieving Podscribe integration health. advertiserName is required when withPixels is true.",
      {
        advertiserName: s.nonEmptyString("Advertiser name used to filter integration health."),
        withPixels: s.boolean("Whether to include pixel data for the advertiser."),
      },
      { optional: ["advertiserName", "withPixels"] },
    ),
    outputSchema: s.array("Integration health items returned by Podscribe.", integrationHealthItemSchema),
  }),
  defineProviderAction(service, {
    name: "search_episodes",
    operationType: "read",
    description: "Search Podscribe episodes by query string with optional time frame, media type, and show filters.",
    requiredScopes: ["episodes:read"],
    inputSchema: s.object(
      "Input parameters for searching Podscribe episodes.",
      {
        search: s.nonEmptyString("Search query string."),
        timeFrame: s.positiveInteger("Number of days to look back."),
        exact: s.boolean("Whether to enable exact-match search."),
        transcriptOnly: s.boolean("Whether to search only in transcripts."),
        excludeAds: s.boolean("Whether to exclude ads from search results."),
        showFilterIds: s.array(
          "Show IDs used to filter episode search results.",
          s.positiveInteger("A Podscribe show ID."),
          { minItems: 1 },
        ),
        mediaType: mediaTypeInputSchema,
      },
      { optional: ["timeFrame", "exact", "transcriptOnly", "excludeAds", "showFilterIds", "mediaType"] },
    ),
    outputSchema: s.object("Podscribe episode search results.", {
      data: s.array("Episodes returned by Podscribe.", episodeSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_show_info",
    operationType: "read",
    description: "Retrieve Podscribe show information by iTunes or YouTube identifier.",
    requiredScopes: ["shows:read"],
    inputSchema: s.object("Input parameters for retrieving Podscribe show info.", {
      id: s.nonEmptyString("iTunes ID, YouTube channel ID, or YouTube playlist ID."),
    }),
    outputSchema: showInfoSchema,
  }),
];
