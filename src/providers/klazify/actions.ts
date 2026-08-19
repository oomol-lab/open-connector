import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "klazify";

const urlSchema = s.nonEmptyString("The website URL or email address to enrich with Klazify.");

const categorySchema = s.object("One Klazify category classification.", {
  name: s.string("The category path returned by Klazify."),
  confidence: s.nullable(s.number("The confidence score between 0 and 1 when provided.")),
  iabCategory: s.nullable(s.string("The IAB category identifier or label when provided.")),
  raw: s.looseObject("The raw category payload returned by Klazify."),
});

const socialMediaSchema = s.object(
  "Normalized social media links returned by Klazify.",
  {
    facebookUrl: s.nullable(s.string("The Facebook profile URL when available.")),
    twitterUrl: s.nullable(s.string("The Twitter or X profile URL when available.")),
    instagramUrl: s.nullable(s.string("The Instagram profile URL when available.")),
    youtubeUrl: s.nullable(s.string("The YouTube channel URL when available.")),
    linkedinUrl: s.nullable(s.string("The LinkedIn profile URL when available.")),
    githubUrl: s.nullable(s.string("The GitHub profile URL when available.")),
    pinterestUrl: s.nullable(s.string("The Pinterest profile URL when available.")),
    mediumUrl: s.nullable(s.string("The Medium profile URL when available.")),
    raw: s.looseObject("The raw social media payload returned by Klazify."),
  },
  {
    optional: [
      "facebookUrl",
      "twitterUrl",
      "instagramUrl",
      "youtubeUrl",
      "linkedinUrl",
      "githubUrl",
      "pinterestUrl",
      "mediumUrl",
      "raw",
    ],
  },
);

const companySchema = s.object(
  "Normalized company profile data returned by Klazify.",
  {
    name: s.nullable(s.string("The company name when available.")),
    city: s.nullable(s.string("The company city when available.")),
    stateCode: s.nullable(s.string("The company state or region code when available.")),
    countryCode: s.nullable(s.string("The company country code when available.")),
    employeesRange: s.nullable(s.string("The employee range when available.")),
    revenue: s.nullable(
      s.anyOf("The company revenue value when available.", [
        s.string("Revenue returned as a string."),
        s.number("Revenue returned as a number."),
      ]),
    ),
    raised: s.nullable(
      s.anyOf("The total funding amount when available.", [
        s.string("Raised amount returned as a string."),
        s.number("Raised amount returned as a number."),
      ]),
    ),
    tags: s.array("The company tags returned by Klazify.", s.string("One company tag.")),
    tech: s.array("The company technologies returned by Klazify.", s.string("One technology.")),
    raw: s.looseObject("The raw company payload returned by Klazify."),
  },
  {
    optional: [
      "name",
      "city",
      "stateCode",
      "countryCode",
      "employeesRange",
      "revenue",
      "raised",
      "tags",
      "tech",
      "raw",
    ],
  },
);

const domainRegistrationSchema = s.object(
  "Normalized domain registration metadata returned by Klazify.",
  {
    domainAgeDate: s.nullable(s.string("The registration date when available.")),
    domainAgeDaysAgo: s.nullable(s.integer("The number of days since registration when available.")),
    domainExpirationDate: s.nullable(s.string("The expiration date when available.")),
    domainExpirationDaysLeft: s.nullable(s.integer("The number of days remaining until expiration when available.")),
    raw: s.looseObject("The raw domain registration payload returned by Klazify."),
  },
  {
    optional: ["domainAgeDate", "domainAgeDaysAgo", "domainExpirationDate", "domainExpirationDaysLeft", "raw"],
  },
);

const domainOverviewSchema = s.object(
  "Normalized Klazify domain overview data.",
  {
    domainUrl: s.nullable(s.string("The normalized domain URL returned by Klazify.")),
    logoUrl: s.nullable(s.string("The hosted logo URL when available.")),
    categories: s.array("The categories returned by Klazify.", categorySchema),
    socialMedia: s.nullable(socialMediaSchema),
    raw: s.looseObject("The raw domain payload returned by Klazify."),
  },
  {
    optional: ["domainUrl", "logoUrl", "categories", "socialMedia", "raw"],
  },
);

const apiUsageSchema = s.object(
  "Klazify API usage counters when the endpoint returns them.",
  {
    remainingApiCalls: s.nullable(s.integer("The remaining API calls when available.")),
    thisMonthApiCalls: s.nullable(s.integer("The API calls used this month when available.")),
    raw: s.looseObject("The raw API usage payload returned by Klazify."),
  },
  { optional: ["remainingApiCalls", "thisMonthApiCalls", "raw"] },
);

