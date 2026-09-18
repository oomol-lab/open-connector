import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "adyntel";

const companyDomainSchema = s.nonEmptyString(
  "The company domain without protocol or www prefix, for example clay.com.",
);
const facebookUrlSchema = s.nonEmptyString(
  "The Facebook page URL starting with https://, used instead of company_domain.",
);
const keywordSchema = s.nonEmptyString("The keyword to search for in the ad library.");
const countryCodeSchema = s.nonEmptyString("The country code filter supported by Adyntel.");
const continuationTokenSchema = s.nonEmptyString("The continuation token returned by a previous Adyntel response.");
const adyntelRawObjectSchema = s.looseObject("The raw object returned by Adyntel.");

const adSearchOutputSchema = s.object("The normalized ad search response returned by Adyntel.", {
  no_results: s.boolean("Whether Adyntel returned HTTP 204 with no result payload."),
  ads: s.array("The ads extracted from the Adyntel response when available.", adyntelRawObjectSchema),
  continuation_token: s.nullable(s.string("The continuation token for the next Adyntel page when returned.")),
  page_id: s.nullable(s.string("The upstream page identifier when Adyntel returns one.")),
  is_last_page: s.nullable(s.boolean("Whether the current page is the last page when Adyntel returns this flag.")),
  number_of_ads: s.nullable(s.integer("The number of ads reported by Adyntel when returned.")),
  total_ads: s.nullable(s.integer("The total number of ads reported by Adyntel when returned.")),
  total_ad_count: s.nullable(s.integer("The total ad count reported by Adyntel when returned.")),
  raw: s.nullable(adyntelRawObjectSchema),
});

const rawObjectOutputSchema = s.object("The raw Adyntel response.", {
  no_results: s.boolean("Whether Adyntel returned HTTP 204 with no result payload."),
  raw: s.nullable(adyntelRawObjectSchema),
});

const metaAdsInputSchema: JsonSchema = {
  ...s.object(
    "Input for searching Meta ads by company domain or Facebook page URL.",
    {
      company_domain: companyDomainSchema,
      facebook_url: facebookUrlSchema,
      country_code: countryCodeSchema,
      continuation_token: continuationTokenSchema,
      media_type: s.stringEnum("Filter Meta ads by creative media type.", ["image", "meme", "image_and_meme", "video"]),
      active_status: s.stringEnum("Filter Meta ads by active status.", ["inactive", "all"]),
    },
    {
      optional: ["company_domain", "facebook_url", "country_code", "continuation_token", "media_type", "active_status"],
    },
  ),
  anyOf: [{ required: ["company_domain"] }, { required: ["facebook_url"] }],
};

const linkedinAdsInputSchema: JsonSchema = {
  ...s.object(
    "Input for searching LinkedIn ads by company domain or LinkedIn page ID.",
    {
      company_domain: companyDomainSchema,
      linkedin_page_id: s.nonEmptyString("The LinkedIn Page ID to search for."),
      continuation_token: continuationTokenSchema,
      extract: s.stringEnum("Return a derived LinkedIn value instead of full ads.", ["number_of_ads"]),
      live_ads: s.boolean("Whether to return only currently active LinkedIn ads."),
      data_provider: s.stringEnum("The Adyntel data provider to use for this request.", ["rapidapi", "apify"]),
    },
    {
      optional: ["company_domain", "linkedin_page_id", "continuation_token", "extract", "live_ads", "data_provider"],
    },
  ),
  anyOf: [{ required: ["company_domain"] }, { required: ["linkedin_page_id"] }],
};

function adyntelAction<TName extends string>(input: {
  name: TName;
  operationType: ProviderActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}): ProviderActionDefinition<TName> {
  return defineProviderAction(service, input);
}

export const adyntelActions: ProviderActionDefinition[] = [
  adyntelAction({
    name: "search_meta_ads",
    operationType: "read",
    description: "Search Facebook and Instagram ads for a company using Adyntel's Meta ad library endpoint.",
    inputSchema: metaAdsInputSchema,
    outputSchema: adSearchOutputSchema,
  }),
  adyntelAction({
    name: "search_google_ads",
    operationType: "read",
    description: "Search Google ads for a company domain using Adyntel's Google ad library endpoint.",
    inputSchema: s.object(
      "Input for searching Google ads by company domain.",
      {
        company_domain: companyDomainSchema,
        media_type: s.stringEnum("Filter Google ads by media type.", ["text", "image", "video"]),
        continuation_token: continuationTokenSchema,
        extract_text: s.boolean("Whether Adyntel should extract text from ad creatives."),
        data_provider: s.stringEnum("The Adyntel data provider to use for this request.", ["rapidapi", "apify"]),
      },
      {
        optional: ["media_type", "continuation_token", "extract_text", "data_provider"],
      },
    ),
    outputSchema: adSearchOutputSchema,
  }),
  adyntelAction({
    name: "search_linkedin_ads",
    operationType: "read",
    description: "Search LinkedIn ads for a company domain or LinkedIn page ID using Adyntel.",
    inputSchema: linkedinAdsInputSchema,
    outputSchema: adSearchOutputSchema,
  }),
  adyntelAction({
    name: "search_tiktok_ads",
    operationType: "read",
    description: "Search TikTok ads by keyword using Adyntel's TikTok ad library endpoint.",
    inputSchema: s.object(
      "Input for searching TikTok ads by keyword.",
      {
        keyword: keywordSchema,
        country_code: countryCodeSchema,
      },
      { optional: ["country_code"] },
    ),
    outputSchema: adSearchOutputSchema,
  }),
  adyntelAction({
    name: "get_tiktok_ad_details",
    operationType: "read",
    description: "Get details for one TikTok ad by ID using Adyntel.",
    inputSchema: s.object("Input for fetching TikTok ad details.", {
      id: s.nonEmptyString("The TikTok ad ID to fetch."),
    }),
    outputSchema: rawObjectOutputSchema,
  }),
  adyntelAction({
    name: "get_domain_keywords",
    operationType: "read",
    description: "Get Adyntel paid and organic keyword metrics for a company domain.",
    inputSchema: s.object(
      "Input for fetching paid and organic keyword metrics.",
      {
        company_domain: companyDomainSchema,
        language: s.nonEmptyString("The language for keyword results."),
        limit: s.positiveInteger("The number of keyword results to return."),
      },
      { optional: ["language", "limit"] },
    ),
    outputSchema: s.object("The normalized paid and organic keyword metrics.", {
      no_results: s.boolean("Whether Adyntel returned HTTP 204 with no result payload."),
      organic: s.nullable(adyntelRawObjectSchema),
      organic_percentages: s.nullable(adyntelRawObjectSchema),
      paid: s.nullable(adyntelRawObjectSchema),
      paid_percentages: s.nullable(adyntelRawObjectSchema),
      raw: s.nullable(adyntelRawObjectSchema),
    }),
  }),
];
