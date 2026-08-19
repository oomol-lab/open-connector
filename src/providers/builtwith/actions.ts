import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "builtwith";

const builtwithErrorSchema = s.object(
  "One error entry returned by BuiltWith.",
  {
    message: s.string("The error message returned by BuiltWith."),
    code: s.integer("The numeric error code returned by BuiltWith."),
  },
  {
    required: ["message"],
  },
);

const builtwithTechnologySchema = s.object(
  "One technology entry returned by BuiltWith.",
  {
    name: s.string("The technology name detected by BuiltWith."),
    description: s.string("The BuiltWith description for the detected technology."),
    link: s.string("The reference URL for the detected technology."),
    parent: s.string("The parent technology name when BuiltWith provides one."),
    tag: s.string("The BuiltWith top-level technology tag."),
    categories: s.stringArray("The BuiltWith categories assigned to the technology.", {
      itemDescription: "A BuiltWith category label for the technology.",
    }),
    firstDetected: s.integer("The epoch timestamp in milliseconds when the technology was first detected."),
    lastDetected: s.integer("The epoch timestamp in milliseconds when the technology was last detected."),
    isPremium: s.string("Whether BuiltWith marks the technology as premium coverage."),
  },
  {
    required: ["name"],
  },
);

const builtwithPathSchema = s.object(
  "One BuiltWith indexed path entry.",
  {
    domain: s.string("The root domain for the indexed path."),
    url: s.string("The path or aggregate URL label returned by BuiltWith."),
    subdomain: s.string("The subdomain label for the indexed path."),
    firstIndexed: s.integer("The epoch timestamp in milliseconds when this path was first indexed."),
    lastIndexed: s.integer("The epoch timestamp in milliseconds when this path was last indexed."),
    technologies: s.array("The technologies detected for this path.", builtwithTechnologySchema),
  },
  {
    required: ["domain", "url", "technologies"],
  },
);

const builtwithSpendHistorySchema = s.object(
  "One BuiltWith spend history entry.",
  {
    date: s.integer("The epoch timestamp in milliseconds for the spend history point."),
    spend: s.number("The spend value returned for the history point."),
  },
  {
    required: ["date", "spend"],
  },
);

const builtwithDomainMetaSchema = s.object(
  "The sanitized metadata block returned by BuiltWith.",
  {
    companyName: s.string("The company name returned by BuiltWith."),
    country: s.string("The ISO country code returned by BuiltWith."),
    state: s.string("The state or region returned by BuiltWith."),
    city: s.string("The city returned by BuiltWith."),
    postcode: s.string("The postcode returned by BuiltWith."),
    vertical: s.string("The BuiltWith vertical classification."),
    majestic: s.integer("The Majestic rank returned by BuiltWith."),
    aRank: s.integer("The Alexa rank returned by BuiltWith."),
    qRank: s.integer("The Quantcast rank returned by BuiltWith."),
    umbrella: s.integer("The Umbrella rank returned by BuiltWith."),
    social: s.stringArray("The social profile URLs returned by BuiltWith.", {
      itemDescription: "A social profile URL returned by BuiltWith.",
    }),
  },
  {
    required: [],
  },
);

const builtwithDomainProfileResultSchema = s.object(
  "One normalized BuiltWith domain profile result.",
  {
    lookup: s.string("The lookup value resolved by BuiltWith."),
    firstIndexed: s.integer("The epoch timestamp in milliseconds when the lookup was first indexed."),
    lastIndexed: s.integer("The epoch timestamp in milliseconds when the lookup was last indexed."),
    salesRevenue: s.number("The sales revenue estimate returned by BuiltWith."),
    isDb: s.string("The BuiltWith record source indicator, such as `True` or `False`."),
    spend: s.number("The technology spend estimate returned by BuiltWith."),
    spendHistory: s.array("The BuiltWith spend history timeline for the lookup.", builtwithSpendHistorySchema),
    paths: s.array("The indexed paths returned by BuiltWith.", builtwithPathSchema),
    meta: builtwithDomainMetaSchema,
    attributes: s.record(
      "The numeric attribute counters returned by BuiltWith.",
      s.number("A numeric attribute value."),
    ),
  },
  {
    required: ["lookup", "firstIndexed", "lastIndexed", "paths"],
  },
);

