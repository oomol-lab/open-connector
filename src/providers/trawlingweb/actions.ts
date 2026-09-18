import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "trawlingweb";
const newsItemSchema = s.looseRequiredObject(
  "One indexed news or blog publication returned by TrawlingWeb.",
  {
    id: s.string("The publication identifier assigned by TrawlingWeb."),
    title: s.string("The publication title."),
    text: s.string("The publication body text."),
    published: s.string("The publication timestamp in ISO 8601 UTC format."),
    crawled: s.integer("The crawl timestamp in Unix milliseconds."),
    url: s.string("The original publication URL."),
    author: s.string("The publication author when available."),
    language: s.string("The publication language code."),
    domain: s.string("The domain where the publication was found."),
    site: s.string("The site where the publication was found."),
    site_type: s.string("The content type assigned to the source site."),
    site_language: s.string("The source site language code."),
    site_country: s.string("The source site country code."),
    site_region: s.string("The source site region code."),
    site_section: s.string("The source site section containing the publication."),
    section: s.string("The indexed publication section."),
    value: s.number("The estimated economic value of the publication."),
    rank: s.integer("The source domain rank."),
    unique_visitors: s.integer("The estimated unique visitor count."),
    url_image: s.string("The featured image URL when the add-on is enabled."),
  },
  {
    optional: [
      "author",
      "language",
      "domain",
      "site",
      "site_type",
      "site_language",
      "site_country",
      "site_region",
      "site_section",
      "section",
      "value",
      "rank",
      "unique_visitors",
      "url_image",
    ],
  },
);

export const trawlingwebActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_news",
    operationType: "read",
    description: "Search indexed news and blog publications through the TrawlingWeb News API.",
    inputSchema: s.object(
      "Input parameters for searching TrawlingWeb news and blog publications.",
      {
        query: s.nonWhitespaceString(
          "A Lucene-compatible search expression, including optional field filters and Boolean operators.",
        ),
        countryPreference: s.string({
          description: "The ISO 3166-1 alpha-2 country preference required for safe Pay-per-Use billing.",
          minLength: 2,
          maxLength: 2,
        }),
        fromTimestamp: s.nonNegativeInteger("The inclusive start timestamp in Unix milliseconds."),
        toTimestamp: s.nonNegativeInteger("The inclusive end timestamp in Unix milliseconds."),
        size: s.integer("The maximum number of publications to return in this page.", { minimum: 1, maximum: 100 }),
        sortBy: s.stringEnum("The publication timestamp used to sort results.", ["crawled", "published"]),
        order: s.stringEnum("The result sort direction.", ["asc", "desc"]),
      },
      { required: ["query", "countryPreference"] },
    ),
    outputSchema: s.object(
      "A normalized TrawlingWeb news search page without credential-bearing pagination URLs.",
      {
        data: s.array("The publications returned for this page.", newsItemSchema),
        requestLeft: s.integer("The number of subscription requests remaining after this call."),
        totalResults: s.integer("The total number of publications matching the query."),
        restResults: s.integer("The number of matching publications not yet delivered."),
        nextCursor: s.object("Safe timestamp cursor values parsed from the upstream next URL.", {
          fromTimestamp: s.nonNegativeInteger("The start timestamp for the next page."),
          toTimestamp: s.nonNegativeInteger("The end timestamp for the next page."),
        }),
      },
      { required: ["data"] },
    ),
  }),
];