const similarDomainsSchema = s.object(
  "Normalized similar-domain response returned by Klazify.",
  {
    domain: domainOverviewSchema,
    similarDomains: s.array("The similar domains returned by Klazify.", s.string("One similar domain.")),
    apiUsage: s.nullable(apiUsageSchema),
    success: s.boolean("Whether the Klazify request succeeded."),
    raw: s.looseObject("The raw similar-domain response returned by Klazify."),
  },
  { optional: ["apiUsage", "raw"] },
);

const baseEnrichmentInputSchema = s.object(
  "Input for a Klazify single-URL enrichment action.",
  {
    url: urlSchema,
    refresh: s.boolean("Whether Klazify should fetch fresh live data when supported."),
  },
  { optional: ["refresh"] },
);

const baseEnrichmentOutputSchema = s.object(
  "Shared Klazify single-URL enrichment output.",
  {
    success: s.boolean("Whether the Klazify request succeeded."),
    domain: domainOverviewSchema,
    company: s.nullable(companySchema),
    domainRegistrationData: s.nullable(domainRegistrationSchema),
    similarDomains: s.array("The similar domains returned by Klazify when available.", s.string("One similar domain.")),
    raw: s.looseObject("The raw Klazify response payload."),
  },
  {
    optional: ["company", "domainRegistrationData", "similarDomains", "raw"],
  },
);

export const klazifyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "categorize_url",
    description: "Categorize a website URL with Klazify and return the aggregated domain enrichment overview.",
    requiredScopes: [],
    inputSchema: s.object("Input for the Klazify all-in-one categorization action.", {
      url: urlSchema,
    }),
    outputSchema: baseEnrichmentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_iab_categories",
    description: "Return the IAB category classification for one website URL with Klazify.",
    requiredScopes: [],
    inputSchema: baseEnrichmentInputSchema,
    outputSchema: s.object("The IAB category response returned by Klazify.", {
      success: s.boolean("Whether the Klazify request succeeded."),
      domain: domainOverviewSchema,
      raw: s.looseObject("The raw Klazify response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_data",
    description: "Return company profile data for one website URL with Klazify.",
    requiredScopes: [],
    inputSchema: baseEnrichmentInputSchema,
    outputSchema: s.object("The company profile response returned by Klazify.", {
      success: s.boolean("Whether the Klazify request succeeded."),
      domain: domainOverviewSchema,
      company: s.nullable(companySchema),
      raw: s.looseObject("The raw Klazify response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_tech_stack",
    description: "Return the detected technology stack for one website URL with Klazify.",
    requiredScopes: [],
    inputSchema: baseEnrichmentInputSchema,
    outputSchema: s.object("The technology stack response returned by Klazify.", {
      success: s.boolean("Whether the Klazify request succeeded."),
      domain: domainOverviewSchema,
      company: s.nullable(companySchema),
      technologies: s.array(
        "The normalized technology identifiers returned by Klazify.",
        s.string("One technology identifier."),
      ),
      raw: s.looseObject("The raw Klazify response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_domain_logo",
    description: "Return the hosted logo URL for one website URL with Klazify.",
    requiredScopes: [],
    inputSchema: baseEnrichmentInputSchema,
    outputSchema: s.object("The logo response returned by Klazify.", {
      success: s.boolean("Whether the Klazify request succeeded."),
      domain: domainOverviewSchema,
      raw: s.looseObject("The raw Klazify response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_domain_expiration",
    description: "Return the registration and expiration details for one website URL with Klazify.",
    requiredScopes: [],
    inputSchema: baseEnrichmentInputSchema,
    outputSchema: s.object("The domain expiration response returned by Klazify.", {
      success: s.boolean("Whether the Klazify request succeeded."),
      domain: domainOverviewSchema,
      domainRegistrationData: s.nullable(domainRegistrationSchema),
      raw: s.looseObject("The raw Klazify response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_social_media_links",
    description: "Return the social media profile URLs for one website URL with Klazify.",
    requiredScopes: [],
    inputSchema: baseEnrichmentInputSchema,
    outputSchema: s.object("The social media response returned by Klazify.", {
      success: s.boolean("Whether the Klazify request succeeded."),
      domain: domainOverviewSchema,
      socialMedia: s.nullable(socialMediaSchema),
      raw: s.looseObject("The raw Klazify response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_similar_domains",
    description: "Return similar or competitor domains for one website URL with Klazify.",
    requiredScopes: [],
    inputSchema: baseEnrichmentInputSchema,
    outputSchema: similarDomainsSchema,
  }),
];