const builtwithCategorySnapshotSchema = s.object(
  "One BuiltWith category snapshot.",
  {
    name: s.string("The BuiltWith category name."),
    live: s.integer("The count of live technologies in the category."),
    dead: s.integer("The count of historical technologies in the category."),
    latest: s.integer("The epoch timestamp in milliseconds of the latest technology detection."),
    oldest: s.integer("The epoch timestamp in milliseconds of the earliest technology detection."),
  },
  {
    required: ["name", "live", "dead", "latest", "oldest"],
  },
);

const builtwithGroupSnapshotSchema = s.object(
  "One BuiltWith technology group snapshot.",
  {
    name: s.string("The BuiltWith technology group name."),
    live: s.integer("The count of live technologies in the group."),
    dead: s.integer("The count of historical technologies in the group."),
    latest: s.integer("The epoch timestamp in milliseconds of the latest technology detection."),
    oldest: s.integer("The epoch timestamp in milliseconds of the earliest technology detection."),
    categories: s.array("The categories contained in the group.", builtwithCategorySnapshotSchema),
  },
  {
    required: ["name", "live", "dead", "latest", "oldest", "categories"],
  },
);

const builtwithRedirectRecordSchema = s.object(
  "One BuiltWith redirect history record.",
  {
    domain: s.string("The redirect source or destination domain."),
    firstDetected: s.string("The ISO timestamp when the redirect was first detected."),
    lastDetected: s.string("The ISO timestamp when the redirect was last detected."),
  },
  {
    required: ["domain", "firstDetected", "lastDetected"],
  },
);

const builtwithSocialDomainSchema = s.object(
  "One BuiltWith domain match for a social profile.",
  {
    root: s.string("The root domain associated with the social profile."),
    builtWithRank: s.integer("The BuiltWith rank for the matched domain."),
  },
  {
    required: ["root", "builtWithRank"],
  },
);

const builtwithSocialResultSchema = s.object(
  "One BuiltWith social lookup result.",
  {
    socialUrl: s.string("The social profile URL matched by BuiltWith."),
    domains: s.array("The domains mapped to the social profile.", builtwithSocialDomainSchema),
  },
  {
    required: ["socialUrl", "domains"],
  },
);

const builtwithSocialLookupSchema = s.object(
  "One BuiltWith social lookup entry.",
  {
    name: s.string("The BuiltWith social lookup name."),
    results: s.array("The social results returned for the lookup.", builtwithSocialResultSchema),
  },
  {
    required: ["name", "results"],
  },
);

const builtwithRecommendationSchema = s.object(
  "One BuiltWith recommendation.",
  {
    name: s.string("The recommended technology name."),
    link: s.string("The URL for the recommended technology."),
    tag: s.string("The BuiltWith top-level tag for the recommendation."),
    categories: s.stringArray("The BuiltWith categories assigned to the recommendation.", {
      itemDescription: "A category label for the recommendation.",
    }),
    stars: s.integer("The BuiltWith star rating for the recommendation."),
    match: s.number("The BuiltWith relevance score for the recommendation."),
  },
  {
    required: ["name", "link", "tag", "categories", "stars", "match"],
  },
);

const builtwithRecommendationResultSchema = s.object(
  "One BuiltWith recommendations result.",
  {
    domain: s.string("The domain used to build the recommendation set."),
    compiled: s.string("The raw compilation timestamp string returned by BuiltWith."),
    recommendations: s.array("The technology recommendations returned by BuiltWith.", builtwithRecommendationSchema),
  },
  {
    required: ["domain", "recommendations"],
  },
);

