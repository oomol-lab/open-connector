import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cutt_ly";

const clicksByTagSchema = s.object(
  {
    tag: s.string("Breakdown tag returned by Cuttly."),
    clicks: s.nonNegativeInteger("Number of clicks attributed to this breakdown entry."),
  },
  { required: ["tag", "clicks"], description: "Single Cuttly analytics breakdown entry." },
);

const referrerClicksSchema = s.object(
  {
    domain: s.string("Referrer domain returned by Cuttly."),
    clicks: s.nonNegativeInteger("Number of clicks attributed to this referrer."),
  },
  { required: ["domain", "clicks"], description: "Single Cuttly referrer breakdown entry." },
);

const botClicksSchema = s.object(
  {
    name: s.string("Bot name returned by Cuttly."),
    clicks: s.nonNegativeInteger("Number of clicks attributed to this bot."),
  },
  { required: ["name", "clicks"], description: "Single Cuttly bot breakdown entry." },
);

export const cuttLyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "shorten_url",
    description: "Create a short URL with the Cuttly Regular API.",
    inputSchema: s.object(
      {
        url: s.url("The destination URL to shorten."),
        alias: s.nonEmptyString("Preferred custom alias for the shortened URL."),
        useCustomDomain: s.boolean(
          "Whether to use the account's active branded domain instead of the default cutt.ly domain.",
        ),
        disableTitle: s.boolean("Whether to skip fetching the destination page title for faster responses."),
        publicStats: s.boolean("Whether to enable public click statistics for the created short URL."),
      },
      {
        required: ["url"],
        optional: ["alias", "useCustomDomain", "disableTitle", "publicStats"],
        description: "The input payload for creating a Cuttly short URL.",
      },
    ),
    outputSchema: s.object(
      {
        shortUrl: s.url("The shortened URL created by Cuttly."),
        url: s.url("The original destination URL."),
        title: s.string("The destination page title returned by Cuttly, when available."),
        createdAt: s.string("Date string returned by Cuttly for when the short URL was created."),
      },
      {
        required: ["shortUrl", "url"],
        optional: ["title", "createdAt"],
        description: "The created short URL returned by Cuttly.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_link_analytics",
    description: "Retrieve click analytics for a Cuttly short URL.",
    inputSchema: s.object(
      {
        shortUrl: s.url("The shortened URL to inspect in Cuttly analytics."),
        dateFrom: s.date("Inclusive start date in YYYY-MM-DD format for the analytics query."),
        dateTo: s.date("Inclusive end date in YYYY-MM-DD format for the analytics query."),
      },
      {
        required: ["shortUrl"],
        optional: ["dateFrom", "dateTo"],
        description: "The input payload for retrieving Cuttly link analytics.",
      },
    ),
    outputSchema: s.object(
      {
        shortUrl: s.url("The shortened URL returned by the analytics API."),
        url: s.url("The original destination URL."),
        title: s.string("Title of the shortened URL, when available."),
        createdAt: s.string("Date string returned by Cuttly for when the short URL was created."),
        totalClicks: s.nonNegativeInteger("Total number of successful clicks reported by Cuttly."),
        facebookClicks: s.nonNegativeInteger("Number of clicks attributed to Facebook."),
        twitterClicks: s.nonNegativeInteger("Number of clicks attributed to Twitter/X."),
        linkedinClicks: s.nonNegativeInteger("Number of clicks attributed to LinkedIn."),
        otherClicks: s.nonNegativeInteger("Number of clicks attributed to all other sources."),
        botClicks: s.nonNegativeInteger("Number of clicks attributed to bots."),
        referrers: s.array(referrerClicksSchema, {
          description: "Clicks grouped by referrer domain returned by Cuttly.",
        }),
        countries: s.array(clicksByTagSchema, { description: "Clicks grouped by country code returned by Cuttly." }),
        deviceTypes: s.array(clicksByTagSchema, { description: "Clicks grouped by device type returned by Cuttly." }),
        operatingSystems: s.array(clicksByTagSchema, {
          description: "Clicks grouped by operating system returned by Cuttly.",
        }),
        browsers: s.array(clicksByTagSchema, { description: "Clicks grouped by browser returned by Cuttly." }),
        brands: s.array(clicksByTagSchema, { description: "Clicks grouped by device brand returned by Cuttly." }),
        languages: s.array(clicksByTagSchema, { description: "Clicks grouped by device language returned by Cuttly." }),
        bots: s.array(botClicksSchema, { description: "Clicks grouped by bot name returned by Cuttly." }),
      },
      {
        required: [
          "shortUrl",
          "url",
          "totalClicks",
          "facebookClicks",
          "twitterClicks",
          "linkedinClicks",
          "otherClicks",
          "botClicks",
          "referrers",
          "countries",
          "deviceTypes",
          "operatingSystems",
          "browsers",
          "brands",
          "languages",
          "bots",
        ],
        optional: ["title", "createdAt"],
        description: "Normalized link analytics returned by the Cuttly analytics API.",
      },
    ),
  }),
];
