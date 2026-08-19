import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "similarweb_digitalrank_api";

const emptyInputSchema = s.object("This action does not require any input fields.", {});
const topSiteSchema = s.object("A ranked website returned by Similarweb.", {
  rank: s.integer("The traffic rank position of the website."),
  domain: s.string("The ranked website domain."),
});
const topSitesMetaSchema = s.looseObject("The response metadata returned by Similarweb.");
const campaignSchema = s.object(
  "A rank-tracker campaign returned by Similarweb.",
  {
    campaignId: s.string("The unique identifier of the rank-tracker campaign."),
    campaignName: s.string("The campaign display name."),
    mainDomain: s.string("The primary tracked domain for the campaign."),
    user: s.string("The campaign creator returned by Similarweb."),
    createdTime: s.string("The campaign creation timestamp."),
    tags: s.array("The campaign tags returned by Similarweb.", s.string("One campaign tag.")),
    competitors: s.array("The campaign competitor domains.", s.string("One competitor domain.")),
    scrapingConfigurations: s.array(
      "The scraping configurations available for the campaign.",
      s.object(
        "A rank-tracker scraping configuration returned by Similarweb.",
        {
          id: s.string("The unique identifier of the scraping configuration."),
          device: s.string("The device type used by the scraping configuration."),
          language: s.string("The language configured for the scraping configuration."),
          location: s.string("The location configured for the scraping configuration."),
          searchEngine: s.string("The search engine configured for the scraping configuration."),
        },
        { optional: ["device", "language", "location", "searchEngine"] },
      ),
    ),
  },
  { optional: ["campaignName", "mainDomain", "user", "createdTime"] },
);

export const similarwebDigitalRankApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_subscription_status",
    description: "Get the remaining Similarweb usage allowance for the connected API key.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The subscription usage returned by Similarweb.", {
      allowance: s.integer("The total data credits allocated to the API key."),
      userRemaining: s.integer("The remaining Similarweb data credits for the API key."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_rank_tracker_describe",
    description:
      "List Similarweb rank-tracker campaigns and their scraping configurations for follow-up reporting APIs.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The rank-tracker campaign metadata returned by Similarweb.", {
      campaigns: s.array("The rank-tracker campaigns returned by Similarweb.", campaignSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_similar_rank_top_sites",
    description:
      "List Similarweb top-ranked websites for a country and category, defaulting to the global $All ranking when filters are omitted.",
    inputSchema: s.object(
      "The input payload for retrieving Similarweb top-site rankings.",
      {
        limit: s.integer("The maximum number of ranked sites to return.", { minimum: 1 }),
        offset: s.integer("The zero-based offset into the ranked results.", { minimum: 0 }),
        country: s.nonEmptyString("The country code to query. Defaults to world for a worldwide ranking."),
        category: s.nonEmptyString("The Similarweb category path segment. Defaults to $All when omitted."),
        startDate: s.string("The start month for the ranking window in YYYY-MM format.", {
          pattern: "^\\d{4}-\\d{2}$",
        }),
        endDate: s.string("The end month for the ranking window in YYYY-MM format.", {
          pattern: "^\\d{4}-\\d{2}$",
        }),
        sort: s.nonEmptyString("The field used to sort the ranked results."),
        ascending: s.boolean("Whether to sort the ranked results in ascending order."),
        showVerified: s.boolean("Whether to include only verified domains in the ranked results."),
        mainDomainOnly: s.boolean("Whether to include only main domains in the ranked results."),
      },
      {
        optional: [
          "limit",
          "offset",
          "country",
          "category",
          "startDate",
          "endDate",
          "sort",
          "ascending",
          "showVerified",
          "mainDomainOnly",
        ],
      },
    ),
    outputSchema: s.object(
      "The Similarweb top-site ranking response.",
      {
        topSites: s.array("The ranked top sites returned by Similarweb.", topSiteSchema),
        meta: topSitesMetaSchema,
      },
      { optional: ["meta"] },
    ),
  }),
];