export const builtwithActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "lookup_domain_profile",
    description:
      "Retrieve a BuiltWith technology profile for a domain while excluding personally identifiable information by default.",
    inputSchema: s.object(
      "The input payload for looking up a BuiltWith domain profile.",
      {
        lookup: s.nonEmptyString("The domain or URL to inspect with BuiltWith."),
        includeLiveOnly: s.boolean("Whether to restrict the response to live technologies only."),
        includeMeta: s.boolean("Whether to include the sanitized BuiltWith metadata block."),
      },
      {
        required: ["lookup"],
      },
    ),
    outputSchema: s.object(
      "The normalized BuiltWith domain profile response.",
      {
        results: s.array(
          "The normalized domain profile results returned by BuiltWith.",
          builtwithDomainProfileResultSchema,
        ),
        errors: s.array("The BuiltWith errors returned with the response.", builtwithErrorSchema),
      },
      {
        required: ["results", "errors"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "lookup_domain_summary",
    description: "Retrieve the BuiltWith Free API technology group summary for a root domain.",
    inputSchema: s.object(
      "The input payload for looking up a BuiltWith domain summary.",
      {
        lookup: s.nonEmptyString("The root domain to summarize with the BuiltWith Free API."),
      },
      {
        required: ["lookup"],
      },
    ),
    outputSchema: s.object(
      "The BuiltWith Free API summary response.",
      {
        domain: s.string("The root domain returned by BuiltWith."),
        firstIndexed: s.integer("The epoch timestamp in milliseconds when the domain was first indexed."),
        lastIndexed: s.integer("The epoch timestamp in milliseconds when the domain was last indexed."),
        groups: s.array("The technology groups returned by BuiltWith.", builtwithGroupSnapshotSchema),
      },
      {
        required: ["domain", "firstIndexed", "lastIndexed", "groups"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "lookup_redirect_history",
    description: "Retrieve the inbound and outbound redirect history for a root domain from BuiltWith.",
    inputSchema: s.object(
      "The input payload for looking up BuiltWith redirect history.",
      {
        lookup: s.nonEmptyString("The root domain to inspect for redirect history."),
      },
      {
        required: ["lookup"],
      },
    ),
    outputSchema: s.object(
      "The BuiltWith redirect history response.",
      {
        lookup: s.string("The root domain returned by BuiltWith."),
        inbound: s.array("The domains redirecting to the lookup domain.", builtwithRedirectRecordSchema),
        outbound: s.array("The domains the lookup domain redirects to.", builtwithRedirectRecordSchema),
      },
      {
        required: ["lookup", "inbound", "outbound"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "lookup_social_profiles",
    description: "Map one or more social profile URLs to BuiltWith root domain matches.",
    inputSchema: s.object(
      "The input payload for looking up social profiles in BuiltWith.",
      {
        lookup: s.nonEmptyString("The social profile URL or comma-separated BuiltWith social lookup string."),
      },
      {
        required: ["lookup"],
      },
    ),
    outputSchema: s.object(
      "The BuiltWith social lookup response.",
      {
        socials: s.array("The BuiltWith social lookup entries returned for the request.", builtwithSocialLookupSchema),
      },
      {
        required: ["socials"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_domain_recommendations",
    description: "Retrieve BuiltWith technology recommendations for one or more root domains.",
    inputSchema: s.object(
      "The input payload for retrieving BuiltWith recommendations.",
      {
        lookup: s.nonEmptyString("The root domain or comma-separated list of root domains for recommendations."),
      },
      {
        required: ["lookup"],
      },
    ),
    outputSchema: s.object(
      "The BuiltWith recommendations response.",
      {
        results: s.array("The recommendation result sets returned by BuiltWith.", builtwithRecommendationResultSchema),
      },
      {
        required: ["results"],
      },
    ),
  }),
];
